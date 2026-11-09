import * as T from './vendor/three.module.js';
// Reversible standing clearance inside the iron guardhouse. This bends the
// approved tail surface about its root; it does not change actor scale/tiles.
export function createTowerTailTuck(worker,profile){
 const upright=profile.id==='skunk',pig=profile.id.startsWith('pig'),enabled=upright||profile.id==='dog'||pig,axis=upright||pig?0:1;
 const tails=enabled?worker.parts.filter(p=>p.name.includes('tail')).map(part=>{
  const position=part.geometry.attributes.position.clone(),normal=part.geometry.attributes.normal.clone(),top=Math.max(...Array.from({length:position.count},(_,i)=>position.getComponent(i,axis))),pivot=new T.Vector3();let count=0;
  for(let i=0;i<position.count;i++)if(position.getComponent(i,axis)>top-.025){pivot.add(new T.Vector3().fromBufferAttribute(position,i));count++;}pivot.divideScalar(count);pivot.setComponent(axis,top);return {part,position,normal,pivot};
 }):[];
 return {apply(amount,{fromCurrent=false,angle=pig?0:upright?-.50:.22}={}){const t=T.MathUtils.clamp(amount,0,1);for(const {part,position,normal,pivot}of tails){const a=part.geometry.attributes;for(let i=0;i<position.count;i++){
   const v=new T.Vector3().fromBufferAttribute(position,i),blend=T.MathUtils.smoothstep(v.distanceTo(pivot),pig?.015:.06,pig?.06:.25),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,pig?1:0,pig?0:1),angle*(fromCurrent?1:t)*blend),point=v.sub(pivot).applyQuaternion(q).add(pivot),norm=new T.Vector3().fromBufferAttribute(normal,i).applyQuaternion(q);
   if(fromCurrent){point.lerp(new T.Vector3().fromBufferAttribute(a.position,i),1-t);norm.lerp(new T.Vector3().fromBufferAttribute(a.normal,i),1-t);if(t>0&&t<1)norm.normalize();}
   a.position.setXYZ(i,point.x,point.y,point.z);a.normal.setXYZ(i,norm.x,norm.y,norm.z);
  }a.position.needsUpdate=a.normal.needsUpdate=true;}}};
}
