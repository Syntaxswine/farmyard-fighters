import * as T from './vendor/three.module.js';
import {createHenMotion} from './hen-motion.js';
import {poseRoofMantleCarry} from './roof-mantle-equipment.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const smooth=t=>t*t*(3-2*t);

// A distance-driven version of the studies' alternating planted/swinging feet.
// Upper-body carry poses remain those authored for the equipped weapon.
export function gaitState(distance,blend,stride=.85){
 const feet={};
 for(const side of [-1,1]){
  const phase=((distance/stride+(side===1?.5:0))%1+1)%1,stance=.6;
  const swing=(phase-stance)/(1-stance);
  const x=phase<stance?stride*(stance/2-phase):stride*stance*(smooth(swing)-.5);
  feet[side]={x:x*blend,lift:phase<stance?0:.07*Math.sin(Math.PI*swing)**2*blend,planted:phase<stance};
 }
 const cycle=distance/stride*Math.PI*2;
 return {time:distance,distance:0,feet,gait:blend,kneel:0,aim:0,recoil:0,transfer:Math.sin(cycle)*blend,bob:.008*Math.sin(cycle*2)**2*blend};
}
export function createWorkerLocomotion(worker,profile){
 if(profile.unarmed){
  const motion=createHenMotion(worker);
  return {apply(sample){const state=gaitState(sample.distance,sample.blend,.48);state.kneel=Math.min(1,(sample.pose?.kneel||0)+(sample.pose?.prone||0));if(!sample.blend&&!state.kneel){motion.restore();worker.root.rotation.y=-sample.heading*Math.PI/180;worker.root.updateMatrixWorld(true);motion.skeleton.update();return state;}for(const f of Object.values(state.feet))f.x-=.035;motion.apply(sample.distance,{heading:sample.heading-35,state,crouchDrop:.28,kneelStep:.06,crouchPole:true,stance:sample.pose});return state;},dispose:()=>motion.dispose()};
 }
 worker.pose('neutral',0);worker.root.position.set(0,0,0);worker.root.updateMatrixWorld(true);
 const named=Object.fromEntries(worker.bones.map(b=>[b.name,b])),rest=new Map(worker.bones.map(b=>[b,b.getWorldPosition(V())]));
 const legs=[-1,1].map(side=>({side,a:named['thigh'+side],b:named['shin'+side],c:named['hoof'+side]}));
 const stride=Math.min(.95,...legs.map(({a,b,c})=>(rest.get(a).distanceTo(rest.get(b))+rest.get(b).distanceTo(rest.get(c)))*1.25));
 function rotation(b,q){b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));worker.root.updateMatrixWorld(true);}
 return {
  apply(sample){
   worker.root.position.set(0,0,0);worker.root.rotation.set(0,0,0);poseRoofMantleCarry(worker,profile);
   const state=gaitState(sample.distance,sample.blend,stride),drop=-.065*sample.blend-state.bob;
   if(!sample.blend){worker.root.rotation.y=-sample.heading*Math.PI/180;worker.root.updateMatrixWorld(true);worker.skeleton.update();return state;}
   for(const {side,a,b,c}of legs){
    const f=state.feet[side],start=a.getWorldPosition(V()),ra=rest.get(a),rb=rest.get(b),rc=rest.get(c);
    const target=rc.clone().add(V(f.x,f.lift-drop,0)),axis=target.clone().sub(start),d=axis.length(),la=ra.distanceTo(rb),lb=rb.distanceTo(rc);
    if(d>la+lb+1e-6||d<Math.abs(la-lb)-1e-6)throw Error(profile.id+' walking foot outside leg reach');
    axis.normalize();const along=(la*la-lb*lb+d*d)/(2*d),pole=V(1,0,0).addScaledVector(axis,-axis.x).normalize();
    const mid=start.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,la*la-along*along)));
    rotation(a,new T.Quaternion().setFromUnitVectors(rb.clone().sub(ra).normalize(),mid.clone().sub(start).normalize()));
    rotation(b,new T.Quaternion().setFromUnitVectors(rc.clone().sub(rb).normalize(),target.clone().sub(mid).normalize()));rotation(c,new T.Quaternion());
   }
   worker.root.position.y=drop;worker.root.rotation.y=-sample.heading*Math.PI/180;worker.root.updateMatrixWorld(true);worker.skeleton.update();
   return state;
  },dispose(){}
 };
}
