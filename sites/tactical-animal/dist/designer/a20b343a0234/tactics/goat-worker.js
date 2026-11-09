import * as THREE from './vendor/three.module.js';
import {createLightHorse as createWorkerRig} from './horse-light-model.js';
export const GOAT_PAINT='../assets/characters/lowpoly-proof/goat-worker-model-paint-v1.png';
// Shared skeleton and equipment attachment; geometry, face and paint are species-specific.
export function createGoatWorker(data,rifleTexture=null){
 const worker=createWorkerRig(data,rifleTexture),materials=worker.parts.map((p,i)=>new THREE.MeshStandardMaterial({color:[0xdbaa47,0x687342,0xd8c79e,0x605444,0xd8c79e,0x605444,0xd8c79e,0xdfd0b0][i],roughness:.9}));
 worker.setGrey=value=>worker.parts.forEach((p,i)=>{p.material=value?worker.grey:materials[i];});worker.setGrey(false);
 const dispose=worker.dispose;worker.dispose=()=>{materials.forEach(m=>m.dispose());dispose();};return worker;
}
