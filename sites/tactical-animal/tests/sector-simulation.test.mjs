import test from 'node:test';
import assert from 'node:assert/strict';
import {Core,DEFAULT_BUILD,NAVIGATION_NODE_LIMIT,createSoloGame,hero,geometry,geometryNear,freePoint,lineClear,walkSegment,navigationPath,travel,refresh,tick,interaction,encodeSave,decodeSave,missionMap} from '../dist/solo-game.js';
import {blockWindow,pointInWorldRect} from '../dist/world-grid.js';
import {playRoute} from './operation-scenarios.mjs';

// Pin the original imported fixture for geometry and old-save regressions.
// The redesigned operation has separate legal-route acceptance tests.
const sector=()=>createSoloGame(DEFAULT_BUILD,1947,'road-checkpoint',{layoutVersion:1});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function field(){
  const s={...sector(),edges:{},obstacles:[],interactables:[]},u=hero(s);
  Object.assign(u,{x:120,y:120,ap:100});
  for(const guard of s.units.slice(1))Object.assign(guard,{x:225+guard.id,y:225,alert:false});
  s.phase='player';s.engaged=true;return s;
}

test('sector state carries the whole immutable map metadata with independent instances',()=>{
  const s=sector(),map=missionMap('road-checkpoint',1);
  for(const name of ['props','obstacles','worldBounds','groundPalette'])assert.deepEqual(s[name],map[name]);
  assert.equal(s.map.length,240);assert.equal(s.map[0].length,240);assert.equal(s.units.length,7);
  s.props[0].x=200;s.obstacles[0].height=99;s.worldBounds.w=3;
  const other=sector();assert.deepEqual(other.props,map.props);assert.deepEqual(other.obstacles,map.obstacles);assert.deepEqual(other.worldBounds,map.worldBounds);
});

test('walking across both 24-metre seams retains fractional coordinates and distance AP',()=>{
  for(const x of [23.2,47.2]){
    const s=field(),u=hero(s);Object.assign(u,{x,y:140,ap:14});const before=s.solo.distance,apDistance=s.solo.apDistance;
    close(travel(s,u,1.1,0),1.1);close(u.x,x+1.1);close(u.ap,11.8);close(s.solo.distance-before,1.1);close(s.solo.apDistance-apDistance,2.2);
    assert.ok(freePoint(s,u,u.id));
  }
});

test('explicit sector bounds allow outer cells and reject movement beyond the physical edge',()=>{
  const s=field(),u=hero(s);
  for(const x of [0,239])for(const y of [0,239])assert.ok(freePoint(s,{x,y},u.id));
  for(const p of [{x:-.3,y:120},{x:239.3,y:120},{x:120,y:-.3},{x:120,y:239.3}])assert.equal(freePoint(s,p,u.id),false);
  Object.assign(u,{x:239,y:120});assert.ok(travel(s,u,1,0)>0);assert.ok(u.x<=239.27+1e-7);assert.ok(freePoint(s,u,u.id));
  const old=createSoloGame();assert.equal(freePoint(old,{x:0,y:24},hero(old).id),false);assert.ok(freePoint(old,{x:1,y:24},hero(old).id));
  assert.equal(lineClear(s,u,{x:Infinity,y:120}),false);assert.deepEqual(geometryNear(s,u,{x:Infinity,y:120},0,'walk'),[]);assert.equal(navigationPath(s,u,NaN,120),null);
});

test('imported prop footprints block movement, prone sight, and grenade landing in global coordinates',()=>{
  const s=sector(),u=hero(s);Object.assign(u,{x:8,y:116,ap:20});u.ammo.grenade=1;s.seen.add('10,116');
  for(const prop of s.props)assert.equal(freePoint(s,prop,u.id),false,prop.kind);
  assert.ok(lineClear(s,{x:9,y:116},{x:11,y:116}));
  assert.equal(lineClear(s,{x:9,y:116,stance:'prone'},{x:11,y:116,stance:'prone'}),false);
  assert.equal(Core.previewGrenade(s,u,{x:10,y:116}).reason,'Landing point is inside an obstacle');
  assert.equal(walkSegment(s,{x:9,y:116},{x:11,y:116},u.id),false);
});

test('flame and grenade actions retain their resource and hit rules beyond the old map dimensions',()=>{
  const s=createSoloGame({...DEFAULT_BUILD,primary:'flamethrower',utility:'grenade'},1947,'road-checkpoint'),u=hero(s),target=s.units[1];
  Object.assign(u,{x:174.25,y:125.25});Object.assign(target,{x:183.75,y:125.25,alert:true});Object.assign(s.units[2],{x:180.25,y:129.25});s.phase='player';s.engaged=true;refresh(s,{forceFog:true});
  const before=encodeSave(s),ap=u.ap,fuel=u.ammo.flamethrower,hp=target.hp,grenades=u.ammo.grenade;
  assert.ok(Core.previewFlame(s,u,0).contacts.some(contact=>contact.id===target.id));assert.ok(Core.previewGrenade(s,u,{x:180.25,y:125.25}).ok);assert.equal(encodeSave(s),before);
  assert.ok(Core.fireFlame(s,u,0));close(u.ap,ap-Core.WEAPONS.flamethrower.cost);assert.equal(u.ammo.flamethrower,fuel-1);assert.ok(target.hp<hp);
  assert.equal(target.hp,0);const grenadeTarget=s.units[2],afterFlame=grenadeTarget.hp;assert.ok(Core.throwGrenade(s,u,{x:180.25,y:125.25}));close(u.ap,ap-Core.WEAPONS.flamethrower.cost-Core.grenadeCost(u));assert.equal(u.ammo.grenade,grenades-1);assert.ok(grenadeTarget.hp<afterFlame);
});

test('geometry broad phase and fog rays never visit distant obstacle kinds',()=>{
  const s=field(),u=hero(s);Object.assign(u,{x:10,y:10});
  s.obstacles=Array.from({length:3000},(_,i)=>({x0:150+i%80,x1:150.4+i%80,y0:150+Math.floor(i/80),y1:150.4+Math.floor(i/80),height:2,kind:'wall'}));
  const boxes=geometry(s);let visits=0;
  for(const box of boxes)Object.defineProperty(box,'kind',{get(){visits++;return 'wall';}});
  assert.deepEqual(geometryNear(s,{x:5,y:5},{x:20,y:20},0,'walk'),[]);
  refresh(s,{forceFog:true});assert.equal(visits,0);assert.ok(s.visible.size>1000&&s.visible.size<3900);
  for(const cell of s.visible){const [x,y]=cell.split(',').map(Number);assert.ok(Math.hypot(x-u.x,y-u.y)<35);}
  assert.equal(s.visible.has('100,100'),false);assert.ok(s.seen.has('2,118'),'Explored cells outside the current neighborhood persist.');
});

test('walls and guards stay in the simulation while a distant block window is resident',()=>{
  const s=sector(),u=hero(s),window=blockWindow(s,{x:200,y:200});
  assert.equal(pointInWorldRect({x:21,y:115.5},window),false);
  assert.equal(lineClear(s,{x:21,y:116.5},{x:21,y:114.5}),false);
  const units=s.units,objects=s.interactables;Object.assign(u,{x:100,y:140});
  const guard=s.units[1];Object.assign(guard,{x:46,y:140,ap:7,alert:true,lastKnown:{x:100,y:140}});
  for(const other of s.units.slice(2))other.alert=false;
  s.phase='enemy';s.enemyIndex=1;s.enemyDelay=0;
  for(let frames=0;s.phase==='enemy'&&frames<400;frames++)tick(s,.05);
  assert.ok(guard.x>47.5,'Pursuit crosses the block seam without a renderer boundary.');
  assert.equal(s.units,units);assert.equal(s.interactables,objects);assert.equal(s.units.length,7);
});

test('sector door changes invalidate indexed collision, sight, fog, and navigation immediately',()=>{
  const s=sector(),u=hero(s),inside={x:21,y:114.5};Object.assign(u,{x:21,y:116.5,ap:20});
  for(const guard of s.units.slice(1))Object.assign(guard,{x:220+guard.id,y:220,alert:false});
  s.phase='player';s.engaged=true;refresh(s,{forceFog:true});
  assert.equal(lineClear(s,u,inside),false);assert.equal(walkSegment(s,u,inside,u.id),false);assert.equal(s.visible.has('21,114'),false);
  assert.equal(navigationPath(s,u,inside.x,inside.y),null);
  assert.ok(Core.performInteraction(s,'aft-door-s-21-115','open').ok);
  assert.ok(lineClear(s,u,inside));assert.ok(walkSegment(s,u,inside,u.id));assert.ok(s.visible.has('21,114'));assert.equal(navigationPath(s,u,inside.x,inside.y).length,1);
  assert.ok(Core.performInteraction(s,'aft-door-s-21-115','close').ok);assert.equal(lineClear(s,u,inside),false);assert.equal(walkSegment(s,u,inside,u.id),false);
});

test('navigation takes long world routes and bounds work on an unreachable sector request',{timeout:5000},()=>{
  const s=field(),u=hero(s);Object.assign(u,{x:30.17,y:120.23});
  s.obstacles=[{x0:119.4,x1:120.6,y0:0,y1:220,height:2,kind:'wall'}];
  // A reachable detour near the southern end of the wall.
  Object.assign(u,{x:117,y:218});const path=navigationPath(s,u,124.27,218.13);assert.ok(path?.length>1);
  let point=u;for(const next of path){assert.ok(walkSegment(s,point,next,u.id));point=next;}close(point.x,124.27);close(point.y,218.13);
  const blocked={...field(),obstacles:[{x0:119.4,x1:120.6,y0:-.5,y1:239.5,height:2,kind:'wall'}]};Object.assign(hero(blocked),{x:30,y:120});
  const units=blocked.units;let reads=0;Object.defineProperty(blocked,'units',{get(){reads++;return units;}});
  assert.equal(navigationPath(blocked,hero(blocked),200,120),null);
  assert.ok(reads<NAVIGATION_NODE_LIMIT*20+100,'Unreachable requests have a fixed expansion budget.');
});

test('sector saves use mission dimensions and rebuild immutable scenery while retaining played state',()=>{
  const s=sector(),u=hero(s);Object.assign(u,{x:205.173,y:180.413,ap:7.37});s.queue=[{x:210.2,y:180.413,z:0,cost:10.054}];s.seen.add('205,180');
  const door=s.interactables.find(o=>o.kind==='door');door.open=true;s.edges[door.edge]='door';
  const chest=s.interactables.find(o=>o.kind==='chest');chest.open=true;chest.searched=true;chest.inventory=[];
  s.solo.objectives['travel-orders']=true;
  const saved=JSON.parse(encodeSave(s));saved.props=[];saved.obstacles=[];saved.worldBounds={x:0,y:0,w:1,h:1};saved.groundPalette='forged';
  const restored=decodeSave(JSON.stringify(saved));assert.equal(encodeSave(restored),encodeSave(s));
  assert.ok(restored.seen.has('2,118'));assert.ok(restored.seen.has('205,180'));assert.equal(restored.units.length,7);assert.equal(restored.interactables.find(o=>o.kind==='chest').inventory.length,0);
});

test('sector save validation rejects wrong mission size and out-of-world dynamic coordinates',()=>{
  const original=JSON.parse(encodeSave(sector()));
  const edits=[s=>s.map.pop(),s=>s.map[0].pop(),s=>s.units[0].x=240,s=>s.units[1].lastKnown={x:2,y:500},s=>s.fogAt={x:500,y:120},s=>s.seen.$set.push('240,118'),s=>s.queue=[{x:999,y:120,cost:1}],s=>s.interactables.find(o=>o.kind==='chest').y=241,s=>s.edges['e:240:120']='wall'];
  for(const edit of edits){const value=structuredClone(original);edit(value);assert.throws(()=>decodeSave(JSON.stringify(value)),/Unsupported/);}
});

test('a legal checkpoint controller loots, fights, opens the office, saves, revisits, and extracts across two seams',()=>{
  const s=sector(),first=[
    {x:4,y:123.6},{id:'supply-chest',action:'open'},{id:'supply-chest',action:'take-all'},
    {x:21,y:116.5},{id:'aft-door-s-21-115',action:'open'},{x:21,y:112},
    {id:'travel-orders',action:'collect'},{x:21,y:116.5},{x:25,y:120},{x:49,y:120},{x:110,y:120},
  ];
  playRoute(s,first,{onStep(step,state){if(step.x===21&&step.y===112)assert.equal(interaction(state).label,'Take the travel orders');if(step.id==='travel-orders')assert.equal(interaction(state),null);}});
  assert.equal(pointInWorldRect({x:21,y:112},blockWindow(s,hero(s))),false);
  const seen=new Set(s.seen),restored=decodeSave(encodeSave(s));assert.equal(encodeSave(restored),encodeSave(s));
  playRoute(restored,[{x:21,y:116.5},{x:21,y:112}],{onStep(step,state){
    if(step.y===112){assert.equal(state.interactables.find(o=>o.kind==='door').open,true);assert.equal(state.interactables.find(o=>o.kind==='chest').inventory.length,0);assert.equal(state.solo.objectives['travel-orders'],true);}
  }});
  for(const cell of seen)assert.ok(restored.seen.has(cell));
  playRoute(restored,[{x:21,y:116.5},{x:64,y:120},{id:'extraction',action:'extract'}]);
  assert.equal(restored.solo.status,'extracted');assert.ok(hero(restored).hp>0);assert.ok(restored.round>0);assert.ok(restored.solo.distance>200);
});
