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
export function compare(current, previous) {
  const now=new Set(current.followers), before=new Set(previous?.followers || []);
  return {followers:current.followers, lost:previous ? [...before].filter(n=>!now.has(n)) : null,
    gained:previous ? [...now].filter(n=>!before.has(n)) : null,
    nonmutual:current.following ? current.following.filter(n=>!now.has(n)) : null};
}
export const categories = {'review':'A revisar', 'personal':'Pessoal', 'artist':'Artista/figura pública', 'brand':'Marca/organização'};
export function profileKey(account, username) { return JSON.stringify([account, username]); }
export function validateProfile(p) {
  if (!p || typeof p.account!=='string' || !/^[a-z0-9_.]{1,30}$/.test(p.account) || typeof p.username!=='string' || !/^[a-z0-9_.]{1,100}$/.test(p.username) || !Object.hasOwn(categories,p.category)) throw Error('Perfil ou categoria inválida no backup.');
  if (p.photo!==null && (typeof p.photo!=='string' || p.photo.length>100000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(p.photo))) throw Error('Foto inválida no backup. Use imagens adicionadas pelo Círculo.');
  const categorySource=p.categorySource||'manual';
  if(!['manual','suggestion','unclassified'].includes(categorySource))throw Error('Origem da categoria inválida.');
  return {id:profileKey(p.account,p.username),account:p.account,username:p.username,category:p.category,categorySource,photo:p.photo};
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
  return {id:s.id, account:s.account, date:s.date, source:s.source, followers:[...s.followers].sort(), following:s.following===null ? null : [...s.following].sort()};
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
