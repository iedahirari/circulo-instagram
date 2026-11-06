import {collectVisibleProfiles} from './collector.mjs';
import {thumbnail} from './photos.mjs';
import {CACHE_PREFIX,CACHE_LIMIT,ACCOUNT_LIMIT,cacheKey,readAccountCache,makePhotoExport} from './cache.mjs';
const $=id=>document.getElementById(id);
let entries={}, visible=[], busy=false, clearArmed=false, ready=false;
function account(){return $('account').value.trim().toLowerCase();}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function update(){
  const photos=readAccountCache(entries,account()),saved=new Set(photos.map(p=>p.username));
  $('saved-count').textContent=photos.length;
  $('missing-count').textContent=visible.length?visible.filter(p=>!saved.has(p.username)).length:'—';
  $('download').hidden=!photos.length;$('clear').hidden=!photos.length;
  $('capture').disabled=busy||!ready;$('account').disabled=busy;$('clear').disabled=busy;
}
function disarmClear(){clearArmed=false;$('clear').textContent='Limpar capturas desta conta';}
$('account').addEventListener('input',()=>{visible=[];disarmClear();update();});
$('capture-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!ready)return;
  busy=true;disarmClear();update();$('progress').hidden=false;$('progress').value=0;$('progress').max=1;
  try{
    const owner=account();
    if(!/^[a-z0-9_.]{1,30}$/.test(owner))throw Error('Informe sua conta, sem @.');
    entries=await chrome.storage.local.get(null);
    await chrome.storage.local.set({lastAccount:owner});
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const url=new URL(tab?.url||'about:blank');
    if(url.protocol!=='https:' || !['www.instagram.com','instagram.com'].includes(url.hostname))throw Error('Abra a aba do Instagram antes de clicar na extensão.');
    const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:collectVisibleProfiles});
    visible=Array.isArray(result)?result:[];
    if(!visible.length)throw Error('Nenhuma foto ligada a um perfil visível foi encontrada. Abra a lista de seguidores/seguindo e tente novamente.');
    const saved=new Set(readAccountCache(entries,owner).map(p=>p.username));
    const pending=visible.filter(p=>!saved.has(p.username));
    $('progress').max=Math.max(1,pending.length);
    let added=0,failed=0;
    for(const [index,profile] of pending.entries()){
      if(saved.size>=ACCOUNT_LIMIT)throw Error('Limite de 1.000 fotos nesta conta. Baixe o arquivo e limpe as capturas para continuar.');
      status('Capturando '+(index+1)+' de '+pending.length+' fotos novas…');
      let photo;
      try{photo=await thumbnail(profile.url);}catch{failed++;$('progress').value=index+1;continue;}
      const key=cacheKey(owner,profile.username),record={username:profile.username,photo};
      const bytes=await chrome.storage.local.getBytesInUse(null);
      if(bytes+new TextEncoder().encode(JSON.stringify({[key]:record})).length>CACHE_LIMIT)throw Error('O espaço de capturas está cheio. Baixe suas fotos e limpe as capturas de uma conta para continuar.');
      // Save each photo before counting it, so closing the popup keeps completed work.
      await chrome.storage.local.set({[key]:record});
      entries[key]=record;saved.add(profile.username);added++;$('progress').value=index+1;update();
    }
    $('progress').value=$('progress').max;
    status(pending.length?'Fotos novas guardadas: '+added+'.'+(failed?' Não puderam ser baixadas: '+failed+'. Tente novamente com a lista recarregada.':' Role a lista e capture novamente para acrescentar outros perfis.'):'Todos os perfis reconhecidos nesta parte da lista já têm foto guardada. Role a lista para continuar.');
  }catch(error){status(error.message+' As fotos já guardadas continuam disponíveis.',true);}
  finally{busy=false;update();}
});
$('download').addEventListener('click',()=>{
  try{
    const payload=makePhotoExport(entries,account());
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='circulo-fotos-'+payload.account+'.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    disarmClear();status('Arquivo preparado com '+payload.photos.length+' fotos. Importe no Círculo; as capturas continuam guardadas aqui.');
  }catch(error){status(error.message,true);}
});
$('clear').addEventListener('click',async()=>{
  if(busy)return;
  if(!clearArmed){clearArmed=true;$('clear').textContent='Confirmar limpeza desta conta';status('Baixe o arquivo antes de limpar. Isso apaga apenas as capturas desta conta na extensão; suas fotos no aplicativo não serão alteradas.');return;}
  busy=true;update();
  try{
    const owner=account(),all=await chrome.storage.local.get(null),prefix=CACHE_PREFIX+owner+':';
    const keys=Object.keys(all).filter(key=>key.startsWith(prefix));
    await chrome.storage.local.remove(keys);for(const key of keys)delete all[key];entries=all;visible=[];
    status('Capturas desta conta removidas da extensão.');disarmClear();
  }catch(error){status('Não foi possível limpar: '+error.message,true);}finally{busy=false;update();}
});
try{
  entries=await chrome.storage.local.get(null);
  if(typeof entries.lastAccount==='string'&&/^[a-z0-9_.]{1,30}$/.test(entries.lastAccount))$('account').value=entries.lastAccount;
  ready=true;update();
  if(readAccountCache(entries,account()).length)status('Suas fotos guardadas estão disponíveis. Abra a lista no Instagram e capture para continuar.');
}catch(error){$('capture').disabled=true;status('Não foi possível abrir as capturas guardadas. Abra este painel pela extensão instalada no Chrome e confira se ela está atualizada.',true);}

$('collect-all').addEventListener('click',async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.tabs.create({url:chrome.runtime.getURL('collection.html')+'?tab='+encodeURIComponent(tab?.id||'')});});
