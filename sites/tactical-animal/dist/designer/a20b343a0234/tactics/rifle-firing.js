import * as T from './vendor/three.module.js';
import {poseRoofMantleCarry} from './roof-mantle-equipment.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
class GripRangeError extends Error {}
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
// Presentation only: a failed pose never cancels or changes a resolved core shot.
export function createRifleFiring(worker,profile,posture=null){
 worker.root.position.set(0,0,0);worker.root.rotation.set(0,0,0);worker.pose('neutral');
 const named=Object.fromEntries(worker.bones.map(b=>[b.name,b]));
 const rest=new Map(worker.bones.map(b=>[b,b.getWorldPosition(V())]));
 function rotation(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));worker.root.updateMatrixWorld(true);}
 function raw(aim,recoil,heading,pitch,sample){
  const gun=worker.weapon,root=worker.root;root.position.set(0,0,0);root.rotation.set(0,0,0);poseRoofMantleCarry(worker,profile);
  named.spine.rotation.x=.16*aim;named.spine.rotation.z=-.02*recoil+(profile.proneAim?.torsoFollow||0)*pitch*(sample?.pose?.prone||0)*aim;
  named.head.rotation.z=(pitch*(profile.headPitchSlope??1.5)+(profile.headPitch??-.9))*aim;
  named.head.rotation.y=((profile.headYaw??25)*Math.PI/180+.4*pitch)*aim;root.updateMatrixWorld(true);
  posture?.apply({...sample,heading:0},{equipment:false});
  named.head.rotation.z+=(sample?.pose?.prone||0)*(1+(profile.proneAim?.headOffset||0));root.updateMatrixWorld(true);
  const spineQ=named.spine.getWorldQuaternion(new T.Quaternion()),spineOrigin=named.spine.getWorldPosition(V());
  const carryPosition=new T.Vector3(...gun.carry.position).sub(rest.get(named.spine)).applyQuaternion(spineQ).add(spineOrigin);
  const carryQ=new T.Quaternion().setFromUnitVectors(V(1,0,0),new T.Vector3(...gun.carry.axis).normalize());
  const yaw=-(profile.bodyYaw??35)*Math.PI/180,axis=V(Math.cos(yaw)*Math.cos(pitch),Math.sin(pitch),Math.sin(yaw)*Math.cos(pitch));
  const aimQ=new T.Quaternion().setFromUnitVectors(V(1,0,0),axis);
  const stockOffset=new T.Vector3(...(profile.stockOffset||[-.045,.070,-.035]));
  if(profile.proneAim)stockOffset.lerp(new T.Vector3(...profile.proneAim.stock),sample?.pose?.prone||0);
  const stock=named.upperArm1.getWorldPosition(V()).add(stockOffset.applyQuaternion(spineQ));
  gun.root.quaternion.copy(spineQ.clone().multiply(carryQ)).slerp(aimQ,aim);
  gun.root.position.copy(carryPosition).lerp(stock.sub(gun.anchors.stock.position.clone().applyQuaternion(aimQ)),aim).addScaledVector(axis,-.038*recoil);
  root.updateMatrixWorld(true);
  const handQ=new T.Quaternion().setFromUnitVectors(V(0,-1,0),V(1,0,0).applyQuaternion(gun.root.quaternion));
  for(const side of [-1,1]){
   const a=named['upperArm'+side],b=named['forearm'+side],c=named['hand'+side],anchor=side===1?'grip':'support';
   const target=gun.anchors[anchor].getWorldPosition(V()).sub(V(.052,-.010,0).applyQuaternion(handQ)),start=a.getWorldPosition(V());
   const ra=rest.get(a),rb=rest.get(b),rc=rest.get(c),la=ra.distanceTo(rb),lb=rb.distanceTo(rc),axis=target.clone().sub(start),d=axis.length();
   if(d>la+lb+1e-6||d<Math.abs(la-lb)+1e-8)throw new GripRangeError(profile.id+' rifle grip outside arm reach');
   axis.normalize();const along=(la*la-lb*lb+d*d)/(2*d),pole=V(-.12,-1,side*.55);pole.addScaledVector(axis,-pole.dot(axis));
   if(pole.lengthSq()<1e-8){pole.copy(V(0,0,1)).addScaledVector(axis,-axis.z);if(pole.lengthSq()<1e-8)pole.copy(V(1,0,0)).addScaledVector(axis,-axis.x);}pole.normalize();
   const mid=start.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,la*la-along*along)));
   rotation(a,new T.Quaternion().setFromUnitVectors(rb.clone().sub(ra).normalize(),mid.clone().sub(start).normalize()));
   rotation(b,new T.Quaternion().setFromUnitVectors(rc.clone().sub(rb).normalize(),target.clone().sub(mid).normalize()));rotation(c,handQ);named['fingers'+side].rotation.z=-.9;
  }
  root.rotation.y=-heading+yaw*aim;root.updateMatrixWorld(true);worker.skeleton.update();if(posture&&Object.values(sample?.pose||{}).some(v=>v>0))posture.ground();
 }
 function muzzle(){const gun=worker.weapon;return {origin:gun.anchors.muzzle.getWorldPosition(V()),direction:V(1,0,0).transformDirection((gun.barrel||gun.root).matrixWorld)};}
 let supported=false,lastResult;
 return {apply({aim,recoil=0,target,sample}){
  aim=Math.max(aim,sample?.pose?.prone||0);
  const heading=Math.atan2(target.z,target.x),pitch=Math.atan2(target.y-1.3,Math.hypot(target.x,target.z));
  let best=null,reachFailures=0;
  function evaluate(h,p){
   if(!Number.isFinite(h+p)||Math.abs(p)>Math.PI/2-.005)return null;
   try{raw(aim,recoil,h,p,sample);}catch(e){if(!(e instanceof GripRangeError))throw e;reachFailures++;return null;}
   const m=muzzle(),delta=target.clone().sub(m.origin),direction=m.direction;
   const residual=[wrap(Math.atan2(delta.z,delta.x)-Math.atan2(direction.z,direction.x)),Math.atan2(delta.y,Math.hypot(delta.x,delta.z))-Math.atan2(direction.y,Math.hypot(direction.x,direction.z))];
   const error=delta.lengthSq()<1e-12?Math.PI:direction.angleTo(delta),result={h,p,residual,error};
   if(!best||error<best.error)best=result;return result;
  }
  let current=evaluate(heading,pitch);
  // Near/steep endpoints may put the first wrist target outside the authored
  // reach. Start from a feasible shoulder pose; never clamp a displayed wrist.
  if(!current)for(const p of [pitch*.5,0,-.15,.15]){current=evaluate(heading,p);if(current)break;}
  const firstValid=current;
  if(aim>=.999&&current)for(let i=0;i<14&&current.error>.0005;i++){
   const epsilon=.0005,a=evaluate(current.h+epsilon,current.p),b=evaluate(current.h,current.p+epsilon);
   let dh=current.residual[0],dp=current.residual[1];
   if(a&&b){
    const j00=wrap(a.residual[0]-current.residual[0])/epsilon,j10=(a.residual[1]-current.residual[1])/epsilon,j01=wrap(b.residual[0]-current.residual[0])/epsilon,j11=(b.residual[1]-current.residual[1])/epsilon,det=j00*j11-j01*j10;
    if(Math.abs(det)>1e-6){dh=(-j11*current.residual[0]+j01*current.residual[1])/det;dp=(j10*current.residual[0]-j00*current.residual[1])/det;}
   }
   const limit=Math.min(1,.35/Math.max(Math.abs(dh),Math.abs(dp),1e-9));let next=null;
   for(let step=limit;step>=limit/64;step/=2){const trial=evaluate(current.h+dh*step,current.p+dp*step);if(trial&&trial.error<current.error-1e-8){next=trial;break;}}
   if(!next)break;current=next;
  }
  supported=!!best&&(aim<.999||best.error<=.0005);
  // Every search changes bones. Reapply the chosen complete valid pose in this
  // same frame, even if the endpoint could not be aligned. No stale partial IK.
  const accepted=supported?best:(evaluate(heading,0)||firstValid||best);
  if(accepted)raw(aim,recoil,accepted.h,accepted.p,sample);
  else {worker.root.position.set(0,0,0);worker.root.rotation.set(0,0,0);poseRoofMantleCarry(worker,profile);worker.root.rotation.y=-(sample?.heading||0)*Math.PI/180;posture?.apply(sample||{});posture?.ground();}
  lastResult={...muzzle(),supported,reason:supported?null:firstValid?'endpoint-not-aligned':'grip-range',angularError:accepted?.error??null,reachFailures};return lastResult;
 },muzzle:()=>supported?muzzle():null,get status(){return lastResult;}};
}
