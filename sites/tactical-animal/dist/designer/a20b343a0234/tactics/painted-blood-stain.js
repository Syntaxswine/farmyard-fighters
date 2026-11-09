import * as T from './vendor/three.module.js';
import {STAIN_CELLS} from './painted-blood-followup-data.js';
const v=()=>new T.Vector3(),finite=p=>p?.isVector3&&[p.x,p.y,p.z].every(Number.isFinite);
const projectionBuffers=new WeakMap();
export function prepareBloodProjection(parts){
 for(const part of parts){const g=part.geometry,count=g.attributes.position.count,old=projectionBuffers.get(g);if(!old||old.mark.length!==count)projectionBuffers.set(g,{world:new Float64Array(count*3),mark:new Uint8Array(count)});}
}
// Snapshot only the affected original triangles. Their bind positions and exact
// bone weights are retained, so the paint deforms with the existing skin. No
// second full body, shared texture mutation, or per-frame projection is needed.
export function projectBloodStain({source,point,normal,width=.18,height=.24,depth=.065,kind='entry',variant=0,roll=0,maxVertices=Infinity}={}){
 if(!source?.isMesh||!source.parent||!finite(point)||!finite(normal)||normal.lengthSq()<1e-8)throw Error('A body mesh and finite surface point/normal are required');
 if(!['entry','exit'].includes(kind)||![width,height,depth,roll,variant].every(Number.isFinite)||width<=0||height<=0||depth<=0||width>1||height>1||depth>.2)throw Error('Invalid stain dimensions or kind');
 if(Object.values(source.geometry.morphAttributes).some(a=>a.length))throw Error('Morph targets require an authored stain adapter');
 source.updateWorldMatrix(true,false);
 const z=normal.clone().normalize(),up=Math.abs(z.y)>.98?v().set(0,0,1):v().set(0,1,0),x=v().crossVectors(up,z).normalize(),y=v().crossVectors(z,x).normalize(),q=new T.Quaternion().setFromAxisAngle(z,roll);x.applyQuaternion(q);y.applyQuaternion(q);
 const attrs=source.geometry.attributes,index=source.geometry.index,total=index?index.count:attrs.position.count,positions=[],normals=[],indices=[],weights=[],uv=[],depths=[],n=v(),delta=v();
 const selected=[],a=v(),b=v(),c=v(),ab=v(),ac=v();prepareBloodProjection([source]);const cache=projectionBuffers.get(source.geometry);cache.mark.fill(0);
 const vertex=(id,out)=>{if(!cache.mark[id]){source.getVertexPosition(id,out).applyMatrix4(source.matrixWorld).toArray(cache.world,id*3);cache.mark[id]=1;}else out.fromArray(cache.world,id*3);};
 for(let t=0;t<total&&selected.length+3<=maxVertices;t+=3){
  const ia=index?index.getX(t):t,ib=index?index.getX(t+1):t+1,ic=index?index.getX(t+2):t+2;vertex(ia,a);vertex(ib,b);vertex(ic,c);
  n.crossVectors(ab.copy(b).sub(a),ac.copy(c).sub(a)).normalize();if(n.dot(z)<.15)continue;
  delta.copy(a).sub(point);const au=delta.dot(x)/width+.5,av=delta.dot(y)/height+.5,ad=delta.dot(z);
  delta.copy(b).sub(point);const bu=delta.dot(x)/width+.5,bv=delta.dot(y)/height+.5,bd=delta.dot(z);
  delta.copy(c).sub(point);const cu=delta.dot(x)/width+.5,cv=delta.dot(y)/height+.5,cd=delta.dot(z);
  if(Math.max(au,bu,cu)<0||Math.min(au,bu,cu)>1||Math.max(av,bv,cv)<0||Math.min(av,bv,cv)>1||Math.min(ad,bd,cd)>depth||Math.max(ad,bd,cd)<-depth)continue;
  for(let k=0;k<3;k++){
   const i=k===0?ia:k===1?ib:ic;positions.push(attrs.position.getX(i),attrs.position.getY(i),attrs.position.getZ(i));normals.push(attrs.normal.getX(i),attrs.normal.getY(i),attrs.normal.getZ(i));uv.push(k===0?au:k===1?bu:cu,k===0?av:k===1?bv:cv);depths.push(k===0?ad:k===1?bd:cd);selected.push(i);
   if(source.isSkinnedMesh)for(let j=0;j<4;j++){indices.push(attrs.skinIndex.getComponent(i,j));weights.push(attrs.skinWeight.getComponent(i,j));}
  }
 }
 if(!positions.length)return null;
 const cell=STAIN_CELLS[(Math.abs(Math.floor(variant))%2)*2+(kind==='exit'?1:0)];
 return {positions,normals,indices,weights,uv,depths,selected,cell};
}
export function createBloodStain(texture,options={}){
 const result=projectBloodStain(options);if(!result)return null;
 const {source,kind='entry',depth=.065}=options,{positions,normals,indices,weights,uv,depths,selected,cell}=result;
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setAttribute('woundDepth',new T.Float32BufferAttribute(depths,1));
 if(source.isSkinnedMesh){geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));}
 texture.colorSpace=T.SRGBColorSpace;
 const material=new T.MeshBasicMaterial({map:texture,transparent:true,opacity:.94,depthTest:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 material.onBeforeCompile=shader=>{
  shader.uniforms.woundRect={value:new T.Vector4(...cell.uv)};shader.uniforms.woundDepthLimit={value:depth};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float woundDepth;varying float vWoundDepth;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWoundDepth=woundDepth;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec4 woundRect;uniform float woundDepthLimit;varying float vWoundDepth;').replace('#include <map_fragment>','if(any(lessThan(vMapUv,vec2(0.0)))||any(greaterThan(vMapUv,vec2(1.0)))||abs(vWoundDepth)>woundDepthLimit)discard;\nvec4 stain=texture2D(map,woundRect.xy+clamp(vMapUv,vec2(.001),vec2(.999))*woundRect.zw);diffuseColor*=stain;if(diffuseColor.a<.015)discard;');
 };
 material.customProgramCacheKey=()=> 'painted-skinned-blood-stain-v1';
 const mesh=source.isSkinnedMesh?new T.SkinnedMesh(geometry,material):new T.Mesh(geometry,material);
 if(source.isSkinnedMesh){mesh.skeleton=source.skeleton;mesh.bindMode=source.bindMode;mesh.bindMatrix.copy(source.bindMatrix);mesh.bindMatrixInverse.copy(source.bindMatrixInverse);}
 mesh.name='Painted '+kind+' stain';mesh.frustumCulled=false;mesh.castShadow=mesh.receiveShadow=false;mesh.raycast=()=>{};source.add(mesh);
 let disposed=false;
 return {mesh,source,sourceVertices:selected,triangles:positions.length/9,kind,dispose(){if(disposed)return;disposed=true;mesh.removeFromParent();geometry.dispose();material.dispose();}};
}
// Visible wounds belong to the current battle. The encounter owner clears or
// disposes this layer at battle end/reset; never carry it into the next battle.
export function createBloodStainLayer(texture,{parts,maxStains=8}={}){
 if(!Array.isArray(parts)||!Number.isInteger(maxStains)||maxStains<1||maxStains>16)throw Error('Body parts and a stain cap of 1–16 are required');
 const allowed=new Set(parts),stains=[];let disposed=false;
 return {get stains(){return [...stains];},stamp(options){if(disposed)throw Error('Stain layer disposed');if(!allowed.has(options.source))throw Error('Stain source is not owned by this character');const stain=createBloodStain(texture,options);if(stain){stains.push(stain);if(stains.length>maxStains)stains.shift().dispose();}return stain;},clear(){for(const s of stains)s.dispose();stains.length=0;},dispose(){if(disposed)return;this.clear();disposed=true;}};
}
