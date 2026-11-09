import {MathUtils} from './aft/tactics/vendor/three.module.js';
import {createGrenadeModel} from './aft/tactics/grenade-model.js';
import {V,Q,firingArm,palmOffset,setWorldPose,yawRotation} from './weapon-pose-rig.js';
import {GRENADE_THROW,createGrenadeThrow} from './designer/a20b343a0234/tactics/grenade-throw-motion.js';
import {GRENADE_PREPARED} from './designer/a20b343a0234/tactics/grenade-prepared.js';

const {release,pin}=GRENADE_THROW;
const end=3.85,windup=1.81,framesPerSecond=24,clips=new Map();
const smooth=(x,a,b)=>MathUtils.smoothstep(x,a,b);

export function grenadeAction(sample,preview,shot,now){
  if(shot){
    const age=Math.max(0,now-shot.at),event=shot.event;
    return {time:MathUtils.lerp(release,end,Math.min(age/630,1)),
      heading:Math.atan2(event.by-event.ay,event.bx-event.ax),weight:1-smooth(age,390,655),released:true};
  }
  if(!preview)return null;
  const age=Math.max(0,now-preview.poseAt);
  return {time:Math.min(windup,age/270),weight:smooth(age,0,155),released:false,
    heading:preview.point?Math.atan2(preview.point.y-sample.y,preview.point.x-sample.x):sample.heading*Math.PI/180};
}

// Sample the frozen, roster-fitted AFT choreography once per body. The adapter
// lets it own a rehearsal prop without replacing the actor's real equipment.
function throwClip(worker,profile,prop,bones){
  if(clips.has(profile.id))return clips.get(profile.id);
  const adapter={...worker,equipWeapon:asset=>worker.root.add(asset.root)};
  const preparedBalance=GRENADE_PREPARED[profile.id]?.balance;
  const motion=createGrenadeThrow(adapter,prop,{animal:profile.id,preparedBalance});
  const frames=[];
  try{
    const times=[...Array.from({length:Math.ceil(end*framesPerSecond)},(_,i)=>i/framesPerSecond),windup,release,end].sort((a,b)=>a-b);
    for(const time of times){
      motion.at(time);
      const arms=[-1,1].map(side=>{
        const shoulder=bones['upperArm'+side].getWorldPosition(V()),hand=bones['hand'+side],elbow=bones['forearm'+side];
        return {wrist:hand.getWorldPosition(V()).sub(shoulder),pole:elbow.getWorldPosition(V()).sub(shoulder),rotation:hand.getWorldQuaternion(Q())};
      });
      const relative=bones.hand1.getWorldQuaternion(Q()).invert().multiply(prop.root.getWorldQuaternion(Q()));
      frames.push({time,arms,relative,bones:worker.bones.map(b=>({position:b.position.clone(),rotation:b.quaternion.clone()}))});
    }
  }finally{motion.dispose();}
  clips.set(profile.id,frames);
  return frames;
}

export function createGrenadePose(worker,profile){
  if(profile.unarmed)return null;
  const root=worker.root,bones=Object.fromEntries(worker.bones.map(b=>[b.name,b]));
  const arms=[firingArm(bones,-1),firingArm(bones,1)];
  const prop=createGrenadeModel(),ring=prop.parts.find(p=>p.name==='pull ring');
  const frames=throwClip(worker,profile,prop,bones);
  root.add(prop.root);prop.root.visible=false;
  function at(time){
    const high=frames.findIndex(f=>f.time>=time),next=frames[Math.max(0,high)],prev=frames[Math.max(0,high-1)];
    return {prev,next,t:next.time===prev.time?0:(time-prev.time)/(next.time-prev.time)};
  }
  function clear(){prop.root.visible=false;}
  return {apply(sample,action){
    const {prev,next,t}=at(action.time),weight=action.weight,prone=sample.pose.prone,low=Math.min(1,sample.pose.kneel+prone);
    const facing=yawRotation(-action.heading);
    const standing=weight*(1-low)*(1-sample.blend);
    root.quaternion.slerp(facing,weight);
    for(const [i,bone] of worker.bones.entries()){
      bone.position.lerp(prev.bones[i].position.clone().lerp(next.bones[i].position,t),standing);
      bone.quaternion.slerp(prev.bones[i].rotation.clone().slerp(next.bones[i].rotation,t),standing);
    }
    const adapt=weight-standing;
    root.updateMatrixWorld(true);
    if(adapt>.00001){
      for(const [i,arm] of arms.entries()){
        const a=prev.arms[i],b=next.arms[i],side=i===0?-1:1;
        const shoulder=arm.upper.getWorldPosition(V()),offset=a.wrist.clone().lerp(b.wrist,t);
        offset.y=offset.y*(1-.52*prone)-.045*prone;
        offset.z+=side*.09*prone;
        const target=shoulder.clone().add(offset.applyQuaternion(facing));
        const hand=arm.hand.getWorldPosition(V());
        const pose=facing.clone().multiply(a.rotation.clone().slerp(b.rotation,t));
        if(side===-1&&prone){
          // The free elbow stays out as a support while the throwing arm
          // sweeps beside the head instead of loading behind the body.
          const brace=V(.20,0,-.10).applyQuaternion(facing).add(shoulder);
          brace.y=.10;target.lerp(brace,prone);
        }
        target.y=Math.max(target.y,.09);
        const pole=a.pole.clone().lerp(b.pole,t).applyQuaternion(facing);
        arm.fit(hand.lerp(target,adapt),arm.hand.getWorldQuaternion(Q()).slerp(pose,adapt),pole,side===1?-.92+.82*smooth(action.time,release-.025,release+.05):-.40,{limit:true});
      }
    }
    const palm=bones.hand1.localToWorld(palmOffset());
    const rotation=bones.hand1.getWorldQuaternion(Q()).multiply(prev.relative.clone().slerp(next.relative,t));
    const origin=palm.sub(prop.anchors.grip.position.clone().applyQuaternion(rotation));
    setWorldPose(prop.root,origin,rotation);
    prop.root.visible=!action.released&&weight>.18;
    ring.visible=action.time<pin;
    // Keep the current weapon equipped while the hands are busy. The tank
    // stays on the back and the lance/long gun returns with the carry pose.
    worker.weapon.root.visible=weight<.16;
    if(worker.weapon.hose)worker.weapon.hose.visible=weight<.16;
    root.updateMatrixWorld(true);worker.skeleton.update();
    return {pose:low>.5?(prone>.5?'AFT low toss':'AFT kneeling throw'):'AFT standing throw',origin};
  },clear,dispose(){prop.root.removeFromParent();prop.dispose();}};
}
