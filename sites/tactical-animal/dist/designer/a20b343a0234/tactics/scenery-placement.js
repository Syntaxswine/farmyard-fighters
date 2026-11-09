import {MAP_LEVELS} from './map-layers.js';
import {isMachine,isScenery,sceneryRule,sceneryRotation,scenerySize,sceneryLocal,SCENERY_FLOOR} from './scenery-catalog.js';
import {factoryData} from './factory-gameplay.js';
import {geometryBoxHit} from './scenery-collision.js';
import {archPlacementErrors} from './stone-arches.js';

// Placement uses actual machine surfaces, not an invented operator footprint.
// This module stays independent of core/ and THREE for authored and live maps.
function intersects(p,data,min,max){
 const a=sceneryLocal(p,{x:min[0],y:min[1],h:min[2]},'render'),b=sceneryLocal(p,{x:max[0],y:max[1],h:max[2]},'render'),lo=[a.x,a.y,a.h].map((v,k)=>Math.min(v,[b.x,b.y,b.h][k])),hi=[a.x,a.y,a.h].map((v,k)=>Math.max(v,[b.x,b.y,b.h][k]));return geometryBoxHit(data,lo,hi);
}
export function sceneryPlacementErrors(map,extra=null,rules={},boundaries={}){
 const props=extra?[...(map.props||[]),extra]:map.props||[],errors=[];
 for(const p of props){
  if(isScenery(p))try{sceneryRotation(p);}catch(e){errors.push(e.message);continue;}
  if(!isMachine(p))continue;const data=factoryData(p),{w,h}=scenerySize(p),base=(p.z||0)*SCENERY_FLOOR,top=base+data.bounds[5];
  for(let z=0;z<MAP_LEVELS;z++){
   if(z<=(p.z||0)||z*SCENERY_FLOOR-.12>=top)continue;
   for(let y=p.y;y<p.y+h;y++)for(let x=p.x;x<p.x+w;x++){
    const terrain=map.upper?.[z-1]?.[`${x},${y}`]||(map.canopies||[]).some(q=>q.z===z&&x>=q.x&&y>=q.y&&x<q.x+2&&y<q.y+2);
    const stairs=(map.stairs||[]).some(q=>q.x===x&&q.y===y&&q.z===z-1);
    if(terrain&&terrain!=='void'&&!stairs&&intersects(p,data,[x-.5,y-.5,z*SCENERY_FLOOR-.12],[x+.5,y+.5,z*SCENERY_FLOOR]))errors.push('Insufficient headroom: the machine intersects an upper floor or ceiling.');
   }
  }
  for(const [key,kind]of Object.entries(map.edges||{})){
   const [axis,sx,sy,sz=0]=key.split(':'),z=+sz,x=+sx,y=+sy,rule=boundaries[kind];if(z<=(p.z||0)||z*SCENERY_FLOOR>=top||!rule?.solid)continue;
   const panels=rule.window?[[0,1,0,.85],[0,1,1.55,2],[0,.15,.85,1.55],[.85,1,.85,1.55]]:[[0,1,0,2]];
   for(const [a,b,lo,hi]of panels){const min=axis==='e'?[x+.42,y-.5+a,z*SCENERY_FLOOR+lo]:[x-.5+a,y+.42,z*SCENERY_FLOOR+lo],max=axis==='e'?[x+.58,y-.5+b,z*SCENERY_FLOOR+hi]:[x-.5+b,y+.58,z*SCENERY_FLOOR+hi];if(intersects(p,data,min,max))errors.push('Insufficient headroom: the machine intersects an upper wall or solid boundary.');}
  }
  for(const q of props){if(q===p||(q.z||0)===(p.z||0))continue;const z=q.z||0;if(z*SCENERY_FLOOR>top||z*SCENERY_FLOOR+3<base)continue;
   const rule=sceneryRule(q)||rules[q.kind]||{},height=rule.height??(rule.tall?2:rule.solid?.8:0);if(!height)continue;const size=isScenery(q)?scenerySize(q):{w:q.rotated?rule.h||1:rule.w||1,h:q.rotated?rule.w||1:rule.h||1};if(intersects(p,data,[q.x-.5,q.y-.5,z*SCENERY_FLOOR],[q.x+size.w-.5,q.y+size.h-.5,z*SCENERY_FLOOR+height]))errors.push('The machine intersects an object on another level.');
  }
 }
 return [...new Set([...errors,...archPlacementErrors(map,extra,rules,boundaries)])];
}
