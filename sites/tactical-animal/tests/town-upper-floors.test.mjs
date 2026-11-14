import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TownWorld} from '../dist/mount-dora-world.js';
import {loadTownTour,visitTownLandmark} from '../dist/mount-dora-entry.js';
import {getTourWorld} from '../dist/mount-dora-activity.js';
import {DEFAULT_BUILD,hero,Core,tick,encodeSave,projectileSegmentClear,confirmedImpact} from '../dist/solo-game.js';
import {readTourProgress} from '../dist/mount-dora-progress.js';
import {FLOOR_SPACING,stairPoint,stairTurn,stairCoreContains,floorLevel,baseHeight} from '../dist/town-levels.js';
import {blockWindow} from '../dist/world-grid.js';
import {TownInteriorScenery} from '../dist/town-interior-view.js';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import * as art from '../dist/mission-art/mount-dora/manifest.js';
import * as interiors from '../dist/mission-art/mount-dora-interiors/manifest.js';
import {BodyImpactEffects} from '../dist/body-impact-effects.js';
const base=new URL('../../../maps/mount-dora/',import.meta.url),projectURL=new URL('project.json',base),project=JSON.parse(fs.readFileSync(projectURL)),fetcher=async url=>new Response(fs.readFileSync(url));
const idle=async w=>{while(w.inFlight.size||w.queue.length)await new Promise(r=>setTimeout(r,1));};
const records=new Map(interiors.SECTORS.flatMap(s=>JSON.parse(fs.readFileSync(new URL(s.file,base))).buildings).map(b=>[b.id,b]));
const at=(p,level)=>({x:p[0],y:p[1],level,elevation:level*FLOOR_SPACING});
async function fixture(stories=2,build=DEFAULT_BUILD){const state=await loadTownTour({build,fetcher,projectURL}),world=getTourWorld(state),unit=hero(state),record=[...records.values()].find(b=>b.stories===stories),point=stairPoint(record.stairs[0],0,0);await world.readyAt(point);Object.assign(unit,point,{level:0,elevation:0});world.ensureCoverage(blockWindow(state,unit),unit);Core.refresh(state,{forceFog:true});return {state,world,unit,building:world.interiors.buildings.get(record.id)};}
function combatPair(w,b){for(const r of b.upperFloors[0].rooms){const cells=new Set(r.runs.flatMap(([y,x0,x1])=>Array.from({length:x1-x0},(_,i)=>(x0+i)+','+y)));for(const k of cells){const [x,y]=k.split(',').map(Number),a={x,y,level:1,elevation:FLOOR_SPACING};if(w.interiors.plotAt(a)||!w.pointClear(a))continue;for(const [dx,dy]of [[2,0],[-2,0],[0,2],[0,-2]]){const target={x:x+dx,y:y+dy,level:1,elevation:FLOOR_SPACING};if(cells.has(target.x+','+target.y)&&!w.interiors.plotAt(target)&&w.pointClear(target)&&w.pointClear({...target,level:0,elevation:0})&&w.lineClear(a,target))return [a,target];}}}throw Error('No clear indoor combat pair');}

test('all 164 multi-storey footprints receive 190 connected upper floors and real staircase apertures',()=>{
 const multi=[...records.values()].filter(b=>b.stories>1);assert.equal(multi.length,164);assert.equal(multi.reduce((n,b)=>n+b.upperFloors.length,0),190);
 for(const b of multi){assert.equal(b.upperFloors.length,b.stories-1);assert.equal(b.stairs.length,b.stories-1);const ids=new Set(b.doors.map(d=>d.id));for(const floor of b.upperFloors){assert.equal(floor.level,b.upperFloors.indexOf(floor)+1);assert.equal(floor.doors.length,b.rooms.length-1);const reached=new Set([b.stairs[0].room]);for(let old=-1;old!==reached.size;){old=reached.size;for(const d of floor.doors)if(d.rooms.some(r=>reached.has(r)))d.rooms.forEach(r=>reached.add(r));}assert.equal(reached.size,floor.rooms.length,b.id);for(const d of floor.doors){assert(!ids.has(d.id));ids.add(d.id);assert.equal(d.level,floor.level);assert.equal(d.z0,floor.level*FLOOR_SPACING);assert(!d.exterior);}for(const [y,x0,x1]of floor.slabRuns)for(let x=x0;x<x1;x++)assert(!stairCoreContains(b.stairs[0],{x,y}),'Slabs must have a real stairwell opening');}}
});

test('every stair flight can be walked both ways; every upper door blocks when shut and clears when open',async()=>{
 const w=await new TownWorld(project,{baseURL:base,fetcher,art,interiors}).identify(),checked=new Set();let flights=0,doors=0;
 try{for(const sector of project.sectors){await w.readyAt({x:sector.origin.x+119,y:sector.origin.y+119});await idle(w);for(const source of w.cache.get(sector.id).interiors.buildings){if(checked.has(source.id))continue;checked.add(source.id);const b=w.interiors.buildings.get(source.id);for(const stair of b.stairs){const turn=stairTurn(stair)+.5,bottom={...stairPoint(stair,0,0),level:stair.level,elevation:stair.level*FLOOR_SPACING};let p=bottom;for(const next of [stairPoint(stair,0,turn),stairPoint(stair,1,turn),stairPoint(stair,1,0)]){p=w.traceWalk(p,next);assert(p,stair.id+' ascent');}assert.equal(p.level,stair.level+1);assert(Math.abs(p.elevation-(stair.level+1)*FLOOR_SPACING)<1e-8);assert(!p.stairId);for(const next of [stairPoint(stair,1,turn),stairPoint(stair,0,turn),stairPoint(stair,0,0)]){p=w.traceWalk(p,next);assert(p,stair.id+' descent');}assert.equal(p.level,stair.level);assert(Math.abs(p.elevation-bottom.elevation)<1e-8);flights++;}
  for(const floor of b.upperFloors)for(const d of floor.doors){const a=at(d.outside,floor.level),c=at(d.inside,floor.level);assert(!w.walkSegment(a,c));assert(!w.lineClear(a,c));d.open=true;assert(w.walkSegment(a,c),d.id);assert(w.lineClear(a,c),d.id);d.open=false;doors++;}
 }assert(w.cache.size<=9);assert(w.stats.peakFetches<=2);}assert.equal(flights,190);assert.equal(doors,3174);}finally{w.dispose();}
});

test('production hand actions climb five storeys, return to ground, and charge actual walking AP',async()=>{
 const {state:s,world:w,unit:u,building:b}=await fixture(5);
 try{Core.enableRealtime(s);for(let level=0;level<4;level++){const stair=b.stairs[level],target=stairPoint(stair,0,0),approach=Core.navigationPath(s,u,target.x,target.y,{level});assert(approach);for(const p of approach)Core.travel(s,u,p.x-u.x,p.y-u.y);assert(Core.performInteraction(s,stair.id+':up','traverse').ok);for(let frame=0;s.queue.length&&frame<400;frame++){const remaining=s.queue.length;tick(s,0);assert.equal(s.queue.length,remaining,'Clock-reset frames preserve the stair order');tick(s,.025);}assert.equal(s.queue.length,0);assert.equal(u.level,level+1);assert.equal(u.elevation,(level+1)*FLOOR_SPACING);}
  for(let level=3;level>=0;level--){const stair=b.stairs[level];assert(Core.performInteraction(s,stair.id+':down','traverse').ok);for(let frame=0;s.queue.length&&frame<400;frame++)tick(s,.025);assert.equal(u.level,level);if(level){const p=stairPoint(b.stairs[level-1],1,0),route=Core.navigationPath(s,u,p.x,p.y,{level});assert(route);for(const p of route)Core.travel(s,u,p.x-u.x,p.y-u.y);}}
  assert.equal(u.elevation,0);delete s.realtime;s.phase='player';s.engaged=true;u.ap=30;const before=u.ap,stair=b.stairs[0];assert(Core.performInteraction(s,stair.id+':up','traverse').ok);const expected=s.queue.reduce((n,p)=>n+p.cost,0);for(const p of [...s.queue])Core.travel(s,u,p.x-u.x,p.y-u.y);assert(Math.abs(before-u.ap-expected)<1e-5);assert.equal(u.level,1);
 }finally{w.dispose();}
});

test('slabs block vertical sight, bullets, blast and flame; an upper floor cannot be walked off its footprint',async()=>{
 const {state:s,world:w,unit:u,building:b}=await fixture(2);
 try{const floor=b.upperFloors[0],cell=floor.slabRuns.find(r=>r[2]-r[1]>2),point={x:cell[1]+1,y:cell[0]},low={...point,elevation:0,level:0},high={...point,elevation:FLOOR_SPACING,level:1};assert(!w.lineClear(low,high));assert(!projectileSegmentClear(s,{...low,h:1.1},{...high,h:FLOOR_SPACING+1.1}));assert(!Core.grenadeAffects(s,low,high));assert(w.geometryBoxes([point.x,point.y,point.x,point.y]).some(b=>b.slab&&b.z0===2&&b.height===2.12));
  const top=stairPoint(b.stairs[0],1,0);Object.assign(u,top,{level:1,elevation:FLOOR_SPACING});const far={x:b.bounds[0]-2,y:u.y};assert(!w.traceWalk(u,far));
 }finally{w.dispose();}
});

test('a checkpoint halfway up stairs and upstairs door deltas resume at their real height without leaking floor exploration',async()=>{
 const {state:s,world:w,unit:u,building:b}=await fixture(3);let restored;
 try{const stair=b.stairs[0],mid=stairPoint(stair,0,stairTurn(stair)+.5);Core.travel(s,u,mid.x-u.x,mid.y-u.y);assert(u.stairId);assert(u.elevation>0&&u.elevation<FLOOR_SPACING);const door=b.upperFloors[0].doors[0];door.open=true;w.interiors.changed();const text=encodeSave(s),saved=readTourProgress(text);restored=await loadTownTour({progress:saved,fetcher,projectURL});const rw=getTourWorld(restored),ru=hero(restored);assert.equal(ru.stairId,u.stairId);assert.equal(ru.level,u.level);assert.equal(ru.elevation,u.elevation);assert(rw.interiors.doors.get(door.id).open);assert(rw.resumeClear(ru));
  const above=rw.exploredFloors.get(1),ground=rw.exploredFloors.get(0);assert.notEqual(above,ground);above.add('1,1');assert(!ground.has('1,1'));assert.throws(()=>readTourProgress(JSON.stringify({...JSON.parse(text),player:{...saved.player,level:5}})),/Unsupported/);
 }finally{getTourWorld(restored)?.dispose();w.dispose();}
});

test('upper-floor doors and stair cutaways are rendered at the same heights as their collision',async()=>{
 const {state:s,world:w,unit:u,building:b}=await fixture(3);let view;
 try{Object.assign(u,stairPoint(b.stairs[0],1,0),{level:1,elevation:FLOOR_SPACING});Core.refresh(s,{forceFog:true});view=new TownInteriorScenery(w,{loadAsync:async()=>new T.Texture()},new Map());await view.ready;view.update(blockWindow(s,u));view.focus();const r=view.resident.get(b.id);assert(r);assert(!r.roofs.visible);assert(!r.levels[2].root.visible);assert(r.levels[1].cut.visible);assert(!r.levels[0].floors.visible);assert(r.levels[1].floors.userData.boxes.every(box=>box.z0>FLOOR_SPACING));assert(r.stairs[0].root.visible);assert(view.surfacePicks.includes(r.levels[1].floors));
 }finally{view?.dispose();w.dispose();}
});

test('production firearms hit an upstairs guard and paint the impact at that floor, while the guard below is protected',async()=>{
 const {state:s,world:w,unit:u,building:b}=await fixture(2);let fx;
 try{const [a,target]=combatPair(w,b),g=s.units[1],below=s.units[2];Object.assign(u,a);Object.assign(g,target);Object.assign(below,target,{level:0,elevation:0});Core.enableRealtime(s);Core.refresh(s,{forceFog:true});assert(Core.canSee(s,u,g));assert(!Core.canSee(s,u,below));assert.equal(confirmedImpact(s,u,g).unit.id,g.id);const hp=g.hp,protectedHP=below.hp;
  for(let i=0;i<8&&g.hp===hp;i++){Core.attack(s,u,g,false,false,'torso',false,'full');for(let frame=0;frame<100&&g.hp===hp;frame++)tick(s,.025);}assert(g.hp<hp);assert.equal(below.hp,protectedHP);assert.equal(below.lastKnown.level,1);const event=s.effect.sequence.find(e=>e.bodyImpact&&e.shooter===u.id);assert(event);assert.equal(event.ah,FLOOR_SPACING+1.1);fx=new BodyImpactEffects(new T.Scene(),{loadTexture:async()=>new T.Texture()});fx.present(event,s,1000);assert.equal(fx.pending[0].placement.floor,FLOOR_SPACING);assert(Math.abs(fx.pending[0].placement.contact.y-event.bodyImpact.contact.h)<1e-6);
 }finally{fx?.dispose();w.dispose();}
});

test('production upper-floor grenades and flame retain their effects and health rules without damaging through a slab',async()=>{
 for(const primary of ['assault','flamethrower']){const {state:s,world:w,unit:u,building:b}=await fixture(2,{...DEFAULT_BUILD,primary,utility:'grenade'});
  try{const [a,target]=combatPair(w,b),g=s.units[1],below=s.units[2];Object.assign(u,a);Object.assign(g,target);Object.assign(below,target,{level:0,elevation:0});Core.refresh(s,{forceFog:true});const hp=below.hp;u.ap=30;
   if(primary==='assault'){const preview=Core.previewGrenade(s,u,target);assert(preview.ok,preview.reason);assert(Core.throwGrenade(s,u,target));const event=s.effect.sequence[0];assert.equal(event.sourceElevation,FLOOR_SPACING);assert.equal(event.impactElevation,FLOOR_SPACING);const trajectory=Core.grenadeTrajectory(u,target);assert.equal(trajectory[0].z,FLOOR_SPACING+1.1);assert.equal(trajectory.at(-1).z,FLOOR_SPACING+.08);}
   else{const heading=Core.headingTo(u,g),preview=Core.previewFlame(s,u,heading);assert(preview.ok,preview.reason);assert.equal(preview.shape.origin.h,FLOOR_SPACING+1.1);assert(Core.fireFlame(s,u,heading));assert(s.fireAnimations.some(e=>e.route[0].elevation===FLOOR_SPACING));}
   assert(g.hp<g.maxHp);assert.equal(below.hp,hp);assert.equal(below.lastKnown.level,1);
  }finally{w.dispose();}
 }
});

test('a production guard pursues a remembered upstairs position through the stairwell',async()=>{
 const {state:s,world:w,unit:u,building:b}=await fixture(2);
 try{const stair=b.stairs[0],g=s.units[1],landing=stairPoint(stair,1,0),room=b.upperFloors[0].rooms.find(r=>r.id===stair.room),positions=room.runs.flatMap(([y,x0,x1])=>Array.from({length:x1-x0},(_,i)=>({x:x0+i,y,level:1,elevation:FLOOR_SPACING}))),target=positions.find(p=>Math.hypot(p.x-landing.x,p.y-landing.y)>1.6&&!w.interiors.plotAt(p)&&w.pointClear(p)&&w.walkSegment({...landing,level:1,elevation:FLOOR_SPACING},p));assert(target);Object.assign(u,target);Object.assign(g,stairPoint(stair,0,0),{level:0,elevation:0,alert:true,lastKnown:{...target}});for(const k of Object.keys(g.ammo))g.ammo[k]=0;for(const k of Object.keys(g.ammoPouch))g.ammoPouch[k]=0;Core.enableRealtime(s);Core.refresh(s,{forceFog:true});let climbed=false;for(let i=0;i<400;i++){tick(s,.025);if(g.level===1&&!g.stairId){climbed=true;break;}}assert(climbed,'The guard must climb, rather than search at the same x/y downstairs');assert.equal(g.lastKnown.level,1);assert.equal(u.hp,u.maxHp);
 }finally{w.dispose();}
});

test('explicit landmark visits from upstairs and mid-flight return to the outdoor ground surface',async()=>{
 const {state:s,world:w,unit:u,building:b}=await fixture(2);
 try{const stair=b.stairs[0];for(const mid of [false,true]){await w.readyAt(stairPoint(stair,0,0));Object.assign(u,stairPoint(stair,0,0),{level:0,elevation:0});delete u.stairId;const p=stairPoint(stair,mid?0:1,mid?stairTurn(stair)+.5:0);if(mid)assert(Core.travel(s,u,p.x-u.x,p.y-u.y));else Object.assign(u,p,{level:1,elevation:FLOOR_SPACING});assert(u.level||u.stairId);await visitTownLandmark(s,'grantham-lighthouse');assert.equal(u.x,504);assert.equal(u.y,1168);assert.equal(u.level,0);assert.equal(u.elevation,0);assert(!u.stairId);assert(w.pointClear(u));}}
 finally{w.dispose();}
});
