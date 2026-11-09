import * as T from './vendor/three.module.js';
import {dogMotionState} from './dog-motion.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
// Avian locomotion only. The approved hen has wing tips, not firearm grips.
export function createHenMotion(worker){
 worker.pose();const {root,bones}=worker,named=Object.fromEntries(bones.map(b=>[b.name,b])),original=worker.skeleton;
 root.updateMatrixWorld(true);const rest=new Map(bones.map(b=>[b,b.getWorldPosition(V())])),thighs=[];
 for(const side of [-1,1]){const b=new T.Bone();b.name='thigh '+side;named.pelvis.add(b);b.position.copy(named.pelvis.worldToLocal(V(-.02,.62,side*.157)));root.updateMatrixWorld(true);const shank=named['shank '+side];b.attach(shank);thighs.push(b);rest.set(b,b.getWorldPosition(V()));}
 const skeleton=new T.Skeleton([...bones,...thighs]);skeleton.calculateInverses();
 const saved=worker.parts.map(p=>({p,si:p.geometry.attributes.skinIndex.clone(),sw:p.geometry.attributes.skinWeight.clone()}));
 // Keep the hidden tops of the scaly shanks inside the feathered leg cuffs.
 for(const mesh of worker.parts.filter(p=>p.name.includes('toes'))){const p=mesh.geometry.attributes.position,si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight,thigh=bones.length+(mesh.name.endsWith(' -1')?0:1);for(let i=0;i<p.count;i++){const upper=T.MathUtils.smoothstep(p.getY(i),.20,.31),a=si.getX(i),b=si.getY(i),wa=sw.getX(i),wb=sw.getY(i);si.setXYZW(i,a,b,thigh,0);sw.setXYZW(i,wa*(1-upper),wb*(1-upper),upper,0);}}
 const feathered=worker.parts.find(p=>p.name==='feathered body');for(let i=0;i<feathered.geometry.attributes.position.count;i++){const p=feathered.geometry.attributes.position,si=feathered.geometry.attributes.skinIndex,sw=feathered.geometry.attributes.skinWeight,t=(1-T.MathUtils.smoothstep(p.getY(i),.34,.56))*T.MathUtils.smoothstep(Math.abs(p.getZ(i)),.01,.06);if(t>0){const a=si.getX(i),b=si.getY(i),wa=sw.getX(i),wb=sw.getY(i);si.setXYZW(i,a,b,bones.length+(p.getZ(i)<0?0:1),0);sw.setXYZW(i,wa*(1-t),wb*(1-t),t,0);}}
 // Paint-atlas rendering has already uploaded these attributes. Publish the new
 // weights to the GPU as well as the CPU contact/geometry checks.
 for(const p of worker.parts){p.bind(skeleton);p.geometry.attributes.skinIndex.needsUpdate=true;p.geometry.attributes.skinWeight.needsUpdate=true;}
 let state,joints,heading=0;
 function rotation(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));root.updateMatrixWorld(true);}
 function apply(time,options={}){
  heading=options.heading??0;state=options.state??dogMotionState(time);const t=state.time;
  root.position.set(0,0,0);root.rotation.set(0,0,0);worker.pose();for(const b of thighs)b.quaternion.identity();named.pelvis.position.copy(rest.get(named.pelvis));
  named.pelvis.position.y-=.09*state.gait+(options.crouchDrop??.12)*state.kneel+state.bob*.5;named.pelvis.position.z+=.02*state.transfer;
  named.breast.rotation.x=-.045*state.transfer;named.head.rotation.z=.045*Math.sin(t*2*Math.PI)*state.gait;
  // Production low stance: fold the bird's own legs, keeping both soles on the
  // floor through IK. A forward lean replaces the mammal's horizontal pelvis.
  if(options.stance){const {kneel=0,prone=0}=options.stance;named.pelvis.position.y-=.01*prone;named.pelvis.rotation.z=-1.05*prone;named.breast.rotation.z=-.3*kneel+.10*prone;named.head.rotation.z+=.15*kneel+.95*prone;}
  root.updateMatrixWorld(true);joints={};
  for(const [i,side]of [-1,1].entries()){
   const a=thighs[i],b=named['shank '+side],c=named['foot '+side],f=state.feet[side];
   const target=V(f.x+.035-state.distance-.10*(options.stance?.prone||0)+(side===-1?(options.kneelStep??.32)*state.kneel:0),.06+f.lift,side*.157),start=a.getWorldPosition(V()),la=rest.get(a).distanceTo(rest.get(b)),lb=rest.get(b).distanceTo(rest.get(c)),axis=target.clone().sub(start),d=axis.length();
   if(d>la+lb+1e-7||d<Math.abs(la-lb)-1e-7)throw Error('Hen leg target outside reach');
   axis.normalize();const along=(la*la-lb*lb+d*d)/(2*d),pole=options.crouchPole?V(Math.cos(Math.PI*state.kneel),0,side*Math.sin(Math.PI*state.kneel)):V(1,0,0);pole.addScaledVector(axis,-pole.dot(axis)).normalize();const mid=start.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,la*la-along*along)));
   rotation(a,new T.Quaternion().setFromUnitVectors(rest.get(b).clone().sub(rest.get(a)).normalize(),mid.clone().sub(start).normalize()));rotation(b,new T.Quaternion().setFromUnitVectors(rest.get(c).clone().sub(rest.get(b)).normalize(),target.clone().sub(mid).normalize()));rotation(c,new T.Quaternion());
   if(options.stance){const enter=T.MathUtils.smoothstep(Math.max(state.kneel,state.gait),0,.12),neutral=new T.Quaternion();for(const bone of [a,b,c])bone.quaternion.slerp(neutral,1-enter);root.updateMatrixWorld(true);}
   named['wing '+side].rotation.x=-side*(.025*state.kneel+.025*state.gait);named['wing tip '+side].rotation.x=-side*.015*state.gait;
  }
  const yaw=(heading+35)*Math.PI/180;root.rotation.y=-yaw;root.position.set(state.distance*Math.cos(yaw),0,state.distance*Math.sin(yaw));root.updateMatrixWorld(true);skeleton.update();
  for(const [i,side]of [-1,1].entries())joints[side]={hip:thighs[i].getWorldPosition(V()).toArray(),knee:named['shank '+side].getWorldPosition(V()).toArray(),ankle:named['foot '+side].getWorldPosition(V()).toArray()};
  state={...state,aim:0,recoil:0,flash:false,trace:false,phase:t<3?'Walk':t<3.6?'Settle':t<5?'Crouch':t<8?'Observe · unarmed':t<9.6?'Rise':'Standing'};return state;
 }
 const restore=()=>{root.position.set(0,0,0);worker.pose();named.pelvis.position.copy(rest.get(named.pelvis));for(const b of thighs)b.quaternion.identity();root.updateMatrixWorld(true);skeleton.update();};
 return {worker,skeleton,apply,diagnostics:()=>({...state,heading,triangles:worker.diagnostics().triangles,bones:skeleton.bones.length,joints,contacts:[],unarmed:true,limitation:'Wing weapon grips are not authored; no aim or fire test.'}),restore,dispose(){restore();for(const side of [-1,1])named.pelvis.attach(named['shank '+side]);for(const b of thighs)b.removeFromParent();for(const {p,si,sw}of saved){p.geometry.setAttribute('skinIndex',si);p.geometry.setAttribute('skinWeight',sw);p.bind(original);}skeleton.dispose();}};
}
