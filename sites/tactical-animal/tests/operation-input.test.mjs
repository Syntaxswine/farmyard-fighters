import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Core,createSoloGame,DEFAULT_BUILD,encodeSave,getMission} from '../dist/solo-game.js';
import {OPERATION_SLOT,PREPARATION_SAVE} from '../dist/operation-storage.js';
import {app} from './app-harness.mjs';

function choose(app,id){app.el('operation-select').value=id;app.el('operation-select').fire('change');}
function action(app,label){const button=app.el('overlay-actions').children.find(button=>button.textContent===label);assert.ok(button,'Missing action: '+label);button.click();}
function preparation(app){app.el('menu').click();action(app,'Choose operation, animal & loadout');}

test('the real preparation selector and deployment use each operation definition',()=>{
  const a=app({autoDeploy:false});assert.equal(a.el('mission-heading').textContent,'The Night Ledger');assert.equal(a.el('resume').hidden,true);
  choose(a,'short-measure');assert.equal(a.el('mission-heading').textContent,'Short Measure');assert.match(a.el('briefing-text').textContent,/dispatch records/);assert.match(a.el('mission-steps').innerHTML,/east loading gate/);assert.equal(a.el('resume').hidden,true);
  a.el('deploy').click();assert.equal(a.s.solo.missionId,'short-measure');assert.deepEqual([a.u.x,a.u.y],[4,25]);
  preparation(a);choose(a,'night-ledger');assert.equal(a.el('mission-heading').textContent,'The Night Ledger');assert.equal(a.el('resume').hidden,true);
  a.el('deploy').click();assert.equal(a.s.solo.missionId,'night-ledger');assert.deepEqual([a.u.x,a.u.y],[5,24]);
});

test('changing operations disposes the old view, clears held movement and grenade aim, and preserves its save',()=>{
  const a=app(),oldView=a.view,oldState=a.s;
  a.u.x=4.117;a.u.y=24.223;a.u.ap=7.625;a.s.queue=[{x:4,y:26}];
  a.key('g');a.drag(25,0);assert.equal(oldView.aiming,true);a.key('w');
  preparation(a);assert.equal(oldView.disposed,true);assert.equal(oldView.aiming,false);assert.deepEqual(oldState.queue,[]);
  const oldSave=a.saved.get(OPERATION_SLOT+'night-ledger');
  choose(a,'short-measure');a.el('deploy').click();const start={x:a.u.x,y:a.u.y};a.advance(4);
  assert.deepEqual({x:a.u.x,y:a.u.y},start);assert.equal(a.el('grenade-aim').hidden,true);assert.equal(a.saved.get(OPERATION_SLOT+'night-ledger'),oldSave);
  preparation(a);choose(a,'night-ledger');assert.equal(a.el('resume').hidden,false);a.el('resume').click();
  assert.equal(a.s.solo.missionId,'night-ledger');assert.equal(a.u.x,4.117);assert.equal(a.u.y,24.223);assert.equal(a.u.ap,7.625);assert.equal(a.view.aiming,undefined);
});

test('reloading the app resumes Short Measure with its played loadout, not edited preparation',()=>{
  const state=createSoloGame({...DEFAULT_BUILD,primary:'smg'},1947,'short-measure');state.units[0].x=3.413;state.units[0].ap=8.375;
  state.interactables.find(o=>o.kind==='chest').inventory=[];
  const a=app({autoDeploy:false,initialStorage:[
    [OPERATION_SLOT+'short-measure',encodeSave(state)],
    [PREPARATION_SAVE,JSON.stringify({version:1,campaignId:'first-shift',selectedMissionId:'short-measure',builds:{'short-measure':{...DEFAULT_BUILD,primary:'rifle'}},completed:[]})],
  ]});
  assert.equal(a.el('resume').hidden,false);assert.equal(a.el('mission-heading').textContent,'Short Measure');a.el('resume').click();
  assert.equal(a.s.solo.missionId,'short-measure');assert.equal(a.u.x,3.413);assert.equal(a.u.ap,8.375);assert.equal(a.u.weapon,'smg');assert.equal(a.s.interactables.find(o=>o.kind==='chest').inventory.length,0);
  a.el('menu').click();action(a,'Restart this operation');assert.equal(a.s.solo.missionId,'short-measure');assert.deepEqual([a.u.x,a.u.y],[4,25]);assert.equal(a.u.weapon,'smg');assert.equal(a.views[0].disposed,true);
});

test('objective hand, assignment, results, and replay show the selected mission rather than the ledger',()=>{
  const a=app({autoDeploy:false});choose(a,'short-measure');a.el('deploy').click();
  a.s.units.slice(1).forEach(g=>g.hp=0);Core.refresh(a.s);const mission=getMission('short-measure');
  Object.assign(a.u,{x:mission.objective.x,y:mission.objective.y});a.advance(4);
  assert.match(a.el('interaction-hand')['aria-label'],/Collect Shipping manifest/);a.el('interaction-hand').click();
  assert.equal(a.s.solo.objectives['shipping-manifest'],true);assert.match(a.el('overlay-content').innerHTML,/Reserve 7/);assert.equal(a.s.solo.status,'active');
  action(a,'Return to operation');a.el('menu').click();action(a,'Mission & combat log');assert.match(a.el('overlay-content').innerHTML,/east loading gate/);assert.doesNotMatch(a.el('overlay-content').innerHTML,/wage ledger/);
  action(a,'Return to operation');Object.assign(a.u,{x:35,y:25});a.advance(4);a.el('interaction-hand').click();
  assert.equal(a.s.solo.status,'extracted');assert.match(a.el('overlay-content').innerHTML,/The manifest is out/);assert.match(a.el('overlay-content').innerHTML,/Pump Station 3/);
  action(a,'Replay this loadout');assert.equal(a.s.solo.missionId,'short-measure');assert.deepEqual(a.s.solo.objectives,{});assert.deepEqual([a.u.x,a.u.y],[4,25]);
});
