import {passable,edgeBetween,terrainAt,levelOf} from './core/maps.js';
import {EDGES} from './core/environment.js';
import {parapetBlocks} from './climbable-roofs.js';

// Only actual window/wall boundaries supply these routes. Closed doors, fences,
// parapets and impassable terrain never become climbable merely through skill.
export function boundaryClimbs(map,p){
 const z=levelOf(p),out=[];
 for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
  const to={x:p.x+dx,y:p.y+dy,z},edge=edgeBetween(p,to),kind=map.edges?.[edge],rule=EDGES[kind];
  if(!rule||!passable(map,to)||parapetBlocks(map,p,to))continue;
  if(rule.window)out.push({...to,kind:'window',cost:4,edge});
  else if(kind==='wall'||/^wall-(brick|concrete|corrugated|wood)(?:$|-)/.test(kind)&&!kind.includes('trellis')){
   if(terrainAt(map,p.x,p.y,z+1)!=='void'||terrainAt(map,to.x,to.y,z+1)!=='void')continue;
   out.push({...to,kind:'wall',cost:12,edge});
  }
 }
 return out;
}
