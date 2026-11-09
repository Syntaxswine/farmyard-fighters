import * as T from './vendor/three.module.js';
import {createCasualtyWeaponDrop} from './casualty-weapon-drop.js';
import {createEquipmentSurface} from './casualty-equipment-visual.js';
import {createFireEquipment} from './painted-fire-equipment.js';
import {solveLimb} from './idle-rig-math.js';
// A worn tank stays strapped to the casualty. Its dropped lance and loose hose
// remain connected until the lance has landed and the cosmetic fade completes.
// Add root at identity under an untransformed render-world scene parent.
export function createCasualtyWeaponAssembly(worker,profile){
 const weapon=worker.weapon,drop=createCasualtyWeaponDrop(weapon);if(!drop||!weapon.mount||!weapon.hose)return drop;
 const root=new T.Group();root.name='Tethered casualty equipment';root.add(drop.root);const equipment=createFireEquipment(worker,profile),surface=createEquipmentSurface(weapon.mount),updateHose=weapon.updateHose,visibility=[weapon.root,weapon.mount,weapon.hose].map(object=>({object,visible:object.visible}));
 const segments=18,sides=6,points=new Float32Array((segments+1)*sides*3),normals=new Float32Array(points.length),indices=[];for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides;indices.push(a,b,a+sides,b,b+sides,a+sides);}const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(points,3));geometry.setAttribute('normal',new T.BufferAttribute(normals,3));geometry.setIndex(indices);
 const material=weapon.hose.material.clone();material.onBeforeCompile=weapon.hose.material.onBeforeCompile;material.customProgramCacheKey=weapon.hose.material.customProgramCacheKey;const hose=new T.Mesh(geometry,material);hose.name='Connected casualty fuel hose';hose.frustumCulled=false;hose.raycast=()=>{};root.add(hose);weapon.updateHose=()=>{};
 let floor=0,disposed=false,limbs;const a=new T.Vector3(),b=new T.Vector3(),point=new T.Vector3(),tangent=new T.Vector3(),side=new T.Vector3(),normal=new T.Vector3(),up=new T.Vector3(),ring=new T.Vector3(),hips=worker.bones.find(b=>b.name==='hips'),spine=worker.bones.find(b=>b.name==='spine');
 function settleLimbs(weight){limbs??=[['thigh','shin','hoof'],['upperArm','forearm','hand']].flatMap(names=>[-1,1].map(side=>{const bones=names.map(name=>worker.bones.find(b=>b.name===name+side)),indices=new Set([worker.bones.indexOf(bones[2]),...(names[2]==='hand'?[worker.bones.findIndex(b=>b.name==='fingers'+side)]:[])]),samples=[];for(const part of worker.parts){const a=part.geometry.attributes;for(let i=0;i<a.position.count;i++){let w=0;for(let j=0;j<4;j++)if(indices.has(a.skinIndex.getComponent(i,j)))w+=a.skinWeight.getComponent(i,j);if(w>.8)samples.push([part,i]);}}return {bones,samples};}));
  const hand=limbs.slice(2).sort((a,b)=>a.bones[2].getWorldPosition(new T.Vector3()).y-b.bones[2].getWorldPosition(new T.Vector3()).y)[0];for(const {bones:[upper,lower,end],samples}of [...limbs.slice(0,2),hand]){const A=upper.getWorldPosition(new T.Vector3()),B=lower.getWorldPosition(new T.Vector3()),C=end.getWorldPosition(new T.Vector3()),rotation=end.getWorldQuaternion(new T.Quaternion()),reach=A.distanceTo(B)+B.distanceTo(C)-.0001;let minimum=Infinity;for(const [part,i]of samples)minimum=Math.min(minimum,part.getVertexPosition(i,point).applyMatrix4(part.matrixWorld).y);if(!Number.isFinite(minimum))continue;const target=C.clone();target.y=T.MathUtils.lerp(C.y,floor+.012+C.y-minimum,weight);const vertical=target.y-A.y,horizontal=new T.Vector3(target.x-A.x,0,target.z-A.z),radius=Math.sqrt(Math.max(.00001,reach*reach-vertical*vertical));if(Math.abs(vertical)>=reach)target.y=A.y-Math.sign(A.y-target.y)*reach*.98;if(horizontal.length()>radius)horizontal.setLength(radius);target.x=A.x+horizontal.x;target.z=A.z+horizontal.z;solveLimb(upper,lower,end,target,rotation,B.sub(A));}worker.root.updateMatrixWorld(true);worker.skeleton.update();
 }
 function preparePose({floor:support=floor,down=0}={}){if(disposed)return;if(!Number.isFinite(support))throw Error('Finite equipment support floor required');floor=support;equipment.reset();worker.root.updateMatrixWorld(true);
  // The rigid pack cannot support a corpse as a horizontal plank. Late in the
  // fall, roll wearer and strapped pack together onto a supported side rest.
  // The caller evaluates its fresh body pose before this study-local adjustment.
  const rest=T.MathUtils.smoothstep(down,.55,1);if(rest>0){const pivot=hips.getWorldPosition(new T.Vector3()),axis=spine.getWorldPosition(new T.Vector3()).sub(pivot).normalize();worker.root.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis,(profile.id==='skunk'?-1:1)*1.15*rest));worker.root.updateMatrixWorld(true);worker.root.position.add(pivot.sub(hips.getWorldPosition(new T.Vector3())));worker.root.updateMatrixWorld(true);worker.skeleton.update();}
  let minimum=surface.minimumY(weapon.mount.matrixWorld);if(rest>0)for(const part of worker.parts){const p=part.geometry.attributes.position;for(let i=0;i<p.count;i++)minimum=Math.min(minimum,part.getVertexPosition(i,point).applyMatrix4(part.matrixWorld).y);}
  if(rest>0||minimum<floor+.006){worker.root.position.y+=floor+.006-minimum;worker.root.updateMatrixWorld(true);worker.skeleton.update();}if(rest>0){settleLimbs(rest);let minimum=surface.minimumY(weapon.mount.matrixWorld);for(const part of worker.parts){const p=part.geometry.attributes.position;for(let i=0;i<p.count;i++)minimum=Math.min(minimum,part.getVertexPosition(i,point).applyMatrix4(part.matrixWorld).y);}if(minimum<floor+.006){worker.root.position.y+=floor+.006-minimum;worker.root.updateMatrixWorld(true);worker.skeleton.update();}}weapon.mount.visible=true;weapon.hose.visible=false;}
 function update(age){const state=drop.update(age);if(disposed)return state;weapon.mount.visible=true;weapon.hose.visible=false;if(age>=0)weapon.root.visible=false;
  weapon.anchors.hoseOut.getWorldPosition(a);const inlet=age<0?weapon.anchors.hoseIn:drop.root.getObjectByName('hoseIn');inlet.getWorldPosition(b);const curve=new T.CatmullRomCurve3([a.clone(),a.clone().add(new T.Vector3(-.03,-.12,.07)),b.clone().add(new T.Vector3(-.06,-.10,.08)),b.clone()]);
  for(let i=0;i<=segments;i++){curve.getPoint(i/segments,point);curve.getTangent(i/segments,tangent);up.set(0,Math.abs(tangent.y)>.95?0:1,Math.abs(tangent.y)>.95?1:0);side.crossVectors(tangent,up).normalize();normal.crossVectors(tangent,side).normalize();for(let j=0;j<sides;j++){const angle=j/sides*Math.PI*2;ring.copy(side).multiplyScalar(Math.cos(angle)).addScaledVector(normal,Math.sin(angle));const k=(i*sides+j)*3;points[k]=point.x+ring.x*.011;points[k+1]=Math.max(floor+.005,point.y+ring.y*.011);points[k+2]=point.z+ring.z*.011;normals[k]=ring.x;normals[k+1]=ring.y;normals[k+2]=ring.z;}}
  geometry.attributes.position.needsUpdate=geometry.attributes.normal.needsUpdate=true;material.opacity=state.opacity;const blend=state.opacity<1;if(material.transparent!==blend){material.transparent=blend;material.needsUpdate=true;}material.depthWrite=!blend;hose.visible=state.opacity>0;root.updateMatrixWorld(true);return {...state,assembly:'worn-tank',packVisible:weapon.mount.visible,hoseVisible:hose.visible,sockets:{out:a.toArray(),in:b.toArray()}};
 }
 return {root,preparePose,capture(matrix,options={}){floor=options.floor??0;return drop.capture(matrix,options);},update,dispose(){if(disposed)return;disposed=true;weapon.updateHose=updateHose;equipment.restore();for(const {object,visible}of visibility)object.visible=visible;drop.dispose();root.removeFromParent();geometry.dispose();material.dispose();}};
}

// Live combat captures a rigid visual without modifying the actor pose.

// Snapshot every currently displayed component in gun space. In particular the
// fuel pack and flexible hose must not be left floating in the living pose.
// The released assembly is a bounded rigid approximation, not a tether solver.
export function createCasualtyWeaponSnapshot(weapon,{floor,velocity}={}){
 if(!weapon?.anchors?.grip||!weapon.root.visible)return null;
 const roots=[weapon.root,weapon.mount,weapon.hose].filter((r,i,a)=>r?.visible&&a.indexOf(r)===i),inverse=new T.Matrix4().copy(weapon.root.matrixWorld).invert(),groups=new Map();
 for(const root of roots)root.traverse(mesh=>{
  if(!mesh.isMesh||mesh.isSkinnedMesh)return;let at=mesh;while(at&&at!==root.parent){if(!at.visible)return;at=at.parent;}
  const g=mesh.geometry,a=g.attributes,transform=inverse.clone().multiply(mesh.matrixWorld),normal=new T.Matrix3().getNormalMatrix(transform),parts=g.groups.length?g.groups:[{start:0,count:g.index?.count??a.position.count,materialIndex:0}];
  for(const range of parts){const material=Array.isArray(mesh.material)?mesh.material[range.materialIndex]:mesh.material;if(!groups.has(material))groups.set(material,{position:[],normal:[],uv:[],dropLocalPosition:[],dropLocalNormal:[]});const data=groups.get(material);
   for(let j=range.start;j<range.start+range.count;j++){const id=g.index?g.index.getX(j):j,p=new T.Vector3().fromBufferAttribute(a.position,id),n=new T.Vector3().fromBufferAttribute(a.normal,id);data.dropLocalPosition.push(...p.toArray());data.dropLocalNormal.push(...n.toArray());data.position.push(...p.applyMatrix4(transform).toArray());data.normal.push(...n.applyMatrix3(normal).normalize().toArray());data.uv.push(a.uv?.getX(id)||0,a.uv?.getY(id)||0);}
  }
 });
 if(groups.size>9)throw Error('Released assembly exceeds its nine-material budget');
 const root=new T.Group(),geometries=[];
 for(const [material,data]of groups){const g=new T.BufferGeometry();for(const [name,values]of Object.entries(data))g.setAttribute(name,new T.Float32BufferAttribute(values,name==='uv'?2:3));geometries.push(g);root.add(new T.Mesh(g,material));}
 let drop;try{
  drop=createCasualtyWeaponDrop({root,anchors:weapon.anchors});if(!drop){geometries.forEach(g=>g.dispose());return null;}
  drop.root.traverse(mesh=>{if(!mesh.isMesh)return;const material=mesh.material,original=material.onBeforeCompile,key=material.customProgramCacheKey();
   material.onBeforeCompile=function(shader,...args){original.call(this,shader,...args);shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 dropLocalPosition,dropLocalNormal;').replace('vPaintP=position;vPaintN=normal;','vPaintP=dropLocalPosition;vPaintN=dropLocalNormal;');};material.customProgramCacheKey=()=>key+';released-assembly-local-paint-v1';
  });
  drop.capture(weapon.root.matrixWorld,{floor,velocity});
 }catch(error){drop?.dispose();geometries.forEach(g=>g.dispose());throw error;}
 let disposed=false;return {root:drop.root,sourceRoots:roots,drawCalls:groups.size,update:drop.update,dispose(){if(disposed)return;disposed=true;drop.dispose();for(const g of geometries)g.dispose();}};
}
