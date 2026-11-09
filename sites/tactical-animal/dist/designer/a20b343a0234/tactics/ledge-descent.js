import * as T from './vendor/three.module.js';
import {createEquipmentStow} from './equipment-stow.js';
import {createLadderGrip} from './ladder-grip.js';
import {createDescentTail} from './ledge-descent-tail.js';
import {createRoofMantlePaint} from './roof-mantle-paint.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion(),ease=t=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
export const LEDGE_DESCENT_PHASES=Object.freeze([['Stow weapon',.65],['Crouch at edge',.55],['Plant left hand',.35],['Hop off holding edge',.38],['Lower on left hand',.30],['Release and drop',.28],['Absorb landing',.22],['Stand',.40],['Ready weapon',.65]].map(([label,seconds],i,all)=>Object.freeze({label,start:all.slice(0,i).reduce((n,p)=>n+p[1],0),end:all.slice(0,i+1).reduce((n,p)=>n+p[1],0)})));
// Mammal rifle/unarmed presentation study. Ledge occupies x>=0, top y=2; floor y=0.
// A crouched one-hand hop, not the climbing clip played backwards.
export function createLedgeDescent(worker,profile){
 if(!['horse','goat','bull','cow','donkey','sheep','skunk','pig-foreman','pig-director','rabbit','dog'].includes(profile.id)||!worker.weapon?.root||!['rifle','hands'].includes(worker.weapon.id||'rifle'))throw Error('Ledge descent supports reviewed mammals with rifle or empty hands');
 const unarmed=worker.weapon.id==='hands',phases=unarmed?Object.freeze(LEDGE_DESCENT_PHASES.map((p,i)=>Object.freeze({...p,label:i===0?'Prepare unarmed':i===8?'Settle unarmed':p.label}))):LEDGE_DESCENT_PHASES;
 const root=worker.root,bones=worker.bones,named=Object.fromEntries(bones.map(b=>[b.name,b]));
 const entryObjects=[];root.traverse(o=>entryObjects.push({o,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone(),visible:o.visible}));
 const entryGeometry=worker.parts.map(p=>({g:p.geometry,index:p.geometry.index,attributes:Object.fromEntries(['position','skinIndex','skinWeight'].map(k=>[k,p.geometry.attributes[k]]))})),createdGrips=[];let equipment,clothPaint,tail;
 function restoreEntry(){for(const {g,index,attributes}of entryGeometry){g.setIndex(index);for(const [k,a]of Object.entries(attributes))g.setAttribute(k,a);}for(const {o,p,q,s,visible}of entryObjects){o.position.copy(p);o.quaternion.copy(q);o.scale.copy(s);o.visible=visible;}root.updateMatrixWorld(true);worker.skeleton.update();}
 function checkFrame(){root.parent?.updateMatrixWorld(true);if(root.scale.distanceTo(V(1,1,1))>1e-8||(root.parent&&!root.parent.matrixWorld.elements.every((v,i)=>Math.abs(v-(i%5===0?1:0))<1e-8)))throw Error('Ledge descent requires an unscaled actor under an identity parent');}
 checkFrame();if(!['hips','spine','head',...[-1,1].flatMap(s=>['upperArm','forearm','hand','thigh','shin','hoof'].map(n=>n+s))].every(n=>named[n])||![-1,1].every(s=>worker.parts.some(p=>p.name==='forearm and hand '+s)))throw Error('Incomplete ledge descent rig');
 try{root.position.set(0,0,0);root.quaternion.identity();worker.pose('neutral');root.updateMatrixWorld(true);
 const rest=new Map(bones.map(b=>[b,b.getWorldPosition(V())])),limbs=[];
 for(const side of [-1,1]){
  limbs.push({id:'hand'+side,side,a:named['upperArm'+side],b:named['forearm'+side],c:named['hand'+side],offset:V(.10,-.024,0)});
  limbs.push({id:'foot'+side,side,a:named['thigh'+side],b:named['shin'+side],c:named['hoof'+side],offset:V(0,-.12,0)});
 }
 // Preserve any authored carry helpers while opening into the ledge glove.
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
 clothPaint=createRoofMantlePaint(worker,profile);tail=createDescentTail(worker,profile);
 // The director's broader head/cap needs the barrel angled away from the face.
 const stow=equipment=createEquipmentStow(worker,profile,{riflePlacement:{back:-.29,side:profile.id==='pig-director'?-.25:-.20,axis:profile.id==='pig-director'?[0,.95,-.15]:[0,.95,.20]}});
 const duration=phases.at(-1).end,stowWeapon=worker.weapon;let disposed=false,result=null;
 const capture=()=>({bones:bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone()})),gun:{p:worker.weapon.root.position.clone(),q:worker.weapon.root.quaternion.clone()}});
 worker.pose('carry');const carry=capture();worker.pose('neutral');const neutral=capture();

 const keys=[
  {p:[.50,2,0]}, {p:[.50,2,0]},
  {p:[.34,1.42,0],bend:-1.0}, {p:[.34,1.42,0],bend:-1.0},
  {p:[-.35,1.18,.03],bend:-.15}, {p:[-.47,.82,.03],bend:-.05},
  {p:[-.62,0,.03],bend:-.04}, {p:[-.62,-.20,.03],bend:-.25},
  {p:[-.62,0,.03]}, {p:[-.62,0,.03]}
 ];
 const crouch={
  'pig-foreman':{height:1.64,bend:-1.30,hopLift:.045},'pig-director':{height:1.58,bend:-1.30,hopLift:.040}
 }[profile.id];if(crouch)for(const i of [2,3]){keys[i].p[1]=crouch.height;keys[i].bend=crouch.bend;keys[i].lean=-.4;}
 if(crouch)keys[4].lean=profile.id==='pig-director'?-.98:-.65;
 if(profile.id==='pig-foreman')keys[4].p[0]-=.035;
 const landingX={bull:-1.00,cow:-1.02,donkey:-.95,dog:-.95,skunk:-.75}[profile.id];if(landingX)for(const i of [6,7,8,9])keys[i].p[0]=landingX;
 function body(k){root.position.fromArray(k.p);named.hips.rotation.set(0,Math.PI,k.bend||0);named.spine.rotation.z=k.lean||0;named.head.rotation.z=-(k.bend||0)*.45-(k.lean||0)*.65;root.updateMatrixWorld(true);}
 const soles=x=>[-1,1].map(s=>V(x,2,-s*.232));
 const feet=[soles(.535),soles(.535),soles(.535),soles(.535),[-1,1].map(s=>V(-.40,1.43,-s*.232+.03)),[-1,1].map(s=>V(-.435,.82,-s*.232+.03)),...Array.from({length:4},()=>[-1,1].map(s=>V(-.585,0,-s*.232+.03)))];
 if(landingX)for(const i of [6,7,8,9])for(const p of feet[i])p.x+=landingX+.62;
 const edge=V(.015,2,.26),footQ=Q().setFromAxisAngle(V(0,1,0),Math.PI);
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
  const k={p:a.p.map((v,i)=>T.MathUtils.lerp(v,b.p[i],w)),bend:T.MathUtils.lerp(a.bend||0,b.bend||0,w),lean:T.MathUtils.lerp(a.lean||0,b.lean||0,w)};
  if(index===3)k.p[1]+=(crouch?.hopLift??.025)*Math.sin(Math.PI*u);
  if(index===5){k.p[1]=T.MathUtils.lerp(a.p[1],b.p[1],u*u);k.p[0]=T.MathUtils.lerp(a.p[0],b.p[0],u);}
  const contacts=[],last=index===8,transition=index===0||last,handBlend=index===0?w:last?1-w:1;clothPaint.set(handBlend);
  if(transition){const weight=last?w:1-w;bones.forEach((bone,i)=>{bone.position.copy(neutral.bones[i].p).lerp(carry.bones[i].p,weight);bone.quaternion.copy(neutral.bones[i].q).slerp(carry.bones[i].q,weight);});}
  body(k);tail.set(index===1?w:index>=2&&index<=5?1:index===6?1-w:0);stow.apply();const gun=worker.weapon.root;
  if(transition){const amount=handBlend,parked={p:gun.position.clone(),q:gun.quaternion.clone()},turn=Q().setFromAxisAngle(V(0,1,0),Math.PI),carryP=carry.gun.p.clone().applyQuaternion(turn),carryQ=turn.clone().multiply(carry.gun.q);gun.position.copy(carryP).lerp(parked.p,amount);gun.position.y+=.24*Math.sin(Math.PI*amount);gun.position.z-=.48*Math.sin(Math.PI*amount);gun.quaternion.copy(carryQ).slerp(parked.q,amount);stow.blend(amount);root.updateMatrixWorld(true);
   for(const l of limbs.filter(l=>!unarmed&&l.id.startsWith('hand'))){const grasp=1-ease((amount-(l.side===1?.64:0))/(l.side===1?.25:.18));if(!grasp)continue;const boneQ=l.c.getWorldQuaternion(Q()),anchor=worker.weapon.anchors[l.side===1?'grip':'support'].getWorldPosition(V()),palm=V(.052,-.010,0),from=l.c.localToWorld(palm.clone());contacts.push({id:l.id,kind:'weapon',error:solve({...l,offset:palm},from.lerp(anchor,grasp),boneQ,l.b.getWorldPosition(V()).sub(l.a.getWorldPosition(V())))});}
  }
  for(const [i,l]of limbs.filter(l=>l.id.startsWith('foot')).entries()){
   const target=feet[index][i].clone().lerp(feet[index+1][i],w);
   if(index===3){const lift=ease(u/.35),over=ease((u-.25)/.75);target.x=T.MathUtils.lerp(feet[3][i].x,feet[4][i].x,over);target.y=T.MathUtils.lerp(2,2.16,lift)+(feet[4][i].y-2.16)*ease((u-.60)/.40);}
   if(index===5){target.y=T.MathUtils.lerp(feet[5][i].y,0,u*u);target.x=T.MathUtils.lerp(feet[5][i].x,feet[6][i].x,u);}
   const restPole=rest.get(l.b).clone().sub(rest.get(l.a)).applyQuaternion(footQ),pole=restPole.clone().lerp(V(-.40,.10,-l.side*.1),index===1?w:index===2||index===3?1:index===4?1-w:index===6?w:index===7?1-w:0),error=solve(l,target,footQ,pole),planted=index<=2||index>=6;
   contacts.push({id:l.id,kind:planted?(index<=2?'roof':'floor'):'free',point:target.toArray(),planted,error});
  }
  if(!transition)for(const {l,asset}of grips){
   const current=l.c.localToWorld(l.offset.clone());if(index===1)current.y+=.29*w;if(index===2)current.y+=.29;const target=current.clone(),q=l.c.getWorldQuaternion(Q());let planted=false;
   if(l.side===-1){
    if(index===2){target.lerp(edge,w);q.slerp(Q(),w);}
    if(index===3||index===4){target.copy(edge);q.identity();planted=true;}
    if(index===5){const lift=ease(u/.30),drop=ease((u-.30)/.70);target.copy(edge).lerp(V(-.18,2.06,.26),lift).lerp(current,drop);q.copy(Q()).slerp(l.c.getWorldQuaternion(Q()),drop);}
   }else if(index>=3&&index<=5){target.add(V(-.12,.12,-.07).multiplyScalar(index===3?w:index===5?1-w:1));if(index===3&&l.side===1)target.y+=.29*(1-w);}
   if(crouch&&!planted){const off=l.offset.clone().applyQuaternion(q),start=l.a.getWorldPosition(V()),axis=target.clone().sub(off).sub(start),reach=rest.get(l.a).distanceTo(rest.get(l.b))+rest.get(l.b).distanceTo(rest.get(l.c))-.002;if(axis.length()>reach)target.copy(start).addScaledVector(axis,reach/axis.length()).add(off);}
   const freePole=l.b.getWorldPosition(V()).sub(l.a.getWorldPosition(V())),holdPole=V(l.side===-1?.15:-.30,-.2,-l.side*.8),pole=index===1?freePole.lerp(holdPole,w):index===7?holdPole.lerp(freePole,w):holdPole;
   const error=solve(l,target,q,pole);asset.update(target.clone().sub(root.position),q,handBlend);contacts.push({id:l.id,kind:planted?'roof':'free',point:target.toArray(),planted,error});
  }else for(const {l,asset}of grips)asset.update(l.c.localToWorld(l.offset.clone()).sub(root.position),l.c.getWorldQuaternion(Q()),handBlend);
  for(const {o,p,q,scale}of carryHelpers){o.visible=handBlend<1;o.position.copy(p);o.quaternion.copy(q);o.scale.copy(scale).multiplyScalar(1-handBlend);}
  root.updateMatrixWorld(true);worker.skeleton.update();stow.sync();
  return {phase:phase.label,index,time:t,duration,root:root.position.toArray(),contacts,weapon:unarmed?'hands':'rifle',equipment:unarmed?'empty':transition?'transition':'slung',airborne:index>=3&&index<=5};
 }
 const api={duration,phases,grips:grips.map(g=>g.asset),apply(progress,{origin=[0,0,0],heading=0}={}){
  if(disposed)throw Error('Ledge descent is disposed');if(!Number.isFinite(progress)||!Array.isArray(origin)||origin.length!==3||!origin.every(Number.isFinite)||!Number.isFinite(heading))throw Error('Invalid ledge descent playback');if(worker.weapon!==stowWeapon)throw Error('Equipment changed during ledge descent');checkFrame();root.rotation.set(0,0,0);result=poseAt(T.MathUtils.clamp(progress,0,1)*duration);const q=Q().setFromAxisAngle(V(0,1,0),-heading*Math.PI/180);root.quaternion.copy(q);root.position.applyQuaternion(q).add(V(...origin));root.updateMatrixWorld(true);worker.skeleton.update();result.worldRoot=root.position.toArray();result.contacts.forEach(c=>{if(c.point)c.worldPoint=V(...c.point).applyQuaternion(q).add(V(...origin)).toArray();});return result;
 },restore(){if(disposed)return;clothPaint.set(0);tail.restore();for(const {asset}of grips)asset.restore();stow.restore();restoreEntry();result=null;},diagnostics:()=>result,dispose(){if(disposed)return;this.restore();for(const {asset}of grips){asset.restore();asset.dispose();}stow.dispose();clothPaint.dispose();restoreEntry();disposed=true;}};
 api.restore();return api;
 }catch(error){for(const asset of createdGrips){asset.restore();asset.dispose();}equipment?.dispose();clothPaint?.dispose();tail?.restore();restoreEntry();throw error;}
}
