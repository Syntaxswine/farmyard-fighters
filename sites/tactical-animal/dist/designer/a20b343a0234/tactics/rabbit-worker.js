import * as THREE from './vendor/three.module.js';
import {createLightHorse as createWorkerRig} from './horse-light-model.js';
export const RABBIT_PAINT='../assets/characters/lowpoly-proof/rabbit-woman-model-paint-v1.png';
export const RABBIT_PAINT_FRAME={width:.975,height:1.95,centerY:.875,distance:4,near:.1,far:10};
// Shared skeleton and equipment attachment; geometry, face and paint are species-specific.
export function createRabbitWorker(data,rifleTexture=null){
 const worker=createWorkerRig(data,rifleTexture),materials=worker.parts.map((p,i)=>new THREE.MeshStandardMaterial({color:[0xe9d8aa,0x445845,0x9e7a54,0x8b6a4f,0x9e7a54,0x8b6a4f,0x87644c,0xdfc7a0,0xbd241b,0xbd241b,0xbd241b,0xbd241b][i],roughness:.9}));
 worker.setGrey=value=>worker.parts.forEach((p,i)=>{p.material=value?worker.grey:materials[i];});worker.setGrey(false);
 const dispose=worker.dispose;worker.dispose=()=>{materials.forEach(m=>m.dispose());dispose();};return worker;
}
