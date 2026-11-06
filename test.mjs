import assert from 'node:assert/strict';
import {names,compare,classify,csvCell,toCsv,parseRecentUnfollows,validateSnapshot,parseExport,validateProfile,profileKey,mergePhotoImport,makePhotoQueue} from './core.mjs';
assert.deepEqual(names([{string_list_data:[{value:'Alice'}]},{string_list_data:[{value:'alice'}]}]),['alice']);
assert.throws(()=>names([{string_list_data:[{value:'<script>'}]}]));
assert.deepEqual(compare({followers:['b','c'],following:['a','b']},{followers:['a','b']}),{followers:['b','c'],lost:['a'],gained:['c'],renamed:[],nonmutual:['a']});
// Renomeados: mesmo ID com nome novo não é saída nem entrada.
const sameId=new Map([['old','1'],['new','1'],['gone','2']]);
const renamedDiff=compare({followers:['new'],following:null},{followers:['old','gone']},sameId);
assert.deepEqual(renamedDiff.renamed,[{from:'old',to:'new'}]);
assert.deepEqual(renamedDiff.lost,['gone']);
assert.deepEqual(renamedDiff.gained,[]);
assert.deepEqual(compare({followers:['new'],following:null},{followers:['old']}).renamed,[],'sem IDs não há renomeado');
assert.equal(compare({followers:['new'],following:null},{followers:['old']}).lost[0],'old');
// Classificação pelo histórico já salvo.
const hist=[
  {account:'ieda',date:'2026-01-01',followers:['x','old']},
  {account:'ieda',date:'2026-02-01',followers:['x']},
  {account:'ieda',date:'2026-03-01',followers:['x','back']},
  {account:'outra',date:'2026-04-01',followers:['lost']}
];
const cur={account:'ieda',date:'2026-03-01',followers:['x','back']}, prevSnap=hist[1];
const diffHist=compare(cur,prevSnap);
assert.deepEqual(diffHist.gained,['back']);
const statusCase=classify(cur,prevSnap,diffHist,hist);
assert.equal(statusCase.gainedStatus.get('back'),'new');
const lostCase=classify({account:'ieda',date:'2026-02-01',followers:['x']},hist[0],compare({account:'ieda',date:'2026-02-01',followers:['x']},hist[0]),hist);
assert.equal(lostCase.lostStatus.get('old'),'gone');
const returnedHist=[{account:'ieda',date:'2026-01-01',followers:['x','y']},{account:'ieda',date:'2026-02-01',followers:['x']},{account:'ieda',date:'2026-03-01',followers:['x','y']}];
const returnedNow={account:'ieda',date:'2026-02-01',followers:['x']};
assert.equal(classify(returnedNow,returnedHist[0],compare(returnedNow,returnedHist[0]),returnedHist).lostStatus.get('y'),'returned');
const backHist=[{account:'ieda',date:'2025-12-01',followers:['z']},{account:'ieda',date:'2026-01-01',followers:[]},{account:'ieda',date:'2026-02-01',followers:['z']}];
assert.equal(classify(backHist[2],backHist[1],compare(backHist[2],backHist[1]),backHist).gainedStatus.get('z'),'returned');
// CSV: células perigosas viram texto e aspas são escapadas.
assert.equal(csvCell('=1+1'),'"\'=1+1"');
assert.equal(csvCell('a"b'),'"a""b"');
assert.equal(csvCell(null),'""');
assert.equal(toCsv([['a','b']]),'﻿"a";"b"\r\n');
assert.equal(compare({followers:[],following:null}).lost,null);
assert.equal(compare({followers:[],following:null}).nonmutual,null);
const valid={id:'1',account:'ieda',date:'2026-11-04',source:'test.zip',followers:['a'],following:null};
assert.equal(validateSnapshot(valid).account,'ieda');
assert.throws(()=>validateSnapshot({...valid,date:'2026-02-31'}));
assert.throws(()=>validateSnapshot({...valid,followers:['a','a']}));
assert.throws(()=>validateSnapshot({...valid,followers:['javascript:alert(1)']}));
await assert.rejects(parseExport(new File(['{}'],'following.json')),/seguidores/);
await assert.rejects(parseExport(new File(['bad'],'followers_1.json')));
const profile={account:'ieda',username:'alice',category:'artist',photo:null};
assert.equal(validateProfile(profile).id,profileKey('ieda','alice'));
assert.throws(()=>validateProfile({...profile,category:'verified'}));
assert.throws(()=>validateProfile({...profile,photo:'https://example.com/photo.jpg'}));
assert.throws(()=>validateProfile({...profile,photo:'data:image/svg+xml;base64,PHN2Zz4='}));
assert.throws(()=>validateProfile({...profile,photo:'data:image/jpeg;base64,'+'a'.repeat(100001)}));
assert.equal(validateProfile({...profile,photo:'data:image/jpeg;base64,/9j/'}).photo,'data:image/jpeg;base64,/9j/');
assert.notEqual(profileKey('outra','alice'),profileKey('ieda','alice'));
const captured={format:'circulo-photos-v1',account:'ieda',photos:[{username:'alice',photo:'data:image/jpeg;base64,/9j/'}]};
const prior=new Map([[profileKey('ieda','alice'),validateProfile(profile)]]);
const merged=mergePhotoImport(captured,'ieda',prior,new Set(['alice']));
assert.equal(merged.added,1);
assert.equal(merged.profiles.get(profileKey('ieda','alice')).category,'artist');
assert.equal(mergePhotoImport(captured,'ieda',merged.profiles,new Set(['alice'])).kept,1);
assert.equal(mergePhotoImport(captured,'ieda',new Map(),new Set()).unknown,1);
assert.throws(()=>mergePhotoImport(captured,'outra',prior,new Set(['alice'])));
assert.throws(()=>mergePhotoImport({...captured,photos:[...captured.photos,...captured.photos]},'ieda',prior,new Set(['alice'])));
assert.throws(()=>mergePhotoImport({...captured,photos:[{username:'alice',photo:'https://example.com/photo.jpg'}]},'ieda',prior,new Set(['alice'])));
const queue=makePhotoQueue('ieda',['alice','bob','bob','__deleted__conta'],merged.profiles);
assert.deepEqual(queue.queue.users,['bob']);
assert.equal(queue.skipped,1);
assert.equal(makePhotoQueue('ieda',Array.from({length:1001},(_,i)=>'user'+i),new Map()).remaining,1);
assert.equal(makePhotoQueue('ieda',Array.from({length:1001},(_,i)=>'user'+i),new Map()).queue.users.length,1000);
assert.throws(()=>makePhotoQueue('../ieda',[],new Map()));
// Ignorados: padrão falso, aceita só booleano.
assert.equal(validateProfile(profile).ignored,false);
assert.equal(validateProfile({...profile,ignored:true}).ignored,true);
assert.throws(()=>validateProfile({...profile,ignored:'sim'}));
// Identificadores do snapshot: opcionais, mas precisam pertencer a seguidores válidos.
const withIds={id:'2',account:'ieda',date:'2026-11-04',source:'s.json',followers:['a','b'],following:null,followerIds:{a:'10',b:'11'}};
assert.deepEqual(validateSnapshot(withIds).followerIds,{a:'10',b:'11'});
assert.equal(validateSnapshot(valid).followerIds,undefined);
assert.throws(()=>validateSnapshot({...withIds,followerIds:{c:'12'}}));
assert.throws(()=>validateSnapshot({...withIds,followerIds:{a:'x1'}}));
assert.throws(()=>validateSnapshot({...withIds,followerIds:['10']}));
// Não segue de volta por ID: nome diferente entre as listas, mesmo ID, continua mútuo.
const mutualById=compare({followers:['ann','novo'],following:['ann','velho'],followerIds:{ann:'1',novo:'7'}},{followers:['ann']},new Map([['velho','7']]));
assert.deepEqual(mutualById.nonmutual,[]);
const oneWay=compare({followers:['ann'],following:['ann','solo'],followerIds:{ann:'1'},followingIds:{solo:'8'}},{followers:['ann']},new Map());
assert.deepEqual(oneWay.nonmutual,['solo']);
const validIds={id:'3',account:'ieda',date:'2026-11-04',source:'s.json',followers:['a'],following:['a','b'],followerIds:{a:'10'},followingIds:{a:'10',b:'11'}};
assert.deepEqual(validateSnapshot(validIds).followingIds,{a:'10',b:'11'});
assert.throws(()=>validateSnapshot({...validIds,followingIds:{z:'1'}}));
assert.throws(()=>validateSnapshot({...validIds,following:null}));
// Coleta de sessão: a leitura guarda o ID de cada seguidor.
const sessionFile=new File([JSON.stringify({format:'circulo-session-v1',account:'ieda',capturedAt:'2026-11-05T10:00:00Z',complete:true,counts:{followers:1,following:0},followers:[{id:'123',username:'alice',fullName:'Alice',isVerified:false}],following:[]})],'session.json');
const session=await parseExport(sessionFile);
assert.deepEqual(session.followerIds,{alice:'123'});
assert.deepEqual(session.followers,['alice']);
// Saídas que o Instagram registra: rótulo com codificação quebrada, timestamp em segundos, último registro vence.
const unf=parseRecentUnfollows([
  {timestamp:1762000000,label_values:[{label:'Nome de usuÃ¡rio',value:'Old_User'},{label:'URL',value:'https://x'}]},
  {timestamp:1762500000,label_values:[{label:'Nome de usuÃ¡rio',value:'old_user'}]},
  {timestamp:1761000000,label_values:[{label:'Nome de usuÃ¡rio',value:'other'}]}
]);
assert.deepEqual(unf,[{username:'old_user',timestamp:1762500000},{username:'other',timestamp:1761000000}]);
assert.throws(()=>parseRecentUnfollows([{timestamp:1,label_values:[{label:'Nome de usuÃ¡rio',value:'bad name'}]}]));
assert.throws(()=>parseRecentUnfollows([{timestamp:'x',label_values:[{label:'Nome de usuÃ¡rio',value:'ok'}]}]));
assert.throws(()=>parseRecentUnfollows([{timestamp:1,label_values:[{label:'URL',value:'ok'}]}]));
assert.deepEqual(validateSnapshot({...valid,recentUnfollows:unf}).recentUnfollows,unf);
assert.equal(validateSnapshot({...valid,recentUnfollows:null}).recentUnfollows,undefined);
assert.throws(()=>validateSnapshot({...valid,recentUnfollows:[{username:'x y',timestamp:1}]}));
console.log('Verificações passaram.');
