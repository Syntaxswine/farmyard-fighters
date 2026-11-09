import * as T from './vendor/three.module.js';
export const v=(a=[0,0,0])=>new T.Vector3(...a),q=()=>new T.Quaternion();
export function rotateWorld(bone,rotation){bone.quaternion.copy(bone.parent.getWorldQuaternion(q()).invert().multiply(rotation));bone.updateWorldMatrix(false,true);}
export const snapshot=bones=>bones.map(b=>({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
export function restore(rows){for(const {b,p,q,s}of rows){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s);}}
function frame(axis,normal){const x=axis.clone().normalize(),z=normal.clone().normalize(),y=z.clone().cross(x).normalize();return new T.Matrix4().makeBasis(x,y,z);}
// Move a two-bone chain without stretching it or discarding its bend-plane twist.
export function solveLimb(a,b,c,target,endRotation,pole=null){
 const A=a.getWorldPosition(v()),B=b.getWorldPosition(v()),C=c.getWorldPosition(v()),qa=a.getWorldQuaternion(q()),qb=b.getWorldQuaternion(q()),ab=B.clone().sub(A),bc=C.clone().sub(B),la=ab.length(),lb=bc.length(),axis=target.clone().sub(A),d=axis.length();
 if(d>la+lb+1e-6||d<Math.abs(la-lb)-1e-6)throw Error('Idle limb outside native reach: '+a.name+' '+d.toFixed(4)+' / '+(la+lb).toFixed(4));
 axis.normalize();const bend=(pole||ab).clone().addScaledVector(axis,-(pole||ab).dot(axis));if(bend.lengthSq()<1e-10)bend.set(1,0,0).addScaledVector(axis,-axis.x);bend.normalize();
 const along=(la*la-lb*lb+d*d)/(2*d),mid=A.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,la*la-along*along))),toA=mid.clone().sub(A),toB=target.clone().sub(mid);
 const n0=ab.clone().cross(bc);if(n0.lengthSq()<1e-12)n0.copy(ab.clone().cross(bend));const n1=toA.clone().cross(toB);if(n1.lengthSq()<1e-12)n1.copy(axis.clone().cross(bend));
 const map=(from,to)=>q().setFromRotationMatrix(frame(to,n1).multiply(frame(from,n0).invert()));
 rotateWorld(a,map(ab,toA).multiply(qa));rotateWorld(b,map(bc,toB).multiply(qb));rotateWorld(c,endRotation);
 return c.getWorldPosition(v()).distanceTo(target);
}
