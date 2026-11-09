import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {ANIMAL_MOTION_CATALOG} from '../dist/aft/tactics/animal-motion-catalog.js';
import {createWeaponModel} from '../dist/aft/tactics/weapon-models.js';
import {createWorkerLocomotion} from '../dist/aft/tactics/worker-locomotion.js';
import {createBattlePosture} from '../dist/aft/tactics/battle-posture.js';
import {createFlameOperator} from '../dist/flame-pose.js';
import {SoloFlameEffects} from '../dist/flame-effects.js';
import {FieldView} from '../dist/field-view.js';
import {ANIMALS,Core,encodeSave} from '../dist/solo-game.js';
import {flameScenario} from './flame-scenarios.mjs';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);

function rig(species){
  const profile=ANIMAL_MOTION_CATALOG.find(profile=>profile.id===species),worker=profile.create(JSON.parse(fs.readFileSync(new URL('../dist/aft/tactics/'+profile.file,import.meta.url))));
  const gun=createWeaponModel('flamethrower');worker.equipWeapon(gun);
  const locomotion=createWorkerLocomotion(worker,profile),posture=createBattlePosture(worker,profile),operator=createFlameOperator(worker,profile),root=new T.Group();root.add(worker.root);
  return {root,profile,worker,gun,locomotion,posture,operator,dispose(){operator.dispose();locomotion.dispose();gun.dispose();worker.dispose();worker.skeleton.dispose();}};
}

test('every selectable species and stance uses finite native rigs, planted feet, actual muzzles and reversible fire poses',()=>{
  for(const animal of ANIMALS){const actor=rig(animal.species);
    try{for(const stance of ['standing','kneeling','prone'])for(const heading of [0,30,90,210]){
      const sample={hp:100,heading,distance:0,blend:0,stance,pose:{kneel:stance==='kneeling'?1:0,prone:stance==='prone'?1:0}},bones=Object.fromEntries(actor.worker.bones.map(bone=>[bone.name,bone]));let muzzle;
      for(const time of [0,.15,.32,.7,1.2,1.8,2.1]){
        actor.root.position.set(0,0,0);actor.locomotion.apply(sample);actor.posture.apply(sample);actor.root.position.set(12,0,21);actor.root.updateMatrixWorld(true);
        const feet=[bones.hoof1.getWorldPosition(V()),bones['hoof-1'].getWorldPosition(V())],position=actor.root.position.clone(),unit=JSON.stringify(sample),result=actor.operator.apply(sample,time);
        assert.ok(result?.origin.toArray().every(Number.isFinite));assert.ok(result.direction.toArray().every(Number.isFinite));assert.ok(result.direction.dot(V(Math.cos(heading*Math.PI/180),0,Math.sin(heading*Math.PI/180)))>.999);
        assert.ok(result.origin.distanceTo(actor.gun.anchors.muzzle.getWorldPosition(V()))<1e-8);assert.deepEqual(actor.root.position,position);assert.equal(JSON.stringify(sample),unit);
        assert.ok(bones.hoof1.getWorldPosition(V()).distanceTo(feet[0])<1e-8);assert.ok(bones['hoof-1'].getWorldPosition(V()).distanceTo(feet[1])<1e-8);
        assert.ok(actor.worker.bones.every(bone=>[...bone.position.toArray(),...bone.quaternion.toArray(),...bone.scale.toArray()].every(Number.isFinite)));
        if(!muzzle)muzzle=result.origin.clone();else assert.ok(muzzle.distanceTo(result.origin)<1e-7);
      }
      actor.root.position.set(0,0,0);actor.locomotion.apply(sample);actor.posture.apply(sample);assert.ok(actor.worker.bones.every(bone=>bone.scale.equals(V(1,1,1))));
    }}finally{actor.dispose();}
  }
});

test('unsupported rig and non-flame loadouts use a safe authored pose fallback',()=>{
  const root=new T.Group(),gun=createWeaponModel('flamethrower');root.add(gun.root);const operator=createFlameOperator({root,bones:[],weapon:gun},{unarmed:true});
  assert.equal(operator.apply({hp:100},.7).fallback,true);operator.dispose();assert.equal(operator.apply({hp:100},.7),null);gun.dispose();
});

test('the actual field sync captures the model muzzle, never changes simulation, and restores its normal pose',async()=>{
  const {state,unit,target}=flameScenario(),actor=rig(unit.species),scene=new T.Scene(),camera=new T.OrthographicCamera();camera.position.set(16,18,36);scene.add(actor.root);
  const view=Object.assign(Object.create(FieldView.prototype),{scene,camera,actors:new Map(),samples:new Map(),effects:[],failed:new Set(),pending:new Map(),generation:0,follow:false,focusedId:null,lastRevision:-1,daylight:{update(){}},art:{update(){}},interactionArt:{update(){}},objectivePin:{},extractionPin:{},marker:new T.Mesh(),renderer:{render(){}},actor(){}});
  const record={...actor,equipment:actor.gun,weapon:'flamethrower',flameOperator:actor.operator,paint:{dispose(){}},pick:new T.Mesh(),ring:new T.Mesh(),shadow:new T.Mesh()};view.actors.set(unit.id,record);
  view.flameEffects=new SoloFlameEffects(scene,{loadTexture:async()=>new T.Texture()});Core.attack(state,unit,target);const before=encodeSave(state);
  view.sync(state,0);assert.ok(view.flameEffects.queue[0].muzzle.distanceTo(actor.gun.anchors.muzzle.getWorldPosition(V()))<1e-8);await view.flameEffects.pending;
  for(let time=16;time<=3200;time+=40)view.sync(state,time);
  assert.equal(view.flameEffects.queue.length,0);assert.equal(record.hadFlame,false);assert.equal(encodeSave(state),before);
  const after=actor.worker.bones.map(bone=>bone.quaternion.clone()),gunAfter=actor.gun.root.matrix.clone();actor.root.position.set(0,0,0);actor.locomotion.apply(view.samples.get(unit.id));actor.posture.apply(view.samples.get(unit.id));
  after.forEach((rotation,i)=>assert.ok(rotation.angleTo(actor.worker.bones[i].quaternion)<1e-6));assert.ok(actor.gun.root.matrix.equals(gunAfter));view.clearEffects();actor.dispose();
});
