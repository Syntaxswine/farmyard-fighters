import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTownTour} from '../dist/mount-dora-entry.js';
import {getTourWorld} from '../dist/mount-dora-activity.js';
import {TownWorld,solidDistance} from '../dist/mount-dora-world.js';
import {DEFAULT_BUILD,hero,Core,createSoloGame,encodeSave} from '../dist/solo-game.js';
import {readTourProgress} from '../dist/mount-dora-progress.js';
import * as ART from '../dist/mission-art/mount-dora/manifest.js';
const base=new URL('../../../maps/mount-dora/',import.meta.url),projectURL=new URL('project.json',base);
const project=JSON.parse(fs.readFileSync(projectURL)),fetcher=async url=>new Response(fs.readFileSync(url));

test('old saves enclosed by a moved building resume outdoors without losing resources or progress',async()=>{
 const original=await loadTownTour({build:DEFAULT_BUILD,fetcher,projectURL}),w=getTourWorld(original);
 try{
  const u=hero(original);u.ammo.assault=4;u.stamina=0;u.heading=1.23;original.solo.distance=123;original.elapsed=45;
  const p=readTourProgress(encodeSave(original)),house=JSON.parse(fs.readFileSync(new URL('features.json',base))).features.find(p=>p.id==='osm-way-560095904');
  // This was outdoor ground beside the original diamond-shaped house; the
  // new cardinal rectangle encloses it without placing a wall on the animal.
  // (The rectangle moved with its streets; this point is 3.5 m inside it.)
  assert(solidDistance({kind:'polygon',polygons:house.geographicGeometry.coordinates},{x:276.5,y:714.5})>.31);
  Object.assign(p.player,{x:276,y:714});p.sourceRevision='0'.repeat(64);
  await w.readyAt(p.player);assert(w.pointClear(p.player),'Interior is clear of walls, demonstrating why pointClear alone is insufficient');assert(!w.resumeClear(p.player));
  const oldPosition={x:p.player.x,y:p.player.y},restored=await loadTownTour({progress:p,fetcher,projectURL});
  try{const q=hero(restored),rw=getTourWorld(restored);assert(rw.resumeClear(q));assert(Math.hypot(q.x-oldPosition.x,q.y-oldPosition.y)<24);assert.equal(q.ammo.assault,4);assert.equal(q.stamina,0);assert.equal(q.heading,1.23);assert.deepEqual(q.pack,p.player.pack);assert.equal(restored.solo.distance,123);assert.equal(restored.elapsed,45);for(const key of p.seen)assert(restored.seen.has(key));assert.deepEqual({x:p.player.x,y:p.player.y},oldPosition);assert(restored.log.some(s=>s.includes('clear outdoor approach')));}finally{getTourWorld(restored).dispose();}
 }finally{w.dispose();}
});

test('an old artwork module cannot load the newly authored layout',async()=>{
 await assert.rejects(loadTownTour({build:DEFAULT_BUILD,fetcher,projectURL,artModule:{...ART,AUTHORED_LAYOUT_SHA256:'0'.repeat(64)}}),/layouts differ/);
});

test('grid-aligned Palm Island pavilion has a supported route from the original boardwalk',async()=>{
 const w=await new TownWorld(project,{baseURL:base,fetcher,art:ART}).identify();
 const start={x:568.0622066849226-.5,y:1388.926080401632-.5};w.startPoint=start;
 try{await w.readyAt(start);const state=createSoloGame(DEFAULT_BUILD,1947,'mount-dora',{tourWorld:w}),u=hero(state),p=ART.PLACEMENTS.find(p=>p.id==='md:shelter:557051211');
  assert(p.points.every(p=>p.every(Number.isInteger)));const target={x:p.anchor[0]-.5,y:p.anchor[1]-.5},d=Math.hypot(target.x-u.x,target.y-u.y);assert(Math.abs(Core.travel(state,u,target.x-u.x,target.y-u.y)-d)<1e-5);assert(Math.abs(Core.travel(state,u,start.x-u.x,start.y-u.y)-d)<1e-5);
 }finally{w.dispose();}
});

test('snapping retains the two narrow outdoor passages between neighbouring houses',async()=>{
 const w=await new TownWorld(project,{baseURL:base,fetcher,art:ART}).identify();
 // Each reviewed plan keeps a narrow passage along its south side, and the
 // passage moves with the plan when the plan moves with its street.
 const records=JSON.parse(fs.readFileSync(new URL('authored-buildings.json',base))).records;
 const passages=[['osm-way-1240419485',4,11],['osm-way-1240419511',9,17]].map(([id,from,to])=>{const [x0,,,y1]=records.find(r=>r.id===id).bounds;return [{x:x0+from,y:y1},{x:x0+to,y:y1}];});
 try{for(const [a,b]of passages){
  w.startPoint=a;await w.readyAt(a);const s=createSoloGame(DEFAULT_BUILD,1947,'mount-dora',{tourWorld:w}),u=hero(s);
  assert(w.resumeClear(a));const d=Math.hypot(b.x-a.x,b.y-a.y);assert(Math.abs(Core.travel(s,u,b.x-a.x,b.y-a.y)-d)<1e-5);assert(w.resumeClear(u));
 }}finally{w.dispose();}
});
