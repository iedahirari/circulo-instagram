import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {parseExport,compare} from './core.mjs';
const path=process.argv[2];
if(!path)throw Error('Informe o caminho de uma exportação ZIP.');
const result=await parseExport(new File([await readFile(path)],'export.zip'));
assert.equal(new Set(result.followers).size,result.followers.length);
const diff=compare(result,result);assert.equal(diff.lost.length,0);assert.equal(diff.gained.length,0);
console.log(JSON.stringify({followers:result.followers.length,following:result.following?.length,nonmutual:diff.nonmutual?.length}));
