import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTownTour} from '../dist/mount-dora-entry.js';
import {getTourWorld} from '../dist/mount-dora-activity.js';
import {Core,DEFAULT_BUILD,hero,tick,encodeSave,confirmedImpact} from '../dist/solo-game.js';
import {readTourProgress} from '../dist/mount-dora-progress.js';
import {UPPER_GUARD_POSTS,TOWN_MAX_GUARDS} from '../dist/mount-dora-upper-guards.js';
import {TownInteriorScenery} from '../dist/town-interior-view.js';
import {GuardSightView} from '../dist/guard-sight-view.js';
import {InteractionScenery} from '../dist/interaction-view.js';
import {blockWindow} from '../dist/world-grid.js';
import {stairPoint,FLOOR_SPACING} from '../dist/town-levels.js';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
const projectURL=new URL('../../../maps/mount-dora/project.json',import.meta.url),fetcher=async u=>new Response(fs.readFileSync(u)),idle=async w=>{while(w.inFlight.size||w.queue.length)await new Promise(r=>setTimeout(r,1));};
const load=progress=>loadTownTour({build:DEFAULT_BUILD,progress,projectURL,fetcher});
async function watch(id=46){const s=await load(),w=getTourWorld(s),u=hero(s),post=UPPER_GUARD_POSTS.find(p=>p.id===id),g=s.units.find(g=>g.id===id);await idle(w);await w.readyAt(post.reviewApproach);await idle(w);Object.assign(u,post.reviewApproach,{heading:Core.headingTo(post.reviewApproach,g)});Core.refresh(s,{forceFog:true});return {s,w,u,g,post};}

test('eight authored window guards join the unchanged forty-two street sentries, with clear two-way firing positions',async()=>{
 const s=await load(),w=getTourWorld(s),u=hero(s);
 try{assert.equal(s.units.filter(g=>g.team==='guard').length,TOWN_MAX_GUARDS);assert.equal(w.guardRosterVersion,2);const native=w.project.sectors.flatMap(s=>(s.guards||[]).map(g=>({...g,x:g.x+s.origin.x,y:g.y+s.origin.y})));for(const p of native){const g=s.units.find(g=>g.id===p.id);assert.deepEqual([g.x,g.y,g.weapon,g.heading],[p.x,p.y,p.weapon,p.heading]);}
  assert.equal(new Set(UPPER_GUARD_POSTS.map(p=>p.building)).size,8);assert(UPPER_GUARD_POSTS.some(p=>p.level===2));assert(!UPPER_GUARD_POSTS.some(p=>p.building==='osm-way-547799531'));
  for(const p of UPPER_GUARD_POSTS){await idle(w);await w.readyAt(p);await idle(w);const g=s.units.find(g=>g.id===p.id);assert(w.resumeClear(g),p.name);assert.equal(g.elevation,p.level*FLOOR_SPACING);assert.equal(g.maxHp,Math.round(u.maxHp/2));Object.assign(u,p.reviewApproach,{heading:Core.headingTo(p.reviewApproach,g)});Core.refresh(s,{forceFog:true});assert(Core.canSee(s,g,u),p.name+' sees the street');assert(Core.canSee(s,u,g),p.name+' can be spotted from the street');assert.equal(confirmedImpact(s,g,u)?.unit?.id,u.id,p.name+' fires out');assert.equal(confirmedImpact(s,u,g)?.unit?.id,g.id,p.name+' accepts return fire');assert(w.interiors.visibleRooms.has(w.interiors.roomAt(g.x,g.y,g.level).id));}
 }finally{w.dispose();}
});

test('a published upper-floor guard fires downward with normal ammunition, health and reload rules',async()=>{
 const {s,w,u,g}=await watch();
 try{Core.enableRealtime(s);const before=g.ammo[g.weapon];for(let i=0;i<1200&&u.hp===u.maxHp;i++)tick(s,.025);assert(u.hp<u.maxHp);assert(u.hp>0);assert(g.ammo[g.weapon]<before);const shot=s.effect.sequence.find(e=>e.shooter===g.id);assert(shot);assert.equal(shot.ah,g.elevation+1.1);assert.equal(shot.bh,1.75*.62);assert.equal(g.level,1);assert.equal(g.elevation,2.12);}
 finally{w.dispose();}
});

test('turning to spot an upstairs guard reveals its real floor immediately and draws a height-correct threat line',async()=>{
 const {s,w,u,g,post}=await watch();let view,sight,leaves;
 try{Core.turnTo(s,u,(Core.headingTo(u,g)+180)%360);assert(!s.detected.has(g.id));Core.turnTo(s,u,Core.headingTo(u,g));assert(s.detected.has(g.id));view=new TownInteriorScenery(w,{loadAsync:async()=>new T.Texture()},new Map());await view.ready;view.update(blockWindow(s,u));view.focus();const b=view.resident.get(post.building);assert.equal(b.displayLevel,g.level);assert(b.levels[g.level].root.visible&&b.levels[g.level].floors.visible&&b.levels[g.level].cut.visible);assert(!b.levels[0].floors.visible);assert(!b.roofs.visible);assert.equal(u.level,0);assert(w.exploredFloors.get(g.level).has(Core.key(g.x,g.y)));
  const loader={load:(_url,ready)=>{const t=new T.Texture({width:2048,height:2048});ready?.(t);return t;}};leaves=new InteractionScenery(s,{loader});leaves.update(s,blockWindow(s,u));const door=w.interiors.buildings.get(post.building).allDoors.find(d=>d.level===g.level&&d.rooms.includes(w.interiors.roomAt(g.x,g.y,g.level).room)),leaf=leaves.records.get(door.id).leaf;assert(leaf.visible);assert(leaves.records.has(w.interiors.buildings.get(post.building).doors.find(d=>d.exterior).id),'Lower exterior door leaves remain present beneath the cutaway');assert(Math.abs(leaf.position.y-(g.elevation+door.height/2))<1e-8);const before=leaf.position.clone();door.open=true;w.interiors.changed();leaves.update(s,blockWindow(s,u));assert(leaf.position.distanceTo(before)>.2);
  sight=new GuardSightView(new T.Group());sight.update(s,u,[u,g],blockWindow(s,u),0);const r=sight.outlines.get(g.id);assert.equal(r.line.geometry.drawRange.count,2);const position=r.line.geometry.getAttribute('position');assert(Math.abs(position.getY(0)-(g.elevation+1.1))<1e-5);assert(Math.abs(position.getY(1)-1.1)<1e-5);
  g.heading=(g.heading+180)%360;Core.refresh(s);sight.update(s,u,[u,g],blockWindow(s,u),200);assert(!sight.outlines.has(g.id),'A guard looking away must not paint a false threat fan');
 }finally{leaves?.dispose();sight?.dispose();view?.dispose();w.dispose();}
});

test('an upstairs guard uses the actual stair flight when pursuing a remembered target on the floor below',async()=>{
 const {s,w,u,g,post}=await watch(),b=w.interiors.buildings.get(post.building),stair=b.stairs[0];
 try{for(const d of b.allDoors)if(!d.exterior)d.open=true;w.interiors.changed();const landing=stairPoint(stair,0,0),room=b.rooms.find(r=>r.id===stair.room);const target=room.runs.flatMap(([y,x0,x1])=>Array.from({length:x1-x0},(_,i)=>({x:x0+i,y,level:0,elevation:0}))).find(p=>Math.hypot(p.x-landing.x,p.y-landing.y)>1.7&&!w.interiors.plotAt(p)&&w.pointClear(p)&&w.walkSegment({...landing,level:0,elevation:0},p));assert(target);Object.assign(u,target);for(const k of Object.keys(g.ammo))g.ammo[k]=0;for(const k of Object.keys(g.ammoPouch))g.ammoPouch[k]=0;g.alert=true;g.lastKnown={...target};Core.enableRealtime(s);Core.refresh(s,{forceFog:true});let descended=false;for(let i=0;i<1000;i++){tick(s,.025);if(g.level===0&&!g.stairId){descended=true;break;}}assert(descended);assert.equal(g.elevation,0);assert(u.hp>0);}
 finally{w.dispose();}
});

test('version-one street checkpoints retain casualties and resources while receiving the new posts; upper casualties resume upstairs',async()=>{
 const {s,w,u,g}=await watch();let legacyState,resumed;
 try{const legacy=JSON.parse(encodeSave(s));legacy.runtime.guardRosterVersion=1;legacy.runtime.guards=legacy.runtime.guards.filter(g=>g.id<=45);const old=legacy.runtime.guards.find(g=>g.id===14);old.hp=0;old.casualty='dead';old.ap=0;const patrol=legacy.runtime.guards.find(g=>g.id===2);patrol.ammo[patrol.weapon]=1;legacyState=await load(readTourProgress(JSON.stringify(legacy)));assert.equal(legacyState.units.length-1,50);assert.equal(legacyState.units.find(g=>g.id===14).hp,0);assert.equal(legacyState.units.find(g=>g.id===2).ammo[patrol.weapon],1);assert.equal(legacyState.units.find(g=>g.id===46).level,1);
  g.hp=0;g.ap=0;g.casualty='dead';Core.restoreRuntimeSystems(s);const progress=readTourProgress(encodeSave(s));resumed=await load(progress);const corpse=resumed.units.find(v=>v.id===g.id);assert.equal(corpse.hp,0);assert.equal(corpse.level,1);assert.equal(corpse.elevation,2.12);assert(resumed.interactables.some(o=>o.id==='body:'+g.id));const moved=JSON.parse(encodeSave(s));moved.sourceRevision='0'.repeat(64);getTourWorld(resumed).dispose();resumed=await load(readTourProgress(JSON.stringify(moved)));assert.equal(resumed.units.find(v=>v.id===g.id).level,1,'Layout migration must preserve the canonical upper post height');
 }finally{getTourWorld(legacyState)?.dispose();getTourWorld(resumed)?.dispose();w.dispose();}
});
