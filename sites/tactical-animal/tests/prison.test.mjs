import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {PRISON_ID,PRISON_MISSION,PRISON_BARRIERS,PRISON_PLANTS,PRISON_FENCE} from '../dist/prison-map.js';
import {Core,createSoloGame,DEFAULT_BUILD,hero,tick,freePoint,lineClear,walkSegment,projectileSegmentClear,encodeSave,decodeSave} from '../dist/solo-game.js';
import {validateMission} from '../dist/missions.js';
import {InteractionScenery} from '../dist/interaction-view.js';
import {doorFootprint} from '../dist/interactions.js';
import {app} from './app-harness.mjs';
const field=()=>Core.enableRealtime(createSoloGame(DEFAULT_BUILD,1947,PRISON_ID));

test('the prison link opens its production preparation screen without deploying',()=>{
  const a=app({realTime:true,autoDeploy:false,search:'?activity=pinewire-prison'});
  assert.equal(a.el('operation-select').value,PRISON_ID);assert.equal(a.views.length,0);assert.equal(a.el('prep').hidden,false);
  a.el('deploy').click();assert.equal(a.s.solo.missionId,PRISON_ID);assert.equal(a.s.units.length,9);
});

test('prison is a production solo operation with eight legal guards, a wooded ring and four-metre clearing',()=>{
  assert.deepEqual(validateMission(PRISON_MISSION),[]);const s=field();assert.equal(s.map.length,72);assert.equal(s.map[0].length,72);
  assert.equal(s.units.length,9);for(const unit of s.units)assert.ok(freePoint(s,unit,unit.id),unit.name);
  assert.equal(s.realtime.autoFire,false);assert.equal(s.units.slice(1).filter(u=>u.patrol).length,2);
  for(let n=18;n<=53;n++)for(const [x,y]of [[13,n],[58,n],[n,13],[n,58]])assert.equal(s.map[y][x],'woodland');
  for(let n=18;n<=53;n++)for(let gap=0;gap<4;gap++)for(const [x,y]of [[14+gap,n],[54+gap,n],[n,14+gap],[n,54+gap]])assert.notEqual(s.map[y][x],'woodland');
  assert.equal(PRISON_FENCE.clearing,4);assert.ok(PRISON_PLANTS.filter(p=>p.kind==='pine').length>=30);
  assert.equal(PRISON_BARRIERS.some(p=>p.edge==='e:53:22'||p.edge==='e:53:23'),false);
  assert.ok(!s.props.some(p=>p.kind==='barrel-explosive'));
});

test('perimeter and cell bars stop walking while preserving the inherited transparent sight policy',()=>{
  const s=field();const a={x:16.5,y:40},b={x:18.5,y:40};assert.equal(walkSegment(s,a,b,0),false);assert.equal(lineClear(s,a,b),true);
  assert.equal(projectileSegmentClear(s,{...a,h:1.1},{...b,h:1.1}),true);
  assert.equal(walkSegment(s,{x:55,y:23},{x:52,y:23},0),true);
  assert.equal(walkSegment(s,{x:29.4,y:28},{x:27.6,y:28},0),false);assert.equal(lineClear(s,{x:29.4,y:28},{x:27.6,y:28}),true);
});

test('every prison door has normal action costs, a blocked-swing check and an open passage',()=>{
  for(const source of PRISON_MISSION.rooms.flatMap(r=>r.doors)){
    const s=createSoloGame(DEFAULT_BUILD,1947,PRISON_ID),unit=hero(s),d=s.interactables.find(o=>o.id===source.id),horizontal=d.edge.startsWith('s:');
    Object.assign(unit,{x:d.x+(horizontal?0:-d.swing*.9),y:d.y+(horizontal?-d.swing*.9:0),ap:12});s.phase='player';s.engaged=true;
    const inside={x:d.x+(horizontal?0:d.swing*.9),y:d.y+(horizontal?d.swing*.9:0)},guard=s.units[1],saved={x:guard.x,y:guard.y};
    const swing=doorFootprint(d,true);Object.assign(guard,{x:(swing.x0+swing.x1)/2,y:(swing.y0+swing.y1)/2});
    assert.equal(Core.previewInteraction(s,d.id,'open').reason,'Someone is in the doorway.',d.id);Object.assign(guard,saved);
    assert.equal(walkSegment(s,unit,inside,unit.id),false,d.id);
    assert.equal(Core.performInteraction(s,d.id,'open').ok,true,d.id);assert.equal(unit.ap,11,d.id);
    assert.equal(walkSegment(s,unit,inside,unit.id),true,d.id);
    assert.equal(Core.performInteraction(s,d.id,'close').ok,true,d.id);assert.equal(unit.ap,10,d.id);
  }
});

test('cell doors operate through production interactions, leaf geometry and persistence',()=>{
  const s=field(),unit=hero(s),door=s.interactables.find(d=>d.id==='west-cell-door-1');
  Object.assign(unit,{x:29.4,y:29});s.seen.add('28,29');s.seen.add('29,29');
  const scene=new InteractionScenery(s,{loader:{load:()=>new T.Texture()}});
  try{
    const leaf=scene.records.get(door.id).leaf,b={x:27.6,y:29};assert.equal(leaf.userData.interactionId,door.id);assert.ok(leaf.children.length);
    assert.equal(walkSegment(s,unit,b,unit.id),false);assert.equal(lineClear(s,unit,b),true);
    assert.equal(Core.performInteraction(s,door.id,'open').ok,true);scene.update(s);
    const box=doorFootprint(door);assert.deepEqual(leaf.position.toArray(),[(box.x0+box.x1)/2,1,(box.y0+box.y1)/2]);
    assert.equal(walkSegment(s,unit,b,unit.id),true);
    const resumed=decodeSave(encodeSave(s)),saved=resumed.interactables.find(d=>d.id===door.id);assert.equal(saved.open,true);assert.equal(saved.seeThrough,true);assert.equal(saved.barrier,'jail-bars');
    assert.equal(Core.performInteraction(s,door.id,'close').ok,true);scene.update(s);assert.equal(walkSegment(s,unit,b,unit.id),false);
  }finally{scene.dispose();}
});

test('woods conceal a prone approach but the clearing exposes it',()=>{
  const s=field(),observer=s.units.find(u=>u.name==='West fence sentry'),unit=hero(s);
  Object.assign(unit,{x:9,y:35,stance:'standing',sneaking:false});assert.equal(Core.canSee(s,observer,unit),true);
  Object.assign(unit,{stance:'prone',sneaking:true});assert.equal(Core.canSee(s,observer,unit),false);
  Object.assign(unit,{x:16,y:35});assert.equal(Core.canSee(s,observer,unit),true);
});

test('the rear approach reaches an operational administration entrance without the south gate',()=>{
  const s=field(),unit=hero(s);let previous=unit;
  for(const target of [{x:12,y:62},{x:60,y:62},{x:60,y:23},{x:52,y:23},{x:36,y:18.8}]){
    const path=Core.navigationPath(s,{...unit,...previous},target.x,target.y);assert.ok(path,'route to '+JSON.stringify(target));
    for(const point of path){assert.ok(walkSegment(s,previous,point,unit.id));previous=point;}
  }
  Object.assign(unit,previous);const door=s.interactables.find(d=>d.id==='admin-service');assert.equal(Core.performInteraction(s,door.id,'open').ok,true);
  assert.ok(Core.navigationPath(s,unit,PRISON_MISSION.objective.x,PRISON_MISSION.objective.y));
  assert.equal(s.interactables.find(d=>d.id==='prison-south-gate').open,false);
});

test('the complete woodland route can recover the register and extract against the active production guards',()=>{
  const s=field(),u=hero(s),hp=u.hp;
  Core.setMovementMode(s,u,'sneak');Core.setStance(s,u,'prone');
  const until=(check,seconds,label)=>{
    for(let i=0;i<seconds*20;i++){if(check())return;assert.ok(u.hp>0,label);tick(s,.05);}
    assert.ok(check(),label);
  };
  const walk=(x,y)=>{assert.ok(Core.move(s,u,x,y));until(()=>!s.queue.length&&Math.hypot(u.x-x,u.y-y)<.1,70,'walk '+x+','+y);};
  const patrolWindow=()=>until(()=>{const g=s.units[8];return g.heading>80&&g.heading<100&&g.y<42;},20,'patrol faces away');
  walk(12,62);walk(60,62);walk(60,23);patrolWindow();Core.setStance(s,u,'standing');walk(52,23);walk(45,18.8);Core.setStance(s,u,'prone');walk(36,18.8);
  assert.equal(Core.performInteraction(s,'admin-service','open').ok,true);walk(36,22);assert.equal(Core.performInteraction(s,'prisoner-register','collect').ok,true);
  walk(36,18.8);walk(45,18.8);patrolWindow();Core.setStance(s,u,'standing');walk(52,23);walk(60,23);Core.setStance(s,u,'prone');walk(60,62);walk(8,62);
  assert.equal(Core.performInteraction(s,'extraction','extract').ok,true);assert.equal(s.solo.status,'extracted');assert.equal(u.hp,hp);assert.equal(u.ammo.assault,30);
  assert.ok(s.units.slice(1).every(g=>g.hp>0));assert.equal(s.interactables.find(d=>d.id==='prison-south-gate').open,false);
});
