export function collectionUsers(scan){return [...new Map([...scan.followers,...scan.following].map(u=>[u.id,u])).values()];}
export function exportCollection(scan,photos){
  if(scan?.format!=='circulo-session-v1'||scan.complete!==true||!['followers','following'].every(k=>Array.isArray(scan[k])&&scan[k].length===scan.counts?.[k]))throw Error('A consulta ainda não está completa.');
  let bytes=0,omitted=0;
  const enriched=new Map();
  for(const user of collectionUsers(scan)){
    const {photoUrl,...row}=user,photo=photos.get(scan.account+':'+user.id)?.photo;
    if(typeof photo==='string'&&photo.length<=100000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)){
      if(bytes+photo.length<=30000000){row.photo=photo;bytes+=photo.length;}else omitted++;
    }
    enriched.set(user.id,row);
  }
  // Each mutual appears in both lists; the photo budget leaves room for that duplication.
  const data={...scan,followers:scan.followers.map(u=>enriched.get(u.id)),following:scan.following.map(u=>enriched.get(u.id))};
  return {data,omitted};
}
