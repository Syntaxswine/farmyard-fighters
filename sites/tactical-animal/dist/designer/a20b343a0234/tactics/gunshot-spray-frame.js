import * as T from './vendor/three.module.js';
import {impactFrame} from './shot-coordinates.js';
import {DIMENSIONS} from './hybrid-world.js';

// Render-world units (tiles). A bounded anatomical correction is cosmetic; it
// cannot change the victim, body region or combat result.
export const MAX_SPRAY_CONTACT_CORRECTION=.4;
const UP=new T.Vector3(0,1,0),SIDE=new T.Vector3(0,0,1);

// Capture the recorded living pose before casualty animation, including when
// reduced motion would otherwise jump directly to a fallen pose.
export function poseGunshotVictim(model,receipt){
 const {worker,root,posture,locomotion}=model,v=receipt.victim;
 root.position.set(0,0,0);worker.root.position.set(0,0,0);worker.pose('neutral');
 const fallen=receipt.hpBefore<=0&&['stable','bleeding','dead'].includes(receipt.casualtyBefore),pose=fallen?{down:1,stable:receipt.casualtyBefore==='stable'?1:0,dead:receipt.casualtyBefore==='dead'?1:0}:v.stance==='prone'?{prone:1}:v.stance==='kneeling'?{kneel:1}:{};
 const sample={heading:v.heading,distance:0,blend:0,pose};locomotion.apply(sample);posture.apply(sample,{equipment:false});if(Object.keys(pose).length)posture.ground();
 root.position.set(v.x,v.support.level*DIMENSIONS.floorSpacing+v.support.offset,v.y);root.updateMatrixWorld(true);worker.skeleton.update();
 for(const part of worker.parts){part.computeBoundingBox?.();part.computeBoundingSphere?.();}
}

function boneRegion(name){
 if(/^head$/i.test(name))return 'head';
 if(/^(thigh|shin|hoof|shank|foot)/i.test(name))return 'legs';
 if(/^(upperArm|forearm|hand|fingers|wing)/i.test(name))return 'arms';
 return 'torso';
}
function faceRegion(hit,a,b,c){
 const mesh=hit.object,g=mesh.geometry,indices=g.attributes.skinIndex,weights=g.attributes.skinWeight;
 // Explicit regions are useful for a rigid authored replacement, never for
 // arbitrary scene meshes. The caller still supplies this victim's parts only.
 if(!mesh.isSkinnedMesh||!indices||!weights)return mesh.userData.impactRegion||null;
 const local=mesh.worldToLocal(hit.point.clone()),bary=T.Triangle.getBarycoord(local,a,b,c,new T.Vector3());
 if(!bary)return null;
 const totals={head:0,torso:0,arms:0,legs:0};
 for(const [vertex,factor] of [[hit.face.a,bary.x],[hit.face.b,bary.y],[hit.face.c,bary.z]])for(let k=0;k<4;k++){
  const bone=mesh.skeleton.bones[indices.getComponent(vertex,k)];
  totals[boneRegion(bone?.name||'')]+=Math.max(0,factor)*weights.getComponent(vertex,k);
 }
 return Object.keys(totals).reduce((best,region)=>totals[region]>totals[best]?region:best,'torso');
}
function matchesRegion(resolved,surface){
 // The tactical torso includes arms. A weapon-region *body injury* may spray
 // from an arm/torso; held weapons and their attachments are never queried.
 return resolved==='head'?surface==='head':resolved==='legs'?surface==='legs':surface==='torso'||surface==='arms';
}
function nearbyRegionContact(receipt,frame,parts){
 const limit=MAX_SPRAY_CONTACT_CORRECTION,point=frame.contact,triangle=new T.Triangle(),closest=new T.Vector3(),normal=new T.Vector3();let best=null,bestDistance=limit;
 for(const source of parts){
  const g=source.geometry,index=g.index,count=index?index.count:g.attributes.position.count,cache=new Map();
  const vertex=i=>{if(!cache.has(i))cache.set(i,source.getVertexPosition(i,new T.Vector3()).applyMatrix4(source.matrixWorld));return cache.get(i);};
  if(source.boundingBox&&source.boundingBox.clone().applyMatrix4(source.matrixWorld).distanceToPoint(point)>limit)continue;
  for(let i=0;i<count;i+=3){
   const ia=index?index.getX(i):i,ib=index?index.getX(i+1):i+1,ic=index?index.getX(i+2):i+2,a=vertex(ia),b=vertex(ib),c=vertex(ic);
   if(point.x<Math.min(a.x,b.x,c.x)-bestDistance||point.x>Math.max(a.x,b.x,c.x)+bestDistance||point.y<Math.min(a.y,b.y,c.y)-bestDistance||point.y>Math.max(a.y,b.y,c.y)+bestDistance||point.z<Math.min(a.z,b.z,c.z)-bestDistance||point.z>Math.max(a.z,b.z,c.z)+bestDistance)continue;
   triangle.set(a,b,c);triangle.getNormal(normal);if(normal.dot(frame.incoming)>=-1e-6)continue;
   triangle.closestPointToPoint(point,closest);const distance=closest.distanceTo(point);if(distance>bestDistance)continue;
   const hit={object:source,point:closest,face:{a:ia,b:ib,c:ic}},inverse=new T.Matrix4().copy(source.matrixWorld).invert();
   if(!matchesRegion(receipt.zone,faceRegion(hit,a.clone().applyMatrix4(inverse),b.clone().applyMatrix4(inverse),c.clone().applyMatrix4(inverse))))continue;
   bestDistance=distance;best={contact:closest.clone(),normal:normal.clone(),correction:distance,part:source.name,source,faceIndex:i/3,reason:'region-contact'};
  }
 }
 return best;
}
function surfaceContact(receipt,frame,model){
 if(!model)return {reason:'collider-only'};
 if(model.victimId!==receipt.victimId)return {reason:'wrong-victim'};
 const parts=(model.parts||[]).filter(p=>p.visible&&p.isMesh&&!p.userData.characterBatch);
 if(!parts.length)return {reason:'no-body-parts'};
 const ray=new T.Raycaster(frame.contact.clone().addScaledVector(frame.incoming,-MAX_SPRAY_CONTACT_CORRECTION),frame.incoming,0,2*MAX_SPRAY_CONTACT_CORRECTION);
 ray.layers.enableAll(); // Original skinned parts may be on the pick-only layer.
 for(const part of parts)part.updateWorldMatrix(true,false);
 const hits=ray.intersectObjects(parts,false),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
 for(const hit of hits){
  if(!hit.face)continue;
  const mesh=hit.object;mesh.getVertexPosition(hit.face.a,a);mesh.getVertexPosition(hit.face.b,b);mesh.getVertexPosition(hit.face.c,c);
  if(!matchesRegion(receipt.zone,faceRegion(hit,a,b,c)))continue;
  const normal=new T.Triangle(a.clone().applyMatrix4(mesh.matrixWorld),b.clone().applyMatrix4(mesh.matrixWorld),c.clone().applyMatrix4(mesh.matrixWorld)).getNormal(new T.Vector3());
  // Ignore an exit/back face, even when the material is double-sided.
  if(normal.dot(frame.incoming)>=-1e-6)continue;
  const correction=hit.point.distanceTo(frame.contact);
  if(correction>MAX_SPRAY_CONTACT_CORRECTION+1e-6)continue;
  return {contact:hit.point,normal,correction,part:mesh.name,source:mesh,faceIndex:hit.faceIndex,reason:'skin-contact'};
 }
 // A probability-resolved hit can cross a gap between posed limbs. Keep its
 // region, choose the nearest entrance-facing triangle within the same small
 // radius, and let the trace end there. Never paint the empty collider shell.
 return nearbyRegionContact(receipt,frame,parts)||{reason:'no-matching-surface'};
}

// Call once at the discharge, after posing the victim at its captured impact
// pose and updating its bounds. Retain the result for the effect's lifetime.
// No camera, random source, scene traversal or simulation query is involved.
export function gunshotSprayFrame(receipt,{model}={}){
 const frame=impactFrame(receipt),surface=surfaceContact(receipt,frame,model),contact=(surface.contact||frame.contact).clone();
 contact.shotLevel=frame.contact.shotLevel;
 const outgoing=frame.incoming.clone().negate(); // Entrance spray, not an exit jet.
 const referenceUp=Math.abs(outgoing.dot(UP))>.999?SIDE:UP;
 const up=referenceUp.clone().addScaledVector(outgoing,-referenceUp.dot(outgoing)).normalize();
 const across=new T.Vector3().crossVectors(outgoing,up).normalize();
 const matrix=new T.Matrix4().makeBasis(outgoing,up,across).setPosition(contact);
 const correction=surface.correction||0;
 return {matrix,contact,colliderContact:frame.contact,origin:frame.origin,incoming:frame.incoming,outgoing,
  normal:surface.normal||null,correction,correctionAlongRay:contact.clone().sub(frame.contact).dot(frame.incoming),
  surfacePart:surface.part||null,surfaceSource:surface.source||null,placement:surface.reason,visualSeed:receipt.visualSeed,
  floor:receipt.victim.support.level*DIMENSIONS.floorSpacing+receipt.victim.support.offset};
}
