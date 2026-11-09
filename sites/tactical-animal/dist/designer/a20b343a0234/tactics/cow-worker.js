import * as THREE from './vendor/three.module.js';
import {createLightHorse as createWorkerRig} from './horse-light-model.js';
export const COW_PAINT='../assets/characters/lowpoly-proof/cow-woman-model-paint-v1.png';
// Shared skeleton and equipment attachment; geometry, face and paint are species-specific.
export function createCowWorker(data,rifleTexture=null){
 const worker=createWorkerRig(data,rifleTexture),materials=worker.parts.map((p,i)=>new THREE.MeshStandardMaterial({color:[0xe9d8aa,0x445845,0xa46037,0x494037,0xa46037,0x494037,0xa46037,0x8e5a35,0xbd241b,0xbd241b,0xbd241b,0xbd241b][i],roughness:.9}));
 worker.setGrey=value=>worker.parts.forEach((p,i)=>{p.material=value?worker.grey:materials[i];});worker.setGrey(false);
 const dispose=worker.dispose;worker.dispose=()=>{materials.forEach(m=>m.dispose());dispose();};return worker;
}
