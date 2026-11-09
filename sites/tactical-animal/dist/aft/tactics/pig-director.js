import * as THREE from './vendor/three.module.js';
import {createLightHorse as createWorkerRig} from './horse-light-model.js';
export const PIG_DIRECTOR_FRAME={width:1.16,height:2.32,centerY:.825,distance:4,near:.1,far:10};
export const PIG_DIRECTOR_PAINT='../assets/characters/lowpoly-proof/pig-director-model-paint-v1.png';
// Shared skeleton and equipment attachment; geometry, face and paint are species-specific.
export function createPigDirector(data,rifleTexture=null){
 const worker=createWorkerRig(data,rifleTexture),materials=worker.parts.map((p,i)=>new THREE.MeshStandardMaterial({color:[0x793d31,0x37322d,0xd9947a,0x302b25,0xd9947a,0x302b25,0xd9947a,0xd9947a][i],roughness:.9}));
 worker.rifle.carry={position:[.37,1.155,.035],axis:[.03,.22,-.975],hands:[1,-1],handPoses:{grip:{elbowPole:[.65,-1,.8]},support:{elbowPole:[.65,-1,-.8]}}};
 // The director's wider shoulders cannot reach the shared low HMG carry.
 // Lift the complete weapon so both authored grip contacts remain exact.
 const equip=worker.equipWeapon;worker.equipWeapon=asset=>{if(asset?.id==='hmg')asset.carry={...asset.carry,position:[.29,.94,.055]};equip(asset);};
 worker.setGrey=value=>worker.parts.forEach((p,i)=>{p.material=value?worker.grey:materials[i];});worker.setGrey(false);
 const dispose=worker.dispose;worker.dispose=()=>{materials.forEach(m=>m.dispose());dispose();};return worker;
}
