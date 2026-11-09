import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_BUILD,createSoloGame,hero,encodeSave,decodeSave,normalizeBuild} from '../dist/solo-game.js';
import {createOperationStorage,OPERATION_SAVE,OPERATION_SLOT,PREPARATION_SAVE} from '../dist/operation-storage.js';

function setup(entries=[]){
  const records=new Map(entries),backend={getItem:key=>records.get(key),setItem:(key,value)=>records.set(key,value)};
  return {records,store:createOperationStorage(backend,{normalizeBuild,encodeSave,decodeSave})};
}

test('fresh preparation offers the original operations and sector mission without a completion gate or active save',()=>{
  const {records,store}=setup(),preferences=store.preferences();
  assert.equal(preferences.selectedMissionId,'night-ledger');assert.deepEqual(Object.keys(preferences.builds),['night-ledger','short-measure','road-checkpoint']);
  assert.deepEqual(preferences.completed,[]);assert.equal(store.read('night-ledger'),null);assert.equal(store.read('short-measure'),null);assert.equal(store.read('road-checkpoint'),null);assert.equal(records.size,0);
});

test('browsing and changing loadouts never overwrite either operation save',()=>{
  const {records,store}=setup(),night=createSoloGame(),mill=createSoloGame(DEFAULT_BUILD,1947,'short-measure');
  hero(night).x=4.213;hero(night).ap=5.375;hero(mill).x=3.713;hero(mill).ap=8.125;
  store.write(night);store.write(mill);const before=[store.read('night-ledger'),store.read('short-measure')];
  const alternative={...DEFAULT_BUILD,primary:'smg',utility:'grenade'};
  store.savePreparation('short-measure',alternative);store.savePreparation('night-ledger',DEFAULT_BUILD);
  assert.deepEqual([store.read('night-ledger'),store.read('short-measure')],before);
  assert.deepEqual(store.preferences().builds['short-measure'],alternative);
  assert.equal(hero(store.load('short-measure')).ap,8.125);assert.equal(hero(store.load('night-ledger')).x,4.213);
  assert.ok(records.has(PREPARATION_SAVE));assert.ok(records.has(OPERATION_SLOT+'night-ledger'));assert.ok(records.has(OPERATION_SLOT+'short-measure'));
});

test('a legacy single-slot save belongs to Night Ledger and is not offered as Short Measure',()=>{
  const state=createSoloGame();delete state.solo.missionId;delete state.solo.objectives;delete state.solo.inspected;
  hero(state).x=3.317;hero(state).ap=6.125;state.solo.ledger=true;state.interactables.find(o=>o.kind==='chest').inventory=[];
  const {store}=setup([[OPERATION_SAVE,encodeSave(state)]]);
  assert.equal(store.read('short-measure'),null);assert.throws(()=>store.load('short-measure'),/No saved Short Measure/);
  const loaded=store.load('night-ledger');assert.equal(hero(loaded).x,3.317);assert.equal(hero(loaded).ap,6.125);assert.equal(loaded.solo.ledger,true);
  assert.equal(loaded.interactables.find(o=>o.kind==='chest').inventory.length,0);
  store.savePreparation('short-measure',{...DEFAULT_BUILD,primary:'rifle'});assert.equal(hero(store.load('night-ledger')).x,3.317);
  store.write(createSoloGame(DEFAULT_BUILD,1947,'short-measure'));
  assert.equal(hero(store.load('night-ledger')).x,3.317);assert.equal(hero(store.load('night-ledger')).ap,6.125);
  assert.equal(store.load('night-ledger').interactables.find(o=>o.kind==='chest').inventory.length,0);
});

test('completion records are versioned separately from mission state and selected preparation',()=>{
  const {records,store}=setup(),night=createSoloGame(),mill=createSoloGame(DEFAULT_BUILD,1947,'short-measure');
  store.savePreparation('short-measure',{...DEFAULT_BUILD,primary:'smg'});
  mill.solo.status='extracted';store.write(mill);store.write(mill);store.write(night);
  const preferences=store.preferences();assert.deepEqual(preferences.completed,['short-measure']);assert.equal(preferences.selectedMissionId,'short-measure');assert.equal(preferences.builds['short-measure'].primary,'smg');
  assert.equal(store.load('short-measure').solo.status,'extracted');assert.equal(store.load('night-ledger').solo.status,'active');
  const raw=JSON.parse(records.get(PREPARATION_SAVE));assert.equal(raw.version,1);assert.equal(raw.campaignId,'first-shift');assert.equal(raw.units,undefined);assert.equal(raw.currency,undefined);
});

test('unknown operations, wrong mission slots, and corrupt save data fail explicitly',()=>{
  const {records,store}=setup();assert.throws(()=>store.read('future-mission'),/Unknown operation/);
  records.set(OPERATION_SLOT+'short-measure',encodeSave(createSoloGame()));assert.throws(()=>store.load('short-measure'),/different mission/);
  records.set(OPERATION_SLOT+'short-measure','{');assert.throws(()=>store.load('short-measure'),SyntaxError);
  records.set(PREPARATION_SAVE,JSON.stringify({version:2}));assert.throws(()=>store.preferences(),/Unsupported operation preferences/);
});
