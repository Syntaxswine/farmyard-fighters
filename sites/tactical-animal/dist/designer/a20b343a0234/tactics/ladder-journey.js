import {createHenLadderJourney} from './hen-ladder-journey.js';
import {createTowerTailTuck} from './tower-tail-tuck.js';
import * as T from './vendor/three.module.js';
import {createLadderMotion,LADDER_PRESETS} from './ladder-motion.js';
import {towerCenter,WOODEN_LADDER,IRON_LADDER_EXIT} from './tower-geometry.js';
import {toWorld} from './hybrid-world.js';
const V=a=>new T.Vector3(...a),ease=t=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
const travel=t=>{t=T.MathUtils.clamp(t,0,1);const a=.12;return t<a?t*t/(2*a*(1-a)):t>1-a?1-(1-t)**2/(2*a*(1-a)):(t-a/2)/(1-a);};
const turn=(a,b,t)=>a+((b-a+540)%360-180)*t;
// Presentation route only. The core has already committed its exact destination.
export function ladderWalkRoute(event,endpoint,upper){
 const point=V(toWorld(upper?(event.direction==='up'?event.to:event.from):(event.direction==='up'?event.from:event.to)));
 if(!upper)return [point,V(endpoint)];
 const c=towerCenter(event.tower),rotation=event.tower.rotated;
 const local=(x,z)=>V([c.x+(rotation?-z:x),endpoint[1],c.y+(rotation?x:z)]);
 const dx=point.x-c.x,dz=point.z-c.y,slotX=rotation?dz:dx;
 // Enter the door in line, then use the central aisle. Never cut through the
 // other three occupied lookout slots on the way to the assigned one.
 if(event.tower.kind==='wooden-spotlight-tower')return [V(endpoint),local(0,.60),local(0,0),local(slotX,0),point];
 return [V(endpoint),local(-.65,-.8),local(-.65,0),local(slotX,0),point];
}
export function createLadderJourney(worker,profile,event,frame,heading=0,options={}){
 if(!event||!['up','down'].includes(event.direction)||!['iron-searchlight-ladder-tower','wooden-spotlight-tower'].includes(event.tower?.kind)||!Number.isFinite(heading)||!Number.isFinite(frame?.heading)||!Array.isArray(frame?.origin)||frame.origin.length!==3||!frame.origin.every(Number.isFinite)||![event.from,event.to].every(p=>p&&toWorld(p).every(Number.isFinite)))throw Error('Invalid ladder journey route');
 if(profile.id==='hen')return createHenLadderJourney(worker,structuredClone(event),{heading:frame.heading,origin:[...frame.origin]},heading,ladderWalkRoute);
 event=structuredClone(event);frame={heading:frame.heading,origin:[...frame.origin]};
 const root=worker.root,entryTransform={position:root.position.clone(),quaternion:root.quaternion.clone()};let climb,restoreTail=()=>{};
 const restoreTransform=()=>{root.position.copy(entryTransform.position);root.quaternion.copy(entryTransform.quaternion);root.updateMatrixWorld(true);worker.skeleton.update();};
 try{
 const wooden=event.tower.kind==='wooden-spotlight-tower';
 climb=createLadderMotion(worker,profile,{...LADDER_PRESETS.tower,landingHandHeight:1.10,landingHandSpan:.20,...(wooden?{width:WOODEN_LADDER.width,exitWidth:WOODEN_LADDER.exitWidth,railTop:WOODEN_LADDER.railTop,railThickness:.085,railDepth:.10,rungThickness:.062,rungDepth:.082,hatch:{front:WOODEN_LADDER.z+.35-1.25,back:WOODEN_LADDER.z+.35-2.25,half:.5}}:{exitWidth:IRON_LADDER_EXIT.width})},options);
 climb.restore('neutral');root.position.set(0,0,0);root.rotation.set(0,0,0);root.updateMatrixWorld(true);
 const named=Object.fromEntries(worker.bones.map(b=>[b.name,b])),rest=new Map(worker.bones.map(b=>[b,b.getWorldPosition(new T.Vector3())]));
 const tailTuck=createTowerTailTuck(worker,profile);let tailAmount=0,tailAngle=profile.id.startsWith('pig')?0:profile.id==='skunk'?-.50:.22;function tuckTail(amount,angle=profile.id.startsWith('pig')?0:profile.id==='skunk'?-.50:.22){tailAmount=amount;tailAngle=angle;tailTuck.apply(amount,{angle});}
 restoreTail=()=>tuckTail(0);
 function applyClimb(progress,direction){const r=climb.apply(progress,{...frame,direction}),h=climb.definition.height;
  const clear=T.MathUtils.smoothstep(r.root[0],.12,.50),bend=profile.id==='skunk'?T.MathUtils.lerp(-.90-.15*T.MathUtils.smoothstep(r.root[1],h-1.1,h-.6)+.035*T.MathUtils.smoothstep(r.root[0],.05,.12)*(1-T.MathUtils.smoothstep(r.root[1],h-1.15,h-.95)),-.50,clear):T.MathUtils.lerp(.40,.22,clear);
  tuckTail(wooden?T.MathUtils.smoothstep(r.root[1],h-2.8,h-2.2):0,profile.id.startsWith('pig')?(wooden?1.8*(1-clear):0):wooden?bend:undefined);return r;
 }
 const capture=()=>({tailAmount,tailAngle,position:root.position.clone(),quaternion:root.quaternion.clone(),bones:worker.bones.map(b=>({position:b.position.clone(),quaternion:b.quaternion.clone(),world:b.getWorldPosition(new T.Vector3())})),feet:[-1,1].map(side=>({point:named['hoof'+side].getWorldPosition(new T.Vector3()),quaternion:named['hoof'+side].getWorldQuaternion(new T.Quaternion())})),gun:{position:worker.weapon.root.position.clone(),quaternion:worker.weapon.root.quaternion.clone()}});
 applyClimb(0,'up');const bottom=capture();applyClimb(1,'up');const top=capture();climb.restore('carry');
 const neutralAnchor=pose=>{const p=pose.position.clone();p.y=pose===top?frame.origin[1]+climb.definition.height:frame.origin[1];return p.toArray();};
 const groundAnchor=neutralAnchor(bottom);if(profile.id.startsWith('pig')){const offset=new T.Vector3(-.32,0,0).applyAxisAngle(new T.Vector3(0,1,0),-frame.heading*Math.PI/180);groundAnchor[0]+=offset.x;groundAnchor[2]+=offset.z;}
 const low=ladderWalkRoute(event,groundAnchor,false),high=ladderWalkRoute(event,neutralAnchor(top),true);
 // Stop at the door/aisle corners and turn with two short planted steps.
 // Each walking segment begins and ends in the ordinary carry stance.
 function groundRoute(points,startYaw,endYaw,{fixedYaw,firstFacing=false,lastFacing=false}={}){const clips=[];let yaw=startYaw,clock=0;
  const add=(kind,seconds,data)=>{clips.push({kind,start:clock,end:clock+seconds,...data});clock+=seconds;};
  const rotate=(point,target)=>{const delta=turn(yaw,target,1)-yaw,n=Math.ceil(Math.abs(delta)/90);for(let i=0;i<n;i++){const next=yaw+delta/n;add('turn',Math.max(.20,Math.abs(delta/n)/280),{a:point,b:point,fromYaw:yaw,toYaw:next});yaw=next;}};
  for(let i=1;i<points.length;i++){const from=points[i-1],to=points[i],distance=from.distanceTo(to);if(distance<1e-5)continue;const target=fixedYaw??(firstFacing&&i===1?startYaw:lastFacing&&i===points.length-1?endYaw:Math.atan2(to.z-from.z,to.x-from.x)*180/Math.PI);rotate(from,target);add('walk',Math.max(.35,distance/(fixedYaw===undefined?1.55:1.2)),{a:from,b:to,fromYaw:yaw,toYaw:yaw,length:distance,steps:Math.max(2,Math.ceil(distance/(fixedYaw===undefined?.22:.15)/2)*2)});}
  rotate(points.at(-1),endYaw);return {clips,duration:clock};
 }
 const up=event.direction==='up',landing=high[0],inside=high[2],handoff=.65,settle=.35;
 let disposed=false,result,clock=0;const phases=[];
 function add(label,seconds,apply){phases.push({label,start:clock,end:clock+seconds,apply});clock+=seconds;}
 function addWalk(label,points,startYaw,endYaw,options={},stowed=false){const route=groundRoute(points,startYaw,endYaw,options);add(label,route.duration,t=>walk(route,t,stowed));}
 function standing(point,yaw,stowed=false){
  climb.restore(stowed?'neutral':'carry');worker.pose(stowed?'neutral':'carry');tuckTail(point.y>frame.origin[1]+climb.definition.height/2?1:0);root.rotation.y=-yaw*Math.PI/180;root.position.copy(point);
  if(stowed){
   for(const side of [-1,1]){named['upperArm'+side].rotation.x=side*.30;named['forearm'+side].rotation.z=.20;}
   climb.stow();
  }
  root.updateMatrixWorld(true);worker.skeleton.update();
  if(stowed){
   climb.transition(1);
  }
 }
 standing(inside,frame.heading,true);const parked=capture();climb.restore('carry');
 if(up){
  addWalk('Approach',low,heading,frame.heading);
  add('Stow and mount',handoff,t=>handoffPose(bottom,t/handoff,low.at(-1)));
  add('Climb',6,t=>{contacts=applyClimb(t/6,'up').contacts;});
  add('Settle on landing',settle,t=>handoffPose(top,1-t/settle,landing,true));
  addWalk(wooden?'Clear hatch with weapon slung':'Clear doorway with weapon slung',high.slice(0,3),frame.heading,frame.heading,{fixedYaw:frame.heading},true);
  add('Recover weapon inside',handoff,t=>handoffPose(parked,1-t/handoff,inside));
  addWalk('Walk to destination',high.slice(2),frame.heading,heading,{lastFacing:true});
 }else{
  addWalk('Approach',high.slice(2).reverse(),heading,frame.heading,{firstFacing:true});
  add('Stow weapon inside',handoff,t=>handoffPose(parked,t/handoff,inside));
  addWalk(wooden?'Clear hatch with weapon slung':'Clear doorway with weapon slung',high.slice(0,3).reverse(),frame.heading,frame.heading,{fixedYaw:frame.heading},true);
  add('Settle at top rung',settle,t=>handoffPose(top,t/settle,landing,true));
  add('Climb',6,t=>{contacts=applyClimb(t/6,'down').contacts;});
  add('Recover weapon on ground',handoff,t=>handoffPose(bottom,1-t/handoff,low.at(-1)));
  addWalk('Walk to destination',[...low].reverse(),frame.heading,heading,{fixedYaw:frame.heading});
 }
 const duration=clock;
 const footRest=[-1,1].map(side=>rest.get(named['hoof'+side]).clone());let contacts=[];
 const yawQ=yaw=>new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-yaw*Math.PI/180);
 function walk(route,t,stowed=false){
  const clip=route.clips.find(c=>t<=c.end)||route.clips.at(-1);
  if(!clip){standing(V(toWorld(event.from)),heading,stowed);return;}
  const u=(clip.kind==='walk'?travel:ease)((t-clip.start)/(clip.end-clip.start)),q0=yawQ(clip.fromYaw),q1=yawQ(clip.toYaw),yaw=turn(clip.fromYaw,clip.toYaw,u),point=clip.a.clone().lerp(clip.b,u),drop=.09*Math.min(ease(u/.18),ease((1-u)/.18));
  standing(point,yaw,stowed);root.position.y-=drop;root.updateMatrixWorld(true);
  for(const [i,side]of [-1,1].entries()){
   let target,footQ,planted;
   if(clip.kind==='turn'){
    const step=ease((u-i*.5)*2);target=footRest[i].clone().applyQuaternion(q0).add(clip.a).lerp(footRest[i].clone().applyQuaternion(q1).add(clip.b),step);target.y+=.055*Math.sin(Math.PI*step)**2;footQ=q0.clone().slerp(q1,step);planted=step===0||step===1;
   }else{
    const clock=u*clip.steps,active=Math.min(clip.steps-1,Math.floor(clock)),step=active%2===i?active:active-1,phase=active%2===i?clock-active:1;
    const from=(step<=1?0:step-1)/clip.steps,to=(step>=clip.steps-2?clip.steps:step+1)/clip.steps,fraction=step<0?0:T.MathUtils.lerp(from,to,ease(phase));target=footRest[i].clone().applyQuaternion(q0).add(clip.a.clone().lerp(clip.b,fraction));target.y+=step<0?0:.065*Math.sin(Math.PI*phase)**2;footQ=q0;planted=step<0||phase===0||phase===1;
   }
   solve(named['thigh'+side],named['shin'+side],named['hoof'+side],target,footQ,null,1);contacts.push({id:'foot'+side,kind:'floor',planted,worldPoint:target.toArray(),error:named['hoof'+side].getWorldPosition(new T.Vector3()).distanceTo(target)});
  }
  root.updateMatrixWorld(true);worker.skeleton.update();if(stowed)climb.transition(1);
 }
 function handoffPose(target,u,point,stowed=false){
  standing(point,frame.heading,stowed);const source=capture(),w=ease(u);
  tuckTail(T.MathUtils.lerp(source.tailAmount,target.tailAmount,w),T.MathUtils.lerp(source.tailAngle,target.tailAngle,w));
  worker.bones.forEach((b,i)=>{b.position.lerpVectors(source.bones[i].position,target.bones[i].position,w);b.quaternion.copy(source.bones[i].quaternion).slerp(target.bones[i].quaternion,w);});
  root.position.lerpVectors(source.position,target.position,w);root.position.y-=(profile.id.startsWith('pig')&&!stowed?.12:.02)*Math.sin(Math.PI*w)**2;root.quaternion.copy(source.quaternion).slerp(target.quaternion,w);
  climb.stow();
  const gun=worker.weapon.root;gun.position.lerpVectors(source.gun.position,target.gun.position,w);if(!stowed){gun.position.y+=.20*Math.sin(Math.PI*w);gun.position.z+=(profile.id==='skunk'?.18:.55)*Math.sin(Math.PI*w);}gun.quaternion.copy(source.gun.quaternion).slerp(target.gun.quaternion,w);if(stowed&&profile.id==='skunk'){const p=1-w,g=1-ease((p-.25)/.75);gun.position.lerpVectors(source.gun.position,target.gun.position,g);gun.position.y+=(wooden?.24:.36)*ease(p/.25)*(1-ease((p-.75)/.25));gun.quaternion.copy(source.gun.quaternion).slerp(target.gun.quaternion,g);}
  root.updateMatrixWorld(true);worker.skeleton.update();
  // Feet settle one at a time between the walking stance and ladder stance.
  // Solve fixed-length limbs after the torso blend instead of sliding the soles.
  for(const [i,side]of [-1,1].entries()){
   const step=ease((w-i*.5)*2),foot=source.feet[i].point.clone().lerp(target.feet[i].point,step),q=source.feet[i].quaternion.clone().slerp(target.feet[i].quaternion,step);
   foot.y+=.035*Math.sin(Math.PI*step);solve(named['thigh'+side],named['shin'+side],named['hoof'+side],foot,q,null,1);contacts.push({id:'foot'+side,kind:'floor',planted:step===0||step===1,worldPoint:foot.toArray(),error:named['hoof'+side].getWorldPosition(new T.Vector3()).distanceTo(foot)});
  }
  if(stowed)for(const side of [-1,1]){
   const arm=named['upperArm'+side],elbow=named['forearm'+side],hand=named['hand'+side],ei=worker.bones.indexOf(elbow),hi=worker.bones.indexOf(hand),arc=Math.sin(Math.PI*w);
   const wrist=source.bones[hi].world.clone().lerp(target.bones[hi].world,w).add(new T.Vector3(.18*arc,.10*arc,-side*.06*arc).applyQuaternion(root.quaternion));
   const mid=source.bones[ei].world.clone().lerp(target.bones[ei].world,w).add(new T.Vector3(0,.06*arc,-side*.06*arc).applyQuaternion(root.quaternion)),pole=mid.sub(arm.getWorldPosition(new T.Vector3())).applyQuaternion(root.quaternion.clone().invert());
   solve(arm,elbow,hand,wrist,hand.getWorldQuaternion(new T.Quaternion()),pole,1);
  }
  // Guide the weapon around the shoulder with the carrying hand, then release
  // into the climb's free hands. The other hand releases before the arc begins.
  for(const side of (stowed?[]:(worker.weapon.carry?.hands??[-1,1]))){
   const strength=1-ease((w-(side===1?.70:0))/(side===1?.25:.18));if(!strength)continue;
   const hand=named['hand'+side],q=hand.getWorldQuaternion(new T.Quaternion()),anchor=worker.weapon.anchors[side===1?'grip':'support'].getWorldPosition(new T.Vector3()),wrist=anchor.sub(new T.Vector3(.052,-.010,0).applyQuaternion(q));
   solve(named['upperArm'+side],named['forearm'+side],hand,wrist,q,null,strength);contacts.push({id:'hand'+side,kind:'weapon',planted:false,grasp:strength,worldPoint:wrist.toArray(),error:hand.getWorldPosition(new T.Vector3()).distanceTo(wrist)});
  }
  root.updateMatrixWorld(true);worker.skeleton.update();climb.transition(stowed?1:w);climb.syncStow();climb.stowBlend(stowed?1:w);worker.weapon.updateHose?.(root);
 }
 function solve(a,b,c,target,q,pole,strength){
  const start=a.getWorldPosition(new T.Vector3()),ra=rest.get(a),rb=rest.get(b),rc=rest.get(c),l1=ra.distanceTo(rb),l2=rb.distanceTo(rc),axis=target.clone().sub(start),distance=axis.length(),d=T.MathUtils.clamp(distance,Math.abs(l1-l2)+1e-5,l1+l2-1e-5);if(c.name.startsWith('hoof')&&(distance>l1+l2+1e-5||distance<Math.abs(l1-l2)-1e-5))throw Error(profile.id+' journey foot outside reach');axis.normalize();pole=pole?pole.clone().applyQuaternion(root.quaternion):b.getWorldPosition(new T.Vector3()).sub(start);pole.addScaledVector(axis,-pole.dot(axis)).normalize();
  const along=(l1*l1-l2*l2+d*d)/(2*d),mid=start.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
  const rotate=(bone,world)=>{const local=bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(world);bone.quaternion.slerp(local,strength);root.updateMatrixWorld(true);};
  const aim=(bone,child,point)=>{const origin=bone.getWorldPosition(new T.Vector3()),current=child.getWorldPosition(new T.Vector3()).sub(origin).normalize(),desired=point.clone().sub(origin).normalize();rotate(bone,new T.Quaternion().setFromUnitVectors(current,desired).multiply(bone.getWorldQuaternion(new T.Quaternion())));};
  aim(a,b,mid);aim(b,c,start.clone().addScaledVector(axis,d));rotate(c,q);
 }
 return {duration,phases:phases.map(({label,start,end})=>({label,start,end})),climb,definition:climb.definition,apply(progress){
  if(disposed)throw Error('Ladder journey is disposed');if(!Number.isFinite(progress))throw Error('Invalid ladder journey progress');
  contacts=[];const time=T.MathUtils.clamp(progress,0,1)*duration,phase=phases.find(p=>time<=p.end)||phases.at(-1);
  phase.apply(time-phase.start);
  result={phase:phase.label,time,duration,worldRoot:root.position.toArray(),root:root.position.toArray(),contacts,progress:T.MathUtils.clamp(progress,0,1)};return result;
 },diagnostics:()=>result,dispose(){if(disposed)return;disposed=true;tuckTail(0);climb.dispose();restoreTransform();}};
 }catch(error){restoreTail();climb?.dispose();restoreTransform();throw error;}
}
