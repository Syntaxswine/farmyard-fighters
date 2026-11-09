import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {ANIMAL_MOTION_CATALOG} from '../dist/aft/tactics/animal-motion-catalog.js';
import {createWeaponModel} from '../dist/aft/tactics/weapon-models.js';
import {SoloBurnEffects} from '../dist/burn-effects.js';
import {SoloTankEffects} from '../dist/tank-effects.js';
const camera=new T.PerspectiveCamera();camera.position.set(14,16,34);
function rig(weapon){const profile=ANIMAL_MOTION_CATALOG.find(p=>p.id==='horse'),worker=profile.create(JSON.parse(fs.readFileSync(new URL('../dist/aft/tactics/'+profile.file,import.meta.url)))),equipment=createWeaponModel(weapon);worker.equipWeapon(equipment);const root=new T.Group(),pick=new T.Object3D(),ring=new T.Object3D(),shadow=new T.Object3D();root.add(worker.root,pick,ring,shadow);return {root,worker,profile,equipment,weapon,pick,ring,shadow,paint:{},dispose(){equipment.dispose();worker.dispose();worker.skeleton.dispose();}};}
function state(worn=true){const unit={id:1,x:12.17,y:25.23,heading:0,stance:'standing',species:'horse',hp:0,burnedRemains:true,tanksExploded:true,weapon:worn?'hands':'rifle'},event={sequence:1,unitId:1,kind:'tank',weapon:worn?'flamethrower':'rifle',worn,route:[{x:unit.x,y:unit.y,heading:0}],fires:[{x:12,y:25,z:0,turns:3}]};return {units:[unit],visible:new Set(['12,25']),fireAnimations:[event],fires:event.fires};}

test('a worn rupture uses the actual fitted cylinder midpoint; stowed tanks never create visible equipment',async()=>{
  for(const worn of [true,false]){
    const scene=new T.Scene(),s=state(worn),actor=rig(worn?'flamethrower':'rifle'),errors=[],tanks=new SoloTankEffects(scene,{loadTexture:async()=>new T.Texture(),onError:e=>errors.push(e)}),burns=new SoloBurnEffects(scene,{loadTexture:async()=>new T.Texture(),onError:e=>errors.push(e)});burns.tankEffects=tanks;
    try{
      const before=JSON.stringify(s);tanks.observe(s,0,s.units);burns.observe(s,0,s.units);await Promise.all([tanks.ready,burns.ready]);assert.equal(burns.equipmentFor(s.units[0]),worn?'flamethrower':'rifle');
      assert.ok(burns.pose(actor,s.units[0],camera));const burst=tanks.bursts.get(1);
      if(worn){assert.ok(burst.originFixed);assert.ok(burst.origin.distanceTo(burns.sessions.get(1).blast.origin)<1e-8);assert.notEqual(burst.origin.y,.8);}else{assert.equal(actor.worker.weapon.id,'rifle');assert.deepEqual(burst.origin.toArray(),[12.17,.8,25.23]);assert.equal(burns.sessions.get(1).blast,undefined);}
      tanks.draw(camera);await Promise.resolve();tanks.draw(camera);assert.ok(burst.effects);assert.equal(JSON.stringify(s),before);assert.deepEqual(errors,[]);
    }finally{burns.dispose();tanks.dispose();actor.dispose();assert.equal(scene.children.length,0);}
  }
});

test('saved ground fire rebuilds without a transient blast, clips fog, and releases cells and textures',async()=>{
  const scene=new T.Scene(),s=state(false);delete s.fireAnimations;s.fires.push({x:15,y:25,z:0,turns:3});let textureDisposals=0;
  const layer=new SoloTankEffects(scene,{loadTexture:async()=>{const t=new T.Texture();t.addEventListener('dispose',()=>textureDisposals++);return t;}});
  layer.observe(s,0,s.units);await layer.ready;layer.draw(camera);await Promise.resolve();layer.draw(camera);assert.equal(layer.bursts.size,0);assert.equal(layer.ground.effects.ground.length,1);
  const geometry=layer.ground.effects.ground[0].geometry;for(let i=0;i<30;i++){layer.observe(s,i*100,s.units);layer.draw(camera);assert.equal(layer.ground.effects.ground[0].geometry,geometry);}
  s.visible=new Set();layer.observe(s,4000,[]);layer.draw(camera);assert.equal(layer.ground,null);assert.equal(scene.children.length,0);layer.dispose();layer.dispose();assert.equal(textureDisposals,3);
});

test('hidden and reduced-motion bursts are skipped; late texture loads retire without resurrecting effects',async()=>{
  const s=state(true),hidden=new SoloTankEffects(new T.Scene(),{loadTexture:async()=>new T.Texture()}),reduced=new SoloTankEffects(new T.Scene(),{loadTexture:async()=>new T.Texture(),reducedMotion:()=>true});
  try{hidden.observe(s,0,[]);reduced.observe(s,0,s.units);assert.equal(hidden.bursts.size,0);assert.equal(reduced.bursts.size,0);await Promise.all([hidden.ready,reduced.ready]);}finally{hidden.dispose();reduced.dispose();}
  let disposed=0;const scene=new T.Scene(),late=new SoloTankEffects(scene,{loadTexture:async()=>{const t=new T.Texture();t.addEventListener('dispose',()=>disposed++);return t;}});late.observe(s,0,s.units);late.dispose();await late.ready;assert.equal(disposed,3);assert.equal(scene.children.length,0);
});
