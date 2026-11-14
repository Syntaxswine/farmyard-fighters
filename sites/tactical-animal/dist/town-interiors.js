import {doorFootprint} from './interactions.js';
import {FLOOR_SPACING,buildingFloors,floorKey,floorLevel,baseHeight,stairBoxes,stairPoint,stairLocal,stairPosition,stairCoreContains,stairTurn} from './town-levels.js';
const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1],key=(x,y)=>x+','+y;
const boundsOf=b=>[b.x0,b.y0,b.x1,b.y1];
class Index{
 constructor(){this.buckets=new Map();}
 add(value,bounds){for(let y=Math.floor(bounds[1]/8);y<=Math.floor(bounds[3]/8);y++)for(let x=Math.floor(bounds[0]/8);x<=Math.floor(bounds[2]/8);x++){const k=key(x,y);if(!this.buckets.has(k))this.buckets.set(k,[]);this.buckets.get(k).push(value);}}
 query(bounds){const found=new Set();for(let y=Math.floor(bounds[1]/8);y<=Math.floor(bounds[3]/8);y++)for(let x=Math.floor(bounds[0]/8);x<=Math.floor(bounds[2]/8);x++)for(const v of this.buckets.get(key(x,y))||[])found.add(v);return [...found];}
}
// Reuse the production height-aware wall-part contract for overhead headers.
export function interiorWallBox(w){return {x0:Math.min(w.a[0],w.b[0])-(w.a[0]===w.b[0]?.08:0),y0:Math.min(w.a[1],w.b[1])-(w.a[1]===w.b[1]?.08:0),x1:Math.max(w.a[0],w.b[0])+(w.a[0]===w.b[0]?.08:0),y1:Math.max(w.a[1],w.b[1])+(w.a[1]===w.b[1]?.08:0),z0:w.z0,height:w.height,kind:'wall',windowPart:true,...(w.z0-(w.level??0)*FLOOR_SPACING>=1.65?{overhead:true}:{})};}
export function interiorRayHits(a,b,box){
 let lo=0,hi=1;const za=a.h??1.1,zb=b.h??1.1;
 for(const [start,delta,min,max]of [[a.x,b.x-a.x,box.x0,box.x1],[a.y,b.y-a.y,box.y0,box.y1],[za,zb-za,box.z0??0,box.height]]){if(Math.abs(delta)<1e-8){if(start<min||start>max)return false;}else{const p=(min-start)/delta,q=(max-start)/delta;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));if(lo>hi)return false;}}
 return hi>1e-7&&lo<1-1e-7;
}
// Explicit consumer adapter for the pinned Nautilus catalogue. Packets contain
// fictional geometry only; neither source footprints nor catalogue assets mutate.
export class TownInteriors{
 constructor(world,manifest){
  if(![1,2].includes(manifest.VERSION)||manifest.SOURCE_LAYOUT_SHA256!==world.project.generation.authoredLayoutSHA256)throw Error('Town interiors and source footprints differ.');
  this.world=world;this.manifest=manifest;this.buildings=new Map();this.changes=new Map();this.catalogue=new Map(manifest.BUILDINGS.map(b=>[b.id,b]));this.sectors=new Map(manifest.SECTORS.map(s=>[s.id,s]));this.cells=new Map();this.index=new Index();this.visibleRooms=new Set();
 }
 validate(packet,sector){
  if(packet?.kind!=='farmyard-fictional-interiors'||packet.version!==this.manifest.VERSION||packet.sector!==sector||packet.sourceLayoutSHA256!==this.manifest.SOURCE_LAYOUT_SHA256||!Array.isArray(packet.buildings))throw Error('Unsupported town interior packet.');
  for(const b of packet.buildings){const reference=this.catalogue.get(b.id);if(!reference||JSON.stringify(reference.bounds)!==JSON.stringify(b.bounds)||reference.doorCount!==b.doors?.length||!b.rooms?.length||!Array.isArray(b.walls)||!Array.isArray(b.furniture))throw Error('Invalid fictional building '+b.id);}
  return packet;
 }
 reconcile(){
  const wanted=new Map();for(const p of this.world.cache.values())for(const b of p.interiors?.buildings||[])wanted.set(b.id,b);
  for(const [id,b]of this.buildings)if(!wanted.has(id)){for(const d of b.allDoors)this.capture(d);this.buildings.delete(id);}
  for(const [id,b]of wanted)if(!this.buildings.has(id)){
   const canonical=d=>({...structuredClone(d),building:id,fictionalInterior:true,open:this.changes.get(d.id)===true});
   const record={...b,doors:b.doors.map(canonical),upperFloors:(b.upperFloors||[]).map(f=>({...f,doors:f.doors.map(canonical)}))};
   record.floors=buildingFloors(record);record.allDoors=record.floors.flatMap(f=>f.doors);record.boxes=[];
   for(const floor of record.floors){const base=floor.level*FLOOR_SPACING;record.boxes.push(...floor.walls.map(interiorWallBox),...floor.furniture.flatMap(f=>{const box={x0:f.bounds[0],y0:f.bounds[1],x1:f.bounds[2],y1:f.bounds[3],z0:base,height:base+f.height,cover:true,windowPart:true};return [{...box,kind:'prop',reservation:true},{...box,kind:'part'}];}));
    if(floor.level)for(const [y,x0,x1]of floor.slabRuns)record.boxes.push({x0:x0-.5,y0:y-.5,x1:x1-.5,y1:y+.5,z0:base-.12,height:base,kind:'wall',overhead:true,windowPart:true,slab:true});
   }
   for(const stair of b.stairs||[])record.boxes.push(...stairBoxes(stair));
   if(b.stories>1)for(const r of b.rooms)for(const [y,x0,x1]of r.runs)record.boxes.push({x0:x0-.5,y0:y-.5,x1:x1-.5,y1:y+.5,z0:b.stories*FLOOR_SPACING-.12,height:b.stories*FLOOR_SPACING,kind:'wall',overhead:true,windowPart:true,slab:true});
   this.buildings.set(id,record);
  }
  this.cells=new Map();this.index=new Index();this.doors=new Map();this.stairs=new Map();this.plotIndex=new Index();
  for(const b of this.buildings.values()){
   for(const floor of b.floors)for(const r of floor.rooms)for(const [y,x0,x1]of r.runs)for(let x=x0;x<x1;x++)this.cells.set(key(x,y)+':'+floor.level,{building:b.id,room:r.id,level:floor.level,id:floorKey(b.id,r.id,floor.level)});
   for(const box of b.boxes)this.index.add({box},boundsOf(box));
   for(const door of b.allDoors){this.doors.set(door.id,door);const a=doorFootprint(door,false),c=doorFootprint(door,true);this.index.add({door},[Math.min(a.x0,c.x0),Math.min(a.y0,c.y0),Math.max(a.x1,c.x1),Math.max(a.y1,c.y1)]);}
   for(const stair of b.stairs||[]){this.stairs.set(stair.id,stair);if(stair.level===0){const a=stairPoint(stair,-.5,.5),c=stairPoint(stair,1.5,stairTurn(stair)+1);this.plotIndex.add(stair,[Math.min(a.x,c.x),Math.min(a.y,c.y),Math.max(a.x,c.x),Math.max(a.y,c.y)]);}}
  }
  this.dataVersion=(this.dataVersion||0)+1;this.sync();
 }
 roomAt(x,y,level=0){return this.cells.get(key(Math.floor(x+.5),Math.floor(y+.5))+':'+level);}
 plotAt(p){return this.plotIndex?.query([p.x,p.y,p.x,p.y]).find(s=>stairCoreContains(s,p));}
 locationAt(p,from=null,radius=.23){
  if(!from&&p.stairId){const stair=this.stairs.get(p.stairId);return stair&&stairCoreContains(stair,p)?stairPosition(stair,p,radius):null;}
  const level=p.level??floorLevel(from),old=from?.stairId&&this.stairs.get(from.stairId);
  if(old){const q=stairPosition(old,p,radius);if(!q)return null;if(q.stairId)return q;return this.roomAt(q.x,q.y,q.level)?q:null;}
  const plot=this.plotAt(p);
  if(plot){
   const local=stairLocal(plot,p),lower=level-(local.u>.5?1:0),s=this.stairs.get('stairs:'+plot.building+':'+lower);
   if(!s||from&&stairLocal(plot,from).v>.5+1e-6)return null;
   return stairPosition(s,p,radius);
  }
  if(level&&!this.roomAt(p.x,p.y,level))return null;
  return {...p,level,elevation:level*FLOOR_SPACING,stairId:undefined};
 }
 boxes(bounds){return this.index.query(bounds).map(v=>v.box||{...doorFootprint(v.door),interactionId:v.door.id,kind:'wall'}).filter(b=>intersects(bounds,boundsOf(b)));}
 pointClear(p,radius){const base=baseHeight(p),h=base+.8;return !this.boxes([p.x-radius,p.y-radius,p.x+radius,p.y+radius]).some(b=>!b.slab&&(b.z0??0)<h&&b.height>base+(b.stairTread?.8:.1)&&Math.hypot(Math.max(b.x0-p.x,0,p.x-b.x1),Math.max(b.y0-p.y,0,p.y-b.y1))<radius-1e-7);}
 lineClear(a,b){const area=[Math.min(a.x,b.x),Math.min(a.y,b.y),Math.max(a.x,b.x),Math.max(a.y,b.y)];return !this.boxes(area).some(box=>interiorRayHits(a,b,box));}
 capture(d){if(d.open)this.changes.set(d.id,true);else this.changes.delete(d.id);}
 sync(window=this.window){
  if(window)this.window=window;
  const state=this.world.state;if(!state)return;
  const signature=(window?.key??'initial')+':'+this.dataVersion;if(this.syncSignature===signature&&this.syncState===state)return;this.syncSignature=signature;this.syncState=state;
  const area=window?[window.x-2,window.y-2,window.x+window.w+2,window.y+window.h+2]:null;
  const active=state.interactables.filter(o=>!o.fictionalInterior);
  for(const o of state.interactables)if(o.fictionalInterior)this.capture(o);
  for(const b of this.buildings.values())if(!area||intersects(b.bounds,area)){
   for(const d of b.allDoors){active.push(d);state.edges[d.edge]=d.open?'door':'closed-door';}
   for(const stair of b.stairs||[])for(const direction of [1,-1]){const up=direction===1,level=stair.level+(up?0:1),p=stairPoint(stair,up?0:1,0),destination=stairPoint(stair,up?1:0,0);active.push({id:stair.id+(up?':up':':down'),kind:'stairs',name:up?'Stairs up to floor '+(level+1):'Stairs down to '+(level===1?'ground floor':'floor '+(level-1)),x:p.x,y:p.y,level,z0:level*FLOOR_SPACING,range:1.65,open:false,inventory:[],fictionalInterior:true,stairId:stair.id,direction,destination:{...destination,level:level+direction}});}
  }
  const edges=new Set(active.filter(o=>o.kind==='door').map(o=>o.edge));for(const o of state.interactables)if(o.fictionalInterior&&!edges.has(o.edge))delete state.edges[o.edge];
  state.interactables=active;
 }
 changed(){for(const d of this.doors.values())this.capture(d);this.world.emit();}
 savedObjects(state){
  for(const d of this.doors.values())this.capture(d);
  return [...state.interactables.filter(o=>!o.fictionalInterior).map(({id,open,searched,inventory})=>({id,open,searched,inventory})),...[...this.changes].map(([id,open])=>({id,open}))];
 }
 restore(objects=[]){
  for(const o of objects){if(!o?.id?.startsWith('interior:'))continue;const match=/^interior:(.+?)(?::L(\d+))?:d(\d+)$/.exec(o.id),b=match&&this.catalogue.get(match[1]),count=b&&(match[2]?b.upperDoorCounts?.[Number(match[2])-1]:b.doorCount);if(!b||!Number.isInteger(count)||Number(match[3])>=count||typeof o.open!=='boolean')throw Error('Unsupported saved interior door.');if(o.open)this.changes.set(o.id,true);else this.changes.delete(o.id);}
  for(const d of this.doors?.values()||[])d.open=this.changes.get(d.id)===true;
  this.syncSignature=null;this.sync();
 }
 reveal(unit){
  const level=floorLevel(unit),visible=new Set(),queue=[],own=this.roomAt(unit.x,unit.y,level);if(own){visible.add(own.id);queue.push(own);}
  const eye={...unit,h:baseHeight(unit)+(unit.stance==='prone'?.3:unit.stance==='kneeling'?.75:1.2)};
  for(const b of this.buildings.values())for(const d of b.allDoors)if(d.exterior&&d.open&&level===floorLevel(d)&&Math.hypot(d.x-unit.x,d.y-unit.y)<24){const target={x:d.inside[0],y:d.inside[1],h:eye.h};if(this.world.lineClear(eye,target)){const id=floorKey(b.id,d.rooms[0],level);if(!visible.has(id)){visible.add(id);queue.push({building:b.id,room:d.rooms[0],level,id});}}}
  for(let i=0;i<queue.length;i++){const r=queue[i],b=this.buildings.get(r.building);for(const d of b.floors[r.level].doors)if(d.open&&d.rooms.includes(r.room))for(const room of d.rooms)if(room){const id=floorKey(b.id,room,r.level),target=room===d.rooms[0]?d.inside:d.outside;if(!visible.has(id)&&this.world.lineClear(eye,{x:target[0],y:target[1],h:eye.h})){visible.add(id);queue.push({building:b.id,room,level:r.level,id});}}}
  this.visibleRooms=visible;return visible;
 }
 metrics(){return {buildings:this.buildings.size,doors:this.doors?.size||0,cells:this.cells.size,stairs:this.stairs?.size||0,activeDoors:this.world.state?.interactables.filter(o=>o.fictionalInterior&&o.kind==='door').length||0,changedDoors:this.changes.size,visibleRooms:this.visibleRooms.size,revision:this.manifest.INTERIOR_REVISION};}
 dispose(){this.buildings.clear();this.changes.clear();this.cells.clear();this.index=new Index();this.doors?.clear();this.stairs?.clear();this.plotIndex=new Index();this.visibleRooms.clear();}
}
