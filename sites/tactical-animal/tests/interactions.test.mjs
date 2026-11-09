import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Core,createSoloGame,hero,encodeSave,decodeSave,BRIEF,walkSegment,lineClear} from '../dist/solo-game.js';
import {selectInteractionTarget,doorFootprint} from '../dist/interactions.js';

const chest=state=>state.interactables.find(object=>object.kind==='chest');
const door=state=>state.interactables.find(object=>object.kind==='door');
function combat(){const state=createSoloGame();state.engaged=true;state.phase='player';hero(state).ap=12;return state;}
function atDoor(state,side=-1){const unit=hero(state),object=door(state);unit.x=object.x+side*.75;unit.y=object.y;Core.refresh(state,{forceFog:true});return object;}

test('hand candidates require clear reach and never activate an object through a wall or crate',()=>{
  const state=createSoloGame(),unit=hero(state),object=chest(state);
  assert.ok(Core.nearbyInteractions(state).some(candidate=>candidate.id===object.id));
  unit.x=3;assert.ok(!Core.nearbyInteractions(state).some(candidate=>candidate.id===object.id));
  unit.x=7;unit.y=18;object.x=8;object.y=18;
  assert.ok(!Core.nearbyInteractions(state).some(candidate=>candidate.id===object.id));
  assert.ok(Core.nearbyInteractions(state).some(candidate=>candidate.kind==='door'),'The door itself can be reached from its near face');
  object.x=11;object.y=18;unit.x=11;unit.y=16;
  assert.ok(!Core.nearbyInteractions(state).some(candidate=>candidate.id===object.id));
});

test('targeting selects the nearest object and holds that selection until it becomes unavailable',()=>{
  const first={id:'first',distance:1.2},second={id:'second',distance:1};
  assert.equal(selectInteractionTarget([first,second]).id,'second');
  assert.equal(selectInteractionTarget([first,second],'first').id,'first');
  assert.equal(selectInteractionTarget([second],'first').id,'second');
  assert.equal(selectInteractionTarget([]),null);
});

test('valid positions beside a chest corner can still reach a nearby body',()=>{
  const state=createSoloGame(),unit=hero(state);unit.x=6.12;unit.y=23.08;
  assert.equal(Core.nearbyInteractions(state).some(object=>object.id==='body:4'),true);
});

test('opening a chest and taking all loot charge each action once without equipping anything',()=>{
  const state=combat(),unit=hero(state),object=chest(state),weapon=unit.weapon,loaded=unit.ammo.assault,reserve=unit.ammoPouch.assault;
  assert.equal(Core.performInteraction(state,object.id,'open').ok,true);assert.equal(unit.ap,10);
  assert.equal(Core.performInteraction(state,object.id,'loot').ok,true);assert.equal(unit.ap,10);
  assert.equal(Core.performInteraction(state,object.id,'take-all').ok,true);assert.equal(unit.ap,9);
  assert.equal(unit.weapon,weapon);assert.equal(unit.ammo.assault,loaded);assert.equal(unit.ammoPouch.assault,reserve+30);
  assert.equal(state.solo.dressings,3);assert.equal(unit.ammo.grenade,1);assert.ok(unit.pack.some(item=>item.kind==='grenade'));
  assert.deepEqual(object.inventory,[]);
  const before=encodeSave(state);assert.equal(Core.performInteraction(state,object.id,'take-all').ok,false);assert.equal(encodeSave(state),before);
});

test('single-item pickup leaves other items for a later bulk transfer',()=>{
  const state=combat(),object=chest(state);Core.performInteraction(state,object.id,'open');
  assert.equal(Core.performInteraction(state,object.id,'take','field-dressing').ok,true);assert.equal(state.solo.dressings,3);assert.equal(object.inventory.length,2);
  Core.performInteraction(state,object.id,'take-all');assert.equal(state.solo.dressings,3);assert.equal(object.inventory.length,0);assert.equal(hero(state).ap,8);
});

test('invalid or stale loot commands never spend AP, move items, or change state',()=>{
  for(const reason of ['closed','enemy','ap','reach','missing-item','unknown-action']){
    const state=combat(),object=chest(state),unit=hero(state);
    if(reason!=='closed')Core.performInteraction(state,object.id,'open');
    if(reason==='enemy')state.phase='enemy';if(reason==='ap')unit.ap=.99;if(reason==='reach')unit.x=2;
    const before=encodeSave(state),action=reason==='missing-item'?'take':reason==='unknown-action'?'teleport':'take-all';
    assert.equal(Core.performInteraction(state,object.id,action,'missing').ok,false,reason);assert.equal(encodeSave(state),before,reason);
  }
});

test('door changes invalidate collision, vision, grenade previews, and queued routes immediately',()=>{
  const state=combat(),unit=hero(state),object=atDoor(state),inside={x:8.3,y:18};
  unit.ammo.grenade=1;
  assert.equal(walkSegment(state,unit,inside,unit.id),false);assert.equal(lineClear(state,unit,inside),false);
  assert.equal(Core.canSee(state,unit,{...unit,...inside}),false);
  const blockedPath=Core.navigationPath(state,unit,inside.x,inside.y);assert.ok(blockedPath?.length>1,'Closed door requires a detour');
  state.seen.add('8,18');const closedGeometry=Core.previewGrenade(state,unit,inside);assert.equal(closedGeometry.reason,'Throw path is blocked');
  state.queue=[{x:8.3,y:18}];assert.equal(Core.performInteraction(state,object.id,'open').ok,true);assert.equal(state.queue.length,0);
  assert.equal(walkSegment(state,unit,inside,unit.id),true);assert.equal(Core.canSee(state,unit,{...unit,...inside}),true);assert.equal(Core.previewGrenade(state,unit,inside).ok,true);
  assert.equal(Core.navigationPath(state,unit,inside.x,inside.y).length,1);
  assert.equal(state.edges[object.edge],'door');assert.ok(state.visible.has('8,18'));
  assert.equal(Core.performInteraction(state,object.id,'close').ok,true);assert.equal(walkSegment(state,unit,inside,unit.id),false);assert.equal(Core.canSee(state,unit,{...unit,...inside}),false);
});

test('a door cannot open into or close onto a living animal, with no AP loss',()=>{
  const state=combat(),unit=hero(state),object=atDoor(state),other=state.units[1],open=doorFootprint(object,true);
  other.x=(open.x0+open.x1)/2;other.y=(open.y0+open.y1)/2;
  let before=encodeSave(state);assert.equal(Core.performInteraction(state,object.id,'open').ok,false);assert.equal(encodeSave(state),before);
  other.x=16;other.y=12;Core.performInteraction(state,object.id,'open');unit.x=object.x;unit.y=object.y;
  before=encodeSave(state);assert.equal(Core.performInteraction(state,object.id,'close').ok,false);assert.equal(encodeSave(state),before);
});

test('body search uses the shared loot actions and preserves empty state across saves',()=>{
  let state=combat(),unit=hero(state);const body=state.interactables.find(object=>object.kind==='body');unit.x=6.5;unit.y=24;
  assert.equal(Core.performInteraction(state,body.id,'search').ok,true);assert.equal(unit.ap,10);
  assert.equal(Core.performInteraction(state,body.id,'take-all').ok,true);assert.equal(unit.ap,9);assert.equal(unit.ammoPouch.pistol,56);
  state=decodeSave(encodeSave(state));assert.equal(state.interactables.find(object=>object.id===body.id).inventory.length,0);
  assert.equal(Core.performInteraction(state,body.id,'take-all').ok,false);
});

test('newly defeated guards acquire one persistent loot inventory with their remaining ammunition',()=>{
  const state=combat(),unit=hero(state),guard=state.units[1];unit.x=4;unit.y=25;guard.x=8;guard.y=25;guard.hp=1;guard.ammo.pistol=3;unit.ap=100;
  for(let i=0;i<15&&guard.hp>0;i++){state.detected.add(guard.id);Core.attack(state,unit,guard,true);}
  assert.equal(guard.hp,0);const record=state.interactables.find(object=>object.id==='body:'+guard.id);assert.ok(record);assert.equal(record.inventory[0].rounds,3);
  assert.equal(decodeSave(encodeSave(state)).interactables.filter(object=>object.id===record.id).length,1);
});

test('saving restores closed/open doors, searched chests, and remaining items without regenerating loot',()=>{
  const state=combat(),object=chest(state);Core.performInteraction(state,object.id,'open');Core.performInteraction(state,object.id,'take','field-dressing');
  atDoor(state);Core.performInteraction(state,door(state).id,'open');
  const restored=decodeSave(encodeSave(state));assert.equal(door(restored).open,true);assert.equal(restored.edges[door(restored).edge],'door');
  assert.equal(chest(restored).open,true);assert.equal(chest(restored).searched,true);assert.equal(chest(restored).inventory.length,2);
  assert.equal(restored.solo.dressings,3);
  const legacy=JSON.parse(encodeSave(state));delete legacy.interactables;const upgraded=decodeSave(JSON.stringify(legacy));assert.equal(door(upgraded).open,true);assert.ok(chest(upgraded));
});

test('ledger and extraction use the same reach, AP, and turn validation as other objects',()=>{
  const state=combat(),unit=hero(state);unit.x=BRIEF.objective.x;unit.y=BRIEF.objective.y;
  assert.equal(Core.performInteraction(state,'ledger','collect').ok,true);assert.equal(unit.ap,10);
  unit.x=BRIEF.extraction.x;unit.y=BRIEF.extraction.y;state.phase='enemy';
  const before=encodeSave(state);assert.equal(Core.performInteraction(state,'extraction','extract').ok,false);assert.equal(encodeSave(state),before);
  state.phase='player';assert.equal(Core.performInteraction(state,'extraction','extract').ok,true);assert.equal(state.solo.status,'extracted');
});
