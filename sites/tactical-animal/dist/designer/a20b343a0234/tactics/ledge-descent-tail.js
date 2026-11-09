import * as T from './vendor/three.module.js';
// Lift long tails over the lip, and turn the skunk's plume sideways. The root
// stays attached; all changes use temporary attributes and restore exactly.
export function createDescentTail(worker,profile){
 const config={bull:[2,-2.0],cow:[2,-2.0],donkey:[2,-2.4],dog:[2,-2.2],skunk:[1,1.4]}[profile.id];
 const rows=config?worker.parts.filter(p=>p.name.includes('tail')).map(part=>{
  const originalPosition=part.geometry.attributes.position,originalNormal=part.geometry.attributes.normal,position=originalPosition.clone(),normal=originalNormal.clone(),axis=profile.id==='skunk'?0:1;
  let top=-Infinity;for(let i=0;i<position.count;i++)top=Math.max(top,position.getComponent(i,axis));
  const pivot=new T.Vector3();let n=0;for(let i=0;i<position.count;i++)if(position.getComponent(i,axis)>top-.025){pivot.add(new T.Vector3().fromBufferAttribute(position,i));n++;}pivot.divideScalar(n);pivot.setComponent(axis,top);
  return {part,originalPosition,originalNormal,position,normal,pivot};
 }):[];
 return {set(amount){for(const r of rows){const axis=new T.Vector3().setComponent(config[0],1);for(let i=0;i<r.position.count;i++){const v=new T.Vector3().fromBufferAttribute(r.originalPosition,i),blend=T.MathUtils.smoothstep(v.distanceTo(r.pivot),.035,.20),q=new T.Quaternion().setFromAxisAngle(axis,config[1]*amount*blend),p=v.sub(r.pivot).applyQuaternion(q).add(r.pivot),n=new T.Vector3().fromBufferAttribute(r.originalNormal,i).applyQuaternion(q);r.position.setXYZ(i,p.x,p.y,p.z);r.normal.setXYZ(i,n.x,n.y,n.z);}r.part.geometry.setAttribute('position',r.position);r.part.geometry.setAttribute('normal',r.normal);r.position.needsUpdate=r.normal.needsUpdate=true;r.part.geometry.computeBoundingSphere();}},restore(){for(const r of rows){r.part.geometry.setAttribute('position',r.originalPosition);r.part.geometry.setAttribute('normal',r.originalNormal);r.part.geometry.computeBoundingSphere();}}};
}
