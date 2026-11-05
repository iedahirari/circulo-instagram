export const CACHE_PREFIX='circulo-photo:';
export const CACHE_LIMIT=8*1024*1024;
export const ACCOUNT_LIMIT=1000;
export function cacheKey(account,username){
  if(typeof account!=='string'||typeof username!=='string'||!/^[a-z0-9_.]{1,30}$/.test(account)||!/^[a-z0-9_.]{1,30}$/.test(username))throw Error('Conta ou perfil inválido.');
  return CACHE_PREFIX+account+':'+username;
}
export function readAccountCache(entries,account){
  if(typeof account!=='string'||!/^[a-z0-9_.]{1,30}$/.test(account))return [];
  const prefix=CACHE_PREFIX+account+':';
  return Object.entries(entries).filter(([key,value])=>key.startsWith(prefix)&&value&&typeof value.username==='string'&&/^[a-z0-9_.]{1,30}$/.test(value.username)&&key===cacheKey(account,value.username)&&typeof value.photo==='string'&&value.photo.length<=100000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.photo)).map(([,value])=>({username:value.username,photo:value.photo})).sort((a,b)=>a.username.localeCompare(b.username));
}
export function makePhotoExport(entries,account){
  const photos=readAccountCache(entries,account);
  if(!photos.length)throw Error('Ainda não há fotos guardadas nesta conta.');
  if(photos.length>ACCOUNT_LIMIT)throw Error('A captura excede o limite de perfis por arquivo.');
  return {format:'circulo-photos-v1',account,photos};
}
