import {collectVisibleProfiles,allowedPhotoUrl} from './collector.mjs';
const $=id=>document.getElementById(id);
let captured=null;
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
async function thumbnail(url) {
  if(!allowedPhotoUrl(url))throw Error('Origem de imagem não permitida.');
  const response=await fetch(url,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(12000)});
  if(!response.ok || !/^image\/(jpeg|png|webp)(;|$)/i.test(response.headers.get('content-type')||''))throw Error('Foto indisponível.');
  const reader=response.body.getReader();const chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>5*1024*1024){await reader.cancel();throw Error('Foto muito grande.');}chunks.push(value);}
  const bitmap=await createImageBitmap(new Blob(chunks));
  try{
    if(bitmap.width*bitmap.height>40000000)throw Error('Resolução muito alta.');
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
    const ctx=canvas.getContext('2d'), side=Math.min(bitmap.width,bitmap.height);
    ctx.fillStyle='white';ctx.fillRect(0,0,128,128);ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,128,128);
    return canvas.toDataURL('image/jpeg',0.85);
  }finally{bitmap.close();}
}
$('capture-form').addEventListener('submit',async event=>{
  event.preventDefault();$('capture').disabled=true;$('download').hidden=true;captured=null;
  try{
    const account=$('account').value.trim().toLowerCase();
    if(!/^[a-z0-9_.]{1,30}$/.test(account))throw Error('Informe sua conta, sem @.');
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const url=new URL(tab?.url||'about:blank');
    if(url.protocol!=='https:' || !['www.instagram.com','instagram.com'].includes(url.hostname))throw Error('Abra a aba do Instagram antes de clicar na extensão.');
    const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:collectVisibleProfiles});
    if(!Array.isArray(result)||!result.length)throw Error('Nenhuma foto ligada a um perfil visível foi encontrada. Abra a lista de seguidores/seguindo e tente novamente.');
    const photos=[];let failed=0;
    for(const [index,profile] of result.entries()){
      status('Capturando '+(index+1)+' de '+result.length+' fotos…');
      try{photos.push({username:profile.username,photo:await thumbnail(profile.url)});}catch{failed++;}
    }
    if(!photos.length)throw Error('Não foi possível baixar as fotos. Recarregue a lista no Instagram e tente novamente.');
    captured={format:'circulo-photos-v1',account,photos};$('download').hidden=false;
    status('Fotos prontas: '+photos.length+'.'+(failed?' Não puderam ser baixadas: '+failed+'.':'')+' Baixe o arquivo antes de fechar.');
  }catch(error){status(error.message,true);}finally{$('capture').disabled=false;}
});
$('download').addEventListener('click',()=>{
  if(!captured)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(captured)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='circulo-fotos-'+captured.account+'.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
