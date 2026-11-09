import {rampAt,rampInfo,rampHeight} from './cliff-ramps.js';
import {cliffSupportAt} from './cliff-support.js';
import {DIMENSIONS} from './hybrid-world.js';

// Read the physical support plane rather than assuming that every logical
// floor is a slab. A cliff foothold can be lower than the roof beside it.
export function movementSurface(map,p,levels=[p.z||0]){
 for(const level of levels){
  const ramp=rampAt(map,{...p,z:level});
  if(ramp){const r=rampInfo(ramp),slope=2/r.run,n=Math.hypot(slope,1);return {height:level*DIMENSIONS.floorSpacing+rampHeight(ramp,p),normal:[-r.dx*slope/n,1/n,-r.dy*slope/n],ramp};}
 }
 for(const level of [...levels].sort((a,b)=>b-a)){
  const q={...p,z:level},cliff=cliffSupportAt(map,q);
  if(cliff)return {height:cliff.level*DIMENSIONS.floorSpacing+cliff.height,normal:[0,1,0]};
  const x=Math.round(p.x),y=Math.round(p.y),terrain=level?map.upper?.[level-1]?.[x+','+y]:(map.terrain||map.map)?.[y]?.[x];
  if(terrain&&terrain!=='void')return {height:level*DIMENSIONS.floorSpacing,normal:[0,1,0]};
 }
 return null;
}
