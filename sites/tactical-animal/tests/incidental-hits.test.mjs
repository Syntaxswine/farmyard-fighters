import test from 'node:test';
import assert from 'node:assert/strict';
import {Core,createSoloGame,DEFAULT_BUILD,hero,tick} from '../dist/solo-game.js';
import {windowReviewSource,WINDOW_REVIEW_ID} from '../dist/window-review-map.js';

function stackedDefenders({wall=false,nearer=false}={}){
  const source=windowReviewSource();
  source.edges=wall?{'e:29:25':'wall-brick'}:{};
  source.farmyardWindows.instances=[];
  source.guards=[
    {name:'Intended target',species:'pig-foreman',weapon:'pistol',x:28,y:25,heading:180},
    {name:'Offset defender',species:'pig-foreman',weapon:'pistol',x:30,y:25.55,heading:180},
    ...(nearer?[{name:'Near defender',species:'pig-foreman',weapon:'pistol',x:29,y:25.55,heading:180}]:[])
  ];
  const state=Core.enableRealtime(createSoloGame(DEFAULT_BUILD,20,WINDOW_REVIEW_ID,{authoredMap:source}));
  const player=hero(state);
  player.stats.firearms=player.stats.dexterity=30;
  // Declared injured defenders make the first accidental hit lethal, so this
  // exercises production kill credit and corpse interaction registration too.
  for(const guard of state.units.slice(1))guard.hp=10;
  const preview=Core.previewAttack(state,player,state.units[1]);
  const roll=((Math.imul(state.seed,1664525)+1013904223)>>>0)/4294967296*100;
  assert.ok(roll>=preview.chance,'The first round must fail its selected-target accuracy roll.');
  Core.pinRealtimeTarget(state,1);
  Core.configureRealtime(state,{autoFire:true,fireMode:'auto'});
  tick(state,.16);
  return {state,shot:state.effect.sequence.find(e=>e.shooter===player.id)};
}

test('a failed aimed roll can strike an offset guard, retaining the real ray, kill credit and body',()=>{
  const {state,shot}=stackedDefenders();
  assert.equal(state.units[1].hp,10);
  assert.equal(state.units[2].hp,0);
  assert.equal(shot.target,1);
  assert.deepEqual(shot.impact,{unitId:2,zone:'torso'});
  assert.equal(shot.hit,true);
  assert.deepEqual(shot.bodyImpact.contact,shot.traceEnd);
  assert.equal(shot.wallEdge,undefined);
  assert.equal(state.realtime.kills,1);
  assert.ok(Core.interactionObjects(state).some(object=>object.id==='body:2'));
});

test('solid cover intercepts a scattered round before the offset guard',()=>{
  const {state,shot}=stackedDefenders({wall:true});
  assert.equal(state.units[1].hp,10);
  assert.equal(state.units[2].hp,10);
  assert.equal(shot.hit,false);
  assert.equal(shot.impact,undefined);
  assert.equal(shot.bodyImpact,undefined);
  assert.equal(shot.wallEdge,'e:29:25');
  assert.ok(shot.traceEnd.x<29.5);
});

test('a scattered round stops at the first body along the ray',()=>{
  const {state,shot}=stackedDefenders({nearer:true});
  assert.equal(shot.impact.unitId,3);
  assert.equal(state.units[1].hp,10);
  assert.equal(state.units[2].hp,10);
  assert.equal(state.units[3].hp,0);
  assert.equal(state.realtime.kills,1);
});
