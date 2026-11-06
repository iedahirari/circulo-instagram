"""Offline UI flow: collect, download, resume and import a synthetic account."""
import base64
import json
from pathlib import Path
import struct
import tempfile
import unittest
from urllib.parse import urlsplit
import zlib

ROOT = Path(__file__).parent


class ExtensionFlowTests(unittest.TestCase):
    def test_collect_photos_and_import_one_file(self):
        from playwright.sync_api import sync_playwright
        def chunk(kind, data):
            return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))
        png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!IIBBBBB', 1, 1, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\x00\xff\x00\x00\xff')) + chunk(b'IEND', b'')
        alice = {'id': '1', 'username': 'alice', 'fullName': 'Alice', 'isVerified': True, 'isPrivate': False, 'photoUrl': None}
        bob = {'id': '2', 'username': 'bob', 'fullName': 'Bob', 'isVerified': False, 'isPrivate': True, 'photoUrl': 'https://scontent.cdninstagram.com/bob.jpg'}
        scan = {'format': 'circulo-session-v1', 'account': 'qa_flow', 'capturedAt': '2026-11-05T15:00:00Z', 'complete': True, 'counts': {'followers': 2, 'following': 1}, 'followers': [alice, bob], 'following': [alice]}
        with sync_playwright() as playwright, tempfile.TemporaryDirectory() as folder:
            browser = playwright.chromium.launch(channel='chrome', headless=True)
            context = browser.new_context(accept_downloads=True)
            def resource(route):
                path = urlsplit(route.request.url).path
                if path.startswith('/app/'):
                    name = path.removeprefix('/app/')
                    allowed = {'index.html', 'app.js', 'core.mjs', 'style.css'}
                    base = ROOT
                else:
                    name = path.lstrip('/')
                    allowed = {'collection.html', 'collection.css', 'popup.css', 'collection.mjs', 'collection-data.mjs', 'live.mjs', 'photos.mjs', 'collector.mjs', 'cache.mjs'}
                    base = ROOT / 'extension'
                if name not in allowed:
                    route.abort(); return
                mime = 'text/html' if name.endswith('.html') else 'text/css' if name.endswith('.css') else 'text/javascript'
                route.fulfill(body=(base / name).read_bytes(), content_type=mime)
            context.route('http://127.0.0.1:18765/**', resource)
            context.route('https://scontent.cdninstagram.com/**', lambda route: route.fulfill(body=png, content_type='image/png'))
            page = context.new_page()
            page.add_init_script("""globalThis.chrome={
              tabs:{query:async()=>[{id:1,url:'https://www.instagram.com/'}]},
              storage:{local:{get:async()=>({'circulo-photo:qa_flow:alice':{username:'alice',photo:'data:image/jpeg;base64,/9j/'},...JSON.parse(localStorage.getItem('mock-settings')||'{}')}),set:async values=>{localStorage.setItem('mock-settings',JSON.stringify({...JSON.parse(localStorage.getItem('mock-settings')||'{}'),...values}));}}},
              scripting:{executeScript:async({func})=>[{result:func.name==='collectSession'?SCAN:null}]}
            };""".replace('SCAN', json.dumps(scan)))
            page.goto('http://127.0.0.1:18765/collection.html?tab=1')
            page.get_by_role('button', name='Iniciar coleta', exact=True).click()
            page.get_by_text('Tudo pronto para baixar e importar', exact=False).wait_for()
            self.assertIn('2 de 2 fotos guardadas', page.locator('#summary').inner_text())
            with page.expect_download() as event:
                page.get_by_role('button', name='↓ Baixar para o Círculo').click()
            path = Path(folder) / 'circulo-consulta.json'
            event.value.save_as(path)
            result = json.loads(path.read_text(encoding='utf-8'))
            self.assertEqual(result['followers'][0]['photo'], 'data:image/jpeg;base64,/9j/')
            self.assertTrue(base64.b64decode(result['followers'][1]['photo'].split(',')[1]).startswith(b'\xff\xd8'))
            self.assertNotIn('photoUrl', result['followers'][1])
            page.reload()
            page.get_by_text('2 de 2 fotos guardadas', exact=False).wait_for()
            self.assertIn('2 de 2 fotos guardadas', page.locator('#summary').inner_text())
            app = context.new_page()
            app.goto('http://127.0.0.1:18765/app/index.html')
            app.locator('#file').set_input_files(path)
            app.get_by_role('button', name='Salvar consulta e comparar').click()
            app.get_by_text('Fotos: 2 de 2 nesta lista', exact=True).wait_for()
            app.locator('#file').set_input_files(path)
            app.get_by_role('button', name='Salvar consulta e comparar').click()
            app.get_by_text('Fotos e dados atualizados. A consulta existente foi preservada.', exact=True).wait_for()
            self.assertEqual(app.locator('#history option').count(), 1)
            browser.close()


if __name__ == '__main__':
    unittest.main()
