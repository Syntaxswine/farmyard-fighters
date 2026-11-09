import {createCliffMantle} from './cliff-mantle.js';
import {supportsRoofMantle} from './roof-journey.js';
export const supportsCliffMantle = supportsRoofMantle;
import {toWorld} from './hybrid-world.js';
import {cliffSupportAt} from './cliff-support.js';
import {passable,blockedEdge,terrainAt} from './core/maps.js';
export function cliffClearanceFrame(state,event,unit){
 if(event?.kind!=='cliff'||event.direction!=='up'||!supportsCliffMantle(unit))return null;
 const a=event.from,b=event.to,dx=b.x-a.x,dy=b.y-a.y;
 if(b.z!==a.z+1||Math.abs(dx)+Math.abs(dy)!==1||cliffSupportAt(state,a))return null;
 // The proof needs a straight exposed face and space for the lateral knee swing.
 for(const side of [-1,0,1]){
  const low={x:a.x-dy*side,y:a.y+dx*side,z:a.z},high={x:b.x-dy*side,y:b.y+dx*side,z:b.z};
  if(terrainAt(state,low.x,low.y,high.z)!=='void'||!passable(state,low)||!passable(state,high)||!cliffSupportAt(state,high)||blockedEdge(state,{...low,z:b.z},high))return null;
  if(state.props.some(p=>(p.z||0)===high.z&&Math.abs(p.x-high.x)<1&&Math.abs(p.y-high.y)<1))return null;
  if(side&&blockedEdge(state,b,high))return null;
  if(state.units.some(u=>u.id!==unit.id&&(u.hp>0||['bleeding','stable'].includes(u.casualty))&&((u.x===low.x&&u.y===low.y&&(u.z||0)===low.z)||(u.x===high.x&&u.y===high.y&&(u.z||0)===high.z))))return null;
 }
 return {origin:[a.x+dx*.5,a.z*2.12,a.y+dy*.5],heading:Math.atan2(dy,dx)*180/Math.PI};
}
// The newer mantle settles onto the cap before standing, requiring depth behind the lip.
export function cliffAnimationFrame(state,event,unit){
 const frame=cliffClearanceFrame(state,event,unit);if(!frame)return null;
 const a=event.from,b=event.to,dx=b.x-a.x,dy=b.y-a.y;
 for(const side of [-1,0,1]){
  const lip={x:b.x-dy*side,y:b.y+dx*side,z:b.z},inner={x:lip.x+dx,y:lip.y+dy,z:b.z};
  if(!passable(state,inner)||!cliffSupportAt(state,inner)||blockedEdge(state,lip,inner))return null;
  if(state.props.some(p=>(p.z||0)===inner.z&&Math.abs(p.x-inner.x)<1&&Math.abs(p.y-inner.y)<1))return null;
  if(state.units.some(u=>u.id!==unit.id&&!u.away&&(u.hp>0||['bleeding','stable'].includes(u.casualty))&&(u.z||0)===inner.z&&Math.hypot(u.x-inner.x,u.y-inner.y)<1.2))return null;
 }
 return frame;
}
// Entry/exit translations join the authored contacts to exact tactical tile centers.
export function createCliffJourney(worker,profile,event,frame){
 const clip=createCliffMantle(worker,profile),entry=.35,exit=.5,duration=entry+clip.duration+exit;
 const from=toWorld(event.from),to=toWorld({...event.to,cliffSupport:{level:event.from.z,height:2}});
 let equipmentState='carried';
 return {duration,climb:{get equipmentState(){return equipmentState;},get skeleton(){return clip.skeleton||worker.skeleton;}},apply(progress){
  const time=Math.max(0,Math.min(1,progress))*duration,p=Math.max(0,Math.min(1,(time-entry)/clip.duration)),pose=clip.apply(p,frame);
  equipmentState=p===0||p===1||pose.unarmed||worker.weapon?.id==='hands'?'carried':pose.equipment==='slung'?'stowed':'drawing';
  if(time<entry||time>entry+clip.duration){const target=time<entry?from:to,k=time<entry?1-time/entry:(time-entry-clip.duration)/exit,e=k*k*(3-2*k);worker.root.position.lerp({x:target[0],y:target[1],z:target[2]},e);worker.root.updateMatrixWorld(true);(clip.skeleton||worker.skeleton).update();}
  return {...pose,worldRoot:worker.root.position.toArray()};
 },dispose(){clip.dispose();}};
}
