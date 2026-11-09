import * as T from './vendor/three.module.js';
import {preserveClothingHeadWeights} from './clothing-weights.js';
import {dogMotionState,DOG_SHOT_TIME,createDogMotion} from './dog-motion.js';
const clamp=T.MathUtils.clamp,V=(x,y,z)=>new T.Vector3(x,y,z),ease=x=>{x=clamp(x,0,1);return x*x*x*(x*(x*6-15)+10);};
// Drives the approved skinned surfaces. Every pose is evaluated from bind space;
// no accumulated frame state, marker-only limbs or scaled bones.
export function createMammalMotion(worker,profile){
 if(profile.id==='dog')return createDogMotion(worker);
 worker.pose('neutral');
 const root=worker.root, originalSkeleton=worker.skeleton, bones=worker.bones;
 const named=Object.fromEntries(bones.map(b=>[b.name,b]));
 root.updateMatrixWorld(true);
 const rest=new Map(bones.map(b=>[b,b.getWorldPosition(V())]));
 const allBones=[...bones],tailBones=[],tail=worker.parts.find(p=>p.name.includes('tail'));
 const saved=worker.parts.map(m=>({m,indices:m.geometry.attributes.skinIndex.clone(),weights:m.geometry.attributes.skinWeight.clone()}));
 const hipRest=rest.get(named.hips),kneeRest=rest.get(named['shin1']),ankleRest=rest.get(named['hoof1']);
 if(profile.longTail&&tail){
  const p=tail.geometry.attributes.position,box=new T.Box3().setFromBufferAttribute(p),top=box.max.y-.04,bottom=box.min.y+.04,span=(top-bottom)/2;
  for(let i=0;i<3;i++){const b=new T.Bone();b.name='tail'+i;const parent=i?tailBones[i-1]:named.hips;parent.add(b);b.position.copy(parent.worldToLocal(V(box.max.x-.025-(box.max.x-box.min.x)*i*.35,top-i*span,0)));root.updateMatrixWorld(true);tailBones.push(b);allBones.push(b);}
  for(let i=0;i<p.count;i++){const u=clamp((top-p.getY(i))/span,0,2),a=Math.min(1,Math.floor(u));tail.geometry.attributes.skinIndex.setXYZW(i,bones.length+a,bones.length+a+1,0,0);tail.geometry.attributes.skinWeight.setXYZW(i,1-(u-a),u-a,0,0);}
 }
 const skeleton=new T.Skeleton(allBones);skeleton.calculateInverses();
 // Keep each author's sleeve assignment; add pelvis support only to torso cloth.
 for(const mesh of worker.parts.filter(p=>/shirt|waistcoat/.test(p.name))){const p=mesh.geometry.attributes.position,si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight;
  for(let i=0;i<p.count;i++){let upper=0,lower=0;const side=p.getZ(i)<0?-1:1,sh=bones.indexOf(named['upperArm'+side]),el=bones.indexOf(named['forearm'+side]);for(let k=0;k<4;k++){if(si.getComponent(i,k)===sh)upper+=sw.getComponent(i,k);if(si.getComponent(i,k)===el)lower+=sw.getComponent(i,k);}const torso=1-upper-lower,waist=ease((p.getY(i)-(hipRest.y+.08))/.16);si.setXYZW(i,0,1,sh,el);sw.setXYZW(i,torso*(1-waist),torso*waist,upper,lower);}
 }
 // Hooves, shoes and paws retain rigid soles while their upper cuffs articulate.
 for(const side of [-1,1]){const foot=worker.parts.find(p=>/hoof|boot|foot/.test(p.name)&&p.name.endsWith(' '+side)),shin=bones.indexOf(named['shin'+side]),ankle=bones.indexOf(named['hoof'+side]);for(let i=0;i<foot.geometry.attributes.position.count;i++){const w=ease((foot.geometry.attributes.position.getY(i)-.10)/.10);foot.geometry.attributes.skinIndex.setXYZW(i,ankle,shin,0,0);foot.geometry.attributes.skinWeight.setXYZW(i,1-w,w,0,0);}}
 const trousers=worker.parts.find(p=>/trousers|overalls/.test(p.name));for(let i=0;i<trousers.geometry.attributes.position.count;i++){
  const p=trousers.geometry.attributes.position,y=p.getY(i),z=p.getZ(i),side=z<0?-1:1;
  const center=ease((Math.abs(z)-.03)/.12),leg=(1-ease((y-(hipRest.y-.11))/.14))*(1-(1-center)*ease((y-(kneeRest.y+.045))/.12)),knee=1-ease((y-(kneeRest.y-.055))/.11),waist=ease((y-(hipRest.y+.10))/.14);
  trousers.geometry.attributes.skinIndex.setXYZW(i,0,bones.indexOf(named['thigh'+side]),bones.indexOf(named['shin'+side]),1);trousers.geometry.attributes.skinWeight.setXYZW(i,(1-leg)*(1-waist),leg*(1-knee),leg*knee,(1-leg)*waist);
 }
 preserveClothingHeadWeights(saved,bones.indexOf(named.head));
 for(const m of worker.parts){m.bind(skeleton);m.geometry.attributes.skinIndex.needsUpdate=m.geometry.attributes.skinWeight.needsUpdate=true;}
 const limbs=[-1,1].map(side=>({side,shoulder:named['upperArm'+side],elbow:named['forearm'+side],hand:named['hand'+side],finger:named['fingers'+side],hip:named['thigh'+side],knee:named['shin'+side],ankle:named['hoof'+side]}));
 const palm=V(.052,-.010,0),rifle=worker.rifle,carryAxis=new T.Vector3(...(worker.rifle.carry?.axis||[.20,.38,-.90])).normalize(),carryQ=new T.Quaternion().setFromUnitVectors(V(1,0,0),carryAxis);
 const triangles=worker.diagnostics().triangles;
 let state,heading=0,pitch=0,contacts=[],joints={},shot=null,shotKey='';
 function rotation(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));root.updateMatrixWorld(true);}
 function limb(a,b,c,target,pole){
  const start=a.getWorldPosition(V()),ra=rest.get(a),rb=rest.get(b),rc=rest.get(c),la=ra.distanceTo(rb),lb=rb.distanceTo(rc),axis=target.clone().sub(start),d=axis.length();
  if(d>la+lb+1e-7||d<Math.abs(la-lb)-1e-7)throw Error(`Unreachable ${a.name}: ${d} / ${la+lb}`);
  axis.normalize();const along=(la*la-lb*lb+d*d)/(2*d),bend=pole.clone().addScaledVector(axis,-pole.dot(axis)).normalize();
  const mid=start.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,la*la-along*along)));
  rotation(a,new T.Quaternion().setFromUnitVectors(rb.clone().sub(ra).normalize(),mid.clone().sub(start).normalize()));
  rotation(b,new T.Quaternion().setFromUnitVectors(rc.clone().sub(rb).normalize(),target.clone().sub(mid).normalize()));
 }
 function raw(time,options={}){
  state=dogMotionState(time);heading=options.heading??0;pitch=clamp(options.pitch??0,-15,20);
  root.position.set(0,0,0);root.rotation.set(0,0,0);worker.pose('neutral');for(const b of tailBones)b.quaternion.identity();
  const walkCrouch=.065*ease(state.time/.25)*(1-ease((state.time-3)/.6));
  named.hips.position.add(V(-.10*state.kneel,-(profile.kneelDrop??(hipRest.y*.46875))*state.kneel-state.bob-walkCrouch,.032*state.transfer));
  named.hips.rotation.x=.025*state.transfer;
  named.hips.rotation.y=-.045*state.transfer;
  named.spine.rotation.z=-.07*state.kneel-.020*state.recoil;
  named.spine.rotation.x=.16*state.aim-.065*state.transfer;
  named.spine.rotation.y=.10*state.transfer;
  named.head.rotation.z=(pitch*Math.PI/180*(profile.headPitchSlope??1.5)+(profile.headPitch??-.9))*state.aim;
  named.head.rotation.y=((profile.headYaw??25)+.4*pitch)*Math.PI/180*state.aim;
  if(tailBones.length){tailBones[0].rotation.z=-.95*state.kneel;tailBones[0].rotation.x=.075*Math.sin(state.time*4)*Math.sin(Math.PI*clamp(state.time/3,0,1));tailBones[1].rotation.z=.12*state.kneel;tailBones[2].rotation.z=.08*state.kneel;}
  root.updateMatrixWorld(true);
  for(const l of limbs){const f=state.feet[l.side],target=V(f.x-state.distance,ankleRest.y+f.lift,l.side*Math.abs(ankleRest.z));limb(l.hip,l.knee,l.ankle,target,V(1,0,0));rotation(l.ankle,new T.Quaternion());}
  const spineQ=named.spine.getWorldQuaternion(new T.Quaternion()),spineOrigin=named.spine.getWorldPosition(V());
  const carryPosition=new T.Vector3(...(rifle.carry?.position||[.24,1.005,.035])).sub(rest.get(named.spine)).applyQuaternion(spineQ).add(spineOrigin);
  const yaw=-(profile.bodyYaw??35)*Math.PI/180,angle=pitch*Math.PI/180;
  const axis=V(Math.cos(yaw)*Math.cos(angle),Math.sin(angle),Math.sin(yaw)*Math.cos(angle));
  const aimQ=new T.Quaternion().setFromUnitVectors(V(1,0,0),axis);
  const stock=named['upperArm1'].getWorldPosition(V()).add(new T.Vector3(...(profile.stockOffset||[-.045,.070,-.035])).applyQuaternion(spineQ));
  const aimPosition=stock.clone().sub(rifle.anchors.stock.position.clone().applyQuaternion(aimQ));
  rifle.root.quaternion.copy(spineQ.clone().multiply(carryQ)).slerp(aimQ,state.aim);
  rifle.root.position.copy(carryPosition).lerp(aimPosition,state.aim).addScaledVector(axis,-.038*state.recoil);
  rifle.root.visible=true;root.updateMatrixWorld(true);contacts=[];
  const gunAxis=V(1,0,0).applyQuaternion(rifle.root.quaternion),handQ=new T.Quaternion().setFromUnitVectors(V(0,-1,0),gunAxis);
  for(const l of limbs){const name=l.side===1?'grip':'support',target=rifle.anchors[name].getWorldPosition(V()),wrist=target.clone().sub(palm.clone().applyQuaternion(handQ));limb(l.shoulder,l.elbow,l.hand,wrist,new T.Vector3(...(rifle.carry?.handPoses?.[name]?.elbowPole||[-.12,-1,l.side*.55])));rotation(l.hand,handQ);l.finger.rotation.z=-.9;contacts.push({side:l.side,name});}
  // Body stands obliquely to the aim line; +heading turns the actual bore toward +Z.
  root.rotation.y=-(heading+(profile.bodyYaw??35))*Math.PI/180;root.position.set(state.distance*Math.cos((heading+(profile.bodyYaw??35))*Math.PI/180),0,state.distance*Math.sin((heading+(profile.bodyYaw??35))*Math.PI/180));
  root.updateMatrixWorld(true);skeleton.update();
  joints={};for(const l of limbs)joints[l.side]=Object.fromEntries(['shoulder','elbow','hand','hip','knee','ankle'].map(k=>[k,l[k].getWorldPosition(V()).toArray()]));
 }
 function muzzle(){return {origin:rifle.anchors.muzzle.getWorldPosition(V()),direction:V(1,0,0).transformDirection(rifle.barrel.matrixWorld)};}
 function apply(time,options={}){const key=JSON.stringify([options.heading??0,options.pitch??0]);if(key!==shotKey){raw(DOG_SHOT_TIME,options);const m=muzzle();shot={origin:m.origin.toArray(),direction:m.direction.toArray()};shotKey=key;}raw(time,options);return state;}
 function diagnostics(){
  const m=muzzle();return {...state,heading,pitch,bones:allBones.length,triangles,joints,shot,muzzle:{origin:m.origin.toArray(),direction:m.direction.toArray()},
   stock:rifle.anchors.stock.getWorldPosition(V()).toArray(),contacts:contacts.map(c=>{const b=named['hand'+c.side],p=b.localToWorld(palm.clone()),grip=rifle.anchors[c.name].getWorldPosition(V());return {...c,palm:p.toArray(),grip:grip.toArray(),error:p.distanceTo(grip)};})};
 }
 return {worker,skeleton,apply,diagnostics,restore(){root.position.set(0,0,0);worker.pose('neutral');for(const b of tailBones)b.quaternion.identity();root.updateMatrixWorld(true);skeleton.update();},dispose(){for(const s of saved){s.m.geometry.setAttribute('skinIndex',s.indices);s.m.geometry.setAttribute('skinWeight',s.weights);s.m.bind(originalSkeleton);}for(const b of tailBones)b.removeFromParent();skeleton.dispose();}};
}
