import * as T from './vendor/three.module.js';
import {makeBurnRoute,FIRE_TIME} from './painted-fire-state.js';
export const TANK_TIME=Object.freeze({burst:.55,duration:5.4});
export function tankBlastState(seconds){
 const time=Math.max(0,Number.isFinite(seconds)?seconds:0),age=time-TANK_TIME.burst,active=age>=0;
 return {time,age,active,burnTime:active?FIRE_TIME.hit+age:0,phase:!active?'Worn pack':age<.14?'Rupture':age<.58?'Outward blast':age<1.2?'Collapse':age<2.7?'Ground fire':'Smoke and ash'};
}
export function tankCentre(worker){
 const tanks=worker.weapon.parts.filter(p=>p.name==='fuel cylinder');if(tanks.length!==2)throw Error('Tank blast needs the authored twin cylinders');
 worker.root.updateMatrixWorld(true);const center=new T.Vector3();for(const p of tanks){p.geometry.computeBoundingBox();center.add(p.localToWorld(p.geometry.boundingBox.getCenter(new T.Vector3())));}return center.multiplyScalar(.5);
}
// Wrap the approved fire rig. The pack stays worn until the rupture event;
// destruction has no intact equipment drop and no extra movement step.
export function createTankBlastMotion(actor,route=makeBurnRoute([{x:0,z:0}])){
 const {worker,motion}=actor;if(worker.weapon?.id!=='flamethrower')throw Error('Tank blast requires a worn flamethrower');
 motion.burn(0,route);const origin=tankCentre(worker),initial=worker.weapon.mount.matrixWorld.clone();
 return {origin,initial,route,worker,
  apply(seconds){const blast=tankBlastState(seconds),body=motion.burn(blast.burnTime,route,{tankRupture:true});actor.dissolve.value=body.state.dissolve;return {blast,body,origin:origin.toArray()};},
  restore(){motion.restore();actor.dissolve.value=0;}
 };
}
