import * as T from './vendor/three.module.js';
import {idleState,IDLE_LOADS,IDLE_MOODS} from './armed-idle-state.js';
import {v,q,snapshot,restore,solveLimb} from './idle-rig-math.js';
import {createHenIdleRig} from './hen-idle-rig.js';
import {fitIdlePack} from './idle-pack-fit.js';
import {BODY_MASS} from './character-mass.js';

export const IDLE_BODY_MASS=BODY_MASS;
export function fitIdleCarry(worker,profile,weapon){
 const c=weapon.carry||{position:[.24,1.005,.035],axis:[.20,.38,-.90],hands:[1,-1]},id=weapon.id,pig=profile.id.startsWith('pig-'),bird=profile.id==='hen',long=['rifle','assault','smg','shotgun','sniper','launcher','flamethrower'].includes(id);
 const carry={...c,position:[...c.position],axis:[...c.axis],hands:[...c.hands],handPoses:{...c.handPoses}};
 if(long){carry.axis=[.14,-.16,-.977];if(pig){carry.position=[profile.id==='pig-director'?.38:.40,profile.id==='pig-director'?1.14:1.08,.035];carry.handPoses={grip:{elbowPole:[.65,-1,.8]},support:{elbowPole:[.65,-1,-.8]}};}else if(bird)carry.position=[.34,1.01,.035];}
 if(id==='rpg'){carry.position=[pig?.37:bird?.34:.28,pig?1.10:1.04,.035];carry.axis=[.1,.42,-.90];}
 if(id==='pistol'){carry.position=[pig?.36:bird?.34:.27,pig?1.04:.94,.25];carry.axis=[.65,-.75,-.1];}
 if(id==='knife'&&pig)carry.position=[.35,.92,.29];
 if(id==='grenade'){carry.position=[pig?.37:bird?.34:.24,pig?1.16:1.04,.24];carry.axis=[.65,.1,-.7];}
 if(id==='hmg'&&bird)carry.position=[.35,.92,.055];
 if(id==='hmg'&&pig){carry.position=profile.id==='pig-director'?[.42,1.18,.04]:[.40,1.02,.08];carry.axis=[profile.id==='pig-director'?-.30:-.10,0,-1];carry.handPoses={...carry.handPoses,grip:{elbowPole:[.65,-1,.8]},support:{...carry.handPoses.support,elbowPole:[.65,-1,-.8]}};}
 if(bird&&id==='hmg')carry.handPoses={support:{quaternion:q().setFromUnitVectors(v([1,0,0]),v(carry.axis).normalize()).invert().toArray(),palm:[0,-.065,0]}};
 const fitted={
  'pig-director':{assault:[.45,1.16,.035],smg:[.42,1.22,.035],pistol:[.42,1.16,.35],launcher:[.42,1.16,.035],flamethrower:[.42,1.16,.035],rpg:[.38,1.18,0]},
  'pig-foreman':{assault:[.43,1.16,.035],smg:[.43,1.16,.035],pistol:[.40,1.08,.29]},
  sheep:{smg:[.37,1.04,.035]},hen:{smg:[.37,1.04,.035]},
 }[profile.id]?.[id];if(fitted)carry.position=fitted;
 if(profile.id==='pig-director'&&id==='rpg')carry.axis=[-.5,.2,-1];
 if(id==='rifle'&&!bird&&!pig){
  // Lower the butt behind the forearm, with the elbow relaxed near the ribs.
  // The turned palm keeps its grip on the stock neck without lifting the arm.
  carry.position=[.24,profile.id==='sheep'?.965:.97,.035];carry.axis=[.55,.35,-.977];
  const axis=v(carry.axis).normalize(),gunQ=q().setFromUnitVectors(v([1,0,0]),axis);
  const handQ=q().setFromUnitVectors(v([0,-1,0]),axis).multiply(q().setFromAxisAngle(v([0,1,0]),Math.PI*1.20));
  carry.handPoses={...carry.handPoses,grip:{...carry.handPoses.grip,elbowPole:[1,-.4,.8],quaternion:gunQ.invert().multiply(handQ).toArray()}};
 }
 weapon.carry=carry;return carry;
}

export function createArmedIdle(original,profile,{mood='guard',phase=0,weapon=original.weapon,carryFit=null}={}){
 if(!IDLE_MOODS[mood])throw Error('Unknown idle mood');
 const originalCarry=weapon.carry,originalId=weapon.id;weapon.id||='rifle';
 const savedMount=weapon.mount&&{p:weapon.mount.position.clone(),q:weapon.mount.quaternion.clone()};
 const equipmentState=[weapon.root,weapon.mount,weapon.hose].filter(Boolean).map(o=>({o,parent:o.parent,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone(),visible:o.visible}));
 const root=original.root,rig=profile.unarmed?createHenIdleRig(original,weapon):null,worker=rig?.worker||original;
 const originalPose=snapshot(worker.bones),named=worker.idleBones||Object.fromEntries(worker.bones.map(b=>[b.name,b])),foot=side=>worker.parts.find(p=>/hoof|boot|foot|toes/.test(p.name)&&p.name.endsWith(' '+side));
 const savedFeet=[-1,1].map(side=>{const p=foot(side);return {p,si:p.geometry.attributes.skinIndex.clone(),sw:p.geometry.attributes.skinWeight.clone()};});
 let disposed=false,state,base,contacts=[],restorePack=()=>{};
 try{
  fitIdleCarry(worker,profile,weapon);if(carryFit)weapon.carry={...weapon.carry,...carryFit};worker.pose('carry');root.updateMatrixWorld(true);
  // Keep load-bearing sole vertices rigid. Upper cuffs still blend into shins.
  for(const side of [-1,1]){const a=foot(side).geometry.attributes;for(let i=0;i<a.position.count;i++){
   const t=T.MathUtils.smoothstep(a.position.getY(i),.10,.20);a.skinIndex.setXYZW(i,worker.bones.indexOf(named['hoof'+side]),worker.bones.indexOf(named['shin'+side]),0,0);a.skinWeight.setXYZW(i,1-t,t,0,0);
  }a.skinIndex.needsUpdate=a.skinWeight.needsUpdate=true;}
  if(weapon.mount){const spine=named.spine.getWorldPosition(v());let back=Infinity;
   for(const p of worker.parts.filter(p=>/shirt|waistcoat|feathered body/.test(p.name))){const a=p.geometry.attributes.position;for(let i=0;i<a.count;i++)if(Math.abs(a.getY(i)-spine.y)<.20&&Math.abs(a.getZ(i))<.20)back=Math.min(back,a.getX(i));}
   if(Number.isFinite(back))weapon.mount.position.x=Math.min(weapon.mount.position.x,back-spine.x-.018);
   if(profile.id==='skunk')weapon.mount.position.z=-.25;
   if(profile.id==='hen')weapon.mount.position.y+=.03;
  }
  restorePack=fitIdlePack(worker,named,weapon,profile);
  root.updateMatrixWorld(true);base=snapshot(worker.bones);const chestRest=named.spine.matrixWorld.clone(),gunRelative=chestRest.clone().invert().multiply(weapon.root.matrixWorld),feet={};
  for(const side of [-1,1]){const bone=named['hoof'+side],p=foot(side),a=p.geometry.attributes.position,points=[];for(let i=0;i<a.count;i++)if(a.getY(i)<.10)points.push(p.applyBoneTransform(i,v().fromBufferAttribute(a,i)).applyMatrix4(p.matrixWorld));
   const low=Math.min(...points.map(p=>p.y)),position=bone.getWorldPosition(v());position.y-=low;feet[side]={p:position,q:bone.getWorldQuaternion(q()),sole:points.map(p=>p.add(v([0,-low,0])))};
  }
  const centre=new T.Box3().setFromPoints([...feet[-1].sole,...feet[1].sole]).getCenter(v());
  const hands=weapon.carry.hands.map(side=>{const b=named['hand'+side],name=side===1?'grip':'support',point=weapon.anchors[name].getWorldPosition(v());return {side,name,palm:b.worldToLocal(point.clone()),rotation:weapon.root.getWorldQuaternion(q()).invert().multiply(b.getWorldQuaternion(q()))};});
  const bodyParts=[['hips','spine',.281],['spine','head',.216],['head','head',.081],...[-1,1].flatMap(s=>[['upperArm'+s,'forearm'+s,.028],['forearm'+s,'hand'+s,.022],['thigh'+s,'shin'+s,.10],['shin'+s,'hoof'+s,.0465],['hoof'+s,'hoof'+s,.0145]])];
  const totalFraction=bodyParts.reduce((s,p)=>s+p[2],0),bodyMass=IDLE_BODY_MASS[profile.id],loads=IDLE_LOADS[weapon.id];
  const shapeCenter=object=>{root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(object);return box.isEmpty()?v():object.worldToLocal(box.getCenter(v()));};
  const gunCenter=shapeCenter(weapon.root),packCenter=weapon.mount&&shapeCenter(weapon.mount);
  function centreOfMass(){const c=v();for(const [a,b,m]of bodyParts){const p=named[a].getWorldPosition(v()).add(named[b].getWorldPosition(v())).multiplyScalar(.5);if(a==='head')p.add(v([.03,.12,0]).applyQuaternion(named.head.getWorldQuaternion(q())));c.addScaledVector(p,m/totalFraction*bodyMass);}
   c.addScaledVector(weapon.root.localToWorld(gunCenter.clone()),loads[0]);if(weapon.mount)c.addScaledVector(weapon.mount.localToWorld(packCenter.clone()),loads[1]);return c.divideScalar(bodyMass+loads[0]+loads[1]);}
  function raw(s,offset){
   restore(base);root.position.set(0,0,0);root.quaternion.identity();const hips=base.find(r=>r.b===named.hips);
   const restDrop=.010+(loads[0]+loads[1]>8?.012:0)+(profile.unarmed?.006:0);
   named.hips.position.copy(hips.p).add(v([offset.x,-restDrop-s.drop,offset.z]));named.hips.rotation.x=-s.shift*.45;
   named.spine.rotation.y+=s.chestYaw;named.spine.rotation.x+=s.shift*.65;named.spine.rotation.z-=s.breathe+s.adjust*.008;
   named.head.rotation.y+=s.headYaw-s.chestYaw*.7;named.head.rotation.z+=s.headPitch;root.updateMatrixWorld(true);
   for(const side of [-1,1])solveLimb(named['thigh'+side],named['shin'+side],named['hoof'+side],feet[side].p,feet[side].q);
   const matrix=named.spine.matrixWorld.clone().multiply(gunRelative);matrix.decompose(weapon.root.position,weapon.root.quaternion,weapon.root.scale);weapon.root.position.y+=s.lift;root.updateMatrixWorld(true);
   for(const h of hands){const rotation=weapon.root.getWorldQuaternion(q()).multiply(h.rotation),target=weapon.anchors[h.name].getWorldPosition(v()).sub(h.palm.clone().applyQuaternion(rotation));solveLimb(named['upperArm'+h.side],named['forearm'+h.side],named['hand'+h.side],target,rotation);}
   root.updateMatrixWorld(true);worker.skeleton.update();
  }
  function at(time,options={}){if(disposed)throw Error('Idle motion disposed');const s=idleState(time,{mood:options.mood||mood,weapon:weapon.id,animal:profile.id,phase:options.phase??phase}),offset=v();
   for(let i=0;i<4;i++){raw(s,offset);const c=centreOfMass();offset.x+=centre.x-c.x;offset.z+=centre.z+s.shift-c.z;}
   raw(s,offset);weapon.updateHose?.(root);root.getObjectByName('fitted glove cuff')?.update?.();
   contacts=hands.map(h=>{const palm=named['hand'+h.side].localToWorld(h.palm.clone()),grip=weapon.anchors[h.name].getWorldPosition(v());return {side:h.side,name:h.name,palm:palm.toArray(),grip:grip.toArray(),error:palm.distanceTo(grip)};});
   state={...s,animal:profile.id,contacts,com:centreOfMass().toArray(),equipmentMass:loads[0]+loads[1],feet:Object.fromEntries([-1,1].map(side=>[side,named['hoof'+side].getWorldPosition(v()).toArray()])),experimentalWingGrip:!!rig};return state;
  }
  at(0);return {worker,weapon,bones:named,at,duration:IDLE_MOODS[mood].duration,footMesh:foot,centreOfMass,diagnostics:()=>state,dispose};
 }catch(e){dispose();throw e;}
 function dispose(){if(disposed)return;disposed=true;restorePack();for(const {p,si,sw}of savedFeet){p.geometry.setAttribute('skinIndex',si);p.geometry.setAttribute('skinWeight',sw);}weapon.carry=originalCarry;weapon.id=originalId;rig?.dispose();original.pose('neutral');restore(originalPose);for(const s of equipmentState){s.o.removeFromParent();s.parent?.add(s.o);s.o.position.copy(s.p);s.o.quaternion.copy(s.q);s.o.scale.copy(s.s);s.o.visible=s.visible;}root.updateMatrixWorld(true);original.skeleton.update();}
}
