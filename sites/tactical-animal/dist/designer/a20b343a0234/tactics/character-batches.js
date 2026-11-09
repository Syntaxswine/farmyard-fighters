import * as T from './vendor/three.module.js';

// Keep the authored meshes for rig corrections and precise body picking. Only
// their draw submissions are replaced. This layer is never enabled on a camera.
export const CHARACTER_PICK_LAYER=31;
const identity=new T.Matrix4(),noop=()=>{};
function description(p,root){
 const g=p.geometry,m=p.material;
 if(!p.isSkinnedMesh||p.parent!==root||!m||Array.isArray(m)||m.transparent||g.groups.length||Object.keys(g.morphAttributes).length)return null;
 if(p.matrixAutoUpdate)p.updateMatrix();
 if(!p.matrix.equals(identity)||!p.skeleton)return null;
 const names=Object.keys(g.attributes).sort(),count=g.attributes.position.count;
 if(names.some(n=>{const a=g.attributes[n];return a.isInterleavedBufferAttribute||a.count!==count;}))return null;
 const layout=names.map(n=>{const a=g.attributes[n];return `${n}:${a.array.constructor.name}:${a.itemSize}:${a.normalized}:${a.gpuType}`;}).join('|');
 return {p,names,count,key:[m.id,p.skeleton.uuid,p.bindMode,...p.bindMatrix.elements,layout,p.renderOrder,p.castShadow,p.receiveShadow,p.customDepthMaterial?.id,p.customDistanceMaterial?.id].join(';')};
}

export class CharacterBatches{
 constructor(worker,parent){this.worker=worker;this.parent=parent;this.groups=new Map();this.layers=new Map();}
 sync(){
  // A controller can temporarily rebind the hen, replace a grip's index/skin,
  // change material, hide a body, or edit vertices. Re-read those contracts after
  // posing; never freeze a copied bind pose or take ownership of its skeleton.
  for(const [p,mask]of this.layers)p.layers.mask=mask;
  this.layers.clear();
  const wanted=new Map();
  for(const p of this.worker.parts){const d=description(p,this.worker.root);if(!d||p.layers.mask!==1)continue;if(!wanted.has(d.key))wanted.set(d.key,[]);wanted.get(d.key).push(d);}
  const next=new Map();
  for(const [key,parts]of wanted){
   if(parts.length<2)continue;
   const layout=parts.map(d=>`${d.p.id}:${d.count}:${d.p.geometry.index?.count??d.count}`).join(','),old=this.groups.get(key);
   let group=old;
   if(!group||group.layout!==layout){if(group)this.release(group);group=this.create(parts,layout);}
   this.update(group,parts);next.set(key,group);
   for(const {p}of parts){this.layers.set(p,p.layers.mask);p.layers.set(CHARACTER_PICK_LAYER);}
  }
  for(const [key,group]of this.groups)if(!next.has(key))this.release(group);
  this.groups=next;
 }
 create(parts,layout){
  const first=parts[0].p,g=new T.BufferGeometry(),vertices=parts.reduce((n,p)=>n+p.count,0),indices=parts.reduce((n,{p,count})=>n+(p.geometry.index?.count??count),0);
  for(const name of parts[0].names){const a=first.geometry.attributes[name],copy=new T.BufferAttribute(new a.array.constructor(vertices*a.itemSize),a.itemSize,a.normalized);copy.gpuType=a.gpuType;copy.setUsage(T.DynamicDrawUsage);g.setAttribute(name,copy);}
  g.setIndex(new T.BufferAttribute(new Uint32Array(indices),1).setUsage(T.DynamicDrawUsage));
  const mesh=new T.SkinnedMesh(g,first.material);mesh.name='Batched character body';mesh.userData.characterBatch=true;
  mesh.bindMode=first.bindMode;mesh.bind(first.skeleton,first.bindMatrix);mesh.frustumCulled=true;mesh.raycast=noop;
  mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.renderOrder=first.renderOrder;
  mesh.customDepthMaterial=first.customDepthMaterial;mesh.customDistanceMaterial=first.customDistanceMaterial;
  // Reuse the source bounds already updated by gameplay posing, rather than
  // skinning the same vertices again for the render-only copy. The sphere culls
  // camera/shadow draws; leave the object box empty so aggregate picking bounds
  // continue to use the original, individually transformed part boxes.
  mesh.boundingBox=new T.Box3();mesh.boundingSphere=new T.Sphere();mesh.matrixAutoUpdate=false;this.parent.add(mesh);
  return {mesh,layout,bounds:new T.Box3(),rows:parts.map(()=>({attributes:{}}))};
 }
 update(group,parts){
  const g=group.mesh.geometry;let vertex=0,index=0,indexChanged=false;group.bounds.makeEmpty();
  for(const [i,{p,names,count}]of parts.entries()){
   const row=group.rows[i],source=p.geometry;
   for(const name of names){const a=source.attributes[name],old=row.attributes[name];if(!old||old.attribute!==a||old.version!==a.version){g.attributes[name].array.set(a.array,vertex*a.itemSize);g.attributes[name].needsUpdate=true;row.attributes[name]={attribute:a,version:a.version};}}
   const start=source.drawRange.start,length=p.visible?Math.max(0,Math.min((source.index?.count??count)-start,source.drawRange.count)):0;
   if(row.index!==source.index||row.version!==source.index?.version||row.start!==start||row.length!==length||row.offset!==index){
    for(let j=0;j<length;j++)g.index.array[index+j]=(source.index?source.index.getX(start+j):start+j)+vertex;
    indexChanged=true;Object.assign(row,{index:source.index,version:source.index?.version,start,length,offset:index});
   }
   index+=length;vertex+=count;
   if(p.visible){if(!p.boundingBox)p.computeBoundingBox();group.bounds.union(p.boundingBox);}
  }
  if(indexChanged)g.index.needsUpdate=true;
  g.setDrawRange(0,index);group.mesh.visible=index>0&&this.worker.root.visible;
  group.bounds.getBoundingSphere(group.mesh.boundingSphere);
  // Stay outside the authored rig: temporary animation controllers snapshot and
  // restore its descendants. A render-only copy must never enter that snapshot.
  this.worker.root.updateWorldMatrix(true,false);this.parent.updateWorldMatrix(true,false);
  group.mesh.matrix.copy(this.parent.matrixWorld).invert().multiply(this.worker.root.matrixWorld);
 }
 release(group){group.mesh.removeFromParent();group.mesh.geometry.dispose();}
 dispose(){for(const [p,mask]of this.layers)p.layers.mask=mask;this.layers.clear();for(const g of this.groups.values())this.release(g);this.groups.clear();}
}
