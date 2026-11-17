// Game-owned remodelling of the fictional overlay, after fitting the pinned
// source designs. Keep the footprint, apertures, stair plots and props fixed.
import {FLOOR_SPACING} from '../../sites/tactical-animal/dist/town-levels.js';
export const OPEN_PLAN_LAYOUT='open-plan-v1';
const key=(x,y)=>x+','+y;
const area=r=>r.runs.reduce((n,[,a,b])=>n+b-a,0);
function runs(cells){
 const rows=new Map();for(const {x,y} of cells){if(!rows.has(y))rows.set(y,[]);rows.get(y).push(x);}
 const result=[];for(const [y,xs] of [...rows].sort((a,b)=>a[0]-b[0])){xs.sort((a,b)=>a-b);let start=xs[0],end=start+1;for(const x of xs.slice(1)){if(x===end)end++;else{result.push([y,start,end]);start=x;end=x+1;}}result.push([y,start,end]);}return result;
}
function interiorWalls(cells,doors,level){
 const portals=new Set(doors.filter(d=>!d.exterior).map(d=>[d.edge[0],d.edge[0]==='e'?d.x:d.y,(d.edge[0]==='e'?d.y:d.x)-.5].join(':'))),groups=new Map(),base=level*FLOOR_SPACING;
 for(const c of cells.values())for(const [dx,dy] of [[1,0],[0,1]]){
  const n=cells.get(key(c.x+dx,c.y+dy));if(!n||c.room===n.room)continue;
  const axis=dx?'e':'s',fixed=dx?c.x+.5:c.y+.5,start=dx?c.y-.5:c.x-.5,z0=base+(portals.has([axis,fixed,start].join(':'))?1.65:0),id=[axis,fixed,z0].join(':');
  if(!groups.has(id))groups.set(id,{axis,fixed,z0,spans:[]});groups.get(id).spans.push(start);
 }
 const walls=[];for(const {axis,fixed,z0,spans} of groups.values()){
  spans.sort((a,b)=>a-b);let start=spans[0],end=start+1;
  const append=()=>walls.push({a:axis==='e'?[fixed,start]:[start,fixed],b:axis==='e'?[fixed,end]:[end,fixed],z0,height:base+2,exterior:false,...(level?{level}:{})});
  for(const next of spans.slice(1)){if(next===end)end++;else{append();start=next;end=next+1;}}append();
 }return walls;
}
export function openPlanBuilding(building){
 const stairRooms=new Set((building.stairs||[]).map(s=>s.room)),maps=[];
 for(const [level,floor] of [building,...building.upperFloors].entries()){
  const original=floor.rooms,cells=new Map(),parent=new Map(original.map(r=>[r.id,r.id])),groups=new Map(),order=new Map(original.map((r,i)=>[r.id,i]));
  const find=id=>parent.get(id)===id?id:(parent.set(id,find(parent.get(id))),parent.get(id));
  for(const room of original){const points=[];for(const [y,x0,x1] of room.runs)for(let x=x0;x<x1;x++){const c={x,y,room:room.id};points.push(c);cells.set(key(x,y),c);}groups.set(room.id,{members:[room],points,area:points.length,x0:Math.min(...points.map(p=>p.x)),y0:Math.min(...points.map(p=>p.y)),x1:Math.max(...points.map(p=>p.x)),y1:Math.max(...points.map(p=>p.y))});}
  const boundary=[];for(const c of cells.values())for(const [dx,dy] of [[1,0],[0,1]]){const n=cells.get(key(c.x+dx,c.y+dy));if(n&&n.room!==c.room)boundary.push([c.room,n.room]);}
  const target=Math.ceil(original.length/2);
  while(groups.size>target){
   const contact=new Map();for(const [a,b] of boundary){const x=find(a),y=find(b);if(x===y)continue;const id=[x,y].sort().join(':');contact.set(id,(contact.get(id)||0)+1);}
   const candidates=new Map();for(const d of floor.doors){if(d.exterior)continue;const a=find(d.rooms[0]),b=find(d.rooms[1]);if(a===b)continue;const id=[a,b].sort().join(':'),x=groups.get(a),y=groups.get(b),sum=x.area+y.area,rectangle=(Math.max(x.x1,y.x1)-Math.min(x.x0,y.x0)+1)*(Math.max(x.y1,y.y1)-Math.min(x.y0,y.y0)+1);
    // Balance area first, favouring broad shared walls and compact unions.
    candidates.set(id,{a,b,score:sum*Math.sqrt(rectangle/sum)/Math.pow(contact.get(id)||1,.25)});
   }
   const choice=[...candidates.values()].sort((a,b)=>a.score-b.score||order.get(a.a)-order.get(b.a)||order.get(a.b)-order.get(b.b))[0];if(!choice)break;
   const x=groups.get(choice.a),y=groups.get(choice.b);parent.set(choice.b,choice.a);groups.delete(choice.b);groups.set(choice.a,{members:[...x.members,...y.members],points:[...x.points,...y.points],area:x.area+y.area,x0:Math.min(x.x0,y.x0),y0:Math.min(x.y0,y.y0),x1:Math.max(x.x1,y.x1),y1:Math.max(x.y1,y.y1)});
  }
  const remap=new Map(),rooms=[];
  for(const group of groups.values()){
   const members=group.members.sort((a,b)=>Number(stairRooms.has(b.id))-Number(stairRooms.has(a.id))||order.get(a.id)-order.get(b.id)),canonical=members[0],names=[...new Set([...members].sort((a,b)=>area(b)-area(a)).map(r=>r.name))];
   for(const r of members)remap.set(r.id,canonical.id);for(const c of group.points)c.room=canonical.id;
   rooms.push({id:canonical.id,name:names.slice(0,2).join(' / '),runs:runs(group.points),sourceRooms:members.map(r=>({id:r.id,name:r.name,areaM2:area(r),...(r.sourceRoom?{sourceRoom:r.sourceRoom}:{})}))});
  }
  rooms.sort((a,b)=>order.get(a.id)-order.get(b.id));
  floor.roomCountBefore=original.length;floor.rooms=rooms;
  floor.doors=floor.doors.filter(d=>d.exterior||remap.get(d.rooms[0])!==remap.get(d.rooms[1])).map((d,i)=>({...d,id:'interior:'+building.id+':'+OPEN_PLAN_LAYOUT+(level?':L'+level:'')+':d'+i,rooms:d.rooms.map(r=>r===null?null:remap.get(r)),name:d.exterior?d.name:'Door · '+rooms.find(r=>r.id===remap.get(d.rooms[1])).name}));
  floor.walls=[...floor.walls.filter(w=>w.exterior),...interiorWalls(cells,floor.doors,level)];
  floor.windows=floor.windows.map(w=>({...w,room:remap.get(w.room)}));floor.furniture=floor.furniture.map(f=>({...f,room:remap.get(f.room)}));maps.push(remap);
 }
 for(const stair of building.stairs||[]){const lower=maps[stair.level].get(stair.room),upper=maps[stair.level+1].get(stair.room);if(lower!==upper)throw Error('Remodelling split staircase room '+stair.id);stair.room=lower;}
 building.layoutId=OPEN_PLAN_LAYOUT;return building;
}
