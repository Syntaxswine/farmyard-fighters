// Bound catch-up work while retaining elapsed time down to one rendered frame/second.
// The simulation keeps its existing 50ms steps and swept movement collision.
export const SIMULATION_STEP_SECONDS=.05,MAX_FRAME_SECONDS=1;
export const boundedElapsed=seconds=>Number.isFinite(seconds)?Math.max(0,Math.min(MAX_FRAME_SECONDS,seconds)):0;
export class FrameClock{
  constructor(){this.last=null;}
  reset(now=null){this.last=Number.isFinite(now)?now:null;}
  sample(now,enabled=true){
    if(!enabled||!Number.isFinite(now)){this.reset();return 0;}
    const seconds=this.last===null?0:boundedElapsed((now-this.last)/1000);this.last=now;return seconds;
  }
}
