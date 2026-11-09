import {personVisible} from './battle-visibility.js';
import {flamePhase} from './battle-flame-effects.js';
import {paintedOperatorSupported,paintedFlamePhase} from './painted-fire-state.js';
import {grenadePhase} from './battle-grenades.js';
import {shotPoint,visibleShotSegments} from './battle-shot-effects.js';
export const RIFLE_SHOT_MS=380,RIFLE_DURATION_MS=1100;
export const dischargeDelay=shot=>shot.reduced?0:shot.event.grenade?(shot.event.grenade.release+shot.event.trajectories[0].fuse)*1000:shot.paintedFire?640:shot.event.flame?150:shot.rifle?RIFLE_SHOT_MS:0;
// Burns and ruptures wait for the exact attack that committed them, including
// queued replies. An unseen shooter needs no invented firing presentation.
export function burnStart(event,combat,now){
 const shot=[combat.active,...combat.queue].find(s=>['tank','barrel'].includes(event.kind)?s?.event.explosions?.some(e=>e.fireSequence===event.sequence):s?.event.burns?.includes(event.unitId));
 return shot&&shot!==combat.active?null:shot?shot.start+dischargeDelay(shot):now;
}
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
export function shotPhase(elapsed,rifle=true,reduced=false){
 const discharge=reduced||!rifle?0:RIFLE_SHOT_MS,duration=reduced?180:rifle?RIFLE_DURATION_MS:260,t=elapsed-discharge;
 return {duration,discharged:t>=0,aim:reduced?1:rifle?ease(elapsed/320)*(1-ease((elapsed-800)/300)):0,
  recoil:reduced||t<0||t>.45e3?0:t<30?ease(t/30):1-ease((t-30)/420),flash:!reduced&&t>=0&&t<65,trace:!reduced&&t>=0&&t<180,impact:t>=0&&t<180};
}
export class BattleCombat {
 constructor(){this.lastEffect=null;this.seenDischarges=new Set();this.previous=new Map();this.queue=[];this.held=new Map();this.falling=new Map();this.active=null;}
 observe(state,now,reduced=false){
  if(reduced)for(const shot of [this.active,...this.queue])if(shot)shot.reduced=true;
  if(state.effect&&state.effect!==this.lastEffect){
   this.lastEffect=state.effect;
   for(const event of state.effect.sequence||[state.effect]){
    if(event.dischargeId){if(this.seenDischarges.has(event.dischargeId))continue;this.seenDischarges.add(event.dischargeId);if(this.seenDischarges.size>1024)this.seenDischarges.delete(this.seenDischarges.values().next().value);}
    const unit=state.units.find(u=>u.id===event.shooter),before=this.previous.get(event.shooter);
    if(!unit)continue;
    const shooterVisible=personVisible(state,unit);
    if(!shooterVisible&&!event.grenade&&!event.trajectories?.some(p=>visibleShotSegments(state,[shotPoint(p.origin||{x:event.ax,y:event.ay,h:(event.az||0)*3+1.3},state),...(p.path||[p]).map(q=>shotPoint(q,state))]).length))continue;
    const shooter=before||unit;
    // Flames carry their actual area; other attacks need resolved trajectories.
    if(!event.flame&&(!event.trajectories?.length||event.incendiary||event.explosions?.some(e=>!['tank','barrel','grenade'].includes(e.kind))))continue;
    const shot={event:structuredClone(event),shooter:{...shooter,...event.grenade?.shooter,x:event.ax,y:event.ay,z:event.az||0},shooterVisible,rifle:!event.flame&&(event.weapon||shooter.weapon)==='rifle',reduced,knownUnitIds:[...this.previous.keys(),...state.detected]};
    shot.paintedFire=!!event.flame&&paintedOperatorSupported(shooter);
    shot.heldCasualties=[...new Set([...(event.downed||[]),...(event.bodyImpacts||[]).filter(r=>r.fatalHead).map(r=>r.victimId)])];
    this.queue.push(shot);
    for(const id of shot.heldCasualties){const receipt=event.bodyImpacts?.find(r=>r.victimId===id),victim=state.units.find(u=>u.id===id),prior=this.previous.get(id)||(receipt&&victim?{...victim,hp:receipt.hpBefore,casualty:receipt.casualtyBefore,fatalHead:undefined}:null);if(prior)this.held.set(id,prior);}
    for(const fall of event.falls||[])if(this.previous.has(fall.id)&&!this.falling.has(fall.id))this.falling.set(fall.id,fall.from);
   }
  }
  this.advance(now);
  this.previous=new Map(state.units.filter(u=>personVisible(state,u)).map(u=>[u.id,{...u}]));
 }
 advance(now){
  const phase=(shot,elapsed)=>shot.event.grenade?grenadePhase(shot,elapsed):shot.paintedFire?paintedFlamePhase(elapsed,shot.reduced):shot.event.flame?flamePhase(elapsed,shot.reduced):shotPhase(elapsed,shot.rifle,shot.reduced);
  if(this.active&&now-this.active.start>=phase(this.active,0).duration)this.active=null;
  if(!this.active&&this.queue.length)this.active={...this.queue.shift(),start:now};
  if(this.active){this.active.phase=phase(this.active,now-this.active.start);if(this.active.phase.discharged){for(const id of this.active.heldCasualties)this.held.delete(id);for(const f of this.active.event.falls||[])this.falling.delete(f.id);}}
  if(!this.active&&!this.queue.length){this.held.clear();this.falling.clear();}
 }
 get busy(){return !!this.active||this.queue.length>0;}
 display(unit){const held=this.held.get(unit.id),position=this.falling.get(unit.id);return held||position?{...unit,...held&&{hp:held.hp,casualty:held.casualty,fatalHead:held.fatalHead},...position}:unit;}
 clear(){this.lastEffect=null;this.seenDischarges.clear();this.previous.clear();this.queue=[];this.held.clear();this.falling.clear();this.active=null;}
}
