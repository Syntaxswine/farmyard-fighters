import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {ANIMAL_MOTION_CATALOG} from '../dist/aft/tactics/animal-motion-catalog.js';
import {createWeaponModel} from '../dist/aft/tactics/weapon-models.js';
import {createWorkerLocomotion} from '../dist/aft/tactics/worker-locomotion.js';
import {createBattlePosture} from '../dist/aft/tactics/battle-posture.js';
import {SoloBurnEffects,burnSegments,burnPlayback} from '../dist/burn-effects.js';
const camera=new T.PerspectiveCamera();camera.position.set(14,16,34);
function rig(species='horse'){
  const profile=ANIMAL_MOTION_CATALOG.find(p=>p.id===species),worker=profile.create(JSON.parse(fs.readFileSync(new URL('../dist/aft/tactics/'+profile.file,import.meta.url)))),gun=createWeaponModel('rifle');worker.equipWeapon(gun);
  const root=new T.Group();root.add(worker.root);const pick=new T.Object3D(),ring=new T.Object3D(),shadow=new T.Object3D();root.add(pick,ring,shadow);
  return {root,worker,profile,pick,ring,shadow,paint:{},weapon:'rifle',locomotion:createWorkerLocomotion(worker,profile),posture:createBattlePosture(worker,profile),dispose(){this.locomotion?.dispose();gun.dispose();worker.dispose();worker.skeleton.dispose();}};
}
const victim=(extra={})=>({id:1,weapon:'rifle',species:'horse',stance:'standing',x:9.17,y:24.23,heading:0,hp:0,burnedRemains:true,...extra});
const state=(u,event)=>({units:[u],visible:new Set(['9,24','10,24','10,25']),fireAnimations:event?[event]:[]});

test('burn playback stops at legal route corners and fatal events have no postmortem travel',()=>{
  const event={kind:'panic',route:[{x:9.17,y:24.23},{x:10.17,y:24.23},{x:10.17,y:25.23}]},segments=burnSegments(event);assert.equal(segments.length,2);
  const p=burnPlayback({event,segments,start:0},800);assert.equal(p.route.points[0].z,25.23-1);
  const ash={kind:'ash',route:[{x:10.17,y:25.23}]};const fatal=burnPlayback({event:ash,segments:burnSegments(ash),start:0},5000);assert.equal(fatal.route.length,0);assert.equal(fatal.terminal,true);
});

test('authored engulf/collapse/ash rendering is read-only, selectable and fully disposed',async()=>{
  const scene=new T.Scene(),actor=rig(),u=victim(),event={sequence:1,unitId:1,kind:'ash',weapon:'rifle',route:[{x:u.x,y:u.y,heading:0}]},s=state(u,event),errors=[],textures=[];
  const layer=new SoloBurnEffects(scene,{loadTexture:async()=>{const t=new T.Texture();textures.push(t);return t;},onError:e=>errors.push(e)});const before=JSON.stringify(s);
  try{
    layer.observe(s,0,[u]);await layer.ready;assert.ok(layer.pose(actor,u,camera));await Promise.resolve();
    layer.observe(s,2500,[u]);assert.ok(layer.pose(actor,u,camera));const session=layer.sessions.get(1);assert.ok(session.effects.ash.visible);assert.equal(actor.pick.position.x,u.x);assert.equal(actor.pick.position.z,u.y);
    assert.equal(JSON.stringify(s),before);assert.deepEqual(errors,[]);let retired=0;for(const t of textures)t.addEventListener('dispose',()=>retired++);
    layer.observe(s,3000,[]);assert.equal(layer.sessions.size,0);assert.equal(scene.children.length,0);layer.dispose();layer.dispose();assert.equal(retired,3);
  }finally{layer.dispose();actor.dispose();}
});

test('missing burn textures retain a visible corpse and reduced motion never replays a panic route',async()=>{
  const actor=rig(),u=victim(),s=state(u),layer=new SoloBurnEffects(new T.Scene(),{loadTexture:async()=>{throw Error('offline');},onError(){}});
  try{layer.observe(s,0,[u]);await layer.ready;assert.ok(layer.pose(actor,u,camera));assert.ok(actor.worker.parts.some(p=>p.visible));assert.equal(layer.sessions.get(1).value.value,0);}finally{layer.dispose();actor.dispose();}
  const other=rig(),burning=victim({hp:60,burnedRemains:false,burningTurns:2,x:10.17}),event={sequence:1,unitId:1,kind:'panic',weapon:'rifle',route:[{x:9.17,y:24.23},{x:10.17,y:24.23}]},reduced=new SoloBurnEffects(new T.Scene(),{loadTexture:async()=>new T.Texture(),reducedMotion:()=>true});
  try{reduced.observe(state(burning,event),0,[burning]);await reduced.ready;reduced.pose(other,burning,camera);assert.equal(other.pick.position.x,burning.x);assert.equal(reduced.entries.get(1).segments[0].length,0);}finally{reduced.dispose();other.dispose();}
});
