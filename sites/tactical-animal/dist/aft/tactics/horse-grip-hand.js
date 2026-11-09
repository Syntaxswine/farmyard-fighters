import * as THREE from './vendor/three.module.js';
import data from './horse-grip-hand-data.js';
export function createGripHand(){
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(data.position,3));
 g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normal,3));
 g.setIndex(data.index);
 const colors=[];
 for(let i=0;i<data.position.length;i+=3){
  const x=data.position[i],y=data.position[i+1],n=data.normal;
  const light=.030+.055*Math.max(0,n[i+1])+.014*Math.max(0,n[i+2]);
  const seam=y>.042&&y<.049?.75:1;
  const crease=1-.13*Math.pow(Math.cos(x*140),8);
  colors.push(light*seam*crease,light*.91*seam*crease,light*.77*seam*crease);
 }
 g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const material=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});
 const mesh=new THREE.Mesh(g,material);mesh.name='overhand support glove';mesh.visible=false;
 return mesh;
}

// Join the posed forearm's actual cut boundary to the glove cuff. This follows
// blended skinning at the wrist instead of covering a gap with a floating sphere.
export function createGripCuff(arm,indices,glove){
 const edges=new Map();
 for(let i=0;i<indices.length;i+=3)for(let k=0;k<3;k++){
  const a=indices[i+k],b=indices[i+(k+1)%3],key=[a,b].sort((a,b)=>a-b).join(':');
  if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);
 }
 const adjacency=new Map();for(const [a,b] of edges.values())for(const [x,y] of [[a,b],[b,a]]){if(!adjacency.has(x))adjacency.set(x,[]);adjacency.get(x).push(y);}
 const order=[adjacency.keys().next().value];let previous=-1;
 while(order.length<adjacency.size){const current=order.at(-1),next=adjacency.get(current).find(i=>i!==previous);if(next===order[0])break;order.push(next);previous=current;}
 const n=order.length,g=new THREE.BufferGeometry(),positions=new Float32Array(n*3*3),colors=new Float32Array(n*3*3),ix=[];
 for(let ring=0;ring<2;ring++)for(let i=0;i<n;i++){const a=ring*n+i,b=ring*n+(i+1)%n;ix.push(a,b,a+n,b,b+n,a+n);}
 g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.setIndex(ix);
 const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false,side:THREE.DoubleSide}));m.name='fitted glove cuff';glove.add(m);
 m.update=()=>{
  const points=order.map(i=>{const v=new THREE.Vector3().fromBufferAttribute(arm.geometry.attributes.position,i);arm.applyBoneTransform(i,v);return glove.worldToLocal(v.applyMatrix4(arm.matrixWorld));});
  const center=points.reduce((a,v)=>a.add(v),new THREE.Vector3()).multiplyScalar(1/n);
  for(let i=0;i<n;i++){
   const v=points[i],angle=Math.atan2(v.z-center.z,v.x-center.x),end=v.clone().sub(center).multiplyScalar(.40).add(new THREE.Vector3(0,.043,.014));
   for(let ring=0;ring<3;ring++){const q=v.clone().lerp(end,ring/2),k=(ring*n+i)*3;positions.set(q.toArray(),k);const light=.042+.030*Math.max(0,Math.sin(angle));colors.set([light,light*.91,light*.77],k);}
  }
  g.attributes.position.needsUpdate=true;g.computeVertexNormals();
  for(let i=0;i<positions.length;i+=3){const normal=g.attributes.normal,light=.024+.054*Math.max(0,normal.getY(i/3))+.012*Math.abs(normal.getZ(i/3));colors.set([light,light*.91,light*.77],i);}
  g.attributes.color.needsUpdate=true;g.computeBoundingSphere();
 };
 return m;
}
