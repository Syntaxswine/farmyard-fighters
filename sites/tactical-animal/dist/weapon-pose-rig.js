import * as T from './aft/tactics/vendor/three.module.js';
import {solveLimb} from './aft/tactics/idle-rig-math.js';

export const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
export const Q=()=>new T.Quaternion();
export const yawAngle=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
export const yawRotation=yaw=>Q().setFromAxisAngle(V(0,1,0),yaw);
export const boreRotation=(heading,pitch=0)=>yawRotation(-heading).multiply(Q().setFromAxisAngle(V(0,0,1),pitch));
export const palmOffset=()=>V(.052,-.010,0);
const triggerHand=Q().setFromUnitVectors(V(0,-1,0),V(1,0,0));

export function setWorldPose(object,position,rotation){
  object.position.copy(object.parent.worldToLocal(position.clone()));
  object.quaternion.copy(object.parent.getWorldQuaternion(Q()).invert().multiply(rotation));
  object.updateWorldMatrix(false,true);
}

export function firingArm(bones,side){
  const upper=bones['upperArm'+side],fore=bones['forearm'+side],hand=bones['hand'+side],fingers=bones['fingers'+side];
  if(!upper||!fore||!hand||!fingers)return null;
  const max=fore.position.length()+hand.position.length(),min=Math.abs(fore.position.length()-hand.position.length());
  return {upper,hand,length:max,fit(target,rotation,pole,curl=-.9,{limit=false}={}){
    const shoulder=upper.getWorldPosition(V()),offset=target.clone().sub(shoulder),distance=offset.length();
    if(distance>max-1e-5||distance<min+1e-5){
      if(!limit||!distance)return false;
      target=shoulder.add(offset.multiplyScalar(T.MathUtils.clamp(distance,min+.002,max-.002)/distance));
    }
    solveLimb(upper,fore,hand,target,rotation,pole);
    fingers.rotation.z=curl;
    return true;
  }};
}

export function weaponGrip(weapon,name,weaponRotation){
  const fit=weapon.carry.handPoses?.[name],palm=fit?.palm?V(...fit.palm):palmOffset();
  return {palm,rotation:weaponRotation.clone().multiply(fit?.quaternion?Q().fromArray(fit.quaternion):triggerHand),
    curl:fit?.fingerCurl??-.9};
}
