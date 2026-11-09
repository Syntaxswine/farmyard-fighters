import * as T from './vendor/three.module.js';
import {projectBloodStain} from './painted-blood-stain.js';

// Two most recently wounded actors, four retained patches each, merged into
// one skinned draw per actor. The ordinary/fatal pools add at most two draws.
export const BLOOD_STAIN_ACTORS=2,BLOOD_STAINS_PER_ACTOR=4,STAIN_VERTICES=3072,PATCH_VERTICES=768;
const identity=new T.Matrix4();
function geometry(){
 const g=new T.BufferGeometry();
 for(const [name,size,Type]of [['position',3,Float32Array],['normal',3,Float32Array],['uv',2,Float32Array],['woundDepth',1,Float32Array],['woundRect',4,Float32Array],['skinIndex',4,Uint16Array],['skinWeight',4,Float32Array]])g.setAttribute(name,new T.BufferAttribute(new Type(STAIN_VERTICES*size),size).setUsage(T.DynamicDrawUsage));
 g.setDrawRange(0,0);return g;
}
export class BloodStainBatches {
 constructor(texture){
  texture.colorSpace=T.SRGBColorSpace;
  this.material=new T.MeshBasicMaterial({map:texture,transparent:true,opacity:.94,depthTest:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  this.material.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float woundDepth;attribute vec4 woundRect;varying float vWoundDepth;varying vec4 vWoundRect;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWoundDepth=woundDepth;vWoundRect=woundRect;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vWoundDepth;varying vec4 vWoundRect;').replace('#include <map_fragment>','if(any(lessThan(vMapUv,vec2(0.0)))||any(greaterThan(vMapUv,vec2(1.0)))||abs(vWoundDepth)>.065)discard;\nvec4 stain=texture2D(map,vWoundRect.xy+clamp(vMapUv,vec2(.001),vec2(.999))*vWoundRect.zw);diffuseColor*=stain;if(diffuseColor.a<.015)discard;');
  };
  this.material.customProgramCacheKey=()=> 'battle-merged-entry-stains-v1';
  this.slots=Array.from({length:BLOOD_STAIN_ACTORS},()=>{const mesh=new T.SkinnedMesh(geometry(),this.material);mesh.name='Batched entry stains';mesh.frustumCulled=false;mesh.boundingBox=new T.Box3();mesh.boundingSphere=new T.Sphere();mesh.castShadow=mesh.receiveShadow=false;mesh.raycast=()=>{};mesh.visible=false;return {mesh,owner:null,root:null,patches:[],dirty:false,last:0};});
 }
 stamp(owner,worker,placement,now,{reduced=false}={}){
  const source=placement.surfaceSource;
  if(!source?.isSkinnedMesh||source.parent!==worker.root)return false;
  source.updateMatrix();if(!source.matrix.equals(identity))return false;
  const data=projectBloodStain({source,point:placement.contact,normal:placement.normal,variant:placement.visualSeed,maxVertices:PATCH_VERTICES});if(!data)return false;
  const allowed=reduced?this.slots.slice(0,1):this.slots;
  let slot=allowed.find(s=>s.owner===owner&&s.root===worker.root);
  if(!slot){slot=allowed.find(s=>s.owner===null)||allowed.reduce((a,b)=>a.last<b.last?a:b);this.release(slot);slot.owner=owner;slot.root=worker.root;worker.root.add(slot.mesh);}
  slot.last=now;slot.patches.push({source,data,region:placement.zone,versions:[]});if(slot.patches.length>BLOOD_STAINS_PER_ACTOR)slot.patches.shift();slot.dirty=true;this.syncSlot(slot);return true;
 }
 setMask(owner,mask){const slot=this.slots.find(s=>s.owner===owner);if(!slot)return;if(mask?.destroyed)slot.patches=slot.patches.filter(p=>p.region!=='head');if(!slot.patches.length){this.release(slot);return;}if(slot.mask!==mask||slot.maskDestroyed!==mask?.destroyed){slot.mask=mask;slot.maskDestroyed=mask?.destroyed;slot.dirty=true;}}
 syncSlot(slot){
  if(!slot.root)return;
  let dirty=slot.dirty;
  for(const patch of slot.patches){const a=(slot.mask?.originalGeometry(patch.source)||patch.source.geometry).attributes,next=[patch.source.visible,a.position,a.position.version,a.normal,a.normal.version,a.skinIndex,a.skinIndex.version,a.skinWeight,a.skinWeight.version,patch.source.skeleton];if(next.some((x,i)=>x!==patch.versions[i])){patch.versions=next;dirty=true;}}
  const source=slot.patches[0]?.source;if(!source)return;
  // Rebinding during a stance/weapon animation keeps the source's current
  // skeleton and refreshed original vertex weights; the batch owns neither.
  slot.mesh.skeleton=source.skeleton;slot.mesh.bindMode=source.bindMode;slot.mesh.bindMatrix.copy(source.bindMatrix);slot.mesh.bindMatrixInverse.copy(source.bindMatrixInverse);
  slot.mesh.boundingBox.makeEmpty();for(const p of slot.patches)if(p.source.visible&&p.source.boundingBox)slot.mesh.boundingBox.union(p.source.boundingBox);slot.mesh.boundingBox.getBoundingSphere(slot.mesh.boundingSphere);
  if(!dirty)return;
  const target=slot.mesh.geometry.attributes;let n=0;
  for(const patch of slot.patches){if(!patch.source.visible||patch.source.skeleton!==source.skeleton)continue;const a=(slot.mask?.originalGeometry(patch.source)||patch.source.geometry).attributes,d=patch.data;
   for(let t=0;t<d.selected.length&&n+3<=STAIN_VERTICES;t+=3){if([0,1,2].some(k=>d.selected[t+k]>=a.position.count||slot.mask&&!slot.mask.retainsOriginalVertex(patch.source,d.selected[t+k])))continue;
   for(let k=0;k<3;k++,n++){
    const i=t+k,id=d.selected[i];target.position.setXYZ(n,a.position.getX(id),a.position.getY(id),a.position.getZ(id));target.normal.setXYZ(n,a.normal.getX(id),a.normal.getY(id),a.normal.getZ(id));target.uv.setXY(n,d.uv[i*2],d.uv[i*2+1]);target.woundDepth.setX(n,d.depths[i]);target.woundRect.setXYZW(n,...d.cell.uv);
    for(const name of ['skinIndex','skinWeight'])target[name].setXYZW(n,...[0,1,2,3].map(k=>a[name].getComponent(id,k)));
   }}
  }
  for(const attribute of Object.values(target))attribute.needsUpdate=true;
  slot.mesh.geometry.setDrawRange(0,n);slot.mesh.visible=n>0;slot.dirty=false;
 }
 sync(){for(const slot of this.slots)this.syncSlot(slot);}
 reduce(){this.release(this.slots[1]);}
 release(slot){slot.mesh.removeFromParent();slot.mesh.visible=false;slot.mesh.geometry.setDrawRange(0,0);slot.mesh.skeleton=null;slot.owner=null;slot.root=null;slot.patches=[];slot.mask=null;slot.maskDestroyed=false;slot.dirty=false;}
 clear(){for(const slot of this.slots)this.release(slot);}
 dispose(){this.clear();for(const s of this.slots)s.mesh.geometry.dispose();this.material.dispose();}
}
