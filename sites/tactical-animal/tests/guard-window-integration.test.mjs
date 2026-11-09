import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoloGame,DEFAULT_BUILD,Core,hero,lineClear,geometry,freePoint,walkSegment,navigationPath,approachPath,standIns,encodeSave,decodeSave,tick} from '../dist/solo-game.js';
import {windowReviewSource} from '../dist/window-review-map.js';

function field(definitionId='window.full.clear.3m',{player={x:20,y:21},guard={x:20,y:25},props=[]}={}){
  const source=windowReviewSource();source.edges={};source.props=props;source.farmyardWindows.instances=[{id:'approach-window',definitionId,x:20,y:21.5,rotation:0}];source.starts[0]={...player,z:0};source.guards=[{...guard,z:0,species:'pig-foreman',weapon:'pistol',heading:270}];
  const s=createSoloGame(DEFAULT_BUILD,1947,'window-yard',{authoredMap:source}),u=hero(s),g=s.units[1];Object.assign(u,{hp:10000,maxHp:10000});Object.assign(g,{alert:true,lastKnown:{...player},alertAge:0});g.ammo.pistol=0;g.ammoPouch.pistol=0;s.phase='player';s.engaged=true;return {s,u,g};
}

test('a guard closes to the nearest visible node through a framed aperture instead of detouring around its head and sill',()=>{
  const {s,u,g}=field();assert.equal(lineClear(s,g,u),true);assert.equal(freePoint(s,{x:20,y:21.5},g.id),false);
  const path=approachPath(s,g,u);assert.ok(path?.length);assert.deepEqual([path.at(-1).x,path.at(-1).y],[20,23]);assert.ok(walkSegment(s,g,path[0],g.id));
  Core.endTurn(s);for(let frame=0;frame<30;frame++)tick(s,.05);assert.equal(g.x,20);assert.ok(g.y<24.5&&g.y>=23-.08,`actual enemy step ended at ${g.x},${g.y}`);
});

test('window lower walls and full-height mullions still obstruct their actual sight heights',()=>{
  const waist=field('window.waist.clear.3m');assert.equal(lineClear(waist.s,waist.g,waist.u),true);assert.equal(lineClear(waist.s,{...waist.g,stance:'prone'},{...waist.u,stance:'prone'}),false);
  const grid=field('window.full.vertical-2.3m');assert.equal(lineClear(grid.s,grid.g,grid.u),false);const path=approachPath(grid.s,grid.g,grid.u);assert.ok(path?.length);assert.equal(lineClear(grid.s,path.at(-1),grid.u),true);assert.notDeepEqual([path.at(-1).x,path.at(-1).y],[20,23]);
});

test('the 8 cm stopping margin still rejects a line that only barely misses a window mullion',()=>{
  const {s,u,g}=field('window.full.vertical-2.3m');u.x=20.1;const remembered={x:u.x,y:u.y};assert.equal(lineClear(s,{x:20,y:23},remembered),true);
  const path=approachPath(s,g,remembered);assert.ok(path?.length);assert.notDeepEqual([path.at(-1).x,path.at(-1).y],[20,23]);assert.equal(lineClear(s,path.at(-1),remembered),true);
});

test('a remembered point covered by cargo keeps the stand-in visible through the adjacent framed pane',()=>{
  const {s}=field('window.full.vertical-2.3m',{player:{x:20,y:19},props:[{kind:'crate-wood',x:20,y:21,z:0}]}),remembered={x:20,y:21},spots=standIns(s,remembered);
  assert.equal(freePoint(s,remembered,null,{units:false}),false);assert.equal(spots.length,2);const behind=spots.find(p=>p.x<20&&p.y>21.8);assert.ok(behind,'the pane-side stand-in must survive the head/sill sight test');
  assert.ok(spots.every(p=>freePoint(s,p,null,{units:false})&&lineClear(s,p,remembered)));assert.equal(lineClear(s,spots[0],behind),false,'the actual mullion still separates these standing views');
});

test('breaking glass refreshes geometry-keyed plans and stand-ins while the opening still blocks walking',()=>{
  const {s,u,g}=field(),remembered={x:u.x,y:u.y},inside={x:20,y:21.5},beforeGeometry=geometry(s),beforePlan=approachPath(s,g,remembered),beforeSpots=standIns(s,inside);assert.strictEqual(standIns(s,inside),beforeSpots);
  s.seed=1;assert.ok(Core.attack(s,u,{...inside,h:1.1,ground:true}));assert.equal(s.windowSequence,1);const afterGeometry=geometry(s);assert.notStrictEqual(afterGeometry,beforeGeometry);assert.ok(!afterGeometry.some(box=>box.windowId==='approach-window'&&box.kind==='glass'));
  const afterSpots=standIns(s,inside);assert.notStrictEqual(afterSpots,beforeSpots);assert.deepEqual(afterSpots,beforeSpots);assert.deepEqual(approachPath(s,g,remembered),beforePlan);assert.equal(lineClear(s,g,u),true);assert.equal(freePoint(s,inside,g.id),false);assert.equal(walkSegment(s,g,u,g.id),false);
  // Live bodies must not become part of the shared scenery table.
  Object.assign(u,{x:20,y:23});const blocked=approachPath(s,g,remembered);assert.strictEqual(geometry(s),afterGeometry);assert.ok(blocked?.length);assert.notDeepEqual([blocked.at(-1).x,blocked.at(-1).y],[20,23]);
});

test('a released door invalidates shared walk and stand-in tables with placed windows present',()=>{
  const base=createSoloGame(DEFAULT_BUILD,1947,'night-ledger'),s=structuredClone({...base,windows:[{id:'nearby-window',definitionId:'window.full.clear.3m',x:20,y:21.5,rotation:0}]}),u=hero(s),at={x:7.75,y:18},cost=path=>path.reduce((sum,p)=>sum+p.cost,0);for(const g of s.units.slice(1))g.hp=0;
  Object.assign(u,{x:6,y:15});const beforeGeometry=geometry(s),beforeSpots=standIns(s,at),beforePlan=navigationPath(s,u,9,18);assert.equal(beforeSpots.length,2);assert.equal(freePoint(s,at,u.id),false);
  Object.assign(u,{x:7,y:18});assert.ok(Core.performInteraction(s,'warehouse-door','open').ok);assert.notStrictEqual(geometry(s),beforeGeometry);assert.equal(freePoint(s,at,u.id),true);assert.deepEqual(standIns(s,at),[at]);
  Object.assign(u,{x:6,y:15});const afterPlan=navigationPath(s,u,9,18);assert.ok(cost(beforePlan)>30&&cost(afterPlan)<12);
});

test('a mid-approach save beside a broken framed pane resumes the identical guard movement and RNG',()=>{
  const {s,u,g}=field();s.seed=1;assert.ok(Core.attack(s,u,{x:20,y:21.5,h:1.1,ground:true}));const remembered={x:u.x,y:u.y};approachPath(s,g,remembered);Core.endTurn(s);for(let i=0;i<12;i++)tick(s,.05);assert.ok(g.y<25&&g.y>23);
  const resumed=decodeSave(encodeSave(s));assert.equal(resumed.windowSequence,1);assert.deepEqual({...resumed.windowBreaks},{...s.windowBreaks});assert.deepEqual(approachPath(resumed,resumed.units[1],remembered),approachPath(s,g,remembered));
  for(let i=0;i<100;i++){tick(s,.05);tick(resumed,.05);assert.deepEqual([resumed.units[1].x,resumed.units[1].y,resumed.units[1].ap,resumed.seed,resumed.phase],[g.x,g.y,g.ap,s.seed,s.phase]);}
});
