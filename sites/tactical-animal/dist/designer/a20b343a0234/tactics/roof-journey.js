import {createRoofMantle} from './roof-mantle.js';
import {createHenRoofMantle} from './hen-roof-mantle.js';
import {toWorld,DIMENSIONS} from './hybrid-world.js';
import {passable,blockedEdge,terrainAt} from './core/maps.js';
import {ledgeHeightFrame} from './ledge-height-frame.js';
import {movementSurface} from './movement-ground.js';
export function supportsRoofMantle(unit){return !!unit&&unit.hp>0&&!unit.away&&!unit.casualty&&(unit.species==='hen'?unit.weapon==='hands':['horse','goat','bull','cow','donkey','sheep','skunk','rabbit','dog','pig-foreman','pig-director'].includes(unit.species)&&['hands','rifle'].includes(unit.weapon));}
export function roofAnimationFrame(state,event,unit){
 if(event?.kind!=='roof'||event.direction!=='up'||!supportsRoofMantle(unit))return null;
 const a=event.from,b=event.to,dx=b.x-a.x,dy=b.y-a.y;
 if(b.z!==a.z+1||Math.abs(dx)+Math.abs(dy)!==1||terrainAt(state,a.x,a.y,b.z)!=='void'||!passable(state,a)||!passable(state,b)||blockedEdge(state,{...a,z:b.z},b))return null;
 const inner={x:b.x+dx,y:b.y+dy,z:b.z};if(!passable(state,inner)||blockedEdge(state,b,inner))return null;
 // The reviewed clip needs a clear landing strip. Raised parapets need their own route.
 if(state.props.some(p=>(p.z||0)===b.z&&(p.kind.includes('parapet')||!p.kind.startsWith('roof-'))&&Math.hypot(p.x-b.x,p.y-b.y)<2))return null;
 if(state.units.some(u=>u.id!==unit.id&&!u.away&&(u.hp>0||['bleeding','stable'].includes(u.casualty))&&(u.z||0)===b.z&&Math.hypot(u.x-(b.x+dx*.4),u.y-(b.y+dy*.4))<1.2))return null;
 const lower=movementSurface(state,a)?.height??a.z*DIMENSIONS.floorSpacing,upper=movementSurface(state,b)?.height??b.z*DIMENSIONS.floorSpacing;
 return {origin:[a.x+dx*.5,lower,a.y+dy*.5],ledgeHeight:upper-lower,fromWorld:[a.x,lower,a.y],toWorld:[b.x,upper,b.y],heading:Math.atan2(dy,dx)*180/Math.PI};
}
export function createRoofJourney(worker,profile,event,frame){
 const clip=profile.id==='hen'?createHenRoofMantle(worker,profile):createRoofMantle(worker,profile),entry=.35,exit=.5,duration=entry+clip.duration+exit,from=frame.fromWorld||toWorld(event.from),to=frame.toWorld||toWorld(event.to);let equipmentState='carried';
 return {duration,climb:{get equipmentState(){return equipmentState;},get skeleton(){return clip.skeleton||worker.skeleton;}},apply(progress){
  const time=Math.max(0,Math.min(1,progress))*duration,p=Math.max(0,Math.min(1,(time-entry)/clip.duration)),pose=clip.apply(p,ledgeHeightFrame(clip,p,frame));
  equipmentState=p===0||p===1||pose.unarmed?'carried':pose.equipment==='slung'?'stowed':'drawing';
  if(time<entry||time>entry+clip.duration){const target=time<entry?from:to,k=time<entry?1-time/entry:(time-entry-clip.duration)/exit,e=k*k*(3-2*k);worker.root.position.lerp({x:target[0],y:target[1],z:target[2]},e);worker.root.updateMatrixWorld(true);(clip.skeleton||worker.skeleton).update();}
  return {...pose,worldRoot:worker.root.position.toArray()};
 },dispose(){clip.dispose();}};
}
