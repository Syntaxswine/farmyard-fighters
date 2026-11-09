import {createTowerTailTuck} from './tower-tail-tuck.js';
import * as T from './vendor/three.module.js';
import {createCasualtyPose} from './casualty-pose.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
// Articulate the existing painted skeleton; no changes to collision or core state.
export function createBattlePosture(worker,profile){
 const towerTail=createTowerTailTuck(worker,profile);
 const root=worker.root,named=Object.fromEntries(worker.bones.map(b=>[b.name,b]));
 root.position.set(0,0,0);root.rotation.set(0,0,0);worker.pose('neutral');root.updateMatrixWorld(true);
 const rest=new Map(worker.bones.map(b=>[b,b.getWorldPosition(V())]));
 const hips=named.hips||named.pelvis,spine=named.spine||named.breast;
 // The furry upper ankle belongs with the shin inside the trouser cuff;
 // only the paw/sole stays rigid with the foot. Reuse the dog motion proof.
 if(profile.proneAim?.pastern)for(const side of [-1,1]){
  const foot=worker.parts.find(p=>p.name==='furry dog foot '+side),a=foot.geometry.attributes,shin=worker.bones.indexOf(named['shin'+side]),ankle=worker.bones.indexOf(named['hoof'+side]);
  for(let i=0;i<a.position.count;i++){const w=T.MathUtils.smoothstep(a.position.getY(i),.10,.20);a.skinIndex.setXYZW(i,ankle,shin,0,0);a.skinWeight.setXYZW(i,1-w,w,0,0);}a.skinIndex.needsUpdate=a.skinWeight.needsUpdate=true;
 }
 const tails=profile.proneAim&&(profile.longTail||profile.proneAim.tailUpright)?worker.parts.filter(p=>p.name.includes('tail')).map(part=>{
  const upright=!!profile.proneAim.tailUpright,axis=upright?0:1,a=part.geometry.attributes,position=a.position.clone(),normal=a.normal.clone(),top=Math.max(...Array.from({length:position.count},(_,i)=>position.getComponent(i,axis))),pivot=V();let count=0;
  for(let i=0;i<position.count;i++)if(position.getComponent(i,axis)>top-.025){pivot.add(V().fromBufferAttribute(position,i));count++;}pivot.divideScalar(count);pivot.setComponent(axis,top);
  let rootRadius=0;for(let i=0;i<position.count;i++)if(position.getComponent(i,axis)>top-.025)rootRadius=Math.max(rootRadius,V().fromBufferAttribute(position,i).distanceTo(pivot));
  return {part,position,normal,pivot,axis,upright,rootRadius};
 }):[];
 function tailClearance(kneel,prone){for(const {part,position,normal,pivot,axis,upright,rootRadius}of tails){const a=part.geometry.attributes;
  for(let i=0;i<position.count;i++){const point=V().fromBufferAttribute(position,i),bend=upright?T.MathUtils.smoothstep(point.distanceTo(pivot),rootRadius,rootRadius+.14):T.MathUtils.smoothstep(pivot.getComponent(axis)-position.getComponent(i,axis),.025,.18),q=new T.Quaternion().setFromAxisAngle(V(0,0,1),(upright?.95*prone:-.75*kneel)*bend),p=point.sub(pivot).applyQuaternion(q).add(pivot),n=V().fromBufferAttribute(normal,i).applyQuaternion(q);a.position.setXYZ(i,p.x,p.y,p.z);a.normal.setXYZ(i,n.x,n.y,n.z);}a.position.needsUpdate=true;a.normal.needsUpdate=true;
 }}
 // Keep the tucked shirt hem with the waist instead of pulling it out of the
 // overalls when both sleeves reach forward. Reuse the approved horse proof.
 if(profile.proneAim?.tuckHem)for(const part of worker.parts.filter(p=>p.name.includes('shirt'))){
  const a=part.geometry.attributes,smooth=(lo,hi,x)=>T.MathUtils.smoothstep(x,lo,hi);
  for(let i=0;i<a.position.count;i++){
   const y=a.position.getY(i),z=a.position.getZ(i),side=z<0?-1:1,upper=worker.bones.indexOf(named['upperArm'+side]),lower=worker.bones.indexOf(named['forearm'+side]),hi=worker.bones.indexOf(hips),si=worker.bones.indexOf(spine);let u=0,l=0;const other=[];
   for(let j=0;j<4;j++){const index=a.skinIndex.getComponent(i,j),weight=a.skinWeight.getComponent(i,j);if(index===upper)u+=weight;else if(index===lower)l+=weight;else if(weight>0&&index!==hi&&index!==si)other.push([index,weight]);}
   const keep=1-(1-smooth(1,1.12,y))*(1-smooth(.20,.26,Math.abs(z)));u*=keep;l*=keep;
   // Weight on any other bone (a collar's on the head, from the character's layer fit) stays as it is.
   const held=other.reduce((s,[,x])=>s+x,0),waist=smooth(.90,1.04,y),torso=Math.max(0,1-u-l-held);
   if(!other.length){a.skinIndex.setXYZW(i,hi,si,upper,lower);a.skinWeight.setXYZW(i,torso*(1-waist),torso*waist,u,l);}
   else{const slots=[[hi,torso*(1-waist)],[si,torso*waist],[upper,u],[lower,l],...other].filter(([,x])=>x>1e-6).sort((p,q)=>q[1]-p[1]).slice(0,4),sum=slots.reduce((s,[,x])=>s+x,0)||1;while(slots.length<4)slots.push([0,0]);
    a.skinIndex.setXYZW(i,...slots.map(([b])=>b));a.skinWeight.setXYZW(i,...slots.map(([,x])=>x/sum));}
  }a.skinIndex.needsUpdate=true;a.skinWeight.needsUpdate=true;
 }
 function rotation(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));root.updateMatrixWorld(true);}
 function leg(side,target){
  const a=named['thigh'+side],b=named['shin'+side],c=named['hoof'+side];
  const ra=rest.get(a),rb=rest.get(b),rc=rest.get(c),start=a.getWorldPosition(V()),la=ra.distanceTo(rb),lb=rb.distanceTo(rc);
  const axis=target.clone().sub(start),d=T.MathUtils.clamp(axis.length(),Math.abs(la-lb)+.0001,la+lb-.0001);axis.normalize();
  const along=(la*la-lb*lb+d*d)/(2*d),pole=V(1,0,0).addScaledVector(axis,-axis.x).normalize();
  const mid=start.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,la*la-along*along)));
  rotation(a,new T.Quaternion().setFromUnitVectors(rb.clone().sub(ra).normalize(),mid.clone().sub(start).normalize()));
  rotation(b,new T.Quaternion().setFromUnitVectors(rc.clone().sub(rb).normalize(),start.clone().addScaledVector(axis,d).sub(mid).normalize()));
  rotation(c,new T.Quaternion());
 }
 function supportedLeg(side,old,low){
  const a=named['thigh'+side],b=named['shin'+side],c=named['hoof'+side],ra=rest.get(a),rb=rest.get(b),rc=rest.get(c),start=a.getWorldPosition(V()),la=ra.distanceTo(rb),lb=rb.distanceTo(rc);
  const footQ=new T.Quaternion().setFromAxisAngle(V(0,0,1),-1.2*low);let sole=0;
  for(const part of worker.parts.filter(p=>/hoof|boot|foot/.test(p.name))){const points=part.geometry.attributes.position;for(let i=0;i<points.count;i++)if(Math.sign(points.getZ(i))===side)sole=Math.min(sole,V().fromBufferAttribute(points,i).sub(rc).applyQuaternion(footQ).y);}
  const turn=(from,to)=>from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*low;
  const kneeY=T.MathUtils.clamp(T.MathUtils.lerp(old.knee.y,profile.proneAim?.kneeHeight??.10,low),start.y-la+.0001,start.y+la-.0001),dy=kneeY-start.y;
  const angle=turn(Math.atan2(old.knee.z-old.hip.z,old.knee.x-old.hip.x),Math.atan2(side*.6,-1)),r=Math.sqrt(Math.max(0,la*la-dy*dy)),knee=V(start.x+Math.cos(angle)*r,kneeY,start.z+Math.sin(angle)*r);
  const ankleY=T.MathUtils.clamp(Math.max(T.MathUtils.lerp(old.ankle.y,-sole,low),-sole),knee.y-lb+.0001,knee.y+lb-.0001),sy=ankleY-knee.y;
  const bend=turn(Math.atan2(old.ankle.z-old.knee.z,old.ankle.x-old.knee.x),Math.atan2(side*.25,-1)),sr=Math.sqrt(Math.max(0,lb*lb-sy*sy)),ankle=V(knee.x+Math.cos(bend)*sr,ankleY,knee.z+Math.sin(bend)*sr);
  rotation(a,new T.Quaternion().setFromUnitVectors(rb.clone().sub(ra).normalize(),knee.clone().sub(start).normalize()));rotation(b,new T.Quaternion().setFromUnitVectors(rc.clone().sub(rb).normalize(),ankle.clone().sub(knee).normalize()));rotation(c,footQ);
 }
 const tailSources=worker.parts.filter(p=>p.name.includes('tail')||p.name==='apron waist tie').map(part=>({part,position:part.geometry.attributes.position.clone(),normal:part.geometry.attributes.normal.clone()}));
 let casualty;
 function applyStance(sample,{equipment=true}={}){
  const {kneel=0,prone=0}=sample.pose||{};
  towerTail.apply(0);
  tailClearance(kneel,prone);
  if(['iron-searchlight-ladder-tower','wooden-spotlight-tower'].includes(sample.towerPost?.kind))towerTail.apply(1-T.MathUtils.clamp(kneel+prone,0,1),{fromCurrent:true});
  if(kneel+prone<.00001||profile.unarmed)return;
  const heading=root.rotation.y;root.rotation.y=0;root.position.set(0,0,0);root.updateMatrixWorld(true);
  const before=spine.matrixWorld.clone(),low=Math.min(1,prone),cycle=(sample.distance||0)*Math.PI*5,walk=sample.blend||0;
  const starts=new Map(),legRest=new Map();
  if(profile.proneAim&&low>0&&!profile.unarmed){
   for(const side of [-1,1])for(const n of ['thigh','shin','hoof'])legRest.set(n+side,named[n+side].quaternion.clone());
   const drop=(profile.kneelDrop||.36)*Math.min(1,kneel/Math.max(1-low,1e-8));hips.position.y-=drop;root.updateMatrixWorld(true);
   for(const side of [-1,1]){const foot=rest.get(named['hoof'+side]);if(drop>0)leg(side,V(foot.x+(side===1?.26:-.28)*drop/(profile.kneelDrop||.36),.12,foot.z));starts.set(side,{hip:named['thigh'+side].getWorldPosition(V()),knee:named['shin'+side].getWorldPosition(V()),ankle:named['hoof'+side].getWorldPosition(V())});}
   hips.position.y+=drop;for(const [name,q]of legRest)named[name].quaternion.copy(q);root.updateMatrixWorld(true);
  }
  hips.position.y-=(profile.unarmed?0:(profile.kneelDrop||.36))*kneel;
  hips.position.y+=(.27-rest.get(hips).y)*low+(profile.proneAim?.hipLift||0)*prone;
  hips.rotation.z=(profile.unarmed?hips.rotation.z:0)-Math.PI/2*low;
  hips.rotation.x=0;
  spine.rotation.z+=(profile.unarmed?0:.15*prone);
  named.head.rotation.z+=(profile.unarmed?0:1.35*prone);
  {
   root.updateMatrixWorld(true);
   for(const side of [-1,1]){
    const foot=rest.get(named['hoof'+side]);
    if(kneel>0&&(low===0||(!profile.proneAim&&low<.001)))leg(side,V(foot.x+(side===1?.26:-.28)*kneel+.07*Math.sin(cycle+side)*walk,.12+.025*Math.max(0,Math.sin(cycle+side))*walk,foot.z));
    if(low>0){named['thigh'+side].rotation.z+=(-.16+.10*Math.sin(cycle+side)*walk)*low;named['thigh'+side].rotation.x+=side*(.18*prone);named['shin'+side].rotation.z+=(.28+.17*Math.sin(cycle+side)*walk)*prone;named['hoof'+side].rotation.z+=.8*low;}
    if(profile.proneAim&&prone>0)supportedLeg(side,starts.get(side),low);
   }
  }
  root.updateMatrixWorld(true);
  if(equipment&&worker.weapon){
   // Transform carry equipment with the torso, keeping both authored grips.
   const delta=spine.matrixWorld.clone().multiply(before.invert());
   worker.weapon.root.applyMatrix4(delta);worker.weapon.updateHose?.(root);
   worker.weapon.root.visible=true;
   if(worker.weapon.mount)worker.weapon.mount.visible=true;
   if(worker.weapon.hose)worker.weapon.hose.visible=true;
  }
  root.rotation.y=heading;root.updateMatrixWorld(true);worker.skeleton.update();
 }
 return {resetTail(){towerTail.apply(0);},apply(sample,options={}){
  casualty?.reset();
  const down=T.MathUtils.clamp(sample.pose?.down||0,0,1);
  const remaining=Math.max(1-down,1e-8);
  applyStance({...sample,pose:{kneel:(sample.pose?.kneel||0)/remaining,prone:(sample.pose?.prone||0)/remaining}},options);
  if(down>0){casualty ||= createCasualtyPose(worker,profile,tailSources);casualty.apply(sample);}
 },ground(){
  // Ground the actual skinned surface, including non-human heads/tails/feet.
  // Called only when a pose changes; stationary actors keep their cached pose.
  let min=Infinity;const v=V();
  for(const part of worker.parts){const p=part.geometry.attributes.position;for(let i=0;i<p.count;i++){part.getVertexPosition(i,v);v.applyMatrix4(part.matrixWorld);min=Math.min(min,v.y);}}
  root.position.y+=.012-min;root.updateMatrixWorld(true);worker.skeleton.update();
 }};
}
