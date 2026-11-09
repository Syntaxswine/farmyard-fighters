import {simpleTraversal,createSimpleTraversal} from './simple-traversal.js';
import {descentAnimationFrame,createDescentJourney,supportsLedgeDescent} from './ledge-descent-journey.js';
import {roofAnimationFrame,createRoofJourney,supportsRoofMantle} from './roof-journey.js';
import {cliffAnimationFrame,createCliffJourney,supportsCliffMantle} from './cliff-journey.js';
import {supportsStow} from './equipment-stow.js';
import {createLadderJourney} from './ladder-journey.js';
import {towerCenter,WOODEN_LADDER} from './tower-geometry.js';
import {toWorld,DIMENSIONS} from './hybrid-world.js';
export function ladderFrame(tower){const wooden=tower.kind==='wooden-spotlight-tower',c=towerCenter(tower),x=wooden?0:1.84,y=wooden?WOODEN_LADDER.z+.35:-.8;return {origin:[c.x+(tower.rotated?-y:x),(tower.z||0)*DIMENSIONS.floorSpacing,c.y+(tower.rotated?x:y)],heading:(wooden?270:180)+(tower.rotated?90:0)};}
export function canAnimateLadder(event,unit){
 if(event?.access!=='ladder'||!['iron-searchlight-ladder-tower','wooden-spotlight-tower'].includes(event.tower?.kind)||!unit||unit.hp<=0)return false;
 if(unit.species==='hen')return unit.weapon==='hands';
 if(!['horse','goat','bull','cow','donkey','sheep','skunk','rabbit','dog','pig-foreman','pig-director'].includes(unit.species))return false;
 return event.tower.kind==='wooden-spotlight-tower'||unit.species.startsWith('pig')?unit.weapon==='rifle':supportsStow(unit.weapon);
}
// Consumes committed events; never changes simulation state, AP or the clock.
export class BattleTraversal {
 constructor(prepare=null){this.prepare=prepare;this.lastId=0;this.lastCliffId=0;this.lastRoofId=0;this.lastSimpleId=0;this.active=null;this.queue=[];}
 observe(state,now,reduced=false){const event=state.towerTraversal;if(event&&event.id>this.lastId){this.lastId=event.id;const unit=state.units.find(u=>u.id===event.unitId);if(!reduced&&unit?.team==='squad'&&canAnimateLadder(event,unit))this.queue.push(structuredClone(event));}for(const e of state.cliffTraversals||[]){if(e.id<=this.lastCliffId)continue;this.lastCliffId=e.id;const u=state.units.find(u=>u.id===e.unitId),frame=!reduced&&u?.team==='squad'&&(e.direction==='down'?descentAnimationFrame(state,e,u):cliffAnimationFrame(state,e,u));if(frame)this.queue.push({...structuredClone(e),frame});}for(const e of state.roofTraversals||[]){if(e.id<=this.lastRoofId)continue;this.lastRoofId=e.id;const u=state.units.find(u=>u.id===e.unitId),frame=!reduced&&u?.team==='squad'&&(e.direction==='down'?descentAnimationFrame(state,e,u):roofAnimationFrame(state,e,u));if(frame)this.queue.push({...structuredClone(e),frame});}for(const e of state.simpleTraversals||[state.simpleTraversal].filter(Boolean)){if(e.id<=this.lastSimpleId)continue;this.lastSimpleId=e.id;const u=state.units.find(u=>u.id===e.unitId);if(!reduced&&u?.team==='squad'&&simpleTraversal(e))this.queue.push(structuredClone(e));}if(!this.active&&this.queue.length)this.active={event:this.queue.shift(),start:null};
  const a=this.active;if(a){const u=state.units.find(u=>u.id===a.event.unitId);if(reduced||!u||u.hp<=0||u.away||u.casualty||!(simpleTraversal(a.event)||(['roof','cliff'].includes(a.event.kind)&&a.event.direction==='down'?supportsLedgeDescent(u):a.event.kind==='roof'?supportsRoofMantle(u):a.event.kind==='cliff'?supportsCliffMantle(u):canAnimateLadder(a.event,u)))||a.weapon&&a.weapon!==u.weapon||a.start!==null&&now-a.start>=(a.motion?.duration??6)*1000/(a.event.speed||1))this.finish();}
 }
 pose(model,unit,now){const a=this.active;if(!a||a.event.unitId!==unit.id)return false;
  if(!simpleTraversal(a.event)&&!['cliff','roof'].includes(a.event.kind)&&this.prepare&&!a.ready){
   if(!a.preparing){a.preparing=true;a.weapon=unit.weapon;this.prepare(model.profile,a.event.tower.kind).then(()=>{if(this.active===a)a.ready=true;},error=>{if(this.active===a)a.error=error;});}
   if(a.error)throw a.error;
   // Leave normal carry posing to the renderer at the committed entry while loading.
   return false;
  }
  const {worker,root,profile}=model;root.position.set(0,0,0);root.rotation.set(0,0,0);root.updateMatrixWorld(true);
  if(!a.motion){worker.root.position.set(0,0,0);worker.root.rotation.set(0,0,0);root.updateMatrixWorld(true);model.posture?.resetTail();a.weapon=unit.weapon;a.motion=simpleTraversal(a.event)?createSimpleTraversal(model,a.event,unit):['roof','cliff'].includes(a.event.kind)&&a.event.direction==='down'?createDescentJourney(worker,profile,a.event,a.event.frame):a.event.kind==='roof'?createRoofJourney(worker,profile,a.event,a.event.frame):a.event.kind==='cliff'?createCliffJourney(worker,profile,a.event,a.event.frame):createLadderJourney(worker,profile,a.event,ladderFrame(a.event.tower),unit.heading||0,{preparedOnly:!!this.prepare});a.model=model;a.start=now;}
  const pose=a.motion.apply(Math.min(1,Math.max(0,(now-a.start)*(a.event.speed||1)/(a.motion.duration*1000))));a.position=pose.worldRoot;(a.motion.climb.skeleton||worker.skeleton).update();for(const part of worker.parts){part.computeBoundingBox?.();part.computeBoundingSphere?.();}return true;
 }
 display(unit){const a=this.active;if(a?.event.unitId!==unit.id)return unit;const p=a.position||toWorld(a.event.from);return {...unit,x:p[0],y:p[2],z:0,h:p[1],cliffSupport:undefined,towerPost:undefined,towerElevation:p[1]};}
 finish(){const a=this.active;if(a?.motion){a.motion.dispose();a.model.drawRequested=false;a.model.signature=null;a.model.placement=null;}this.active=null;}
 get preparing(){return !!this.active?.preparing&&!this.active?.ready;}
 get busy(){return !!this.active||!!this.queue.length;}
 clear(){this.finish();this.queue=[];this.lastId=0;this.lastCliffId=0;this.lastRoofId=0;this.lastSimpleId=0;}
}
