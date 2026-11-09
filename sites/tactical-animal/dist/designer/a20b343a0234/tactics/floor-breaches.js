import {MAP_LEVELS} from './map-layers.js';
import {materialKind} from './hybrid-materials.js';
import {propCells} from './environment.js';
import {breachesOf} from './breach-data.js';

// N/E/S/W refer to map coordinates. Only originally solid structural floor
// tiles count as damage; authored voids, stairwells and cliff tops do not.
export const FLOOR_SIDES=Object.freeze([[0,-1],[1,0],[0,1],[-1,0]]);
const present=t=>!!t&&t!=='void';
function excluded(map){
 const cells=new Set((map.stairs||[]).map(p=>[p.x,p.y,p.z+1].join(',')));
 for(const p of [...(map.props||[]),...(map.canopies||[])]){
  if(p.kind.startsWith('roof-'))for(const q of propCells(p))cells.add([q.x,q.y,q.z||0].join(','));
  if(p.kind==='cliff-ledge'&&(p.cliffMask??15)===15)cells.add([p.x,p.y,(p.z||0)+1].join(','));
 }
 return cells;
}
export function floorBreachMasks(map){
 const authored=breachesOf(map)?.upper;if(!map.definition?.upper&&!authored)return new Map();
 const original=map.definition||{},skip=new Set([...excluded(original),...excluded(map)]),broken=new Set(),masks=new Map();
 for(let z=1;z<MAP_LEVELS;z++)for(const [key,t]of Object.entries({...original.upper?.[z-1],...authored?.[z-1]})){
  const id=key+','+z;
  if(present(t)&&!present(map.upper?.[z-1]?.[key])&&!skip.has(id))broken.add(id);
 }
 for(let z=1;z<MAP_LEVELS;z++)for(const [key,t]of Object.entries(map.upper?.[z-1]||{})){
  const id=key+','+z;if(!present(t)||skip.has(id))continue;
  const [x,y]=key.split(',').map(Number);let mask=0;
  FLOOR_SIDES.forEach(([dx,dy],side)=>{if(broken.has([x+dx,y+dy,z].join(',')))mask|=1<<side;});
  if(mask)masks.set(id,mask);
 }
 return masks;
}
export function damagedFloorVisuals(boxes,map){
 const masks=floorBreachMasks(map);if(!masks.size)return boxes;
 return boxes.map(b=>{
  if(b.kind!=='floor'||!b.id.startsWith('floor:')||!(b.source.z>0))return b;
  const {x,y,z}=b.source,mask=masks.get([x,y,z].join(','));if(!mask)return b;
  const paint=materialKind(b),family=paint.startsWith('wood')?'wood':paint==='metal'||paint==='steel'?'metal':'concrete',seed=((x*17+y*31+z*13)%3+3)%3;
  return {...b,shape:`floor-breach-${family}-${mask}-${seed}`,material:'breach-'+paint,floorBreach:mask};
 });
}
