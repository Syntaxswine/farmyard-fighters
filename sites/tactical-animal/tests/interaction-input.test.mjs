import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Core,decodeSave} from '../dist/solo-game.js';
import {app} from './app-harness.mjs';

const action=(app,text)=>app.el('overlay-actions').children.find(button=>button.textContent.startsWith(text));

test('the contextual hand opens a chest, exposes Take all, disables it when empty, and saves the transfer',()=>{
  const a=app(),before={ap:a.u.ap,dressings:a.s.solo.dressings,grenades:a.u.ammo.grenade};
  assert.equal(a.el('interaction-hand').hidden,false);assert.equal(a.el('interaction-label').textContent,'Open');
  a.el('interaction-hand').click();assert.equal(a.el('overlay').open,true);assert.ok(action(a,'Take all'));
  action(a,'Take all').click();assert.equal(a.s.solo.dressings,before.dressings+1);assert.equal(a.u.ammo.grenade,before.grenades+1);assert.equal(a.u.ap,before.ap);
  assert.equal(action(a,'Take all').disabled,true);
  action(a,'Take all').click();assert.equal(a.s.solo.dressings,before.dressings+1);
  const restored=decodeSave(a.saved.get('tactical-animal-operation-v2'));assert.equal(restored.interactables.find(object=>object.kind==='chest').inventory.length,0);
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
