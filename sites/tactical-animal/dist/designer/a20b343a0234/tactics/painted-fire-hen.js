import * as T from './vendor/three.module.js';
import {createHenMotion} from './hen-motion.js';
import {guardHenConstruction} from './hen-rig-transaction.js';
import {burnState,panicFeet,smooth} from './painted-fire-state.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const fallPivot=V(0,0,.157);
const fallRotation=tip=>new T.Quaternion().setFromEuler(new T.Euler(1.40*tip,0,-.14*tip));
function channels(state,route){
 const gait=route.length?smooth(state.run/.08)*(1-smooth((state.run-.88)/.12)):0,fallTime=state.local-state.runEnd;
 return {gait,buckle:state.terminal?smooth(fallTime/.25):0,tip:state.terminal?smooth((fallTime-.15)/.43):0,panic:smooth(state.local/.14)*(1-state.collapse),bob:.012*Math.sin(state.local*18)**2*gait,transfer:Math.sin(state.local*16)*gait};
}

// The hen keeps her own feathered wings and four-toed feet. No firearm grips
// are invented for the catalog's unarmed avian character.
export function createHenFireMotion(worker,profile){return guardHenConstruction(worker,()=>{
 const motion=createHenMotion(worker),bones=Object.fromEntries(worker.bones.map(b=>[b.name,b])),attachments=[],rigRest={p:worker.rig.position.clone(),q:worker.rig.quaternion.clone()};
 const pelvisRest=bones.pelvis.position.clone();
 bones.head.traverse(o=>{if(o.isMesh)attachments.push(o);});let state,feet;
 let support=null;
 function resetRig(){worker.rig.position.copy(rigRest.p);worker.rig.quaternion.copy(rigRest.q);worker.root.updateMatrixWorld(true);}
 const restore=()=>{resetRig();motion.restore();for(const p of [...worker.parts,...attachments])p.visible=true;support=null;};
 function lowest(){let point=V(0,Infinity,0),part;const v=V();for(const p of [...worker.parts,...attachments]){const a=p.geometry.attributes.position;for(let i=0;i<a.count;i++){p.getVertexPosition(i,v).applyMatrix4(p.matrixWorld);if(v.y<point.y){point.copy(v);part=p.name;}}}return {point,part};}
 // Sample the ground projection without changing the live pose. Smoke needs
 // its historical birth point; ash needs the stable settled point, even when
 // scrubbing backwards. The logical route endpoint remains untouched.
 function groundPoint(time,route,options){
  const s=burnState(time,route,options),c=channels(s,route),p=pelvisRest.clone();p.y-=.09*c.gait+.29*c.buckle+c.bob*.5;p.z+=.02*c.transfer;
  if(c.tip>0)p.sub(fallPivot).applyQuaternion(fallRotation(c.tip)).add(fallPivot);else p.applyQuaternion(rigRest.q).add(rigRest.p);
  p.applyAxisAngle(V(0,1,0),-s.point.heading);return {x:s.point.x+p.x,y:s.point.y,z:s.point.z+p.z};
 }
 return {worker,bones,
  groundPoint,
  fire(){throw Error('The hen has no authored flamethrower grips');},
  burn(time,route,options){
   for(let i=2;i<route.points.length;i++){const a=route.points[i-2],b=route.points[i-1],c=route.points[i];if(Math.abs(Math.atan2(c.z-b.z,c.x-b.x)-Math.atan2(b.z-a.z,b.x-a.x))>1e-6)throw Error('Hen fire study requires a straight legal route');}
   resetRig();support=null;state=burnState(time,route,options);feet=panicFeet(state,route,{restX:0,restZ:.157,stepLength:.22});const {gait,buckle,tip,panic,bob,transfer}=channels(state,route);
   const input={time:state.time,distance:state.distance,feet:Object.fromEntries([-1,1].map(side=>[side,{x:feet[side].worldDistance-.035,lift:feet[side].y*.65,planted:feet[side].planted}])),gait,kneel:buckle,bob,transfer};
   motion.apply(time,{heading:state.point.heading*180/Math.PI-35,state:input,crouchDrop:.29,kneelStep:0,crouchPole:true});
   bones.breast.rotation.z=-.22*panic-.32*buckle;bones.head.rotation.z=.23*panic-.24*tip;bones.head.rotation.y=.13*Math.sin(state.local*11)*panic-.22*tip;
   for(const side of [-1,1]){
    // The lower wing opens to catch the fall, then folds under the flank.
    // It must remain below the apron hem when settled: cloth is not a prop.
    const catchWing=side===1?.01*tip-.38*Math.sin(Math.PI*tip)**2:-.18*tip;
    bones['wing '+side].rotation.x=-side*(.24+.34*Math.sin(state.local*15+side*.7)**2)*panic+catchWing;bones['wing tip '+side].rotation.x=-side*.20*panic;
   }
   if(tip>0){
    // Once the legs buckle, release their planted contract. Roll over the
    // lower toe edge, then let wing/flank surfaces accept the weight. Sampling
    // actual skin keeps a feather or apron hem from passing through the floor.
    worker.root.position.set(0,0,0);worker.root.rotation.set(0,0,0);
    const q=fallRotation(tip);worker.rig.quaternion.copy(q);worker.rig.position.copy(fallPivot).sub(fallPivot.clone().applyQuaternion(q));
    worker.root.updateMatrixWorld(true);motion.skeleton.update();const contact=lowest();worker.rig.position.y-=contact.point.y;contact.point.y=0;
    support={kind:/wing/.test(contact.part)?'wing':/toes/.test(contact.part)?'toe edge':contact.part==='feathered body'?'flank':'other surface',part:contact.part,point:contact.point.toArray()};
    for(const side of [-1,1])feet[side].planted=false;
   }
   worker.root.position.set(state.point.x,state.point.y,state.point.z);worker.root.rotation.y=-state.point.heading;worker.root.updateMatrixWorld(true);motion.skeleton.update();
   for(const p of [...worker.parts,...attachments])p.visible=state.bodyVisible;return this.diagnostics();
  },
  diagnostics(){const contact=support?{...support,point:worker.root.localToWorld(V(...support.point)).toArray()}:null,p=bones.pelvis.getWorldPosition(V());return {state,animal:profile.id,unarmed:true,gripError:0,hands:[],drop:null,muzzle:null,direction:null,support:contact,groundPoint:{x:p.x,y:state.point.y,z:p.z},feet:Object.fromEntries([-1,1].map(side=>[side,{...feet[side],y:feet[side].y*.65,ankle:bones['foot '+side].getWorldPosition(V()).toArray()}]))};},
  restore,dispose(){restore();motion.dispose();}
 };
});}
