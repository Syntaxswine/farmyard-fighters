import {doorFootprint} from './interactions.js';
const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1],key=(x,y)=>x+','+y;
const boundsOf=b=>[b.x0,b.y0,b.x1,b.y1];
class Index{
 constructor(){this.buckets=new Map();}
 add(value,bounds){for(let y=Math.floor(bounds[1]/8);y<=Math.floor(bounds[3]/8);y++)for(let x=Math.floor(bounds[0]/8);x<=Math.floor(bounds[2]/8);x++){const k=key(x,y);if(!this.buckets.has(k))this.buckets.set(k,[]);this.buckets.get(k).push(value);}}
 query(bounds){const found=new Set();for(let y=Math.floor(bounds[1]/8);y<=Math.floor(bounds[3]/8);y++)for(let x=Math.floor(bounds[0]/8);x<=Math.floor(bounds[2]/8);x++)for(const v of this.buckets.get(key(x,y))||[])found.add(v);return [...found];}
}
export function interiorWallBox(w){return {x0:Math.min(w.a[0],w.b[0])-(w.a[0]===w.b[0]?.08:0),y0:Math.min(w.a[1],w.b[1])-(w.a[1]===w.b[1]?.08:0),x1:Math.max(w.a[0],w.b[0])+(w.a[0]===w.b[0]?.08:0),y1:Math.max(w.a[1],w.b[1])+(w.a[1]===w.b[1]?.08:0),z0:w.z0,height:w.height,kind:'wall',...(w.z0>=1.65?{overhead:true}:{})};}
export function interiorRayHits(a,b,box){
 let lo=0,hi=1;const za=a.h??1.1,zb=b.h??1.1;
 for(const [start,delta,min,max]of [[a.x,b.x-a.x,box.x0,box.x1],[a.y,b.y-a.y,box.y0,box.y1],[za,zb-za,box.z0??0,box.height]]){if(Math.abs(delta)<1e-8){if(start<min||start>max)return false;}else{const p=(min-start)/delta,q=(max-start)/delta;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));if(lo>hi)return false;}}
 return hi>1e-7&&lo<1-1e-7;
}
// Explicit consumer adapter for the pinned Nautilus catalogue. Packets contain
// fictional geometry only; neither source footprints nor catalogue assets mutate.
export class TownInteriors{
 constructor(world,manifest){
  if(manifest.VERSION!==1||manifest.SOURCE_LAYOUT_SHA256!==world.project.generation.authoredLayoutSHA256)throw Error('Town interiors and source footprints differ.');
  this.world=world;this.manifest=manifest;this.buildings=new Map();this.changes=new Map();this.catalogue=new Map(manifest.BUILDINGS.map(b=>[b.id,b]));this.sectors=new Map(manifest.SECTORS.map(s=>[s.id,s]));this.cells=new Map();this.index=new Index();this.visibleRooms=new Set();
 }
 validate(packet,sector){
  if(packet?.kind!=='farmyard-fictional-interiors'||packet.version!==1||packet.sector!==sector||packet.sourceLayoutSHA256!==this.manifest.SOURCE_LAYOUT_SHA256||!Array.isArray(packet.buildings))throw Error('Unsupported town interior packet.');
  for(const b of packet.buildings){const reference=this.catalogue.get(b.id);if(!reference||JSON.stringify(reference.bounds)!==JSON.stringify(b.bounds)||reference.doorCount!==b.doors?.length||!b.rooms?.length||!Array.isArray(b.walls)||!Array.isArray(b.furniture))throw Error('Invalid fictional building '+b.id);}
  return packet;
 }
 reconcile(){
  const wanted=new Map();for(const p of this.world.cache.values())for(const b of p.interiors?.buildings||[])wanted.set(b.id,b);
  for(const [id,b]of this.buildings)if(!wanted.has(id)){for(const d of b.doors)this.capture(d);this.buildings.delete(id);}
  for(const [id,b]of wanted)if(!this.buildings.has(id)){
   const record={...b,doors:b.doors.map(d=>({...structuredClone(d),building:id,fictionalInterior:true,open:this.changes.get(d.id)===true}))};
   record.boxes=b.walls.map(interiorWallBox).concat(b.furniture.flatMap(f=>{const box={x0:f.bounds[0],y0:f.bounds[1],x1:f.bounds[2],y1:f.bounds[3],height:f.height,cover:true};return [{...box,kind:'prop'},{...box,kind:'part'}];}));
   this.buildings.set(id,record);
  }
  this.cells=new Map();this.index=new Index();this.doors=new Map();
  for(const b of this.buildings.values()){
   for(const r of b.rooms)for(const [y,x0,x1]of r.runs)for(let x=x0;x<x1;x++)this.cells.set(key(x,y),{building:b.id,room:r.id,id:b.id+':'+r.id});
   for(const box of b.boxes)this.index.add({box},boundsOf(box));
   for(const door of b.doors){this.doors.set(door.id,door);const a=doorFootprint(door,false),c=doorFootprint(door,true);this.index.add({door},[Math.min(a.x0,c.x0),Math.min(a.y0,c.y0),Math.max(a.x1,c.x1),Math.max(a.y1,c.y1)]);}
  }
  this.dataVersion=(this.dataVersion||0)+1;this.sync();
 }
 roomAt(x,y){return this.cells.get(key(Math.floor(x+.5),Math.floor(y+.5)));}
 boxes(bounds){return this.index.query(bounds).map(v=>v.box||{...doorFootprint(v.door),interactionId:v.door.id,kind:'door'}).filter(b=>intersects(bounds,boundsOf(b)));}
 pointClear(p,radius){return !this.boxes([p.x-radius,p.y-radius,p.x+radius,p.y+radius]).some(b=>(b.z0??0)<.8&&Math.hypot(Math.max(b.x0-p.x,0,p.x-b.x1),Math.max(b.y0-p.y,0,p.y-b.y1))<radius-1e-7);}
 lineClear(a,b){const area=[Math.min(a.x,b.x),Math.min(a.y,b.y),Math.max(a.x,b.x),Math.max(a.y,b.y)];return !this.boxes(area).some(box=>interiorRayHits(a,b,box));}
 capture(d){if(d.open)this.changes.set(d.id,true);else this.changes.delete(d.id);}
 sync(window=this.window){
  if(window)this.window=window;
  const state=this.world.state;if(!state)return;
  const signature=(window?.key??'initial')+':'+this.dataVersion;if(this.syncSignature===signature&&this.syncState===state)return;this.syncSignature=signature;this.syncState=state;
  const area=window?[window.x-2,window.y-2,window.x+window.w+2,window.y+window.h+2]:null;
  const active=state.interactables.filter(o=>!o.fictionalInterior);
  for(const o of state.interactables)if(o.fictionalInterior)this.capture(o);
  for(const b of this.buildings.values())if(!area||intersects(b.bounds,area))for(const d of b.doors){active.push(d);state.edges[d.edge]=d.open?'door':'closed-door';}
  const edges=new Set(active.filter(o=>o.kind==='door').map(o=>o.edge));for(const o of state.interactables)if(o.fictionalInterior&&!edges.has(o.edge))delete state.edges[o.edge];
  state.interactables=active;
 }
 changed(){for(const d of this.doors.values())this.capture(d);this.world.emit();}
 savedObjects(state){
  for(const d of this.doors.values())this.capture(d);
  return [...state.interactables.filter(o=>!o.fictionalInterior).map(({id,open,searched,inventory})=>({id,open,searched,inventory})),...[...this.changes].map(([id,open])=>({id,open}))];
 }
 restore(objects=[]){
  for(const o of objects){if(!o?.id?.startsWith('interior:'))continue;const match=/^interior:(.+):d(\d+)$/.exec(o.id),b=match&&this.catalogue.get(match[1]);if(!b||Number(match[2])>=b.doorCount||typeof o.open!=='boolean')throw Error('Unsupported saved interior door.');if(o.open)this.changes.set(o.id,true);else this.changes.delete(o.id);}
  for(const d of this.doors?.values()||[])d.open=this.changes.get(d.id)===true;
  this.syncSignature=null;this.sync();
 }
 reveal(unit){
  const visible=new Set(),queue=[],own=this.roomAt(unit.x,unit.y);if(own){visible.add(own.id);queue.push(own);}
  const eye={...unit,h:unit.stance==='prone'?.3:unit.stance==='kneeling'?.75:1.2};
  for(const b of this.buildings.values())for(const d of b.doors)if(d.exterior&&d.open&&Math.hypot(d.x-unit.x,d.y-unit.y)<24){const target={x:d.inside[0],y:d.inside[1],h:eye.h};if(this.world.lineClear(eye,target)){const id=b.id+':'+d.rooms[0];if(!visible.has(id)){visible.add(id);queue.push({building:b.id,room:d.rooms[0],id});}}}
  for(let i=0;i<queue.length;i++){const r=queue[i],b=this.buildings.get(r.building);for(const d of b.doors)if(d.open&&d.rooms.includes(r.room))for(const room of d.rooms)if(room){const id=b.id+':'+room,target=room===d.rooms[0]?d.inside:d.outside;if(!visible.has(id)&&this.world.lineClear(eye,{x:target[0],y:target[1],h:eye.h})){visible.add(id);queue.push({building:b.id,room,id});}}}
  this.visibleRooms=visible;return visible;
 }
 metrics(){return {buildings:this.buildings.size,doors:this.doors?.size||0,cells:this.cells.size,activeDoors:this.world.state?.interactables.filter(o=>o.fictionalInterior).length||0,changedDoors:this.changes.size,visibleRooms:this.visibleRooms.size,revision:this.manifest.INTERIOR_REVISION};}
 dispose(){this.buildings.clear();this.changes.clear();this.cells.clear();this.index=new Index();this.doors?.clear();this.visibleRooms.clear();}
}
