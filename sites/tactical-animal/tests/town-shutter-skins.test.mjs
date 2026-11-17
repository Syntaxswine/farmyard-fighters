import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {townWindowParts,townWindowSkins,TOWN_WINDOW} from '../dist/town-windows.js';
import {WALL_DIMENSIONS} from '../dist/world-dimensions.js';
import {UNIT_RADIUS,Core,DEFAULT_BUILD,hero,freePoint} from '../dist/solo-game.js';
import {loadTownTour} from '../dist/mount-dora-entry.js';
import {getTourWorld} from '../dist/mount-dora-activity.js';
import {blockWindow} from '../dist/world-grid.js';

test('shutters are surface skins; physical frames stay inside the supporting wall envelope',()=>{
 for(const outward of [[1,0],[-1,0],[0,1],[0,-1]])for(const level of [0,1,4]){
  const w={id:'declared-window',x:400,y:480,axis:outward[0]?'e':'s',outward,level},parts=townWindowParts(w),skins=townWindowSkins(w);
  assert.equal(parts.length,4);assert(parts.every(p=>p.role==='frame'));assert.equal(skins.length,2);assert.equal(TOWN_WINDOW.depth,WALL_DIMENSIONS.thickness);
  const axis=w.axis==='e'?'x':'y';for(const p of parts)assert(Math.max(Math.abs(p[axis+'0']-w[axis]),Math.abs(p[axis+'1']-w[axis]))<=WALL_DIMENSIONS.thickness/2+1e-8);
  for(const s of skins){assert.equal(s.role,'shutter-skin');assert.equal(s.kind,undefined);assert.equal(s.z0,undefined);assert.equal(s.centre[1],level*2.12+1.2);const [x0,y0,x1,y1]=s.bounds;assert((x1-x0)*(y1-y0)===0,'A skin has no physical thickness');}
  assert.deepEqual(townWindowSkins({...w,shutters:false}),[]);
 }
});

test('production movement hugs every wall direction past shutters and frames, inside and outside, on both playable floors',async()=>{
 const projectURL=new URL('../../../maps/mount-dora/project.json',import.meta.url),fetcher=async url=>new Response(fs.readFileSync(url));
 const s=await loadTownTour({build:DEFAULT_BUILD,fetcher,projectURL}),world=getTourWorld(s),u=hero(s),idle=async()=>{while(world.inFlight.size||world.queue.length)await new Promise(r=>setTimeout(r,1));};
 try{
  await idle();await world.readyAt({x:398,y:478});await idle();Core.enableRealtime(s);
  const b=world.interiors.buildings.get('osm-way-547799531'),gap=UNIT_RADIUS+WALL_DIMENSIONS.thickness/2+.00002,span=1.15,covered=new Set();let traversals=0;
  for(const floor of b.floors)for(const side of floor.level?[-1]:[-1,1])for(const w of floor.windows){
   if(w.shutters===false)continue;const [nx,ny]=w.outward,tx=w.axis==='s'?1:0,ty=w.axis==='e'?1:0,label=[floor.level,side,nx,ny].join(',');if(covered.has(label))continue;
   const point=t=>({x:w.x+nx*side*gap+tx*t,y:w.y+ny*side*gap+ty*t,level:floor.level,elevation:floor.level*2.12});
   const a=point(-span),c=point(span);if(!world.walkSegment(a,c)||!world.walkSegment(c,a)||!freePoint(s,a,u.id)||!freePoint(s,c,u.id))continue;
   for(const sign of [1,-1])for(const push of [0,.8]){
    Object.assign(u,point(-sign*span));delete u.stairId;world.ensureCoverage(blockWindow(s,u),u);Core.refresh(s,{forceFog:true});assert(world.pointClear(u));
    const before=u.travelled,moved=Core.travel(s,u,tx*sign*span*2-nx*side*push,ty*sign*span*2-ny*side*push),target=point(sign*span);
    assert(Math.hypot(u.x-target.x,u.y-target.y)<1e-5,'Wall travel snagged at '+w.id+' / '+label);assert(Math.abs(moved-span*2)<1e-5);assert(Math.abs(u.travelled-before-moved)<1e-5);assert(world.pointClear(u));assert.equal(u.level,floor.level);traversals++;
   }
   covered.add(label);
  }
  assert.equal(covered.size,12,'Exercise all four facings outside/inside ground floor and inside the upper floor');assert.equal(traversals,48);assert.equal(s.units.filter(g=>g.team==='guard').length,50);
  assert(!world.geometryBoxes([b.bounds[0],b.bounds[1],b.bounds[2],b.bounds[3]]).some(p=>/shutter/.test(p.role||'')));
 }finally{world.dispose();}
});
