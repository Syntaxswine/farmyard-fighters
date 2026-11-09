import {MathUtils} from './aft/tactics/vendor/three.module.js';
import {rotateWorld,solveLimb} from './aft/tactics/idle-rig-math.js';
import {createShoulderAim} from './rifle-aim-pose.js';
import {V,Q,boreRotation,firingArm,setWorldPose,weaponGrip,yawAngle,yawRotation} from './weapon-pose-rig.js';
import {traceEnd} from './weapon-feedback.js';

const SHOULDER_KICK={assault:.85,rifle:1.38,smg:.48,shotgun:1.55,sniper:1.4,hmg:.96,rpg:.32,launcher:1};
const radians=Math.PI/180;
const smooth=(x,a,b)=>MathUtils.smoothstep(x,a,b);
const melee=weapon=>weapon==='knife'||weapon==='hands';
export function actionDuration(weapon){
  if(weapon==='grenade')return 660;
  if(melee(weapon))return 330;
  return 280;
}

// This is a presentation cursor. The acquisition fraction and the discharge
// event come from the scheduler and never advance the simulation.
export function weaponAction(previous,weapon,aim,shot,now,elapsed){
  if(previous?.weapon!==weapon)previous=null;
  const age=shot?Math.max(0,now-shot.at):Infinity,active=age<actionDuration(weapon);
  const desired=aim?.progress==null?0:.18+.82*smooth(aim.progress,0,.68);
  const amount=MathUtils.damp(previous?.amount||0,desired,aim?24:19,elapsed);
  const release=active?1-smooth(age,145,actionDuration(weapon)):0;
  const weight=Math.max(amount,release);
  const target=active?traceEnd(shot.event):aim?V(aim.x,aim.h,aim.y):previous?.target;
  if(!target||weight<.008)return null;
  const phase=active?(age<(melee(weapon)?105:100)?'discharge':'recover'):!aim?'recover':weight<.87?'ready':'aim';
  return {weapon,amount:weight,target,age,phase,active};
}

export function createWeaponPose(worker,profile){
  const root=worker.root,bones=Object.fromEntries(worker.bones.map(bone=>[bone.name,bone]));
  const right=firingArm(bones,1),left=firingArm(bones,-1);
  const shoulderRig=right&&left?createShoulderAim(worker,profile,bones,[left,right]):null;
  function finish(){root.updateMatrixWorld(true);worker.skeleton.update();}

  function face(heading,weight,sample){
    const turn=yawAngle(-heading-root.rotation.y)*weight;
    const twist=MathUtils.clamp(turn*sample.blend,-.82,.82)*(1-.68*sample.pose.prone);
    root.rotation.y+=turn-twist;
    root.updateMatrixWorld(true);
    if(twist&&bones.spine)rotateWorld(bones.spine,yawRotation(twist).multiply(bones.spine.getWorldQuaternion(Q())));
  }

  function braceFreeArm(arm,heading,prone,weight){
    if(!prone||!arm)return;
    const forward=V(1,0,0).applyQuaternion(yawRotation(-heading)),side=V(0,0,arm===left?-1:1).applyQuaternion(yawRotation(-heading));
    const shoulder=arm.upper.getWorldPosition(V()),hand=arm.hand.getWorldPosition(V());
    const support=shoulder.clone().addScaledVector(forward,.15).addScaledVector(side,.10);
    support.y=.105;
    arm.fit(hand.lerp(support,prone*weight),arm.hand.getWorldQuaternion(Q()),V(0,-1,0).add(side),-.35,{limit:true});
  }

  function pistol(sample,action,target){
    const gun=worker.weapon,offhand=sample.weapon==='pistol-offhand',arm=offhand?left:right,side=offhand?-1:1;
    const weight=action?.amount??0,prone=sample.pose.prone;
    const heading=target?Math.atan2(target.z,target.x):sample.heading*radians;
    face(heading,weight,sample);
    const frame=yawRotation(-heading),forward=V(1,0,0).applyQuaternion(frame),out=V(0,0,side).applyQuaternion(frame);
    const shoulder=arm.upper.getWorldPosition(V());
    const kick=action?.active?(1-smooth(action.age,0,110)):0;
    const ready=offhand?shoulder.clone().addScaledVector(forward,.20).addScaledVector(out,.035).add(V(0,-.18,0)):arm.hand.getWorldPosition(V());
    const distance=target?.distanceTo(shoulder)??2;
    const reach=MathUtils.clamp((distance-.19)*.78,.12,arm.length*.87)-.04*kick;
    const aim=shoulder.clone().addScaledVector(forward,reach).addScaledVector(out,-.035).add(V(0,-.028-.025*prone,0));
    const wrist=ready.lerp(aim,weight);
    const carry=offhand?boreRotation(heading,-.24):gun.root.getWorldQuaternion(Q());
    let rotation=boreRotation(heading,prone?.045:-.08),fitted=!target;
    if(target){
      // In gun space the target has the bore's two transverse coordinates.
      // Solve its remaining coordinate at the measured wrist-to-target range.
      const hand=weaponGrip(gun,'grip',Q());
      const bore=gun.anchors.muzzle.position.clone().sub(gun.anchors.grip.position).add(hand.palm.applyQuaternion(hand.rotation));
      const delta=target.clone().sub(wrist),along=Math.sqrt(delta.lengthSq()-bore.y*bore.y-bore.z*bore.z);
      if(along>bore.x+.008){
        const direction=delta.normalize();
        rotation=boreRotation(Math.atan2(direction.z,direction.x),Math.asin(MathUtils.clamp(direction.y,-1,1)));
        const toTarget=V(along,bore.y,bore.z).normalize().applyQuaternion(rotation);
        rotation.premultiply(Q().setFromUnitVectors(toTarget,direction));
        fitted=true;
      }
    }
    const lift=action?.active?.25*Math.sin(Math.PI*smooth(action.age,0,105))*kick:0;
    rotation.multiply(boreRotation(0,lift));
    rotation=carry.slerp(rotation,weight);
    const grip=weaponGrip(gun,'grip',rotation),pole=V(-.16,-1,side*.55).applyQuaternion(frame);
    arm.fit(wrist,grip.rotation,pole,grip.curl,{limit:true});
    const position=arm.hand.localToWorld(grip.palm).sub(gun.anchors.grip.position.clone().applyQuaternion(rotation));
    setWorldPose(gun.root,position,rotation);
    braceFreeArm(offhand?right:left,heading,prone,weight);
    finish();
    const angularError=target?V(1,0,0).applyQuaternion(rotation).angleTo(target.clone().sub(gun.anchors.muzzle.getWorldPosition(V()))):null;
    const supported=weight<.999||fitted;
    return {pose:offhand?'TT-33 left grip':'TT-33 right grip',supported,angularError,reason:supported?null:'endpoint-not-aligned'};
  }

  function strike(sample,action,target){
    const gun=worker.weapon,knife=gun.id==='knife',prone=sample.pose.prone,weight=Math.max(action.amount,.72*prone);
    const heading=Math.atan2(target.z,target.x);
    face(heading,weight,sample);
    const swing=action.active?smooth(action.age,0,105):0,settle=action.active?smooth(action.age,105,265):0;
    const sweep=swing*(1-settle),direction=knife?heading+.66-1.34*sweep:heading+.08;
    const forward=V(1,0,0).applyQuaternion(yawRotation(-direction));
    const side=V(0,0,1).applyQuaternion(yawRotation(-heading));
    const ready=right.hand.getWorldPosition(V()),shoulder=right.upper.getWorldPosition(V());
    const reach=right.length*(knife?.41+.48*sweep:.26+.69*sweep);
    const wrist=shoulder.addScaledVector(forward,reach).addScaledVector(side,.075-.10*sweep);
    wrist.y-=.10+.07*prone-.09*sweep;
    if(prone)wrist.y=Math.max(wrist.y,.15*prone);
    const rotation=boreRotation(direction,knife?-.64+.50*sweep+.52*prone:-.04),grip=weaponGrip(gun,'grip',rotation);
    right.fit(ready.lerp(wrist,weight),right.hand.getWorldQuaternion(Q()).slerp(grip.rotation,weight),V(0,-1,0).add(side),knife?-.93:-1.3,{limit:true});
    if(knife){
      const orientation=right.hand.getWorldQuaternion(Q()).multiply(grip.rotation.clone().invert().multiply(rotation));
      const position=right.hand.localToWorld(grip.palm).sub(gun.anchors.grip.position.clone().applyQuaternion(orientation));
      setWorldPose(gun.root,position,orientation);
    }
    if(prone)braceFreeArm(left,heading,prone,weight);
    else if(!knife){
      const guard=left.upper.getWorldPosition(V()).addScaledVector(forward,.20).add(V(0,-.08,0));
      left.fit(left.hand.getWorldPosition(V()).lerp(guard,weight),grip.rotation,V(0,-1,0).sub(side),-1.1,{limit:true});
    }
    finish();
    return {pose:knife?'knife slash':'unarmed jab'};
  }

  function crawl(sample){
    const strength=sample.pose.prone*sample.blend;
    if(!profile.proneAim||strength<.001)return;
    const facing=yawRotation(root.rotation.y),phase=sample.distance*Math.PI*5;
    for(const side of [-1,1]){
      const thigh=bones['thigh'+side],shin=bones['shin'+side],foot=bones['hoof'+side];
      const hip=thigh.getWorldPosition(V()),ankle=foot.getWorldPosition(V());
      const stride=side*Math.sin(phase)*strength;
      const offset=V(.09*stride,.039*Math.max(0,stride),side*.024*stride).applyQuaternion(facing);
      const reach=shin.position.length()+foot.position.length()-.002;
      const target=ankle.add(offset).sub(hip).clampLength(.08,reach).add(hip);
      solveLimb(thigh,shin,foot,target,foot.getWorldQuaternion(Q()),shin.getWorldPosition(V()).sub(hip));
    }
    finish();
  }

  return {crawl,apply(sample,action){
    const gun=worker.weapon;
    if(!shoulderRig)return null;
    if(!action){
      if(sample.weapon==='pistol-offhand')return pistol(sample,null,null);
      if(!sample.pose.prone||!(gun.anchors.stock||gun.id==='knife'))return null;
      const heading=sample.heading*radians;
      action={target:V(sample.x+8*Math.cos(heading),.85,sample.y+8*Math.sin(heading)),amount:0};
    }
    const target=action.target.clone().sub(V(sample.x,0,sample.y));
    if(gun.id==='pistol')return pistol(sample,action,target);
    if(melee(gun.id))return strike(sample,action,target);
    if(!gun.anchors.stock||!gun.anchors.support)return null;
    const kick=action.active?(1-smooth(action.age,0,145)):0;
    // The first frame is bore-aligned. The visible rise follows the flash.
    const lift=(gun.id==='rpg'?.032:.082)*Math.sin(Math.PI*smooth(action.age,0,110))*kick;
    target.y+=Math.hypot(target.x,target.z)*lift;
    const result=shoulderRig({aim:action.amount,recoil:SHOULDER_KICK[gun.id]*kick,target,sample});
    return {pose:result.supported?(gun.id==='rpg'?'RPG shoulder':'AFT shoulder'):'AFT held pose',...result};
  }};
}
