import base64
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from coletor_local import FIND_PHOTO, MAKE_THUMBNAIL, blocked, photo_url_allowed, read_queue, read_results, save_results


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'coleta.json'
        self.data = {'format': 'circulo-photos-v1', 'account': 'ieda.png', 'photos': [
            {'username': 'alice', 'photo': 'data:image/jpeg;base64,/9j/'}]}

    def test_queue_deduplicates(self):
        self.path.write_text(json.dumps({'format': 'circulo-queue-v1', 'account': 'ieda.png', 'users': ['alice', 'alice', 'bob']}))
        self.assertEqual(read_queue(self.path), ('ieda.png', ['alice', 'bob']))

    def test_queue_rejects_invalid_user(self):
        self.path.write_text(json.dumps({'format': 'circulo-queue-v1', 'account': 'ieda.png', 'users': ['../alice']}))
        with self.assertRaises(ValueError):
            read_queue(self.path)

    def test_roundtrip_and_resume(self):
        save_results(self.path, self.data)
        self.assertEqual(read_results(self.path, 'ieda.png'), self.data)
        self.assertEqual({p['username'] for p in read_results(self.path, 'ieda.png')['photos']}, {'alice'})

    def test_wrong_account_preserves_results(self):
        save_results(self.path, self.data)
        before = self.path.read_bytes()
        with self.assertRaises(ValueError):
            read_results(self.path, 'outra')
        self.assertEqual(self.path.read_bytes(), before)

    def test_rejected_photo_preserves_file(self):
        save_results(self.path, self.data)
        self.path.write_text(json.dumps({**self.data, 'photos': [{'username': 'alice', 'photo': 'https://example.com/a.jpg'}]}))
        before = self.path.read_bytes()
        with self.assertRaises(ValueError):
            read_results(self.path, 'ieda.png')
        self.assertEqual(self.path.read_bytes(), before)

    def test_interrupted_write_keeps_previous(self):
        save_results(self.path, self.data)
        before = self.path.read_bytes()
        with patch.object(Path, 'replace', side_effect=OSError('disk error')):
            with self.assertRaises(OSError):
                save_results(self.path, {**self.data, 'photos': []})
        self.assertEqual(self.path.read_bytes(), before)
        self.assertFalse(self.path.with_suffix('.tmp').exists())

    def test_photo_hosts(self):
        self.assertTrue(photo_url_allowed('https://scontent.cdninstagram.com/a.jpg'))
        self.assertTrue(photo_url_allowed('https://scontent.xx.fbcdn.net/a.jpg'))
        for url in ['http://x.cdninstagram.com/a.jpg', 'https://cdninstagram.com.evil.test/a.jpg', 'https://evil.test/a.jpg', 'https://a:b@x.fbcdn.net/a.jpg', 'https://x.fbcdn.net:8080/a.jpg', None]:
            self.assertFalse(photo_url_allowed(url))

    def test_limit_stops_without_deactivation_claim(self):
        page = type('Page', (), {'url': 'https://www.instagram.com/accounts/login/'})()
        self.assertTrue(blocked(page, None))
        page.url = 'https://www.instagram.com/alice/'
        self.assertTrue(blocked(page, type('Response', (), {'status': 429})()))
        self.assertFalse(blocked(page, type('Response', (), {'status': 404})()))

    def test_browser_profile_matching_and_thumbnail(self):
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel='chrome', headless=True)
            page = browser.new_page()
            html = '<main><header><img alt="Foto do perfil de alice" src="https://scontent.cdninstagram.com/avatar.jpg"></header></main>'
            page.route('**/*', lambda route: route.fulfill(status=200, content_type='text/html', body=html))
            page.goto('https://www.instagram.com/alice/')
            self.assertEqual(page.evaluate(FIND_PHOTO, 'alice'), 'https://scontent.cdninstagram.com/avatar.jpg')
            self.assertIsNone(page.evaluate(FIND_PHOTO, 'bob'))
            page.set_content('<img alt="Foto do perfil de joanna" src="https://scontent.cdninstagram.com/wrong.jpg">')
            page.goto('https://www.instagram.com/ann/')
            page.set_content('<img alt="Foto do perfil de joanna" src="https://scontent.cdninstagram.com/wrong.jpg">')
            self.assertIsNone(page.evaluate(FIND_PHOTO, 'ann'))
            renderer = browser.new_page()
            image = renderer.evaluate('''() => {const c=document.createElement('canvas');c.width=240;c.height=120;return c.toDataURL('image/png');}''')
            photo = renderer.evaluate(MAKE_THUMBNAIL, image)
            self.assertTrue(photo.startswith('data:image/jpeg;base64,'))
            self.assertLess(len(photo), 100000)
            self.assertTrue(base64.b64decode(photo.split(',')[1]).startswith(b'\xff\xd8'))
            browser.close()


if __name__ == '__main__':
    unittest.main()
