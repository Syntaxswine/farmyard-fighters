import * as T from './vendor/three.module.js';
import {createEquipmentStow} from './equipment-stow.js';
export const DRAW_DURATION_MS=850;
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
// Apply after the normal body/carry pose. Only equipment and arm rotations change.
export function createEquipmentDraw(worker,profile){
 const root=worker.root,gun=worker.weapon,stow=createEquipmentStow(worker,profile),named=Object.fromEntries(worker.bones.map(b=>[b.name,b]));let disposed=false;
 function rotate(bone,q){bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));root.updateMatrixWorld(true);}
 function solve(side,target,handQ,offset){const a=named['upperArm'+side],b=named['forearm'+side],c=named['hand'+side],start=a.getWorldPosition(V()),elbow=b.getWorldPosition(V()),hand=c.getWorldPosition(V()),la=start.distanceTo(elbow),lb=elbow.distanceTo(hand),wrist=target.clone().sub(offset.clone().applyQuaternion(handQ)),axis=wrist.clone().sub(start),distance=Math.max(Math.abs(la-lb)+.0001,Math.min(la+lb-.0001,axis.length()));axis.normalize();const end=start.clone().addScaledVector(axis,distance),pole=V(-.1,-.8,side).applyQuaternion(root.getWorldQuaternion(new T.Quaternion()));pole.addScaledVector(axis,-pole.dot(axis)).normalize();const along=(la*la-lb*lb+distance*distance)/(2*distance),mid=start.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,la*la-along*along)));
  rotate(a,new T.Quaternion().setFromUnitVectors(elbow.clone().sub(start).normalize(),mid.clone().sub(start).normalize()).multiply(a.getWorldQuaternion(new T.Quaternion())));
  const current=b.getWorldPosition(V()),tip=c.getWorldPosition(V());rotate(b,new T.Quaternion().setFromUnitVectors(tip.sub(current).normalize(),end.clone().sub(current).normalize()).multiply(b.getWorldQuaternion(new T.Quaternion())));rotate(c,handQ);return c.localToWorld(offset.clone()).distanceTo(target);
 }
 function apply(progress){if(disposed)throw Error('Weapon draw is disposed');if(worker.weapon!==gun)throw Error('Weapon changed during draw');if(!Number.isFinite(progress))throw Error('Invalid draw progress');const p=Math.max(0,Math.min(1,progress));if(p>=1||gun.id==='hands'){stow.restore();return {state:'carried',progress:1,contacts:[]};}
  root.updateMatrixWorld(true);const endP=gun.root.position.clone(),endQ=gun.root.quaternion.clone(),endWorldQ=gun.root.getWorldQuaternion(new T.Quaternion()),hands=(gun.carry.hands||[]).map(side=>{const hand=named['hand'+side],anchor=gun.anchors[side===1?'grip':'support'],point=anchor.getWorldPosition(V()),q=hand.getWorldQuaternion(new T.Quaternion());return {side,anchor,point,q,relative:endWorldQ.clone().invert().multiply(q),offset:hand.worldToLocal(point.clone())};});
  stow.apply();const startP=gun.root.position.clone(),startQ=gun.root.quaternion.clone(),move=smooth((p-.25)/.75);let pickup;
  if(hands.length){const shoulder=named.upperArm1.getWorldPosition(V()),closest=V();let best=Infinity;gun.root.traverse(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.attributes.position;for(let i=0;i<positions.count;i++){closest.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);const d=closest.distanceToSquared(shoulder);if(d<best){best=d;pickup=gun.root.worldToLocal(closest.clone());}}});}
  const grip=gun.anchors.grip,grabPoint=pickup&&grip?pickup.clone().lerp(grip.position,smooth((p-.55)/.4)):null;
  if(p>.25){stow.restore();const q=startQ.clone().slerp(endQ,move);
   if(pickup&&grip){const start=pickup.clone().applyQuaternion(startQ).add(startP),end=grip.position.clone().applyQuaternion(endQ).add(endP),contact=start.clone().lerp(end,move);contact.z+=(.46-contact.z)*Math.sin(Math.PI*move);contact.y+=.025*Math.sin(Math.PI*move);gun.root.position.copy(contact).sub(grabPoint.clone().applyQuaternion(q));}
   else gun.root.position.copy(startP).lerp(endP,move);
   gun.root.quaternion.copy(q);gun.root.visible=true;root.updateMatrixWorld(true);
  }
  const contacts=[];for(const h of hands){const blend=smooth((p-(h.side===1?0:.70))/(h.side===1?.25:.25)),grab=h.side===1&&grabPoint?grabPoint.clone():h.anchor.position.clone(),target=gun.root.localToWorld(grab).lerp(h.point,1-blend),q=h.q.clone().slerp(gun.root.getWorldQuaternion(new T.Quaternion()).multiply(h.relative),blend);contacts.push({side:h.side,error:solve(h.side,target,q,h.offset),engaged:blend===1});}
  gun.updateHose?.(root);root.updateMatrixWorld(true);worker.skeleton.update();return {state:'drawing',progress:p,contacts};
 }
 return {apply,dispose(){if(disposed)return;disposed=true;stow.dispose();}};
}
