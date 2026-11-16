import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadTownTour} from '../dist/mount-dora-entry.js';
import {getTourWorld} from '../dist/mount-dora-activity.js';
import {Core,DEFAULT_BUILD,hero,encodeSave,projectileSegmentClear,tick} from '../dist/solo-game.js';
import {readTourProgress} from '../dist/mount-dora-progress.js';
import {FLOOR_SPACING,stairPoint,stairTurn} from '../dist/town-levels.js';
import {blockWindow} from '../dist/world-grid.js';
import {TownInteriorScenery} from '../dist/town-interior-view.js';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import * as manifest from '../dist/mission-art/mount-dora-interiors/manifest.js';

const id='osm-way-547799531',base=new URL('../../../maps/mount-dora/',import.meta.url),projectURL=new URL('project.json',base);
const fetcher=async url=>new Response(fs.readFileSync(url));
const source=JSON.parse(fs.readFileSync(new URL('interiors/B02.json',base))).buildings.find(b=>b.id===id);
const idle=async w=>{while(w.inFlight.size||w.queue.length)await new Promise(r=>setTimeout(r,1));};
const at=(p,level=0)=>({x:p[0],y:p[1],level,elevation:level*FLOOR_SPACING});
async function fixture(point){const state=await loadTownTour({build:DEFAULT_BUILD,fetcher,projectURL}),world=getTourWorld(state),unit=hero(state);await idle(world);await world.readyAt(point||{x:398,y:478});await idle(world);const building=world.interiors.buildings.get(id);Object.assign(unit,point||at(building.doors.find(d=>d.exterior).outside));world.ensureCoverage(blockWindow(state,unit),unit);Core.enableRealtime(state);Core.refresh(state,{forceFog:true});return {state,world,unit,building};}
function walk(s,u,p){
 const route=Core.navigationPath(s,u,p.x,p.y,{level:p.level??u.level??0});
 if(!route){
  const w=getTourWorld(s),details={from:{x:u.x,y:u.y,level:u.level,stairId:u.stairId},to:p,clear:w.pointClear(p),nearby:s.units.filter(g=>g.id&&Math.hypot(g.x-p.x,g.y-p.y)<3).map(g=>({id:g.id,x:g.x,y:g.y})),doors:[...w.interiors.doors.values()].filter(d=>d.building===id&&d.open).map(d=>({id:d.id,x:d.x,y:d.y,rooms:d.rooms}))};
  assert.fail('No production route: '+JSON.stringify(details));
 }
 for(const q of route)Core.travel(s,u,q.x-u.x,q.y-u.y);
 assert(Math.hypot(u.x-p.x,u.y-p.y)<.05);
}
function visitRooms(s,w,u,b,level){const floor=b.floors[level],visited=new Set([w.interiors.roomAt(u.x,u.y,level).room]);let pending=floor.doors.filter(d=>!d.exterior);
 while(pending.length){const index=pending.findIndex(d=>d.rooms.some(r=>visited.has(r)));assert(index>=0,'Disconnected Donnelly room');const d=pending.splice(index,1)[0],inside=visited.has(d.rooms[0]);walk(s,u,at(inside?d.inside:d.outside,level));assert(Core.performInteraction(s,d.id,'open').ok,d.id);walk(s,u,at(inside?d.outside:d.inside,level));visited.add(w.interiors.roomAt(u.x,u.y,level).room);}
 assert.equal(visited.size,floor.rooms.length);return visited.size;
}

test('Donnelly adopts the merged immutable interpretation without changing geographic evidence',()=>{
 const root=new URL('../dist/mission-art/donnelly-house/',import.meta.url),p=JSON.parse(fs.readFileSync(new URL('provenance.json',root)));
 assert.equal(p.revision,'18e6d5c155a30c645d6bf0fa068a2896bd26768e');assert.equal(manifest.DONNELLY_REVISION,p.revision);
 for(const f of p.files){const bytes=fs.readFileSync(new URL(f.path,root));assert.equal(bytes.length,f.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);}
 const resolved=JSON.parse(fs.readFileSync(new URL('source/docs/projects/donnelly-house/resolved-interior-v1.json',root)));
 assert.deepEqual([...source.rooms,...source.upperFloors[0].rooms].map(r=>r.sourceRoom).sort(),resolved.rooms.map(r=>r.id).sort());
 assert.equal(source.rooms.length,12);assert.equal(source.upperFloors[0].rooms.length,10);assert.equal(source.stories,2);assert.equal(source.roof.turret.sides,6);assert.deepEqual(source.roof.surfaces.map(r=>r.style),['hip','hip','gable','gable']);
 const footprint=JSON.parse(fs.readFileSync(new URL('authored-buildings.json',base))).records.find(b=>b.id===id);assert.equal(source.footprintSHA256,createHash('sha256').update(JSON.stringify(footprint.geometry)).digest('hex'));
 for(const floor of [source,...source.upperFloors])assert.equal(floor.rooms.reduce((n,r)=>n+r.runs.reduce((m,[y,a,b])=>m+b-a,0),0),303);
});

test('all 1,075 other building interiors remain byte-for-byte equivalent to the reviewed previous release',()=>{
 const records=new Map(manifest.SECTORS.flatMap(s=>JSON.parse(fs.readFileSync(new URL(s.file,base))).buildings).map(b=>[b.id,b]));records.delete(id);
 assert.equal(records.size,1075);const digest=createHash('sha256').update(JSON.stringify([...records].sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
 assert.equal(digest,'ac3ad0e1efa800c78a9dfff90205d27177619fb0dde63a633c81b16a785d292d');
});

test('normal hand actions and production navigation visit all 22 Donnelly rooms and walk the return stair',async()=>{
 const {state:s,world:w,unit:u,building:b}=await fixture();
 try{const front=b.doors.find(d=>d.exterior);assert(Core.performInteraction(s,front.id,'open').ok);walk(s,u,at(front.inside));assert.equal(visitRooms(s,w,u,b,0),12);
  const stair=b.stairs[0];walk(s,u,{...stairPoint(stair,0,0),level:0});assert(Core.performInteraction(s,stair.id+':up','traverse').ok);let changed=0,old=u.elevation;for(let n=0;s.queue.length&&n<600;n++){tick(s,.025);if(u.elevation!==old){changed++;old=u.elevation;}}
  assert.equal(s.queue.length,0);assert(changed>10,'Stairs must walk through intermediate physical heights');assert.equal(u.elevation,2.12);assert.equal(visitRooms(s,w,u,b,1),10);
  walk(s,u,{...stairPoint(stair,1,0),level:1});assert(Core.performInteraction(s,stair.id+':down','traverse').ok);for(let n=0;s.queue.length&&n<600;n++)tick(s,.025);assert.equal(u.elevation,0);assert.equal(s.queue.length,0);
  walk(s,u,at(front.inside));walk(s,u,at(front.outside));assert.equal(w.interiors.roomAt(u.x,u.y),undefined);assert.equal(s.units.filter(g=>g.team==='guard').length,50);
 }finally{w.dispose();}
});

test('both house storeys retain real firing apertures, solid sills, slabs and operational leaves',async()=>{
 const {state:s,world:w,building:b}=await fixture();
 try{for(const f of b.floors){assert(f.windows.length>10);for(const window of f.windows){const [dx,dy]=window.outward,base=f.level*2.12,a={x:window.x-dx*.3,y:window.y-dy*.3,h:base+1.1},c={x:window.x+dx*.3,y:window.y+dy*.3,h:base+1.1};assert(projectileSegmentClear(s,a,c),window.id);assert(projectileSegmentClear(s,c,a),window.id);assert(!w.lineClear({...a,h:base+.3},{...c,h:base+.3}));assert(!w.walkSegment({...a,level:f.level,elevation:base},{...c,level:f.level,elevation:base}));}
   for(const d of f.doors){const a=at(d.inside,f.level),c=at(d.outside,f.level);assert(!w.walkSegment(a,c),d.id);assert(!w.lineClear(a,c));d.open=true;assert(w.walkSegment(a,c),d.id);assert(w.lineClear(a,c));d.open=false;}
  }
  assert(!projectileSegmentClear(s,{x:405,y:473,h:1.2},{x:405,y:473,h:3.3}));
 }finally{w.dispose();}
});

test('new house doors and partial stairs resume; legacy house door indices do not affect the new rooms',async()=>{
 const {state:s,world:w,unit:u,building:b}=await fixture();let restored;
 try{const door=b.upperFloors[0].doors[0];door.open=true;w.interiors.changed();Object.assign(u,stairPoint(b.stairs[0],0,stairTurn(b.stairs[0])+.5),{level:1,elevation:1.06,stairId:b.stairs[0].id});
  const text=encodeSave(s),saved=readTourProgress(text);restored=await loadTownTour({progress:saved,fetcher,projectURL});const rw=getTourWorld(restored);assert.equal(hero(restored).elevation,1.06);assert(rw.interiors.doors.get(door.id).open);assert.equal(restored.units.filter(g=>g.team==='guard').length,50);
  rw.interiors.restore([{id:'interior:'+id+':d18',open:true},{id:'interior:'+id+':L1:d17',open:true}]);assert(rw.interiors.doors.get(door.id).open);assert(!rw.interiors.changes.has('interior:'+id+':d18'));
 }finally{getTourWorld(restored)?.dispose();w.dispose();}
});

test('the hipped roof and hexagonal turret cut away above the correct playable floor and release resources',async()=>{
 const {world:w,unit:u,building:b}=await fixture(),texture=new T.Texture(),scene=new TownInteriorScenery(w,{loadAsync:async()=>texture},new Map());
 try{await scene.ready;scene.update({x:380,y:462,w:48,h:48});const record=scene.resident.get(id);assert(record.houseRoof);assert.equal(record.houseRoof.root.userData.turretSides,6);
  const original=new T.Group();original.name=id;const mesh=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial());mesh.userData.occlusionRole='roof';original.add(mesh);const landmarks={root:new T.Group()};landmarks.root.add(original);
  w.interiors.visibleRooms.clear();scene.focus(landmarks);assert(record.houseRoof.root.visible);assert(!mesh.visible,'Do not draw the old roof over the imported house');
  Object.assign(u,{x:405,y:473,level:1,elevation:2.12});w.interiors.visibleRooms=new Set([id+':L1:rU02']);scene.focus(landmarks);assert(!record.houseRoof.root.visible);assert.equal(record.displayLevel,1);assert(record.levels[1].floors.visible);assert(!record.levels[0].floors.visible);
  mesh.geometry.dispose();mesh.material.dispose();scene.update({x:700,y:700,w:24,h:24});assert(!scene.resident.has(id));assert.equal(record.houseRoof.root.children.length,0);
 }finally{scene.dispose();w.dispose();texture.dispose();}
});
