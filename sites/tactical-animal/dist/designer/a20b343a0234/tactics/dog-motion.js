import * as T from './vendor/three.module.js';
import {preserveClothingHeadWeights} from './clothing-weights.js';
export const DOG_MOTION_DURATION=11, DOG_SHOT_TIME=6.6;
const clamp=T.MathUtils.clamp, V=(x,y,z)=>new T.Vector3(x,y,z);
const ease=x=>{x=clamp(x,0,1);return x*x*x*(x*(x*6-15)+10);};
export function dogMotionState(time){
 const t=clamp(time,0,DOG_MOTION_DURATION),walk=ease(t/3),distance=1.0*walk;
 const kneel=ease((t-3.6)/1.4)*(1-ease((t-8)/1.6));
 const aim=ease((t-5)/1.1)*(1-ease((t-7.6)/1.5));
 // Impulse begins at discharge: a 25ms kick inside the flash, then 525ms to settle.
 const r=t-DOG_SHOT_TIME,recoil=r<=0||r>=.55?0:r<.025?ease(r/.025):1-ease((r-.025)/.525);
 // The pelvis moves toward the planted paw; shoulders counter-turn over it.
 // Fade the six-step rhythm in/out so settling does not snap to a neutral pose.
 const gait=ease(t/.35)*(1-ease((t-2.65)/.55)),transfer=Math.sin(t*Math.PI*2)*gait;
 const feet={};
 for(const side of [-1,1]){
  let x=-.035,lift=0,planted=true;
  for(let j=0;j<6;j++)if((j%2===0?-1:1)===side){
   const u=clamp((t-j*.5-.065)/.37,0,1),end=-.035+Math.min(1.0,1.0*ease((j*.5+.435)/3)+.08);
   if(t>=j*.5+.065){x+=(end-x)*ease(u);lift=.067*Math.sin(Math.PI*u)**2;planted=u===0||u===1;}
  }
  if(t>=3.6&&side===-1){x-=.42*kneel;const q=t<5?clamp((t-3.6)/1.4,0,1):t>=8?clamp((t-8)/1.6,0,1):1;lift=.07*Math.sin(Math.PI*q)**2;planted=q===0||q===1;}
  feet[side]={x,lift,planted};
 }
 return {time:t,distance,kneel,aim,recoil,feet,transfer,gait,bob:.014*Math.sin(t*Math.PI*2)**2*gait,
  phase:t<3?'Walk':t<3.6?'Settle':t<5?'Kneel':t<6.6?'Aim':t<7.4?'Fire / recover':t<8?'Lower rifle':t<9.6?'Stand':'Standing',
  flash:t>=DOG_SHOT_TIME&&t<DOG_SHOT_TIME+.05,trace:t>=DOG_SHOT_TIME&&t<DOG_SHOT_TIME+.15};
}

// Drives the approved skinned surfaces. Every pose is evaluated from bind space;
// no accumulated frame state, marker-only limbs or scaled bones.
export function createDogMotion(worker){
 worker.pose('neutral');
 const root=worker.root, originalSkeleton=worker.skeleton, bones=worker.bones;
 const named=Object.fromEntries(bones.map(b=>[b.name,b]));
 root.updateMatrixWorld(true);
 const rest=new Map(bones.map(b=>[b,b.getWorldPosition(V())]));
 const allBones=[...bones],tailBones=[];
 for(const [i,p] of [[0,[-.20,.86,0]],[1,[-.35,.66,.02]],[2,[-.37,.46,.035]]]){
  const b=new T.Bone();b.name='tail'+i;const parent=i?tailBones[i-1]:named.hips;
  parent.add(b);b.position.copy(parent.worldToLocal(new T.Vector3(...p)));root.updateMatrixWorld(true);tailBones.push(b);allBones.push(b);
 }
 const skeleton=new T.Skeleton(allBones);skeleton.calculateInverses();
 const saved=worker.parts.map(m=>({m,indices:m.geometry.attributes.skinIndex.clone(),weights:m.geometry.attributes.skinWeight.clone()}));
 const tail=worker.parts.find(p=>p.name==='dog tail');
 for(let i=0;i<tail.geometry.attributes.position.count;i++){
  const u=clamp((.86-tail.geometry.attributes.position.getY(i))/.20,0,2),a=Math.min(1,Math.floor(u));
  tail.geometry.attributes.skinIndex.setXYZW(i,bones.length+a,bones.length+a+1,0,0);
  tail.geometry.attributes.skinWeight.setXYZW(i,1-(u-a),u-a,0,0);
 }
 // The lower jacket follows the belt/pelvis through a deep knee bend.
 const jacket=worker.parts[0];
 for(let i=0;i<jacket.geometry.attributes.position.count;i++){
  const p=jacket.geometry.attributes.position,y=p.getY(i);
  const z=p.getZ(i),sleeve=ease((Math.abs(z)-.20)/.10)*ease((y-.88)/.08),waist=ease((y-.94)/.10);
  const shoulder=bones.indexOf(named['upperArm'+(z<0?-1:1)]),elbow=bones.indexOf(named['forearm'+(z<0?-1:1)]),bend=1-ease((y-.98)/.08);
  jacket.geometry.attributes.skinIndex.setXYZW(i,0,1,shoulder,elbow);jacket.geometry.attributes.skinWeight.setXYZW(i,(1-sleeve)*(1-waist),(1-sleeve)*waist,sleeve*(1-bend),sleeve*bend);
 }
 // Pasterns bend into the trouser cuffs while the paw soles stay rigid/planted.
 for(const side of [-1,1]){const foot=worker.parts.find(p=>p.name==='furry dog foot '+side),shin=bones.indexOf(named['shin'+side]),ankle=bones.indexOf(named['hoof'+side]);for(let i=0;i<foot.geometry.attributes.position.count;i++){const w=ease((foot.geometry.attributes.position.getY(i)-.10)/.10);foot.geometry.attributes.skinIndex.setXYZW(i,ankle,shin,0,0);foot.geometry.attributes.skinWeight.setXYZW(i,1-w,w,0,0);}}
 // Cuffs belong to the lower leg, not the rigid sole. Keep the crotch on the
 // pelvis and blend into each thigh so a deep bend cannot pull a cloth fin.
 const trousers=worker.parts[1];for(let i=0;i<trousers.geometry.attributes.position.count;i++){
  const p=trousers.geometry.attributes.position,y=p.getY(i),z=p.getZ(i),side=z<0?-1:1;
  const center=ease((Math.abs(z)-.03)/.12),leg=(1-ease((y-.69)/.14))*(1-(1-center)*ease((y-.52)/.12)),knee=1-ease((y-.42)/.11);
  trousers.geometry.attributes.skinIndex.setXYZW(i,0,bones.indexOf(named['thigh'+side]),bones.indexOf(named['shin'+side]),0);trousers.geometry.attributes.skinWeight.setXYZW(i,1-leg,leg*(1-knee),leg*knee,0);
 }
 preserveClothingHeadWeights(saved,bones.indexOf(named.head));
 for(const m of worker.parts){m.bind(skeleton);m.geometry.attributes.skinIndex.needsUpdate=m.geometry.attributes.skinWeight.needsUpdate=true;}
 const limbs=[-1,1].map(side=>({side,shoulder:named['upperArm'+side],elbow:named['forearm'+side],hand:named['hand'+side],finger:named['fingers'+side],hip:named['thigh'+side],knee:named['shin'+side],ankle:named['hoof'+side]}));
 const palm=V(.052,-.010,0),rifle=worker.rifle,carryAxis=V(.20,.38,-.90).normalize(),carryQ=new T.Quaternion().setFromUnitVectors(V(1,0,0),carryAxis);
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
  named.hips.position.add(V(-.10*state.kneel,-.375*state.kneel-state.bob-walkCrouch,.032*state.transfer));
  named.hips.rotation.x=.025*state.transfer;
  named.hips.rotation.y=-.045*state.transfer;
  named.spine.rotation.z=-.07*state.kneel-.020*state.recoil;
  named.spine.rotation.x=.16*state.aim-.065*state.transfer;
  named.spine.rotation.y=.10*state.transfer;
  named.head.rotation.z=(pitch*Math.PI/180*1.5-.9)*state.aim;
  named.head.rotation.y=(25+.4*pitch)*Math.PI/180*state.aim;
  tailBones[0].rotation.z=-.95*state.kneel;tailBones[0].rotation.x=.075*Math.sin(state.time*4)*Math.sin(Math.PI*clamp(state.time/3,0,1));
  tailBones[1].rotation.z=.12*state.kneel;tailBones[2].rotation.z=.08*state.kneel;
  root.updateMatrixWorld(true);
  for(const l of limbs){const f=state.feet[l.side],target=V(f.x-state.distance,.12+f.lift,l.side*.232);limb(l.hip,l.knee,l.ankle,target,V(1,0,0));rotation(l.ankle,new T.Quaternion());}
  const spineQ=named.spine.getWorldQuaternion(new T.Quaternion()),spineOrigin=named.spine.getWorldPosition(V());
  const carryPosition=V(.24,1.005,.035).sub(rest.get(named.spine)).applyQuaternion(spineQ).add(spineOrigin);
  const yaw=-35*Math.PI/180,angle=pitch*Math.PI/180;
  const axis=V(Math.cos(yaw)*Math.cos(angle),Math.sin(angle),Math.sin(yaw)*Math.cos(angle));
  const aimQ=new T.Quaternion().setFromUnitVectors(V(1,0,0),axis);
  const stock=named['upperArm1'].getWorldPosition(V()).add(V(-.045,.070,-.035).applyQuaternion(spineQ));
  const aimPosition=stock.clone().sub(rifle.anchors.stock.position.clone().applyQuaternion(aimQ));
  rifle.root.quaternion.copy(spineQ.clone().multiply(carryQ)).slerp(aimQ,state.aim);
  rifle.root.position.copy(carryPosition).lerp(aimPosition,state.aim).addScaledVector(axis,-.038*state.recoil);
  rifle.root.visible=true;root.updateMatrixWorld(true);contacts=[];
  const gunAxis=V(1,0,0).applyQuaternion(rifle.root.quaternion),handQ=new T.Quaternion().setFromUnitVectors(V(0,-1,0),gunAxis);
  for(const l of limbs){const name=l.side===1?'grip':'support',target=rifle.anchors[name].getWorldPosition(V()),wrist=target.clone().sub(palm.clone().applyQuaternion(handQ));limb(l.shoulder,l.elbow,l.hand,wrist,V(-.12,-1,l.side*.55));rotation(l.hand,handQ);l.finger.rotation.z=-.9;contacts.push({side:l.side,name});}
  // Body stands obliquely to the aim line; +heading turns the actual bore toward +Z.
  root.rotation.y=-(heading+35)*Math.PI/180;root.position.set(state.distance*Math.cos((heading+35)*Math.PI/180),0,state.distance*Math.sin((heading+35)*Math.PI/180));
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
