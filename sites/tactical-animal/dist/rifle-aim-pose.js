import {MathUtils} from './aft/tactics/vendor/three.module.js';
import {rotateWorld,snapshot,restore} from './aft/tactics/idle-rig-math.js';
import {V,Q,boreRotation,setWorldPose,weaponGrip,yawAngle,yawRotation} from './weapon-pose-rig.js';

// Adapted from AFT rifle-firing.js at a20b343a0234. Keep the authored
// shoulder/hand anchors and the bounded PRONE-AIM-REPAIR bore search, with
// the production locomotion and posture frame supplying the lower body.
export function createShoulderAim(worker,profile,bones,arms){
  const root=worker.root,{spine,head,upperArm1}=bones;
  const upperBody=[spine,head,...[-1,1].flatMap(side=>['upperArm','forearm','hand','fingers'].map(name=>bones[name+side]))];
  const yaw=-(profile.bodyYaw??35)*Math.PI/180;

  return function aimShoulder({aim,recoil,target,sample}){
    const gun=worker.weapon,prone=sample.pose.prone;
    const base=snapshot(upperBody),baseYaw=root.rotation.y;
    const basePosition=gun.root.position.clone(),baseRotation=gun.root.quaternion.clone();
    const carry=spine.worldToLocal(gun.root.getWorldPosition(V()));
    const carryQ=spine.getWorldQuaternion(Q()).invert().multiply(gun.root.getWorldQuaternion(Q()));
    function reset(){
      restore(base);root.rotation.y=baseYaw;
      gun.root.position.copy(basePosition);gun.root.quaternion.copy(baseRotation);
      root.updateMatrixWorld(true);
    }

    function fit(heading,pitch){
      reset();
      const readyYaw=baseYaw+yawAngle(-heading+yaw*Math.max(aim,prone*.63)-baseYaw)*Math.max(aim,prone);
      const twist=MathUtils.clamp(yawAngle(readyYaw-baseYaw)*sample.blend,-.85,.85)*(1-.66*prone);
      root.rotation.y=readyYaw-twist;
      root.updateMatrixWorld(true);
      if(twist)rotateWorld(spine,yawRotation(twist).multiply(spine.getWorldQuaternion(Q())));
      spine.rotateX(.16*aim);
      spine.rotateZ(-.02*recoil+(profile.proneAim?.torsoFollow||0)*pitch*prone*aim);
      head.rotateZ((pitch*(profile.headPitchSlope??1.5)+(profile.headPitch??-.9)+prone*(1+(profile.proneAim?.headOffset||0)))*aim);
      head.rotateY(((profile.headYaw??25)*Math.PI/180+.4*pitch)*aim);
      root.updateMatrixWorld(true);

      const spineQ=spine.getWorldQuaternion(Q()),aimQ=boreRotation(heading,pitch);
      const stockOffset=V(...(profile.stockOffset||[-.045,.070,-.035]));
      if(profile.proneAim)stockOffset.lerp(V(...profile.proneAim.stock),prone);
      const stock=upperArm1.getWorldPosition(V()).add(stockOffset.applyQuaternion(spineQ));
      const axis=V(1,0,0).applyQuaternion(aimQ);
      if(gun.id==='rpg')stock.y+=.045;
      if(gun.id==='hmg')stock.addScaledVector(axis,-.045*prone);
      const stockPosition=stock.clone().sub(gun.anchors.stock.position.clone().applyQuaternion(aimQ));

      // At floor level the resting rifle is already near the shoulder. A
      // lifted bore leaves room for the HMG bipod and RPG tube while raising.
      const lowQ=boreRotation(heading-.20,Math.max(-.02,pitch)+.085);
      const lowPosition=stock.clone().add(V(0,-.018,0)).sub(gun.anchors.stock.position.clone().applyQuaternion(lowQ));
      const rotation=spineQ.multiply(carryQ).slerp(lowQ,prone).slerp(aimQ,aim);
      const position=spine.localToWorld(carry.clone()).lerp(lowPosition,prone).lerp(stockPosition,aim).addScaledVector(axis,-.038*recoil);
      const contacts=[-1,1].map((side,index)=>{
        const arm=arms[index];
        const name=side===1?'grip':'support',grip=weaponGrip(gun,name,rotation);
        const offset=gun.anchors[name].position.clone().applyQuaternion(rotation).sub(grip.palm.applyQuaternion(grip.rotation));
        const center=arm.upper.getWorldPosition(V()).sub(offset);
        const pole=V(-.12,-1,side*(.55+.48*prone)).applyQuaternion(yawRotation(-heading));
        return {arm,grip,offset,center,pole};
      });
      // Settle the whole receiver into both reach volumes. Moving the grip
      // anchors together keeps the stock near its seat without wrist sliding.
      const seat=position.clone();
      for(let pass=0;pass<6;pass++)for(const {arm,center} of contacts){
        const delta=position.clone().sub(center),reach=arm.length-.009;
        if(delta.lengthSq()>reach*reach)position.copy(center).add(delta.setLength(reach));
      }
      if(position.distanceTo(seat)>MathUtils.lerp(.24,.072,aim))return false;
      setWorldPose(gun.root,position,rotation);
      for(const {arm,grip,offset,pole} of contacts){
        if(!arm.fit(position.clone().add(offset),grip.rotation,pole,grip.curl))return false;
      }
      return true;
    }

    const heading=Math.atan2(target.z,target.x),pitch=Math.atan2(target.y-1.3,Math.hypot(target.x,target.z));
    const muzzle=()=>({origin:gun.anchors.muzzle.getWorldPosition(V()),direction:V(1,0,0).transformDirection((gun.barrel||gun.root).matrixWorld)});
    function evaluate(h,p){
      if(!Number.isFinite(h+p)||Math.abs(p)>Math.PI/2-.005||!fit(h,p))return null;
      const {origin,direction}=muzzle(),delta=target.clone().sub(origin);
      const error=delta.lengthSq()<1e-12?Math.PI:direction.angleTo(delta);
      const azimuth=yawAngle(Math.atan2(delta.z,delta.x)-Math.atan2(direction.z,direction.x));
      const elevation=Math.atan2(delta.y,Math.hypot(delta.x,delta.z))-Math.atan2(direction.y,Math.hypot(direction.x,direction.z));
      return {h,p,error,azimuth,elevation};
    }

    let current=evaluate(heading,pitch);
    if(!current)for(const p of [pitch*.5,0,-.15,.15]){
      current=evaluate(heading,p);
      if(current)break;
    }
    // Search only when a fully raised bore needs alignment. Every trial
    // starts from the complete gait frame and checks rigid arm reach.
    if(aim>=.999&&current)for(let i=0;i<14&&current.error>.0005;i++){
      const epsilon=.0005,a=evaluate(current.h+epsilon,current.p),b=evaluate(current.h,current.p+epsilon);
      let dh=current.azimuth,dp=current.elevation;
      if(a&&b){
        const j00=yawAngle(a.azimuth-current.azimuth)/epsilon,j10=(a.elevation-current.elevation)/epsilon;
        const j01=yawAngle(b.azimuth-current.azimuth)/epsilon,j11=(b.elevation-current.elevation)/epsilon,det=j00*j11-j01*j10;
        if(Math.abs(det)>1e-6){
          dh=(-j11*current.azimuth+j01*current.elevation)/det;
          dp=(j10*current.azimuth-j00*current.elevation)/det;
        }
      }
      const limit=Math.min(1,.35/Math.max(Math.abs(dh),Math.abs(dp),1e-9));
      let next=null;
      for(let step=limit;step>=limit/64;step/=2){
        const trial=evaluate(current.h+dh*step,current.p+dp*step);
        if(trial&&trial.error<current.error-1e-8){next=trial;break;}
      }
      if(!next)break;
      current=next;
    }
    const supported=!!current&&(aim<.999||current.error<=.0005);
    const held=supported?current:(evaluate(heading,0)||current);
    if(held)fit(held.h,held.p);
    else reset();
    root.updateMatrixWorld(true);worker.skeleton.update();
    return {...muzzle(),supported,reason:supported?null:held?'endpoint-not-aligned':'grip-range',angularError:held?.error??null};
  };
}
