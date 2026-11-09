import * as THREE from './vendor/three.module.js';
import {PAINT_FRAME} from './horse-model-paint.js';
export const SKUNK_PAINT_FRAME={...PAINT_FRAME,width:1.40,height:2.80};
import {createLightHorse as createWorkerRig} from './horse-light-model.js';
export const SKUNK_PAINT='../assets/characters/lowpoly-proof/skunk-worker-model-paint-v1.png';
export const SKUNK_TAIL_PAINT='../assets/characters/lowpoly-proof/skunk-tail-paint-v1.png';
// Rest-space tubular coordinates follow the main plume flow past the crown.
// A flow spine excludes the overlapping return tip so nearby branches cannot
// switch ownership and pinch a painted stripe at the inside of the curl.
// Store radial components, not angles, so triangles across the wrap interpolate correctly.
function tailCoordinates(worker){
 const curve=new THREE.CatmullRomCurve3([[-.175,.865,0],[-.29,.865,.10],[-.41,.95,.245],[-.45,1.12,.28],[-.425,1.31,.27],[-.44,1.42,.25],[-.47,1.56,.24],[-.50,1.72,.23]].map(p=>new THREE.Vector3(...p)));
 const points=curve.getPoints(160),p=new THREE.Vector3(),delta=new THREE.Vector3(),q=new THREE.Vector3(),radial=new THREE.Vector3();
 for(const part of worker.parts){const position=part.geometry.attributes.position,coords=new Float32Array(position.count*3);
  if(part.name.includes('tail'))for(let i=0;i<position.count;i++){p.fromBufferAttribute(position,i);let best=Infinity,t=0;
   for(let j=0;j<160;j++){delta.subVectors(points[j+1],points[j]);const u=THREE.MathUtils.clamp(q.subVectors(p,points[j]).dot(delta)/delta.lengthSq(),0,1);q.copy(points[j]).addScaledVector(delta,u);const distance=p.distanceToSquared(q);if(distance<best){best=distance;t=(j+u)/160;}}
   const tangent=curve.getTangent(t),across=new THREE.Vector3(0,0,1);across.addScaledVector(tangent,-across.dot(tangent)).normalize();const around=new THREE.Vector3().crossVectors(tangent,across).normalize();radial.subVectors(p,curve.getPoint(t));coords.set([radial.dot(across),radial.dot(around),t],i*3);
  }
  part.geometry.setAttribute('paintTail',new THREE.Float32BufferAttribute(coords,3));
 }
}
// Shared skeleton and equipment attachment; geometry, face and paint are species-specific.
export function createSkunkWorker(data,rifleTexture=null){
 const worker=createWorkerRig(data,rifleTexture),materials=worker.parts.map((p,i)=>new THREE.MeshStandardMaterial({color:[0xe0ae45,0x657144,0x302c29,0x6e5435,0x302c29,0x6e5435,0x302c29,0x302c29][i],roughness:.9}));
 tailCoordinates(worker);
 worker.setGrey=value=>worker.parts.forEach((p,i)=>{p.material=value?worker.grey:materials[i];});worker.setGrey(false);
 const dispose=worker.dispose;worker.dispose=()=>{materials.forEach(m=>m.dispose());dispose();};return worker;
}
