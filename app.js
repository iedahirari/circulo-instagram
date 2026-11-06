import {parseExport,compare,classify,validateSnapshot,categories,profileKey,validateProfile,mergePhotoImport,makePhotoQueue,toCsv} from './core.mjs';
const $=id=>document.getElementById(id);
const FILTER_LABELS={followers:'Seguidores',lost:'Saíram',gained:'Entraram',nonmutual:'Não seguem de volta',renamed:'Renomeados'};
let snapshots=[], pending=null, filter='followers', pageSize=50, limit=50, db, reading=false, profiles=new Map(), photoTarget=null;
function notify(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);$('notice').hidden=false;}
function dateLabel(date){return new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));}
function current(){return snapshots.find(s=>s.id===$('history').value);}
function previous(s){return snapshots.filter(x=>x.account===s.account && x.date<s.date).sort((a,b)=>b.date.localeCompare(a.date))[0];}
function stored(mode,action,storeName='snapshots'){return new Promise((resolve,reject)=>{const tx=db.transaction(storeName,mode);let request;try{request=action(tx.objectStore(storeName));}catch(e){tx.abort();reject(e);return;}tx.oncomplete=()=>resolve(request?.result);tx.onerror=()=>reject(Error('Não foi possível salvar o histórico. Baixe um backup e confira o espaço do navegador.'));tx.onabort=()=>reject(Error('Operação cancelada. Seu histórico anterior foi preservado.'));});}

function saveConsultation(snapshot,incoming){
  const merged=incoming.map(p=>{const saved=profiles.get(p.id);return validateProfile({...p,...saved,instagramId:p.instagramId,fullName:p.fullName,isVerified:p.isVerified});});
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['snapshots','profiles'],'readwrite');
    tx.objectStore('snapshots').add(snapshot);
    for(const p of merged)tx.objectStore('profiles').put(p);
    tx.oncomplete=()=>resolve();
    tx.onabort=tx.onerror=()=>reject(Error('Não foi possível salvar. A consulta e os perfis anteriores foram preservados.'));
  });
}

async function reload(selected=$('history').value){profiles=new Map((await stored('readonly',s=>s.getAll(),'profiles')).map(p=>[p.id,p]));snapshots=await stored('readonly',s=>s.getAll());snapshots.sort((a,b)=>b.date.localeCompare(a.date)||a.account.localeCompare(b.account));$('history').replaceChildren();for(const s of snapshots){const option=new Option('@'+s.account+' · '+dateLabel(s.date)+' · '+s.followers.length+' seguidores',s.id);$('history').add(option);}if(!snapshots.length)$('history').add(new Option('Nenhuma consulta salva',''));if(snapshots.some(s=>s.id===selected))$('history').value=selected;$('history').disabled=!snapshots.length;$('export').disabled=!snapshots.length;render();}
function empty(title,text){const div=document.createElement('div');div.className='empty';const icon=document.createElement('span');icon.textContent='◎';icon.setAttribute('aria-hidden','true');const h=document.createElement('h3');h.textContent=title;const p=document.createElement('p');p.textContent=text;div.append(icon,h,p);$('list').replaceChildren(div);$('more').hidden=true;}

// IDs conhecidos por nome: perfis já coletados pela sessão e IDs gravados nas consultas (a mais recente prevalece).
function idsFor(account,current,prior){
  const ids=new Map();
  for(const p of profiles.values())if(p.account===account && p.instagramId)ids.set(p.username,p.instagramId);
  for(const s of [prior,current]){
    if(s?.followerIds)for(const [name,id] of Object.entries(s.followerIds))ids.set(name,id);
    if(s?.followingIds)for(const [name,id] of Object.entries(s.followingIds))ids.set(name,id);
  }
  return ids;
}
function analyze(s){
  const prev=previous(s), result=compare(s,prev,idsFor(s.account,s,prev)), statuses=classify(s,prev,result,snapshots);
  return {prev,result,...statuses};
}
function officialDate(timestamp){return new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(new Date(timestamp*1000));}
function statusText(row){
  if(row.status==='renamed')return 'Renomeado · antes @'+row.from;
  const parts=[];
  if(row.kind==='lost')parts.push(row.status==='returned'?'Saiu · voltou depois':'Saiu');
  if(row.kind==='gained')parts.push(row.status==='returned'?'Voltou a seguir':'Nova conexão');
  if(row.officialAt)parts.push('confirmado pelo Instagram em '+officialDate(row.officialAt));
  return parts.join(' · ');
}
// Linhas da lista atual, já com busca, categoria e ignorados aplicados. null quando a lista não existe.
function rowsFor(s,view){
  const {result}=view, query=$('search').value.toLowerCase().replace(/^@/,'');
  let rows;
  if(filter==='renamed'){
    if(!result.renamed)return null;
    rows=result.renamed.filter(r=>r.to.includes(query)||r.from.includes(query)).map(r=>({name:r.to,from:r.from,kind:'renamed',status:'renamed'}));
  }else{
    if(!result[filter])return null;
    const statusMap=filter==='lost'?view.lostStatus:filter==='gained'?view.gainedStatus:null;
    const officialAt=new Map((s.recentUnfollows||[]).map(r=>[r.username,r.timestamp]));
    rows=result[filter].filter(n=>n.includes(query)).map(name=>({name,kind:filter,status:statusMap?.get(name),officialAt:filter==='lost'?officialAt.get(name):undefined}));
  }
  rows=rows.map(r=>({...r,profile:profiles.get(profileKey(s.account,r.name))}));
  if(filter==='nonmutual'){
    const category=$('category-filter').value, showIgnored=$('show-ignored').checked;
    rows=rows.filter(r=>(category==='all'||(r.profile?.category||'review')===category)&&(showIgnored||!r.profile?.ignored));
  }
  return rows;
}
function sortRows(rows){
  const mode=$('sort').value, order=Object.keys(categories), rank=r=>order.indexOf(r.profile?.category||'review');
  return rows.sort((a,b)=>mode==='category'?(rank(a)-rank(b))||a.name.localeCompare(b.name):mode==='desc'?b.name.localeCompare(a.name):a.name.localeCompare(b.name));
}
// Lista exibida: aplica ordenação e o filtro "Somente sem foto". A paginação é feita em render().
function visibleList(s,view){
  const rows=rowsFor(s,view);
  if(rows===null)return null;
  const sorted=sortRows(rows);
  return {all:sorted, list:$('without-photo').checked?sorted.filter(r=>!r.profile?.photo):sorted};
}

function buildRow(s,row){
  const {name,profile}=row;
  const div=document.createElement('div');div.className='profile'+(profile?.ignored?' ignored':'');
  const avatar=document.createElement('button');avatar.className='avatar';avatar.type='button';
  avatar.setAttribute('aria-label',(profile?.photo?'Trocar':'Adicionar')+' foto de referência de @'+name);
  avatar.title='Foto de referência adicionada por você';
  const initials=()=>{avatar.textContent=name.replace(/^[_.]+/,'').slice(0,2);};
  if(profile?.photo){const img=document.createElement('img');img.src=profile.photo;img.alt='';img.loading='lazy';img.addEventListener('error',initials,{once:true});avatar.append(img);}else initials();
  avatar.addEventListener('click',()=>{photoTarget={account:s.account,username:name};$('photo-file').click();});
  const link=document.createElement('a');link.textContent='@'+name;link.href='https://www.instagram.com/'+encodeURIComponent(name)+'/';link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','Abrir perfil @'+name+' no Instagram, em nova aba');
  const arrow=document.createElement('span');arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');link.append(arrow);
  if(profile?.isVerified){const seal=document.createElement('span');seal.textContent=' ✓';seal.title='Selo de verificação informado na coleta';link.append(seal);}
  if(profile?.fullName)link.title=profile.fullName;
  div.append(avatar,link);
  if(profile?.photo){const remove=document.createElement('button');remove.className='remove-photo';remove.textContent='Remover foto';remove.setAttribute('aria-label','Remover foto de referência de @'+name);remove.addEventListener('click',async()=>{remove.disabled=true;try{await saveProfile(s.account,name,{photo:null});notify('Foto de referência removida.');}catch(e){notify(e.message,true);remove.disabled=false;}});div.append(remove);}
  if(filter==='nonmutual'){
    const select=document.createElement('select');select.className='profile-category';select.setAttribute('aria-label','Categoria de @'+name);
    for(const [value,label] of Object.entries(categories))select.add(new Option(label,value));
    select.value=profile?.category||'review';
    select.addEventListener('change',async()=>{select.disabled=true;try{await saveProfile(s.account,name,{category:select.value,categorySource:'manual'});notify('Categoria de @'+name+' salva.');}catch(e){select.value=profile?.category||'review';select.disabled=false;notify(e.message,true);}});
    div.append(select);
    if(profile?.categorySource==='suggestion' && profile.category!=='review'){const hint=document.createElement('small');hint.className='suggestion-label';hint.textContent='Sugestão · confira';div.append(hint);}
    const ignore=document.createElement('button');ignore.type='button';ignore.className='ignore-profile secondary';
    ignore.textContent=profile?.ignored?'Mostrar':'Ignorar';
    ignore.setAttribute('aria-label',(profile?.ignored?'Voltar a mostrar @':'Ignorar @')+name);
    ignore.addEventListener('click',async()=>{ignore.disabled=true;try{await saveProfile(s.account,name,{ignored:!profile?.ignored});notify(profile?.ignored?'@'+name+' voltou à lista.':'@'+name+' foi ignorado nesta lista.');}catch(e){notify(e.message,true);ignore.disabled=false;}});
    div.append(ignore);
  }
  const text=statusText(row);
  if(text){const label=document.createElement('small');label.className='status-label';label.textContent=text;div.append(label);}
  return div;
}
function render(){
  const s=current();$('photo-coverage').textContent='';$('category-tools').hidden=filter!=='nonmutual';$('prepare-local').disabled=!s||filter==='renamed';$('export-csv').disabled=!s;
  if(!s){empty('Seu círculo começa aqui.','Importe seu primeiro arquivo para ver seus seguidores.');$('ignored-note').textContent='';return;}
  const view=analyze(s), {prev,result}=view;
  if(result.nonmutual){for(const option of $('category-filter').options){const count=option.value==='all'?result.nonmutual.length:result.nonmutual.filter(n=>(profiles.get(profileKey(s.account,n))?.category||'review')===option.value).length;option.textContent=(option.value==='all'?'Todas as categorias':categories[option.value])+' ('+count+')';}}
  const hiddenIgnored=result.nonmutual?result.nonmutual.filter(n=>profiles.get(profileKey(s.account,n))?.ignored).length:0;
  $('ignored-note').textContent=filter==='nonmutual'&&!$('show-ignored').checked&&hiddenIgnored?hiddenIgnored+' perfil(is) ignorado(s) oculto(s).':'';
  $('total').textContent=s.followers.length.toLocaleString('pt-BR');
  $('gained').textContent=prev?'+'+result.gained.length:'—';
  $('lost').textContent=prev?result.lost.length:'—';
  $('state').textContent=prev?'Comparação disponível':'Base inicial salva';
  $('comparison').textContent=prev?'Comparando '+dateLabel(prev.date)+' → '+dateLabel(s.date)+' · @'+s.account:'Base inicial de @'+s.account+'. Importe uma exportação mais recente para comparar.';
  for(const b of $('filters').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.filter===filter));
  const visible=visibleList(s,view);
  if(!visible){$('count').textContent='Indisponível';empty(filter==='nonmutual'?'Falta a lista de quem você segue.':'Ainda não há uma consulta anterior.',filter==='nonmutual'?'Importe o ZIP com seguidores e seguindo. Sua lista de seguidores está disponível.':'A primeira consulta é sua referência. Na próxima, mostraremos as mudanças.');return;}
  const query=$('search').value.trim(), withoutPhoto=$('without-photo').checked;
  const photoCount=visible.all.filter(r=>r.profile?.photo).length;
  $('photo-coverage').textContent='Fotos: '+photoCount+' de '+visible.all.length+' nesta lista';
  $('count').textContent=visible.list.length.toLocaleString('pt-BR')+' perfis';
  if(!visible.list.length){empty(query?'Nenhum perfil encontrado.':withoutPhoto&&visible.all.length?'Todos os perfis desta seleção têm foto.':'Nenhum perfil nesta lista.',query?'Tente outro nome de usuário.':'Não há perfis nesta categoria para as consultas selecionadas.');return;}
  const fragment=document.createDocumentFragment();
  for(const row of visible.list.slice(0,limit))fragment.append(buildRow(s,row));
  $('list').replaceChildren(fragment);$('more').hidden=visible.list.length<=limit;
}
async function prepare(file){if(!file||reading)return;reading=true;$('file-info').textContent='Lendo '+file.name+'…';$('import-form').hidden=true;pending=null;try{const parsed=await parseExport(file);pending={...parsed,source:file.name};$('file-info').textContent=parsed.followers.length.toLocaleString('pt-BR')+' seguidores encontrados · '+file.name;$('import-form').hidden=false;const match=file.name.match(/(20\d{2}-\d{2}-\d{2})/);$('date').value=match?.[1]||'';if(parsed.account){$('account').value=parsed.account;$('account').readOnly=true;$('date').value=new Date(parsed.capturedAt).toLocaleDateString('en-CA');}else{$('account').readOnly=false;if(current())$('account').value=current().account;}notify(parsed.following===null?'Arquivo lido. Sem a lista de seguindo. Se a exportação tiver vários arquivos de seguidores, importe o ZIP completo para evitar falsas saídas.':'Arquivo lido. Confira a conta e a data para salvar.');$('account').focus();}catch(e){$('file-info').textContent='Escolha outro arquivo para tentar novamente.';notify(e instanceof SyntaxError?'O JSON está inválido ou incompleto. Baixe a exportação novamente.':e.message,true);}finally{reading=false;$('file').value='';}}
$('file').addEventListener('change',e=>prepare(e.target.files[0]));
$('drop').addEventListener('dragover',e=>{e.preventDefault();$('drop').classList.add('dragover');});$('drop').addEventListener('dragleave',()=>$('drop').classList.remove('dragover'));$('drop').addEventListener('drop',e=>{e.preventDefault();$('drop').classList.remove('dragover');prepare(e.dataTransfer.files[0]);});
$('import-form').addEventListener('submit',async e=>{e.preventDefault();if(!pending||!db)return;const button=e.submitter;button.disabled=true;try{const account=$('account').value.trim().toLowerCase().replace(/^@/,''),date=$('date').value;const now=new Date();const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');if(date>today)throw Error('A data da exportação não pode estar no futuro.');if(snapshots.some(s=>s.account===account && s.date===date))throw Error('Já existe uma consulta dessa conta nesta data. A consulta salva foi preservada.');const s=validateSnapshot({...pending,account,date,id:crypto.randomUUID()});await saveConsultation(s,pending.profiles||[]);pending=null;$('import-form').hidden=true;filter='followers';await reload(s.id);notify('Consulta salva. '+(previous(s)?'A comparação com a consulta anterior está pronta.':'Seu ponto de partida está guardado. Baixe um backup para protegê-lo.'));navigator.storage?.persist?.().catch(()=>{});}catch(err){notify(err.message,true);}finally{button.disabled=false;}});
$('history').addEventListener('change',()=>{limit=pageSize;render();});$('search').addEventListener('input',()=>{limit=pageSize;render();});$('filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(b){filter=b.dataset.filter;limit=pageSize;render();}});$('more').addEventListener('click',()=>{limit+=pageSize;render();});
$('sort').addEventListener('change',()=>{limit=pageSize;render();});
$('page-size').addEventListener('change',e=>{pageSize=e.target.value==='all'?Infinity:Number(e.target.value);limit=pageSize;render();});
$('show-ignored').addEventListener('change',()=>{limit=pageSize;render();});
$('export').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({format:'circulo-v1',snapshots,profiles:[...profiles.values()]},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='circulo-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Backup preparado. Guarde o arquivo em uma pasta segura.');});
$('export-csv').addEventListener('click',()=>{
  try{
    const s=current();if(!s)throw Error('Selecione uma consulta para exportar.');
    const visible=visibleList(s,analyze(s));if(!visible)throw Error('Esta lista ainda não está disponível.');
    if(!visible.list.length)throw Error('Não há perfis nesta lista para exportar.');
    const rows=[['usuario','perfil','lista','situacao','categoria','ignorado','verificado','nome_completo','nome_anterior','confirmado_instagram']];
    for(const r of visible.list)rows.push([r.name,'https://www.instagram.com/'+r.name+'/',FILTER_LABELS[filter],statusText(r),categories[r.profile?.category||'review'],r.profile?.ignored?'sim':'não',r.profile?.isVerified?'sim':'não',r.profile?.fullName||'',r.from||'',r.officialAt?officialDate(r.officialAt):'']);
    const url=URL.createObjectURL(new Blob([toCsv(rows)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
    a.href=url;a.download='circulo-'+filter+'-'+s.account+'-'+s.date+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    notify('CSV preparado com '+visible.list.length+' perfis. Ao abrir no Excel, confira se a coluna de nome não ficou cortada.');
  }catch(error){notify(error.message,true);}
});
$('restore').addEventListener('change',async e=>{const file=e.target.files[0];if(!file||!db)return;try{if(file.size>60000000)throw Error('Backup muito grande. Limite: 60 MB.');const data=JSON.parse(await file.text());if(data.format!=='circulo-v1'||!Array.isArray(data.snapshots)||data.snapshots.length>1000)throw Error('Este não é um backup válido do Círculo.');if(data.profiles!==undefined && (!Array.isArray(data.profiles)||data.profiles.length>500000))throw Error('Perfis inválidos no backup.');const incomingProfiles=(data.profiles||[]).map(validateProfile);const incoming=data.snapshots.map(validateSnapshot),all=[...snapshots];for(const s of incoming){const existing=all.find(x=>x.account===s.account&&x.date===s.date);if(existing){if(JSON.stringify(existing.followers)!==JSON.stringify(s.followers)||JSON.stringify(existing.following)!==JSON.stringify(s.following))throw Error('Há consultas diferentes para a mesma conta e data. Nada foi alterado.');continue;}if(all.some(x=>x.id===s.id))throw Error('Identificador de consulta duplicado no backup.');all.push(s);}const merged=new Map(profiles);for(const p of incomingProfiles)if(!merged.has(p.id))merged.set(p.id,p);await new Promise((resolve,reject)=>{const tx=db.transaction(['snapshots','profiles'],'readwrite');for(const s of all)tx.objectStore('snapshots').put(s);for(const p of merged.values())tx.objectStore('profiles').put(p);tx.oncomplete=resolve;tx.onerror=()=>reject(Error('Não foi possível restaurar. Nada foi alterado.'));tx.onabort=()=>reject(Error('Restauração cancelada. Nada foi alterado.'));});await reload();notify('Backup restaurado. Consultas, fotos e categorias existentes foram preservadas.');}catch(err){notify(err instanceof SyntaxError?'Não foi possível ler este backup. Escolha o arquivo baixado pelo Círculo.':err.message,true);}finally{e.target.value='';}});
$('prepare-local').addEventListener('click',()=>{
  try{
    const selected=current();if(!selected)throw Error('Selecione uma consulta para preparar a coleta.');
    const visible=visibleList(selected,analyze(selected));if(!visible)throw Error('Esta lista ainda não está disponível.');
    const names=visible.all.map(r=>r.name);
    const prepared=makePhotoQueue(selected.account,names,profiles);
    if(!prepared.queue.users.length)throw Error('Não há perfis sem foto com identificador válido nesta seleção.');
    const url=URL.createObjectURL(new Blob([JSON.stringify(prepared.queue)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='fila-'+selected.account+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    notify('Perfis sem foto na fila: '+prepared.queue.users.length+'. Abra o Coletor local e escolha esse arquivo.'+(prepared.skipped?' Identificadores de exportação ignorados: '+prepared.skipped+'.':'')+(prepared.remaining?' Perfis para outro lote após importar estas fotos: '+prepared.remaining+'.':''));
  }catch(error){notify(error.message,true);}
});
$('photos-import').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file||!db)return;
  try{
    const selected=current();if(!selected)throw Error('Salve ou selecione uma consulta antes de importar fotos.');
    if(file.size>12000000)throw Error('Arquivo de fotos muito grande. Limite: 12 MB.');
    const known=new Set(snapshots.filter(s=>s.account===selected.account).flatMap(s=>[...s.followers,...(s.following||[])]));
    const result=mergePhotoImport(JSON.parse(await file.text()),selected.account,profiles,known);
    await stored('readwrite',store=>{for(const p of result.profiles.values())store.put(p);},'profiles');
    profiles=result.profiles;render();
    notify('Fotos adicionadas: '+result.added+'. Fotos existentes preservadas: '+result.kept+'.'+(result.unknown?' Perfis fora do histórico desta conta: '+result.unknown+'.':''));
  }catch(error){notify(error instanceof SyntaxError?'Arquivo de fotos inválido. Use o JSON gerado pelo Coletor local ou pela extensão Círculo.':error.message,true);}
});
async function saveProfile(account,username,changes){
  const id=profileKey(account,username), old=profiles.get(id)||{id,account,username,category:'review',categorySource:'unclassified',photo:null,ignored:false};
  const record=validateProfile({...old,...changes});
  const focusLabel=document.activeElement?.getAttribute('aria-label');await stored('readwrite',store=>store.put(record),'profiles');profiles.set(id,record);render();if(focusLabel){const target=[...$('list').querySelectorAll('[aria-label]')].find(el=>el.getAttribute('aria-label')===focusLabel);(target||$('category-filter')).focus();}
}
$('without-photo').addEventListener('change',()=>{limit=pageSize;render();});
$('category-filter').addEventListener('change',()=>{limit=pageSize;render();});
$('photo-file').addEventListener('change',async e=>{
  const file=e.target.files[0], target=photoTarget;e.target.value='';photoTarget=null;if(!file||!target)return;
  try{
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Escolha uma foto JPG, PNG ou WebP de até 5 MB.');
    notify('Preparando foto de @'+target.username+'…');
    const bitmap=await createImageBitmap(file);
    let photo;
    try{const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,128,128);if(bitmap.width*bitmap.height>40000000)throw Error('A imagem tem resolução muito alta. Escolha uma versão menor.');const side=Math.min(bitmap.width,bitmap.height);ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,128,128);photo=canvas.toDataURL('image/jpeg',0.85);}finally{bitmap.close();}
    await saveProfile(target.account,target.username,{photo});notify('Foto de referência salva. Ela não confirma se a conta está ativa.');
  }catch(err){notify(err.name==='InvalidStateError'?'Não foi possível ler essa imagem. Tente outra foto.':err.message,true);}
});
try{db=await new Promise((resolve,reject)=>{const request=indexedDB.open('circulo-instagram',2);request.onupgradeneeded=()=>{for(const name of ['snapshots','profiles'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'});};request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();notify('Uma nova versão está disponível. Recarregue esta página.',true);};resolve(request.result);};request.onerror=()=>reject(Error('O navegador bloqueou o armazenamento. Abra no navegador normal e permita dados locais.'));request.onblocked=()=>reject(Error('Feche outras abas do Círculo e tente novamente.'));});await reload();}catch(e){notify(e.message,true);$('file').disabled=true;}
