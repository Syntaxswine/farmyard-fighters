import assert from 'node:assert/strict';

// Independent acceptance policy: do not import the runtime clock or use the
// simulation's elapsed value as the movement denominator. That would hide a
// regression to the old 50ms clamp.
export const FRAME_BUDGET_SECONDS=1;
export function measureMovementFrames(samples,expected){
  assert(samples.length>=2,'Movement measurement needs at least two native frames');
  const first=samples[0],last=samples.at(-1),intervals=[];
  for(const s of samples){
    for(const key of ['frame','rafAt','at','elapsed','distance','visualDistance'])assert(Number.isFinite(s[key]),'Invalid native frame '+key);
    assert.equal(s.at,s.rafAt,'Observer must run after the app in the same native rAF batch');
    assert(s.onScreen&&s.resident,'Moving actor must remain on screen and resident');
    assert(s.stickHeld,'Joystick must remain held throughout measurement');
    assert.equal(s.running,expected===14.4,'Movement mode changed during measurement');
  }
  for(let n=1;n<samples.length;n++){
    const a=samples[n-1],b=samples[n];
    assert.equal(b.frame-a.frame,1,'Native timestamp tape must not skip rendered frames');
    const seconds=(b.rafAt-a.rafAt)/1000;
    assert(seconds>0,'Native rAF timestamps must increase');
    const budgetSeconds=Math.min(FRAME_BUDGET_SECONDS,seconds),elapsed=b.elapsed-a.elapsed,travel=b.distance-a.distance,visualTravel=b.visualDistance-a.visualDistance;
    assert(Math.abs(elapsed-budgetSeconds)<1e-6,'Simulation elapsed must match independently capped rAF time: '+elapsed+' vs '+budgetSeconds);
    assert(Math.abs(travel-expected*budgetSeconds)<expected*budgetSeconds*.035,'Physical movement must match the native frame budget: '+travel+'m in '+budgetSeconds+'s');
    assert(Math.abs(visualTravel-7.2*budgetSeconds)<.3*budgetSeconds,'Native visual cadence must match the frame budget');
    intervals.push({frame:b.frame,seconds,budgetSeconds,discardedSeconds:seconds-budgetSeconds,elapsed,travel,visualTravel,speed:travel/seconds,budgetSpeed:travel/budgetSeconds,capped:seconds>FRAME_BUDGET_SECONDS});
  }
  const seconds=(last.rafAt-first.rafAt)/1000,budgetSeconds=intervals.reduce((sum,f)=>sum+f.budgetSeconds,0),supported=intervals.filter(f=>!f.capped),supportedSeconds=supported.reduce((sum,f)=>sum+f.seconds,0),travel=last.distance-first.distance,visualTravel=last.visualDistance-first.visualDistance;
  const speed=travel/seconds,visualSpeed=visualTravel/seconds;
  // Keep strict nominal wall rates for supported frames. Larger stalls have an
  // explicit loss receipt; their raw wall rate is retained, never relabelled.
  const supportedSpeed=supported.length?supported.reduce((sum,f)=>sum+f.travel,0)/supportedSeconds:null;
  if(supported.length)assert(Math.abs(supportedSpeed-expected)<expected*.035,'Supported frames must retain nominal wall-clock speed');
  return {speed,expected,visualSpeed,seconds,travel,budgetSeconds,budgetSpeed:travel/budgetSeconds,budgetVisualSpeed:visualTravel/budgetSeconds,discardedSeconds:seconds-budgetSeconds,supportedFrames:supported.length,cappedFrames:intervals.length-supported.length,supportedSeconds,supportedSpeed,fps:intervals.length/seconds,minFrameSeconds:Math.min(...intervals.map(f=>f.seconds)),maxFrameSeconds:Math.max(...intervals.map(f=>f.seconds)),intervals};
}

// Serialized by Playwright into the page. This observer reads production
// diagnostics after each app frame; it does not wrap rAF or mutate game state.
export async function startMovementFrameTape(){
  const {inspectMountDora}=await import(document.querySelector('script[src*="app.js"]').src);
  window.__movementFrameTape?.stop();
  return new Promise(resolve=>{
    const tape={samples:[],request:null,before:null,after:null};
    tape.stop=()=>{cancelAnimationFrame(tape.request);return {before:tape.before,after:tape.after,samples:tape.samples};};
    window.__movementFrameTape=tape;
    function record(rafAt){
      const info=inspectMountDora(),wall=performance.now();
      tape.samples.push({frame:info.frames,rafAt,at:info.renderedAt,elapsed:info.elapsed,distance:info.distance,visualDistance:info.actor.visualDistance,player:{x:info.player.x,y:info.player.y},onScreen:info.actor.onScreen,resident:info.actor.insideResident,stickHeld:info.input.stickHeld,running:info.player.running});
      tape.after={wall,info};
      if(!tape.before){tape.before=tape.after;resolve(tape.before);}
      tape.request=requestAnimationFrame(record);
    }
    tape.request=requestAnimationFrame(record);
  });
}
