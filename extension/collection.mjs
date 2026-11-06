import {collectSession,readCollectionProgress,stopCollection} from './live.mjs';
import {thumbnail} from './photos.mjs';
import {collectionUsers,exportCollection} from './collection-data.mjs';
import {readAccountCache} from './cache.mjs';
const $=id=>document.getElementById(id);
let db,scan,busy=false,stopped=false,tabId;
const status=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
const openDB=()=>new Promise((resolve,reject)=>{const request=indexedDB.open('circulo-collection',1);request.onupgradeneeded=()=>{request.result.createObjectStore('scans',{keyPath:'account'});request.result.createObjectStore('photos',{keyPath:'key'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Não foi possível abrir o progresso guardado.'));});
function stored(store,mode,action){return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);let request;try{request=action(tx.objectStore(store));}catch(error){tx.abort();reject(error);return;}tx.oncomplete=()=>resolve(request?.result);tx.onabort=tx.onerror=()=>reject(Error('O armazenamento falhou. As fotos anteriores foram preservadas. Baixe sua consulta antes de continuar.'));});}
async function photosMap(){return new Map((await stored('photos','readonly',s=>s.getAll())).map(p=>[p.key,p]));}
async function showResult(){
  $('result').hidden=!scan;if(!scan)return;
  const photos=await photosMap(),users=collectionUsers(scan),saved=users.filter(u=>photos.has(scan.account+':'+u.id)).length;
  $('account').textContent='@'+scan.account;
  $('summary').textContent=`${scan.followers.length} seguidores · ${scan.following.length} seguindo · ${saved} de ${users.length} fotos guardadas. Consulta de ${new Date(scan.capturedAt).toLocaleString('pt-BR')}.`;
  $('photos').hidden=saved===users.length;
}
function setBusy(value){busy=value;$('start').disabled=value;$('photos').disabled=value;$('download').disabled=value;$('stop').hidden=!value;}
async function fetchPhotos(){
  const users=collectionUsers(scan),photos=await photosMap(),legacy=readAccountCache(await chrome.storage.local.get(null),scan.account);
  const old=new Map(legacy.map(p=>[p.username,p.photo]));
  let failed=0,consecutive=0;
  $('progress').hidden=false;$('progress').max=Math.max(users.length,1);$('progress').value=0;
  for(const [index,user] of users.entries()){
    if(stopped)break;
    const key=scan.account+':'+user.id;
    if(!photos.has(key)){
      let photo=old.get(user.username);
      if(!photo&&user.photoUrl){try{photo=await thumbnail(user.photoUrl);consecutive=0;}catch{failed++;consecutive++;}}
      if(photo){const record={key,photo,username:user.username};await stored('photos','readwrite',s=>s.put(record));photos.set(key,record);}
    }
    $('progress').value=index+1;
    status(`Buscando fotos: ${index+1} de ${users.length}. Você pode parar e continuar depois.`);
    if(consecutive>=3){status('Algumas fotos ficaram indisponíveis. A busca parou; suas listas e fotos concluídas estão guardadas.',true);break;}
    if(index%10===0)await showResult();
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  await showResult();
  if(consecutive<3)status(stopped?'Progresso guardado. Você pode baixar agora ou continuar as fotos depois.':failed?`Listas prontas. ${failed} fotos não puderam ser baixadas; isso não indica conta desativada.`:'Tudo pronto para baixar e importar no Círculo. Fotos ausentes podem ser tentadas em outro momento.');
}
async function exclusive(action){
  if(busy||!db)return;
  await navigator.locks.request('circulo-collection',{ifAvailable:true},async lock=>{
    if(!lock){status('Há uma coleta aberta em outra aba da extensão. Continue por ela.');return;}
    stopped=false;setBusy(true);
    try{await action();}catch(error){status(error.message+' A última consulta completa continua disponível.',true);}
    finally{setBusy(false);await showResult();}
  });
}
$('start').onclick=()=>exclusive(async()=>{
  const requested=new URL(location.href).searchParams.get('tab');
  const tabs=await chrome.tabs.query({});
  const tab=tabs.find(t=>String(t.id)===requested&&/^https:\/\/(www\.)?instagram\.com\//.test(t.url||''))||tabs.find(t=>/^https:\/\/(www\.)?instagram\.com\//.test(t.url||''));
  if(!tab)throw Error('Abra o Instagram conectado, clique na extensão e escolha Coletar conexões.');
  tabId=tab.id;status('Conectando ao Instagram…');$('progress').hidden=true;
  let polling=false;
  const timer=setInterval(async()=>{
    if(polling)return;polling=true;
    try{const [r]=await chrome.scripting.executeScript({target:{tabId},func:readCollectionProgress});if(r?.result?.message)status(r.result.message);}catch{}finally{polling=false;}
  },1000);
  let result;
  try{const [r]=await chrome.scripting.executeScript({target:{tabId},func:collectSession});if(r?.error)throw Error(r.error.message||'O Instagram interrompeu a coleta.');result=r?.result;}finally{clearInterval(timer);}
  if(stopped){status('Coleta interrompida. A consulta anterior foi preservada.');return;}
  if(!result?.complete)throw Error('A coleta não terminou. Mantenha a aba do Instagram aberta e confira os avisos no site.');
  // Save only after both lists are complete; interrupted scans never replace the baseline.
  await stored('scans','readwrite',s=>s.put(result));scan=result;
  await chrome.storage.local.set({lastCollectionAccount:scan.account});await showResult();await fetchPhotos();
});
$('stop').onclick=async()=>{stopped=true;status('Parando… As fotos concluídas serão mantidas.');if(tabId)try{await chrome.scripting.executeScript({target:{tabId},func:stopCollection});}catch{}};
$('photos').onclick=()=>exclusive(fetchPhotos);
$('download').onclick=async()=>{
  try{
    const {data,omitted}=exportCollection(scan,await photosMap()),text=JSON.stringify(data);
    if(new Blob([text]).size>90000000)throw Error('A consulta ficou grande demais. Use a exportação oficial e importe as fotos em lotes.');
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download=`circulo-consulta-${scan.account}-${scan.capturedAt.slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    status(omitted?'Consulta baixada. Algumas fotos ficaram fora do arquivo pelo limite de tamanho; continuam guardadas na extensão.':'Arquivo preparado. No Círculo, importe em “Escolher arquivo do Instagram”.');
  }catch(error){status(error.message,true);}
};
try{db=await openDB();const {lastCollectionAccount}=await chrome.storage.local.get('lastCollectionAccount');if(lastCollectionAccount)scan=await stored('scans','readonly',s=>s.get(lastCollectionAccount));await showResult();$('start').disabled=false;}catch(error){$('start').disabled=true;status(error.message,true);}
