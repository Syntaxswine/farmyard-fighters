import * as T from './vendor/three.module.js';
import {biomePlantParts} from './biome-plant-parts.js';
export {biomePlantParts} from './biome-plant-parts.js';
import {environmentGeometries} from './environment-geometry.js';
import {BIOME_PLANTS,MATURE_TREE_SCALE} from './biome-foliage-data.js';

// Leaves are folded ribbons with a curved spine. Their veins/leaflets are paint.
function leafGeometry(frond=false){
 const p=[],uv=[],n=frond?7:4,point=(t,side)=>{const w=Math.pow(Math.sin(t*Math.PI),.8)*(frond?.42:.5),y=frond?Math.sin(t*Math.PI)*.27-t*t*.42:Math.sin(t*Math.PI)*.18-t*t*.08;return [side*w,y-Math.abs(side)*w*.17,t];};
 const emit=(a,b,c)=>{const values=[a,b,c].map(([t,s])=>new T.Vector3(...point(t,s)));if(new T.Vector3().subVectors(values[1],values[0]).cross(new T.Vector3().subVectors(values[2],values[0])).lengthSq()<1e-12)return;for(const [t,s]of [a,b,c]){p.push(...point(t,s));uv.push((s+1)/2,t);}};
 for(let i=0;i<n;i++){const a=i/n,b=(i+1)/n;for(const s of [-1,1]){emit([a,0],[b,0],[a,s]);emit([a,s],[b,0],[b,s]);}}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
export function createBiomePlantFactory(materials){
 const geometries=environmentGeometries();geometries['biome-leaf']=leafGeometry();geometries['biome-frond']=leafGeometry(true);
 const crown=new T.SphereGeometry(.5,10,6),cp=crown.attributes.position;for(let i=0;i<cp.count;i++){const x=cp.getX(i),y=cp.getY(i),z=cp.getZ(i),a=Math.atan2(z,x),r=1+.1*Math.sin(a*3+.3)+.04*Math.cos(a*5-y*7);cp.setXYZ(i,x*r,y*(1+.08*Math.sin(a*3)),z*r);}crown.computeVertexNormals();geometries['biome-crown']=crown;
 const buttress=new T.BufferGeometry(),vertices=[-.5,0,0,.5,0,0,-.18,1,0,.18,1,0,-.05,0,1,.05,0,1];buttress.setAttribute('position',new T.Float32BufferAttribute(vertices,3));buttress.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1,1,1,0,0,1,0],2));buttress.setIndex([0,2,1,1,2,3,0,4,2,1,3,5,2,4,3,3,4,5,0,1,4,1,5,4]);buttress.computeVertexNormals();geometries['biome-buttress']=buttress;let disposed=false;
 function create(id,{variant=0,mature=false,grey=false}={}){
  if(disposed)throw Error('Plant factory is disposed');const info=BIOME_PLANTS[id];if(!info)throw Error('Unknown biome plant: '+id);
  const root=new T.Group();root.name=id;const parts=biomePlantParts(id,variant);
  for(const p of parts){const material=grey?materials.grey:materials[p.paint];if(!material)throw Error('Missing plant paint: '+p.paint);const mesh=new T.Mesh(geometries[p.shape],material);mesh.name=p.paint+':'+p.shape;mesh.scale.fromArray(p.size);if(p.a){mesh.position.fromArray(p.a).add(new T.Vector3().fromArray(p.b)).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3().fromArray(p.b).sub(new T.Vector3().fromArray(p.a)).normalize());}else{mesh.position.fromArray(p.position);mesh.rotation.set(...p.rotation,'YXZ');}mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);}
  root.rotation.y=variant*.45;
  // Ground the vertices inside the root so ordinary tile placement cannot
  // overwrite a correction stored in root.position. Rotated boxes overestimate
  // the underside of curved fronds and used to leave them visibly floating.
  root.updateMatrixWorld(true);const before=new T.Box3().setFromObject(root,true);
  for(const child of root.children)child.position.y-=before.min.y;
  const scale=mature&&info.category==='tree'?MATURE_TREE_SCALE:1;root.scale.setScalar(scale);root.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(root,true);let triangles=0;root.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  root.userData={id,biome:info.biome,category:info.category,variant,mature:info.category==='tree'&&mature,triangles,anchor:[0,0,0],bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},materials:[...new Set(parts.map(p=>p.paint))],note:'Visual bounds only; gameplay owns passability and collision.'};return root;
 }
 return {create,geometries,dispose(){if(disposed)return;disposed=true;for(const g of new Set(Object.values(geometries)))g.dispose();}};
}
