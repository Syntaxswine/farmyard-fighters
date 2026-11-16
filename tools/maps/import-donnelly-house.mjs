// Read immutable Git objects only. Never copy an in-progress donor checkout.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const revision='18e6d5c155a30c645d6bf0fa068a2896bd26768e';
const donor=process.argv[2];
if(!donor)throw Error('Supply the read-only Nautilus Git repository path.');
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=path.join(root,'sites/tactical-animal/dist/mission-art/donnelly-house');
const files=['packages/mount-dora-core/donnelly-layout.js','packages/mount-dora-core/donnelly-furnishing.js','packages/mount-dora-core/donnelly-house.js','docs/projects/donnelly-house/resolved-interior-v1.json','docs/donnelly-interior.md','NOTICE.md'];
const records=[];
for(const file of files){
  const bytes=execFileSync('git',['-C',donor,'show',revision+':'+file],{windowsHide:true});
  const target=path.join(out,'source',file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
  records.push({path:'source/'+file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
}
const provenance={schema:'fighters-donnelly-house/1',repository:'https://github.com/Syntaxswine/nautilus-engine',revision,reviewedMerge:'7e9052dcf6a2aa00c6d38130f5f2345b86ceb593',review:'https://github.com/Syntaxswine/nautilus-engine/pull/65',files:records,policy:'Approved fictional domestic interpretation fitted to the existing Fighters footprint. Original source bytes are retained separately. Fighters owns movement, doors, floors, windows, combat and guards; the donor world/save/controller are not loaded.'};
fs.writeFileSync(path.join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
console.log('Pinned Donnelly house: '+revision+' ('+records.length+' exact source files).');
