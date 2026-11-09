import {createLedgeDescent} from './ledge-descent.js';
import {createHenLedgeDescent} from './hen-ledge-descent.js';
import {roofAnimationFrame} from './roof-journey.js';
import {cliffClearanceFrame} from './cliff-journey.js';
import {cliffSupportAt} from './cliff-support.js';
import {toWorld} from './hybrid-world.js';
import {ledgeHeightFrame} from './ledge-height-frame.js';
export function supportsLedgeDescent(u){return !!u&&u.hp>0&&!u.away&&!u.casualty&&(u.species==='hen'?u.weapon==='hands':['horse','goat','bull','cow','donkey','sheep','skunk','rabbit','dog','pig-foreman','pig-director'].includes(u.species)&&(u.weapon==='rifle'||u.species==='donkey'&&u.weapon==='hands'));}
export function descentAnimationFrame(state,event,unit){
 if(event?.direction!=='down'||!['roof','cliff'].includes(event.kind)||!supportsLedgeDescent(unit))return null;
 const reverse={...event,direction:'up',from:event.to,to:event.from};
 const frame=event.kind==='roof'?roofAnimationFrame(state,reverse,unit):cliffClearanceFrame(state,reverse,unit);
 if(!frame)return null;
 // The ground landing must also be free; the reversed ascent gate checks the lip.
 const a=event.to;
 if(state.units.some(u=>u.id!==unit.id&&!u.away&&(u.hp>0||['bleeding','stable'].includes(u.casualty))&&(u.z||0)===(a.z||0)&&Math.hypot(u.x-a.x,u.y-a.y)<1.2))return null;
 return {...frame,fromWorld:frame.toWorld||toWorld({...event.from,cliffSupport:event.kind==='cliff'?cliffSupportAt(state,event.from):undefined}),toWorld:frame.fromWorld||toWorld(event.to)};
}
// Presentation only: traversal was committed by the engine before this clip starts.
export function createDescentJourney(worker,profile,event,frame){
 const clip=profile.id==='hen'?createHenLedgeDescent(worker,profile):createLedgeDescent(worker,profile),entry=.35,exit=.5,duration=entry+clip.duration+exit;let equipmentState='carried';
 return {duration,climb:{get equipmentState(){return equipmentState;},get skeleton(){return clip.skeleton||worker.skeleton;}},apply(progress){
  const time=Math.max(0,Math.min(1,progress))*duration,p=Math.max(0,Math.min(1,(time-entry)/clip.duration)),pose=clip.apply(p,ledgeHeightFrame(clip,p,frame,'down'));
  equipmentState=p===0||p===1||pose.unarmed||pose.weapon==='hands'?'carried':pose.equipment==='slung'?'stowed':'drawing';
  if(time<entry||time>entry+clip.duration){const target=time<entry?frame.fromWorld:frame.toWorld,k=time<entry?1-time/entry:(time-entry-clip.duration)/exit,e=k*k*(3-2*k);worker.root.position.lerp({x:target[0],y:target[1],z:target[2]},e);worker.root.updateMatrixWorld(true);(clip.skeleton||worker.skeleton).update();}
  return {...pose,worldRoot:worker.root.position.toArray()};
 },dispose(){clip.dispose();}};
}
