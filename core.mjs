export function names(items, following=false) {
  if (!Array.isArray(items)) throw Error('A lista de perfis não está no formato esperado.');
  const result=new Set();
  for (const row of items) {
    const name=following ? row?.title || row?.string_list_data?.[0]?.value : row?.string_list_data?.[0]?.value;
    if (typeof name!=='string' || !/^[a-zA-Z0-9_.]{1,100}$/.test(name)) throw Error('Há um perfil inválido no arquivo. A consulta anterior foi preservada.');
    result.add(name.toLowerCase());
  }
  return [...result].sort();
}
// ids: Map nome de usuário → ID numérico do Instagram (quando conhecido). Sem IDs, não há detecção de renomeados.
export function compare(current, previous, ids=new Map()) {
  const now=new Set(current.followers), before=new Set(previous?.followers || []);
  let lost=previous ? [...before].filter(n=>!now.has(n)) : null;
  let gained=previous ? [...now].filter(n=>!before.has(n)) : null;
  let renamed=null;
  if(previous){
    renamed=[];
    const gainedById=new Map();
    for(const name of gained){const id=ids.get(name);if(id && !gainedById.has(id))gainedById.set(id,name);}
    const usedLost=new Set(), usedGained=new Set();
    for(const name of lost){
      const id=ids.get(name), match=id ? gainedById.get(id) : undefined;
      if(match && !usedGained.has(match)){renamed.push({from:name,to:match});usedLost.add(name);usedGained.add(match);}
    }
    lost=lost.filter(n=>!usedLost.has(n));
    gained=gained.filter(n=>!usedGained.has(n));
  }
  // Quem você segue conta como mútuo se o nome estiver entre os seguidores OU se o ID dele for de um seguidor.
  // Assim, uma troca de nome entre as duas listas não gera falso "não segue de volta".
  const followerIdSet=new Set(Object.values(current.followerIds || {}));
  const idOf=n=>ids.get(n) || current.followingIds?.[n];
  const nonmutual=current.following ? current.following.filter(n=>{
    if(now.has(n))return false;
    const id=idOf(n);
    return !(id && followerIdSet.has(id));
  }) : null;
  return {followers:current.followers, lost, gained, renamed, nonmutual};
}
// Situação de cada saída e entrada usando apenas o histórico já salvo da mesma conta.
// 'returned' em saídas: o perfil reaparece em consulta posterior. Em entradas: já apareceu antes da consulta anterior.
export function classify(current, previous, result, history) {
  const sameAccount=history.filter(s=>s.account===current.account).map(s=>({date:s.date,set:new Set(s.followers)}));
  const lostStatus=new Map((result.lost||[]).map(n=>[n, sameAccount.some(s=>s.date>current.date && s.set.has(n)) ? 'returned' : 'gone']));
  const gainedStatus=new Map((result.gained||[]).map(n=>[n, previous && sameAccount.some(s=>s.date<previous.date && s.set.has(n)) ? 'returned' : 'new']));
  return {lostStatus, gainedStatus};
}
// Células que começam com = + - @ ou tab/CR viram texto, para não serem executadas como fórmula.
export function csvCell(value) {
  let text=String(value ?? '');
  if(/^[=+\-@\t\r]/.test(text)) text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
// Separador ';' e BOM UTF-8: abre com as colunas corretas no Excel em português.
export function toCsv(rows) {
  return '﻿'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
export const categories = {'review':'A revisar', 'personal':'Pessoal', 'artist':'Artista/figura pública', 'brand':'Marca/organização'};
export function profileKey(account, username) { return JSON.stringify([account, username]); }
export function makePhotoQueue(account, usernames, profiles) {
  if(typeof account!=='string'||!/^[a-z0-9_.]{1,30}$/.test(account)||!Array.isArray(usernames))throw Error('Selecione uma consulta válida antes de preparar a coleta.');
  const missing=[...new Set(usernames)].filter(name=>!profiles.get(profileKey(account,name))?.photo);
  const valid=missing.filter(name=>typeof name==='string'&&/^[a-z0-9_.]{1,30}$/.test(name)&&!name.startsWith('__deleted__'));
  return {queue:{format:'circulo-queue-v1',account,users:valid.slice(0,1000)},skipped:missing.length-valid.length,remaining:Math.max(0,valid.length-1000)};
}
export function validateProfile(p) {
  if (!p || typeof p.account!=='string' || !/^[a-z0-9_.]{1,30}$/.test(p.account) || typeof p.username!=='string' || !/^[a-z0-9_.]{1,100}$/.test(p.username) || !Object.hasOwn(categories,p.category)) throw Error('Perfil ou categoria inválida no backup.');
  if (p.photo!==null && (typeof p.photo!=='string' || p.photo.length>100000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(p.photo))) throw Error('Foto inválida no backup. Use imagens adicionadas pelo Círculo.');
  const categorySource=p.categorySource||'manual';
  if(!['manual','suggestion','unclassified'].includes(categorySource))throw Error('Origem da categoria inválida.');
  if(p.ignored!==undefined && typeof p.ignored!=='boolean') throw Error('Marcação de ignorado inválida.');
  const metadata={};
  if(p.instagramId!==undefined){
    if(typeof p.instagramId!=='string'||!/^\d{1,30}$/.test(p.instagramId)||typeof p.fullName!=='string'||p.fullName.length>200||typeof p.isVerified!=='boolean')throw Error('Dados de perfil inválidos.');
    Object.assign(metadata,{instagramId:p.instagramId,fullName:p.fullName,isVerified:p.isVerified});
  }
  return {id:profileKey(p.account,p.username),account:p.account,username:p.username,category:p.category,categorySource,photo:p.photo,ignored:p.ignored===true,...metadata};
}
export function parseSession(data) {
  if(data.complete!==true||typeof data.capturedAt!=='string'||!Number.isFinite(Date.parse(data.capturedAt)))throw Error('Coleta incompleta ou data inválida.');
  const parsed={account:data.account,capturedAt:data.capturedAt,profiles:[]};
  const byName=new Map(), byId=new Map(), followerIds={}, followingIds={};
  for(const kind of ['followers','following']){
    const rows=data[kind];
    if(!Array.isArray(rows)||rows.length>20000||rows.length!==data.counts?.[kind]||new Set(rows.map(u=>u?.id)).size!==rows.length)throw Error('Totais da coleta não conferem.');
    parsed[kind]=rows.map(u=>{
      if(typeof u?.id!=='string')throw Error('Perfil sem identificação na coleta.');
      const p=validateProfile({account:data.account,username:u?.username,instagramId:u?.id,fullName:u?.fullName,isVerified:u?.isVerified,photo:null,category:'review',categorySource:'unclassified'});
      if(byName.has(p.username)&&byName.get(p.username)!==p.instagramId||byId.has(p.instagramId)&&byId.get(p.instagramId)!==p.username)throw Error('Identidades conflitantes na coleta.');
      byName.set(p.username,p.instagramId);byId.set(p.instagramId,p.username);
      parsed.profiles.push(p);if(kind==='followers')followerIds[p.username]=p.instagramId;else followingIds[p.username]=p.instagramId;return p.username;
    });
    if(new Set(parsed[kind]).size!==rows.length)throw Error('Perfis repetidos na coleta.');
  }
  parsed.followerIds=followerIds;
  parsed.followingIds=followingIds;
  parsed.profiles=[...new Map(parsed.profiles.map(p=>[p.id,p])).values()];
  return parsed;
}
export function mergePhotoImport(data, account, existing, known) {
  if(data?.format!=='circulo-photos-v1' || data.account!==account || !Array.isArray(data.photos) || !data.photos.length || data.photos.length>1000) throw Error('Arquivo de fotos inválido ou de outra conta. Selecione uma consulta da conta usada na captura.');
  const merged=new Map(existing), seen=new Set();let added=0, kept=0, unknown=0;
  for(const item of data.photos){
    const candidate=validateProfile({account,username:item?.username,photo:item?.photo,category:'review',categorySource:'unclassified'});
    if(candidate.photo===null || seen.has(candidate.username))throw Error('O arquivo contém fotos vazias ou perfis repetidos.');
    seen.add(candidate.username);
    if(!known.has(candidate.username)){unknown++;continue;}
    const saved=merged.get(candidate.id);
    if(saved?.photo){kept++;continue;}
    merged.set(candidate.id,validateProfile({...candidate,...saved,photo:candidate.photo}));added++;
  }
  return {profiles:merged,added,kept,unknown};
}
export function validateSnapshot(s) {
  if (!s || typeof s.account!=='string' || !/^[a-z0-9_.]{1,30}$/.test(s.account) || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !Number.isFinite(Date.parse(s.date)) || new Date(s.date).toISOString().slice(0,10)!==s.date) throw Error('Conta ou data inválida no backup.');
  for (const field of ['followers','following']) {
    if (field==='following' && s[field]===null) continue;
    if (!Array.isArray(s[field]) || s[field].length>500000 || s[field].some(n=>typeof n!=='string' || !/^[a-z0-9_.]{1,100}$/.test(n)) || new Set(s[field]).size!==s[field].length) throw Error('Lista inválida no backup.');
  }
  if (typeof s.id!=='string' || s.id.length>100 || typeof s.source!=='string' || s.source.length>300) throw Error('Consulta inválida no backup.');
  const snapshot={id:s.id, account:s.account, date:s.date, source:s.source, followers:[...s.followers].sort(), following:s.following===null ? null : [...s.following].sort()};
  if (s.followerIds!==undefined) snapshot.followerIds=validateIds(s.followerIds, snapshot.followers);
  if (s.followingIds!==undefined) {
    if (snapshot.following===null) throw Error('Identificadores de seguindo sem a lista correspondente.');
    snapshot.followingIds=validateIds(s.followingIds, snapshot.following);
  }
  return snapshot;
}
function validateIds(ids, followers) {
  const allowed=new Set(followers);
  if (!ids || typeof ids!=='object' || Array.isArray(ids)) throw Error('Identificadores inválidos no backup.');
  const names=Object.keys(ids);
  if (names.length>followers.length || names.some(n=>!allowed.has(n) || typeof ids[n]!=='string' || !/^\d{1,30}$/.test(ids[n]))) throw Error('Identificadores inválidos no backup.');
  return Object.fromEntries(names.sort().map(n=>[n,ids[n]]));
}
// shortcut: ZIP clássico com arquivos JSON e compressão stored/deflate; ampliar se o Instagram passar a usar ZIP64.
export async function readZip(buffer) {
  const view=new DataView(buffer), bytes=new Uint8Array(buffer), decoder=new TextDecoder();
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) if(view.getUint32(i,true)===0x06054b50 && i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
  if(end<0) throw Error('ZIP inválido ou incompleto. Baixe o arquivo novamente.');
  if(view.getUint16(end+4,true) || view.getUint16(end+6,true)) throw Error('Use um ZIP completo, sem divisão em partes.');
  const count=view.getUint16(end+10,true); let cursor=view.getUint32(end+16,true), expanded=0; const files=[];
  for(let i=0;i<count;i++) {
    if(cursor+46>bytes.length || view.getUint32(cursor,true)!==0x02014b50) throw Error('Não foi possível ler este ZIP.');
    const flags=view.getUint16(cursor+8,true), method=view.getUint16(cursor+10,true), compressed=view.getUint32(cursor+20,true), size=view.getUint32(cursor+24,true), len=view.getUint16(cursor+28,true), extra=view.getUint16(cursor+30,true), comment=view.getUint16(cursor+32,true), offset=view.getUint32(cursor+42,true);
    const path=decoder.decode(bytes.subarray(cursor+46,cursor+46+len)); cursor+=46+len+extra+comment;
    if(!/(?:^|\/)followers(?:_\d+)?\.json$|(?:^|\/)following\.json$/.test(path)) continue;
    expanded+=size;
    if(flags&1 || size>30000000 || expanded>60000000 || offset+30>bytes.length) throw Error('ZIP protegido, muito grande ou incompatível.');
    if(view.getUint32(offset,true)!==0x04034b50) throw Error('Entrada ZIP inválida.');
    const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);
    if(start+compressed>bytes.length) throw Error('ZIP incompleto.');
    let output;
    if(method===0) output=bytes.slice(start,start+compressed);
    else if(method===8) {
      const reader=new Blob([bytes.slice(start,start+compressed)]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const chunks=[];let total=0;
      while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>size || total>30000000){await reader.cancel();throw Error('Arquivo descompactado excede o tamanho permitido.');}chunks.push(value);}
      output=new Uint8Array(total);let pos=0;for(const chunk of chunks){output.set(chunk,pos);pos+=chunk.length;}
    } else throw Error('Compressão não suportada. Extraia o ZIP e importe o JSON dos seguidores.');
    if(output.length!==size) throw Error('Arquivo descompactado está incompleto.');
    files.push({path,data:JSON.parse(decoder.decode(output))});
  }
  return files;
}
export async function parseExport(file) {
  if(file.size>100*1024*1024) throw Error('Escolha um arquivo de até 100 MB.');
  let files;
  if(/\.zip$/i.test(file.name)) files=await readZip(await file.arrayBuffer());
  else if(/\.json$/i.test(file.name)) files=[{path:file.name,data:JSON.parse(await file.text())}];
  else throw Error('Escolha o ZIP ou JSON da exportação do Instagram.');
  if(files.length===1&&files[0].data?.format==='circulo-session-v1')return parseSession(files[0].data);
  const followerFiles=files.filter(f=>/(?:^|\/)followers(?:_\d+)?\.json$/.test(f.path));
  if(!followerFiles.length) throw Error('Não encontrei seguidores. Exporte seguidores e seguindo em formato JSON.');
  const folders=new Set(followerFiles.map(f=>f.path.slice(0,f.path.lastIndexOf('/')+1)));
  if(folders.size!==1) throw Error('O ZIP contém mais de uma lista de contas. Importe uma conta por vez.');
  const numbered=followerFiles.map(f=>/followers_(\d+)\.json$/.exec(f.path)).filter(Boolean).map(m=>Number(m[1])).sort((a,b)=>a-b);
  if(numbered.some((n,i)=>n!==i+1)) throw Error('Faltam partes da lista de seguidores. Importe o ZIP completo.');
  const followers=[...new Set(followerFiles.flatMap(f=>names(f.data)))].sort();
  const followingFile=files.find(f=>f.path===[...folders][0]+'following.json');
  return {followers,following:followingFile ? names(followingFile.data.relationships_following,true) : null};
}
