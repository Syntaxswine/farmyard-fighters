import {test} from 'node:test';
import assert from 'node:assert/strict';
import {measureMovementFrames} from '../browser-tests/movement-measurement.mjs';
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,a+' != '+b);
function tape(gaps,speed=14.4){
  let frame=1,at=0,elapsed=0,distance=0,visualDistance=0;
  const make=()=>({frame,rafAt:at,at,elapsed,distance,visualDistance,onScreen:true,resident:true,stickHeld:true,running:speed===14.4}),samples=[make()];
  for(const seconds of gaps){frame++;at+=seconds*1000;elapsed+=Math.min(1,seconds);distance+=speed*Math.min(1,seconds);visualDistance+=7.2*Math.min(1,seconds);samples.push(make());}
  return samples;
}
test('captured CI 1.2333s gap verifies the one-second cap and reports real lost wall time',()=>{
  const s=tape([1.2333]);
  // Exact independent timestamps, simulation elapsed and physical travel retained
  // from PR36 run41544413080 frame36→37, rather than a rate derived from elapsed.
  Object.assign(s[0],{frame:36,rafAt:8721.4,at:8721.4,elapsed:5.649899999999998,distance:9.502257773401412,visualDistance:1.1995200000011579});
  Object.assign(s[1],{frame:37,rafAt:9954.7,at:9954.7,elapsed:6.649899999999994,distance:23.902257773417716,visualDistance:8.399520000009371});
  const m=measureMovementFrames(s,14.4);close(m.speed,11.675991243019777);close(m.budgetSpeed,14.4);close(m.discardedSeconds,.2333);assert.equal(m.cappedFrames,1);assert.equal(m.supportedFrames,0);assert.equal(m.supportedSpeed,null);
});
test('supported native frames keep strict nominal wall rates from1 through60FPS',()=>{
  for(const speed of [7.2,14.4])for(const fps of [1,2,5,10,20,60]){const m=measureMovementFrames(tape(Array(fps).fill(1/fps),speed),speed);close(m.speed,speed);close(m.visualSpeed,7.2);close(m.supportedSpeed,speed);assert.equal(m.cappedFrames,0);}
});
test('mixed frames preserve each cap and actual wall rate without cap inflation',()=>{
  const m=measureMovementFrames(tape([.6,1.2333,.2]),14.4);close(m.budgetSeconds,1.8);close(m.discardedSeconds,.2333);close(m.budgetSpeed,14.4);close(m.supportedSpeed,14.4);assert.equal(m.cappedFrames,1);assert.equal(m.supportedFrames,2);assert(m.speed<14.4);
});
test('the old50ms clock clamp fails even when travel divided by simulation time is nominal',()=>{
  const s=tape([.6]);Object.assign(s[1],{elapsed:.05,distance:.72,visualDistance:.36});close(s[1].distance/s[1].elapsed,14.4);assert.throws(()=>measureMovementFrames(s,14.4),/independently capped rAF time/);
});
test('correct clock with slowed movement or doubled visual cadence still fails',()=>{
  const slowed=tape([.6]);slowed[1].distance=.72;assert.throws(()=>measureMovementFrames(slowed,14.4),/Physical movement/);
  const cadence=tape([.6]);cadence[1].visualDistance*=2;assert.throws(()=>measureMovementFrames(cadence,14.4),/visual cadence/);
});
test('uncapped stalls cannot masquerade as correct nominal movement',()=>{
  const s=tape([1.2333]);Object.assign(s[1],{elapsed:1.2333,distance:14.4*1.2333,visualDistance:7.2*1.2333});assert.throws(()=>measureMovementFrames(s,14.4),/independently capped rAF time/);
});
test('missing frames and mismatched observer order cannot hide unobserved caps',()=>{
  const skipped=tape([.6]);skipped[1].frame++;assert.throws(()=>measureMovementFrames(skipped,14.4),/must not skip/);
  const lagged=tape([.6]);lagged[1].rafAt++;assert.throws(()=>measureMovementFrames(lagged,14.4),/same native rAF batch/);
  const reversed=tape([.6]);reversed[1].at=reversed[1].rafAt=-1;assert.throws(()=>measureMovementFrames(reversed,14.4),/timestamps must increase/);
});
test('actor residency, visibility and held Run remain required on every recorded frame',()=>{
  for(const field of ['resident','onScreen','stickHeld','running']){const s=tape([.6]);s[1][field]=false;assert.throws(()=>measureMovementFrames(s,14.4));}
});
