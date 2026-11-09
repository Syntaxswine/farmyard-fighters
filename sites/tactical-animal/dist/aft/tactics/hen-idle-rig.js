import * as T from './vendor/three.module.js';
import {createHenMotion} from './hen-motion.js';
import {v,q,snapshot,restore,solveLimb} from './idle-rig-math.js';

// Study-only feather grips. Existing feathers, not invisible mammalian hands,
// carry the prop. Preserve the neutral model and its original skeleton on exit.
export function createHenIdleRig(worker,weapon){
 const locomotion=createHenMotion(worker),base=locomotion.skeleton,bones=[...base.bones],named=Object.fromEntries(bones.map(b=>[b.name,b])),root=worker.root;
 const saved=worker.parts.map(p=>({p,si:p.geometry.attributes.skinIndex.clone(),sw:p.geometry.attributes.skinWeight.clone(),pn:p.geometry.attributes.paintNormal.clone(),position:p.geometry.attributes.position.clone(),normal:p.geometry.attributes.normal.clone()})),added=[];
 for(const side of [-1,1]){
  const hand=new T.Bone();hand.name='hand'+side;named['wing tip '+side].add(hand);root.updateMatrixWorld(true);hand.position.copy(named['wing tip '+side].worldToLocal(v([-.111,.60,side*.398])));bones.push(hand);added.push(hand);
  const fingers=new T.Bone();fingers.name='fingers'+side;fingers.position.set(.03,-.07,0);hand.add(fingers);bones.push(fingers);
 }
 const aliases={pelvis:'hips',breast:'spine'};for(const s of [-1,1])for(const [a,b]of [['wing ','upperArm'],['wing tip ','forearm'],['thigh ','thigh'],['shank ','shin'],['foot ','hoof']])aliases[a+s]=b+s;
 const canonical=Object.fromEntries(bones.map(b=>[aliases[b.name]||b.name,b]));root.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones);skeleton.calculateInverses();
 for(const p of worker.parts){const a=p.geometry.attributes;
  // Fold the fan back at its root for the fuel pack, preserving feather size.
  if(weapon.mount&&p.name==='upright tail fan'){const pivot=v([-.20,.78,0]),turn=q().setFromAxisAngle(v([0,0,1]),.78);for(let i=0;i<a.position.count;i++){const p=v().fromBufferAttribute(a.position,i).sub(pivot).applyQuaternion(turn).add(pivot),n=v().fromBufferAttribute(a.normal,i).applyQuaternion(turn);a.position.setXYZ(i,...p.toArray());a.normal.setXYZ(i,...n.toArray());}a.position.needsUpdate=a.normal.needsUpdate=true;}
  if(['continuous apron','apron waist tie','fitted waistcoat'].includes(p.name))for(let i=0;i<a.position.count;i++){const t=T.MathUtils.smoothstep(a.position.getY(i),.80,1.06);a.skinIndex.setXYZW(i,bones.indexOf(named.pelvis),bones.indexOf(named.breast),0,0);a.skinWeight.setXYZW(i,1-t,t,0,0);}
  if(p.name.includes('layered wing')){const side=p.name.endsWith(' -1')?-1:1;
   for(let i=0;i<a.position.count;i++){const y=a.position.getY(i),lower=1-T.MathUtils.smoothstep(y,.79,1.02),cup=1-T.MathUtils.smoothstep(y,.63,.75),curl=(1-T.MathUtils.smoothstep(y,.515,.585))*.9;
    a.skinIndex.setXYZW(i,bones.indexOf(named['wing '+side]),bones.indexOf(named['wing tip '+side]),bones.indexOf(canonical['hand'+side]),bones.indexOf(canonical['fingers'+side]));a.skinWeight.setXYZW(i,1-lower,lower*(1-cup),lower*cup*(1-curl),lower*cup*curl);
    if(a.paintNormal.getZ(i)*side<.5)a.paintNormal.setXYZ(i,0,0,side);
   }a.paintNormal.needsUpdate=true;
  }p.bind(skeleton);a.skinIndex.needsUpdate=a.skinWeight.needsUpdate=true;
 }
 const neutral=snapshot(bones);root.add(weapon.root);if(weapon.mount){named.breast.add(weapon.mount);weapon.mount.position.set(-.25,-.02,0);}if(weapon.hose)root.add(weapon.hose);
 const adapter={...worker,bones,skeleton,idleBones:canonical,weapon,pose(mode='neutral'){
  restore(neutral);root.position.set(0,0,0);root.quaternion.identity();root.updateMatrixWorld(true);weapon.root.visible=mode==='carry'&&weapon.id!=='hands';
  if(mode==='carry'){
   const axis=v(weapon.carry.axis).normalize();weapon.root.position.fromArray(weapon.carry.position);weapon.root.quaternion.setFromUnitVectors(v([1,0,0]),axis);root.updateMatrixWorld(true);
   for(const side of weapon.carry.hands){const name=side===1?'grip':'support',pose=weapon.carry.handPoses?.[name],handQ=pose?.quaternion?weapon.root.quaternion.clone().multiply(q().fromArray(pose.quaternion)):q().setFromUnitVectors(v([0,-1,0]),axis),palm=v(pose?.palm||[.052,-.010,0]);
    solveLimb(canonical['upperArm'+side],canonical['forearm'+side],canonical['hand'+side],weapon.anchors[name].getWorldPosition(v()).sub(palm.applyQuaternion(handQ)),handQ,v([.1,-.8,side*.6]));canonical['fingers'+side].rotation.z=-.9;
   }
  }root.updateMatrixWorld(true);skeleton.update();weapon.updateHose?.(root);
 }};
 let disposed=false;return {worker:adapter,dispose(){if(disposed)return;disposed=true;weapon.root.removeFromParent();weapon.mount?.removeFromParent();weapon.hose?.removeFromParent();for(const {p,si,sw,pn,position,normal}of saved){p.geometry.setAttribute('skinIndex',si);p.geometry.setAttribute('skinWeight',sw);p.geometry.setAttribute('paintNormal',pn);p.geometry.setAttribute('position',position);p.geometry.setAttribute('normal',normal);p.bind(base);}for(const b of added)b.removeFromParent();skeleton.dispose();locomotion.dispose();}};
}
