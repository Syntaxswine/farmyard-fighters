import * as T from './vendor/three.module.js';
import {fireState,burnState,panicFeet,smooth,clamp,FIRE_TIME} from './painted-fire-state.js';
import {createDescentTail} from './ledge-descent-tail.js';
import {createFireEquipment} from './painted-fire-equipment.js';
import {createHenFireMotion} from './painted-fire-hen.js';
import {poseRoofMantleCarry} from './roof-mantle-equipment.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion();
// Roster study on each approved skeleton. All evaluation begins at bind
// pose, including reverse seeks. No bone scaling or procedural replacement body.
export function createPaintedFireMotion(worker,profile={id:'horse'}){
 if(profile.unarmed)return createHenFireMotion(worker,profile);
 const root=worker.root,bones=Object.fromEntries(worker.bones.map(b=>[b.name,b]));
 root.position.set(0,0,0);root.rotation.set(0,0,0);worker.pose('neutral');root.updateMatrixWorld(true);
 const rest=new Map(worker.bones.map(b=>[b,b.getWorldPosition(V())])),ankle=rest.get(bones.hoof1),spine=rest.get(bones.spine),palm=V(.052,-.010,0);
 let contacts=[],feet={},state,gripError=0,drop=null,equipmentDestroyed=false;
 const equipment=createFireEquipment(worker,profile),pig=profile.id.startsWith('pig'),tail=createDescentTail(worker,profile.id==='skunk'?{id:'none'}:profile),attachments=[];
 bones.head.traverse(o=>{if(o.isMesh)attachments.push(o);});
 const collapseDrop=profile.id==='pig-foreman'?.42:profile.id==='pig-director'?.47:.50,groundHand=V(pig?.16:.25,.109,pig?-.29:-.25);
 const supportPose=worker.weapon?.carry?.handPoses?.support,leftPalm=supportPose?.palm?V(...supportPose.palm):palm,groundPalmQ=Q().setFromAxisAngle(V(0,0,1),equipment.id==='hmg'?-Math.PI/2:Math.PI/2);
 if(equipment.id==='hmg'){
  // Keep the fitted closed glove after letting go, then bear on its knuckles.
  // Replacing it with the neutral hand at release would pop both the mesh and
  // its different contact frame. Fit support to the actual glove surface.
  const glove=worker.gripHands[0],q=groundPalmQ.clone().multiply(Q().fromArray(supportPose.quaternion).invert()),a=glove.geometry.attributes.position;let low=Infinity;
  for(let i=0;i<a.count;i++)low=Math.min(low,V().fromBufferAttribute(a,i).applyQuaternion(q).y);groundHand.y=.001-low;
 }
 // Reuse the approved locomotion cuff treatment: the sole stays rigid, while
 // the pastern follows the shin so a bent ankle cannot expose an open cap.
 const savedFeet=[];
 for(const side of [-1,1]){const foot=worker.parts.find(p=>/hoof|boot|foot/.test(p.name)&&p.name.endsWith(' '+side)),a=foot.geometry.attributes; savedFeet.push({foot,index:a.skinIndex.clone(),weight:a.skinWeight.clone()});
  for(let i=0;i<a.position.count;i++){let u=clamp((a.position.getY(i)-.10)/.10);u=u*u*u*(u*(u*6-15)+10);a.skinIndex.setXYZW(i,worker.bones.indexOf(bones['hoof'+side]),worker.bones.indexOf(bones['shin'+side]),0,0);a.skinWeight.setXYZW(i,1-u,u,0,0);}a.skinIndex.needsUpdate=a.skinWeight.needsUpdate=true;
 }
 let releaseCache=null;
 function rotate(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(Q()).invert().multiply(q));root.updateMatrixWorld(true);}
 function solve(a,b,c,target,pole){
  const ra=rest.get(a),rb=rest.get(b),rc=rest.get(c),start=a.getWorldPosition(V()),l1=ra.distanceTo(rb),l2=rb.distanceTo(rc),axis=target.clone().sub(start),d=axis.length();
  if(d>l1+l2+1e-6||d<Math.abs(l1-l2)+1e-7)throw Error('Fire pose unreachable: '+a.name+' '+d.toFixed(4)+' / '+(l1+l2).toFixed(4));
  axis.normalize();const along=(l1*l1-l2*l2+d*d)/(2*d),bend=pole.clone().addScaledVector(axis,-pole.dot(axis));
  if(bend.lengthSq()<1e-8)bend.set(0,0,1).addScaledVector(axis,-axis.z);bend.normalize();
  const mid=start.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
  rotate(a,Q().setFromUnitVectors(rb.clone().sub(ra).normalize(),mid.clone().sub(start).normalize()));
  rotate(b,Q().setFromUnitVectors(rc.clone().sub(rb).normalize(),target.clone().sub(mid).normalize()));
 }
 function reset(grasp=false){root.position.set(0,0,0);root.rotation.set(0,0,0);root.visible=true;worker.pose(grasp?'carry':'neutral');equipment.reset();tail.set(0);for(const p of [...worker.parts,...attachments])p.visible=true;contacts=[];gripError=0;drop=null;equipmentDestroyed=false;}
 function legs(targets){for(const side of [-1,1]){const f=targets[side];solve(bones['thigh'+side],bones['shin'+side],bones['hoof'+side],V(f.x,ankle.y+f.y,f.z),V(1,0,0));rotate(bones['hoof'+side],Q());}feet=targets;}
 function hand(side,target,q,contactPalm=palm,pole=V(-.12,-1,side*.55),curl=-.9){solve(bones['upperArm'+side],bones['forearm'+side],bones['hand'+side],target.clone().sub(contactPalm.clone().applyQuaternion(q)),pole);rotate(bones['hand'+side],q);bones['fingers'+side].rotation.z=curl;}
 function gripPose(anchor){const gun=worker.weapon,pose=gun.carry?.handPoses?.[anchor],torso=bones.spine.getWorldQuaternion(Q()),axis=V(1,0,0).applyQuaternion(gun.root.quaternion).applyQuaternion(torso.clone().invert());return {q:pose?.quaternion?gun.root.quaternion.clone().multiply(Q().fromArray(pose.quaternion)):torso.multiply(Q().setFromUnitVectors(V(0,-1,0),axis)),palm:pose?.palm?V(...pose.palm):palm,pole:pose?.elbowPole?V(...pose.elbowPole):null,curl:pose?.fingerCurl??-.9};}
 function grip(side,anchor){const g=gripPose(anchor);hand(side,worker.weapon.anchors[anchor].getWorldPosition(V()),g.q,g.palm,g.pole||V(-.12,-1,side*.55),g.curl);contacts.push({side,anchor,palm:g.palm});}
 function gunAt(position,axis){const gun=worker.weapon,q=bones.spine.getWorldQuaternion(Q()),p=bones.spine.getWorldPosition(V());gun.root.visible=true;gun.root.position.copy(position.clone().sub(spine).applyQuaternion(q).add(p));gun.root.quaternion.copy(q).multiply(Q().setFromUnitVectors(V(1,0,0),axis.normalize()));root.updateMatrixWorld(true);}
 function finish(position,heading){root.position.copy(position);root.rotation.y=-heading;root.updateMatrixWorld(true);worker.skeleton.update();
  for(const glove of worker.gripHands||[])if(glove.visible)for(const cuff of glove.children)if(cuff.update)cuff.update();
  for(const c of contacts){const a=worker.weapon.anchors[c.anchor].getWorldPosition(V()),b=bones['hand'+c.side].localToWorld((c.palm||palm).clone());gripError=Math.max(gripError,a.distanceTo(b));}
 }
 function burnTrunk(s){
  const enter=smooth(s.local/.14),c=s.collapse,stride=smooth(s.run/.08)*(1-smooth((s.run-.88)/.12)),panic=enter*(1-c),beat=s.local*18;
  const startle=smooth(s.local/.07)*(1-smooth((s.local-.10)/.18));
  const compression=.07*enter+(.065+.025*Math.sin(beat)**2)*stride+collapseDrop*c;
  bones.hips.position.copy(rest.get(bones.hips));bones.hips.position.y-=compression;bones.hips.position.x+=.055*c;
  bones.hips.position.z=.028*Math.sin(beat)*stride;
  bones.spine.rotation.set(.13*Math.sin(beat*.53)*panic,.14*Math.sin(beat*.61)*stride,.20*startle-.12*enter-.18*stride-(pig?1.55:1.33)*c);
  bones.head.rotation.set(.055*Math.sin(beat*.71)*panic,.17*Math.sin(beat*.47)*panic,(.24+.075*Math.sin(beat*.79))*panic+.08*c);
  tail.set(.72*c);root.updateMatrixWorld(true);
 }
 function burnGun(s){
  if(!equipment.held)return;
  const u=smooth(s.local/.25),panic=u*(1-s.collapse),jolt=Math.sin(s.local*13.5)*panic;
  if(equipment.id==='rifle'&&!pig)gunAt(V(.17,.99,.075).lerp(V(.17,.94+.025*jolt,.29+.025*panic),u),V(.766,-.17,-.643).lerp(V(.94,-.33-.14*panic+.10*jolt,-.03+.065*Math.sin(s.local*10)*panic),u));
  else {const carry=worker.weapon.carry||worker.rifle.carry,position=V(...carry.position),axis=V(...carry.axis);if(equipment.id==='rpg'&&pig)position.set(.18,1.245,.125);position.y+=.02*jolt;gunAt(position,axis);}
  equipment.sync();
 }
 // Protect the face, sweep across the collar, then fling down and away. Unequal
 // pauses and a falling final reach read as distress, not a repeated fist pump.
 const handKeys=[
  [0,.19,.02,-.22,.5],[.09,.18,.05,-.23,.8],[.24,.13,.29,-.22,1.7],
  [.45,.28,-.07,.01,.35],[.66,.28,-.16,-.26,-.35],[.90,.12,.27,-.20,1.6],
  [1.08,.26,-.10,.02,.3],[1.30,.27,-.17,-.25,-.4],[1.48,.15,.25,-.16,1.5],
  [1.67,.28,-.05,-.09,.35],[1.88,.23,-.20,-.25,-.3]
 ];
 function panicHand(local){let i=1;while(i<handKeys.length-1&&local>handKeys[i][0])i++;const a=handKeys[i-1],b=handKeys[i],u=smooth((local-a[0])/(b[0]-a[0]));return {offset:V(...a.slice(1,4)).lerp(V(...b.slice(1,4)),u),roll:a[4]+(b[4]-a[4])*u};}
 return {
  worker,bones,
  fire(time,{position=V(),heading=0}={}){
   if(equipment.id!=='flamethrower')throw Error('Fire emission requires the flamethrower loadout');
   reset();state=fireState(time);const b=state.brace;
   bones.hips.position.y-=.045*b;bones.hips.position.x-=.018*b;bones.spine.rotation.z=-.055*b;root.updateMatrixWorld(true);
   legs(Object.fromEntries([-1,1].map(s=>[s,{x:ankle.x,y:0,z:s*Math.abs(ankle.z),planted:true}])));
   const axis=pig?V(.20,-.10+.15*b,-.98):V(.766,-.17+.225*b,-.643);gunAt(pig?V(.32,spine.y+.02,.04):V(.17,spine.y-.09,.075),axis);grip(1,'grip');grip(-1,'support');
   equipment.sync();finish(position,heading-Math.atan2(axis.z,axis.x));
   return this.diagnostics();
  },
  burn(time,route,{terminal=true,tankRupture=false}={}){
   if(tankRupture&&equipment.id!=='flamethrower')throw Error('Tank destruction requires a flamethrower');
   // Turning footholds need their own fitting pass; do not silently rotate a
   // planted hoof at a route corner. This first proof accepts straight paths.
   for(let i=2;i<route.points.length;i++){const a=route.points[i-2],b=route.points[i-1],c=route.points[i];if(Math.abs(Math.atan2(c.z-b.z,c.x-b.x)-Math.atan2(b.z-a.z,b.x-a.x))>1e-6)throw Error('Horse fire study requires a straight legal route');}
   state=burnState(time,route,{terminal});reset(equipment.id==='hmg');equipmentDestroyed=tankRupture&&time>=FIRE_TIME.hit;const f=panicFeet(state,route,{restX:ankle.x,restZ:Math.abs(ankle.z)}),c=state.collapse;
   const releaseTime=FIRE_TIME.hit+state.runEnd+.31,release=burnState(releaseTime,route);let released;
   if(terminal&&equipment.held&&!equipmentDestroyed&&time>=releaseTime){if(releaseCache?.time!==releaseTime){burnTrunk(release);burnGun(release);grip(1,'grip');const snapshot=equipment.capture(),g=gripPose('grip');snapshot.palm=g.palm.clone();snapshot.pole=(g.pole||V(-.12,-1,.55)).clone();snapshot.hand=bones.spine.worldToLocal(bones.hand1.localToWorld(g.palm.clone()));snapshot.handQ=bones.spine.getWorldQuaternion(Q()).invert().multiply(bones.hand1.getWorldQuaternion(Q()));releaseCache={time:releaseTime,snapshot};contacts=[];}released=releaseCache.snapshot;}
   burnTrunk(state);
   // The final footholds already sit at the destination; collapse keeps them.
   legs(f);
   burnGun(state);if(equipment.held&&!released&&!equipmentDestroyed)grip(1,'grip');
   const enter=equipment.heavy&&!equipmentDestroyed?smooth(c/.45):smooth(state.local/.18),sh=bones['upperArm-1'].getWorldPosition(V()),idle=worker.weapon?.anchors.support?.getWorldPosition(V())||rest.get(bones['hand-1']).clone().add(palm);
   const gesture=panicHand(state.local),openPalm=Q().setFromEuler(new T.Euler(.12,.75,gesture.roll));
   const flail=sh.clone().add(gesture.offset),freeOffset=palm.clone().applyQuaternion(openPalm),freeDelta=flail.clone().sub(freeOffset).sub(sh),length=freeDelta.length();
   // A soft reach envelope leaves the elbow bent; never snap into full
   // extension. Apply it before the separately fitted ground-support blend.
   if(length>.36)flail.copy(sh).add(freeDelta.multiplyScalar((.36+.10*(1-Math.exp(-(length-.36)/.10)))/length)).add(freeOffset);
   const target=idle.lerp(flail.lerp(groundHand,c),enter);
   openPalm.slerp(groundPalmQ,c);
   const palmQ=(worker.weapon?.anchors.support?gripPose('support').q:Q()).slerp(openPalm,enter);
   const palmOffset=leftPalm.clone().applyQuaternion(palmQ),delta=target.clone().sub(palmOffset).sub(sh),reach=.5039;
   if(enter>0&&delta.length()>reach)target.copy(sh).add(delta.setLength(reach)).add(palmOffset);
   if(enter===0&&worker.weapon?.anchors.support)grip(-1,'support');else{const pole=supportPose?.elbowPole?V(...supportPose.elbowPole).lerp(V(-.12,-1,-.55),enter):V(-.12,-1,-.55);hand(-1,target,palmQ,leftPalm,pole);const curl=worker.weapon?.anchors.support?gripPose('support').curl:-.9;bones['fingers-1'].rotation.z=curl+(.22*(1-c)-.18*c-curl)*enter;}
   if(!equipment.held||equipmentDestroyed){
    const sh=bones.upperArm1.getWorldPosition(V()),g=panicHand(state.local+.12),u=smooth(state.local/.18),to=sh.clone().add(V(g.offset.x,g.offset.y,g.offset.z*-1)).lerp(sh.clone().add(V(.13,-.30,.10)),c),from=equipmentDestroyed?worker.weapon.anchors.grip.getWorldPosition(V()):rest.get(bones.hand1).clone().add(palm),freeQ=Q().setFromEuler(new T.Euler(-.12,-.75,g.roll*u)),q=equipmentDestroyed?gripPose('grip').q.slerp(freeQ,u):freeQ;
    hand(1,from.lerp(to,u),q);bones.fingers1.rotation.z=equipmentDestroyed?-.9+(1.05*u):.15;
   }
   if(released){const age=time-releaseTime;
    const handFrom=bones.spine.localToWorld(released.hand.clone()),handRotation=bones.spine.getWorldQuaternion(Q()).multiply(released.handQ);
    drop=equipment.fall(released,age);
    const a=bones.upperArm1.getWorldPosition(V()),loosen=smooth(age/.18);hand(1,handFrom.lerp(a.clone().add(V(.15,-.31,.05)),loosen),handRotation.slerp(Q(),loosen),released.palm,released.pole.clone().lerp(V(-.12,-1,.55),loosen));bones.fingers1.rotation.z=-.1;contacts=[];
   }
   if(equipmentDestroyed){for(const object of [worker.weapon.root,worker.weapon.mount,worker.weapon.hose])if(object)object.visible=false;contacts=[];}
   finish(V(state.point.x,state.point.y,state.point.z),state.point.heading);
   for(const part of [...worker.parts,...attachments,...(worker.gripHands||[])])if(!state.bodyVisible)part.visible=false;
   return this.diagnostics();
  },
  diagnostics(){root.updateMatrixWorld(true);worker.skeleton.update();const gun=worker.weapon,muzzle=gun?.anchors.muzzle?.getWorldPosition(V());return {state,gripError,animal:profile.id,unarmed:!equipment.held||equipmentDestroyed,equipmentDestroyed,feet:Object.fromEntries([-1,1].map(s=>[s,{...feet[s],ankle:bones['hoof'+s].getWorldPosition(V()).toArray()}])),hands:contacts.map(c=>({side:c.side,anchor:c.anchor,point:gun.anchors[c.anchor].getWorldPosition(V()).toArray()})),muzzle:muzzle?.toArray(),direction:gun?V(1,0,0).transformDirection(gun.root.matrixWorld).toArray():null,drop};},
  restore(){reset();for(const p of worker.parts)p.visible=true;poseRoofMantleCarry(worker,profile);equipment.sync();worker.skeleton.update();},
  dispose(){this.restore();tail.restore();equipment.restore();for(const s of savedFeet){s.foot.geometry.attributes.skinIndex.copy(s.index);s.foot.geometry.attributes.skinWeight.copy(s.weight);s.foot.geometry.attributes.skinIndex.needsUpdate=s.foot.geometry.attributes.skinWeight.needsUpdate=true;}}
 };
}
