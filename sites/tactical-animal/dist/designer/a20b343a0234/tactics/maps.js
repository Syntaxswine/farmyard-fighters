import {foliageBlocks,foliageErrors} from './foliage-data.js';
import {validatePlannedMap} from './feature-plan.js';
import {invalidateHybrid} from './hybrid-combat.js';
import {validateConnections} from './connections.js';
import {GROUNDS,PROPS,EDGES,floorTerrain,propAt,propCells,propBlocks} from './environment.js';
import {generateSectorPlan,validateSectorPlan} from './sector-rules.js';
// Shared local-map geometry. Ground keys stay compatible with version-1 drafts.
export const W=240,H=240,LEVELS=3,SECTOR=24,MAX_GUARDS=46,MAX_MAP_BYTES=4000000;
export const levelOf=p=>p.z??0;
export const tileKey=(x,y,z=0)=>z?`${x},${y},${z}`:`${x},${y}`;
export const edgeKey=(axis,x,y,z=0)=>`${axis}:${x}:${y}${z?':'+z:''}`;
export const inBounds=(x,y,z=0)=>Number.isInteger(x)&&Number.isInteger(y)&&Number.isInteger(z)&&x>=0&&y>=0&&x<W&&y<H&&z>=0&&z<LEVELS;
export function terrainAt(m,x,y,z=0){if(!inBounds(x,y,z))return 'void';if(m.knowledge&&!m.knowledge.has(tileKey(x,y,z)))return z?'floor':'yard';return z===0?(m.terrain||m.map)[y][x]:(m.upper?.[z-1]?.[tileKey(x,y)]||'void');}
export function setTerrain(m,x,y,z,value){if(!inBounds(x,y,z))return false;if(!z)m.terrain[y][x]=value;else if(value==='void')delete m.upper[z-1][tileKey(x,y)];else m.upper[z-1][tileKey(x,y)]=value;return true;}
export const passable=(m,p)=>floorTerrain(terrainAt(m,p.x,p.y,levelOf(p)))&&!foliageBlocks(m,p.x,p.y,levelOf(p))&&!propBlocks(m,p.x,p.y,levelOf(p));
export function edgeBetween(a,b){if(levelOf(a)!==levelOf(b)||Math.abs(a.x-b.x)+Math.abs(a.y-b.y)!==1)return null;return a.x!==b.x?edgeKey('e',Math.min(a.x,b.x),a.y,levelOf(a)):edgeKey('s',a.x,Math.min(a.y,b.y),levelOf(a));}
export function blockedEdge(m,a,b){const k=edgeBetween(a,b);return !k||!!EDGES[m.edges?.[k]]?.solid;}
export function openDoorBetween(m,a,b){const k=edgeBetween(a,b),next=EDGES[m.edges?.[k]]?.opensTo;if(!next)return false;m.edges[k]=next;invalidateHybrid(m);return true;}
export function sightEdge(m,a,b,{height=1.3,offset=.5}={}){const k=edgeBetween(a,b);if(!k)return true;const rule=EDGES[m.edges?.[k]];if(rule?.window)return !(height>=1&&height<=2.4&&offset>=.15&&offset<=.85);return !!rule?.opaque;}
export function edgeCells(k){const [axis,xs,ys,zs]=k.split(':'),x=Number(xs),y=Number(ys),z=Number(zs||0);return [{x,y,z},{x:x+(axis==='e'?1:0),y:y+(axis==='s'?1:0),z}];}
export function edgePoints(k){const [axis,xs,ys,zs]=k.split(':'),x=Number(xs),y=Number(ys),z=Number(zs||0);return axis==='e'?[{x:x+.5,y:y-.5,z},{x:x+.5,y:y+.5,z}]:[{x:x-.5,y:y+.5,z},{x:x+.5,y:y+.5,z}];}
export function nearestEdge(fx,fy,z=0){const x=Math.round(fx),y=Math.round(fy),dx=fx-x,dy=fy-y;return Math.abs(dx)>=Math.abs(dy)?edgeKey('e',dx<0?x-1:x,y,z):edgeKey('s',x,dy<0?y-1:y,z);}
export const stairKey=(x,y,z)=>`${x},${y},${z}`;
export function stairSet(m){return new Map((m.stairs||[]).map(p=>[stairKey(p.x,p.y,p.z),p.kind==='ladder'?3:2]));}
export function neighbors(m,p,stairs=stairSet(m),includeDiagonals=true){
 const z=levelOf(p),out=[];
 for(const b of [{x:p.x+1,y:p.y,z},{x:p.x-1,y:p.y,z},{x:p.x,y:p.y+1,z},{x:p.x,y:p.y-1,z}])if(passable(m,b)&&(!blockedEdge(m,p,b)||EDGES[m.edges?.[edgeBetween(p,b)]]?.opensTo))out.push({...b,cost:1});
 if(includeDiagonals)for(const dx of [-1,1])for(const dy of [-1,1]){const a={x:p.x+dx,y:p.y,z},b={x:p.x,y:p.y+dy,z},q={x:p.x+dx,y:p.y+dy,z};if(passable(m,a)&&passable(m,b)&&passable(m,q)&&!blockedEdge(m,p,a)&&!blockedEdge(m,p,b)&&!blockedEdge(m,a,q)&&!blockedEdge(m,b,q))out.push({...q,cost:1.5});}
 for(const dz of [-1,1])if(stairs.has(stairKey(p.x,p.y,Math.min(z,z+dz)))&&passable(m,{x:p.x,y:p.y,z:z+dz}))out.push({x:p.x,y:p.y,z:z+dz,cost:stairs.get(stairKey(p.x,p.y,Math.min(z,z+dz)))});for(const link of roofNeighbors(m,p))out.push(link);return out;
}

// Marked roof edges connect an outdoor foothold to the adjacent upper platform.
export const roofTop=p=>({x:p.x+p.dx,y:p.y+p.dy,z:p.z+1});
export const roofValid=(m,p)=>inBounds(p.x,p.y,p.z)&&p.z<2&&Math.abs(p.dx)+Math.abs(p.dy)===1&&Number.isInteger(p.dx)&&Number.isInteger(p.dy)&&passable(m,p)&&passable(m,roofTop(p))&&terrainAt(m,p.x,p.y,p.z+1)==='void'&&!blockedEdge(m,{x:p.x,y:p.y,z:p.z+1},roofTop(p));
const roofCache=new WeakMap();
function roofIndex(m){const links=m.climbs;if(!links)return new Map();if(roofCache.has(links))return roofCache.get(links);const index=new Map();for(const p of links)for(const q of [p,roofTop(p)]){const k=tileKey(q.x,q.y,q.z);if(!index.has(k))index.set(k,[]);index.get(k).push(p);}roofCache.set(links,index);return index;}
export function roofNeighbors(m,p){return (roofIndex(m).get(tileKey(p.x,p.y,levelOf(p)))||[]).filter(q=>roofValid(m,q)).map(q=>({...((levelOf(p)===q.z)?roofTop(q):{x:q.x,y:q.y,z:q.z}),cost:6,kind:'roof'}));}
export function roofEndpoint(m,p){return (m.climbs||[]).some(q=>[q,roofTop(q)].some(r=>r.x===p.x&&r.y===p.y&&r.z===levelOf(p)));}

export function canStep(m,a,b){return neighbors(m,a).some(p=>p.x===b.x&&p.y===b.y&&p.z===levelOf(b));}
export const SPECIES=['horse','goat','donkey','sheep','cow','hen','pig-foreman','pig-director','skunk'];
export const WEAPON_IDS=['hands','knife','pistol','rifle','assault','flamethrower','grenade','launcher','rpg','shotgun','sniper','smg','hmg'];
export function blankMap(name='Untitled local map'){
 return {version:2,width:W,height:H,levels:LEVELS,name,terrain:Array.from({length:H},()=>Array(W).fill('yard')),upper:[{},{}],edges:{},stairs:[],climbs:[],props:[],starts:[{x:3,y:4,z:0},{x:3,y:6,z:0},{x:2,y:5,z:0},{x:2,y:7,z:0}],guards:[],exits:[{x:3,y:5,z:0}]};
}
export function stampRoom(m,x,y,w=7,h=6,z=0){
 if(!inBounds(x,y,z)||!Number.isInteger(w)||!Number.isInteger(h)||w<2||h<2||x+w>W||y+h>H)return false;
 for(let cy=y;cy<y+h;cy++)for(let cx=x;cx<x+w;cx++)setTerrain(m,cx,cy,z,'floor');
 for(let cy=y;cy<y+h;cy++){m.edges[edgeKey('e',x-1,cy,z)]='wall';m.edges[edgeKey('e',x+w-1,cy,z)]='wall';}
 for(let cx=x;cx<x+w;cx++){m.edges[edgeKey('s',cx,y-1,z)]='wall';m.edges[edgeKey('s',cx,y+h-1,z)]='wall';}
 m.edges[edgeKey('e',x-1,y+Math.floor(h/2),z)]='door';m.edges[edgeKey('s',x+Math.floor(w/2),y+h-1,z)]='door';return true;
}
export function addStairs(m,x,y,z,kind='stairs'){if(!inBounds(x,y,z)||z>=LEVELS-1)return false;setTerrain(m,x,y,z,'floor');setTerrain(m,x,y,z+1,'floor');if(!m.stairs.some(p=>p.x===x&&p.y===y&&p.z===z))m.stairs.push({x,y,z,kind});else m.stairs=m.stairs.map(p=>p.x===x&&p.y===y&&p.z===z?{...p,kind}:p);return true;}
export function factoryMap(){
 const m=blankMap('Factory test');stampRoom(m,10,3,8,8);stampRoom(m,16,14,8,8);
 for(const [x,y]of [[7,6],[7,7],[5,12],[6,12],[9,15],[10,15],[13,5],[16,8],[13,12],[14,12],[20,6],[21,6],[20,18],[23,16],[23,19],[12,19],[7,20]])m.terrain[y][x]='crate';
 [[12,6,'pig-foreman','pistol'],[15,5,'cow','rifle'],[16,9,'pig-foreman','pistol'],[13,9,'donkey','knife'],[21,4,'pig-foreman','flamethrower'],[23,5,'goat','pistol'],[22,9,'cow','rifle'],[23,11,'pig-foreman','pistol'],[18,16,'pig-foreman','pistol'],[22,17,'donkey','knife'],[18,20,'cow','rifle'],[22,20,'pig-foreman','assault']].forEach(([x,y,species,weapon])=>m.guards.push({x,y,z:0,species,weapon}));
 m.guards[0].heading=0; // Face east, away from the west entrance.
 // A visible, accessible three-level training stairwell near the squad start.
 for(let z=1;z<LEVELS;z++)stampRoom(m,1,9,5,5,z);
 addStairs(m,3,10,0);addStairs(m,3,12,1,'ladder');m.props=[{x:7,y:10,z:0,kind:'barrel-single'},{x:7,y:17,z:0,kind:'workbench-vise'},{x:4,y:16,z:0,kind:'sandbags'},{x:4,y:18,z:0,kind:'hospital-bed'},{x:5,y:18,z:0,kind:'iv-stand'},{x:4,y:21,z:0,kind:'medicine-cabinet-closed'},{x:9,y:17,z:0,kind:'toolbox-open'},{x:8,y:19,z:0,kind:'spare-parts'},{x:1,y:2,z:0,kind:'tree-broadleaf'},{x:7,y:2,z:0,kind:'tree-pine'},{x:1,y:7,z:0,kind:'bush'},{x:8,y:3,z:0,kind:'reeds'},{x:1,y:9,z:1,kind:'roof-corrugated-flat'},{x:4,y:9,z:1,kind:'roof-corrugated-sloped'},{x:4,y:12,z:2,kind:'roof-flat-parapet'}];return m;
}
const index=p=>levelOf(p)*W*H+p.y*W+p.x;
function reachedTargets(m,targets){
 const visited=new Uint8Array(W*H*LEVELS),queue=new Int32Array(visited.length),stairs=stairSet(m),needed=new Set(targets.map(index));let head=0,tail=0;
 const start=index(m.starts[0]);queue[tail++]=start;visited[start]=1;needed.delete(start);
 while(head<tail&&needed.size){const id=queue[head++],z=Math.floor(id/(W*H)),n=id%(W*H),p={x:n%W,y:Math.floor(n/W),z};for(const next of neighbors(m,p,stairs,false)){const v=index(next);if(!visited[v]){visited[v]=1;queue[tail++]=v;needed.delete(v);}}}return needed;
}
export function validateMap(raw,{connectivity=true}={}){
 const errors=[],point=p=>p&&inBounds(p.x,p.y,levelOf(p));
 if(!raw||raw.version!==2||raw.width!==W||raw.height!==H||raw.levels!==LEVELS)return ['Expected a version 2 map: 240 × 240 tiles and 3 levels.'];
 if(typeof raw.name!=='string'||raw.name.length<1||raw.name.length>60)errors.push('Map name must contain 1–60 characters.');
 if(!Array.isArray(raw.terrain)||raw.terrain.length!==H||raw.terrain.some(r=>!Array.isArray(r)||r.length!==W||r.some(t=>!['yard','floor','crate','void','water','bridge','woodland','woodland-dense',...GROUNDS].includes(t))))return [...errors,'Invalid ground terrain.'];
 if(!Array.isArray(raw.upper)||raw.upper.length!==2)return [...errors,'Expected two sparse upper levels.'];
 for(const layer of raw.upper){if(!layer||typeof layer!=='object'||Array.isArray(layer))return [...errors,'Invalid upper floor.'];for(const [k,v]of Object.entries(layer)){const [x,y]=k.split(',').map(Number);if(k!==tileKey(x,y)||!inBounds(x,y)||!['yard','floor','crate','bridge','woodland','woodland-dense',...GROUNDS].includes(v))return [...errors,'Invalid upper floor tile.'];}}
 if(!raw.edges||typeof raw.edges!=='object'||Array.isArray(raw.edges))return [...errors,'Missing edge barriers.'];
 for(const [k,v]of Object.entries(raw.edges)){const p=/^(e|s):(-?\d+):(-?\d+)(?::([12]))?$/.exec(k);if(!p)return [...errors,'Invalid edge key.'];const x=Number(p[2]),y=Number(p[3]),z=Number(p[4]||0);if(!Object.hasOwn(EDGES,v)||k!==edgeKey(p[1],x,y,z)||(p[1]==='e'?(x< -1||x>=W||y<0||y>=H):(x<0||x>=W||y< -1||y>=H)))return [...errors,'Invalid edge location or type.'];}
 if(!Array.isArray(raw.starts)||raw.starts.length!==4||raw.starts.some(p=>!point(p)))return [...errors,'Place exactly four valid squad starts.'];
 if(!Array.isArray(raw.guards)||raw.guards.length>MAX_GUARDS||raw.guards.some(g=>!point(g)||!SPECIES.includes(g.species)||!WEAPON_IDS.includes(g.weapon)||(g.outfit!==undefined&&!['normal','red-hats'].includes(g.outfit))))return [...errors,'Use at most 46 guards (50 characters including the squad).'];
 if(raw.guards.some(g=>g.heading!==undefined&&(!Number.isFinite(g.heading)||g.heading<0||g.heading>=360)))return [...errors,'Guard facing must be between 0 and 359 degrees.'];
 if(!Array.isArray(raw.exits)||raw.exits.length!==1||!point(raw.exits[0]))return [...errors,'Place one valid travel marker.'];
 if(!Array.isArray(raw.stairs)||raw.stairs.length>4096||raw.stairs.some(p=>!point(p)||!Number.isInteger(p.z)||p.z>=2||(p.kind!==undefined&&!['stairs','ladder'].includes(p.kind))))return [...errors,'Invalid stairs: lower level must be 0 or 1.'];
 if(raw.climbs!==undefined&&(!Array.isArray(raw.climbs)||raw.climbs.length>4096||raw.climbs.some(p=>!point(p)||!Number.isInteger(p.z)||p.z>=2||!Number.isInteger(p.dx)||!Number.isInteger(p.dy)||Math.abs(p.dx)+Math.abs(p.dy)!==1)))return [...errors,'Invalid roof climb: adjacent tiles and exactly one level required.'];
 if(raw.props!==undefined&&(!Array.isArray(raw.props)||raw.props.length>4096||raw.props.some(p=>!point(p)||!Object.hasOwn(PROPS,p.kind)||(p.rotated!==undefined&&typeof p.rotated!=='boolean'))))return [...errors,'Invalid environment props.'];
 errors.push(...foliageErrors(raw),...validateConnections(raw),...validatePlannedMap(raw));
 if(raw.sectors){errors.push(...validateSectorPlan(raw.sectors));if(!errors.length){const plan=raw.sectors;for(let sy=0;sy<10;sy++)for(let sx=0;sx<10;sx++){const type=plan.cells[sy][sx];if(!['river-ns','bridge-ns','road-ew'].includes(type))continue;for(let y=0;y<24;y++)for(let x=0;x<24;x++){const p=plan.orientation==='ew'?{x:sy*24+y,y:sx*24+x}:{x:sx*24+x,y:sy*24+y},t=terrainAt(raw,p.x,p.y,0);if(['river-ns','bridge-ns'].includes(type)&&x>=9&&x<=14){const crossing=type==='bridge-ns'&&y>=10&&y<=13;if(crossing?!passable(raw,p):t!=='water')errors.push('River rule broken: preserve the water channel and both bridge corridors.');}else if(['road-ew','bridge-ns'].includes(type)&&y>=10&&y<=13&&!passable(raw,p))errors.push('Bridge approach road must remain open.');if(['bridge-ns','road-ew'].includes(type)&&y>=10&&y<=13){const q=plan.orientation==='ew'?{x:p.x,y:p.y+1}:{x:p.x+1,y:p.y};if(inBounds(q.x,q.y)&&blockedEdge(raw,p,q))errors.push('Bridge and approach corridors must not have crossing barriers.');}}}}}
 const propPositions=new Set();for(const p of raw.props||[])for(const q of propCells(p)){const k=tileKey(q.x,q.y,q.z);if(propPositions.has(k))errors.push('Overlapping prop footprints.');propPositions.add(k);if(!inBounds(q.x,q.y,q.z)||!floorTerrain(terrainAt(raw,q.x,q.y,q.z)))errors.push('Props need supported floor tiles across their whole footprint.');}
 for(const p of raw.props||[]){const cells=propCells(p);if(cells.some(a=>cells.some(b=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1&&blockedEdge(raw,a,b))))errors.push('A prop footprint crosses a wall or fence.');}
 const roofKeys=new Set();for(const p of raw.climbs||[]){const k=[p.x,p.y,p.z,p.dx,p.dy].join(',');if(roofKeys.has(k))errors.push('Duplicate roof climb.');roofKeys.add(k);if(!roofValid(raw,p))errors.push('Roof climbs need free endpoints, open headroom and an unobstructed upper edge.');}
 const stairKeys=new Set();for(const p of raw.stairs){const k=stairKey(p.x,p.y,p.z);if(stairKeys.has(k))errors.push('Duplicate stair connection.');stairKeys.add(k);if(!passable(raw,p)||!passable(raw,{...p,z:p.z+1}))errors.push(`Stairs at ${k} need walkable floors at both ends.`);}
 const positions=new Set();for(const p of [...raw.starts,...raw.guards]){const k=tileKey(p.x,p.y,levelOf(p));if(positions.has(k))errors.push(`Overlapping unit starts at ${k}.`);positions.add(k);if(!passable(raw,p))errors.push(`Unit start needs a walkable floor at ${k}.`);}
 if(!passable(raw,raw.exits[0]))errors.push('Travel marker needs a walkable floor.');if(errors.length||!connectivity)return [...new Set(errors)];
 const targets=[...raw.starts,...raw.guards,...raw.exits],missing=reachedTargets(raw,targets);for(const p of targets)if(missing.has(index(p)))errors.push(`Unreachable start or marker at ${p.x},${p.y}, level ${levelOf(p)+1}. Add doors or stairs.`);return errors;
}
export function migrateMap(raw){
 if(raw?.version!==1)return raw;
 if(![24,28].includes(raw.width)||raw.height!==24||!Array.isArray(raw.terrain)||raw.terrain.length!==24||raw.terrain.some(r=>!Array.isArray(r)||r.length!==raw.width))throw Error('Malformed legacy map.');
 const m=blankMap(raw.name);for(let y=0;y<24;y++)for(let x=0;x<raw.width;x++)m.terrain[y][x]=raw.terrain[y][x];
 m.edges=structuredClone(raw.edges);m.starts=structuredClone(raw.starts);m.guards=structuredClone(raw.guards);m.exits=structuredClone(raw.exits);return m;
}
export function parseMap(text,{allowDisconnected=false}={}){if(typeof text!=='string'||text.length>MAX_MAP_BYTES)throw Error('Map file is too large (4 MB maximum).');const m=migrateMap(JSON.parse(text)),errors=validateMap(m,{connectivity:!allowDisconnected});if(errors.length)throw Error(errors.join(' '));return structuredClone(m);}
export function generateMap(seed=7,name='Generated test',population=MAX_GUARDS,options={}){
 if(options.layout==='river')return generateRiverMap(seed,name,population,options.orientation||'ns');
 let state=Number(seed)>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;},m=blankMap(name);
 // One open workshop per sector; corridors and doors are protected from scatter.
 for(let sy=0;sy<10;sy++)for(let sx=0;sx<10;sx++){const x=sx*SECTOR+10,y=sy*SECTOR+9,w=6+Math.floor(random()*3),h=6;stampRoom(m,x,y,w,h);if((sx+sy)%4===0){for(let z=1;z<LEVELS;z++)stampRoom(m,x,y,w,h,z);addStairs(m,x+1,y+1,0);addStairs(m,x+2,y+1,1);}for(let i=0;i<3;i++){const cx=x+2+Math.floor(random()*(w-3)),cy=y+3+Math.floor(random()*2);m.terrain[cy][cx]='crate';}const furnishings=['lab-bench','botanical-chamber','lab-control-console','medical-exam-table','medical-surgical-table','medicine-cabinet','hospital-bed','wheeled-stretcher','scrub-sink','iv-stand','bedside-monitor','instrument-trolley','wooden-crate-closed','supply-chest-open','toolbox-closed'];m.props.push({x:x+3,y:y+1,z:0,kind:furnishings[(sy*10+sx)%furnishings.length]});}
 for(let i=0;i<Math.min(MAX_GUARDS,Math.max(0,population));i++){const sector=(i*17+12)%100,sx=sector%10,sy=Math.floor(sector/10),x=sx*SECTOR+11,y=sy*SECTOR+11,z=(sx+sy)%4===0?i%3:0;m.guards.push({x,y,z,species:['pig-foreman','cow','donkey','goat'][i%4],weapon:['pistol','rifle','knife','assault'][i%4],outfit:'red-hats'});}return m;
}

export function generateRiverMap(seed=7,name='River / two bridges',population=MAX_GUARDS,orientation='ns'){
 const m=blankMap(name),plan=generateSectorPlan(seed,orientation),rotate=(x,y)=>orientation==='ew'?{x:y,y:x}:{x,y};
 m.sectors=plan;
 for(let sy=0;sy<10;sy++)for(let sx=0;sx<10;sx++){
  const type=plan.cells[sy][sx];
  for(let y=0;y<24;y++)for(let x=0;x<24;x++){let t='ground-grass';if(type==='workshop'&&x>=5&&x<=18&&y>=5&&y<=18)t='ground-concrete';if(type==='river-ns'||type==='bridge-ns')t=x>=9&&x<=14?'water':'ground-dirt';if((type==='bridge-ns'||type==='road-ew')&&y>=10&&y<=13)t=type==='bridge-ns'&&x>=9&&x<=14?'bridge':'ground-asphalt';const p=rotate(sx*24+x,sy*24+y);setTerrain(m,p.x,p.y,0,t);}
  if(type==='workshop'){const p=rotate(sx*24+6,sy*24+6);stampRoom(m,p.x,p.y,12,12);if((sx+sy)%3===0){for(let z=1;z<3;z++)stampRoom(m,p.x,p.y,12,12,z);addStairs(m,p.x+1,p.y+1,0);addStairs(m,p.x+2,p.y+1,1,'ladder');}m.props.push({x:p.x+4,y:p.y+4,z:0,kind:['crate-stack','workbench-metal','barrels-cluster'][(sx+sy)%3]});}
 }
 const sites=[];for(let sy=0;sy<10;sy++)for(let sx=0;sx<10;sx++)if(plan.cells[sy][sx]!=='river-ns'&&plan.cells[sy][sx]!=='bridge-ns')sites.push(rotate(sx*24+8,sy*24+8));
 for(let i=0;i<Math.min(MAX_GUARDS,Math.max(0,population));i++){const p=sites[(i*17+7)%sites.length];m.guards.push({...p,z:0,species:SPECIES[i%SPECIES.length],weapon:['pistol','rifle','knife','assault'][i%4],outfit:'red-hats'});}
 return m;
}
