const assert = require('node:assert/strict');
const {collectList} = require('./session-collector.js');
const user = (id,username) => ({pk:id,username,full_name:username,is_verified:false});
const signal = new AbortController().signal;
const scan = (request,count=2) => collectList(request,'10','followers',count,signal,()=>{},async()=>{});
(async()=>{
  const calls=[];
  const rows=await scan(async path=>{calls.push(path);return calls.length===1?{users:[user(1,'alice')],next_max_id:'next'}:{users:[user(2,'bob')]};});
  assert.equal(rows.length,2);assert.match(calls[1],/max_id=next/);
  await assert.rejects(scan(async()=>({users:[user(1,'alice')]})),/total/);
  await assert.rejects(scan(async()=>({users:[user(1,'alice')],next_max_id:'same'})),/repetiu/);
  await assert.rejects(scan(async()=>({users:[user(1,'bad/name')]})),/inválido/);
  await assert.rejects(scan(async()=>{throw Error('HTTP 429');}),/429/);
  const aborted=new AbortController();aborted.abort();
  await assert.rejects(collectList(()=>assert.fail('não deve consultar'),'10','followers',0,aborted.signal,()=>{},async()=>{}),/cancelada/);
  assert.deepEqual(await scan(async()=>({users:[]}),0),[]);
  console.log('Coletor: paginação, totais, cancelamento e falhas verificados.');
})();
