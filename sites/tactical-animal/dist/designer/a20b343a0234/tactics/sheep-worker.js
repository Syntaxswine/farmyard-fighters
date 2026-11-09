import * as THREE from './vendor/three.module.js';
import {createLightHorse as createWorkerRig} from './horse-light-model.js';
export const SHEEP_PAINT='../assets/characters/lowpoly-proof/sheep-worker-model-paint-v1.png';
// Shared skeleton and equipment attachment; geometry, face and paint are species-specific.
export function createSheepWorker(data,rifleTexture=null){
 const worker=createWorkerRig(data,rifleTexture),materials=worker.parts.map((p,i)=>new THREE.MeshStandardMaterial({color:[0xe3d8b3,0x85613c,0xe8d9af,0x605444,0xd8c79e,0x605444,0x77736a,0xe8d9af,0x687342,0xb52213,0xb52213,0xb52213,0xb52213][i],roughness:.9}));
 worker.setGrey=value=>worker.parts.forEach((p,i)=>{p.material=value?worker.grey:materials[i];});worker.setGrey(false);
 const dispose=worker.dispose;worker.dispose=()=>{materials.forEach(m=>m.dispose());dispose();};return worker;
}
