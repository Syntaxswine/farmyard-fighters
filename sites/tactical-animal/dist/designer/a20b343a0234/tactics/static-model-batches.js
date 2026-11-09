import * as T from './vendor/three.module.js';

// For generated scenery whose children never move. Rebuilt maps get a new
// owner; moving the whole root/parent still refreshes every world transform.
export class StaticSubtreeMatrices {
 constructor(root){
  this.root=root;this.entries=[];root.updateWorldMatrix(true,true);this.world=root.matrixWorld.clone();
  root.traverse(o=>{if(o===root)return;this.entries.push({o,local:o.matrixAutoUpdate,world:o.matrixWorldAutoUpdate});o.matrixAutoUpdate=o.matrixWorldAutoUpdate=false;});
 }
 sync(){
  this.root.updateWorldMatrix(true,false);if(this.world.equals(this.root.matrixWorld))return;
  for(const {o}of this.entries)o.matrixWorldAutoUpdate=true;
  this.root.updateWorldMatrix(true,true);this.world.copy(this.root.matrixWorld);
  for(const {o}of this.entries)o.matrixWorldAutoUpdate=false;
 }
 dispose(){for(const {o,local,world}of this.entries){o.matrixAutoUpdate=local;o.matrixWorldAutoUpdate=world;}this.entries=[];}
}

// Exact static triangles grouped within their existing parent. Animated groups,
// named anchors and material state keep their ownership and transforms.
export class StaticModelBatches {
 constructor(root){
  this.groups=[];const parents=[];root.traverse(o=>{if(!o.isMesh)parents.push(o);});
  for(const parent of parents){
   if(parent.name==='flames')continue;const groups=new Map();
   for(const part of parent.children){
    const g=part.geometry,m=part.material;
    if(!part.isMesh||part.isSkinnedMesh||part.isInstancedMesh||!part.visible||!part.matrixAutoUpdate||part.scale.x*part.scale.y*part.scale.z<=0||part.userData.flicker||part.customDepthMaterial||part.customDistanceMaterial||!m||Array.isArray(m)||m.transparent||Object.keys(g.morphAttributes).length||g.drawRange.start!==0||g.drawRange.count!==Infinity)continue;
    const names=Object.keys(g.attributes).sort(),count=g.attributes.position.count;
    if(names.some(n=>g.attributes[n].isInterleavedBufferAttribute||g.attributes[n].count!==count))continue;
    const layout=names.map(n=>{const a=g.attributes[n];return `${n}:${a.array.constructor.name}:${a.itemSize}:${a.normalized}`;}).join('|');
    const key=[m.id,layout,part.castShadow,part.receiveShadow,!!part.userData.noShadow,part.layers.mask,part.renderOrder].join(';');
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(part);
   }
   for(const parts of groups.values())if(parts.length>1)this.groups.push(this.merge(parent,parts));
  }
 }
 merge(parent,parts){
  const g=new T.BufferGeometry(),names=Object.keys(parts[0].geometry.attributes),vertices=parts.reduce((n,p)=>n+p.geometry.attributes.position.count,0),indices=parts.reduce((n,p)=>n+(p.geometry.index?.count??p.geometry.attributes.position.count),0);
  for(const name of names){const a=parts[0].geometry.attributes[name],copy=new T.BufferAttribute(new a.array.constructor(vertices*a.itemSize),a.itemSize,a.normalized);copy.gpuType=a.gpuType;g.setAttribute(name,copy);}
  const index=new Uint32Array(indices);let vertex=0,offset=0;
  for(const part of parts){
   part.updateMatrix();const copy=part.geometry.clone().applyMatrix4(part.matrix),count=copy.attributes.position.count;
   for(const name of names)g.attributes[name].array.set(copy.attributes[name].array,vertex*copy.attributes[name].itemSize);
   for(let i=0;i<(copy.index?.count??count);i++)index[offset++]=(copy.index?copy.index.getX(i):i)+vertex;
   vertex+=count;copy.dispose();part.visible=false;
  }
  g.setIndex(new T.BufferAttribute(index,1));g.computeBoundingBox();g.computeBoundingSphere();
  const first=parts[0],mesh=new T.Mesh(g,first.material);mesh.name='Batched static model';mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.userData.noShadow=!!first.userData.noShadow;mesh.layers.mask=first.layers.mask;mesh.renderOrder=first.renderOrder;mesh.matrixAutoUpdate=false;parent.add(mesh);
  return {mesh,parts};
 }
 dispose(){for(const {mesh,parts}of this.groups){mesh.removeFromParent();mesh.geometry.dispose();for(const p of parts)p.visible=true;}this.groups=[];}
}
