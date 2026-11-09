import * as T from './vendor/three.module.js';
const v=(a=[0,0,0])=>new T.Vector3(...a);
// Tail clearance can require an offset pack. Route its straps over the actual
// torso rather than translating the generic harness beside the character.
export function fitIdlePack(worker,bones,weapon,profile){
 if(!weapon.mount)return ()=>{};
 const straps=weapon.parts.filter(p=>p.name==='backpack shoulder strap'),saved=straps.map(p=>p.geometry),body=[];
 worker.root.updateMatrixWorld(true);
 for(const p of worker.parts.filter(p=>/shirt|waistcoat|feathered body/.test(p.name))){const a=p.geometry.attributes.position;for(let i=0;i<a.count;i++){const point=v().fromBufferAttribute(a,i);p.applyBoneTransform(i,point);body.push(point.applyMatrix4(p.matrixWorld));}}
 const shoulder=bones.upperArm1.getWorldPosition(v()),width=Math.min(Math.abs(shoulder.z)*.75,.23),height=shoulder.y;
 function band(y,z){const samples=body.filter(p=>Math.abs(p.y-y)<.06&&Math.abs(p.z-z)<.045);return {front:samples.length?Math.max(...samples.map(p=>p.x)):.20,back:samples.length?Math.min(...samples.map(p=>p.x)):-.20};}
 for(let i=0;i<straps.length;i++){const side=i?1:-1,z=side*width,upper=band(height-.03,z),lower=band(height-.20,z),a=weapon.mount.localToWorld(v([0,.14,side*.105])),b=weapon.mount.localToWorld(v([0,-.14,side*.105]));
  const points=[a,v([upper.back-.014,height-.035,z]),v([(upper.back+upper.front)/2,height+.080,z]),v([upper.front+.020,height-.02,z]),v([lower.front+.020,height-.20,z]),v([(lower.back+lower.front)/2,height-.22,side*(width+.10)]),b].map(p=>weapon.mount.worldToLocal(p));
  straps[i].geometry=new T.TubeGeometry(new T.CatmullRomCurve3(points),28,.010,5,false);
 }
 return ()=>straps.forEach((p,i)=>{p.geometry.dispose();p.geometry=saved[i];});
}
