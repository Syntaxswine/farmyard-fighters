import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {TownWorld,decodeTownSector,TOWN_LIMITS,solidDistance} from '../dist/mount-dora-world.js';
import {createSoloGame,DEFAULT_BUILD,Core,hero,encodeSave,confirmedImpact,freePoint,lineClear,projectileSegmentClear,tick} from '../dist/solo-game.js';
import {blockWindow} from '../dist/world-grid.js';
import {guardSightOutline} from '../dist/guard-sight-view.js';
const base=new URL('../../../maps/mount-dora/',import.meta.url),project=JSON.parse(fs.readFileSync(new URL('project.json',base)));
const fetcher=async url=>new Response(fs.readFileSync(url));
const make=async options=>new TownWorld(project,{baseURL:base,fetcher,...options}).identify();
test('walking adapter accepts all 42 released geographic files, including terrain-only water, without changing source',()=>{
  let walls=0,water=0,guards=0;
  for(const sector of project.sectors){const bytes=fs.readFileSync(new URL(sector.file,base)),raw=JSON.parse(bytes),before=JSON.stringify(raw),p=decodeTownSector(raw,sector);assert.equal(JSON.stringify(raw),before);assert.equal(p.raw,raw);walls+=p.walls.records.length;guards+=raw.guards.length;assert.deepEqual(raw.guards,sector.guards);if(!sector.nativeImport.ready){water++;assert(p.raw.terrain.every(r=>r.every(t=>t==='water')));}}
  assert.equal(walls,project.metrics.wallRuns);assert.equal(water,3);assert.equal(guards,42);
});
test('source-backed continuous movement crosses both axes and a four-sector corner without resetting state',async()=>{
  const w=await make();w.startPoint={x:479,y:479};try{await w.readyAt(w.startPoint);const s=createSoloGame(DEFAULT_BUILD,1947,'mount-dora',{tourWorld:w}),u=hero(s),pack=JSON.stringify(u.pack);
    for(const [x,y]of [[480,479],[480,480],[479,480],[479,479]]){assert(w.walkSegment(u,{x,y}));assert(Math.abs(Core.travel(s,u,x-u.x,y-u.y)-1)<1e-6);assert(Math.abs(u.x-x)<1e-6);assert(Math.abs(u.y-y)<1e-6);assert.equal(s.phase,'explore');assert.equal(s.units.length,43);assert.equal(Core.nearbyInteractions(s).length,0);}
    assert(Math.abs(s.solo.distance-4)<1e-6);assert.equal(JSON.stringify(u.pack),pack);assert(encodeSave(s).length<65000);assert.equal(s.map.length,1680);assert.equal(s.map[0].length,1440);assert(!Array.isArray(s.map));assert.equal(s.map[0][0],null);
  }finally{w.dispose();}
});
test('boundary-spanning art-centre source wall blocks a crossing but not the open approach',async()=>{
  const w=await make();try{await w.readyAt({x:480,y:508});assert(w.walkSegment({x:460,y:508},{x:488,y:508}));assert(!w.walkSegment({x:480,y:508},{x:480,y:500}));const owners=w.wallsFor([475,495,485,510],{walk:true}).flatMap(w=>w.run.sourceBuildingIds);assert(owners.includes('osm-way-557051202'));}finally{w.dispose();}
});
test('angled native wall uses the exact local slab, not its broad-phase axis-aligned box; shared owners survive replacement',async()=>{
  const sector=project.sectors.find(s=>s.id==='C03'),raw=JSON.parse(fs.readFileSync(new URL(sector.file,base)));
  raw.terrain=Array.from({length:240},()=>Array(240).fill('ground-grass'));raw.upper=[{},{}];raw.levels=3;raw.props=[];delete raw.foliage;raw.mountDora.buildingIds=['open','closed'];
  raw.wallRuns={version:1,segments:[{id:'diagonal',a:[10,10],b:[20,20],z:0,stories:1,material:'brick',sourceWallId:'one-global-wall',sourceBuildingIds:['open','closed']}]};
  const w=await make();try{let p=decodeTownSector(raw,sector,new Set(['open']),new Set(['open']));w.cache.set(sector.id,p);assert(w.pointClear({x:492,y:498}));assert(!w.pointClear({x:495,y:495}));assert(p.walls.records[0].walk);assert(p.walls.records[0].draw);
    p=decodeTownSector(raw,sector,new Set(['open','closed']),new Set(['open','closed']));w.cache.set(sector.id,p);assert(w.pointClear({x:495,y:495}));assert(!p.walls.records[0].draw);
  }finally{w.dispose();}
});
test('woodland trunks still stop sight and shots while walking slides off their sides',async()=>{
  const sector=project.sectors.find(s=>s.id==='C03'),raw=JSON.parse(fs.readFileSync(new URL(sector.file,base)));
  raw.terrain=Array.from({length:240},()=>Array(240).fill('ground-grass'));
  raw.upper=[{},{}];raw.levels=3;raw.props=[{x:20,y:20,z:0,kind:'tree-broadleaf'}];
  raw.foliage={'22,20,0':[100,false,'woodland-v1']};delete raw.wallRuns;
  const w=await make();w.startPoint={x:495,y:500};w.cache.set(sector.id,decodeTownSector(raw,sector));
  try{
    const s=Core.enableRealtime(createSoloGame({...DEFAULT_BUILD,primary:'rpg'},1947,'mount-dora',{tourWorld:w})),u=hero(s);
    const start={x:u.x,y:u.y,h:1.1},end={x:505,y:500,h:1.1,ground:true},trunk={x:500,y:500};
    assert(!w.pointClear(trunk));assert(w.pointClear({x:502,y:500}));
    assert(!lineClear(s,start,end));assert(!projectileSegmentClear(s,start,end));
    assert(lineClear(s,{...start,h:2.1},{...end,h:2.1}));
    assert(projectileSegmentClear(s,{...start,h:2.1},{...end,h:2.1}));
    const cornerA={x:499.5,y:500.875,h:1},cornerB={x:500.875,y:499.5,h:1};
    assert(lineClear(s,cornerA,cornerB));assert(projectileSegmentClear(s,cornerA,cornerB));
    const impact=confirmedImpact(s,u,end);
    assert(impact.box.trunk);assert(Math.abs(impact.point.x-499.78)<1e-8);
    const guard={...s.units.find(g=>g.team==='guard'),x:495,y:500,heading:0};
    const outline=guardSightOutline(s,guard,u,blockWindow(s,guard));
    const blocked=outline.find(p=>p.offset===0),clear=outline.find(p=>p.offset===9);
    assert(blocked.x>499.67&&blocked.x<499.78,'the sight outline stops at the same trunk');
    assert(clear.reach>20,'the open ray past its side keeps its range');
    assert(Core.attack(s,u,end));
    for(let i=0;i<50&&u.ammo.rpg>0;i++)tick(s,.05);
    assert.equal(u.ammo.rpg,0);assert(Math.abs(s.effect.sequence.find(shot=>shot.shooter===u.id).bx-499.78)<1e-8);

    Object.assign(u,{x:499,y:500});
    const before=u.travelled;
    for(let i=0;i<32;i++){
      assert(Core.travel(s,u,.065,0)>0,'continuous head-on input slides past the trunk');
      assert(freePoint(s,u,u.id),'each accepted step clears the solid trunk');
    }
    assert(u.x>500.3&&Math.abs(u.y-500)>.44);
    assert(u.travelled-before<=32*.065+1e-7);
  }finally{w.dispose();}
});
test('painted brush across a sector seam conceals low stances without blocking sight rays or shots',async()=>{
  const w=await make();
  w.startPoint={x:482,y:500};
  try{
    for(const id of ['B03','C03']){
      const sector=project.sectors.find(s=>s.id===id),raw=JSON.parse(fs.readFileSync(new URL(sector.file,base)));
      raw.terrain=Array.from({length:240},()=>Array(240).fill('ground-grass'));
      raw.props=[];raw.foliage={};delete raw.wallRuns;
      for(let x=478;x<=482;x++){
        const local=x-sector.origin.x;
        if(local>=0&&local<240)raw.foliage[local+',20,0']=[50,false,'woodland-v1'];
      }
      w.cache.set(id,decodeTownSector(raw,sector));
    }
    const s=Core.enableRealtime(createSoloGame(DEFAULT_BUILD,1947,'mount-dora',{tourWorld:w})),u=hero(s);
    const guard=s.units.find(g=>g.team==='guard');
    Object.assign(guard,{x:466,y:500,heading:0});
    s.units=[u,guard];Core.refresh(s);
    assert.equal(w.brushDepth(guard,u),2.25);
    assert(Core.canSee(s,guard,u));
    assert.equal(Core.sneakStatus(s),'spotted');
    const window=blockWindow(s,guard);
    const rays=guardSightOutline(s,guard,u,window);
    const ray=offset=>rays.find(p=>p.offset===offset);
    assert(Math.abs(ray(0).reach-26)<.01);
    assert(Math.abs(ray(-180).reach-1.5)<.01);
    assert(Math.abs(guardSightOutline(s,guard,{...u,sneaking:true},window).find(p=>p.offset===0).reach-18.2)<.01);
    const turned=guardSightOutline(s,{...guard,heading:90},u,window).find(p=>p.offset===0);
    assert(Math.abs(turned.y-(guard.y+26))<.01&&Math.abs(turned.x-guard.x)<.01);
    assert(Core.setStance(s,u,'kneeling')&&Core.canSee(s,guard,u));
    assert.equal(Core.sneakStatus(s),'spotted');
    assert(Core.setStance(s,u,'prone')&&!Core.canSee(s,guard,u));
    assert.equal(Core.sneakStatus(s),'brush');
    const clipped=guardSightOutline(s,guard,u,window).find(p=>p.offset===0);
    assert(clipped.reach<16&&clipped.reach>14);
    assert(Core.canSee(s,guard,{...u,x:clipped.x,y:clipped.y}));
    assert(!Core.canSee(s,guard,{...u,x:clipped.x+.15,y:clipped.y}));
    guard.x=460;
    assert(Core.setStance(s,u,'kneeling')&&!Core.canSee(s,guard,u));
    assert(lineClear(s,guard,u));
    assert(projectileSegmentClear(s,{...guard,h:1.1},{...u,h:.75}));
    assert(Core.canSee(s,{...guard,y:502},{...u,y:502}),'a wholly open sight line has no brush benefit');

    u.x=483;Core.refresh(s);
    assert(!Core.canSee(s,guard,u),'brush still conceals an animal just beyond the paint');
    assert.equal(Core.sneakStatus(s),'brush');
    u.y=502;guard.heading=180;Core.refresh(s);
    assert(guard.alert,'the guard still remembers the player');
    assert.equal(Core.sneakStatus(s),'clear','alert memory alone does not indicate a sighting');

    Object.assign(u,{x:482.68,y:500});guard.x=400;Core.refresh(s);
    assert.equal(Core.sneakStatus(s),'brush','a crouched footprint in brush is useful before contact');
    guard.x=479.8;guard.heading=0;Core.refresh(s);
    assert(Core.canSee(s,guard,u),'a guard can spot someone up close');
    assert.equal(Core.sneakStatus(s),'spotted','direct sight overrides brush cover');
  }finally{w.dispose();}
});
test('water blocks walking while the source-supported Palm Island bridge remains reachable',async()=>{
  const w=await make();try{await w.readyAt({x:529,y:1402});assert.equal(w.tile(529,1402),'bridge');assert(w.pointClear({x:529,y:1402}));const packet=[...w.cache.values()].find(p=>p.id==='C06');assert(packet);let water;for(let y=1;y<239&&!water;y++)for(let x=1;x<239;x++)if(packet.raw.terrain[y][x]==='water'&&packet.raw.terrain[y][x-1]==='water'&&packet.raw.terrain[y][x+1]==='water'){water={x:x+packet.sector.origin.x,y:y+packet.sector.origin.y};break;}assert(water);assert(!w.pointClear(water));assert(!w.pointClear({x:-.3,y:10}));assert(!w.pointClear({x:1439.3,y:10}));}finally{w.dispose();}
});
test('landmark shapes use the same one-time town transform and preserve holes/open space',async()=>{
  const art={ART_REVISION:'a'.repeat(64),PLACEMENTS:[{id:'post',collisionPolicy:'additional-solids',solids:[{kind:'circle',centre:[500,500],radius:.15}]},{id:'rail',collisionPolicy:'additional-solids',solids:[{kind:'segment',a:[502,498],b:[502,503],radius:.055}]}]};
  const w=await make({art});try{await w.readyAt({x:499.5,y:499.5});assert(!w.pointClear({x:499.5,y:499.5}));assert(w.pointClear({x:500.3,y:499.5}));assert(!w.pointClear({x:501.5,y:500}));}finally{w.dispose();}
  const polygon={kind:'polygon',polygons:[[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[1,3],[3,3],[3,1],[1,1]]]]};assert.equal(solidDistance(polygon,{x:.5,y:.5}),0);assert(solidDistance(polygon,{x:2,y:2})>.9);
});
test('long-distance source visits stay bounded and do not instantiate or preserve a full terrain matrix',async()=>{
  const w=await make();try{for(const point of [{x:459,y:500},{x:1100,y:250},{x:1100,y:1450},{x:300,y:1450},{x:459,y:500}]){await w.readyAt(point);assert(w.cache.size<=9);assert(w.inFlight.size<=2);assert(w.queue.length<=9);assert(blockWindow(w.descriptor(),point).blocks.length===9);}assert(w.stats.evicted>0);assert(w.stats.peakDecoded<=TOWN_LIMITS.decodedSectors);assert(w.stats.peakFetches<=2);}finally{w.dispose();}
});
test('failed source requests block movement and retry resumes loading without changing the actor position',async()=>{
  let fail=true;const w=await make({fetcher:async url=>url.pathname.endsWith('/B03.map.json')&&fail?new Response('offline',{status:503}):fetcher(url)});w.startPoint={x:459,y:500};
  try{await assert.rejects(w.readyAt(w.startPoint),/B03/);const s=createSoloGame(DEFAULT_BUILD,1947,'mount-dora',{tourWorld:w}),u=hero(s),before={x:u.x,y:u.y};assert.equal(Core.travel(s,u,.3,0),0);assert.deepEqual({x:u.x,y:u.y},before);fail=false;w.retry();await w.readyAt(before);assert(Core.travel(s,u,.3,0)>.29);assert(w.stats.peakDecoded<=9);}finally{w.dispose();}
});
test('the map-owned wall helper remains byte-identical to the reviewed immutable source',()=>{
  const file=new URL('../dist/mount-dora-source/wall-runs.js',import.meta.url),bytes=fs.readFileSync(file);assert.equal(bytes.length,8795);assert.equal(createHash('sha256').update(bytes).digest('hex'),'6d01eb4b49d6ba20ae71e4bb2cab095c80e63be5d14b6ff43f509a9cfc76633d');
});

test('injected and native fetch functions are called freely rather than bound to the world instance',async()=>{
  let calls=0;const w=await make({fetcher:async function(...args){assert.equal(this,undefined);calls++;return fetcher(...args);}});
  try{await w.readyAt({x:459,y:500});assert(calls>0);assert(w.pointClear({x:459,y:500}));}finally{w.dispose();}
});
