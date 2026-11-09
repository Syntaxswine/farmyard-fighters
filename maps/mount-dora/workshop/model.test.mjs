import {test} from 'node:test';
import assert from 'node:assert/strict';
import {grid,neighbors,readiness,sectorFile,NAUTILUS_COMMIT} from './model.js';
import {sourceChanges,addedPaths} from '../../../tools/review-mount-dora-workshop.mjs';
const a={id:'a',row:0,column:0,origin:{x:0,y:0},file:'sectors/a.json'},b={id:'b',row:0,column:1,origin:{x:240,y:0},file:'sectors/b.json'};
const p={columns:2,rows:1,sectorSize:240,sectors:[b,a]};
test('geographic placement and neighbors follow sector coordinates',()=>{assert.deepEqual(grid(p),[a,b]);assert.deepEqual(neighbors(p,a),[{direction:'east',sector:b}]);assert.throws(()=>grid({...p,sectors:[a,a]}),/duplicate/);});
test('readiness is tied to exact source bytes and reviewed engine revision',()=>{const report={nautilusCommit:NAUTILUS_COMMIT,sectors:[{id:'a',file:a.file,sha256:'same',nativeReady:true,errors:[]}]};assert(readiness(report,a,'same').ready);assert(!readiness(report,a,'changed').ready);assert(!readiness({...report,nautilusCommit:'moving'},a,'same').ready);assert(!readiness({...report,sectors:[{...report.sectors[0],nativeReady:false,errors:['water']}]},a,'same').ready);});
test('project JSON paths cannot escape or address another origin',()=>{for(const path of ['../secret.json','/secret.json','https://x/a.json','a/../b.json','a/%2e%2e/b.json','a\\b.json'])assert.throws(()=>sectorFile(path));assert.equal(sectorFile('sectors/md-r02-c03.json'),'sectors/md-r02-c03.json');});
test('round-trip inspection catches unknown nested source losses without a field whitelist',()=>{const a={metadata:{source:[{id:'osm:1',geometry:[1.25,2.5]}]},custom:{keep:true}};assert.equal(sourceChanges(a,structuredClone(a)).length,0);const changed=structuredClone(a);delete changed.custom;changed.metadata.source[0].geometry[1]=3;assert.deepEqual(sourceChanges(a,changed).map(r=>r.path),['$.metadata.source.0.geometry.1','$.custom']);assert.deepEqual(addedPaths(a,{...a,extra:{native:true}}),['$.extra']);});

test('landmark selection uses projected points and cross-boundary source geometry',async()=>{
  const {landmarksFor}=await import('./model.js');
  const project={...p,landmarks:[{label:'Park',source:{type:'way',id:1}},{label:'Beacon',townMetres:{x:240,y:10}}]};
  const features=[{osm:{type:'way',id:1},bounds:[230,0,250,20]}];
  assert.deepEqual(landmarksFor(project,a,features),['Park']);
  assert.deepEqual(landmarksFor(project,b,features),['Beacon','Park']);
});
