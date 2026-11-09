import * as T from './vendor/three.module.js';
import {BLOOD_CELLS} from './painted-blood-spray-data.js';
import {createBloodSprayMotion} from './painted-blood-spray-motion.js';
// One preallocated instanced draw for one asset preview/emitter. The builder
// owns hit contacts, orientation, event lifetime, visibility and the global pool.
// setFrame uses a rigid, unscaled render-world transform. Keep mesh at identity
// under an untransformed scene/root: gravity and the camera basis are world-space.
export function createPaintedBloodSpray(texture,options={}){
 return createPaintedBloodCards(texture,createBloodSprayMotion(options),BLOOD_CELLS);
}
// Shared drawing path; ordinary entry motion and texture remain unchanged.
export function createPaintedBloodCards(texture,motion,cells){
 const n=motion.buffer.count,geometry=new T.PlaneGeometry(1,1),rect=new Float32Array(n*4),alpha=new Float32Array(n);
 geometry.setAttribute('sprayRect',new T.InstancedBufferAttribute(rect,4));geometry.setAttribute('sprayAlpha',new T.InstancedBufferAttribute(alpha,1));
 texture.colorSpace=T.SRGBColorSpace;texture.minFilter=T.LinearMipmapLinearFilter;
 const material=new T.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,toneMapped:false,uniforms:{map:{value:texture}},
  vertexShader:'attribute vec4 sprayRect;attribute float sprayAlpha;varying vec2 vUv;varying float vAlpha;void main(){vUv=sprayRect.xy+uv*sprayRect.zw;vAlpha=sprayAlpha;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',
  fragmentShader:'uniform sampler2D map;varying vec2 vUv;varying float vAlpha;void main(){vec4 c=texture2D(map,vUv);c.a*=vAlpha;if(c.a<.015)discard;gl_FragColor=c;\n#include <colorspace_fragment>\n}'});
 const mesh=new T.InstancedMesh(geometry,material,n);mesh.name='Painted blood spray · canonical +X';mesh.frustumCulled=false;mesh.castShadow=mesh.receiveShadow=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
 const frame=new T.Matrix4(),basis=new T.Matrix3(),dummy=new T.Object3D(),point=new T.Vector3(),velocity=new T.Vector3(),right=new T.Vector3(),up=new T.Vector3(),axis=new T.Vector3(),q=new T.Quaternion(),spin=new T.Quaternion(),Z=new T.Vector3(0,0,1);let disposed=false;
 for(let i=0;i<n;i++)rect.set(cells[motion.buffer.tile[i]].uv,i*4);
 function update(time,camera,{still=false,floor=-Infinity,floorAt,visibleAt}={}){
  if(disposed)return;const b=motion.sample(time,{still});camera.getWorldQuaternion(q);right.set(1,0,0).applyQuaternion(q);up.set(0,1,0).applyQuaternion(q);basis.setFromMatrix4(frame);
  let visible=0;
  for(let i=0;i<n;i++){
   const k=i*3,s=i*2,cell=cells[b.tile[i]];point.fromArray(b.launch,k).applyMatrix4(frame);point.y+=b.fall[i];velocity.fromArray(b.tangent,k).applyMatrix3(basis);velocity.y+=b.gravityVelocity[i];
   const angle=Math.atan2(velocity.dot(up),velocity.dot(right))+b.spin[i];spin.setFromAxisAngle(Z,angle);dummy.quaternion.copy(q).multiply(spin);
   // Preserve the painted root rather than centring a fan over the contact.
   axis.set(1,0,0).applyQuaternion(dummy.quaternion);point.addScaledVector(axis,(.5-cell.pivot[0])*b.size[s]);axis.set(0,1,0).applyQuaternion(dummy.quaternion);point.addScaledVector(axis,(.5-cell.pivot[1])*b.size[s+1]);
   dummy.position.copy(point);dummy.scale.set(b.size[s],b.size[s+1],1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   const halfY=(Math.abs(dummy.matrix.elements[1])+Math.abs(dummy.matrix.elements[5]))*.5;
   alpha[i]=point.y-halfY<(floorAt?floorAt(i):floor)||visibleAt&&!visibleAt(point,i)?0:b.alpha[i];if(alpha[i]>.015)visible++;
  }
  geometry.attributes.sprayAlpha.needsUpdate=true;mesh.instanceMatrix.needsUpdate=true;mesh.visible=visible>0;return {liveCards:visible,capacity:n,drawCalls:visible?1:0};
 }
 return {mesh,motion,setFrame(matrix){frame.copy(matrix);},update,dispose(){if(disposed)return;disposed=true;mesh.removeFromParent();geometry.dispose();material.dispose();}};
}
