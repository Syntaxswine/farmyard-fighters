import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Core,DEFAULT_BUILD,FIRST_REALTIME_MISSION,createSoloGame,decodeSave} from '../dist/solo-game.js';
import {searchHaloCandidates} from '../dist/search-halo.js';
import {app} from './app-harness.mjs';

const action=(app,text)=>app.el('overlay-actions').children.find(button=>button.textContent.startsWith(text));
const halo=(state,id)=>searchHaloCandidates(state).some(object=>object.id===id);

test('Quiet Shift keeps the hand and halo on a partially looted chest and hides them when emptied',()=>{
  const state=createSoloGame({...DEFAULT_BUILD,utility:'grenade'},1947,FIRST_REALTIME_MISSION.id),a=app({realTime:true,initialState:state});
  const id='supply-chest',before={ap:a.u.ap,dressings:a.s.solo.dressings,grenades:a.u.ammo.grenade};
  assert.equal(a.el('interaction-hand').hidden,false);assert.equal(a.el('interaction-label').textContent,'Open');
  assert.equal(halo(state,id),true);
  a.el('interaction-hand').click();assert.equal(a.el('overlay').open,true);
  action(a,'Take Field dressing').click();assert.equal(a.s.solo.dressings,before.dressings+1);
  action(a,'Return to operation').click();a.advance(3);
  assert.equal(a.el('interaction-hand').hidden,false);assert.equal(a.el('interaction-label').textContent,'Loot');
  assert.equal(halo(state,id),true);
  a.el('interaction-hand').click();action(a,'Take all').click();
  assert.equal(a.u.ammo.grenade,before.grenades+1);assert.equal(a.u.ap,before.ap);
  assert.equal(a.el('overlay').open,false);assert.equal(a.el('interaction-hand').hidden,true);assert.equal(halo(state,id),false);
  const restored=decodeSave(a.saved.get('farmyard-fighters:tactical-animal-operation-v2'));
  const chest=Core.interactionObjects(restored).find(object=>object.id===id);
  assert.equal(chest.open,true);assert.deepEqual(chest.inventory,[]);
  assert.equal(app({realTime:true,initialState:restored}).el('interaction-hand').hidden,true);
});

test('opening hand choices is free, and activating a costly action with insufficient AP spends nothing',()=>{
  const a=app();a.s.engaged=true;a.s.phase='player';a.u.ap=1;a.advance(3);
  a.el('interaction-hand').fire('keydown',{key:'ArrowDown'});assert.equal(a.el('overlay').open,true);assert.equal(a.u.ap,1);
  assert.equal(action(a,'Open').disabled,true);action(a,'Return to operation').click();a.el('interaction-hand').click();assert.equal(a.u.ap,1);
  assert.equal(a.s.interactables.find(object=>object.kind==='chest').open,false);
});

test('the hand hides during grenade aim and guard turns, and returns without changing inventory',()=>{
  const a=app();assert.equal(a.el('interaction-hand').hidden,false);
  a.el('grenade').click();assert.equal(a.el('interaction-hand').hidden,true);a.el('cancel-grenade').click();assert.equal(a.el('interaction-hand').hidden,false);
  a.s.phase='player';Core.endTurn(a.s);a.advance(3);assert.equal(a.el('interaction-hand').hidden,true);
});

test('tapping a nearby body changes stable focus without looting it or equipping hands',()=>{
  const a=app(),weapon=a.u.weapon;a.u.x=6.2;a.u.y=23.3;a.advance(3);
  a.view.options.onPick({interactionId:'body:4'});assert.equal(a.el('interaction-label').textContent,'Search');assert.equal(a.u.weapon,weapon);
  a.advance(3);assert.match(a.el('interaction-hand')['aria-label'],/fallen guard/);
  assert.equal(a.s.interactables.find(object=>object.id==='body:4').searched,false);
});

test('taking the last item from a body retires its hand and halo immediately',()=>{
  const a=app(),id='body:4';a.u.x=6.5;a.u.y=24;a.advance(3);
  a.view.options.onPick({interactionId:id});assert.equal(a.el('interaction-label').textContent,'Search');
  assert.equal(halo(a.s,id),true);a.el('interaction-hand').click();
  action(a,`Take ${Core.WEAPONS.pistol.short} ammunition`).click();assert.equal(halo(a.s,id),true);
  action(a,`Take ${Core.WEAPONS.pistol.name} ·`).click();
  assert.equal(a.el('overlay').open,false);assert.equal(a.el('interaction-hand').hidden,true);assert.equal(halo(a.s,id),false);
  const toast=a.el('toast').textContent;
  a.view.options.onPick({interactionId:id});assert.equal(a.el('toast').textContent,toast);assert.equal(a.el('interaction-hand').hidden,true);
  assert.ok(Core.interactionObjects(a.s).some(object=>object.id===id));
});
