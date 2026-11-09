import {terrainAt} from './core/maps.js';
import {propCells,floorTerrain} from './core/environment.js';
import {emptyScenery} from './structure-health.js';
import {invalidateMapGeometry} from './map-geometry-cache.js';
import {findFallLanding,applyFallInjury} from './fall-damage.js';
const key=p=>`${p.x},${p.y},${p.z||0}`;
const present=u=>!u.away&&!['quit','captured'].includes(u.casualty);

// This is a support check after an attack, not a building stability simulation.
// Intact neighboring floor tiles keep their own HP. An involuntary fall spends
// no action AP; impact can injure the legs and reduce the surviving merc's AP.
export function settleStructureCollapse(s,receipts,{fatal=(s,u)=>{u.hp=0;u.ap=0;u.casualty='dead';},hurt}={}){
 const holes=new Set(receipts.filter(r=>r.destroyed&&r.type!=='wall').flatMap(r=>r.before.tiles).filter(p=>!floorTerrain(terrainAt(s,p.x,p.y,p.z))).map(key)),before=emptyScenery(),falls=[];
 if(!holes.size)return {before,falls};
 const unsupported=p=>holes.has(key(p));
 // Loose scenery on a collapsed slab becomes debris. No floating cargo proxy
 // should continue blocking a shot or an actor above a hole.
 const removed=(s.props||[]).filter(p=>propCells(p).some(unsupported));before.props=structuredClone(removed);s.props=(s.props||[]).filter(p=>!removed.includes(p));
 const stairs=(s.stairs||[]).filter(p=>unsupported(p)||unsupported({...p,z:p.z+1}));before.stairs=structuredClone(stairs);s.stairs=(s.stairs||[]).filter(p=>!stairs.includes(p));
 const climbs=(s.climbs||[]).filter(p=>unsupported(p)||unsupported({x:p.x+p.dx,y:p.y+p.dy,z:p.z+1}));before.climbs=structuredClone(climbs);s.climbs=(s.climbs||[]).filter(p=>!climbs.includes(p));
 for(const [edge,kind]of Object.entries(s.edges||{})){
  const [axis,a,b,c='0']=edge.split(':'),p={x:Number(a),y:Number(b),z:Number(c)},q={...p,x:p.x+(axis==='e'?1:0),y:p.y+(axis==='s'?1:0)};
  if(p.z>0&&(unsupported(p)||unsupported(q))&&!floorTerrain(terrainAt(s,p.x,p.y,p.z))&&!floorTerrain(terrainAt(s,q.x,q.y,q.z))){before.edges[edge]=kind;delete s.edges[edge];delete s.structureHealth?.['edge:'+edge];delete s.edgeLocks?.[edge];}
 }
 invalidateMapGeometry(s);
 const movers=(s.units||[]).filter(u=>present(u)&&!u.towerPost&&!u.cliffSupport&&unsupported({x:Math.round(u.x),y:Math.round(u.y),z:u.z||0}));
 const landings=new Map(),reserved=new Set();
 for(const u of movers){
  const from={x:u.x,y:u.y,z:u.z||0},to=findFallLanding(s,u,{x:Math.round(u.x),y:Math.round(u.y)},from.z,reserved,new Set(movers));
  u.overwatch=null;delete u.cliffSupport;s.queue=[];
  if(to){Object.assign(u,to);reserved.add(key(to));landings.set(u.id,to);}
  else{u.z=0;fatal(s,u);landings.set(u.id,{x:u.x,y:u.y,z:0});}
  const height=from.z-(u.z||0),damage=to?applyFallInjury(s,u,height,hurt):0;
  falls.push({id:u.id,from,to:{x:u.x,y:u.y,z:u.z||0},height,damage});
 }
 for(const p of s.loot||[]){
  if(landings.has(p.body)){Object.assign(p,landings.get(p.body));delete p.towerPost;continue;}
  if(!unsupported(p))continue;
  const oldLevel=p.z||0;p.z=0;for(let z=oldLevel-1;z>=0;z--)if(floorTerrain(terrainAt(s,p.x,p.y,z))){p.z=z;break;}
 }
 if(s.fires)s.fires=s.fires.filter(p=>!unsupported(p));
 for(const field of ['cliffTraversals','roofTraversals'])if(s[field])s[field]=s[field].filter(e=>!movers.some(u=>u.id===e.unitId));
 if(s.towerTraversal&&movers.some(u=>u.id===s.towerTraversal.unitId))delete s.towerTraversal;
 return {before,falls};
}
