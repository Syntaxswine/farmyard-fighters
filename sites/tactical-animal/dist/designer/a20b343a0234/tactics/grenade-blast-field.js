import {GRENADE} from './grenade-ballistics.js';
import {MAP_LEVELS} from './map-layers.js';
import {grenadeWorld,sweepGrenade,GRENADE_FLOOR} from './grenade-geometry.js';
import {TOWERS,TOWER_HEIGHT} from './tower-geometry.js';
export const BLAST_RAYS=96;
export function resolvedGrenadeBlast(shot){
 const p=shot.event.explosions?.find(p=>p.kind==='grenade'||p.grenade)||shot.event.trajectories[0];
 return {...p,radius:Number.isFinite(p.radius)&&p.radius>0?p.radius:GRENADE.blast};
}
// Tower platforms have native height but keep their parent prop's logical level.
export function grenadeBlastLevel(state,p){
 for(const tower of state.props||[]){const f=TOWERS[tower.kind];if(!f)continue;const h=p.h-(tower.z||0)*GRENADE_FLOOR;
  if(h>=TOWER_HEIGHT-.2&&h<=TOWER_HEIGHT+3&&p.x>=tower.x-.5&&p.x<tower.x+(tower.rotated?f.h:f.w)-.5&&p.y>=tower.y-.5&&p.y<tower.y+(tower.rotated?f.w:f.h)-.5)return tower.z||0;
 }
 return Math.max(0,Math.min(MAP_LEVELS-1,p.z??Math.floor(p.h/GRENADE_FLOOR)));
}
export const blastCellKey=(x,y,z)=>z?`${x},${y},${z}`:`${x},${y}`;
export function grenadeBlastField(state,shot,origin=resolvedGrenadeBlast(shot)){
 const old=shot.event.grenade?.scenery;
 let scenery=state;
 if(old){
  scenery={...state,map:(state.map||state.terrain).map(r=>[...r]),upper:structuredClone(state.upper||[{},{}]),edges:{...state.edges,...old.edges},props:[...(state.props||[]),...(old.props||[])]};
  for(const field of ['canopies','stairs','climbs'])scenery[field]=[...state[field]||[],...old[field]||[]];
  for(const p of old.tiles||[])if(p.z)(scenery.upper[p.z-1]??={})[`${p.x},${p.y}`]=p.kind;else scenery.map[p.y][p.x]=p.kind;
  for(const site of shot.event.sites||[])scenery.props=scenery.props.map(p=>p.x===site.before.x&&p.y===site.before.y&&(p.z||0)===(site.before.z||0)?site.before:p);
 }
 const world=grenadeWorld(scenery),rays=new Float32Array(BLAST_RAYS);
 // Conservative horizontal reach through the intact cover used for damage.
 // This is a dust envelope, not a second damage calculation.
 for(let i=0;i<BLAST_RAYS;i++){
  let reach=origin.radius;for(const offset of [-.5,0,.5]){const angle=(i+offset)*Math.PI*2/BLAST_RAYS,end={x:origin.x+Math.cos(angle)*origin.radius,y:origin.y+Math.sin(angle)*origin.radius,h:origin.h},hit=sweepGrenade(world,origin,end,0);if(hit)reach=Math.min(reach,origin.radius*hit.t);}
  rays[i]=reach;
 }
 // The burst can rise above the low dust rays. Keep it beneath the intact
 // ceiling, including one destroyed by this very explosion.
 const below=sweepGrenade(world,origin,{...origin,h:-.001},0),above=sweepGrenade(world,origin,{...origin,h:origin.h+origin.radius},0);
 const floor=below?.normal?.h>.6?below.h:0,ceiling=above?above.h:origin.h+origin.radius;
 // Sample every tactical column too: a burst outside an overhang must not
 // poke above the adjacent floor simply because its origin has open sky.
 const x=Math.floor(origin.x-origin.radius)-1,y=Math.floor(origin.y-origin.radius)-1,size=Math.ceil(origin.radius*2)+4,ceilings=new Float32Array(size*size);
 for(let j=0;j<size;j++)for(let i=0;i<size;i++){
  const from={x:x+i,y:y+j,h:origin.h},hit=sweepGrenade(world,from,{...from,h:origin.h+origin.radius},0);
  ceilings[j*size+i]=Math.min(ceiling,hit?.h??ceiling);
 }
 return {origin,radius:origin.radius,rays,floor,ceiling,columns:{x,y,size,ceilings},level:grenadeBlastLevel(scenery,origin)};
}
export function blastReach(field,x,y){const a=(Math.atan2(y-field.origin.y,x-field.origin.x)+Math.PI*2)%(Math.PI*2)/ (Math.PI*2)*BLAST_RAYS,i=Math.floor(a);return Math.min(field.rays[i],field.rays[(i+1)%BLAST_RAYS]);}
export function blastPointVisible(field,state,x,y){return state.visible?.has(blastCellKey(Math.round(x),Math.round(y),field.level))||false;}
