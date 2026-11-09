import {toWorld,DIMENSIONS} from './hybrid-world.js';
import {createEquipmentStow,supportsStow} from './equipment-stow.js';

// Lightweight presentation for ordinary tile ladders, windows, wall vaults and
// slips. Reviewed roof/cliff/tower journeys retain their own authored animation.
export const simpleTraversal=e=>['ladder','window','wall','fall'].includes(e?.kind);
export function simpleTraversalPoint(event,t){
 t=Math.max(0,Math.min(1,t));const a=toWorld(event.from),b=toWorld(event.to),p=a.map((v,i)=>v+(b[i]-v)*t);
 if(event.kind==='window')p[1]+=.75*Math.sin(Math.PI*t);
 if(event.kind==='wall')p[1]+=DIMENSIONS.floorSpacing*Math.sin(Math.PI*t);
 if(event.kind==='fall'){
  if(a[1]>b[1])p[1]=a[1]+(b[1]-a[1])*t*t;
  else p[1]+=event.height*DIMENSIONS.floorSpacing*Math.sin(Math.PI*t);
 }
 return p;
}
export function createSimpleTraversal(model,event,unit){
 const {worker,profile,posture,locomotion}=model,saved=[];
 worker.root.traverse(o=>saved.push({o,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone(),visible:o.visible}));
 const stow=worker.weapon&&supportsStow(worker.weapon.id)?createEquipmentStow(worker,profile):null;
 const heading=Math.atan2(event.to.y-event.from.y,event.to.x-event.from.x)*180/Math.PI;
 const facing=event.to.x===event.from.x&&event.to.y===event.from.y?unit.heading||0:heading;
 const duration=event.kind==='ladder'?(event.running?1.25:2.5):event.kind==='wall'?3:event.kind==='window'?1.8:1;
 let disposed=false;
 return {duration,climb:{skeleton:worker.skeleton,get equipmentState(){return stow?'stowed':'carried';}},apply(t){
  if(disposed)throw Error('Traversal already disposed');t=Math.max(0,Math.min(1,t));
  const wave=Math.sin(Math.PI*t),pose={kneel:event.kind==='window'?0:wave*.6,prone:event.kind==='window'?wave:0},sample={heading:facing,blend:0,distance:0,pose};
  worker.root.position.set(0,0,0);worker.root.rotation.set(0,0,0);
  if(locomotion)locomotion.apply(sample);else worker.pose('neutral',facing);
  posture?.apply(sample,{equipment:false});
  if(event.kind==='ladder'&&!profile.unarmed)for(const side of [-1,1]){
   const arm=worker.bones.find(b=>b.name==='upperArm'+side),leg=worker.bones.find(b=>b.name==='thigh'+side);
   if(arm)arm.rotation.z-=wave*(1.6+.3*Math.sin(t*Math.PI*8+side*Math.PI/2));
   if(leg)leg.rotation.z-=wave*.3*Math.sin(t*Math.PI*8+side*Math.PI/2);
  }
  stow?.apply();const worldRoot=simpleTraversalPoint(event,t);worker.root.position.fromArray(worldRoot);worker.root.updateMatrixWorld(true);worker.skeleton.update();return {worldRoot};
 },dispose(){if(disposed)return;stow?.dispose();posture?.resetTail();for(const {o,p,q,s,visible}of saved){o.position.copy(p);o.quaternion.copy(q);o.scale.copy(s);o.visible=visible;}worker.root.updateMatrixWorld(true);worker.skeleton.update();disposed=true;}};
}
