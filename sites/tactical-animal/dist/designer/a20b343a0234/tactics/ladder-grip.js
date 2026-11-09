import * as T from './vendor/three.module.js';
const V=(x,y,z)=>new T.Vector3(x,y,z);

// Temporary work glove with a channel matched to the ladder section. Wooden
// holds use visible finger opening during transfer and fit the 8.5×10 cm stile.
// Source
// character geometry is restored verbatim on leaving the presentation clip.
export function createLadderGrip(worker,side,handHeight,{wooden=false,opening=wooden}={}){
 const radius=wooden?.083:.070;
 const arm=worker.parts.find(p=>p.name==='forearm and hand '+side),original=arm.geometry.index,indices=[];
 for(let i=0;i<original.count;i+=3){const ids=[original.getX(i),original.getX(i+1),original.getX(i+2)];if(ids.every(j=>arm.geometry.attributes.position.getY(j)>handHeight+.12))indices.push(...ids);}
 const si=arm.geometry.attributes.skinIndex,sw=arm.geometry.attributes.skinWeight,gripSI=si.clone(),gripSW=sw.clone(),forearm=worker.bones.findIndex(b=>b.name==='forearm'+side);for(let i=0;i<si.count;i++)if(arm.geometry.attributes.position.getY(i)<handHeight+.18){gripSI.setXYZW(i,forearm,0,0,0);gripSW.setXYZW(i,1,0,0,0);}
 const trimmed=new T.Uint16BufferAttribute(indices,1),group=new T.Group();group.name='Ladder glove '+side;worker.root.add(group);
 const material=new T.MeshStandardMaterial({color:0x403b30,roughness:1}),meshes=[];
 function add(g){const m=new T.Mesh(g,material);m.name='Ladder grip surface';group.add(m);meshes.push(m);return m;}
 const palm=add(new T.SphereGeometry(1,10,6));palm.position.set(-.075,.008,0);palm.scale.set(.025,.036,.049);
 const fingers=[];
 for(const z of [-.035,-.012,.012,.035]){
  const path=new T.CatmullRomCurve3([V(-.079,.010,z),V(-.060,.047,z),V(-.015,.052,z),V(.042,.048,z),V(.055,.013,z),V(.048,-.041,z),V(.018,-.047,z)]);
  const curve=opening?new T.CatmullRomCurve3(Array.from({length:13},(_,i)=>{const a=(170-i*20)*Math.PI/180;return V(radius*Math.cos(a),radius*Math.sin(a),z);})):path;
  const mesh=add(new T.TubeGeometry(curve,opening?24:18,.010,5,false));if(opening)fingers.push({mesh,source:mesh.geometry.attributes.position.clone(),thumb:false});
 }
 const thumb=new T.CatmullRomCurve3([V(-.080,.01,side*.041),V(-.062,-.015,side*.057),V(-.035,-.041,side*.052),V(-.01,-.046,side*.038)]);
 const thumbCurve=opening?new T.CatmullRomCurve3([V(-.085*radius/.083,.006,side*.041),V(-.088*radius/.083,-.025*radius/.083,side*.057),V(-.073*radius/.083,-.060*radius/.083,side*.052),V(-.034*radius/.083,-radius,side*.038)]):thumb;
 const thumbMesh=add(new T.TubeGeometry(thumbCurve,10,.014,6,false));if(opening)fingers.push({mesh:thumbMesh,source:thumbMesh.geometry.attributes.position.clone(),thumb:true});
 const edges=new Map();for(let i=0;i<indices.length;i+=3)for(let k=0;k<3;k++){const a=indices[i+k],b=indices[i+(k+1)%3],key=[a,b].sort((a,b)=>a-b).join(':');if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}
 const adjacency=new Map();for(const [a,b]of edges.values())for(const [x,y]of [[a,b],[b,a]]){if(!adjacency.has(x))adjacency.set(x,[]);adjacency.get(x).push(y);}
 const order=[adjacency.keys().next().value];let previous=-1;while(order.length<adjacency.size){const current=order.at(-1),next=adjacency.get(current)?.find(i=>i!==previous);if(next===undefined||next===order[0])break;order.push(next);previous=current;}
 const originalPosition=arm.geometry.attributes.position,position=originalPosition.clone();for(const i of order)position.setY(i,handHeight+.12);
 const morphed=originalPosition.clone(),blendSI=si.clone(),blendSW=sw.clone(),kept=new Set(indices),collapse=new T.Vector3();for(const i of order)collapse.add(V().fromBufferAttribute(position,i));collapse.divideScalar(order.length);
 const n=order.length,geometry=new T.BufferGeometry(),positions=new Float32Array(n*5*3),ix=[];
 for(let ring=0;ring<4;ring++)for(let i=0;i<n;i++){const a=ring*n+i,b=ring*n+(i+1)%n;ix.push(a,b,a+n,b,b+n,a+n);}
 geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setIndex(ix);const cuff=add(geometry);cuff.name='Ladder grip cuff';cuff.material=material.clone();cuff.material.side=T.DoubleSide;
 return {group,meshes,arm,original,trimmed,update(point,quaternion,blend=1,opening=0){
  if(fingers.length)for(const {mesh,source,thumb}of fingers){const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){const x=source.getX(i),y=source.getY(i),r=Math.hypot(x,y);let angle=Math.atan2(y,x);if(thumb){if(angle>0)angle-=2*Math.PI;angle=T.MathUtils.lerp(angle,-Math.PI,opening*.70);}else{const base=170*Math.PI/180,along=T.MathUtils.clamp((base-angle)/(240*Math.PI/180),0,1);angle=T.MathUtils.lerp(angle,base-along*70*Math.PI/180,opening);const length=r;a.setXYZ(i,Math.cos(angle)*length,Math.sin(angle)*length,source.getZ(i));continue;}a.setXYZ(i,Math.cos(angle)*r,Math.sin(angle)*r,source.getZ(i));}a.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();}

  if(blend<1){for(let i=0;i<si.count;i++){
   const target=kept.has(i)?new T.Vector3().fromBufferAttribute(position,i):collapse,v=new T.Vector3().fromBufferAttribute(originalPosition,i).lerp(target,blend);morphed.setXYZ(i,v.x,v.y,v.z);
   const weights=new Map();for(let j=0;j<4;j++){const source=si.getComponent(i,j),target=gripSI.getComponent(i,j);weights.set(source,(weights.get(source)||0)+sw.getComponent(i,j)*(1-blend));weights.set(target,(weights.get(target)||0)+gripSW.getComponent(i,j)*blend);}const rows=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=rows.reduce((n,r)=>n+r[1],0);while(rows.length<4)rows.push([0,0]);blendSI.setXYZW(i,...rows.map(r=>r[0]));blendSW.setXYZW(i,...rows.map(r=>r[1]/sum));
  }morphed.needsUpdate=blendSI.needsUpdate=blendSW.needsUpdate=true;}
  arm.geometry.setIndex(blend<1?original:trimmed);arm.geometry.setAttribute('position',blend<1?morphed:position);arm.geometry.setAttribute('skinIndex',blend<1?blendSI:gripSI);arm.geometry.setAttribute('skinWeight',blend<1?blendSW:gripSW);group.visible=blend>0;group.scale.setScalar(1);group.position.copy(point);group.quaternion.copy(quaternion);worker.root.updateMatrixWorld(true);
  const points=order.map(i=>group.worldToLocal(arm.getVertexPosition(i,new T.Vector3()).applyMatrix4(arm.matrixWorld))),center=points.reduce((a,p)=>a.add(p),new T.Vector3()).multiplyScalar(1/n);
  for(let i=0;i<n;i++){const end=points[i].clone().sub(center).multiplyScalar(.25).add(V(-.083,.016,0));for(let ring=0;ring<5;ring++){const u=ring/4,a=Math.atan2(points[i].y,points[i].x),b=Math.atan2(end.y,end.x),delta=Math.atan2(Math.sin(b-a),Math.cos(b-a)),angle=a+delta*u,radius=T.MathUtils.lerp(Math.hypot(points[i].x,points[i].y),Math.hypot(end.x,end.y),u),q=V(Math.cos(angle)*radius,Math.sin(angle)*radius,T.MathUtils.lerp(points[i].z,end.z,u));positions.set(q.toArray(),(ring*n+i)*3);}}
  geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();group.scale.setScalar(blend);
 },restore(){arm.geometry.setIndex(original);arm.geometry.setAttribute('position',originalPosition);arm.geometry.setAttribute('skinIndex',si);arm.geometry.setAttribute('skinWeight',sw);group.visible=false;},dispose(){arm.geometry.setIndex(original);group.removeFromParent();for(const m of meshes)m.geometry.dispose();cuff.material.dispose();material.dispose();}};
}
