// The frozen AFT validator is a baseline, not a claim that it adopts wallRuns.
// Exact pinned Nautilus extension/import QA belongs to the workshop handoff.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateMap,parseMap} from '../../sites/tactical-animal/dist/designer/a20b343a0234/tactics/core/maps.js';
const projectURL=new URL('../../maps/mount-dora/',import.meta.url);
const project=JSON.parse(fs.readFileSync(new URL('project.json',projectURL)));
let ready=0,refused=0;
for(const sector of project.sectors){
  const text=fs.readFileSync(new URL(sector.file,projectURL),'utf8'),map=JSON.parse(text);
  const errors=validateMap(map);
  if(sector.nativeImport.ready){
    assert.deepEqual(errors,[],sector.id);
    const parsed=parseMap(text,{allowDisconnected:true});
    assert.deepEqual(parsed.mountDora,map.mountDora,sector.id+' source metadata roundtrip');
    assert.deepEqual(parsed.wallRuns,map.wallRuns,sector.id+' wall extension preserved');
    ready++;
  }else{
    assert.deepEqual(errors,['Place exactly four valid squad starts.'],sector.id);
    assert.throws(()=>parseMap(text,{allowDisconnected:true}),/Place exactly four valid squad starts/);
    assert.equal(map.terrain.flat().every(t=>t==='water'),true,sector.id+' no fabricated preview floor');
    refused++;
  }
}
console.log(JSON.stringify({ready,refused,scope:'Frozen AFT native map baseline only; Nautilus wall-aware closure QA is separate.'}));
