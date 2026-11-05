"""Loopback-only, user-operated login test. Never logs credentials or reuses Chrome cookies."""
import argparse
import base64
import ctypes
from ctypes import wintypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import logging
import os
from pathlib import Path
import re
import secrets
import threading
from urllib.parse import parse_qs, urlsplit
import webbrowser

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'Circulo' / 'instagrapi'
USERNAME = re.compile(r'[a-z0-9_.]{1,30}')
PORT = 8767
ORIGIN = f'http://127.0.0.1:{PORT}'


class Blob(ctypes.Structure):
    _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_byte))]


def protect(data, decrypt=False):
    if os.name != 'nt':
        raise ValueError('A sessão protegida requer Windows.')
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
    output = Blob()
    crypt = ctypes.WinDLL('crypt32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    if decrypt:
        function = crypt.CryptUnprotectData
        function.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
        args = (ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output))
    else:
        function = crypt.CryptProtectData
        function.argtypes = [ctypes.POINTER(Blob), wintypes.LPCWSTR, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
        args = (ctypes.byref(source), 'Circulo', None, None, None, 1, ctypes.byref(output))
    function.restype = wintypes.BOOL
    if not function(*args):
        raise OSError('O Windows não conseguiu proteger ou abrir a sessão.')
    try:
        return ctypes.string_at(output.data, output.size)
    finally:
        kernel.LocalFree(output.data)


def save_session(path, username, settings):
    # Only documented session fields; passwords must never enter the persisted payload.
    allowed = {'uuids', 'mid', 'ig_u_rur', 'ig_www_claim', 'authorization_data', 'cookies', 'last_login', 'device_settings', 'user_agent', 'country', 'country_code', 'locale', 'timezone_offset', 'timezone_name', 'usdid'}
    selected = {key: value for key, value in settings.items() if key in allowed}
    encrypted = protect(json.dumps({'username': username, 'settings': selected}).encode('utf-8'))
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    try:
        with temp.open('wb') as stream:
            stream.write(encrypted);stream.flush();os.fsync(stream.fileno())
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def login_payload(data):
    if not isinstance(data, dict):
        raise ValueError('Formulário inválido.')
    username, password = data.get('username'), data.get('password')
    if not isinstance(username, str) or not USERNAME.fullmatch(username.lower()) or not isinstance(password, str) or not 1 <= len(password) <= 512 or type(data.get('remember')) is not bool:
        raise ValueError('Preencha usuário e senha no formulário local.')
    return username.lower(), password, data['remember']


def friendly_error(error, authenticated=False):
    name = type(error).__name__
    if name == 'ClientNeedsUpgradeError':
        return 'O Instagram recusou a versão de aplicativo usada pela biblioteca. Isso não confirma senha incorreta nem conta desativada. Não repita o login agora: esta integração precisa de uma correção de compatibilidade.'
    if any(part in name for part in ('Timeout', 'Connection', 'SSLError', 'ProxyError')):
        return 'A conexão com o Instagram falhou ou demorou demais. O teste não confirma se as credenciais foram aceitas.'
    if name in ('ChallengeRequired', 'ChallengeError', 'ChallengeUnknownStep', 'ChallengeSelfieCaptcha', 'RecaptchaChallengeForm'):
        return 'O Instagram pediu uma verificação adicional. Faça-a no aplicativo oficial. O teste parou e não tentará contorná-la.'
    if name in ('PleaseWaitFewMinutes', 'FeedbackRequired', 'RateLimitError', 'ClientThrottledError'):
        return 'O Instagram limitou a tentativa. Pare o teste e aguarde antes de tentar novamente.'
    if name in ('BadPassword', 'BadCredentials'):
        return 'O Instagram não aceitou o login. Confira seus dados e eventuais avisos no aplicativo oficial.'
    if authenticated:
        return 'O login foi aceito, mas a consulta do perfil não foi concluída. Isso não confirma desativação da conta.'
    return 'O login não foi concluído. Confira eventuais avisos no Instagram. Nenhuma nova tentativa será feita automaticamente.'


def error_reference(error):
    response = getattr(error, 'response', None)
    status = getattr(response, 'status_code', None)
    return {'code': type(error).__name__[:80], 'http': status if type(status) is int and 100 <= status <= 599 else None}


class LoginTest:
    def __init__(self):
        self.token = secrets.token_urlsafe(32)
        self.lock = threading.Lock()
        self.client = None
        self.owner = None
        self.remember = False
        self.state = {'phase': 'ready', 'message': 'Pronto para testar um perfil. Digite suas credenciais somente nesta página local.'}

    def update(self, **values):
        with self.lock:
            self.state.update(values)

    def begin(self, data):
        username, password, remember = login_payload(data)
        with self.lock:
            if self.state['phase'] in ('logging_in', 'querying', 'code_required'):
                raise ValueError('Já existe um teste em andamento.')
            self.state = {'phase': 'logging_in', 'message': 'Autenticando no Instagram…'}
        self.owner, self.remember = username, remember
        threading.Thread(target=self.run, args=(username, password), daemon=True).start()

    def code(self, data):
        if not isinstance(data, dict) or not isinstance(data.get('code'), str) or not re.fullmatch(r'[0-9]{6,8}', data['code']):
            raise ValueError('Informe o código de 6 a 8 dígitos na página local.')
        with self.lock:
            if self.state['phase'] != 'code_required' or self.client is None:
                raise ValueError('Não há uma verificação de código pendente.')
            self.state = {'phase': 'logging_in', 'message': 'Conferindo o código no Instagram…'}
        threading.Thread(target=self.run, args=(None, None, data['code']), daemon=True).start()

    def run(self, username, password, code=''):
        from instagrapi import Client
        from instagrapi.exceptions import ChallengeRequired, TwoFactorRequired
        authenticated = False
        try:
            if username is not None:
                self.client = Client(public_request_retries_count=1, session_retry_total=0)
                if self.remember:
                    path = DATA / ('sessao-' + username + '.bin')
                    if path.exists():
                        if path.stat().st_size > 2000000:
                            raise ValueError('Sessão local inválida.')
                        saved = json.loads(protect(path.read_bytes(), decrypt=True))
                        if saved['username'] != username:
                            raise ValueError('Sessão de outra conta.')
                        self.client.set_settings(saved['settings'])
            client = self.client
            def stop_challenge(_):
                raise ChallengeRequired('Manual verification required')
            client.challenge_resolve = stop_challenge
            client.login(username, password, verification_code=code)
            authenticated = True
            client.password = None
            if self.remember:
                save_session(DATA / ('sessao-' + self.owner + '.bin'), self.owner, client.get_settings())
            self.update(phase='querying', message='Login aceito. Consultando somente @adele…')
            user = client.user_info_by_username('adele')
            photo = None
            photo_failed = False
            if user.profile_pic_url:
                try:
                    from PIL import Image, ImageOps
                    from coletor_local import download_photo
                    raw = download_photo(str(user.profile_pic_url)).split(',', 1)[1]
                    with Image.open(io.BytesIO(base64.b64decode(raw))) as image:
                        if image.width * image.height > 40000000:
                            raise ValueError('Imagem muito grande.')
                        image = ImageOps.fit(image.convert('RGB'), (128, 128))
                        output = io.BytesIO();image.save(output, format='JPEG', quality=85)
                        photo = 'data:image/jpeg;base64,' + base64.b64encode(output.getvalue()).decode('ascii')
                except Exception:
                    photo_failed = True
            self.update(phase='success', message='Perfil consultado. A foto não pôde ser baixada nesta tentativa.' if photo_failed else 'Consulta concluída. O perfil e os dados abaixo foram retornados pelo instagrapi.', profile={
                'username': user.username, 'name': user.full_name, 'verified': user.is_verified,
                'private': user.is_private, 'followers': user.follower_count, 'photo': photo},
                account=self.owner, remembered=self.remember)
        except TwoFactorRequired:
            self.update(phase='code_required', message='O Instagram pediu seu código de autenticação. Digite-o somente neste formulário local.')
        except Exception as error:
            self.update(phase='error', message=friendly_error(error, authenticated), reference=error_reference(error))
        finally:
            with self.lock:
                waiting = self.state['phase'] == 'code_required'
            if not waiting and self.client is not None:
                self.client.password = None
                self.client = None
            password = None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Do not log URLs, requests, responses or credentials.

    def reply(self, status, data, kind='application/json'):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8') if kind == 'application/json' else data
        self.send_response(status)
        self.send_header('Content-Type', kind + '; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        self.end_headers();self.wfile.write(body)

    def allowed(self):
        return self.headers.get('Host') == f'127.0.0.1:{self.server.server_port}'

    def token_ok(self, token):
        return isinstance(token, str) and secrets.compare_digest(token, self.server.test.token)

    def do_GET(self):
        parsed = urlsplit(self.path)
        if not self.allowed():
            self.reply(403, {'error': 'Acesso local inválido.'});return
        if parsed.path == '/status':
            if not self.token_ok(self.headers.get('X-Circulo-Token')):
                self.reply(403, {'error': 'Acesso não autorizado.'});return
            with self.server.test.lock:
                self.reply(200, self.server.test.state)
        elif parsed.path == '/':
            if not self.token_ok(parse_qs(parsed.query).get('token', [''])[0]):
                self.reply(403, {'error': 'Abra o endereço fornecido pelo programa local.'});return
            self.reply(200, (ROOT / 'login-local.html').read_bytes(), 'text/html')
        elif parsed.path in ('/login-local.js', '/login-local.css'):
            self.reply(200, (ROOT / parsed.path[1:]).read_bytes(), 'text/javascript' if parsed.path.endswith('.js') else 'text/css')
        else:
            self.reply(404, {'error': 'Página não encontrada.'})

    def do_POST(self):
        if not self.allowed() or self.headers.get('Origin') != f'http://127.0.0.1:{self.server.server_port}' or not self.token_ok(self.headers.get('X-Circulo-Token')):
            self.reply(403, {'error': 'Acesso não autorizado.'});return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 4096 or self.headers.get_content_type() != 'application/json':
                raise ValueError('Formulário inválido.')
            data = json.loads(self.rfile.read(size))
            if self.path == '/login':
                self.server.test.begin(data)
            elif self.path == '/code':
                self.server.test.code(data)
            else:
                self.reply(404, {'error': 'Página não encontrada.'});return
            self.reply(202, {'accepted': True})
        except (ValueError, TypeError):
            self.reply(400, {'error': 'Não foi possível iniciar. Confira os campos e se já existe um teste em andamento.'})


def main():
    parser = argparse.ArgumentParser(description='Teste local de login do Instagram')
    parser.add_argument('--open', action='store_true')
    args = parser.parse_args()
    logging.disable(logging.CRITICAL)
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    server.test = LoginTest()
    url = ORIGIN + '/?token=' + server.test.token
    print('Teste local pronto. Abra: ' + url, flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
