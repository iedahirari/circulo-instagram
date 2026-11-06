import assert from 'node:assert/strict';
import vm from 'node:vm';
import {collectSession} from './live.mjs';
import {collectionUsers,exportCollection} from './collection-data.mjs';
const user={pk:2,username:'alice',full_name:'Alice',is_verified:true,is_private:false,profile_pic_url:'https://scontent.cdninstagram.com/a.jpg'};
async function run({incomplete=false,rate=false,changed=false,repeat=false}={}){
  const paths=[],doc={cookie:'ds_user_id=1'},context={document:doc,URL,URLSearchParams,AbortSignal,setTimeout:fn=>{fn();}};
  context.fetch=async(path,options)=>{
    paths.push(path);assert.equal(options.credentials,'same-origin');assert.equal(options.method,undefined);
    const response=body=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>body});
    if(path.includes('current_user'))return response({status:'ok',user:{pk:1,username:'ieda'}});
    if(path.includes('web_profile_info'))return response({status:'ok',data:{user:{id:'1',username:'ieda',edge_follow:{count:1},edge_followed_by:{count:1}}}});
    if(changed)doc.cookie='ds_user_id=9';
    if(rate)return {ok:false,status:429};
    return response({status:'ok',users:incomplete?[]:[user],...(repeat?{next_max_id:'again'}:{})});
  };
  const ctx=vm.createContext(context);
  try{return {scan:await vm.runInContext('('+collectSession.toString()+')()',ctx),paths};}
  catch(error){error.paths=paths;throw error;}
}
const {scan,paths}=await run();
assert.equal(scan.complete,true);assert.equal(scan.account,'ieda');assert.equal(scan.followers[0].isPrivate,false);
assert.equal(paths.length,5);assert.equal(collectionUsers(scan).length,1);
const photos=new Map([['ieda:2',{photo:'data:image/jpeg;base64,/9j/'}]]);
const exported=exportCollection(scan,photos);
assert.equal(exported.data.followers[0].photo,'data:image/jpeg;base64,/9j/');
assert.equal(exported.data.followers[0].photoUrl,undefined);
assert.equal(exportCollection({...scan,account:'other'},photos).data.followers[0].photo,undefined);
assert.throws(()=>exportCollection({...scan,complete:false},photos),/completa/);
await assert.rejects(run({incomplete:true}),/Faltam/);
await assert.rejects(run({repeat:true}),/repetiu/);
await assert.rejects(run({changed:true}),/sessão mudou/);
await assert.rejects(run({rate:true}),error=>error.message.includes('limitou')&&error.paths.length===3);
console.log('Coleta integrada: sessão, listas completas, restrições e exportação com fotos verificadas.');
