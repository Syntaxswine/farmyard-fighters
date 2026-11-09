import * as T from './vendor/three.module.js';
import {shotPoint,shotVisible} from './shot-coordinates.js';
export {shotPoint} from './shot-coordinates.js';
export const TRACE_VERTICES=8192;
// Independent visible runs can enter and leave fog; never join across a hidden
// gap or require a visible muzzle. Easy's scenery reveal is not sight.
export function visibleShotSegments(state,points){
 const result=[];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],steps=Math.max(1,Math.ceil(a.distanceTo(b)/.15));let previous=a;
  for(let j=1;j<=steps;j++){
   const p=a.clone().lerp(b,j/steps);
   if(a.shotLevel===b.shotLevel)p.shotLevel=a.shotLevel;else if(j===steps)p.shotLevel=b.shotLevel;
   if(shotVisible(state,previous)&&shotVisible(state,p))result.push(previous,p);
   previous=p;
  }
 }
 return result;
}
// Compatibility helper for callers needing the first continuous visible run.
export function visibleShotPath(state,points){
 const segments=visibleShotSegments(state,points);if(!segments.length)return [];
 const result=[segments[0],segments[1]];
 for(let i=2;i<segments.length&&segments[i].equals(result.at(-1));i+=2)result.push(segments[i+1]);
 return result;
}
export class BattleShotEffects {
 constructor(scene){
  this.flash=new T.Mesh(new T.SphereGeometry(.035,8,6),new T.MeshBasicMaterial({color:0xffdf83,toneMapped:false}));this.flash.scale.set(2.8,1,1);
  this.trace=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:0xffd893,transparent:true,opacity:.8,toneMapped:false}));
  this.trace.geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(TRACE_VERTICES*3),3).setUsage(T.DynamicDrawUsage));this.trace.geometry.setDrawRange(0,0);this.trace.frustumCulled=false;
  this.impact=new T.Mesh(new T.OctahedronGeometry(.07),new T.MeshBasicMaterial({color:0xd5b78a,transparent:true,opacity:.8,toneMapped:false}));
  scene.add(this.flash,this.trace,this.impact);this.hide();
 }
 hide(){this.flash.visible=this.trace.visible=this.impact.visible=false;}
 update(active,state,muzzle){
  const {event,phase}=active,shot=event.trajectories[0];if(!shot)return;
  const endpoint=active.bodyVisualContacts?.get(shot.projectileId)||shotPoint(shot,state);
  if(muzzle&&active.shooterVisible!==false&&phase.flash&&shotVisible(state,muzzle.origin)){this.flash.visible=true;this.flash.position.copy(muzzle.origin);this.flash.quaternion.setFromUnitVectors(new T.Vector3(1,0,0),muzzle.direction);}
  if(phase.trace){
   // Use the actual model muzzle when available. Rendering never retraces or
   // changes damage; every endpoint comes from the resolved gameplay event.
   if(!active.traceOrigin){active.traceOrigin=muzzle?.origin.clone()||(shot.origin?shotPoint({...shot.origin,unitId:event.shooter},state):null);if(active.traceOrigin&&shot.origin?.support)active.traceOrigin.shotLevel=shot.origin.support.level;}
   const segments=[];
   if(active.traceOrigin)for(const trajectory of event.trajectories){
    const path=(trajectory.path||[trajectory]).map(p=>shotPoint(p,state)),contact=active.bodyVisualContacts?.get(trajectory.projectileId);if(contact)path[path.length-1]=contact;
    segments.push(...visibleShotSegments(state,[active.traceOrigin,...path]));
   }
   const count=Math.min(TRACE_VERTICES,segments.length),position=this.trace.geometry.attributes.position;
   for(let i=0;i<count;i++)position.setXYZ(i,segments[i].x,segments[i].y,segments[i].z);
   this.trace.geometry.setDrawRange(0,count);position.needsUpdate=true;this.trace.visible=count>0;
  }
  const knownVictim=shot.kind!=='unit'||active.knownUnitIds.includes(shot.unitId)||state.units.some(u=>u.id===shot.unitId&&u.team==='squad');
  if(phase.impact&&shot.kind!=='range'&&!(shot.kind==='unit'&&active.paintedBodyImpact&&active.bodyVisualContacts?.has(shot.projectileId))&&shotVisible(state,endpoint)&&knownVictim){this.impact.visible=true;this.impact.position.copy(endpoint);this.impact.material.color.setHex(shot.kind==='unit'?0xd18463:0xd5b78a);}
 }
 dispose(){for(const mesh of [this.flash,this.trace,this.impact]){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}}
}
