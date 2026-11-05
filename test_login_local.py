import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from instagrapi.exceptions import TwoFactorRequired
from instagrapi_login import Handler, LoginTest, ThreadingHTTPServer, error_reference, friendly_error, login_payload, protect, save_session


class LoginLocalTests(unittest.TestCase):
    def test_payload_rejects_invalid_input(self):
        for data in [None, [], {'username': '../x', 'password': 'dummy', 'remember': False}, {'username': 'ieda', 'password': '', 'remember': False}, {'username': 'ieda', 'password': 'dummy', 'remember': 'yes'}]:
            with self.assertRaises(ValueError):
                login_payload(data)
        self.assertEqual(login_payload({'username': 'IEDA.PNG', 'password': 'dummy', 'remember': False}), ('ieda.png', 'dummy', False))

    def test_windows_encryption_and_password_exclusion(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'sessao.bin'
            save_session(path, 'ieda', {'password': 'dummy-password', 'cookies': {'sessionid': 'dummy-session'}, 'authorization_data': {'ds_user_id': '1'}})
            encrypted = path.read_bytes()
            self.assertNotIn(b'dummy-session', encrypted)
            self.assertNotIn(b'dummy-password', encrypted)
            plain = json.loads(protect(encrypted, decrypt=True))
            self.assertEqual(plain['settings']['cookies']['sessionid'], 'dummy-session')
            self.assertNotIn('password', plain['settings'])

    def client(self):
        client = Mock()
        client.user_info_by_username.return_value = SimpleNamespace(username='adele', full_name='Adele', is_verified=True, is_private=False, follower_count=100, profile_pic_url=None)
        return client

    def test_success_does_not_store_session_without_choice(self):
        state, client = LoginTest(), self.client()
        state.owner = 'ieda';state.remember = False
        with patch('instagrapi.Client', return_value=client), patch('instagrapi_login.save_session') as save:
            state.run('ieda', 'dummy-password')
        self.assertEqual(state.state['phase'], 'success')
        save.assert_not_called()
        client.user_info_by_username.assert_called_once_with('adele')
        self.assertNotIn('dummy-password', json.dumps(state.state))
        self.assertIsNone(client.password)
        self.assertIsNone(state.client)

    def test_two_factor_requires_user_code(self):
        state, client = LoginTest(), self.client()
        state.owner = 'ieda'
        client.login.side_effect = [TwoFactorRequired(), True]
        with patch('instagrapi.Client', return_value=client):
            state.run('ieda', 'dummy-password')
            self.assertEqual(state.state['phase'], 'code_required')
            client.user_info_by_username.assert_not_called()
            state.run(None, None, '123456')
        self.assertEqual(state.state['phase'], 'success')

    def test_errors_do_not_expose_exception_content(self):
        state, client = LoginTest(), self.client()
        client.login.side_effect = RuntimeError('dummy-password secret-cookie')
        with patch('instagrapi.Client', return_value=client):
            state.run('ieda', 'dummy-password')
        self.assertEqual(state.state['phase'], 'error')
        self.assertNotIn('secret-cookie', json.dumps(state.state))
        self.assertNotIn('dummy-password', json.dumps(state.state))
        self.assertEqual(state.state['reference'], {'code': 'RuntimeError', 'http': None})

    def test_reference_contains_only_class_and_http_status(self):
        error = RuntimeError('dummy-password secret-cookie')
        error.response = SimpleNamespace(status_code=401, text='secret response')
        self.assertEqual(error_reference(error), {'code': 'RuntimeError', 'http': 401})
        self.assertIn('conexão', friendly_error(TimeoutError()).lower())

    def test_photo_failure_keeps_successful_profile_data(self):
        state, client = LoginTest(), self.client()
        client.user_info_by_username.return_value.profile_pic_url = 'https://scontent.cdninstagram.com/dummy.jpg'
        with patch('instagrapi.Client', return_value=client), patch('coletor_local.download_photo', side_effect=OSError('dummy network failure')):
            state.run('ieda', 'dummy-password')
        self.assertEqual(state.state['phase'], 'success')
        self.assertEqual(state.state['profile']['name'], 'Adele')
        self.assertIsNone(state.state['profile']['photo'])

    def test_http_rejects_foreign_origin_token_and_oversized_input(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server.test = LoginTest()
        thread = threading.Thread(target=server.serve_forever, daemon=True);thread.start()
        origin = 'http://127.0.0.1:' + str(server.server_port)
        def request(method, path, body=None, headers=None):
            connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=3)
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse();status = response.status;data = response.read();connection.close()
            return status, data
        try:
            self.assertEqual(request('GET', '/')[0], 403)
            self.assertEqual(request('GET', '/?token=' + server.test.token)[0], 200)
            self.assertEqual(request('GET', '/status')[0], 403)
            self.assertEqual(request('GET', '/status', headers={'X-Circulo-Token': server.test.token})[0], 200)
            headers = {'Origin': 'https://example.com', 'X-Circulo-Token': server.test.token, 'Content-Type': 'application/json'}
            self.assertEqual(request('POST', '/login', '{}', headers)[0], 403)
            headers['Origin'] = origin
            self.assertEqual(request('POST', '/login', 'x' * 5000, headers)[0], 400)
            self.assertEqual(request('POST', '/login', '{', headers)[0], 400)
            headers['X-Circulo-Token'] = 'invalid'
            self.assertEqual(request('POST', '/login', '{}', headers)[0], 403)
            self.assertEqual(request('GET', '/README.md')[0], 404)
        finally:
            server.shutdown();server.server_close();thread.join()

    def test_browser_form_clears_dummy_password_and_handles_code(self):
        from playwright.sync_api import sync_playwright
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server.test = LoginTest()
        thread = threading.Thread(target=server.serve_forever, daemon=True);thread.start()
        state = {'phase': 'ready', 'message': 'Teste com dados fictícios'}
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel='chrome', headless=True)
                page = browser.new_page(viewport={'width': 390, 'height': 844})
                page.route('**/status', lambda route: route.fulfill(json=state))
                def login(route):
                    state.update(phase='code_required', message='Código necessário no teste fictício')
                    route.fulfill(status=202, json={'accepted': True})
                def code(route):
                    state.update(phase='success', message='Teste fictício concluído', profile={'username': 'adele', 'name': 'Adele', 'verified': True, 'private': False, 'followers': 100, 'photo': None}, account='qa_fotos', remembered=False)
                    route.fulfill(status=202, json={'accepted': True})
                page.route('**/login', login);page.route('**/code', code)
                page.goto(f'http://127.0.0.1:{server.server_port}/?token={server.test.token}')
                self.assertFalse(page.locator('#remember').is_checked())
                page.get_by_label('Usuário do Instagram').fill('qa_fotos')
                page.get_by_label('Senha', exact=True).fill('dummy-password')
                page.get_by_role('button', name='Entrar e testar @adele').click()
                page.locator('#code-form').wait_for(state='visible')
                self.assertEqual(page.locator('#password').input_value(), '')
                page.get_by_label('Código de autenticação do Instagram').fill('123456')
                page.get_by_role('button', name='Confirmar código').click()
                page.locator('#result').wait_for(state='visible')
                self.assertEqual(page.locator('#code').input_value(), '')
                self.assertIn('Adele', page.locator('#profile-name').inner_text())
                self.assertFalse(page.evaluate('() => document.documentElement.scrollWidth>innerWidth'))
                self.assertEqual(server.test.state['phase'], 'ready')
                folder = Path(__file__).parent / 'evidence'
                folder.mkdir(exist_ok=True)
                page.screenshot(path=str(folder / 'login-mobile.png'), full_page=True)
                page.set_viewport_size({'width': 1280, 'height': 900})
                self.assertFalse(page.evaluate('() => document.documentElement.scrollWidth>innerWidth'))
                page.screenshot(path=str(folder / 'login-desktop.png'), full_page=True)
                browser.close()
        finally:
            server.shutdown();server.server_close();thread.join()


if __name__ == '__main__':
    unittest.main()
