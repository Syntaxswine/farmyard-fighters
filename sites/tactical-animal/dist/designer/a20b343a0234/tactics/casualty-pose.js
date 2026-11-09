import * as T from './vendor/three.module.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion();
// Authored resting poses on the approved skeleton. This layer owns no health,
// inventory or loot state, and always blends from a freshly evaluated live pose.
export function createCasualtyPose(worker,profile,tailSources){
 const root=worker.root,skeleton=worker.parts[0].skeleton,rigBones=skeleton.bones,bones=Object.fromEntries(rigBones.map(b=>[b.name,b]));
 const initial=new Map(rigBones.map(b=>[b,{position:b.position.clone(),quaternion:b.quaternion.clone()}])),initialHeading=root.rotation.y;
 const matrices=new Map(rigBones.map((b,i)=>[b,skeleton.boneInverses[i].clone().invert()]));
 const hips=bones.hips||bones.pelvis,spine=bones.spine||bones.breast;
 const rest=new Map(rigBones.map(b=>{const matrix=matrices.get(b).clone(),parent=matrices.get(b.parent);if(parent)matrix.premultiply(parent.clone().invert());const position=V(),quaternion=Q();matrix.decompose(position,quaternion,V());return [b,{position,quaternion}];}));
 const world=new Map(rigBones.map(b=>[b,V().setFromMatrixPosition(matrices.get(b))]));
 const tails=tailSources.map(t=>{const top=Math.max(...Array.from({length:t.position.count},(_,i)=>t.position.getX(i))),pivot=V();let count=0;for(let i=0;i<t.position.count;i++)if(t.position.getX(i)>top-.02){pivot.add(V().fromBufferAttribute(t.position,i));count++;}pivot.divideScalar(count);return {...t,pivot};});
 worker.pose('neutral');root.rotation.y=0;
 function rotation(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(Q()).invert().multiply(q));root.updateMatrixWorld(true);}
 function arm(side,target,pole){
  const a=bones['upperArm'+side],b=bones['forearm'+side],c=bones['hand'+side],ra=world.get(a),rb=world.get(b),rc=world.get(c);
  const start=a.getWorldPosition(V()),l1=ra.distanceTo(rb),l2=rb.distanceTo(rc),axis=target.clone().sub(start),d=T.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+.001,l1+l2-.001);axis.normalize();
  pole.addScaledVector(axis,-pole.dot(axis)).normalize();const along=(l1*l1-l2*l2+d*d)/(2*d),elbow=start.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
  rotation(a,Q().setFromUnitVectors(rb.clone().sub(ra).normalize(),elbow.clone().sub(start).normalize()));
  rotation(b,Q().setFromUnitVectors(rc.clone().sub(rb).normalize(),start.clone().addScaledVector(axis,d).sub(elbow).normalize()));
  rotation(c,b.getWorldQuaternion(Q()));bones['fingers'+side].rotation.z=-.15;
 }
 function authored(stable,dead){
  const mix=(a,b,c)=>a*(1-stable-dead)+b*stable+c*dead;
  root.rotation.y=0;
  for(const [b,r]of rest){b.position.copy(r.position);b.quaternion.copy(r.quaternion);}root.updateMatrixWorld(true);
  spine.rotation.z=mix(.16,.08,-.04);
  bones.head.rotation.x=mix(.35,.45,-.12);bones.head.rotation.z=mix(-.12,-.08,.10);bones.head.rotation.y=mix(.10,.05,-.28);
  if(profile.unarmed){
   for(const side of [-1,1]){bones['wing '+side].rotation.x=side*mix(.20,.12,.45);bones['wing tip '+side].rotation.z=mix(.25,.12,-.08);if(bones['thigh '+side])bones['thigh '+side].rotation.z=side===1?mix(.45,.3,.1):mix(.7,.5,.2);bones['shank '+side].rotation.z=side===1?mix(.65,.48,.12):mix(.30,.10,-.1);bones['foot '+side].rotation.z=-.20;}
  }else{
   root.updateMatrixWorld(true);
   const shoulder=world.get(bones['upperArm1']),width=Math.abs(shoulder.z),sy=shoulder.y;
   arm(1,V(mix(.15,.18,-.06),sy+mix(.12,.16,-.37),mix(.12,.12,width+.08)),V(mix(1,1,0),-.35,mix(-.1,-.1,1)));
   arm(-1,V(mix(.23,.22,-.06),sy+mix(-.20,-.34,-.40),mix(.02,.12,-width-.20)),V(mix(.8,.8,0),-.5,-1));
   for(const side of [-1,1]){
    bones['thigh'+side].rotation.z=side===1?mix(.65,.48,-.10):mix(1.0,.85,.04);
    bones['thigh'+side].rotation.x=side===1?mix(.18,.18,.20):mix(-.60,-.65,-.20);
    bones['shin'+side].rotation.z=side===1?mix(-1.12,-.95,-.10):mix(-1.35,-1.25,-.32);
    bones['hoof'+side].rotation.z=0;
   }
  }
  hips.quaternion.copy(Q().setFromAxisAngle(V(0,0,1),-Math.PI/2)).multiply(Q().setFromAxisAngle(V(0,1,0),mix(1.40,1.57,2.90)));
  hips.position.y=.25;
  root.updateMatrixWorld(true);skeleton.update();
 }
 // Surface contact corrections use only rigid bone rotations. Cache the three
 // endpoints once per rig; transitions interpolate those endpoints, not a
 // frame-dependent search. Keep the approved mesh and bind-space paint intact.
 function samples(names){
  const indices=new Set(names.map(n=>rigBones.indexOf(bones[n])).filter(i=>i>=0)),out=[];
  for(const part of worker.parts){if(/tail|apron/.test(part.name))continue;const a=part.geometry.attributes;
   for(let i=0;i<a.position.count;i++){let weight=0;for(let j=0;j<4;j++)if(indices.has(a.skinIndex.getComponent(i,j)))weight+=a.skinWeight.getComponent(i,j);if(weight>.8)out.push([part,i]);}
  }return out;
 }
 const body=samples([hips.name,spine.name]),contacts=[];
 if(profile.unarmed){for(const side of [-1,1]){contacts.push([bones['wing '+side],samples(['wing '+side,'wing tip '+side]),.55]);contacts.push([bones['thigh '+side]||bones['shank '+side],samples(['thigh '+side,'shank '+side,'foot '+side]),.7]);}}
 else for(const side of [-1,1]){contacts.push([bones['upperArm'+side],samples(['upperArm'+side,'forearm'+side,'hand'+side,'fingers'+side]),.7]);contacts.push([bones['thigh'+side],samples(['thigh'+side,'shin'+side,'hoof'+side]),.45]);}
 contacts.push([bones.head,samples(['head']),.45]);
 const point=V();
 function minimum(points){let min=Infinity;for(const [part,i]of points){part.getVertexPosition(i,point).applyMatrix4(part.matrixWorld);min=Math.min(min,point.y);}return min;}
 function settle(){
  const floor=minimum(body);
  for(const [bone,points,limit]of contacts){if(!points.length)continue;
   for(let pass=0;pass<2;pass++)for(const axis of [V(1,0,0),V(0,0,1)]){
    const initial=bone.quaternion.clone();let best=initial.clone(),score=Infinity;
    for(let n=-8;n<=8;n++){
     const angle=n/8*limit;bone.quaternion.copy(initial).multiply(Q().setFromAxisAngle(axis,angle));root.updateMatrixWorld(true);skeleton.update();
     const gap=minimum(points)-floor,loss=Math.abs(gap-.008)+(gap<-.008? -gap*4:0)+Math.abs(angle)*.003;
     if(loss<score){score=loss;best.copy(bone.quaternion);}
    }bone.quaternion.copy(best);root.updateMatrixWorld(true);skeleton.update();
   }
  }
 }
 const poses=[];
 for(const [stable,dead]of [[0,0],[1,0],[0,1]]){authored(stable,dead);settle();poses.push(new Map(rigBones.map(b=>[b,{position:b.position.clone(),quaternion:b.quaternion.clone()}])));}
 for(const [b,r]of initial){b.position.copy(r.position);b.quaternion.copy(r.quaternion);}root.rotation.y=initialHeading;root.updateMatrixWorld(true);skeleton.update();
 return {reset(){for(const t of tails){const a=t.part.geometry.attributes;a.position.copy(t.position);a.normal.copy(t.normal);a.position.needsUpdate=a.normal.needsUpdate=true;}},apply(sample){
  const down=T.MathUtils.clamp(sample.pose.down,0,1),stable=T.MathUtils.clamp((sample.pose.stable||0)/down,0,1),dead=T.MathUtils.clamp((sample.pose.dead||0)/down,0,1);
  const source=new Map(rigBones.map(b=>[b,{position:b.position.clone(),quaternion:b.quaternion.clone()}])),heading=root.rotation.y;
  // Release the equipment grasp, including the HMG replacement hand/cuff.
  worker.pose('neutral');root.rotation.y=0;
  for(const [b,from]of source){const a=poses[0].get(b),s=poses[1].get(b),d=poses[2].get(b),q=a.quaternion.clone().slerp(s.quaternion,stable/Math.max(1-dead,1e-8)).slerp(d.quaternion,dead),p=a.position.clone().multiplyScalar(1-stable-dead).addScaledVector(s.position,stable).addScaledVector(d.position,dead);b.position.lerpVectors(from.position,p,down);b.quaternion.copy(from.quaternion).slerp(q,down);}
  for(const t of tails){const a=t.part.geometry.attributes;
   for(let i=0;i<t.position.count;i++){const p=V().fromBufferAttribute(t.position,i),bend=T.MathUtils.smoothstep(p.distanceTo(t.pivot),.015,profile.id==='skunk'?.25:.10),yaw=t.part.name==='apron waist tie'?0:profile.id==='skunk'?-.50*(1-stable-dead)-.65*stable+1.65*dead:1.5*dead,q=Q().setFromAxisAngle(V(0,1,0),yaw*bend);if(profile.unarmed&&t.part.name.includes('tail'))q.multiply(Q().setFromAxisAngle(V(1,0,0),1.45*dead*bend));p.sub(t.pivot).applyQuaternion(q).add(t.pivot);if(profile.id!=='skunk')p.x+=.04*dead;const n=V().fromBufferAttribute(t.normal,i).applyQuaternion(q);p.lerpVectors(V().fromBufferAttribute(a.position,i),p,down);n.lerpVectors(V().fromBufferAttribute(a.normal,i),n,down).normalize();a.position.setXYZ(i,p.x,p.y,p.z);a.normal.setXYZ(i,n.x,n.y,n.z);}a.position.needsUpdate=a.normal.needsUpdate=true;
  }
  root.rotation.y=heading;root.updateMatrixWorld(true);skeleton.update();
 }};
}
