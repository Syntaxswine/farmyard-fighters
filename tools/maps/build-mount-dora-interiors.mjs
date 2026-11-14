// Fictional gameplay overlay. The reviewed geographic map is never rewritten.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DESIGNS,compileBuilding} from '../../sites/tactical-animal/dist/mission-art/mount-dora/source/packages/building-catalog/index.js';
import * as T from '../../sites/tactical-animal/dist/aft/tactics/vendor/three.module.js';
import {createFurnitureLibrary} from '../../sites/tactical-animal/dist/aft/tactics/painted-furniture.js';
import {doorFootprint} from '../../sites/tactical-animal/dist/interactions.js';
import {FLOOR_SPACING,stairPoint} from '../../sites/tactical-animal/dist/town-levels.js';

const root=fileURLToPath(new URL('../../',import.meta.url)),source=path.join(root,'maps/mount-dora');
const checking=process.argv.includes('--check');
async function output(file,data){if(checking){let current;try{current=await fs.readFile(file,'utf8');}catch{}if(current!==data)throw Error('Regenerate fictional interiors: '+path.relative(root,file));}else await fs.writeFile(file,data);}
const hash=b=>createHash('sha256').update(b).digest('hex'),read=async f=>JSON.parse(await fs.readFile(path.join(source,f),'utf8'));
const bytes=await fs.readFile(path.join(source,'authored-buildings.json')),authored=JSON.parse(bytes),features=await read('features.json'),project=await read('project.json');
const featureById=new Map(features.features.map(f=>[f.id,f])),key=(x,y)=>x+','+y,dirs=[[0,-1],[1,0],[0,1],[-1,0]];
const insideRing=(x,y,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i][1]>y)!==(r[j][1]>y)&&x<(r[j][0]-r[i][0])*(y-r[i][1])/(r[j][1]-r[i][1])+r[i][0])yes=!yes;return yes;};
const inside=(x,y,g)=>g.coordinates.some(p=>insideRing(x,y,p[0])&&!p.slice(1).some(r=>insideRing(x,y,r)));
const occupancy=new Map(),masks=new Map();
for(const b of authored.records){const cells=new Map();for(let y=Math.max(0,b.bounds[1]);y<Math.min(1680,b.bounds[3]);y++)for(let x=Math.max(0,b.bounds[0]);x<Math.min(1440,b.bounds[2]);x++)if(inside(x+.5,y+.5,b.geometry)){const k=key(x,y);cells.set(k,{x,y});if(!occupancy.has(k))occupancy.set(k,[]);occupancy.get(k).push(b.id);}masks.set(b.id,cells);}
const sectors=new Map(await Promise.all(project.sectors.map(async s=>[s.id,{...s,raw:await read(s.file)}])));
function ground(x,y){const s=project.sectors.find(s=>x>=s.origin.x&&x<s.origin.x+240&&y>=s.origin.y&&y<s.origin.y+240);return s&&sectors.get(s.id).raw.terrain[y-s.origin.y]?.[x-s.origin.x];}
const trunks=new Set();for(const s of sectors.values())for(const p of s.raw.props||[])if(p.kind.startsWith('tree-'))trunks.add(key(p.x+s.origin.x,p.y+s.origin.y));
const texture=new T.Texture(),library=createFurnitureLibrary(texture,texture),forms=new Map();
for(const form of ['single-bed','bedside-table','dining-table','coffee-table','refrigerator','cabinet']){const m=library.build(form,'honey'),b=m.bounds;forms.set(form,{min:[b.min.x,b.min.z],max:[b.max.x,b.max.z],height:b.max.y});}
const templates=new Map();
function template(layout,w,d,level=0){const id=layout+':'+w+':'+d+':'+level;if(templates.has(id))return templates.get(id);const original=DESIGNS.find(d=>d.layout===layout),design={...original,parts:[{...original.parts[0],x:0,z:0,w,d,stories:level+1,use:layout}]};const f=compileBuilding(design).floors[level],names=new Map(f.rooms.map(r=>[r.id,r.name])),cells=new Map(f.cells.map(c=>[key(Math.round(c.x*2),Math.round(c.z*2)),c.room]));const t={id:original.id,cells,names};templates.set(id,t);return t;}
function components(cells,label=c=>c.label){const pending=new Set(cells.keys()),groups=[];while(pending.size){const first=pending.values().next().value,queue=[cells.get(first)],value=label(cells.get(first));pending.delete(first);for(let i=0;i<queue.length;i++){const c=queue[i];for(const [dx,dy]of dirs){const k=key(c.x+dx,c.y+dy),n=cells.get(k);if(pending.has(k)&&label(n)===value){pending.delete(k);queue.push(n);}}}groups.push(queue);}return groups;}
function runs(cells){const rows=new Map();for(const c of cells){if(!rows.has(c.y))rows.set(c.y,[]);rows.get(c.y).push(c.x);}const r=[];for(const [y,xs]of [...rows].sort((a,b)=>a[0]-b[0])){xs.sort((a,b)=>a-b);let start=xs[0],end=start+1;for(const x of xs.slice(1)){if(x===end)end++;else{r.push([y,start,end]);start=x;end=x+1;}}r.push([y,start,end]);}return r;}
function edge(c,dx,dy){return {axis:dx?'e':'s',fixed:dx?c.x+dx*.5:c.y+dy*.5,start:dx?c.y-.5:c.x-.5,end:dx?c.y+.5:c.x+.5};}
const edgeKey=e=>e.axis+':'+e.fixed+':'+e.start;
const leafBlocksPath=(a,b)=>[false,true].some(open=>{const box=doorFootprint(a,open),x0=Math.min(b.inside[0],b.outside[0]),x1=Math.max(b.inside[0],b.outside[0]),y0=Math.min(b.inside[1],b.outside[1]),y1=Math.max(b.inside[1],b.outside[1]);return Math.hypot(Math.max(box.x0-x1,x0-box.x1,0),Math.max(box.y0-y1,y0-box.y1,0))<.23;});
const clash=(a,b)=>leafBlocksPath(a,b)||leafBlocksPath(b,a);
function mergeEdges(edges){const groups=new Map();for(const e of edges){const k=[e.axis,e.fixed,e.z0,e.height,e.exterior].join(':');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);}const result=[];for(const list of groups.values()){list.sort((a,b)=>a.start-b.start);let last;for(const e of list){if(last&&last.end===e.start)last.end=e.end;else{last={...e};result.push(last);}}}return result.map(e=>({a:e.axis==='e'?[e.fixed,e.start]:[e.start,e.fixed],b:e.axis==='e'?[e.fixed,e.end]:[e.end,e.fixed],z0:e.z0,height:e.height,exterior:e.exterior}));}
function stairPlot(b,cells,rooms,doors){
 const portals=new Set(doors.flatMap(d=>[key(...d.inside),key(...d.outside)])),entrance=doors.find(d=>d.exterior),candidates=[];
 for(const room of rooms){const group=[...cells.values()].filter(c=>c.room===room.id),set=new Set(group.map(c=>key(c.x,c.y)));
  for(const runCells of [2,1])for(const c of group)for(const rotated of [false,true]){
   const s={x:c.x,y:c.y,rotated,runCells,room:room.id},plot=[],core=[];for(let v=0;v<runCells+2;v++)for(let u=0;u<2;u++){const p=stairPoint(s,u,v),k=key(p.x,p.y);plot.push(k);if(v)core.push(k);}
   if(plot.some(k=>!set.has(k)||portals.has(k)))continue;
   const blocked=new Set(core),available=group.filter(c=>!blocked.has(key(c.x,c.y))),pending=new Set(available.map(c=>key(c.x,c.y))),queue=[available[0]];if(!available.length)continue;pending.delete(key(queue[0].x,queue[0].y));for(let i=0;i<queue.length;i++)for(const [dx,dy]of dirs){const p=queue[i],k=key(p.x+dx,p.y+dy);if(pending.delete(k))queue.push(cells.get(k));}if(pending.size)continue;
   candidates.push({...s,plot,core,score:(runCells===2?0:10000)+Math.hypot(c.x-entrance.x,c.y-entrance.y)});
  }
 }return candidates.sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x)[0];
}
function furnishing(rooms,cells,reserved,seed){
 const furniture=[],occupied=new Set();
 for(const room of rooms){const group=[...cells.values()].filter(c=>c.room===room.id);if(group.length<12)continue;const formsFor=/Bedroom|room \d/.test(room.name)?['single-bed','bedside-table']:/Kitchen|laundry/.test(room.name)?['refrigerator','cabinet']:/Living|Sales|hall|floor/i.test(room.name)?['dining-table','coffee-table']:['cabinet','bedside-table'];
  for(const form of formsFor){let done=false;for(const c of group){if(done)break;for(const rotation of [0,1]){const spec=forms.get(form),min=rotation?[-spec.max[1],spec.min[0]]:spec.min,max=rotation?[-spec.min[1],spec.max[0]]:spec.max,bounds=[c.x+min[0],c.y+min[1],c.x+max[0],c.y+max[1]],covered=[];let clear=true;for(let y=Math.floor(bounds[1]+.5-.22);y<=Math.floor(bounds[3]+.5+.22);y++)for(let x=Math.floor(bounds[0]+.5-.22);x<=Math.floor(bounds[2]+.5+.22);x++){const k=key(x,y);if(cells.get(k)?.room!==room.id||reserved.has(k)||occupied.has(k))clear=false;covered.push(k);}if(!clear)continue;furniture.push({form,skin:['honey','cream','sage'][seed%3],x:c.x,y:c.y,rotation,room:room.id,bounds,height:spec.height});for(const k of covered)occupied.add(k);done=true;break;}}}
 }return furniture;
}
const records=[],issues=[];
for(const b of authored.records){
 const cells=masks.get(b.id),f=featureById.get(b.id),use=f?.tags?.building||'yes',layout=/school/.test(use)?'school':/church/.test(use)?'assembly':/hotel/.test(use)?'lodging':/commercial|retail/.test(use)?'shop':/industrial|warehouse/.test(use)?'warehouse':'home';
 const [x0,y0,x1,y1]=b.bounds,w=x1-x0,d=y1-y0,nx=Math.max(1,Math.ceil(w/14)),ny=Math.max(1,Math.ceil(d/14)),mw=w/nx,md=d/ny,tw=Math.max(4,Math.round(mw*2)/2),td=Math.max(4,Math.round(md*2)/2),t=template(layout,tw,td);
 for(const c of cells.values()){const bx=Math.min(nx-1,Math.floor((c.x-x0)/mw)),by=Math.min(ny-1,Math.floor((c.y-y0)/md)),tx=Math.min(tw*2-1,Math.floor(((c.x-x0+.5)/mw-bx)*tw*2)),ty=Math.min(td*2-1,Math.floor(((c.y-y0+.5)/md-by)*td*2)),id=t.cells.get(key(tx,ty));c.name=t.names.get(id)||'Utility room';c.label=bx+':'+by+':'+id;}
 // Fit normal catalogue rooms to the actual footprint, merging clipped slivers.
 for(const [i,group]of components(cells).entries())for(const c of group)c.label=i;
 for(let pass=0;pass<4;pass++){let changed=false;for(const group of components(cells)){if(group.length>=8)continue;const neighbours=new Map();for(const c of group)for(const [dx,dy]of dirs){const n=cells.get(key(c.x+dx,c.y+dy));if(n&&n.label!==c.label)neighbours.set(n.label,(neighbours.get(n.label)||0)+1);}const target=[...neighbours].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0]?.[0];if(target!==undefined){const name=[...cells.values()].find(c=>c.label===target).name;for(const c of group){c.label=target;c.name=name;}changed=true;}}if(!changed)break;}
 const rooms=components(cells).map((group,i)=>{const id='r'+i;for(const c of group)c.room=id;return {id,name:group[0].name,runs:runs(group)};});
 const outer=[],adjacent=new Map();
 for(const c of cells.values())for(const [dx,dy]of dirs){const n=cells.get(key(c.x+dx,c.y+dy)),e={...edge(c,dx,dy),c,n,dx,dy};if(!n)outer.push(e);else if(c.room!==n.room&&(dx===1||dy===1)){const id=[c.room,n.room].sort().join(':');if(!adjacent.has(id))adjacent.set(id,[]);adjacent.get(id).push(e);}}
 const doors=[],portalKeys=new Set(),reserved=new Set(),parent=new Map(rooms.map(r=>[r.id,r.id]));
 const find=a=>parent.get(a)===a?a:(parent.set(a,find(parent.get(a))),parent.get(a));
 const pick=edges=>{const keys=new Set(edges.map(edgeKey));return [...edges].sort((a,b)=>{const score=e=>[...[-2,-1,1,2]].filter(n=>keys.has(edgeKey({...e,start:e.start+n}))).length;return score(b)-score(a)||a.fixed-b.fixed||a.start-b.start;})[0];};
 function door(e,exterior=false){const x=e.axis==='e'?e.fixed:e.start+.5,y=e.axis==='s'?e.fixed:e.start+.5,swing=-(e.axis==='e'?e.dx:e.dy),r=[e.c.room,e.n?.room??null];const o={id:'interior:'+b.id+':d'+doors.length,kind:'door',name:exterior?'Entrance · fictional interior':'Door · '+rooms.find(r=>r.id===e.n?.room)?.name,x,y,edge:e.axis+':'+Math.floor(x)+':'+Math.floor(y),swing,range:1.65,height:1.65,open:false,inventory:[],rooms:r,inside:[e.c.x,e.c.y],outside:[e.c.x+e.dx,e.c.y+e.dy],exterior};doors.push(o);portalKeys.add(edgeKey(e));for(const p of [o.inside,o.outside])reserved.add(key(...p));}
 for(const edges of [...adjacent.values()].sort((a,b)=>b.length-a.length)){const e=pick(edges),a=find(e.c.room),c=find(e.n.room);if(a!==c){parent.set(a,c);door(e);}}
 const eligible=outer.filter(e=>{const x=e.c.x+e.dx,y=e.c.y+e.dy;return !occupancy.has(key(x,y))&&ground(x,y)&&ground(x,y)!=='water'&&!trunks.has(key(x,y))&&!trunks.has(key(e.c.x,e.c.y));});
 for(const group of components(cells,()=>0)){const set=new Set(group.map(c=>key(c.x,c.y))),options=eligible.filter(e=>set.has(key(e.c.x,e.c.y)));if(!options.length){issues.push(b.id+': no land entrance');continue;}const first=pick(options);door(first,true);const others=options.filter(e=>Math.hypot(e.c.x-first.c.x,e.c.y-first.c.y)>Math.min(6,Math.max(w,d)*.4));if(others.length)door(pick(others),true);}
 // Two neighbouring open leaves must never plug each other's passage. Move
 // the portal along its shared wall or reverse its swing before furnishing.
 for(let pass=0;pass<4;pass++)for(const d of doors){if(!doors.some(o=>o!==d&&clash(d,o)))continue;const choices=d.exterior?eligible.filter(e=>e.c.room===d.rooms[0]):adjacent.get([...d.rooms].sort().join(':'));let replacement;
  for(const e of [...choices].sort((a,b)=>Math.hypot(a.c.x-d.x,a.c.y-d.y)-Math.hypot(b.c.x-d.x,b.c.y-d.y))){for(const sign of [1,-1]){const x=e.axis==='e'?e.fixed:e.start+.5,y=e.axis==='s'?e.fixed:e.start+.5,candidate={...d,x,y,edge:e.axis+':'+Math.floor(x)+':'+Math.floor(y),swing:-(e.axis==='e'?e.dx:e.dy)*sign,rooms:[e.c.room,e.n?.room??null],inside:[e.c.x,e.c.y],outside:[e.c.x+e.dx,e.c.y+e.dy]};if(!doors.some(o=>o!==d&&clash(candidate,o))){replacement=candidate;break;}}if(replacement)break;}if(replacement)Object.assign(d,replacement);
 }
 if(doors.some(d=>doors.some(o=>o!==d&&clash(d,o))))issues.push(b.id+': neighbouring door leaves block a portal');
 portalKeys.clear();reserved.clear();for(const d of doors){portalKeys.add(d.edge[0]+':'+(d.edge[0]==='e'?d.x:d.y)+':'+((d.edge[0]==='e'?d.y:d.x)-.5));for(const p of [d.inside,d.outside])reserved.add(key(...p));}
 const stories=f?.nativeProxy?.stories||1,material=f?.nativeProxy?.material||'wood';
 const stair=stories>1?stairPlot(b,cells,rooms,doors):null;if(stories>1&&!stair)issues.push(b.id+': no connected staircase plot');
 const blockedCore=new Set(stair?.core||[]);for(const k of stair?.plot||[])reserved.add(k);
 // Reserve paths joining every portal and room centre before furnishing.
 for(const room of rooms){const group=[...cells.values()].filter(c=>c.room===room.id&&!blockedCore.has(key(c.x,c.y))),set=new Set(group.map(c=>key(c.x,c.y))),anchors=doors.flatMap(o=>[o.inside,o.outside]).filter(p=>set.has(key(...p))),centre=group[Math.floor(group.length/2)];if(!centre)continue;const queue=[centre],prev=new Map([[key(centre.x,centre.y),null]]);for(let i=0;i<queue.length;i++)for(const [dx,dy]of dirs){const c=queue[i],k=key(c.x+dx,c.y+dy);if(set.has(k)&&!prev.has(k)){prev.set(k,key(c.x,c.y));queue.push(cells.get(k));}}for(const p of anchors){let k=key(...p);while(k){reserved.add(k);k=prev.get(k);}}reserved.add(key(centre.x,centre.y));}
 const furniture=furnishing(rooms,cells,reserved,records.length),walls=[];
 for(const e of outer){const isDoor=portalKeys.has(edgeKey(e));walls.push({...e,z0:isDoor?1.65:0,height:2,exterior:true});}
 for(const edges of adjacent.values())for(const e of edges)walls.push({...e,z0:portalKeys.has(edgeKey(e))?1.65:0,height:2,exterior:false});
 const groundWalls=mergeEdges(walls),upperFloors=[],stairs=[];
 for(let level=1;level<stories;level++){
  const above=template(layout,tw,td,level),height=level*FLOOR_SPACING;
  const upperRooms=rooms.map(r=>{const names=new Map();for(const c of cells.values())if(c.room===r.id){const bx=Math.min(nx-1,Math.floor((c.x-x0)/mw)),by=Math.min(ny-1,Math.floor((c.y-y0)/md)),tx=Math.min(tw*2-1,Math.floor(((c.x-x0+.5)/mw-bx)*tw*2)),ty=Math.min(td*2-1,Math.floor(((c.y-y0+.5)/md-by)*td*2)),name=above.names.get(above.cells.get(key(tx,ty)))||'Upper room';names.set(name,(names.get(name)||0)+1);}return {...r,name:[...names].sort((a,b)=>b[1]-a[1])[0][0]};});
  const upperDoors=doors.filter(d=>!d.exterior).map((d,i)=>({...d,id:'interior:'+b.id+':L'+level+':d'+i,edge:d.edge+':'+level,level,z0:height,name:'Door · '+upperRooms.find(r=>r.id===d.rooms[1]).name}));
  upperFloors.push({level,rooms:upperRooms,doors:upperDoors,walls:groundWalls.map(w=>({...w,level,z0:height+(w.exterior?0:w.z0),height:height+2})),furniture:furnishing(upperRooms,cells,reserved,records.length+level),slabRuns:runs([...cells.values()].filter(c=>!blockedCore.has(key(c.x,c.y))))});
 }
 if(stair)for(let level=0;level<stories-1;level++){const {plot,core,score,...placement}=stair;stairs.push({...placement,id:'stairs:'+b.id+':'+level,building:b.id,level});}
 records.push({id:b.id,bounds:b.bounds.map(n=>n-.5),footprintSHA256:hash(JSON.stringify(b.geometry)),designId:t.id,layout,stories,material,rooms,doors,walls:groundWalls,furniture,upperFloors,stairs});
}
library.dispose();texture.dispose();
if(issues.length)throw Error(issues.join('\n'));
const out=path.join(source,'interiors');if(!checking)await fs.mkdir(out,{recursive:true});const packets=[];
for(const s of project.sectors){const bounds=[s.origin.x-.5,s.origin.y-.5,s.origin.x+239.5,s.origin.y+239.5],buildings=records.filter(b=>b.bounds[0]<bounds[2]&&b.bounds[2]>bounds[0]&&b.bounds[1]<bounds[3]&&b.bounds[3]>bounds[1]),packet=JSON.stringify({kind:'farmyard-fictional-interiors',version:2,sector:s.id,sourceLayoutSHA256:hash(bytes),buildings})+'\n';await output(path.join(out,s.id+'.json'),packet);packets.push({id:s.id,file:'interiors/'+s.id+'.json',sha256:hash(packet),bytes:Buffer.byteLength(packet)});}
const manifest={VERSION:2,SOURCE_LAYOUT_SHA256:hash(bytes),NAUTILUS_REVISION:'2502646482218524fd5129641da769bb82462e4d',POLICY:'Fictional gameplay interiors, entrances and upper floors, authorized 2026-11-13. Geographic footprints and source evidence remain unchanged.',BUILDINGS:records.map(({id,bounds,doors,stories,upperFloors})=>({id,bounds,doorCount:doors.length,stories,upperDoorCounts:upperFloors.map(f=>f.doors.length)})),SECTORS:packets,INTERIOR_REVISION:hash(JSON.stringify(packets))};
const dir=path.join(root,'sites/tactical-animal/dist/mission-art/mount-dora-interiors');if(!checking)await fs.mkdir(dir,{recursive:true});await output(path.join(dir,'manifest.js'),'// Generated by tools/maps/build-mount-dora-interiors.mjs.\n'+Object.entries(manifest).map(([k,v])=>'export const '+k+'='+JSON.stringify(v)+';').join('\n')+'\n');
console.log(JSON.stringify({buildings:records.length,upperFloors:records.reduce((n,b)=>n+b.upperFloors.length,0),stairFlights:records.reduce((n,b)=>n+b.stairs.length,0),rooms:records.reduce((n,b)=>n+b.rooms.length,0),doors:records.reduce((n,b)=>n+b.doors.length,0),furniture:records.reduce((n,b)=>n+b.furniture.length,0),bytes:packets.reduce((n,p)=>n+p.bytes,0),largestPacket:Math.max(...packets.map(p=>p.bytes))}));
