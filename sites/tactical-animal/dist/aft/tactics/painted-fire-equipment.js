import * as T from './vendor/three.module.js';
import {smooth,clamp} from './painted-fire-state.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion();

// The lance, pack and hose belong to one visual loadout. Dropping the lance
// must not leave its fuel pack floating on a vanished spine.
export function createFireEquipment(worker,profile={id:'horse'}){
 const gun=worker.weapon,root=worker.root,mountRest=gun?.mount?{p:gun.mount.position.clone(),q:gun.mount.quaternion.clone()}:null;
 const held=!!gun?.anchors.grip,id=gun?.id||'rifle',heavy=['hmg','rpg','flamethrower'].includes(id);
 const mountFit=mountRest?.p.clone();
 if(mountFit){const spine=worker.bones.find(b=>b.name==='spine').getWorldPosition(V());let back=Infinity;for(const part of worker.parts.filter(p=>/shirt|waistcoat/.test(p.name))){const a=part.geometry.attributes.position;for(let i=0;i<a.count;i++)if(Math.abs(a.getY(i)-spine.y)<.20&&Math.abs(a.getZ(i))<.20)back=Math.min(back,a.getX(i));}if(Number.isFinite(back))mountFit.x=Math.min(mountFit.x,back-spine.x-.015);if(profile.id==='skunk')mountFit.z=-.23;}
 const inverse=()=>root.matrixWorld.clone().invert();
 function rootTransform(object){const m=inverse().multiply(object.matrixWorld),p=V(),q=Q();m.decompose(p,q,V());return {p,q};}
 function place(object,p,q){const m=new T.Matrix4().compose(p,q,V(1,1,1)),parent=inverse().multiply(object.parent.matrixWorld).invert();parent.multiply(m).decompose(object.position,object.quaternion,object.scale);}
 function sync(){if(gun?.mount)gun.mount.visible=true;if(gun?.hose){gun.hose.visible=true;gun.updateHose(root);const a=gun.hose.geometry.attributes.position;for(let i=0;i<a.count;i++)if(a.getY(i)<.007)a.setY(i,.007);a.needsUpdate=true;gun.hose.geometry.computeVertexNormals();gun.hose.geometry.computeBoundingSphere();}root.updateMatrixWorld(true);}
 function reset(){if(mountRest){gun.mount.position.copy(mountFit);gun.mount.quaternion.copy(mountRest.q);}if(gun)gun.root.visible=held;}
 function captureObject(object,landed){
  const start=rootTransform(object),inv=object.matrixWorld.clone().invert(),vertices=[];
  object.traverse(m=>{const a=m.geometry?.attributes.position;if(!a)return;const matrix=inv.clone().multiply(m.matrixWorld);for(let i=0;i<a.count;i++)vertices.push(V().fromBufferAttribute(a,i).applyMatrix4(matrix));});
  const floor=q=>.006-Math.min(...vertices.map(p=>p.clone().applyQuaternion(q).y));
  return {start,landed,floor,flight:Math.sqrt(Math.max(0,2*(start.p.y-floor(landed))/9.81))};
 }
 function capture(){sync();const snapshot=captureObject(gun.root,Q().setFromEuler(new T.Euler(id==='rifle'?0:Math.PI/2,-.22,0,'YXZ')));if(gun.mount)snapshot.pack=captureObject(gun.mount,Q().setFromEuler(new T.Euler(0,-.35,Math.PI/2,'YXZ')));return snapshot;}
 function fallingTransform(snapshot,age,drift){const {start,landed,floor,flight}=snapshot,elapsed=Math.min(age,flight),q=start.q.clone().slerp(landed,smooth(age/Math.max(.01,flight*.85))),p=start.p.clone().addScaledVector(drift,elapsed);p.y=Math.max(floor(q),start.p.y-4.905*elapsed*elapsed);return {p,q};}
 function fall(snapshot,age){
  const {p,q}=fallingTransform(snapshot,age,V(.16,0,.55));gun.root.position.copy(p);gun.root.quaternion.copy(q);root.updateMatrixWorld(true);
  // A flexible hose is not a rigid strut: each released rigid piece settles on
  // its own surface while the hose continues to connect their actual sockets.
  if(snapshot.pack){const pack=fallingTransform(snapshot.pack,age,V(-.13,0,-.18));place(gun.mount,pack.p,pack.q);}
  sync();const flight=Math.max(snapshot.flight,snapshot.pack?.flight||0);return {age,flight,landed:age>=flight,height:p.y,progress:clamp(age/Math.max(flight,.001)),assembly:!!snapshot.pack};
 }
 return {held,id,heavy,reset,sync,capture,fall,restore(){if(mountRest){gun.mount.position.copy(mountRest.p);gun.mount.quaternion.copy(mountRest.q);}}};
}
