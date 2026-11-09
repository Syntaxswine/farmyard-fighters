import * as T from './vendor/three.module.js';
import {createCasualtyEquipmentVisual} from './casualty-equipment-visual.js';
const V=()=>new T.Vector3(),Q=()=>new T.Quaternion(),smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
// Cosmetic rigid-weapon release. The caller supplies the last held world matrix
// and the supporting floor; this does not create or remove a gameplay loot item.
export function createCasualtyWeaponDrop(weapon,{settle=.12,fade=.45}={}){
 if(!weapon?.root||!weapon.anchors?.grip)return null;
 if(!Number.isFinite(settle)||settle<0||!Number.isFinite(fade)||fade<=0)throw Error('Finite ground-settle and fade times required');
 const copy=createCasualtyEquipmentVisual(weapon.root),{root,vertices,center}=copy;root.name='Released casualty weapon';
 let snapshot,disposed=false;const rotation=new T.Matrix4(),position=V(),quaternion=Q();
 function lowest(q,scale){rotation.makeRotationFromQuaternion(q);const e=rotation.elements;let minimum=Infinity;for(const p of vertices)minimum=Math.min(minimum,p.x*scale.x*e[1]+p.y*scale.y*e[5]+p.z*scale.z*e[9]);return minimum;}
 function airOrientation(age){return quaternion.copy(snapshot.startQ).slerp(snapshot.landedQ,Math.min(age/snapshot.turnTime,1));}
 function gap(age){const q=airOrientation(age);return snapshot.start.y+snapshot.velocity.y*age-4.905*age*age+lowest(q,snapshot.scale)-snapshot.floor;}
 function capture(worldMatrix,{floor=0,velocity=new T.Vector3(.06,0,.65)}={}){
  if(disposed)throw Error('Weapon drop disposed');if(!worldMatrix?.isMatrix4||!worldMatrix.elements.every(Number.isFinite)||!Number.isFinite(floor)||![velocity.x,velocity.y,velocity.z].every(Number.isFinite))throw Error('Finite release world matrix, velocity and floor required');
  const start=V(),startQ=Q(),scale=V();worldMatrix.decompose(start,startQ,scale);if(Math.min(scale.x,scale.y,scale.z)<=0)throw Error('Positive weapon scale required');start.copy(center).applyMatrix4(worldMatrix);const minimum=start.y+lowest(startQ,scale);if(minimum<floor-1e-6)throw Error('Release pose penetrates the floor; fit the held weapon before capture');const direction=new T.Vector3(1,0,0).applyQuaternion(startQ),yaw=Math.atan2(-direction.z,direction.x),landedQ=Q().setFromAxisAngle(new T.Vector3(0,1,0),yaw).multiply(Q().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2)),support=Math.min(floor+.006,minimum);
  const height=Math.max(0,start.y+lowest(landedQ,scale)-support),turnTime=Math.max(.08,(velocity.y+Math.sqrt(velocity.y*velocity.y+19.62*height))/9.81);snapshot={start,startQ,scale,landedQ,turnTime,velocity:velocity.clone(),floor:support,flight:0};
  // Locate the first surface contact of the rotating model, rather than its
  // origin or a box corner. Bracket first, then refine for frame-rate independence.
  if(gap(0)>0){let lo=0,hi=turnTime;for(let i=1;i<=64;i++){hi=turnTime*i/64;if(gap(hi)<=0)break;lo=hi;}for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(gap(mid)>0)lo=mid;else hi=mid;}snapshot.flight=hi;}
  snapshot.contactQ=airOrientation(snapshot.flight).clone();root.scale.copy(scale);return update(-1);
 }
 function update(age){
  if(!Number.isFinite(age))throw Error('Finite weapon drop age required');if(disposed||!snapshot){root.visible=false;return {phase:'unprepared',visible:false,opacity:0};}
  const t=Math.max(0,age),landed=t>=snapshot.flight,after=t-snapshot.flight,opacity=age<0?1:1-smooth((after-settle)/fade),elapsed=Math.min(t,snapshot.flight);
  if(landed)quaternion.copy(snapshot.contactQ).slerp(snapshot.landedQ,smooth(after/Math.max(settle,.0001)));else airOrientation(t);
  position.copy(snapshot.start).addScaledVector(snapshot.velocity,elapsed);position.y=landed?snapshot.floor-lowest(quaternion,snapshot.scale):snapshot.start.y+snapshot.velocity.y*t-4.905*t*t;
  // Residual horizontal momentum dies away against the floor during settling.
  if(landed){const slide=Math.max(0,settle)*.35*(1-Math.exp(-Math.min(after,settle)*8/Math.max(settle,.0001)));position.x+=snapshot.velocity.x*slide;position.z+=snapshot.velocity.z*slide;}
  root.position.copy(age<0?snapshot.start:position);root.quaternion.copy(age<0?snapshot.startQ:quaternion);root.visible=age>=0&&opacity>0;
  copy.setOpacity(opacity);
  root.updateMatrixWorld(true);return {phase:age<0?'held':!landed?'falling':after<settle?'settling':opacity>0?'fading':'retired',visible:root.visible,opacity,flight:snapshot.flight,fadeStart:snapshot.flight+settle,duration:snapshot.flight+settle+fade,minimumY:root.position.y+lowest(root.quaternion,snapshot.scale),floor:snapshot.floor,position:root.position.toArray()};
 }
 return {root,capture,update,dispose(){if(disposed)return;disposed=true;copy.dispose();}};
}
