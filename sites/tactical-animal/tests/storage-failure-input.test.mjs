import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSoloGame,DEFAULT_BUILD,hero,encodeSave} from '../dist/solo-game.js';
import {OPERATION_SAVE,OPERATION_SLOT,PREPARATION_SAVE} from '../dist/operation-storage.js';
import {app} from './app-harness.mjs';

function choose(a,id){a.el('operation-select').value=id;a.el('operation-select').fire('change');}
function prepare(a){a.el('menu').click();a.el('overlay-actions').children.find(button=>button.textContent==='Choose operation, animal & loadout').click();}
function move(a){const before={x:a.u.x,y:a.u.y};a.key('d');a.advance(5);a.key('d','keyup');assert.ok(Math.hypot(a.u.x-before.x,a.u.y-before.y)>0);}

test('full storage keeps a readable legacy Resume usable and leaves the existing save intact',()=>{
  const state=createSoloGame();hero(state).x=4.173;hero(state).y=24.413;hero(state).ap=7.37;
  state.solo.ledger=true;state.interactables.find(object=>object.kind==='chest').inventory=[];
  const door=state.interactables.find(object=>object.kind==='door');door.open=true;state.edges[door.edge]='door';
  delete state.solo.missionId;delete state.solo.objectives;delete state.solo.inspected;
  const saved=encodeSave(state),a=app({autoDeploy:false,initialStorage:[[OPERATION_SAVE,saved]],storageFailure:'quota'}),records=[...a.saved];
  assert.equal(a.el('resume').hidden,false);assert.match(a.el('toast').textContent,/full/i);assert.match(a.el('toast').textContent,/save preparation/i);assert.doesNotMatch(a.el('toast').textContent,/Could not read/);
  choose(a,'short-measure');assert.equal(a.el('mission-heading').textContent,'Short Measure');assert.equal(a.el('resume').hidden,true);
  choose(a,'night-ledger');assert.equal(a.el('resume').hidden,false);a.el('resume').click();
  assert.equal(a.s.solo.missionId,'night-ledger');assert.equal(a.u.x,4.173);assert.equal(a.u.y,24.413);assert.equal(a.u.ap,7.37);assert.equal(a.s.solo.ledger,true);
  assert.equal(a.s.interactables.find(object=>object.kind==='chest').inventory.length,0);assert.equal(a.s.interactables.find(object=>object.kind==='door').open,true);
  assert.match(a.el('toast').textContent,/save operation progress/i);move(a);prepare(a);assert.equal(a.el('resume').hidden,false);
  assert.deepEqual([...a.saved],records);assert.equal(a.saved.get(OPERATION_SAVE),saved);
});

test('denied writes preserve each readable mission slot and distinguish blocked storage from full storage',()=>{
  const night=createSoloGame(),mill=createSoloGame({...DEFAULT_BUILD,primary:'smg'},1947,'short-measure');hero(mill).x=3.413;hero(mill).ap=8.375;
  const initialStorage=[[OPERATION_SLOT+'night-ledger',encodeSave(night)],[OPERATION_SLOT+'short-measure',encodeSave(mill)],[PREPARATION_SAVE,JSON.stringify({version:1,campaignId:'first-shift',selectedMissionId:'short-measure',builds:{},completed:[]})]];
  const a=app({autoDeploy:false,initialStorage,storageFailure:'write-denied'}),records=[...a.saved];
  assert.equal(a.el('resume').hidden,false);assert.match(a.el('toast').textContent,/blocked/i);assert.doesNotMatch(a.el('toast').textContent,/full/i);
  choose(a,'night-ledger');assert.equal(a.el('resume').hidden,false);choose(a,'short-measure');assert.equal(a.el('resume').hidden,false);
  a.el('resume').click();assert.equal(a.s.solo.missionId,'short-measure');assert.equal(a.u.x,3.413);assert.equal(a.u.ap,8.375);assert.equal(a.u.weapon,'smg');
  move(a);assert.deepEqual([...a.saved],records);
});

for(const storageFailure of ['denied','read-denied'])test(`${storageFailure} storage does not crash startup or block temporary selection, loadouts, and play`,()=>{
  const saved=encodeSave(createSoloGame()),a=app({autoDeploy:false,initialStorage:[[OPERATION_SAVE,saved]],storageFailure}),records=[...a.saved];
  assert.equal(a.el('mission-heading').textContent,'The Night Ledger');assert.equal(a.el('resume').hidden,true);assert.equal(a.el('deploy').disabled,false);assert.match(a.el('toast').textContent,/blocked/i);
  choose(a,'short-measure');assert.equal(a.el('mission-heading').textContent,'Short Measure');a.el('primary').children[2].click(); // SMG
  choose(a,'night-ledger');choose(a,'short-measure');assert.match(a.el('build-summary').textContent,/SMG/);
  a.el('deploy').click();assert.equal(a.s.solo.missionId,'short-measure');assert.equal(a.u.weapon,'smg');assert.equal(a.el('battle').hidden,false);assert.match(a.el('toast').textContent,/keep this tab open/i);
  move(a);prepare(a);choose(a,'night-ledger');a.el('deploy').click();assert.equal(a.s.solo.missionId,'night-ledger');move(a);
  assert.deepEqual([...a.saved],records);assert.equal(a.saved.get(OPERATION_SAVE),saved);
});
