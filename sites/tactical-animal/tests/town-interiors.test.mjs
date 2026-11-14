import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TownWorld,sha256} from '../dist/mount-dora-world.js';
import {loadTownTour} from '../dist/mount-dora-entry.js';
import {getTourWorld} from '../dist/mount-dora-activity.js';
import {DEFAULT_BUILD,hero,Core,encodeSave,projectileSegmentClear} from '../dist/solo-game.js';
import {readTourProgress} from '../dist/mount-dora-progress.js';
import * as interiors from '../dist/mission-art/mount-dora-interiors/manifest.js';
import * as art from '../dist/mission-art/mount-dora/manifest.js';
import {TownInteriorScenery} from '../dist/town-interior-view.js';
import {blockWindow} from '../dist/world-grid.js';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
const base=new URL('../../../maps/mount-dora/',import.meta.url),projectURL=new URL('project.json',base),project=JSON.parse(fs.readFileSync(projectURL));
const fetcher=async url=>new Response(fs.readFileSync(url));
const point=p=>({x:p[0],y:p[1]});
const idle=async w=>{while(w.inFlight.size||w.queue.length)await new Promise(r=>setTimeout(r,1));};

test('fictional overlay preserves every reviewed footprint, courtyard and source pin; every ground-floor room has an exterior path',async()=>{
 assert.equal(interiors.NAUTILUS_REVISION,'2502646482218524fd5129641da769bb82462e4d');
 const source=fs.readFileSync(new URL('authored-buildings.json',base));assert.equal(await sha256(source),interiors.SOURCE_LAYOUT_SHA256);
 const authored=new Map(JSON.parse(source).records.map(b=>[b.id,b])),all=new Map();
 for(const s of interiors.SECTORS){const bytes=fs.readFileSync(new URL(s.file,base));assert.equal(bytes.length,s.bytes);assert.equal(await sha256(bytes),s.sha256);const packet=JSON.parse(bytes);for(const b of packet.buildings){if(all.has(b.id)){assert.deepEqual(b,all.get(b.id));continue;}all.set(b.id,b);
  assert.deepEqual(b.bounds,authored.get(b.id).bounds.map(n=>n-.5));assert.equal(b.footprintSHA256,await sha256(new TextEncoder().encode(JSON.stringify(authored.get(b.id).geometry))));
  const rooms=new Set(b.doors.filter(d=>d.exterior).map(d=>d.rooms[0]));for(let old=-1;old!==rooms.size;){old=rooms.size;for(const d of b.doors)if(d.rooms.some(r=>rooms.has(r)))for(const r of d.rooms)if(r)rooms.add(r);}assert.equal(rooms.size,b.rooms.length,b.id+' has an isolated room');
  const cells=new Set();for(const r of b.rooms)for(const [y,x0,x1]of r.runs)for(let x=x0;x<x1;x++){const k=x+','+y;assert(!cells.has(k));assert(x>=0&&x<1440&&y>=0&&y<1680);cells.add(k);}assert(cells.size>0);assert(cells.size<=authored.get(b.id).metrics.authoredAreaM2);const a=authored.get(b.id);if(a.bounds[0]>=0&&a.bounds[1]>=0&&a.bounds[2]<=1440&&a.bounds[3]<=1680)assert.equal(cells.size,a.metrics.authoredAreaM2);
  for(const d of b.doors){assert.equal(d.height,1.65);assert(cells.has(d.inside.join(',')));assert.equal(cells.has(d.outside.join(',')),!d.exterior);}
 }}assert.equal(all.size,1076);assert.equal(interiors.BUILDINGS.length,all.size);
});

test('production navigation and hand actions can traverse every room of a house, winged building and courtyard',async()=>{
 const s=await loadTownTour({build:DEFAULT_BUILD,fetcher,projectURL}),w=getTourWorld(s),u=hero(s),sources=JSON.parse(fs.readFileSync(new URL('authored-buildings.json',base))).records;
 try{for(const id of ['osm-way-557051202',sources.find(b=>b.geometry.coordinates[0][0].length===5&&b.metrics.authoredAreaM2<100&&b.bounds[0]>300&&b.bounds[1]>300).id,'osm-relation-8005634']){
  const metadata=interiors.BUILDINGS.find(b=>b.id===id);await w.readyAt({x:(metadata.bounds[0]+metadata.bounds[2])/2,y:(metadata.bounds[1]+metadata.bounds[3])/2});const b=w.interiors.buildings.get(id),entrance=b.doors.find(d=>d.exterior);Object.assign(u,point(entrance.outside));w.ensureCoverage(blockWindow(s,u),u);Core.refresh(s,{forceFog:true});assert(Core.performInteraction(s,entrance.id,'open').ok);
  const visited=new Set();for(const r of b.rooms){if(r.id===entrance.rooms[0])visited.add(r.id);}let pending=b.doors.filter(d=>!d.exterior);
  while(pending.length){const index=pending.findIndex(d=>d.rooms.some(r=>visited.has(r)));assert(index>=0);const d=pending.splice(index,1)[0],target=point(visited.has(d.rooms[0])?d.inside:d.outside),route=Core.navigationPath(s,u,target.x,target.y);assert(route,id+' approach '+d.id);for(const p of route)Core.travel(s,u,p.x-u.x,p.y-u.y);assert(Math.hypot(u.x-target.x,u.y-target.y)<.05);assert(Core.performInteraction(s,d.id,'open').ok,d.id);for(const room of d.rooms)visited.add(room);}
  assert.equal(visited.size,b.rooms.length,id);
 }}finally{w.dispose();}
});

test('every generated doorway blocks when closed and permits production walking and sight when open, including seams and courtyards',async()=>{
 const w=await new TownWorld(project,{baseURL:base,fetcher,art,interiors}).identify(),checked=new Set(),failures=[];let doors=0;
 try{for(const sector of project.sectors){await w.readyAt({x:sector.origin.x+119,y:sector.origin.y+119});await idle(w);const packet=w.cache.get(sector.id);for(const b of packet.interiors.buildings){if(checked.has(b.id))continue;checked.add(b.id);const record=w.interiors.buildings.get(b.id);for(const d of record.doors){const a=point(d.outside),c=point(d.inside);if(w.walkSegment(a,c)||w.lineClear(a,c))failures.push(d.id+' closed');d.open=true;if(!w.walkSegment(a,c)||!w.lineClear(a,c))failures.push(d.id+' open');d.open=false;doors++;}for(const d of record.doors)d.open=true;for(const d of record.doors)if(!w.walkSegment(point(d.outside),point(d.inside)))failures.push(d.id+' other open leaves block passage');for(const d of record.doors)d.open=false;}
  assert(w.cache.size<=9);assert(w.stats.peakFetches<=2);
 }assert.equal(checked.size,1076);assert.equal(doors,interiors.BUILDINGS.reduce((n,b)=>n+b.doorCount,0));assert.deepEqual(failures,[]);}finally{w.dispose();}
});

test('production Core opens, enters and closes a fictional house, charges normal combat actions, blocks a swing, and resumes inside',async()=>{
 const s=await loadTownTour({build:DEFAULT_BUILD,fetcher,projectURL}),w=getTourWorld(s),u=hero(s);let restored;
 try{await idle(w);Core.enableRealtime(s);const d=s.interactables.filter(d=>d.exterior).sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];assert(d);Object.assign(u,point(d.outside));Core.refresh(s,{forceFog:true});
  const ray=[{...point(d.outside),h:1.1},{...point(d.inside),h:1.1}];assert(!projectileSegmentClear(s,...ray));
  assert.equal(Core.previewInteraction(s,d.id,'open').ok,true);assert.equal(Core.performInteraction(s,d.id,'open').ok,true);assert(d.open);assert(w.interiors.visibleRooms.size>0);assert(projectileSegmentClear(s,...ray));assert(!projectileSegmentClear(s,...ray.map(p=>({...p,h:1.8}))),'The lintel remains solid above the open leaf');
  const before={x:u.x,y:u.y};Core.travel(s,u,d.inside[0]-u.x,d.inside[1]-u.y);assert(Math.hypot(u.x-d.inside[0],u.y-d.inside[1])<1e-5);assert(w.resumeClear(u));
  Object.assign(u,{x:d.x,y:d.y});assert.match(Core.previewInteraction(s,d.id,'close').reason,/doorway/);Object.assign(u,point(d.inside));
  // The proving-yard AP mode uses the same canonical door/collision path.
  delete s.realtime;s.phase='player';s.engaged=true;u.ap=5;assert.equal(Core.previewInteraction(s,d.id,'close').cost,1);assert(Core.performInteraction(s,d.id,'close').ok);assert.equal(u.ap,4);assert(!w.lineClear(before,u));
  u.ap=5;assert(Core.performInteraction(s,d.id,'open').ok);assert.equal(u.ap,4);assert(w.lineClear(before,u));
  const saved=readTourProgress(encodeSave(s));assert.equal(saved.runtime.objects.filter(o=>o.id.startsWith('interior:')).length,1);assert(!saved.runtime.objects.some(o=>o.rooms||o.walls));
  restored=await loadTownTour({build:DEFAULT_BUILD,progress:saved,fetcher,projectURL});const rw=getTourWorld(restored);assert.equal(hero(restored).x,u.x);assert.equal(hero(restored).y,u.y);assert(rw.interiors.doors.get(d.id).open);assert(rw.resumeClear(hero(restored)));
 }finally{getTourWorld(restored)?.dispose();w.dispose();}
});

test('a checkpoint obstructed by a new partition relocates to a nearby clear floor and preserves the loadout',async()=>{
 const s=await loadTownTour({build:DEFAULT_BUILD,fetcher,projectURL}),w=getTourWorld(s);let restored;
 try{const b=[...w.interiors.buildings.values()].find(b=>b.walls.some(w=>!w.exterior&&w.z0===0)),wall=b.walls.find(w=>!w.exterior&&w.z0===0),saved=readTourProgress(encodeSave(s));Object.assign(saved.player,{x:(wall.a[0]+wall.b[0])/2,y:(wall.a[1]+wall.b[1])/2});assert(!w.resumeClear(saved.player));restored=await loadTownTour({progress:saved,fetcher,projectURL});const p=hero(restored);assert(getTourWorld(restored).resumeClear(p));assert(Math.hypot(p.x-saved.player.x,p.y-saved.player.y)<24);assert.deepEqual(p.ammo,saved.player.ammo);assert(restored.log.some(s=>s.includes('clear outdoor approach')));}finally{getTourWorld(restored)?.dispose();w.dispose();}
});

test('door deltas survive streaming eviction, and a failed interior packet blocks coverage and retries',async()=>{
 let fail=true;const get=async url=>fail&&url.pathname.endsWith('/C03.json')?new Response('offline',{status:503}):fetcher(url),w=await new TownWorld(project,{baseURL:base,fetcher:get,art,interiors}).identify();
 try{await assert.rejects(w.readyAt({x:500,y:500}),/Interior HTTP 503/);fail=false;w.retry();await w.readyAt({x:500,y:500});await idle(w);const d=[...w.interiors.doors.values()][0];d.open=true;w.interiors.changed();const origin=point(d.inside),id=d.id;
  await w.readyAt({x:1300,y:1500});await idle(w);assert(!w.interiors.doors.has(id));await w.readyAt(origin);assert(w.interiors.doors.get(id).open);
  assert.throws(()=>w.restoreObjectChanges([{id:'interior:made-up:d0',open:true}]),/Unsupported saved/);
 }finally{w.dispose();}
});

test('interior scenery uses the same wall apertures and bounded residency; disposal releases its resources',async()=>{
 const w=await new TownWorld(project,{baseURL:base,fetcher,art,interiors}).identify();let view;
 try{await w.readyAt({x:459,y:500});const loader={loadAsync:async()=>new T.Texture()},materials=new Map();view=new TownInteriorScenery(w,loader,materials);await view.ready;
  const window={x:432,y:480,w:72,h:72};view.update(window);assert(view.resident.size>0);assert(view.resident.size<w.interiors.buildings.size);const b=[...view.resident.values()][0];assert.equal(b.full.count,b.b.walls.length);
  const room=b.b.rooms[0];w.interiors.visibleRooms.add(b.b.id+':'+room.id);view.focus();assert(!b.full.visible);assert(b.cut.visible);assert(!b.roofs.visible);assert(b.floors.instanceColor);
  view.update({x:1300,y:1500,w:72,h:72});assert.equal(view.resident.size,0);
 }finally{view?.dispose();w.dispose();}
});
