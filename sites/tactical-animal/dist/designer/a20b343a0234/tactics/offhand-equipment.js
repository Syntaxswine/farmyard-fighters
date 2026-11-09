import * as T from './vendor/three.module.js';
import {createWeaponModel} from './weapon-models.js';
import {handWeapons,baseWeapon} from './one-handed.js';
const V=()=>new T.Vector3(),Q=()=>new T.Quaternion();

// Cosmetic equipment only. Both items keep their own authoritative inventory
// records; creating, posing or disposing this controller never spends ammo.
export function createOffhandEquipment(worker,{createWeapon=createWeaponModel}={}){
 const bones=Object.fromEntries(worker.bones.map(b=>[b.name,b]));let gun=null,kind=null;
 function clear(){gun?.root.removeFromParent();gun?.dispose();gun=null;kind=null;}
 function rotate(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(Q()).invert().multiply(q));worker.root.updateMatrixWorld(true);}
 function solve(side,point,handQ,offset){
  const a=bones['upperArm'+side],b=bones['forearm'+side],c=bones['hand'+side];if(!a||!b||!c)return;
  const start=a.getWorldPosition(V()),elbow=b.getWorldPosition(V()),hand=c.getWorldPosition(V()),la=start.distanceTo(elbow),lb=elbow.distanceTo(hand),wrist=point.clone().sub(offset.clone().applyQuaternion(handQ)),axis=wrist.clone().sub(start),d=Math.max(Math.abs(la-lb)+.0001,Math.min(la+lb-.0001,axis.length()));
  axis.normalize();const pole=new T.Vector3(0,-1,side*.35).applyQuaternion(worker.root.getWorldQuaternion(Q()));pole.addScaledVector(axis,-pole.dot(axis)).normalize();
  const along=(la*la-lb*lb+d*d)/(2*d),mid=start.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,la*la-along*along))),end=start.clone().addScaledVector(axis,d);
  rotate(a,Q().setFromUnitVectors(elbow.clone().sub(start).normalize(),mid.sub(start).normalize()).multiply(a.getWorldQuaternion(Q())));
  const current=b.getWorldPosition(V());rotate(b,Q().setFromUnitVectors(c.getWorldPosition(V()).sub(current).normalize(),end.sub(current).normalize()).multiply(b.getWorldQuaternion(Q())));rotate(c,handQ);
 }
 function place(asset,point,worldQ){
  const root=worker.root,parentQ=root.getWorldQuaternion(Q()),origin=point.clone().sub(asset.anchors.grip.position.clone().applyQuaternion(worldQ));
  asset.root.position.copy(root.worldToLocal(origin));asset.root.quaternion.copy(parentQ.invert().multiply(worldQ));root.updateMatrixWorld(true);
 }
 function sync(u,{primary=worker.weapon,aim=null,hidden=false,prone=0}={}){
  // Keep a one-handed item level in the living prone grip. Otherwise the
  // downward knife carry can start a subsequent release below the floor.
  if(!hidden&&!aim&&prone>.99&&(primary?.carry?.hands?.length===1||primary?.id==='flamethrower')&&primary.anchors?.grip&&bones.hand1){
   worker.root.updateMatrixWorld(true);const point=primary.anchors.grip.getWorldPosition(V()),relative=primary.root.getWorldQuaternion(Q()).invert().multiply(bones.hand1.getWorldQuaternion(Q())),direction=worker.root.getWorldQuaternion(Q()),left=bones['hand-1'],support=primary.id==='flamethrower'&&primary.anchors.support,leftOffset=support&&left.worldToLocal(support.getWorldPosition(V())),leftQ=support&&primary.root.getWorldQuaternion(Q()).invert().multiply(left.getWorldQuaternion(Q()));
   place(primary,point,direction);rotate(bones.hand1,direction.clone().multiply(relative));worker.skeleton.update();
   if(support)solve(-1,support.getWorldPosition(V()),direction.clone().multiply(leftQ),leftOffset);
   primary.updateHose?.(worker.root);worker.skeleton.update();for(const part of worker.parts){part.computeBoundingBox?.();part.computeBoundingSphere?.();}
  }
  const pair=handWeapons(u),next=pair[1];
  if(!next||!bones['hand-1']||!primary?.anchors?.grip){clear();return;}
  if(kind!==next){clear();kind=next;gun=createWeapon(next);worker.root.add(gun.root);}
  gun.root.visible=!hidden;if(hidden)return;
  worker.root.updateMatrixWorld(true);
  const right=bones.hand1,grip=primary.anchors.grip.getWorldPosition(V()),offset=right.worldToLocal(grip.clone()),relative=primary.root.getWorldQuaternion(Q()).invert().multiply(right.getWorldQuaternion(Q()));
  function aimed(side){const shoulder=bones['upperArm'+side].getWorldPosition(V()),forward=aim.clone().sub(shoulder).normalize(),position=shoulder.clone().addScaledVector(forward,.45).add(new T.Vector3(0,-.05,0));
   const z=forward.clone().cross(new T.Vector3(0,1,0)).normalize(),up=z.clone().cross(forward).normalize(),q=Q().setFromRotationMatrix(new T.Matrix4().makeBasis(forward,up,z));
   solve(side,position,q.clone().multiply(relative),offset);return q;
  }
  if(aim&&baseWeapon(u.weapon)==='pistol'){const q=aimed(1);place(primary,right.localToWorld(offset.clone()),q);}
  const hand=bones['hand-1'],point=hand.localToWorld(offset.clone());
  let direction=primary.root.getWorldQuaternion(Q());
  if(aim&&baseWeapon(kind)==='pistol'){
   direction=aimed(-1);point.copy(hand.localToWorld(offset.clone()));
  }
  place(gun,point,direction);worker.skeleton.update();if(aim)for(const part of worker.parts){part.computeBoundingBox?.();part.computeBoundingSphere?.();}
 }
 return {sync,hide(){if(gun)gun.root.visible=false;},get gun(){return gun;},dispose:clear};
}
