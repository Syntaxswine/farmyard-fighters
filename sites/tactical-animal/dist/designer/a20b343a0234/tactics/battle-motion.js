import {MOVEMENT_MODES,movementModeOf} from './core/engine.js';
import {WALK_TILE_MS} from './movement-timing.js';
// Presentation duration; the shared clock uses baseline walking to calibrate exploration.
// The core has already accepted and charged each step.
export const MOVEMENT_MS=WALK_TILE_MS;
export const movementDuration=u=>MOVEMENT_MS/MOVEMENT_MODES[movementModeOf(u)].speed;
export function queuedMovementDuration(state){
 const next=state.queue[0],ids=next?.group?next.group.map(o=>o.id):next?[next.id]:[];
 const units=ids.map(id=>state.units.find(u=>u.id===id)).filter(Boolean);
 return units.length?Math.max(...units.map(movementDuration)):MOVEMENT_MS;
}
const clamp=v=>Math.max(0,Math.min(1,v));
export const postureOf=u=>u.hp<=0?(u.casualty==='bleeding'?'bleeding':u.casualty==='stable'?'stable':'dead'):(['kneeling','prone'].includes(u.stance)?u.stance:'standing');
const weights=name=>({kneel:name==='kneeling'?1:0,prone:name==='prone'?1:0,down:['bleeding','stable','dead'].includes(name)?1:0,stable:name==='stable'?1:0,dead:name==='dead'?1:0});
const angle=(a,b,t)=>a+(((b-a+540)%360)-180)*t;
export class BattleMotion {
 constructor(){this.tracks=new Map();this.samples=new Map();}
 update(units,now,reduced=false){
  const ids=new Set(units.map(u=>u.id));
  // Forget hidden opponents: reappearance must not reveal an unseen route.
  for(const id of this.tracks.keys())if(!ids.has(id)){this.tracks.delete(id);this.samples.delete(id);}
  for(const u of units){
   const point={x:u.x,y:u.y,z:u.z||0,heading:u.heading||0};let t=this.tracks.get(u.id);
   if(!t){t={from:point,to:point,start:now,last:now,position:point,distance:0,blend:0,posture:postureOf(u),pose:weights(postureOf(u)),poseFrom:weights(postureOf(u)),poseStart:now,duration:movementDuration(u)};this.tracks.set(u.id,t);}
   const dt=Math.max(0,now-t.last),changed=point.x!==t.to.x||point.y!==t.to.y||point.z!==t.to.z||point.heading!==t.to.heading;
   if(changed){t.from={...t.position};t.to=point;t.start=now;t.duration=movementDuration(u);}
   const teleport=Math.hypot(point.x-t.from.x,point.y-t.from.y)>1.6||point.z!==t.from.z;
   const progress=reduced||teleport||u.hp<=0?1:clamp((now-t.start)/t.duration);
   const position={x:t.from.x+(point.x-t.from.x)*progress,y:t.from.y+(point.y-t.from.y)*progress,z:point.z,heading:angle(t.from.heading,point.heading,progress)};
   const walking=progress<1&&Math.hypot(point.x-t.from.x,point.y-t.from.y)>.001;
   if(!teleport&&!reduced&&u.hp>0)t.distance+=Math.hypot(position.x-t.position.x,position.y-t.position.y);
   t.blend=reduced||teleport||u.hp<=0?0:t.blend+((walking?1:0)-t.blend)*(1-Math.exp(-dt/65));
   if(t.blend<.001)t.blend=0;
   const posture=postureOf(u);if(posture!==t.posture){t.poseFrom={...t.pose};t.posture=posture;t.poseStart=now;}
   const pt=reduced?1:clamp((now-t.poseStart)/(u.hp<=0?650:450)),smooth=pt*pt*(3-2*pt),goal=weights(posture);
   for(const k of Object.keys(goal))t.pose[k]=t.poseFrom[k]+(goal[k]-t.poseFrom[k])*smooth;
   t.position=position;t.last=now;
   this.samples.set(u.id,{...u,...position,distance:t.distance,blend:t.blend,walking,posture,pose:{...t.pose}});
  }
 }
 sample(unit){return this.samples.get(unit.id)||{...unit,distance:0,blend:0,walking:false};}
 clear(){this.tracks.clear();this.samples.clear();}
}
