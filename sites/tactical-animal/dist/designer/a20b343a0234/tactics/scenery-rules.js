import {HELICOPTER_DATA} from './helicopter-gameplay-data.js';
import {sceneryRule,isHelicopter,isMachine,isStoneArch,isPhysicalScenery,sceneryLocal,scenerySize,sceneryDirection,SCENERY_FLOOR} from './scenery-catalog.js';
import {stoneArchData} from './stone-arch-geometry.js';
import {geometryHit,geometryBoxHit} from './scenery-collision.js';
import {SceneryIndex} from './scenery-index.js';
import {factoryData} from './factory-gameplay.js';
export const helicopterData=p=>isHelicopter(p)?HELICOPTER_DATA[sceneryRule(p).state]:null;
export const sceneryData=p=>helicopterData(p)||factoryData(p)||(isStoneArch(p)?stoneArchData(p.kind):null);
const clearances=p=>{const d=sceneryData(p);return d?(Array.isArray(d.clearance)?d.clearance:[d.clearance]):[];};
export function sceneryBlocked(p,q){if(!isPhysicalScenery(p))return false;const a=sceneryLocal(p,q),level=(q.z||0)-(p.z||0);return clearances(p)[level]?.rows[Math.round(a.y)]?.[Math.round(a.x)]==='#';}
const linkCache=new WeakMap();
const placements=new SceneryIndex(props=>{const index=new Map();for(const p of props)if(isPhysicalScenery(p)){const {w,h}=scenerySize(p),margin=isMachine(p)||isStoneArch(p)?1:0;for(const [level]of clearances(p).entries())for(let y=-margin;y<h+margin;y++)for(let x=-margin;x<w+margin;x++){const key=`${p.x+x},${p.y+y},${(p.z||0)+level}`;if(!index.has(key))index.set(key,[]);index.get(key).push(p);}}return index;});
function at(map,q){
 return placements.get(map).get(`${q.x},${q.y},${q.z||0}`)||[];
}
export const sceneryBlockedAt=(map,q)=>at(map,q).some(p=>sceneryBlocked(p,q));
export function sceneryMoveAllowed(map,a,b){
 const props=new Set([...at(map,a),...at(map,b)]);if(!props.size)return true;
 if((a.z||0)!==(b.z||0))return [...props].every(p=>{
  const x=sceneryLocal(p,{...a,h:(a.z||0)*SCENERY_FLOOR},'render'),y=sceneryLocal(p,{...b,h:(b.z||0)*SCENERY_FLOOR},'render');
  return !geometryBoxHit(sceneryData(p),[Math.min(x.x,y.x)-.28,Math.min(x.y,y.y)-.28,Math.min(x.h,y.h)+.08],[Math.max(x.x,y.x)+.28,Math.max(x.y,y.y)+.28,Math.max(x.h,y.h)+1.75]);
 });
 for(const p of props){const clearance=clearances(p)[(a.z||0)-(p.z||0)];if(!clearance)continue;let links=linkCache.get(clearance);if(!links){links=new Set();for(const [x,y,u,v]of clearance.links){links.add(`${x},${y}>${u},${v}`);links.add(`${u},${v}>${x},${y}`);}linkCache.set(clearance,links);}const x=sceneryLocal(p,a),y=sceneryLocal(p,b);if(!links.has(`${x.x},${x.y}>${y.x},${y.y}`))return false;}
 return true;
}
export function sceneryRayHit(props,origin,direction,reach){
 let nearest=null,limit=reach;
 for(const prop of props||[]){const data=sceneryData(prop);if(!data)continue;const p=sceneryLocal(prop,origin),d=sceneryDirection(prop,direction),hit=geometryHit(data,[p.x,p.y,p.h],d,limit);if(hit!==null){limit=hit;nearest={prop,distance:hit};}}
 return nearest;
}
// Existing consumers retain their API; new physical scenery uses the same path.
export const helicopterBlocked=sceneryBlocked,helicopterMoveAllowed=sceneryMoveAllowed,helicopterRayHit=sceneryRayHit;
