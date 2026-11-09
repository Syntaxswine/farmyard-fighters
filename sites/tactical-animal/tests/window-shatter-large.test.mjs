import test from 'node:test';
import assert from 'node:assert/strict';
import {fracturePane,shardPose,shatterTiming,createWindowShatter,SHATTER_DURATION} from '../dist/window-shatter.js';
test('a twenty-metre by five-storey sheet fractures once within one pane budget',()=>{
  const bounds={min:[-10,0,-.004],max:[10,10.6,.004]},pieces=fracturePane(17,bounds);let area=0;
  for(const p of pieces){const v=p.local.map(q=>q.map((n,i)=>n+p.center[i]));for(const q of v){assert.ok(q[0]>=-10-1e-8&&q[0]<=10+1e-8);assert.ok(q[1]>=-1e-8&&q[1]<=10.6+1e-8);}area+=Math.abs((v[1][0]-v[0][0])*(v[2][1]-v[0][1])-(v[1][1]-v[0][1])*(v[2][0]-v[0][0]))/2;}
  assert.ok(Math.abs(area-212)<1e-6);assert.ok(pieces.length<=70);assert.ok(fracturePane(17,bounds,24).length<=24);
});
test('tall shards keep metre gravity and finish ground contact before fading out',()=>{
  const effect=createWindowShatter({kind:'window.full.borderless',bounds:{min:[-10,0,-.004],max:[10,80,.004]},includePane:false}),highest=effect.pieces.reduce((a,b)=>a.center[1]>b.center[1]?a:b);
  const pose=shardPose(highest,1),expected=highest.center[1]+highest.kick*.9-7.8*.9*.9/2;assert.ok(Math.abs(pose.position[1]-expected)<1e-8);assert.ok(effect.duration>SHATTER_DURATION);
  effect.sample(effect.fadeStart);assert.ok(effect.diagnostics().settled);assert.ok(effect.diagnostics().bounds.filter((_,i)=>i%3===1).every(y=>y>=.0029));effect.sample(effect.duration);assert.equal(effect.diagnostics().shardsVisible,false);assert.equal(effect.diagnostics().opacity,0);effect.dispose();
});
test('legacy timing is unchanged and very shallow panes never produce invalid landing times',()=>{
  assert.equal(shatterTiming(fracturePane()).duration,SHATTER_DURATION);
  const effect=createWindowShatter({kind:'window.full.borderless',bounds:{min:[-.5,0,-.004],max:[.5,.005,.004]},includePane:false});
  for(const t of [0,.1,.5,effect.duration]){effect.sample(t);assert.ok(effect.diagnostics().bounds.every(Number.isFinite));}effect.dispose();
});
