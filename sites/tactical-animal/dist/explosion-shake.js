// Presentation only: no gameplay RNG, camera targets or saved state are changed.
const profiles={grenade:[7,340],rpg:[10,460],launcher:[8,400],barrel:[9,440],tank:[9,440]};
export class ExplosionShake{
  constructor({reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches??false}={}){
    this.reducedMotion=reducedMotion;this.pulses=[];this.count=0;this.counts={};this.last=null;
  }
  blast(kind,point,listener,now){
    const profile=profiles[kind];
    if(!profile||this.reducedMotion()||![point?.x,point?.y,listener?.x,listener?.y,now].every(Number.isFinite))return;
    const distance=Math.hypot(point.x-listener.x,point.y-listener.y),gain=Math.max(0,1-Math.max(0,distance-4)/28);
    if(!gain)return;
    const pulse={kind,at:now,pixels:profile[0]*gain,duration:profile[1]};this.count++;
    this.counts[kind]=(this.counts[kind]||0)+1;
    this.pulses.push(pulse);this.pulses=this.pulses.slice(-8);this.last={...pulse,point:{x:point.x,y:point.y}};
  }
  sample(now){
    if(this.reducedMotion()){this.pulses=[];return {x:0,y:0};}
    let x=0,y=0;
    this.pulses=this.pulses.filter(p=>now-p.at<p.duration);
    for(const p of this.pulses){
      const age=Math.max(0,now-p.at),amplitude=p.pixels*(1-age/p.duration)**2;
      // Simultaneous explosions reinforce their impulse instead of cancelling.
      x+=Math.cos(age*.095)*amplitude;
      y+=Math.sin(age*.12+.8)*amplitude*.65;
    }
    const scale=Math.min(1,12/Math.max(12,Math.hypot(x,y)));
    return {x:x*scale,y:y*scale};
  }
  clear(){this.pulses=[];this.count=0;this.counts={};this.last=null;}
}
