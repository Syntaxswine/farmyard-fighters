import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Core,ANIMALS,PRIMARY,DEFAULT_BUILD,createSoloGame,hero,missionMap,getMission,objectiveSecured,missionDestination,freePoint,walkSegment,lineClear,encodeSave,decodeSave,refresh} from '../dist/solo-game.js';
import {validateMission} from '../dist/missions.js';
import {WALL_DIMENSIONS} from '../dist/world-dimensions.js';
import {playRoute,SHORT_MEASURE_ROUTE,SHORT_MEASURE_ALTERNATE} from './operation-scenarios.mjs';

const operation=()=>createSoloGame(DEFAULT_BUILD,1947,'short-measure');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('the original operation retains its exact terrain, edges, positions, and encounter',()=>{
  const map=missionMap(),state=createSoloGame();
  // Hashes from the original map generator at main 85c8a2e, before extraction
  // into mission data. Deliberately independent of the new generator.
  const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(hash(map.terrain),'6e8ec16901abba1ba3c0d308099105004803ebe5f03eeae4a3e702dddb105230');
  assert.equal(hash(map.edges),'375c6e19a72aa5f39ffa01d77b470ae21f069043a4e52abcd18619ba8b23c93a');
  assert.deepEqual([hero(state).x,hero(state).y],[5,24]);
  assert.deepEqual(state.units.slice(1).map(u=>[u.name,u.x,u.y,u.weapon,u.heading,u.hp>0]),[
    ['Boris',16,12,'pistol',0,true],['Lev',29,19,'rifle',90,true],['Oleg',30,5,'pistol',0,true],['Ilya',6.9,23.7,'pistol',160,false],
  ]);
  assert.equal(state.interactables.find(o=>o.id==='warehouse-door').open,false);
});

test('Short Measure is a solo operation for every existing animal and primary loadout',()=>{
  const definition=getMission('short-measure');assert.deepEqual(validateMission(definition),[]);
  for(const animal of ANIMALS)for(const primary of PRIMARY){
    const state=createSoloGame({...DEFAULT_BUILD,animal:animal.id,primary},1947,definition.id),unit=hero(state);
    assert.equal(state.units.filter(u=>u.team==='squad').length,1);assert.equal(unit.species,animal.species);assert.equal(unit.weapon,primary);
    assert.deepEqual([unit.x,unit.y],[4,25]);assert.ok(freePoint(state,unit,unit.id));assert.equal(state.detected.size,0);
    for(const guard of state.units.slice(1))assert.ok(freePoint(state,guard,guard.id));
  }
  const state=operation();assert.deepEqual(state.interactables.filter(o=>o.kind==='door').map(o=>state.edges[o.edge]),Array(9).fill('closed-door'));
  assert.deepEqual(missionDestination(state),definition.objective);assert.equal(WALL_DIMENSIONS.height,2);
});

test('a legal controller loots, inspects, fights, opens both door orientations, collects, and extracts',()=>{
  const state=operation();playRoute(state,SHORT_MEASURE_ROUTE);
  assert.equal(state.solo.status,'extracted');assert.ok(state.round>0);assert.ok(hero(state).hp>0);assert.ok(state.solo.distance>65);
  assert.equal(objectiveSecured(state),true);assert.equal(state.solo.ledger,false);
  assert.deepEqual(state.solo.inspected,['worker-scale','sealed-load']);
  assert.equal(state.interactables.find(o=>o.id==='supply-chest').inventory.length,0);
  assert.ok(state.log.some(message=>message.includes('Pump Station 3')));
});

test('the alternate west and north route reaches dispatch without using the packing hall',()=>{
  const state=operation();playRoute(state,SHORT_MEASURE_ALTERNATE);
  assert.equal(state.solo.status,'extracted');assert.ok(hero(state).hp>0);
  assert.ok(state.interactables.filter(o=>o.id.startsWith('packing-')).every(o=>!o.open));
});

test('every new doorway changes collision, sight, grenade paths, and navigation immediately',()=>{
  for(const door of operation().interactables.filter(o=>o.kind==='door')){
    const state=operation(),unit=hero(state),horizontal=door.edge[0]==='s';
    for(const guard of state.units.slice(1))guard.alert=false;
    const outside={x:door.x+(horizontal?0:-door.swing*.9),y:door.y+(horizontal?-door.swing*.9:0)};
    const inside={x:door.x+(horizontal?0:door.swing*.9),y:door.y+(horizontal?door.swing*.9:0)};
    Object.assign(unit,outside,{ap:12,heading:Core.headingTo(outside,inside)});state.phase='player';state.engaged=true;unit.ammo.grenade=1;
    state.seen.add(Core.key(inside.x,inside.y));
    assert.equal(walkSegment(state,unit,inside,unit.id),false,door.id);assert.equal(lineClear(state,unit,inside),false,door.id);
    assert.equal(Core.previewGrenade(state,unit,inside).reason,'Throw path is blocked',door.id);
    state.queue=[inside];assert.equal(Core.performInteraction(state,door.id,'open').ok,true,door.id);
    assert.equal(state.queue.length,0);assert.equal(state.edges[door.edge],'door');
    assert.equal(walkSegment(state,unit,inside,unit.id),true,door.id);assert.equal(lineClear(state,unit,inside),true,door.id);
    assert.equal(Core.navigationPath(state,unit,inside.x,inside.y).length,1,door.id);assert.equal(Core.previewGrenade(state,unit,inside).ok,true,door.id);
    assert.equal(Core.performInteraction(state,door.id,'close').ok,true,door.id);
    assert.equal(walkSegment(state,unit,inside,unit.id),false,door.id);assert.equal(lineClear(state,unit,inside),false,door.id);
    close(unit.ap,10);
  }
});

test('neither operation completes on guard deaths or a remote objective/extraction action',()=>{
  for(const id of ['night-ledger','short-measure']){
    const state=createSoloGame(DEFAULT_BUILD,1947,id),unit=hero(state),mission=getMission(id);
    state.units.slice(1).forEach(guard=>guard.hp=0);refresh(state);
    assert.equal(state.phase,'won');assert.equal(state.solo.status,'active');assert.equal(objectiveSecured(state),false);
    const before=encodeSave(state);assert.equal(Core.performInteraction(state,'extraction','extract').ok,false);assert.equal(encodeSave(state),before);
    assert.equal(Core.performInteraction(state,mission.objective.id,'collect').ok,false);
    Object.assign(unit,{x:mission.objective.x,y:mission.objective.y});assert.equal(Core.performInteraction(state,mission.objective.id,'collect').ok,true);
    assert.equal(state.solo.status,'active');assert.deepEqual(missionDestination(state),mission.extraction);
    assert.equal(Core.performInteraction(state,'extraction','extract').ok,false);
    Object.assign(unit,{x:mission.extraction.x,y:mission.extraction.y});assert.equal(Core.performInteraction(state,'extraction','extract').ok,true);assert.equal(state.solo.status,'extracted');
  }
});

test('a partially played Short Measure save resumes exact positions, loot, doors, AP, and notes',()=>{
  const state=operation(),manifestStep=SHORT_MEASURE_ROUTE.findIndex(step=>step.action==='collect');
  playRoute(state,SHORT_MEASURE_ROUTE.slice(0,manifestStep+1));
  const restored=decodeSave(encodeSave(state));assert.equal(encodeSave(restored),encodeSave(state));
  assert.equal(restored.solo.missionId,'short-measure');assert.equal(objectiveSecured(restored),true);
  playRoute(restored,SHORT_MEASURE_ROUTE.slice(manifestStep+1));assert.equal(restored.solo.status,'extracted');
});

test('saves without a mission ID migrate to Night Ledger without replacing any played state',()=>{
  const state=createSoloGame();hero(state).x=4.173;hero(state).y=24.413;hero(state).ap=7.37;
  state.solo.ledger=true;state.solo.distance=18.119;state.interactables.find(o=>o.id==='supply-chest').inventory=[];
  const door=state.interactables.find(o=>o.kind==='door');door.open=true;state.edges[door.edge]='door';
  const legacy=JSON.parse(encodeSave(state));delete legacy.solo.missionId;delete legacy.solo.objectives;delete legacy.solo.inspected;
  const restored=decodeSave(JSON.stringify(legacy));
  assert.equal(restored.solo.missionId,'night-ledger');assert.equal(objectiveSecured(restored),true);
  assert.deepEqual(restored.units,state.units);assert.deepEqual(restored.map,state.map);assert.deepEqual(restored.edges,state.edges);assert.deepEqual(restored.interactables,state.interactables);
  close(restored.solo.distance,18.119);close(hero(restored).ap,7.37);
  const invalid=JSON.parse(encodeSave(state));invalid.solo.missionId='unshipped-mission';assert.throws(()=>decodeSave(JSON.stringify(invalid)),/Unknown operation/);
  const incomplete=JSON.parse(encodeSave(operation()));delete incomplete.interactables;assert.throws(()=>decodeSave(JSON.stringify(incomplete)),/missing its saved objects/);
});
