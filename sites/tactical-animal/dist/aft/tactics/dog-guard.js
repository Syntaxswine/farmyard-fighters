import * as THREE from './vendor/three.module.js';
import {createLightHorse as createWorkerRig} from './horse-light-model.js';
export const DOG_PAINT='../assets/characters/lowpoly-proof/dog-woman-model-paint-v1.png';
export const DOG_PAINT_FRAME={width:.975,height:1.95,centerY:.875,distance:4,near:.1,far:10};
// Shared skeleton and equipment attachment; geometry, face and paint are species-specific.
export function createDogWorker(data,rifleTexture=null){
 const worker=createWorkerRig(data,rifleTexture),materials=worker.parts.map((p,i)=>new THREE.MeshStandardMaterial({color:[0x6d743b,0x775c3e,0xb48342,0xa17b4b,0xb48342,0xa17b4b,0x9e753f,0x66523e,0xbd241b,0xbd241b,0xbd241b,0xbd241b,0x755035,0x755035,0x5d4029,0x6d743b,0x6d743b][i],roughness:.9}));
 worker.setGrey=value=>worker.parts.forEach((p,i)=>{p.material=value?worker.grey:materials[i];});worker.setGrey(false);
 const dispose=worker.dispose;worker.dispose=()=>{materials.forEach(m=>m.dispose());dispose();};return worker;
}
