import * as T from './vendor/three.module.js';
import {createMammalMotion} from './animal-motion.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion(),clamp=T.MathUtils.clamp;
const ease=x=>{x=clamp(x,0,1);return x*x*x*(x*(x*6-15)+10);};
export const PRONE_DURATION=12,PRONE_SHOT_TIME=6.2;
export function proneMotionState(time){
 const t=clamp(time,0,PRONE_DURATION),down=ease((t-1.4)/2.2)*(1-ease((t-8.1)/2.2)),kneel=ease(t/1.4)*(1-ease((t-10.3)/1.4)),aim=ease((t-3.9)/1.2)*(1-ease((t-7.2)/.7));
 const r=t-PRONE_SHOT_TIME,recoil=r<=0||r>=.55?0:r<.025?ease(r/.025):1-ease((r-.025)/.525);
 return {time:t,down,kneel,aim,recoil,flash:r>=0&&r<.05,trace:r>=0&&r<.15,phase:t<1.4?'Kneel':t<3.6?'Lower into prone':t<3.9?'Prone rest':t<6.2?'Prone aim':t<7.2?'Fire / recover':t<8.1?'Lower aim':t<10.3?'Rise to kneel':t<11.7?'Stand':'Standing'};
}

// A separate presentation study. It never reads or changes tactical occupancy,
// hit volumes, AP or turn state. Poses are evaluated from bind space when scrubbed.
export function createProneMotion(worker,profile){
 if(profile.id!=='horse')throw Error('Prone proof currently supports the horse only');
 const base=createMammalMotion(worker,profile),{root,bones,rifle}=worker,skeleton=base.skeleton,named=Object.fromEntries(skeleton.bones.map(b=>[b.name,b]));
 worker.pose('neutral');root.updateMatrixWorld(true);
 const rest=new Map(skeleton.bones.map(b=>[b,b.getWorldPosition(V())])),palm=V(.052,-.010,0),spineRest=rest.get(named.spine);
 // The lower shirt is tucked into the bib. Resting-arm weights pulled that
 // hidden hem out through the overalls when both elbows reached forward.
 const shirt=worker.parts.find(p=>p.name.includes('shirt')),a=shirt.geometry.attributes;
 for(let i=0;i<a.position.count;i++){
  const y=a.position.getY(i),z=Math.abs(a.position.getZ(i)),keep=1-(1-ease((y-1.0)/.12))*(1-ease((z-.20)/.06));
  const upper=a.skinWeight.getZ(i)*keep,lower=a.skinWeight.getW(i)*keep,torso=1-upper-lower,waist=ease((y-.90)/.14);
  a.skinWeight.setXYZW(i,torso*(1-waist),torso*waist,upper,lower);
 }
 a.skinWeight.needsUpdate=true;
 const limbs=[-1,1].map(side=>({side,shoulder:named['upperArm'+side],elbow:named['forearm'+side],hand:named['hand'+side],finger:named['fingers'+side],hip:named['thigh'+side],knee:named['shin'+side],ankle:named['hoof'+side]}));
 let state,heading=0,pitch=0,joints={},shot,shotKey='',contacts=[];
 function rotate(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(Q()).invert().multiply(q));root.updateMatrixWorld(true);}
 function solve(a,b,c,target,pole){
  const start=a.getWorldPosition(V()),ra=rest.get(a),rb=rest.get(b),rc=rest.get(c),la=ra.distanceTo(rb),lb=rb.distanceTo(rc),axis=target.clone().sub(start),d=axis.length();
  if(d>la+lb+1e-6||d<Math.abs(la-lb)+1e-8)throw Error(`Prone target outside ${a.name} reach: ${d.toFixed(4)} / ${(la+lb).toFixed(4)}`);
  axis.normalize();const bend=pole.clone().addScaledVector(axis,-pole.dot(axis));
  if(bend.lengthSq()<1e-8){bend.copy(V(0,0,1)).addScaledVector(axis,-axis.z);if(bend.lengthSq()<1e-8)bend.copy(V(1,0,0)).addScaledVector(axis,-axis.x);}
  bend.normalize();const along=(la*la-lb*lb+d*d)/(2*d),mid=start.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,la*la-along*along)));
  rotate(a,Q().setFromUnitVectors(rb.clone().sub(ra).normalize(),mid.clone().sub(start).normalize()));rotate(b,Q().setFromUnitVectors(rc.clone().sub(rb).normalize(),target.clone().sub(mid).normalize()));
 }
 function raw(time,options={}){
  state=proneMotionState(time);heading=options.heading??0;pitch=clamp(options.pitch??0,-15,20);
  // Preserve the approved kneel at each end, including its stable planted feet.
  base.apply(3.6+state.kneel*1.4,{heading:0,pitch:0});root.position.set(0,0,0);root.rotation.set(0,0,0);root.updateMatrixWorld(true);
  const d=state.down,kneelLegs=new Map(limbs.map(l=>[l.side,{hip:l.hip.getWorldPosition(V()),knee:l.knee.getWorldPosition(V()),ankle:l.ankle.getWorldPosition(V())}]));
  const oldHip=named.hips.position.clone(),oldHipQ=named.hips.quaternion.clone(),oldSpineQ=named.spine.quaternion.clone();
  named.hips.position.copy(oldHip).lerp(V(-.08,.258,0),d);named.hips.quaternion.copy(oldHipQ).slerp(Q().setFromAxisAngle(V(0,0,1),-1.52),d);
  named.spine.quaternion.copy(oldSpineQ).slerp(Q().setFromAxisAngle(V(0,0,1),-.018*state.recoil),d);root.updateMatrixWorld(true);
  const headQ=Q().setFromEuler(new T.Euler(0,(.14+.0000476*pitch-.00035238*pitch*pitch)*state.aim,(-.87+.0286429*pitch+.00004286*pitch*pitch)*state.aim));
  rotate(named.head,named.head.getWorldQuaternion(Q()).slerp(headQ,d));
  for(const l of limbs){
   const footQ=Q().setFromAxisAngle(V(0,0,1),-1.2*d),foot=worker.parts.find(m=>m.name==='exposed hoof '+l.side),points=foot.geometry.attributes.position,ankle=rest.get(l.ankle);let sole=0;
   for(let i=0;i<points.count;i++)sole=Math.min(sole,V().fromBufferAttribute(points,i).sub(ankle).applyQuaternion(footQ).y);
   // Keep the supporting knee down while the legs unfold; simply interpolating
   // ankles would lift both knees and leave the descent supported by toe tips.
   const start=l.hip.getWorldPosition(V()),old=kneelLegs.get(l.side),la=rest.get(l.hip).distanceTo(rest.get(l.knee)),lb=rest.get(l.knee).distanceTo(rest.get(l.ankle));
   const turn=(from,to)=>from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*d;
   const kneeY=T.MathUtils.lerp(old.knee.y,.12,d),dy=kneeY-start.y;
   if(Math.abs(dy)>la)throw Error('Prone knee cannot reach its support plane');
   const a=turn(Math.atan2(old.knee.z-old.hip.z,old.knee.x-old.hip.x),Math.atan2(l.side*.6,-1)),r=Math.sqrt(Math.max(0,la*la-dy*dy)),knee=V(start.x+Math.cos(a)*r,kneeY,start.z+Math.sin(a)*r);
   const ankleY=Math.max(T.MathUtils.lerp(old.ankle.y,-sole,d),-sole)+.001*d,sy=ankleY-kneeY;
   if(Math.abs(sy)>lb)throw Error('Prone ankle cannot reach its support plane');
   const b=turn(Math.atan2(old.ankle.z-old.knee.z,old.ankle.x-old.knee.x),Math.atan2(l.side*.25,-1)),sr=Math.sqrt(Math.max(0,lb*lb-sy*sy)),target=V(knee.x+Math.cos(b)*sr,ankleY,knee.z+Math.sin(b)*sr);
   rotate(l.hip,Q().setFromUnitVectors(rest.get(l.knee).clone().sub(rest.get(l.hip)).normalize(),knee.clone().sub(start).normalize()));
   rotate(l.knee,Q().setFromUnitVectors(rest.get(l.ankle).clone().sub(rest.get(l.knee)).normalize(),target.clone().sub(knee).normalize()));rotate(l.ankle,footQ);
  }
  const spineQ=named.spine.getWorldQuaternion(Q()),spineOrigin=named.spine.getWorldPosition(V()),carryQ=Q().setFromUnitVectors(V(1,0,0),V(.20,.38,-.90).normalize());
  const carryPosition=V(.24,1.005,.035).sub(spineRest).applyQuaternion(spineQ).add(spineOrigin),yaw=-35*Math.PI/180,angle=(pitch*state.aim+5*(1-state.aim)*d)*Math.PI/180;
  const axis=V(Math.cos(yaw)*Math.cos(angle),Math.sin(angle),Math.sin(yaw)*Math.cos(angle)),aimQ=Q().setFromUnitVectors(V(1,0,0),axis);
  const stock=named.upperArm1.getWorldPosition(V()).add(V(-.045,.070,-.035).lerp(V(.025,.03,.065),d).applyQuaternion(spineQ));
  const ready=1-(1-state.aim)*(1-d),aimPosition=stock.clone().sub(rifle.anchors.stock.position.clone().applyQuaternion(aimQ));
  rifle.root.quaternion.copy(spineQ.clone().multiply(carryQ)).slerp(aimQ,ready);rifle.root.position.copy(carryPosition).lerp(aimPosition,ready).addScaledVector(axis,-.038*state.recoil);rifle.root.visible=true;root.updateMatrixWorld(true);
  contacts=[];const gunAxis=V(1,0,0).applyQuaternion(rifle.root.quaternion),handQ=Q().setFromUnitVectors(V(0,-1,0),gunAxis);
  for(const l of limbs){const name=l.side===1?'grip':'support',target=rifle.anchors[name].getWorldPosition(V()),wrist=target.clone().sub(palm.clone().applyQuaternion(handQ));solve(l.shoulder,l.elbow,l.hand,wrist,V(-.12,-1,l.side*.55));rotate(l.hand,handQ);l.finger.rotation.z=-.9;contacts.push({side:l.side,name});}
  root.rotation.y=-(heading+35)*Math.PI/180;root.updateMatrixWorld(true);skeleton.update();joints={};
  for(const l of limbs)joints[l.side]=Object.fromEntries(['shoulder','elbow','hand','hip','knee','ankle'].map(k=>[k,l[k].getWorldPosition(V()).toArray()]));
 }
 function muzzle(){return {origin:rifle.anchors.muzzle.getWorldPosition(V()),direction:V(1,0,0).transformDirection(rifle.barrel.matrixWorld)};}
 function apply(time,options={}){const key=JSON.stringify([options.heading??0,options.pitch??0]);if(key!==shotKey){raw(PRONE_SHOT_TIME,options);const m=muzzle();shot={origin:m.origin.toArray(),direction:m.direction.toArray()};shotKey=key;}raw(time,options);return state;}
 function diagnostics(){const m=muzzle();return {...state,heading,pitch,bones:skeleton.bones.length,joints,shot,muzzle:{origin:m.origin.toArray(),direction:m.direction.toArray()},stock:rifle.anchors.stock.getWorldPosition(V()).toArray(),contacts:contacts.map(c=>{const a=named['hand'+c.side].localToWorld(palm.clone()),b=rifle.anchors[c.name].getWorldPosition(V());return {...c,palm:a.toArray(),grip:b.toArray(),error:a.distanceTo(b)};})};}
 return {worker,skeleton,apply,diagnostics,restore:()=>base.restore(),dispose:()=>base.dispose()};
}
