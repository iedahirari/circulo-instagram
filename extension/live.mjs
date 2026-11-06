// Runs in the extension's isolated world in the signed-in Instagram tab.
export async function collectSession() {
  if(globalThis.circuloLive?.running)throw Error('Já existe uma coleta nesta aba.');
  const state={running:true,stop:false,message:'Identificando sua conta…',count:0};
  globalThis.circuloLive=state;
  const session=()=>document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('ds_user_id='))?.slice(11);
  const ownId=session();
  const check=()=>{
    if(state.stop)throw Error('Coleta interrompida. A consulta anterior foi preservada.');
    if(!/^\d{1,30}$/.test(ownId||'')||session()!==ownId)throw Error('Sua sessão mudou ou expirou. Abra o Instagram conectado e tente novamente.');
  };
  const request=async path=>{
    check();
    const response=await fetch(path,{credentials:'same-origin',signal:AbortSignal.timeout(20000),headers:{'x-ig-app-id':'936619743392459','x-requested-with':'XMLHttpRequest'}});
    check();
    if(response.status===429)throw Error('O Instagram limitou a leitura. Pare e tente em outro momento.');
    if(!response.ok||response.redirected||!response.headers.get('content-type')?.includes('application/json'))throw Error('O Instagram não autorizou a leitura. Confira se há algum aviso no site.');
    const data=await response.json();check();
    if(data.status!=='ok')throw Error('O Instagram recusou a coleta. Nenhuma consulta incompleta será salva.');
    return data;
  };
  try{
    const user=(await request('/api/v1/accounts/current_user/?edit=true')).user;
    const account=user?.username?.toLowerCase();
    if(String(user?.pk_id??user?.pk)!==ownId||!/^[a-z0-9_.]{1,30}$/.test(account||''))throw Error('Não foi possível identificar sua conta conectada.');
    const totals=async()=>{
      const u=(await request('/api/v1/users/web_profile_info/?username='+encodeURIComponent(account))).data?.user;
      if(String(u?.id)!==ownId||u?.username?.toLowerCase()!==account)throw Error('A conta consultada não corresponde à sessão conectada.');
      const counts={followers:u.edge_followed_by?.count,following:u.edge_follow?.count};
      if(Object.values(counts).some(n=>!Number.isSafeInteger(n)||n<0||n>20000))throw Error('Não foi possível conferir os totais. Use a exportação oficial para esta conta.');
      return counts;
    };
    const before=await totals(), lists={};state.account=account;
    for(const kind of ['following','followers']){
      const found=new Map(),cursors=new Set();let cursor='';let complete=false;
      for(let page=0;page<1000;page++){
        const params=new URLSearchParams(kind==='following'?{order:'date_followed_latest'}:{count:'25'});
        if(cursor)params.set('max_id',cursor);
        const data=await request(`/api/v1/friendships/${ownId}/${kind}/?${params}`);
        if(!Array.isArray(data.users))throw Error('Resposta incompleta do Instagram.');
        for(const raw of data.users){
          const id=String(raw.pk_id??raw.pk??''),username=raw.username?.toLowerCase();
          if(!/^\d{1,30}$/.test(id)||!/^[a-z0-9_.]{1,30}$/.test(username||''))throw Error('Perfil inválido na resposta.');
          let photoUrl=null;
          try{const url=new URL(raw.profile_pic_url);if(url.protocol==='https:'&&/\.(cdninstagram\.com|fbcdn\.net)$/.test(url.hostname)&&!url.username&&!url.password&&(!url.port||url.port==='443'))photoUrl=url.href;}catch{}
          found.set(id,{id,username,fullName:String(raw.full_name||'').slice(0,200),photoUrl,
            ...(typeof raw.is_verified==='boolean'?{isVerified:raw.is_verified}:{}),...(typeof raw.is_private==='boolean'?{isPrivate:raw.is_private}:{})});
        }
        state.count=found.size;state.message=(kind==='followers'?'Seguidores':'Seguindo')+`: ${found.size} de ${before[kind]}`;
        if(!data.next_max_id){complete=true;break;}
        cursor=String(data.next_max_id);
        if(cursors.has(cursor))throw Error('A lista se repetiu. A coleta incompleta foi descartada.');
        cursors.add(cursor);await new Promise(resolve=>setTimeout(resolve,3000));
      }
      if(!complete||found.size!==before[kind]||new Set([...found.values()].map(u=>u.username)).size!==found.size)throw Error('Faltam perfis para conferir o total. A consulta anterior foi preservada.');
      lists[kind]=[...found.values()];
    }
    const after=await totals();check();
    if(before.followers!==after.followers||before.following!==after.following)throw Error('Os totais mudaram durante a coleta. Tente em outro momento.');
    state.message='Listas conferidas. Preparando fotos…';
    return {format:'circulo-session-v1',account,capturedAt:new Date().toISOString(),complete:true,counts:after,...lists};
  }finally{state.running=false;}
}
export function readCollectionProgress(){const s=globalThis.circuloLive;return s?{running:s.running,message:s.message,account:s.account,count:s.count}:null;}
export function stopCollection(){if(globalThis.circuloLive)globalThis.circuloLive.stop=true;}
