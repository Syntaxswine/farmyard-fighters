import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSoloGame,DEFAULT_BUILD,encodeSave,decodeSave} from '../dist/solo-game.js';
import {OPERATION_SLOT,PREPARATION_SAVE} from '../dist/operation-storage.js';
import {app} from './app-harness.mjs';

function selectedSave(){
  const state=createSoloGame(DEFAULT_BUILD,1947,'short-measure');state.solo.spottedGuardIds=[1];
  return [
    [OPERATION_SLOT+'short-measure',encodeSave(state)],
    [PREPARATION_SAVE,JSON.stringify({version:1,campaignId:'first-shift',selectedMissionId:'short-measure',builds:{},completed:[]})],
  ];
}
function action(a,label){const button=a.el('overlay-actions').children.find(b=>b.textContent===label);assert.ok(button,label);button.click();}

test('the merged expanded map keeps the active operation labels and metal frame',()=>{
  const a=app({autoDeploy:false,initialStorage:selectedSave()});a.el('resume').click();
  a.el('minimap-button').click();
  assert.match(a.el('overlay-content').innerHTML,/EAST FEED MILL \/ TACTICAL MAP/);
  assert.match(a.el('overlay-content').innerHTML,/map-metal-frame map-expanded-frame/);
  assert.match(a.el('overlay-content').innerHTML,/Green: extraction/);
  assert.doesNotMatch(a.el('overlay-content').innerHTML,/MILL 04/);
});

test('zero-stamina running, mission-specific saves and remembered contacts survive the combined lifecycle',()=>{
  const a=app({autoDeploy:false,initialStorage:selectedSave()});a.el('resume').click();
  assert.equal(a.s.solo.missionId,'short-measure');assert.deepEqual(a.s.solo.spottedGuardIds,[1]);
  a.u.running=true;a.u.stamina=0;const start=a.u.x;a.key('d');a.advance(5);a.key('d','keyup');
  assert.ok(a.u.x>start);assert.equal(a.u.running,true);assert.equal(a.el('movement-label').textContent,'RUN');
  a.el('menu').click();action(a,'Choose operation, animal & loadout');
  const restored=decodeSave(a.saved.get(OPERATION_SLOT+'short-measure'));
  assert.equal(restored.solo.missionId,'short-measure');assert.equal(restored.units[0].running,true);assert.deepEqual(restored.solo.spottedGuardIds,[1]);
  const b=app({autoDeploy:false,initialStorage:[...a.saved]});b.el('resume').click();
  assert.equal(b.s.solo.missionId,'short-measure');assert.equal(b.u.x,restored.units[0].x);assert.deepEqual(b.s.solo.spottedGuardIds,[1]);
});
