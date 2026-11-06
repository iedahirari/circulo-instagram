/* Referências de protocolo: adrigo/unfollowers-for-instagram e itzstebin/Whoisit.
 * Implementação própria, somente leitura; não exporta cookies nem executa unfollows. */
(function () {
  'use strict';
  function assertSession(cookie, expected) {
    const current=cookie.split(';').map(item=>item.trim()).find(item=>item.startsWith('ds_user_id='))?.slice(11);
    if(current!==expected)throw Error('A conta conectada mudou durante a leitura. A consulta foi descartada.');
  }
  async function collectList(request, userId, kind, expected, signal, progress, wait) {
    const users = new Map(), cursors = new Set();
    let cursor = '';
    for (let page = 0; page < 1000; page++) {
      if (signal.aborted) throw Error('Coleta cancelada. Nenhuma consulta foi gerada.');
      const params = new URLSearchParams(kind === 'following' ? {order:'date_followed_latest'} : {count:'25'});
      if (cursor) params.set('max_id', cursor);
      const data = await request(`/api/v1/friendships/${userId}/${kind}/?${params}`, signal);
      if (!Array.isArray(data.users)) throw Error('Lista inesperada. Nenhuma consulta foi gerada.');
      for (const user of data.users) {
        const id = String(user.pk_id ?? user.pk ?? '');
        if (!/^\d{1,30}$/.test(id) || typeof user.username !== 'string' || !/^[a-zA-Z0-9_.]{1,30}$/.test(user.username)) throw Error('Perfil inválido na resposta.');
        users.set(id, {id, username:user.username.toLowerCase(), fullName:String(user.full_name || '').slice(0,200),
          ...(typeof user.is_verified==='boolean'?{isVerified:user.is_verified}:{}),
          ...(typeof user.is_private==='boolean'?{isPrivate:user.is_private}:{}),
          photoUrl:typeof user.profile_pic_url === 'string' && /^https:\/\/[^/]+\.(cdninstagram\.com|fbcdn\.net)\//.test(user.profile_pic_url) ? user.profile_pic_url : null});
      }
      progress(kind, users.size, expected);
      if (!data.next_max_id) {
        if (users.size !== expected || new Set([...users.values()].map(u=>u.username)).size !== users.size) throw Error('A lista não corresponde ao total informado pelo Instagram. Use a exportação oficial.');
        return [...users.values()];
      }
      cursor = String(data.next_max_id);
      if (cursors.has(cursor)) throw Error('A paginação se repetiu. A consulta incompleta foi descartada.');
      cursors.add(cursor);
      await wait();
    }
    throw Error('Limite de páginas atingido. Use a exportação oficial.');
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = {collectList,assertSession}; return; }
  if (location.origin !== 'https://www.instagram.com' && location.origin !== 'https://instagram.com') { alert('Abra o Instagram conectado antes de executar o coletor.'); return; }
  if (document.getElementById('circulo-session')) return;
  const box = document.createElement('dialog'); box.id = 'circulo-session';
  box.style.cssText = 'border:0;border-radius:24px;padding:28px;max-width:440px;width:85%;background:#faf9f6;color:#243c35;font:16px/1.5 system-ui;box-shadow:0 20px 80px #0005';
  const title = document.createElement('h2'); title.textContent = 'círculo · Coletar conexões';
  const note = document.createElement('p'); note.textContent = 'Somente sua conta conectada. Coleta nomes, IDs, selos e links de fotos. Não pede senha nem altera quem você segue.';
  const label = document.createElement('label'); label.textContent = 'Seu usuário do Instagram';
  const input = document.createElement('input'); input.placeholder = 'seu.usuario'; input.maxLength = 30; input.autocomplete = 'off'; label.append(input);
  const status = document.createElement('p'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  const start = document.createElement('button'); start.textContent = 'Iniciar leitura';
  const close = document.createElement('button'); close.textContent = 'Parar e fechar';
  input.style.cssText='display:block;box-sizing:border-box;width:100%;margin:8px 0 16px;padding:12px;border:1px solid #b8c5be;border-radius:10px;font:inherit';
  for(const button of [start,close])button.style.cssText='padding:12px 16px;margin:4px;border:1px solid #b8c5be;border-radius:12px;background:#e4ede7;color:#243c35;font:inherit;cursor:pointer';
  let controller, ownId;
  close.onclick = () => { controller?.abort(); box.close(); box.remove(); };
  const request = async (path, signal) => {
    assertSession(document.cookie,ownId);
    const res = await fetch(path, {credentials:'same-origin', signal:AbortSignal.any([signal, AbortSignal.timeout(20000)]), headers:{'x-ig-app-id':'936619743392459','x-requested-with':'XMLHttpRequest'}});
    assertSession(document.cookie,ownId);
    if (res.redirected || !res.ok) throw Error(res.status === 429 ? 'Instagram limitou a leitura. Pare e tente em outro momento.' : 'Instagram não autorizou a leitura. Confira sua sessão no site.');
    if (!res.headers.get('content-type')?.includes('application/json')) throw Error('Instagram não retornou dados. A coleta parou.');
    const data = await res.json();
    if (data.status !== 'ok') throw Error('Instagram recusou a consulta.');
    return data;
  };
  start.onclick = async () => {
    const account = input.value.trim().replace(/^@/,'').toLowerCase();
    if (!/^[a-z0-9_.]{1,30}$/.test(account)) { status.textContent = 'Informe seu nome de usuário.'; return; }
    start.disabled = true; input.disabled = true; controller = new AbortController();
    try {
      ownId = document.cookie.split(';').map(item=>item.trim()).find(c=>c.startsWith('ds_user_id='))?.split('=')[1];
      if (!/^\d{1,30}$/.test(ownId || '')) throw Error('Não encontrei a sessão conectada. Entre pelo site do Instagram.');
      const profile = async () => {
        const data = await request('/api/v1/users/web_profile_info/?username='+encodeURIComponent(account), controller.signal);
        const u = data.data?.user;
        if (String(u?.id) !== ownId || u?.username?.toLowerCase() !== account) throw Error('Use o usuário da conta conectada nesta aba.');
        const counts = {followers:u.edge_followed_by?.count, following:u.edge_follow?.count};
        if (Object.values(counts).some(n=>!Number.isSafeInteger(n)||n<0||n>20000)) throw Error('Totais indisponíveis ou conta acima do limite de 20 mil. Use a exportação oficial.');
        return counts;
      };
      const before = await profile(), lists = {};
      for (const kind of ['following','followers']) lists[kind] = await collectList(request, ownId, kind, before[kind], controller.signal,
        (list,n,total)=>{status.textContent=(list==='followers'?'Seguidores':'Seguindo')+`: ${n} de ${total}`;},
        ()=>new Promise(resolve=>setTimeout(resolve,3000)));
      const after = await profile();
      if (before.followers !== after.followers || before.following !== after.following) throw Error('Os totais mudaram durante a leitura. A consulta não será gerada.');
      if (controller.signal.aborted) return;
      assertSession(document.cookie,ownId);
      const capturedAt = new Date().toISOString();
      const result = {format:'circulo-session-v1', account, capturedAt, complete:true, counts:after, ...lists};
      const url = URL.createObjectURL(new Blob([JSON.stringify(result)],{type:'application/json'}));
      const link = document.createElement('a'); link.href=url; link.download=`circulo-consulta-${account}-${capturedAt.slice(0,10)}.json`; link.textContent='Baixar consulta para o Círculo'; box.append(link);
      setTimeout(()=>URL.revokeObjectURL(url),300000);
      status.textContent = 'Leitura concluída e totais conferidos. Baixe o arquivo e importe no Círculo. Os links das fotos não são imagens salvas.';
    } catch (error) { status.textContent=controller.signal.aborted?'Coleta cancelada.':error.message; }
    finally { start.disabled=false; input.disabled=false; }
  };
  box.append(title,note,label,status,start,close); document.body.append(box); box.showModal(); input.focus();
})();
