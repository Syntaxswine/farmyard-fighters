import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Group,Scene} from '../dist/aft/tactics/vendor/three.module.js';
import {ANIMAL_MOTION_CATALOG} from '../dist/aft/tactics/animal-motion-catalog.js';
import {createWeaponModel} from '../dist/aft/tactics/weapon-models.js';
import {createWorkerLocomotion} from '../dist/aft/tactics/worker-locomotion.js';
import {createBattlePosture} from '../dist/aft/tactics/battle-posture.js';
import {createCrawlPose} from '../dist/crawl-pose.js';
import {createWeaponPose} from '../dist/weapon-pose.js';
import {createGrenadePose} from '../dist/grenade-pose.js';
import {V,Q,weaponGrip} from '../dist/weapon-pose-rig.js';
import {FieldView} from '../dist/field-view.js';
import {Core,DEFAULT_BUILD,createSoloGame,geometry,hero,lineClear,tick} from '../dist/solo-game.js';
import {shotSeconds} from '../dist/realtime-combat.js';
import {setTracer,traceEnd,traceStart,tracerMesh} from '../dist/weapon-feedback.js';
import {WINDOW_REVIEW_ID,windowReviewSource} from '../dist/window-review-map.js';

function sheepRig(weapon){
  const profile=ANIMAL_MOTION_CATALOG.find(p=>p.id==='sheep');
  const data=JSON.parse(fs.readFileSync(new URL('../dist/aft/tactics/'+profile.file,import.meta.url)));
  const worker=profile.create(data),gun=createWeaponModel(weapon);
  worker.equipWeapon(gun);
  const gait=createWorkerLocomotion(worker,profile),posture=createBattlePosture(worker,profile);
  const action=createWeaponPose(worker,profile),bones=Object.fromEntries(worker.bones.map(b=>[b.name,b]));
  return {gun,action,bones,worker,profile,locomotion:gait,posture,prepare(sample){
    gait.apply({...sample,blend:0});posture.apply(sample);action.crawl(sample);posture.ground();
  },dispose(){gait.dispose();gun.dispose();worker.dispose();}};
}

test('prone HMG keeps the carry handle in the support hand and the bipod clear through a crawling shot',()=>{
  const rig=sheepRig('hmg'),{gun,action,bones}=rig;
  const sample={x:0,y:0,heading:45,stance:'prone',weapon:'hmg',pose:{prone:1,kneel:0},blend:1,distance:.37};
  const target=V(8,1.08,0);
  try{
    for(const amount of [.42,1]){
      rig.prepare(sample);
      const supportHeights=['hips','hoof-1','hoof1'].map(name=>bones[name].getWorldPosition(V()).y);
      const fit=action.apply(sample,{target,amount,age:0,active:amount===1});
      assert.ok(fit.supported,fit.reason);
      if(amount===1)assert.ok(fit.direction.angleTo(target.clone().sub(fit.origin))<.0005);
      for(const [i,name] of ['hips','hoof-1','hoof1'].entries()){
        assert.ok(Math.abs(supportHeights[i]-bones[name].getWorldPosition(V()).y)<1e-8);
      }
      for(const [side,name] of [[-1,'support'],[1,'grip']]){
        const {palm}=weaponGrip(gun,name,gun.root.getWorldQuaternion(Q()));
        assert.ok(bones['hand'+side].localToWorld(palm).distanceTo(gun.anchors[name].getWorldPosition(V()))<.0001);
      }
      for(const part of gun.parts.filter(part=>part.name==='bipod foot')){
        const positions=part.geometry.attributes.position;
        for(let i=0;i<positions.count;i++)assert.ok(part.localToWorld(V().fromBufferAttribute(positions,i)).y>=0);
      }
    }
  }finally{rig.dispose();}
});

test('a prone flamer releases its crawl rig and hose to the normal pose, then resumes the same cycle',()=>{
  const {profile,worker,posture,locomotion,gun,dispose}=sheepRig('flamethrower');
  const updateHose=gun.updateHose;
  const crawl=createCrawlPose(worker,profile,posture,gun.id);
  const sample={heading:62,stance:'prone',pose:{prone:1,kneel:0},blend:1,crawlDistance:.213,distance:.213};
  try{
    const normalHose=gun.hose.geometry;
    const first=crawl.apply(sample);
    assert.equal(first.pose,'Loaded backpack crawl');
    assert.ok(worker.root.position.length()<1e-8);
    assert.ok(gun.hose.visible);
    const fittedHose=gun.hose.geometry;
    assert.notEqual(fittedHose,normalHose);

    crawl.suspend();
    assert.equal(gun.updateHose,updateHose);
    assert.equal(gun.hose.geometry,normalHose);
    locomotion.apply({...sample,blend:0});posture.apply(sample);
    const replacement=gun.hose.geometry;
    assert.notEqual(replacement,normalHose);
    assert.deepEqual(crawl.apply(sample),first);
    assert.equal(gun.hose.geometry,fittedHose);
    crawl.suspend();
    assert.equal(gun.updateHose,updateHose);
    assert.equal(gun.hose.geometry,replacement);
  }finally{crawl.dispose();dispose();}
});

function wallYard(){
  const map=windowReviewSource();
  map.farmyardWindows.instances=[];
  map.edges={'e:23:27':'wall-brick'};
  map.guards=[{x:28,y:25,heading:0,species:'pig-foreman',weapon:'pistol'}];
  return Core.enableRealtime(createSoloGame(DEFAULT_BUILD,42,WINDOW_REVIEW_ID,{authoredMap:map}));
}

test('a raised town deck lifts the actor and the animated grenade release together',()=>{
  const state=wallYard(),unit=hero(state),rig=sheepRig('assault'),root=new Group();
  root.add(rig.worker.root);
  const throwPose=createGrenadePose(rig.worker,rig.profile);
  const actor={root,worker:rig.worker,locomotion:rig.locomotion,posture:rig.posture,weapon:'assault',equipment:rig.gun,weaponPose:rig.action,throwPose};
  const shot={at:1000,event:{weapon:'grenade',ax:unit.x,ay:unit.y,bx:unit.x+6,by:unit.y}};
  const view=Object.assign(Object.create(FieldView.prototype),{state,discharges:new Map([[unit.id,shot]])});
  const draw=()=>view.poseActor(actor,state,unit,{...unit,distance:0,blend:0,pose:{prone:0,kneel:0,down:0,dead:0}},1000,1/60,unit.weapon,unit);
  try{
    draw();const flat=shot.releaseOrigin.clone();assert.equal(root.position.y,0);
    view.art={surfaceHeight:()=>.4};draw();
    assert.equal(root.position.y,.4);assert.ok(Math.abs(shot.releaseOrigin.y-flat.y-.4)<1e-8);
    assert.ok(Math.hypot(shot.releaseOrigin.x-flat.x,shot.releaseOrigin.z-flat.z)<1e-8);
    delete view.art;draw();assert.equal(root.position.y,0);assert.ok(shot.releaseOrigin.distanceTo(flat)<1e-8);
  }finally{throwPose.dispose();rig.dispose();}
});

test('a delayed burst round keeps its committed tracer after the shooter moves behind a wall',()=>{
  const state=wallYard();
  const unit=hero(state),target=state.units[1];
  target.hp=target.maxHp=1000;
  assert.ok(Core.attack(state,unit,target,true));
  tick(state,shotSeconds('assault','hip','burst'));
  const event=state.effect.sequence[2];
  assert.deepEqual([event.ax,event.ay,event.shot],[20,25,2]);
  const end=traceEnd(event),endpoint={x:end.x,y:end.z,h:end.y};
  assert.ok(lineClear(state,{x:event.ax,y:event.ay,h:event.ah},endpoint));

  const rig=sheepRig('assault'),root=new Group(),scene=new Scene();
  const actor={root,worker:rig.worker,locomotion:rig.locomotion,posture:rig.posture,
    weapon:'assault',equipment:rig.gun,weaponPose:rig.action};
  root.add(rig.worker.root);scene.add(root);
  const view=Object.assign(Object.create(FieldView.prototype),{state,scene,effects:[],actors:new Map([[unit.id,actor]])});
  function draw(now){
    const sample={...unit,distance:unit.travelled,blend:unit.isMoving?1:0,pose:{prone:0,kneel:0,down:0,dead:0}};
    view.animateEffects(now);
    view.poseActor(actor,state,unit,sample,now,1/60,unit.weapon,unit);
    view.drawShotTraces(state,now);
  }
  try{
    view.queueEffects(state.effect,1000);
    draw(1000);
    assert.equal(view.lastDischarge.fromMuzzle,true);
    assert.equal(view.lastDischarge.flash,true);

    tick(state,.14,{x:0,y:1});draw(1140);
    tick(state,.14,{x:0,y:1});draw(1280);
    const round=view.effects.find(effect=>effect.event===event),muzzle=rig.gun.anchors.muzzle.getWorldPosition(V());
    assert.ok(round.fitted&&unit.isMoving);
    assert.equal(lineClear(state,{x:muzzle.x,y:muzzle.z,h:muzzle.y},endpoint),false);
    assert.equal(view.lastDischarge.round,2);
    assert.equal(view.lastDischarge.fromMuzzle,false);
    assert.equal(view.lastDischarge.flash,false);
    const vertices=round.line.geometry.attributes.position;
    assert.ok(vertices.count>0);
    const start=V().fromBufferAttribute(vertices,0).add(V().fromBufferAttribute(vertices,1)).multiplyScalar(.5);
    assert.ok(start.distanceTo(V(event.ax,event.ah,event.ay))<.0001);
  }finally{view.clearEffects();rig.dispose();}
});

test('a fitted muzzle can trace to the recorded wall impact but cannot introduce a blocked ray',()=>{
  const state=wallYard(),wall=geometry(state).find(box=>box.kind==='wall');
  const impact={ax:22.8,ay:27,ah:1.1,bx:wall.x0,by:27,bh:1.1};
  const muzzle=V(23.1,1.1,27);
  assert.equal(traceStart(impact,muzzle,traceEnd(impact),state),muzzle);

  const clear={ax:22.9,ay:25.9,ah:1.1,bx:24.9,by:25.9,bh:1.1};
  const offsetMuzzle=V(23.05,1.1,27.1);
  assert.ok(lineClear(state,{x:clear.ax,y:clear.ay},{x:clear.bx,y:clear.by}));
  assert.equal(lineClear(state,{x:offsetMuzzle.x,y:offsetMuzzle.z},{x:clear.bx,y:clear.by}),false);
  assert.ok(traceStart(clear,offsetMuzzle,traceEnd(clear),state).equals(V(clear.ax,clear.ah,clear.ay)));
});

test('real-time bullet ribbons fade and narrow toward the muzzle across separate visible runs',()=>{
  const beam=tracerMesh('smg'),start=V(0,1,0),end=V(8,1,0);
  const visible=new Set([0,1,2,5,6,7,8].map(x=>`${x},0`));
  try{
    assert.ok(setTracer(beam,start,end,{realtime:{},visible},'smg'));
    const {position,color}=beam.geometry.attributes;
    assert.equal(position.count,24);
    assert.equal(color.count,position.count);
    assert.equal(color.itemSize,4);
    assert.equal(beam.material.vertexColors,true);
    assert.ok(position.getX(2)<2.5&&position.getX(12)>4.5);
    assert.equal(position.getX(14),end.x);
    assert.ok(color.getW(0)<.15&&color.getW(2)<color.getW(12)&&color.getW(12)<color.getW(14));
    assert.equal(color.getW(14),1);
    assert.ok(Math.abs(position.getZ(0))<Math.abs(position.getZ(14))*.35);
  }finally{beam.geometry.dispose();beam.material.dispose();}
});

test('a point-blank prone TT-33 fits a compact grip with the target ahead of the muzzle',()=>{
  const rig=sheepRig('pistol');
  try{
    const sample={x:0,y:0,heading:25,stance:'prone',weapon:'pistol',pose:{prone:1,kneel:0},blend:.75,distance:.38};
    rig.prepare(sample);
    const target=V(.60,.30,0),fit=rig.action.apply(sample,{target,amount:1,active:true,age:0});
    assert.ok(fit.supported,fit.reason);
    assert.ok(fit.angularError<.0005,fit.angularError);
  }finally{rig.dispose();}
});
