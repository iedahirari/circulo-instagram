"""Local, resumable photo collector. Session and results stay outside the repository."""
import argparse
import base64
import json
import os
from pathlib import Path
import queue
import re
import sys
import threading
import time
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

DATA = Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'Circulo' / 'coletor'
USERNAME = re.compile(r'[a-z0-9_.]{1,30}')
PHOTO = re.compile(r'data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}')


def read_queue(path):
    if path.stat().st_size > 200000:
        raise ValueError('Arquivo de fila muito grande.')
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    if (not isinstance(data, dict) or data.get('format') != 'circulo-queue-v1'
            or not isinstance(data.get('account'), str) or not USERNAME.fullmatch(data['account'])
            or not isinstance(data.get('users'), list) or not 1 <= len(data['users']) <= 1000):
        raise ValueError('Escolha a fila gerada pelo botão Preparar coleta local no Círculo.')
    if any(not isinstance(n, str) or not USERNAME.fullmatch(n) or n.startswith('__deleted__') for n in data['users']):
        raise ValueError('A fila contém um nome de perfil inválido.')
    return data['account'], list(dict.fromkeys(data['users']))


def read_results(path, account):
    if not path.exists():
        return {'format': 'circulo-photos-v1', 'account': account, 'photos': []}
    if path.stat().st_size > 12000000:
        raise ValueError('O arquivo de resultados excede 12 MB; importe e arquive antes de continuar.')
    data = json.loads(path.read_text(encoding='utf-8'))
    if (not isinstance(data, dict) or data.get('format') != 'circulo-photos-v1'
            or data.get('account') != account or not isinstance(data.get('photos'), list)
            or len(data['photos']) > 1000):
        raise ValueError('Resultados anteriores inválidos; arquivo preservado.')
    seen = set()
    for item in data['photos']:
        if (not isinstance(item, dict) or not isinstance(item.get('username'), str)
                or not USERNAME.fullmatch(item['username']) or item['username'] in seen
                or not isinstance(item.get('photo'), str) or len(item['photo']) > 100000
                or not PHOTO.fullmatch(item['photo'])):
            raise ValueError('Há uma foto inválida nos resultados anteriores; arquivo preservado.')
        seen.add(item['username'])
    return {'format': data['format'], 'account': account, 'photos': data['photos']}


def save_results(path, data):
    encoded = json.dumps(data, ensure_ascii=False).encode('utf-8')
    if len(encoded) > 11500000 or len(data['photos']) > 1000:
        raise ValueError('O lote está cheio. Importe as fotos e arquive o arquivo antes de continuar.')
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    try:
        with temp.open('wb') as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def photo_url_allowed(value):
    try:
        url = urlsplit(value)
        return (url.scheme == 'https' and url.hostname is not None
                and url.hostname.endswith(('.cdninstagram.com', '.fbcdn.net'))
                and not url.username and not url.password and url.port in (None, 443))
    except (ValueError, TypeError):
        return False


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def download_photo(url):
    if not photo_url_allowed(url):
        raise ValueError('Origem de foto não reconhecida.')
    # No cookie jar: the collector does not send the Instagram login to image servers.
    with build_opener(NoRedirect()).open(Request(url), timeout=15) as response:
        kind = response.headers.get_content_type()
        if kind not in ('image/jpeg', 'image/png', 'image/webp'):
            raise ValueError('A resposta não é uma foto suportada.')
        body = response.read(5 * 1024 * 1024 + 1)
        if len(body) > 5 * 1024 * 1024:
            raise ValueError('A foto excede 5 MB.')
        return 'data:' + kind + ';base64,' + base64.b64encode(body).decode('ascii')


# shortcut: profile header and matching Open Graph metadata; update if Instagram changes its markup.
FIND_PHOTO = r'''username => {
  const path=location.pathname.replace(/\/$/,'').toLowerCase();
  if(path!=='/'+username)return null;
  const escaped=username.replaceAll('.', '\\.');
  const usernamePattern=new RegExp('(^|[^a-z0-9_.])'+escaped+'([^a-z0-9_.]|$)');
  const candidates=[...document.querySelectorAll('main header img')];
  const explicit=[...document.querySelectorAll('img')].filter(img=>{
    const alt=(img.alt||'').toLowerCase();
    return usernamePattern.test(alt) && /profile picture|foto do perfil|foto de perfil/.test(alt);
  });
  for(const img of [...explicit,...candidates]){
    if(img.currentSrc||img.src)return img.currentSrc||img.src;
  }
  const title=document.querySelector('meta[property="og:title"]')?.content||'';
  if(!new RegExp('@'+escaped+'([^a-z0-9_.]|$)').test(title.toLowerCase()))return null;
  return document.querySelector('meta[property="og:image"]')?.content||null;
}'''

MAKE_THUMBNAIL = r'''async source => {
  const image=new Image();image.src=source;await image.decode();
  if(!image.width||!image.height||image.width*image.height>40000000)throw Error('Imagem inválida ou muito grande');
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const ctx=canvas.getContext('2d'), side=Math.min(image.width,image.height);
  ctx.fillStyle='white';ctx.fillRect(0,0,128,128);
  ctx.drawImage(image,(image.width-side)/2,(image.height-side)/2,side,side,0,0,128,128);
  return canvas.toDataURL('image/jpeg',0.85);
}'''


def blocked(page, response):
    parts = urlsplit(page.url)
    if parts.hostname not in ('instagram.com', 'www.instagram.com'):
        return True
    return (response is not None and response.status in (401, 403, 429)) or any(
        token in parts.path for token in ('/challenge', '/accounts/login', '/checkpoint', '/captcha'))


def collect(account, users, limit, events, start, stop):
    from playwright.sync_api import sync_playwright
    result_path = DATA / ('coleta-' + account + '.json')
    try:
        results = read_results(result_path, account)
        saved = {item['username'] for item in results['photos']}
        pending = [user for user in users if user not in saved][:limit]
        if not pending:
            events.put(('done', f'As fotos desta fila já estão guardadas: {len(saved)}.', str(result_path)))
            return
        DATA.mkdir(parents=True, exist_ok=True)
        # A dedicated profile keeps the user's normal Chrome untouched and auth outside OneDrive/Git.
        with sync_playwright() as browser:
            context = browser.chromium.launch_persistent_context(
                str(DATA / 'perfil'), channel='chrome', headless=False, viewport={'width': 1100, 'height': 820})
            try:
                page = context.pages[0] if context.pages else context.new_page()
                page.set_default_timeout(12000)
                page.goto('https://www.instagram.com/', wait_until='domcontentloaded', timeout=30000)
                events.put(('login', 'Entre no Instagram no navegador aberto. Depois clique em Iniciar coleta nesta janela.'))
                while not start.wait(.25):
                    if stop.is_set():
                        return
                renderer = context.new_page()
                page.bring_to_front()
                failed = 0
                for index, username in enumerate(pending, 1):
                    if stop.is_set():
                        break
                    events.put(('progress', f'Visitando @{username} · {index} de {len(pending)}', index-1, len(pending)))
                    response = page.goto('https://www.instagram.com/' + username + '/', wait_until='domcontentloaded', timeout=30000)
                    if blocked(page, response):
                        raise ValueError('O Instagram pediu login/verificação ou limitou a consulta. A coleta foi interrompida; resolva isso no Instagram antes de tentar de novo.')
                    page.wait_for_timeout(1500)
                    text = page.locator('body').inner_text()[:60000].lower()
                    if any(term in text for term in ('try again later', 'tente novamente mais tarde', 'confirme que você é uma pessoa', 'confirm you are human')):
                        raise ValueError('O Instagram apresentou uma restrição. A coleta foi interrompida sem tentar contorná-la.')
                    source = page.evaluate(FIND_PHOTO, username)
                    try:
                        if not source:
                            raise ValueError('Foto não encontrada nesta visita.')
                        photo = renderer.evaluate(MAKE_THUMBNAIL, download_photo(source))
                    except HTTPError as error:
                        if error.code in (403, 429):
                            raise ValueError('O servidor de fotos limitou a consulta; tente novamente mais tarde.') from error
                        photo = None
                    except Exception:
                        photo = None
                    if photo and len(photo) <= 100000 and PHOTO.fullmatch(photo):
                        updated = {**results, 'photos': results['photos'] + [{'username': username, 'photo': photo}]}
                        save_results(result_path, updated)
                        results = updated
                        saved.add(username)
                        failed = 0
                    else:
                        failed += 1
                        events.put(('progress', f'Foto de @{username} não encontrada. Isso não confirma desativação.', index, len(pending)))
                    if failed >= 3:
                        raise ValueError('Três visitas seguidas não trouxeram fotos. Parei para evitar uma coleta incompleta; pode ser necessário ajustar a leitura da página.')
                    if stop.wait(3):
                        break
                events.put(('done', f'Fotos guardadas nesta conta: {len(saved)}. Importe o arquivo no Círculo. Execute novamente para continuar a fila.', str(result_path) if result_path.exists() else ''))
            finally:
                context.close()
    except Exception as error:
        message = 'O navegador da coleta foi fechado. As fotos já guardadas continuam disponíveis.' if 'Target page, context or browser has been closed' in str(error) else str(error)
        events.put(('error', message, str(result_path) if result_path.exists() else ''))
    finally:
        events.put(('finished',))


def main():
    parser = argparse.ArgumentParser(description='Coletor local de fotos do Círculo')
    parser.add_argument('--input', type=Path)
    parser.add_argument('--limit', type=int, default=10)
    args = parser.parse_args()
    root = tk.Tk()
    root.withdraw()
    if not 1 <= args.limit <= 50:
        messagebox.showerror('Círculo', 'Escolha um lote de 1 a 50 perfis.');root.destroy();return
    path = args.input or filedialog.askopenfilename(title='Escolha a fila do Círculo', filetypes=[('Fila de coleta', '*.json')])
    if not path:
        root.destroy();return
    try:
        account, users = read_queue(Path(path))
    except Exception as error:
        messagebox.showerror('Círculo', str(error));root.destroy();return
    root.deiconify();root.title('Círculo · Coleta local');root.geometry('520x340');root.configure(bg='#f7f8f3')
    tk.Label(root, text='Seu círculo, com fotos.', bg='#f7f8f3', fg='#203b32', font=('Segoe UI', 20)).pack(pady=(22, 8))
    tk.Label(root, text=f'@{account} · {len(users)} perfis na fila · lote de até {args.limit}', bg='#f7f8f3', fg='#59655e').pack()
    label = tk.Label(root, text='Abrindo um navegador separado para a coleta…', wraplength=460, bg='#f7f8f3', fg='#203b32')
    label.pack(padx=25, pady=18)
    progress = ttk.Progressbar(root, length=450, mode='determinate');progress.pack(pady=5)
    events, start, stop = queue.Queue(), threading.Event(), threading.Event()
    controls = tk.Frame(root, bg='#f7f8f3');controls.pack(pady=15)
    begin = ttk.Button(controls, text='Iniciar coleta', state='disabled', command=lambda: (start.set(), begin.configure(state='disabled')))
    begin.pack(side='left', padx=5)
    cancel = ttk.Button(controls, text='Parar e salvar', command=stop.set);cancel.pack(side='left', padx=5)
    output = ttk.Button(root, text='Abrir pasta dos resultados', command=lambda: os.startfile(str(DATA)))
    closing = False
    def close():
        nonlocal closing
        closing = True;stop.set();label.configure(text='Encerrando e preservando as fotos guardadas…')
    root.protocol('WM_DELETE_WINDOW', close)
    def tick():
        nonlocal closing
        try:
            while True:
                event = events.get_nowait()
                if event[0] in ('login', 'progress', 'done', 'error'):
                    label.configure(text=event[1])
                    if sys.stdout is not None:
                        print(event[1], flush=True)
                if event[0] == 'login' and not closing:
                    begin.configure(state='normal')
                elif event[0] == 'progress':
                    progress.configure(value=event[2], maximum=event[3])
                elif event[0] in ('done', 'error') and event[2]:
                    output.pack(pady=5)
                elif event[0] == 'finished':
                    cancel.configure(text='Fechar', command=root.destroy);begin.configure(state='disabled')
                    root.protocol('WM_DELETE_WINDOW', root.destroy)
                    if closing:
                        root.destroy();return
        except queue.Empty:
            pass
        root.after(100, tick)
    threading.Thread(target=collect, args=(account, users, args.limit, events, start, stop), daemon=False).start()
    root.after(100, tick);root.mainloop()


if __name__ == '__main__':
    main()
