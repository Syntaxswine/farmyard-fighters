import {towerForUnit,unitBaseHeight} from './tower-geometry.js';
import {inCone,sightOf} from './core/perception.js';
import {CHARACTER_RANGE} from './core/visibility.js';
import {lightSources,lightBrightness,lightConeFactor,towerBlocksLight} from './light-sources.js';
import {woodlandDepth} from './core/woodland.js';
import {daylightAt} from './daylight.js';
import {traceProjectile,targetHeight} from './core/projectiles.js';
import {mapStartMinutes} from './game-clock.js';
import {combatQuery} from './combat-queries.js';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export const AWARENESS={suspicious:25,identified:100,decay:2,referencePerception:50};
// Recognition has hysteresis: a known face does not become unknown at 99%.
const recognized=record=>!!record&&(record.score>=AWARENESS.identified||!!record.lastKnown&&record.score>=AWARENESS.suspicious);
const active=u=>u.hp>0&&!u.away&&!['quit','captured'].includes(u.casualty);
function clearRay(s,origin,direction,reach){const hit=traceProjectile({...s,units:[]},null,origin,direction,reach);return hit.kind==='range'||hit.distance>=reach-1e-6;}
function lampStrength(s,lamp,origin){
 if(s.props.some(p=>towerBlocksLight(lamp,origin,p)))return 0;
 const ray={x:lamp.x-origin.x,y:lamp.y-origin.y,h:lamp.h-origin.h},distance=Math.hypot(ray.x,ray.y,ray.h),strength=lightBrightness(distance)*lightConeFactor(lamp,origin);
 // Exclude only the fixture's own coarse collision footprint.
 return strength&&(distance<1e-6||clearRay({...s,props:s.props.filter(p=>p!==lamp.prop)},origin,ray,distance))?strength:0;
}
export function spotlightReveals(s,observer,target,zones){
 if(!s.rules?.awareness||!towerForUnit(s,observer)&&!inCone(observer,target))return false;
 const lamps=lightSources(s.props,s.clock?.minutes??mapStartMinutes(s.definition)).filter(l=>l.aim);
 if(!lamps.length)return false;
 // The same body region must receive the beam and be visible to this observer.
 return zones(s,observer,target).filter(z=>['head','torso','legs'].includes(z)).some(zone=>{
  const origin={x:target.x,y:target.y,h:unitBaseHeight(target)+targetHeight(target,zone)};
  return lamps.some(lamp=>lampStrength(s,lamp,origin)>0);
 });
}
export function illuminationAt(s,u,zone='torso'){
 const minutes=s.clock?.minutes??mapStartMinutes(s.definition);
 const origin={x:u.x,y:u.y,h:unitBaseHeight(u)+targetHeight(u,zone)};
 return combatQuery(s,'illumination',[minutes,origin.x,origin.y,origin.h].join(','),()=>{
 const sun=daylightAt(minutes);
 const direction={x:sun.direction[0],y:sun.direction[2],h:sun.direction[1]};
 // Ambient visibility is deliberately separate from renderer exposure settings.
 let brightness=.12+.13*sun.strength+.75*sun.strength*(sun.strength>0&&clearRay(s,origin,direction,80)?1:0);
 for(const lamp of lightSources(s.props,s.clock?.minutes??mapStartMinutes(s.definition))){
  brightness+=lampStrength(s,lamp,origin);
 }
 return Math.min(1,brightness);});
}
// Ordinary lit targets need no recognition roll, including at the cone edges.
// Keep the overall species range, body-ray occlusion and a daylight-shade floor.
export function ordinaryReveals(s,observer,target,zones){
 if(target.sneaking||!inCone(observer,target)||Math.hypot(observer.x-target.x,observer.y-target.y)>CHARACTER_RANGE*sightOf(observer).range)return false;
 return zones(s,observer,target).some(zone=>['head','torso','legs'].includes(zone)&&illuminationAt(s,target,zone)>=.25);
}
export function awarenessRate({distance,exposure,light,contrast=0,perception=50,stealth=20,sneaking=false,running=false,moving=false,stance='standing',alert=false,concealment=0}){
 const skill=clamp(1+(perception-stealth)/100,.35,1.8),motion=moving?(running?1.65:1.2):.65;
 const posture=stance==='prone'?.45:stance==='kneeling'?.75:1;
 return 8*clamp(1-distance/70,.12,1)*exposure*clamp(light+contrast*.35,.06,1)*skill*motion*posture*(sneaking?.55:1)*(alert?1.5:1)*Math.exp(-concealment*.35);
}
const pose=u=>[u.x,u.y,u.z||0,u.heading,u.stance,u.steps,u.ap,JSON.stringify(u.ammo)].join(':');
export function updateAwareness(s,{geometry,zones}){
 if(!s.rules?.awareness)return;
 const combat=s.phase==='player'||s.phase==='enemy',seconds=s.awarenessSeconds||0;s.awarenessSeconds=0;
 const units=s.units.filter(active),lights=new Map();
 const light=(u,zone)=>{const key=u.id+':'+zone;if(!lights.has(key))lights.set(key,illuminationAt(s,u,zone));return lights.get(key);};
 for(const observer of units){observer.awareness??={};
  for(const target of units){if(observer.team===target.team)continue;
   const key=target.id,old=observer.awareness[key],signature=pose(observer)+'|'+pose(target);
   const record=old||{score:0,round:s.round,spent:0,signature,lastKnown:null};
   let elapsed=seconds;
   if(combat){
    elapsed=0;
    if(!record.combat){record.spent=0;}
    else if(record.round!==s.round){elapsed=Math.max(0,60-record.spent);record.spent=0;}
    else if(old&&record.signature!==signature){
     const actionSeconds=60*Math.max(Math.max(0,(record.observerAP??observer.ap)-observer.ap)/Math.max(1,observer.maxAp),Math.max(0,(record.targetAP??target.ap)-target.ap)/Math.max(1,target.maxAp));
     elapsed=Math.min(actionSeconds,60-record.spent);record.spent+=elapsed;
    }
   }
   record.observerAP=observer.ap;record.targetAP=target.ap;record.combat=combat;record.round=s.round;record.signature=signature;
   const spotlit=spotlightReveals(s,observer,target,zones),ordinary=ordinaryReveals(s,observer,target,zones),candidate=spotlit||ordinary?2:geometry(s,observer,target),distance=Math.hypot(observer.x-target.x,observer.y-target.y,((observer.z||0)-(target.z||0))*3);
   if(candidate){
    const exposed=zones(s,observer,target).filter(z=>['head','torso','legs'].includes(z)),exposure=exposed.reduce((n,z)=>n+(z==='torso'?.5:.25),0);
    const brightness=exposed.length?exposed.reduce((n,z)=>n+light(target,z),0)/exposed.length:0;
    const dx=target.x-observer.x,dy=target.y-observer.y,len=Math.hypot(dx,dy)||1;
    const background={...target,x:target.x+dx/len*2,y:target.y+dy/len*2};
    const contrast=brightness<.5?Math.max(0,illuminationAt(s,background)-brightness):0;
    const moving=!!target.moved||!!old&&old.position!==[target.x,target.y,target.z||0].join(',');
    const rate=awarenessRate({distance,exposure,light:brightness,contrast,concealment:woodlandDepth(s,observer,target),perception:clamp((observer.perception??50)+(observer.skills?.perception||0)*3,0,100),stealth:target.stealth??20,sneaking:target.sneaking,running:target.running,moving,stance:target.stance,alert:observer.alert||observer.wary||['suspicious','searching'].includes(observer.state)});
    record.score=clamp(record.score+rate*elapsed,0,candidate===2?100:99);
    // Close, clearly exposed targets are unmistakable in daylight, including
    // ambient daylight shade. Geometry still enforces facing and solid cover.
    if(spotlit||ordinary||candidate===2&&(distance<=1.5&&exposure>=.5||distance<=3&&brightness>=.25&&exposure>=.25))record.score=100;
    record.light=brightness;record.exposure=exposure;record.rate=rate;
    if(candidate===2&&recognized(record))record.lastKnown={x:target.x,y:target.y,z:target.z||0};
   }else record.score=Math.max(0,record.score-AWARENESS.decay*elapsed);
   record.spotlit=spotlit;record.position=[target.x,target.y,target.z||0].join(',');record.candidate=candidate;
   observer.awareness[key]=record;
  }
  for(const id of Object.keys(observer.awareness))if(!units.some(u=>String(u.id)===id))delete observer.awareness[id];
 }
}
export function awarenessPerception(s,a,b,candidate,zones){
 if(!s.rules?.awareness)return candidate;
 if(spotlightReveals(s,a,b,zones)||ordinaryReveals(s,a,b,zones))return 2;
 const record=a.awareness?.[b.id],score=record?.score||0;
 return candidate===2&&recognized(record)?2:candidate&&score>=25?1:0;
}
