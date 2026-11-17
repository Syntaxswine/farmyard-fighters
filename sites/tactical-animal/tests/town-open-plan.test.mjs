import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as manifest from '../dist/mission-art/mount-dora-interiors/manifest.js';

const base=new URL('../../../maps/mount-dora/',import.meta.url),records=new Map(manifest.SECTORS.flatMap(s=>JSON.parse(fs.readFileSync(new URL(s.file,base))).buildings).map(b=>[b.id,b]));
const area=r=>r.runs.reduce((n,[,a,b])=>n+b-a,0);
function preserved(b){
 const {rooms,doors,walls,windows,furniture,upperFloors,stairs,roomCountBefore,layoutId,...metadata}=b;
 const floor=f=>{const {rooms,doors,walls,windows,furniture,roomCountBefore,...rest}=f;return {rest,cells:rooms.flatMap(r=>r.runs.flatMap(([y,a,b])=>Array.from({length:b-a},(_,i)=>[a+i,y]))).sort((a,b)=>a[1]-b[1]||a[0]-b[0]),entrances:doors.filter(d=>d.exterior).map(({id,rooms,...p})=>p),walls:walls.filter(w=>w.exterior),windows:windows.map(({room,...w})=>w),furniture:furniture.map(({room,...f})=>f)};};
 return {metadata,ground:floor({rooms,doors,walls,windows,furniture}),upper:upperFloors.map(floor),stairs:stairs.map(({room,...s})=>s)};
}
test('larger rooms preserve all 1,076 footprints, entrances, windows, furniture, stair plots and upper slabs',()=>{
 const projection=[...records].sort((a,b)=>a[0].localeCompare(b[0])).map(([id,b])=>[id,preserved(b)]);
 assert.equal(records.size,1076);
 // Characterized from release fc48312, before removing any partitions.
 assert.equal(createHash('sha256').update(JSON.stringify(projection)).digest('hex'),'25ddee06f489725530a8d4a838156cbc4cd518041571a302efc84cb41c53f671');
});
test('each floor halves its room count by removing complete partitions between connected spaces',()=>{
 let before=0,after=0;
 for(const b of records.values())for(const floor of [b,...b.upperFloors]){
  const cells=new Map();assert.equal(floor.rooms.length,Math.ceil(floor.roomCountBefore/2),b.id);before+=floor.roomCountBefore;after+=floor.rooms.length;
  assert.equal(floor.rooms.reduce((n,r)=>n+r.sourceRooms.length,0),floor.roomCountBefore);
  for(const room of floor.rooms){
   assert.equal(area(room),room.sourceRooms.reduce((n,s)=>n+s.areaM2,0));const pending=new Set();for(const [y,a,z] of room.runs)for(let x=a;x<z;x++){const k=x+','+y;assert(!cells.has(k));cells.set(k,room.id);pending.add(k);}
   const queue=[pending.values().next().value];pending.delete(queue[0]);for(let i=0;i<queue.length;i++){const [x,y]=queue[i].split(',').map(Number);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const k=(x+dx)+','+(y+dy);if(pending.delete(k))queue.push(k);}}assert.equal(pending.size,0,'Joined room must have continuous floor');
  }
  for(const w of floor.walls.filter(w=>!w.exterior)){
   const vertical=w.a[0]===w.b[0],start=vertical?w.a[1]:w.a[0],end=vertical?w.b[1]:w.b[0],fixed=vertical?w.a[0]:w.a[1];
   for(let t=start+.5;t<end;t++){const a=vertical?[fixed-.5,t]:[t,fixed-.5],c=vertical?[fixed+.5,t]:[t,fixed+.5];assert.notEqual(cells.get(a.join(',')),cells.get(c.join(',')),'No wall/header may remain inside a joined room');}
  }
  const ids=new Set(floor.rooms.map(r=>r.id));for(const d of floor.doors){assert(ids.has(d.rooms[0]));if(!d.exterior){assert(ids.has(d.rooms[1]));assert.notEqual(...d.rooms);}assert.match(d.id,/:open-plan-v1:/);}for(const w of floor.windows)assert(ids.has(w.room));for(const f of floor.furniture)assert(ids.has(f.room));
 }
 assert.equal(before,15870);assert.equal(after,8234);
});
