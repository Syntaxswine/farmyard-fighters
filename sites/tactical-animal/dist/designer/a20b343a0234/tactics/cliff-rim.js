import * as T from './vendor/three.module.js';

// Distance to actual exposed edges, computed after neighboring tiles are welded.
// It is a paint mask only: no raised curb, collision or cap-height change.
export function addCliffRimAttribute(geometry,segments){
 const p=geometry.attributes.position,values=new Float32Array(p.count),cache=new Map();
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),z=p.getZ(i),key=`${x},${z}`;let distance=cache.get(key);
  if(distance===undefined){distance=100;for(const {a,b}of segments){const dx=b[0]-a[0],dz=b[2]-a[2],length=dx*dx+dz*dz;if(length<1e-15)continue;const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/length));distance=Math.min(distance,Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t));}cache.set(key,distance);}
  values[i]=distance;
 }
 geometry.setAttribute('cliffRim',new T.Float32BufferAttribute(values,1));return geometry;
}
