import test from 'node:test';
import assert from 'node:assert/strict';
import {ANIMALS,PRIMARY,DEFAULT_BUILD,createSoloGame,hero,distance,missionForState,missionMap,freePoint,lineClear,tick,encodeSave,decodeSave} from '../dist/solo-game.js';
import {checkpointSource,CHECKPOINT_PROVENANCE} from '../dist/aft-sector.js';
import {validateMission} from '../dist/missions.js';
import {blockWindow} from '../dist/world-grid.js';
import {playRoute} from './operation-scenarios.mjs';
import {app} from './app-harness.mjs';
import {PREPARATION_SAVE,OPERATION_SLOT} from '../dist/operation-storage.js';
import {CHECKPOINT_NORTH_ENTRY,CHECKPOINT_NORTH_EXIT,CHECKPOINT_SOUTH_ENTRY,CHECKPOINT_ROAD_ENTRY} from './checkpoint-routes.mjs';

const operation=(build=DEFAULT_BUILD)=>createSoloGame(build,1947,'road-checkpoint');
test('every animal and loadout starts unengaged in a usable staging area',()=>{
  for(const animal of ANIMALS)for(const primary of PRIMARY){
    const s=operation({...DEFAULT_BUILD,animal:animal.id,primary}),u=hero(s);
    assert.equal(s.phase,'explore');assert.equal(s.round,0);assert.equal(s.detected.size,0);assert.equal(s.solo.layoutVersion,2);
    for(const guard of s.units.slice(1)){assert.equal(guard.alert,false);assert.ok(freePoint(s,guard,guard.id));assert.ok(distance(u,guard)>26);}
    for(const p of [{x:48,y:120},{x:52,y:115},{x:52,y:126}])assert.ok(freePoint(s,p,u.id));
    for(let frame=0;frame<40;frame++)tick(s,.05);
    assert.equal(s.phase,'explore');assert.equal(u.hp,u.maxHp);assert.equal(u.ap,u.maxAp);
  }
});

test('the new layout preserves the editor foundation and gives both flanks real sight screens',()=>{
  const s=operation(),mission=missionForState(s),original=checkpointSource(),map=missionMap(mission.id,2);
  assert.deepEqual(validateMission(mission),[]);assert.deepEqual(s.worldBounds,{x:0,y:0,w:240,h:240});
  assert.deepEqual(map.source,CHECKPOINT_PROVENANCE);assert.equal(original.starts[0].x,2);assert.equal(original.terrain[112][21],'floor');
  assert.equal(map.terrain[112][117],'floor');assert.equal(map.doors.length,2);assert.equal(s.units.length,7);
  assert.equal(lineClear(s,{x:88,y:120},{x:88,y:102}),false);
  assert.equal(lineClear(s,{x:88,y:120},{x:88,y:139}),false);
  assert.equal(lineClear(s,{x:62,y:120},{x:88,y:120}),true);
  assert.equal(blockWindow(s,hero(s)).blocks.length,9);
  const other=operation();s.props[0].x=0;s.map[102][70]='crate';assert.notEqual(other.props[0].x,0);assert.notEqual(other.map[102][70],'crate');
});

test('the northern service approach can collect the orders and extract without a shot or contact',()=>{
  const s=operation(),u=hero(s),rounds=u.ammo[u.weapon];
  const quiet=(_step,state)=>{assert.equal(state.phase,'explore');assert.ok(state.units.slice(1).every(g=>!g.alert));};
  playRoute(s,CHECKPOINT_NORTH_ENTRY,{onStep:quiet});
  assert.equal(s.solo.objectives['travel-orders'],true);
  const saved=encodeSave(s),restored=decodeSave(saved);assert.equal(encodeSave(restored),saved);
  playRoute(restored,CHECKPOINT_NORTH_EXIT,{onStep:quiet});
  assert.equal(restored.solo.status,'extracted');assert.equal(restored.round,0);assert.equal(hero(restored).ammo.assault,rounds);assert.equal(hero(restored).hp,u.maxHp);
  assert.ok(restored.units.slice(1).every(g=>g.hp===g.maxHp));assert.ok(restored.solo.distance>150);
});

test('the southern freight route reaches supplies and offers a different working office entrance',()=>{
  const s=operation(),u=hero(s),reserve=u.ammoPouch.assault;
  playRoute(s,CHECKPOINT_SOUTH_ENTRY);
  assert.equal(s.solo.objectives['travel-orders'],true);assert.equal(s.interactables.find(o=>o.id==='checkpoint-front-door').open,true);
  assert.equal(s.interactables.find(o=>o.id==='checkpoint-service-door').open,false);assert.equal(s.interactables.find(o=>o.id==='freight-supplies').inventory.length,0);
  assert.ok(u.ammoPouch.assault>=reserve+30);assert.ok(u.hp>0);
  playRoute(s,[{x:117,y:109.8},{id:'checkpoint-service-door',action:'open'},...CHECKPOINT_NORTH_EXIT]);
  assert.equal(s.solo.status,'extracted');
});

test('the road remains a viable combat approach while distant posts stay quiet at first contact',()=>{
  const s=operation();let firstContact=null;playRoute(s,[{x:62.25,y:120}],{onFrame:state=>{if(state.phase==='player'&&!firstContact)firstContact=state.units.filter(g=>g.team==='guard'&&g.alert).map(g=>g.name);}});
  assert(firstContact,'The road makes real contact before its controller clears the approach');assert.ok(firstContact.length>0&&firstContact.length<=2);
  for(const name of ['North picket','Freight sentry','Orders courier','East road sentry'])assert(!firstContact.includes(name),name);
  playRoute(s,CHECKPOINT_ROAD_ENTRY.slice(3));assert.ok(s.round>0);assert.equal(s.solo.objectives['travel-orders'],true);
  playRoute(s,[{x:117,y:109.8},{id:'checkpoint-service-door',action:'open'},...CHECKPOINT_NORTH_EXIT]);assert.equal(s.solo.status,'extracted');
});

test('old checkpoint saves retain their original office, guards, exits and played state',()=>{
  const s=createSoloGame(DEFAULT_BUILD,1947,'road-checkpoint',{layoutVersion:1});
  delete s.solo.layoutVersion;hero(s).ap=7.3;
  const saved=encodeSave(s),restored=decodeSave(saved),m=missionForState(restored);
  assert.equal(encodeSave(restored),saved);assert.equal(m.objective.x,21);assert.equal(m.extraction.x,64);assert.equal(restored.props[0].x,10);
  assert.equal(m.rooms[0].doors[0].id,'aft-door-s-21-115');assert.equal(restored.interactables.find(o=>o.kind==='chest').x,4);
  const bad=JSON.parse(saved);bad.solo.layoutVersion=99;assert.throws(()=>decodeSave(JSON.stringify(bad)),/layout/);
});

test('preparation distinguishes resuming the old operation from deploying the new approach map',()=>{
  const old=createSoloGame(DEFAULT_BUILD,1947,'road-checkpoint',{layoutVersion:1});delete old.solo.layoutVersion;
  const saved=encodeSave(old),preferences=JSON.stringify({version:1,campaignId:'first-shift',selectedMissionId:'road-checkpoint',builds:{'road-checkpoint':DEFAULT_BUILD},completed:[]});
  const a=app({autoDeploy:false,initialStorage:[[PREPARATION_SAVE,preferences],[OPERATION_SLOT+'road-checkpoint',saved]]});
  assert.match(a.el('resume').textContent,/previous checkpoint/);assert.match(a.el('briefing-text').textContent,/Deploy Solo starts the new approach map/);
  a.el('resume').click();assert.equal(missionForState(a.s).layoutVersion,1);assert.equal(a.u.x,2);
  const fresh=app({autoDeploy:false,initialStorage:[[PREPARATION_SAVE,preferences]]});fresh.el('deploy').click();assert.equal(fresh.s.solo.layoutVersion,2);assert.equal(fresh.u.x,48);assert.equal(fresh.s.phase,'explore');
  for(const status of ['lost','extracted']){
    old.solo.status=status;
    const completed=app({autoDeploy:false,initialStorage:[[PREPARATION_SAVE,preferences],[OPERATION_SLOT+'road-checkpoint',encodeSave(old)]]});
    assert.equal(completed.el('resume').hidden,true);assert.doesNotMatch(completed.el('briefing-text').textContent,/Your save uses the previous checkpoint/);
  }
});
