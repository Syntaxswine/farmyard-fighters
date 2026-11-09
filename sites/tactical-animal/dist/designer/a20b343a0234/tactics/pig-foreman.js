import * as THREE from './vendor/three.module.js';
import {createLightHorse as createWorkerRig} from './horse-light-model.js';
export const PIG_FOREMAN_PAINT='../assets/characters/lowpoly-proof/pig-foreman-model-paint-v1.png';
// Shared skeleton and equipment attachment; geometry, face and paint are species-specific.
export function createPigForeman(data,rifleTexture=null){
 const worker=createWorkerRig(data,rifleTexture),materials=worker.parts.map((p,i)=>new THREE.MeshStandardMaterial({color:[0x767440,0x5e4433,0xd9947a,0x302b25,0xd9947a,0x302b25,0xd9947a,0xd9947a,0x963e22][i],roughness:.9}));
 worker.rifle.carry={position:[.39,1.035,.035],axis:[.03,.38,-.924],hands:[1,-1],handPoses:{grip:{elbowPole:[.65,-1,.8]},support:{elbowPole:[.65,-1,-.8]}}};
 worker.setGrey=value=>worker.parts.forEach((p,i)=>{p.material=value?worker.grey:materials[i];});worker.setGrey(false);
 const dispose=worker.dispose;worker.dispose=()=>{materials.forEach(m=>m.dispose());dispose();};return worker;
}
