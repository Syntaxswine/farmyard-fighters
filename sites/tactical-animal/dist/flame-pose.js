import * as T from './aft/tactics/vendor/three.module.js';
import {solveLimb,snapshot,restore} from './aft/tactics/idle-rig-math.js';
import {fireState} from './aft/tactics/painted-fire-state.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion();

// Fit the lance to the prepared locomotion/posture frame for aim and emission.
export function createFlameOperator(worker,profile){
  const bones=Object.fromEntries(worker.bones.map(bone=>[bone.name,bone]));
  const names=['spine',...[-1,1].flatMap(side=>['upperArm','forearm','hand','fingers'].map(name=>name+side))];
  const supported=!profile.unarmed&&names.every(name=>bones[name]);
  let disposed=false;
  function muzzle(){
    worker.root.updateMatrixWorld(true);const gun=worker.weapon,anchor=gun?.anchors?.muzzle||gun?.muzzleMesh;
    if(!anchor)return null;
    return {origin:anchor.getWorldPosition(V()),direction:V(1,0,0).transformDirection(gun.root.matrixWorld)};
  }
  return {apply(sample,seconds,reduced=false,weight=1){
    if(disposed||worker.weapon?.id!=='flamethrower'||sample.hp<=0)return null;
    if(!supported)return {...muzzle(),fallback:true};
    const gun=worker.weapon,root=worker.root,heading=sample.heading*Math.PI/180,forward=V(Math.cos(heading),0,Math.sin(heading)),right=V(-Math.sin(heading),0,Math.cos(heading));
    const saved=snapshot(names.map(name=>bones[name])),equipment={position:gun.root.position.clone(),quaternion:gun.root.quaternion.clone(),scale:gun.root.scale.clone()};
    const midpoint=bones.upperArm1.getWorldPosition(V()).add(bones['upperArm-1'].getWorldPosition(V())).multiplyScalar(.5);
    // Keep the lance fixed through the emitted tail, as in the source study.
    // Kneeling/prone retain their authored planted pose rather than applying
    // the standing study's hip drop or attempting its standing leg solver.
    const brace=(reduced?.65:fireState(seconds).brace)*weight;
    const stanceStrength=sample.stance==='standing'?1:sample.stance==='kneeling'?.68:.27;
    bones.spine.rotation.z-=.055*brace*stanceStrength;
    root.updateMatrixWorld(true);
    const grip=midpoint.addScaledVector(forward,.06).addScaledVector(right,.025).add(V(0,-.12,0));
    const direction=forward.clone().add(V(0,.025,0)).normalize();
    const worldQ=gun.root.getWorldQuaternion(Q()).slerp(Q().setFromUnitVectors(V(1,0,0),direction),weight);
    const parentQ=gun.root.parent.getWorldQuaternion(Q());
    grip.lerp(gun.anchors.grip.getWorldPosition(V()),1-weight);
    gun.root.quaternion.copy(parentQ.invert().multiply(worldQ));
    gun.root.position.copy(gun.root.parent.worldToLocal(grip.clone())).sub(gun.anchors.grip.position.clone().applyQuaternion(gun.root.quaternion));
    root.updateMatrixWorld(true);
    try{
      for(const side of [1,-1]){
        const name=side===1?'grip':'support',anchor=gun.anchors[name],carry=gun.carry?.handPoses?.[name],palm=carry?.palm?V(...carry.palm):V(.052,-.010,0);
        const rotation=worldQ.clone().multiply(carry?.quaternion?Q().fromArray(carry.quaternion):Q().setFromUnitVectors(V(0,-1,0),V(1,0,0)));
        const target=anchor.getWorldPosition(V()).sub(palm.clone().applyQuaternion(rotation));
        solveLimb(bones['upperArm'+side],bones['forearm'+side],bones['hand'+side],target,rotation,forward.clone().multiplyScalar(-.12).add(V(0,-1,0)).addScaledVector(right,side*.55));
        bones['fingers'+side].rotation.z=carry?.fingerCurl??-.9;
      }
      root.updateMatrixWorld(true);worker.skeleton.update();gun.updateHose?.(root);
      return {...muzzle(),fallback:false};
    }catch{
      // Unknown or unusually fitted rigs retain their safe authored carry.
      restore(saved);gun.root.position.copy(equipment.position);gun.root.quaternion.copy(equipment.quaternion);gun.root.scale.copy(equipment.scale);root.updateMatrixWorld(true);worker.skeleton.update();gun.updateHose?.(root);
      return {...muzzle(),fallback:true};
    }
  },muzzle,dispose(){disposed=true;}};
}
