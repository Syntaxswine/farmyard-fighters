import * as T from './vendor/three.module.js';
import {createPigMantleProfile} from './pig-roof-mantle-profile.js';
import {createWorkerMantleProfile} from './worker-mantle-profile.js';
import {createPigMantleSurface} from './pig-roof-mantle-paint.js';
import {createEquipmentStow,supportsStow} from './equipment-stow.js';
import {createLadderGrip} from './ladder-grip.js';
import {poseRoofMantleCarry,roofMantleApproachOffset,positionRoofMantleEquipment} from './roof-mantle-equipment.js';
import {createRoofMantlePaint} from './roof-mantle-paint.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion(),ease=t=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
export const ROOF_MANTLE_PHASES=Object.freeze([['Stow weapon',.65],['Crouch to jump',.2],['Jump and grab',.4],['Catch weight',.15],['Press to waist',.8],['Lean forward and left',.5],['Right leg over',.65],['Slide belly onto roof',.65],['Lie flat',.3],['Gather legs underneath',.65],['Stand',.65],['Ready weapon',.65]].map(([label,seconds],i,all)=>Object.freeze({label,start:all.slice(0,i).reduce((n,p)=>n+p[1],0),end:all.slice(0,i+1).reduce((n,p)=>n+p[1],0)})));

// Authored mammal roof study. Local +X enters the ledge; face X=0, top Y=2.
// Progress is absolute and deterministic: review scrubbing never advances state.
export function createRoofMantle(worker,profile){
 if(!['horse','goat','bull','cow','donkey','sheep','skunk','pig-foreman','pig-director','rabbit','dog'].includes(profile.id)||!supportsStow(worker.weapon?.id||'rifle'))throw Error('Roof mantle supports the reviewed mammals with supported equipment');
 const unarmed=worker.weapon?.id==='hands',phases=unarmed?Object.freeze(ROOF_MANTLE_PHASES.map((p,i)=>Object.freeze({...p,label:i===0?'Prepare to climb':i===11?'Settle stance':p.label}))):ROOF_MANTLE_PHASES;
 const root=worker.root,bones=worker.bones,named=Object.fromEntries(bones.map(b=>[b.name,b]));
 const entryObjects=[];root.traverse(o=>entryObjects.push({o,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone(),visible:o.visible}));
 const entryGeometry=worker.parts.map(p=>({g:p.geometry,index:p.geometry.index,attributes:Object.fromEntries(['position','skinIndex','skinWeight'].map(k=>[k,p.geometry.attributes[k]]))})),createdGrips=[];let equipment,clothPaint,pigSurface;
 function restoreEntry(){for(const {g,index,attributes}of entryGeometry){g.setIndex(index);for(const [k,a]of Object.entries(attributes))g.setAttribute(k,a);}for(const {o,p,q,s,visible}of entryObjects){o.position.copy(p);o.quaternion.copy(q);o.scale.copy(s);o.visible=visible;}root.updateMatrixWorld(true);worker.skeleton.update();}
 function checkFrame(){root.parent?.updateMatrixWorld(true);if(root.scale.distanceTo(V(1,1,1))>1e-8||(root.parent&&!root.parent.matrixWorld.elements.every((v,i)=>Math.abs(v-(i%5===0?1:0))<1e-8)))throw Error('Roof mantle requires an unscaled actor under an identity parent');}
 checkFrame();if(!['hips','spine','head',...[-1,1].flatMap(s=>['upperArm','forearm','hand','thigh','shin','hoof'].map(n=>n+s))].every(n=>named[n])||![-1,1].every(s=>worker.parts.some(p=>p.name==='forearm and hand '+s)))throw Error('Incomplete roof mantle rig');
 try{root.position.set(0,0,0);root.quaternion.identity();worker.pose('neutral');root.updateMatrixWorld(true);
 const rest=new Map(bones.map(b=>[b,b.getWorldPosition(V())])),limbs=[],adaptation=createPigMantleProfile(worker,profile,rest,named)||createWorkerMantleProfile(worker,profile,rest,named);
 for(const side of [-1,1]){
  limbs.push({id:'hand'+side,side,a:named['upperArm'+side],b:named['forearm'+side],c:named['hand'+side],offset:V(.10,-.024,0)});
  limbs.push({id:'foot'+side,side,a:named['thigh'+side],b:named['shin'+side],c:named['hoof'+side],offset:V(0,-.12,0)});
 }
 // Preserve the authored HMG handle glove while opening into the ledge glove.
 if(worker.weapon?.id==='hmg')worker.pose('carry');
 const carryHelpers=(worker.gripHands||[]).filter(o=>o.visible).map(o=>({o,p:o.position.clone(),q:o.quaternion.clone(),scale:o.scale.clone()}));
 const grips=limbs.filter(l=>l.id.startsWith('hand')).map(l=>{
  const asset=createLadderGrip(worker,l.side,rest.get(l.c).y),palm=asset.meshes[0];createdGrips.push(asset);palm.position.set(-.065,.035,0);
  // Four fingers lie over the upper stone instead of curling through a rung.
  for(let i=0;i<4;i++){const mesh=asset.meshes[i+1],z=[-.035,-.012,.012,.035][i];mesh.geometry.dispose();mesh.geometry=new T.TubeGeometry(new T.CatmullRomCurve3([V(-.080,.012,z),V(-.060,.050,z),V(-.015,.065,z),V(.035,.040,z),V(.055,.013,z),V(.075,.009,z)]),18,.010,5,false);}
  const thumb=asset.meshes[5];thumb.geometry.dispose();thumb.geometry=new T.TubeGeometry(new T.CatmullRomCurve3([V(-.080,.024,l.side*.041),V(-.050,.028,l.side*.060),V(-.018,.025,l.side*.070),V(.005,.018,l.side*.068)]),10,.014,6,false);
  return {l,asset};
 });
 // The hoof asset includes the upper pastern: let its buried top follow the
 // shin like the trouser cuff. Extend the buried fur overlap for deep ankle
 // flex; the horn and sole remain rigid and retain their original vertices.
 const ankles=[-1,1].map(side=>{const mesh=worker.parts.find(p=>/hoof|boot|foot/.test(p.name)&&p.name.endsWith(' '+side)),g=mesh.geometry,position=g.attributes.position.clone(),indices=g.attributes.skinIndex.clone(),weights=g.attributes.skinWeight.clone(),shin=bones.indexOf(named['shin'+side]),hoof=bones.indexOf(named['hoof'+side]);
  for(let i=0;i<indices.count;i++){const y=position.getY(i);position.setY(i,y+.045*ease((y-.15)/.10));const w=ease((position.getY(i)-.17)/.10);indices.setXYZW(i,shin,hoof,0,0);weights.setXYZW(i,w,1-w,0,0);}return {g,position,indices,weights};});
 const shirt=worker.parts.find(p=>p.name.includes('shirt')),shirtIndices=shirt.geometry.attributes.skinIndex.clone(),shirtWeights=shirt.geometry.attributes.skinWeight.clone(),hemBone=bones.indexOf(named.hips);
 for(let i=0;i<shirtIndices.count;i++){const p=V().fromBufferAttribute(shirt.geometry.attributes.position,i),t=(1-ease((p.y-1.035)/.09))*(1-ease((Math.abs(p.z)-.20)/.10));if(t>0){const entries=new Map([[hemBone,t]]);for(let j=0;j<4;j++){const id=shirtIndices.getComponent(i,j),weight=shirtWeights.getComponent(i,j)*(1-t);entries.set(id,(entries.get(id)||0)+weight);}const sorted=[...entries].sort((a,b)=>b[1]-a[1]).slice(0,4);while(sorted.length<4)sorted.push([0,0]);const total=sorted.reduce((n,a)=>n+a[1],0);shirtIndices.setXYZW(i,...sorted.map(a=>a[0]));shirtWeights.setXYZW(i,...sorted.map(a=>a[1]/total));}}
 if(profile.id==='sheep')for(let i=0;i<shirtIndices.count;i++){
  const p=V().fromBufferAttribute(shirt.geometry.attributes.position,i),t=(1-ease((Math.abs(p.z)-.19)/.085))*ease((p.y-.99)/.04)*(1-ease((p.y-1.22)/.04));
  if(!t)continue;const spine=bones.indexOf(named.spine),rows=new Map([[spine,t]]);for(let j=0;j<4;j++){const id=shirtIndices.getComponent(i,j);rows.set(id,(rows.get(id)||0)+shirtWeights.getComponent(i,j)*(1-t));}const sorted=[...rows].sort((a,b)=>b[1]-a[1]).slice(0,4);while(sorted.length<4)sorted.push([0,0]);const sum=sorted.reduce((n,a)=>n+a[1],0);shirtIndices.setXYZW(i,...sorted.map(a=>a[0]));shirtWeights.setXYZW(i,...sorted.map(a=>a[1]/sum));
 }
 clothPaint=createRoofMantlePaint(worker,profile);pigSurface=createPigMantleSurface(worker,profile);
 const stow=equipment=createEquipmentStow(worker,profile,{riflePlacement:{back:-.29,side:-.20,axis:[0,.95,.20]}});
 const duration=phases.at(-1).end,stowWeapon=worker.weapon;let disposed=false,result=null;
 const capture=()=>({bones:bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone()})),gun:{p:worker.weapon.root.position.clone(),q:worker.weapon.root.quaternion.clone()}});
 poseRoofMantleCarry(worker,profile);const carry=capture();worker.pose('neutral');const neutral=capture();
 // Dedicated pose study: keep the published cliff traversal untouched.
 const keys=[
  {p:[-.65,0,0]}, {p:[-.65,0,0]}, {p:[-.60,-.13,0],lean:-.16},
  {p:[-.34,.48,0]}, {p:[-.33,.45,0]},
  {p:[-.30,1.13,0],lean:-.08},
  {p:[-.29,1.18,.08],lean:-.48,sideLean:-.55,hipLean:-.22,hipPitch:-.28},
  {p:[-.20,1.25,.15],lean:-.50,sideLean:-.40,hipLean:-.20,hipPitch:-.45},
  {p:[.55,1.37,.35],hipPitch:-1.52,hipYaw:1.15,lean:0},
  {p:[.55,1.37,.35],hipPitch:-1.52,hipYaw:1.15,lean:0},
  {p:[.75,1.45,.35],hipPitch:-1.05,hipYaw:.25,lean:-.2},
  {p:[.75,2,.35]}, {p:[.75,2,.35]}
 ];
 for(const [i,key]of Object.entries(adaptation?.keys||{}))Object.assign(keys[i],key);
 const approachOffset=roofMantleApproachOffset(worker);for(let i=0;i<3;i++)keys[i].p[0]-=approachOffset;
 function body(k){root.position.fromArray(k.p);named.hips.rotation.set(k.hipLean||0,k.hipYaw||0,k.hipPitch||0);named.spine.rotation.set(k.sideLean||0,0,k.lean||0);named.head.rotation.z=-(k.hipPitch||0)*.65+(k.headLift||0);root.updateMatrixWorld(true);}
 const free=keys.map(k=>{worker.pose('neutral');body(k);return Object.fromEntries(limbs.map(l=>[l.id,{p:l.c.localToWorld(l.offset.clone()),q:l.c.getWorldQuaternion(Q())}]));});
 // Wide paws/boots need raised toes in the flat pose and must lift before
 // advancing through the face. Hooved characters retain the approved path.
 const footLift={skunk:.045,rabbit:.09,dog:.035}[profile.id]||0;for(const i of [8,9])for(const side of [-1,1])free[i]['foot'+side].p.y+=footLift;
 const foot=(x,y,z)=>V(x,y,z),edge=s=>V(0,2,s*(adaptation?.edgeSpan??.26));
 const feet=[
  [foot(-.685,0,-.232),foot(-.685,0,.232)], [foot(-.685,0,-.232),foot(-.685,0,.232)], [foot(-.685,0,-.232),foot(-.685,0,.232)],
  [foot(-.34,.48,-.232),foot(-.34,.48,.232)], [foot(-.33,.45,-.232),foot(-.33,.45,.232)],
  [foot(-.34,1.13,-.232),foot(-.34,1.13,.232)],
  [foot(-.34,1.17,-.05),foot(-.32,1.30,.35)],
  [foot(-.27,1.28,.10),foot(.25,2,.60)],
  [-1,1].map(s=>free[8]['foot'+s].p),[-1,1].map(s=>free[9]['foot'+s].p),
  [foot(.715,2,.118),foot(.715,2,.582)],
  [foot(.715,2,.118),foot(.715,2,.582)], [foot(.715,2,.118),foot(.715,2,.582)]
 ];
 for(let i=0;i<3;i++)for(const point of feet[i])point.x-=approachOffset;
 const hands=keys.map((k,i)=>[-1,1].map(s=>i<3||i>10?free[i]['hand'+s].p: i<=7?edge(s):i<=9?V(.70,2,s===-1?-.38:.28):V(s===-1?1.05:1.15,2,s===-1?.05:.60)));
 adaptation?.configureContacts({keys,feet,hands,body});
 function worldRotate(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(Q()).invert().multiply(q));root.updateMatrixWorld(true);}
 function solve(l,point,q,pole){
  const target=point.clone().sub(l.offset.clone().applyQuaternion(q)),start=l.a.getWorldPosition(V()),a=rest.get(l.a),b=rest.get(l.b),c=rest.get(l.c),l1=a.distanceTo(b),l2=b.distanceTo(c),axis=target.clone().sub(start),distance=axis.length(),d=T.MathUtils.clamp(distance,Math.abs(l1-l2)+1e-6,l1+l2-1e-6);axis.normalize();pole=pole.clone().addScaledVector(axis,-pole.dot(axis)).normalize();
  const along=(l1*l1-l2*l2+d*d)/(2*d),mid=start.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along))),end=start.clone().addScaledVector(axis,d);
  const aim=(bone,child,point)=>{const origin=bone.getWorldPosition(V()),current=child.getWorldPosition(V()).sub(origin).normalize(),desired=point.clone().sub(origin).normalize();worldRotate(bone,Q().setFromUnitVectors(current,desired).multiply(bone.getWorldQuaternion(Q())));};
  if(l.id.startsWith('foot')){
   // Both leg segments share one anatomical hinge plane. Independent shortest
   // arc rotations can twist the knee fabric when the pelvis folds forward.
   const upper=b.clone().sub(a),lower=c.clone().sub(b),restNormal=upper.clone().cross(lower).normalize(),posedUpper=mid.clone().sub(start),posedLower=end.clone().sub(mid),posedNormal=posedUpper.clone().cross(posedLower).normalize();
   const frame=(axis,normal)=>{const x=axis.clone().normalize();return Q().setFromRotationMatrix(new T.Matrix4().makeBasis(x,normal.clone().cross(x).normalize(),normal));};
   worldRotate(l.a,frame(posedUpper,posedNormal).multiply(frame(upper,restNormal).invert()));worldRotate(l.b,frame(posedLower,posedNormal).multiply(frame(lower,restNormal).invert()));
  }else{aim(l.a,l.b,mid);aim(l.b,l.c,end);}worldRotate(l.c,q);
  return l.c.localToWorld(l.offset.clone()).distanceTo(point);
 }
 function poseAt(t){
  const index=Math.min(phases.length-1,phases.findIndex(p=>t<=p.end)),phase=phases[index],u=T.MathUtils.clamp((t-phase.start)/(phase.end-phase.start),0,1),w=ease(u),a=keys[index],b=keys[index+1];
  for(const {asset}of grips)asset.restore();stow.restore();worker.pose('neutral');shirt.geometry.setAttribute('skinIndex',shirtIndices);shirt.geometry.setAttribute('skinWeight',shirtWeights);for(const {g,position,indices,weights}of ankles){g.setAttribute('position',position);g.setAttribute('skinIndex',indices);g.setAttribute('skinWeight',weights);}
  const k={p:a.p.map((v,i)=>T.MathUtils.lerp(v,b.p[i],w))};for(const name of ['lean','sideLean','hipLean','hipPitch','hipYaw'])k[name]=T.MathUtils.lerp(a[name]||0,b[name]||0,w);if(index===7)k.p[1]+= .10*Math.sin(Math.PI*u);if(index===9)k.p[1]+=(['donkey','sheep'].includes(profile.id)?.035:.02)*Math.sin(Math.PI*u);adaptation?.bodyPath({index,u,a,b,k});body(k);
  const contacts=[],last=index===11,transition=index===0||last,handBlend=index===0?w:last?1-w:1;clothPaint.set(handBlend);pigSurface.set(handBlend);
  if(transition){const weight=last?w:1-w;bones.forEach((bone,i)=>{bone.position.copy(neutral.bones[i].p).lerp(carry.bones[i].p,weight);bone.quaternion.copy(neutral.bones[i].q).slerp(carry.bones[i].q,weight);});root.updateMatrixWorld(true);}
  stow.apply();positionRoofMantleEquipment(worker,profile);const gun=worker.weapon.root;adaptation?.placeEquipment?.({index,w,gun});const tuckGun=index===7?w:index===8||index===9?1:index===10?1-w:0;gun.position.add(V(stow.id==='hmg'||['holster','sheath','pouch'].includes(stow.mode)?0:(adaptation?.tuckGun?.({index,w})??.10*tuckGun),0,0).applyQuaternion(named.spine.getWorldQuaternion(Q())));root.updateMatrixWorld(true);
  if(transition){const amount=handBlend,parked={p:gun.position.clone(),q:gun.quaternion.clone()};gun.position.copy(carry.gun.p).lerp(parked.p,amount);gun.position.y+=(stow.id==='rifle'?.24:.12)*Math.sin(Math.PI*amount);gun.position.z+=(stow.id==='rifle'?.48:stow.mode==='sling'?.18:.08)*Math.sin(Math.PI*amount);if(stow.id==='hmg')gun.position.x-=.10*Math.sin(Math.PI*amount);gun.quaternion.copy(carry.gun.q).slerp(parked.q,amount);stow.blend(amount);root.updateMatrixWorld(true);
   for(const l of limbs.filter(l=>!unarmed&&l.id.startsWith('hand')&&(worker.weapon.carry?.hands||[1,-1]).includes(l.side))){const grasp=1-ease((amount-(l.side===1?.64:0))/(l.side===1?.25:.18));if(!grasp)continue;const boneQ=l.c.getWorldQuaternion(Q()),anchor=worker.weapon.anchors[l.side===1?'grip':'support'].getWorldPosition(V()),palm=V(...(worker.weapon.carry?.handPoses?.[l.side===1?'grip':'support']?.palm||[.052,-.010,0])),from=l.c.localToWorld(palm.clone());contacts.push({id:l.id,kind:'weapon',error:solve({...l,offset:palm},from.lerp(anchor,grasp),boneQ,l.b.getWorldPosition(V()).sub(l.a.getWorldPosition(V())).lerp(V(-.3,-.3,l.side*.8),ease(amount/.15)))});}
  }
  for(const [i,l]of limbs.filter(l=>l.id.startsWith('foot')).entries()){
   const target=feet[index][i].clone().lerp(feet[index+1][i],w),q=Q();
   if(index===7)q.slerp(free[8]['foot'+l.side].q,w);if(index===8)q.copy(free[8]['foot'+l.side].q);if(index===9)q.copy(free[9]['foot'+l.side].q).slerp(Q(),w);
   if(index===2)target.y+=.09*Math.sin(Math.PI*u);
   if(index===6&&l.side===1){target.x=T.MathUtils.lerp(feet[6][i].x,feet[7][i].x,ease((u-.3)/.7));target.y=T.MathUtils.lerp(feet[6][i].y,2.12,ease(u/.45))-.12*ease((u-.75)/.25);target.z+= .10*Math.sin(Math.PI*u);}
   if(index===7){const t=l.side===-1?ease((u-.05)/.95):w;target.copy(feet[7][i]).lerp(feet[8][i],t);if(footLift&&l.side===-1)target.x=T.MathUtils.lerp(feet[7][i].x,feet[8][i].x,ease((t-.20)/.80));q.copy(Q()).slerp(free[8][l.id].q,t);target.y+=(footLift?(l.side===-1?.62:.28):.32)*Math.sin(Math.PI*t);target.z+=.12*Math.sin(Math.PI*t);}
   if(index===9){const tuck=ease(l.side===-1?u/.6:(u-.4)/.6);target.copy(feet[9][i]).lerp(feet[10][i],tuck);target.y+=.08*Math.sin(Math.PI*tuck);q.copy(free[9]['foot'+l.side].q).slerp(Q(),tuck);}
   adaptation?.footPath({index,u,side:l.side,target});
   const restPole=rest.get(l.b).clone().sub(rest.get(l.a)),fold=V(-.1,1,l.side*.3),bodyPole=restPole.clone().applyQuaternion(named.hips.getWorldQuaternion(Q()));
   const basePole=V(.12,.05,l.side*.7);let pole=index===0||last?restPole:index===1?restPole.clone().lerp(basePole,w):index===5?basePole.clone().lerp(fold,w):index<6?basePole:fold;
   if(index===7)pole=fold.clone().lerp(bodyPole,w);if(index===8)pole=bodyPole;if(index===9)pole=bodyPole.clone().lerp(fold,ease(l.side===-1?u/.6:(u-.4)/.6));if(index===10)pole=fold.clone().lerp(restPole,w);
   adaptation?.footPole?.({index,u,side:l.side,pole});
   const error=solve(l,target,q,pole),planted=index<=1||index>=10||index===6&&l.side===1&&u===1||index===9&&(l.side===-1?u>=.6:u===1);
   contacts.push({id:l.id,kind:planted?(target.y>1?'roof':'floor'):'free',point:target.toArray(),planted,error});
  }
  if(!transition)for(const [i,{l,asset}]of grips.entries()){
   const target=hands[index][i].clone().lerp(hands[index+1][i],w),q=Q(),freeQ=l.c.getWorldQuaternion(Q());
   if(index<3)q.copy(free[index]['hand'+l.side].q).slerp(index===2?Q():free[index+1]['hand'+l.side].q,w);
   if(index===2){q.copy(free[2][l.id].q).slerp(Q(),ease(u/.85));target.x-=.18*Math.sin(Math.PI*u);target.y+=.20*Math.sin(Math.PI*u);}
   if(index===7){if(l.side===-1){const shift=ease((u-.4)/.25);target.copy(hands[7][i]).lerp(hands[8][i],shift);target.y+=.06*Math.sin(Math.PI*shift);}else{const first=ease(u/.4),second=ease((u-.65)/.35);target.copy(hands[7][i]).lerp(V(.55,2,.30),first).lerp(hands[8][i],second);target.y+=.06*(Math.sin(Math.PI*first)+Math.sin(Math.PI*second));}}
   if(index===9){const shift=ease(l.side===-1?u/.25:(u-.25)/.5);target.copy(hands[9][i]).lerp(hands[10][i],shift);target.y+=.06*Math.sin(Math.PI*shift);}
   if(index===10){const release=ease(u/.7);target.copy(hands[10][i]).lerp(l.c.localToWorld(l.offset.clone()),release);target.y+=.18*Math.sin(Math.PI*release);q.slerp(freeQ,release);}
   adaptation?.handPath({index,u,side:l.side,i,target,hands});
   const freePole=l.b.getWorldPosition(V()).sub(l.a.getWorldPosition(V())),holdPole=V(-.4,.1+(index===9&&['goat','bull','sheep','skunk'].includes(profile.id)?.4*Math.sin(Math.PI*u):0),l.side*.8),pole=index===1?freePole.lerp(holdPole,w):index===10?holdPole.lerp(freePole,ease(u/.7)):holdPole,error=solve(l,target,q,pole),planted=adaptation?.plantedHand({index,u,side:l.side})??(index>=3&&index<=6||index===8||index===7&&(l.side===-1?(u<=.4||u>=.65):(u>=.4&&u<=.65))||index===9&&(l.side===-1?u>=.25:(u<=.25||u>=.75))||index===10&&u===0);
   asset.update(target.clone().sub(root.position),q,handBlend);contacts.push({id:l.id,kind:planted?'roof':'free',point:target.toArray(),planted,error});
  }else for(const {l,asset}of grips)asset.update(l.c.localToWorld(l.offset.clone()).sub(root.position),l.c.getWorldQuaternion(Q()),handBlend);
  for(const {o,p,q,scale}of carryHelpers){o.visible=handBlend<1;o.position.copy(p);o.quaternion.copy(q);o.scale.copy(scale).multiplyScalar(1-handBlend);}
  root.updateMatrixWorld(true);worker.skeleton.update();for(const {o}of carryHelpers)if(o.visible)for(const c of o.children)c.update?.();stow.sync();
  // The flexible sling rests against the roof when the chest lies on it.
  const sling=root.getObjectByName('Equipment shoulder sling');if(sling?.visible&&index>=7&&index<=9){const a=sling.geometry.attributes.position;for(let i=0;i<a.count;i++){const v=sling.localToWorld(V().fromBufferAttribute(a,i));if(v.x>0&&v.y<2.002){v.y=2.002;sling.worldToLocal(v);a.setXYZ(i,v.x,v.y,v.z);}}a.needsUpdate=true;sling.geometry.computeVertexNormals();sling.geometry.computeBoundingSphere();}
  return {phase:phase.label,index,time:t,duration,root:root.position.toArray(),contacts,weapon:worker.weapon.id||'rifle',equipment:unarmed?'empty':transition?'transition':stow.mode==='sling'?'slung':stow.mode,airborne:index===2};
 }
 const api={duration,phases,grips:grips.map(g=>g.asset),apply(progress,{origin=[0,0,0],heading=0}={}){
  if(disposed)throw Error('Roof mantle is disposed');if(!Number.isFinite(progress)||!Array.isArray(origin)||origin.length!==3||!origin.every(Number.isFinite)||!Number.isFinite(heading))throw Error('Invalid roof mantle playback');if(worker.weapon!==stowWeapon)throw Error('Equipment changed during roof mantle');checkFrame();root.rotation.set(0,0,0);result=poseAt(T.MathUtils.clamp(progress,0,1)*duration);const q=Q().setFromAxisAngle(V(0,1,0),-heading*Math.PI/180);root.quaternion.copy(q);root.position.applyQuaternion(q).add(V(...origin));root.updateMatrixWorld(true);worker.skeleton.update();result.worldRoot=root.position.toArray();result.contacts.forEach(c=>{if(c.point)c.worldPoint=V(...c.point).applyQuaternion(q).add(V(...origin)).toArray();});return result;
 },restore(){if(disposed)return;clothPaint.set(0);pigSurface.set(0);for(const {asset}of grips)asset.restore();stow.restore();root.position.set(0,0,0);restoreEntry();result=null;},diagnostics:()=>result,dispose(){if(disposed)return;this.restore();for(const {asset}of grips){asset.restore();asset.dispose();}stow.dispose();clothPaint.dispose();pigSurface.dispose();restoreEntry();disposed=true;}};
 api.restore();return api;
 }catch(error){for(const asset of createdGrips){asset.restore();asset.dispose();}equipment?.dispose();clothPaint?.dispose();pigSurface?.dispose();restoreEntry();throw error;}
}
