import * as T from './vendor/three.module.js';
const V=()=>new T.Vector3();
// Fit the painted envelope to the approved mesh, including horns, long ears,
// hats, wings and tails. No character is resized to fit the horse's fire cards.
export function fireBodyZones(worker){
 worker.root.updateMatrixWorld(true);const skeleton=worker.parts[0].skeleton,bones=skeleton.bones,groups=new Map(),zones=[];
 function name(bone){const n=bone.name;return /^(hand|fingers)/.test(n)?'forearm'+n.replace(/^(hand|fingers)/,''):n;}
 function add(bone,p){const key=name(bone);let g=groups.get(key);if(!g){g={bone:bones.find(b=>b.name===key)||bone,box:new T.Box3()};groups.set(key,g);}g.box.expandByPoint(p);}
 for(const part of worker.parts){const a=part.geometry.attributes;
  if(/tail/.test(part.name)){const box=new T.Box3();for(let i=0;i<a.position.count;i++)box.expandByPoint(part.getVertexPosition(i,V()).applyMatrix4(part.matrixWorld));zones.push({part,box});continue;}
  for(let i=0;i<a.position.count;i++){let index=0,weight=-1;for(let k=0;k<4;k++)if(a.skinWeight.getComponent(i,k)>weight){weight=a.skinWeight.getComponent(i,k);index=a.skinIndex.getComponent(i,k);}add(bones[index],part.getVertexPosition(i,V()).applyMatrix4(part.matrixWorld));}
 }
 const head=bones.find(b=>b.name==='head');head.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh)return;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++)add(head,V().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld));});
 zones.push(...groups.values());
 for(const z of zones){const size=z.box.getSize(V());z.width=Math.max(.27,Math.max(size.x,size.z)*1.3+.10);z.height=Math.max(.34,size.y*1.2+.16);z.offset=z.bone?z.bone.worldToLocal(z.box.getCenter(V())):null;}
 return zones;
}
export function fireZoneCenter(zone){
 if(zone.bone)return zone.bone.localToWorld(zone.offset.clone());
 const box=new T.Box3(),a=zone.part.geometry.attributes.position;for(let i=0;i<a.count;i++)box.expandByPoint(zone.part.getVertexPosition(i,V()).applyMatrix4(zone.part.matrixWorld));return box.getCenter(V());
}
