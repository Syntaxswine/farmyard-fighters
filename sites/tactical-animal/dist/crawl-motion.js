// Adapted from dist/tactics/crawl-motion.js at AFT3D aa61ffa11c36c21aaa53b7ee48a4f24e4ccc5d4b.
import * as T from './aft/tactics/vendor/three.module.js';
import {snapshot,restore,solveLimb,rotateWorld} from './aft/tactics/idle-rig-math.js';
import {createCrawlEquipment} from './crawl-equipment.js';
import {crawlContact,validateCrawlSample} from './aft/tactics/crawl-state.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion();
export function createCrawlMotion(worker,profile,posture,primarySide){
 const original=snapshot(worker.bones),rootState={p:worker.root.position.clone(),q:worker.root.quaternion.clone(),s:worker.root.scale.clone()},loadoutState=[worker.weapon.root,worker.weapon.mount,worker.weapon.hose,...(worker.gripHands||[])].filter(Boolean).map(o=>({o,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone(),visible:o.visible})),surfaces=worker.parts.map(mesh=>({mesh,index:mesh.geometry.index,attributes:Object.fromEntries(['position','normal','skinIndex','skinWeight'].map(n=>[n,{original:mesh.geometry.attributes[n],copy:mesh.geometry.attributes[n].clone()}]))}));
 worker.pose('neutral');worker.root.position.set(0,0,0);worker.root.quaternion.identity();const bind=snapshot(worker.bones),rest=new Map(worker.bones.map(b=>[b,b.getWorldPosition(V())])),bones=Object.fromEntries(worker.bones.map(b=>[b.name,b]));
 const equipment=createCrawlEquipment(worker,profile,primarySide);
 const carry=equipment.carry,carrying=side=>side===primarySide?equipment:null;
 const {footLift,sway}=carry,freeHandQ=Q().setFromUnitVectors(V(0,-1,0),V(1,0,0));
 // Extend the relaxed feet behind the prone body instead of keeping a standing ankle angle.
 const pig=profile.id.startsWith('pig-'),arms=[-1,1].map(side=>({side,a:bones['upperArm'+side],b:bones['forearm'+side],c:bones['hand'+side]})),legs=[-1,1].map(side=>({side,a:bones['thigh'+side],b:bones['shin'+side],c:bones['hoof'+side]})),length=l=>rest.get(l.a).distanceTo(rest.get(l.b))+rest.get(l.b).distanceTo(rest.get(l.c)),stride=Math.min(pig?.30:.36,...legs.map(l=>length(l)*.54))*carry.stride,front=-.06+(rest.get(bones.upperArm1).y-rest.get(bones.hips).y),footQ=Q().setFromUnitVectors(V(0,-1,0),V(-1,0,0));
 const feet=legs.map(l=>{let minimum=Infinity;const index=worker.bones.indexOf(l.c),inverse=l.c.matrixWorld.clone().invert();for(const mesh of worker.parts){const a=mesh.geometry.attributes;for(let i=0;i<a.position.count;i++){let weight=0;for(let k=0;k<4;k++)if(a.skinIndex.getComponent(i,k)===index)weight+=a.skinWeight.getComponent(i,k);if(weight>.8)minimum=Math.min(minimum,V().fromBufferAttribute(a.position,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse).applyQuaternion(footQ).y);}}return {...l,height:.006-minimum,width:Math.abs(rest.get(l.c).z),bias:-length(l)*(pig?.59:.70)};});
 // The upper boot/hoof must follow the same ankle blend as its trouser cuff;
 // rotating the whole closed foot rigidly exposes its circular top cap.
 if(!profile.proneAim?.pastern)for(const mesh of worker.parts.filter(m=>/hoof|boot|foot/.test(m.name))){const a=mesh.geometry.attributes;for(let i=0;i<a.position.count;i++){const side=a.position.getZ(i)<0?-1:1,leg=legs.find(l=>l.side===side),ankle=rest.get(leg.c).y,w=T.MathUtils.smoothstep(a.position.getY(i),ankle+.05,ankle+.15);a.skinIndex.setXYZW(i,worker.bones.indexOf(leg.c),worker.bones.indexOf(leg.b),0,0);a.skinWeight.setXYZW(i,1-w,w,0,0);}a.skinIndex.needsUpdate=a.skinWeight.needsUpdate=true;}
 const armPoints=[];for(const mesh of worker.parts){const a=mesh.geometry.attributes;for(let i=0;i<a.position.count;i++){let weight=0;for(let k=0;k<4;k++)if(arms.some(l=>worker.bones[a.skinIndex.getComponent(i,k)]===l.b))weight+=a.skinWeight.getComponent(i,k);if(weight>.8)armPoints.push([mesh,i]);}}
 const torsoPoints=[];if(pig)for(const mesh of worker.parts){const a=mesh.geometry.attributes;for(let i=0;i<a.position.count;i++){let weight=0;for(let k=0;k<4;k++)if([bones.hips,bones.spine].includes(worker.bones[a.skinIndex.getComponent(i,k)]))weight+=a.skinWeight.getComponent(i,k);if(weight>.8)torsoPoints.push([mesh,i]);}}
 let elbowHeight=.085,bodyLift=0,active=true,disposed=false,lowTail;
 function raw(distance,{blend=1,heading=0,position=V()}={}){
  worker.root.position.set(0,0,0);worker.root.quaternion.identity();worker.pose('neutral');posture.apply({heading:0,distance:0,blend:0,pose:{prone:1}});restore(bind);
  if(profile.id==='skunk'){
   // Lay the plume behind the hips. Cache this fit once; its painted rest-space
   // coordinates remain unchanged, and teardown restores the source surface.
   lowTail ||= worker.parts.filter(m=>m.name.includes('tail')).map(mesh=>{const a=mesh.geometry.attributes,position=a.position.clone(),normal=a.normal.clone(),top=Math.max(...Array.from({length:position.count},(_,i)=>position.getX(i))),pivot=V();let count=0;for(let i=0;i<position.count;i++)if(position.getX(i)>top-.025){pivot.add(V().fromBufferAttribute(position,i));count++;}pivot.divideScalar(count);for(let i=0;i<position.count;i++){const p=V().fromBufferAttribute(position,i),q=Q().setFromAxisAngle(V(0,0,1),1.30*T.MathUtils.smoothstep(p.distanceTo(pivot),.06,.25)),n=V().fromBufferAttribute(normal,i).applyQuaternion(q);p.sub(pivot).applyQuaternion(q).add(pivot);position.setXYZ(i,p.x,p.y,p.z);normal.setXYZ(i,n.x,n.y,n.z);}return {mesh,position,normal};});
   for(const {mesh,position,normal}of lowTail){mesh.geometry.attributes.position.copy(position);mesh.geometry.attributes.normal.copy(normal);mesh.geometry.attributes.position.needsUpdate=mesh.geometry.attributes.normal.needsUpdate=true;}
  }
  const phase=((distance/stride%1)+1)%1,shift=Math.sin(phase*Math.PI*2)*blend*sway;bones.hips.position.set(-.06,0,.015*shift);bones.hips.quaternion.copy(Q().setFromAxisAngle(V(0,0,1),-1.52)).multiply(Q().setFromAxisAngle(V(0,1,0),.035*shift));bones.spine.rotation.z=.035;bones.head.rotation.z=1.24;bones.head.rotation.y=.06*shift;worker.root.updateMatrixWorld(true);
  const armStates=arms.map(l=>{const item=carrying(l.side),contact=crawlContact(distance,stride,l.side===1?0:.5,{lift:item?.carry.lift??.045}),elbow=V(front+contact.x,elbowHeight+contact.lift*blend,l.side*(Math.abs(rest.get(l.a).z)+.075)),lower=rest.get(l.b).distanceTo(rest.get(l.c)),height=item?.armed?Math.max(pig?.065:elbow.y+.008,item.wristHeight):pig?.065:elbow.y+.008,dy=Math.min(lower*.75,height-elbow.y),dz=0,wrist=elbow.clone().add(V(pig?.15:Math.sqrt(lower*lower-dy*dy-dz*dz),dy,dz));return {...l,contact,elbow,wrist};}),primary=armStates.find(l=>l.side===(phase<.5?1:-1)),S=primary.a.getWorldPosition(V()),upper=rest.get(primary.a).distanceTo(rest.get(primary.b)),dx=S.x-primary.elbow.x,dz=S.z-primary.elbow.z,vertical=upper*upper-dx*dx-dz*dz;
  if(vertical<=0)throw Error('Crawl forearm outside native shoulder reach: '+profile.id);bones.hips.position.y=pig?.27+bodyLift:primary.elbow.y+Math.sqrt(vertical)-S.y;worker.root.updateMatrixWorld(true);
  for(const l of armStates){const item=carrying(l.side),rotation=item?.handQ||freeHandQ;solveLimb(l.a,l.b,l.c,l.wrist,rotation,l.elbow.clone().sub(l.a.getWorldPosition(V())));if(l===primary&&!pig)rotateWorld(l.b,Q().setFromUnitVectors(rest.get(l.c).clone().sub(rest.get(l.b)).normalize(),l.wrist.clone().sub(l.elbow).normalize()));rotateWorld(l.c,rotation);bones['fingers'+l.side].rotation.z=item?.armed?item.carry.curl:-.10;}
  for(const l of feet){
   const contact=crawlContact(distance,stride,l.side===-1?0:.5,{lift:footLift});
   const target=V(l.bias+contact.x,l.height+contact.lift*blend,l.side*l.width);
   solveLimb(l.a,l.b,l.c,target,footQ,V(-.10,-.42,l.side));
  }
  const hand=bones['hand'+primarySide];
  equipment.place(hand);worker.root.rotation.y=-heading*Math.PI/180;worker.root.position.copy(position).add(V(distance,0,0).applyAxisAngle(V(0,1,0),-heading*Math.PI/180));worker.root.updateMatrixWorld(true);worker.skeleton.update();equipment.sync();
  return {carry:carry.label,stride,phase,primary:primary.side};
 }
 function suspend(){
  if(!active)return;
  active=false;
  worker.pose('neutral');
  equipment.suspend();
  for(const {mesh,index,attributes} of surfaces){
   mesh.geometry.setIndex(index);
   for(const [name,{original,copy}] of Object.entries(attributes)){
    original.array.set(copy.array);original.needsUpdate=true;mesh.geometry.setAttribute(name,original);
   }
  }
  restore(original);
  worker.root.position.copy(rootState.p);worker.root.quaternion.copy(rootState.q);worker.root.scale.copy(rootState.s);
  for(const {o,p,q,s,visible} of loadoutState){o.position.copy(p);o.quaternion.copy(q);o.scale.copy(s);o.visible=visible;}
  worker.root.updateMatrixWorld(true);worker.skeleton.update();
  for(const hand of worker.gripHands||[])if(hand.visible)for(const cuff of hand.children)cuff.update?.();
 }
 function dispose(){
  if(disposed)return;
  disposed=true;
  suspend();equipment.dispose();
 }
 // Fit the native surface once and retain the crawl weights across pose changes.
 try{
  for(let pass=0;pass<3;pass++){let minimum=Infinity;for(let i=0;i<8;i++){raw(stride*i/8);for(const [mesh,index]of pig?torsoPoints:armPoints)minimum=Math.min(minimum,mesh.getVertexPosition(index,V()).applyMatrix4(mesh.matrixWorld).y);}if(pig)bodyLift+=.008-minimum;else elbowHeight+=.006-minimum;}
  raw(0,{blend:0});
 }catch(error){dispose();throw error;}
 const crawlWeights=[];
 for(const {mesh,attributes} of surfaces)for(const name of ['skinIndex','skinWeight']){
  const attribute=mesh.geometry.attributes[name],base=attributes[name].copy.array;
  if(attribute.array.some((value,index)=>value!==base[index]))crawlWeights.push({attribute,values:attribute.array.slice()});
 }
 return {suspend,dispose,at(distance,options){
  if(disposed)throw Error('Crawl motion disposed');
  validateCrawlSample(distance,options);
  if(!active){
   active=true;equipment.resume();
   for(const {attribute,values} of crawlWeights){attribute.array.set(values);attribute.needsUpdate=true;}
  }
  return raw(distance,options);
 }};
}
