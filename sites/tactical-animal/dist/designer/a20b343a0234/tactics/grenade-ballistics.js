import {grenadeWorld,sweepGrenade,grenadeBase,GRENADE_FLOOR} from './grenade-geometry.js';
import {MAP_LEVELS} from './map-layers.js';
import {cliffSupportAt} from './cliff-support.js';
import {rampSupportAt} from './cliff-ramps.js';
import {siteSupportAt} from './strategic-site-rules.js';
import {weaponAccuracy,statValue} from './character-stats.js';
import {GRENADE_RELEASE} from './grenade-release.js';

export const GRENADE=Object.freeze({radius:.045,blast:5,fuse:4,gravity:9.81,step:1/90,release:1.92,recovery:4.6});
// Baked from each reviewed f8eb82a rig; the same point starts the visible flight.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function grenadeStatMultiplier(u){const value=.7*statValue(u.stats?.strength,50)+.3*statValue(u.stats?.agility,50);return 1+.3*(value-50)/(value<50?49:50);}
export function grenadeRange(u,levelsDown=0){
 const anchors=[10,15,19,22],drop=clamp(levelsDown,0,3),i=Math.min(2,Math.floor(drop));
 const base=levelsDown<0?10/Math.sqrt(1+Math.abs(levelsDown)):anchors[i]+(anchors[i+1]-anchors[i])*(drop-i);
 return base*grenadeStatMultiplier(u);
}
export function grenadeTarget(s,p){const support=p.cliffSupport||rampSupportAt(s,p)||siteSupportAt(s,p)||cliffSupportAt(s,p);return {...p,h:grenadeBase({...p,cliffSupport:support})+GRENADE.radius};}
export function grenadeOrigin(a,target){
 const angle=Math.atan2(target.y-a.y,target.x-a.x),c=Math.cos(angle),s=Math.sin(angle),standing=!a.stance||a.stance==='standing';
 const [x,h,y]=standing&&GRENADE_RELEASE[a.species]?GRENADE_RELEASE[a.species]:[.22,a.stance==='prone'?.4:a.stance==='kneeling'?1:1.4,.18];
 return {x:a.x+x*c-y*s,y:a.y+x*s+y*c,h:grenadeBase(a)+h};
}
export function grenadeAccuracy(a,distance,maxRange){return Math.round(clamp((weaponAccuracy(a,'grenade')??50)+20-25*clamp(distance/maxRange,0,1),5,95));}
export function grenadeLob(origin,target){
 const distance=Math.hypot(target.x-origin.x,target.y-origin.y),rise=Math.max(1.1+distance*.09,target.h-origin.h+.6),up=Math.sqrt(2*GRENADE.gravity*rise),time=(up+Math.sqrt(Math.max(0,up*up+2*GRENADE.gravity*(origin.h-target.h))))/GRENADE.gravity;
 return {x:(target.x-origin.x)/time,y:(target.y-origin.y)/time,h:up,time};
}
const rounded=v=>Math.round(v*1e8)/1e8;
function sample(p,t){return {x:rounded(p.x),y:rounded(p.y),h:rounded(p.h),t:rounded(t)};}
// Fixed integration steps, swept collisions and a single release-to-explosion
// clock. Contacts use the remaining substep; a bounce never restarts the fuse.
export function simulateGrenade(s,origin,velocity,{fuse=GRENADE.fuse,ignoreUnit=null,world=grenadeWorld(s),units=s.units}={}){
 let p={...origin},v={x:velocity.x,y:velocity.y,h:velocity.h},time=0,resting=false;const path=[sample(p,0)],collisions=[];
 while(time<fuse-1e-9){const dt=Math.min(GRENADE.step,fuse-time);let remaining=dt,elapsed=0;
  if(resting){time=fuse;path.push(sample(p,time));break;}
  for(let contact=0;remaining>1e-8&&contact<6;contact++){
   const next={x:p.x+v.x*remaining,y:p.y+v.y*remaining,h:p.h+v.h*remaining-.5*GRENADE.gravity*remaining*remaining},hit=sweepGrenade(world,p,next,GRENADE.radius,{units,ignoreUnit});
   if(!hit){p=next;v.h-=GRENADE.gravity*remaining;elapsed+=remaining;remaining=0;break;}
   const used=remaining*hit.t;v.h-=GRENADE.gravity*used;elapsed+=used;remaining-=used;
   const n=hit.normal,dot=v.x*n.x+v.y*n.y+v.h*n.h,speed=Math.hypot(v.x,v.y,v.h),floor=n.h>.6;
   p={x:hit.x+n.x*.0001,y:hit.y+n.y*.0001,h:hit.h+n.h*.0001};
   const tangent=floor?.55:.8,rebound=floor?(speed>1?.18:0):.5;
   v={x:(v.x-dot*n.x)*tangent-dot*n.x*rebound,y:(v.y-dot*n.y)*tangent-dot*n.y*rebound,h:(v.h-dot*n.h)*tangent-dot*n.h*rebound};
   if(speed>.55){const record={...sample(p,time+elapsed),normal:n,kind:hit.kind};collisions.push(record);path.push({...record,contact:true});}
   // Only an actual upward-facing contact can settle a grenade. Moving off a
   // ledge resumes gravity because the next sweep has no supporting contact.
   if(floor&&Math.hypot(v.x,v.y,v.h)<.08){resting=true;remaining=0;break;}
   if(used<1e-7){remaining=Math.max(0,remaining-1e-5);elapsed+=1e-5;}
  }
  time+=dt;path.push(sample(p,time));
 }
 const end=sample(p,fuse);
 return {...end,z:clamp(Math.floor((p.h+.001)/GRENADE_FLOOR),0,MAP_LEVELS-1),kind:'grenade',grenade:true,origin,path,collisions,fuse,resting};
}
export function grenadePreview(s,a,target,w){
 const dest=grenadeTarget(s,target),origin=grenadeOrigin(a,dest),distance=Math.hypot(target.x-a.x,target.y-a.y),maxRange=grenadeRange(a,(grenadeBase(a)-(dest.h-GRENADE.radius))/GRENADE_FLOOR),map=s.map||s.terrain,x=Math.round(target.x),y=Math.round(target.y),z=target.z||0;
 let reason='';
 if(!Number.isFinite(target.x)||!Number.isFinite(target.y)||x<0||y<0||y>=map.length||x>=map[0].length||!Number.isInteger(z)||z<0||z>=MAP_LEVELS)reason='Outside the map';
 else if(a.burningTurns)reason='On fire: running in panic';
 else if(a.team==='squad'&&!s.seen.has(z?`${x},${y},${z}`:`${x},${y}`))reason='Choose discovered terrain';
 else if(z&&!s.upper?.[z-1]?.[`${x},${y}`]&&!target.towerPost&&!rampSupportAt(s,target)&&!siteSupportAt(s,target)&&!cliffSupportAt(s,target))reason='No surface on this level';
 else if(distance>maxRange+.000001)reason='Out of throwing range';
 else if(!(a.ammo?.[a.weapon]>0))reason='Reload required';
 else if(!['explore','won'].includes(s.phase)&&a.ap<w.cost)reason='Not enough AP';
 const chance=grenadeAccuracy(a,distance,maxRange),spread=.65+distance*.12;
 const known=(s.units||[]).filter(u=>u.team===a.team||s.detected?.has(u.id));
 const trajectory=reason==='Outside the map'?null:simulateGrenade(s,origin,grenadeLob(origin,dest),{ignoreUnit:a.id,units:known});
 const first=trajectory?.collisions[0],blocked=!!first&&Math.hypot(first.x-dest.x,first.y-dest.y,first.h-dest.h)>.7;
 return {ok:!reason,reason,cost:w.cost,rounds:1,chance,rawDamage:120,damage:120,zone:'torso',range:maxRange,maxRange,distance,beyond:distance>maxRange,blastRadius:GRENADE.blast,spread,blocked,trajectory,requested:dest};
}
export function grenadeTrajectory(s,a,target,w,p,random){
 const roll=random()*100,accurate=roll<p.chance,dest=grenadeTarget(s,target);let offset={x:0,y:0};
 if(!accurate){const margin=clamp((roll-p.chance)/Math.max(1,100-p.chance),0,1),angle=random()*Math.PI*2,radius=(.65+Math.hypot(target.x-a.x,target.y-a.y)*.12)*(.25+.75*margin);offset={x:Math.cos(angle)*radius,y:Math.sin(angle)*radius};}
 // Origin/facing stay tied to the original aim. No random draw consults cover.
 const origin=grenadeOrigin(a,dest),end={...dest,x:dest.x+offset.x,y:dest.y+offset.y};
 return {...simulateGrenade(s,origin,grenadeLob(origin,end),{ignoreUnit:a.id}),accurate,roll:rounded(roll),chance:p.chance,offset,requested:dest,aim:end};
}
export function grenadeDamage(distance){
 const points=[[0,120],[1,100],[2,60],[3,25],[4,8],[5,6]];if(distance>5)return 0;
 const i=clamp(Math.floor(distance),0,4),[x,a]=points[i],[y,b]=points[i+1];return Math.round(a+(b-a)*clamp((distance-x)/(y-x),0,1));
}
