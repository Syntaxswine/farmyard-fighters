import {createFatalHeadMask} from './fatal-head-mask.js';
import {validFatalHead} from './gunshot-impacts.js';

export function prepareFatalHead(model,texture){return texture?createFatalHeadMask(model.worker,{species:model.profile.id,texture}):null;}
// Off can now skip the optional atlases. Install a mask once if the player later
// enables Full; an unsupported rig is not retried on every animation frame.
export function ensureFatalHead(model,texture){
 if(!texture||model.fatalMaskTexture===texture)return model.fatalMask;
 model.fatalMask?.dispose();model.fatalMaskTexture=texture;return model.fatalMask=prepareFatalHead(model,texture);
}

// Pose solvers retain original vertex indices. The mask is a render-only view
// applied after those solvers, before rebuilding the character's merged draw.
export function presentFatalHead(model,unit,mode,pose,stains){
 const mask=model.fatalMask,wanted=mode==='full'&&!!unit.fatalHead&&validFatalHead(unit)&&!unit.burnedRemains;
 if(model.maskWanted!==wanted){model.signature=null;model.maskWanted=wanted;}
 const before=model.placement,was=mask?.destroyed;if(was)mask.setDestroyed(false);
 let result;try{result=pose();}finally{if(wanted)mask?.setDestroyed(true);}
 if(mask?.destroyed&&(was!==mask.destroyed||before!==model.placement)){
  // ground() expects the actor's local origin, including on roofs/towers.
  const location=model.root.position.clone();model.root.position.set(0,0,0);model.root.updateMatrixWorld(true);model.posture.ground();model.root.position.copy(location);model.root.updateMatrixWorld(true);model.worker.skeleton.update();
  for(const part of model.worker.parts){part.computeBoundingBox?.();part.computeBoundingSphere?.();}
 }
 stains?.setMask(unit.id,mask);return result;
}
