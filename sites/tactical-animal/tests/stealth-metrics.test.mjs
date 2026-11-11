import test from 'node:test';
import assert from 'node:assert/strict';
import {createStealthScenario,runStealthTrial,trialSeed} from '../../../tools/stealth-scenarios.mjs';
import {geometry,projectileSegmentClear} from '../dist/solo-game.js';

test('the synthetic yard uses authored waist cover in production movement and projectile collision',()=>{
  const {state,world,dispose}=createStealthScenario(20);
  try{
    assert.ok(geometry(state).some(box=>box.cover&&box.height===.92));
    assert.equal(world.pointClear({x:117,y:128.7}),false);
    assert.equal(projectileSegmentClear(state,{x:117,y:130,h:.8},{x:117,y:127.7,h:.8}),false);
    assert.equal(projectileSegmentClear(state,{x:117,y:130,h:1.1},{x:117,y:127.7,h:1.1}),true);
  }finally{dispose();}
});

test('route trials replay the same combat outcome from the recorded seed',()=>{
  for(const route of ['frontal','flank']){
    const seed=trialSeed(12);
    const first=runStealthTrial(route,seed),second=runStealthTrial(route,seed);
    assert.deepEqual(second,first);
    assert.equal(first.win,first.hp>0&&first.guardsKilled===2);
    assert.ok(first.seconds<=90.1);
  }
});
