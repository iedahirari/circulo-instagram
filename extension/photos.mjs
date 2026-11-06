import {allowedPhotoUrl} from './collector.mjs';
export async function thumbnail(url) {
  if(!allowedPhotoUrl(url))throw Error('Origem de imagem não permitida.');
  const response=await fetch(url,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(12000)});
  if(!response.ok||!/^image\/(jpeg|png|webp)(;|$)/i.test(response.headers.get('content-type')||''))throw Error('Foto indisponível.');
  const reader=response.body.getReader(),chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>5*1024*1024){await reader.cancel();throw Error('Foto muito grande.');}chunks.push(value);}
  const bitmap=await createImageBitmap(new Blob(chunks));
  try{
    if(bitmap.width*bitmap.height>40000000)throw Error('Resolução muito alta.');
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
    const ctx=canvas.getContext('2d'),side=Math.min(bitmap.width,bitmap.height);
    ctx.fillStyle='white';ctx.fillRect(0,0,128,128);ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,128,128);
    return canvas.toDataURL('image/jpeg',0.85);
  }finally{bitmap.close();}
}
