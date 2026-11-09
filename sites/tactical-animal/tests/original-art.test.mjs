import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {createCargoLibrary} from '../dist/aft/tactics/painted-cargo.js';
import {groundSurface,wallKnown,foregroundWall} from '../dist/original-art.js';
import {createSoloGame,hero,geometry} from '../dist/solo-game.js';

test('every borrowed visual file retains the recorded original bytes',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../aft-provenance.json',import.meta.url),'utf8'));
  assert.match(manifest.sourceCommit,/^[a-f0-9]{40}$/);
  const root=fileURLToPath(new URL('../dist/aft/',import.meta.url)),listed=new Set();
  for(const file of manifest.files){
    assert.ok(!file.path.split('/').some(part=>part.startsWith('.git')),'Source-control metadata is not artwork: '+file.path);
    const target=path.resolve(root,file.path);assert.ok(target.startsWith(root));
    const bytes=fs.readFileSync(target);assert.equal(bytes.length,file.bytes,file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);
    listed.add(file.path);
  }
  for(const relative of fs.readdirSync(root,{recursive:true}))if(fs.statSync(path.join(root,relative)).isFile())assert.ok(listed.has(relative.replaceAll('\\','/')),'Unrecorded borrowed asset: '+relative);
  for(const group of ['characters','environment','equipment','effects','machines','ui'])assert.ok(manifest.assetGroups[group].files>0,group);
});

test('the original painted crate fits the solo collision footprint',()=>{
  const textures=[new T.Texture(),new T.Texture()],library=createCargoLibrary(...textures);
  try{
    for(const skin of ['timber','weathered','creamWood','oliveWood']){
      const model=library.build('crate-square',skin),size=model.bounds.getSize(new T.Vector3());
      assert.ok(size.x<=.96&&size.z<=.96,`${skin}: ${size.toArray()}`);
      assert.ok(size.y>.7&&size.y<.9);
    }
  }finally{library.dispose();textures.forEach(t=>t.dispose());}
});

test('paint and taller walls preserve map knowledge and solo collision',()=>{
  const state=createSoloGame(),before=JSON.stringify(geometry(state));
  assert.equal(groundSurface(state,9,15),'concrete');
  assert.equal(groundSurface(state,5,24),'gravel');
  assert.equal(groundSurface(state,1,24),'grass');
  const wall={axis:'e',x:8,y:8},knowledge={seen:new Set()};
  assert.equal(wallKnown(knowledge,wall),false);
  knowledge.seen.add('9,8');assert.equal(wallKnown(knowledge,wall),true);
  assert.equal(foregroundWall({axis:'e',x:6,y:6},{x:5,y:5}),true);
  assert.equal(foregroundWall({axis:'e',x:1,y:1},{x:5,y:5}),false);
  assert.equal(foregroundWall({axis:'s',x:25,y:25},hero(state)),false);
  assert.equal(JSON.stringify(geometry(state)),before);
});
