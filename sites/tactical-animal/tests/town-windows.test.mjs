import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TownWorld} from '../dist/mount-dora-world.js';
import {Core,tick,approachPath,encodeSave,projectileSegmentClear,confirmedImpact} from '../dist/solo-game.js';
import {readTourProgress} from '../dist/mount-dora-progress.js';
import {loadTownTour} from '../dist/mount-dora-entry.js';
import {getTourWorld} from '../dist/mount-dora-activity.js';
import {TownInteriorScenery} from '../dist/town-interior-view.js';
import {FLOOR_SPACING} from '../dist/town-levels.js';
import {townWindowParts} from '../dist/town-windows.js';
import {blockWindow} from '../dist/world-grid.js';
import {contactCameraFrame} from '../dist/render-residency.js';
import {fieldCameraFor} from '../dist/grenade-controls.js';
import * as art from '../dist/mission-art/mount-dora/manifest.js';
import * as interiors from '../dist/mission-art/mount-dora-interiors/manifest.js';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {windowFixture} from './helpers/town-window-fixture.mjs';
const base=new URL('../../../maps/mount-dora/',import.meta.url),project=JSON.parse(fs.readFileSync(new URL('project.json',base))),fetcher=async u=>new Response(fs.readFileSync(u)),idle=async w=>{while(w.inFlight.size||w.queue.length)await new Promise(r=>setTimeout(r,1));};

test('all generated windows pass sight through their opening and retain solid sills, headers and jambs',async()=>{
 const w=await new TownWorld(project,{baseURL:base,fetcher,art,interiors}).identify(),checked=new Set();let windows=0;
 try{for(const sector of project.sectors){await w.readyAt({x:sector.origin.x+119,y:sector.origin.y+119});await idle(w);for(const source of w.cache.get(sector.id).interiors.buildings){if(checked.has(source.id))continue;checked.add(source.id);const b=w.interiors.buildings.get(source.id);for(const floor of b.floors){assert(floor.windows.length,b.id+' has no usable exterior window');for(const p of floor.windows){const [dx,dy]=p.outward,base=p.level*FLOOR_SPACING,a={x:p.x-dx*.25,y:p.y-dy*.25,h:base+1.1},c={x:p.x+dx*.25,y:p.y+dy*.25,h:base+1.1};assert(w.interiors.lineClear(a,c),p.id+' aperture');for(const h of [.35,1.9])assert(!w.interiors.lineClear({...a,h:base+h},{...c,h:base+h}),p.id+' solid sill/header');const tangent=p.axis==='e'?{x:0,y:.48}:{x:.48,y:0};assert(!w.interiors.lineClear({...a,x:a.x+tangent.x,y:a.y+tangent.y},{...c,x:c.x+tangent.x,y:c.y+tangent.y}),p.id+' jamb');assert(!w.walkSegment({...a,level:p.level,elevation:base},{...c,level:p.level,elevation:base}),p.id+' cannot be walked through');windows++;}}}assert(w.cache.size<=9);assert(w.stats.peakFetches<=2);}assert.equal(checked.size,1076);assert.equal(windows,18551);}
 finally{w.dispose();}
});

test('an upstairs soldier spots and shoots an outdoor guard, can receive return fire, and breaks contact behind a pier',async()=>{
 const f=await windowFixture(),{state:s,world:w,unit:u,guard:g,cover}=f;
 try{Core.enableRealtime(s);Core.refresh(s,{forceFog:true});assert.equal(s.units.filter(u=>u.team==='guard').length,50);assert(Core.canSee(s,u,g));assert(Core.canSee(s,g,u));assert(w.visibleSurface(g));assert(w.visibleSurface(g,1.1));assert(s.detected.has(g.id));assert(s.visible.has(Core.key(g.x,g.y)));assert(w.exploredFloors.get(0).has(Core.key(g.x,g.y)));assert(projectileSegmentClear(s,{...u,h:3.22},{...g,h:1.1}));assert.equal(confirmedImpact(s,u,g).unit.id,g.id);assert.equal(confirmedImpact(s,g,u).unit.id,u.id);
  const hp=g.hp;for(let i=0;i<8&&g.hp===hp;i++){assert(Core.attack(s,u,g,false,false,'torso',false,'full'));for(let frame=0;frame<120&&g.hp===hp;frame++)tick(s,.025);}assert(g.hp<hp,'The production shot must damage the outdoor guard');const hit=s.effect.sequence.find(e=>e.hit&&e.shooter===u.id);assert(hit);assert.equal(hit.ah,3.22);assert(hit.bh<1.75);assert.equal(g.lastKnown.level,1);
  Object.assign(u,{stance:'prone'});Core.refresh(s,{forceFog:true});assert(!Core.canSee(s,u,g),'The sill conceals a prone soldier');u.stance='standing';assert(Core.travel(s,u,cover.x-u.x,cover.y-u.y));Core.refresh(s,{forceFog:true});assert(!Core.canSee(s,u,g));assert(!Core.canSee(s,g,u));assert(!s.detected.has(g.id));assert(!w.visibleSurface(g));assert(!confirmedImpact(s,u,g)?.unit,'The pier blocks bullets as well as sight');
 }finally{w.dispose();}
});

test('the accelerated outdoor sight lookup exactly matches ordinary production sight across walls, windows and trees',async()=>{
 const {state:s,world:w,unit:u,cover}=await windowFixture();
 try{for(const p of [{...u},cover,{x:400,y:638,level:0,elevation:0}]){const eye={...p,h:(p.elevation||0)+1.1},probe=w.groundSightProbe(eye);for(let y=Math.floor(p.y-30);y<=p.y+30;y++)for(let x=Math.floor(p.x-30);x<=p.x+30;x++){if(Math.hypot(x-p.x,y-p.y)>30)continue;assert.equal(probe({x,y}),w.lineClear(eye,{x,y,h:1.1}),'Sight mismatch at '+x+','+y);}}}
 finally{w.dispose();}
});

test('rendered open frames share the production collision and an upstairs checkpoint retains its view',async()=>{
 const {state:s,world:w,unit:u,window:p,building:b}=await windowFixture();let view,restored;
 try{view=new TownInteriorScenery(w,{loadAsync:async()=>new T.Texture()},new Map());await view.ready;view.update(blockWindow(s,u));view.focus();const r=view.resident.get(b.id).levels[1],parts=townWindowParts(p);assert.deepEqual(r.trim.userData.boxes.filter(v=>v.windowId===p.id),parts.filter(v=>v.role==='frame'));assert.deepEqual(r.panels.userData.boxes.filter(v=>v.windowId===p.id),parts.filter(v=>v.role==='shutter'));assert(r.trim.visible);assert.equal(r.trim.userData.boxes.filter(v=>v.windowId===p.id).length,4);assert(!parts.some(v=>v.role==='glass'));assert(w.geometryBoxes([p.x-.5,p.y-.5,p.x+.5,p.y+.5]).some(v=>v.windowId===p.id));
  const saved=readTourProgress(encodeSave(s));assert(!saved.runtime.objects.some(v=>v.id.startsWith('window:')),'Static open windows do not inflate saved state');restored=await loadTownTour({progress:saved,fetcher,projectURL:new URL('project.json',base)});const rw=getTourWorld(restored),ru=restored.units[0],g=restored.units.find(v=>v.id===7);assert.equal(ru.level,1);assert(Core.canSee(restored,ru,g));assert(restored.visible.has(Core.key(g.x,g.y)));
 }finally{view?.dispose();getTourWorld(restored)?.dispose();w.dispose();}
});

test('a fifth-storey window supports actual downward sight and bullets without clipping its own slab',async()=>{
 const {state:s,world:w,unit:u,guard:g}=await windowFixture({level:4});
 try{assert.equal(u.elevation,8.48);assert(Core.canSee(s,u,g));assert(Core.canSee(s,g,u));assert.equal(confirmedImpact(s,u,g).unit.id,g.id);assert.equal(confirmedImpact(s,g,u).unit.id,u.id);assert(w.visibleSurface(g));assert(s.visible.has(Core.key(g.x,g.y)));}finally{w.dispose();}
});

test('a guard losing an upstairs window target rejects closed-door chases before any ground-grid sweep',async()=>{
 const {state:s,world:w,unit:u,guard:g,building:b,cover}=await windowFixture();const trace=w.traceWalk.bind(w);let sweeps=0;
 try{Core.enableRealtime(s);Core.refresh(s,{forceFog:true});Object.assign(u,cover);Core.refresh(s,{forceFog:true});assert(!Core.canSee(s,g,u));assert.equal(g.lastKnown.level,1);w.traceWalk=(...args)=>{assert(++sweeps<40,'An impossible upstairs chase must not flood the outdoor grid');return trace(...args);};assert.equal(approachPath(s,g,g.lastKnown),null);for(let i=0;i<4;i++)tick(s,.025);assert.equal(sweeps,0);assert(!w.interiors.connected(g,u));for(const door of b.allDoors)door.open=true;w.interiors.changed();assert(w.interiors.connected(g,u),'Open doors and the actual stairwell restore room connectivity');for(const door of b.allDoors)door.open=false;w.interiors.changed();assert(!w.interiors.connected(g,u));}
 finally{w.traceWalk=trace;w.dispose();}
});

test('automatic framing keeps an upper-floor soldier and lower guard inside the screen area above the controls',async()=>{
 const {state:s,world:w,unit:u,guard:g}=await windowFixture({level:4});
 try{Core.enableRealtime(s);Core.refresh(s,{forceFog:true});const viewport={width:1440,height:1000},frame=contactCameraFrame(s,u,viewport,18.72),direction=fieldCameraFor(s),camera=new T.OrthographicCamera(-frame.span*1.44/2,frame.span*1.44/2,frame.span/2,-frame.span/2,.1,120),target=new T.Vector3(frame.target.x,u.elevation,frame.target.y);camera.position.copy(target).add(new T.Vector3(direction.x,direction.y,direction.z));camera.lookAt(target);camera.updateMatrixWorld(true);for(const unit of [u,g])for(const height of [0,1.8]){const p=new T.Vector3(unit.x,(unit.elevation||0)+height,unit.y).project(camera),x=(p.x+1)*720,y=(1-p.y)*500;assert(x>=16&&x<=1424);assert(y>=100&&y<=780,'The merc and contact must remain above the HUD');}}
 finally{w.dispose();}
});
