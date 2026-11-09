import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createSoloGame,DEFAULT_BUILD,Core,hero,distance,canSee,tick,encodeSave,decodeSave,navigationPath,lineClear,freePoint,walkSegment,standIns,approachPath,QUARRY_REACH} from '../dist/solo-game.js';

test('in a seeded census on every mission, no guard stalls while a firing node is reachable',{timeout:60000},()=>{
  // tools/guard-census.mjs, 40 approaches a mission whose 0.75 m spot is solid: the
  // old approach froze in about four of five. A sample, not a law; the full
  // censuses are in docs/guard-approach.md.
  for(const mission of ['night-ledger','road-checkpoint','short-measure']){
    const out=execFileSync(process.execPath,[fileURLToPath(new URL('../tools/guard-census.mjs',import.meta.url)),mission,'blocked','3','40'],{encoding:'utf8'});
    const row=/^this: fired (\d+), frozen \d+ \(stalled \d+, (\d+) of them with a firing node reachable/m.exec(out);
    assert.ok(row,out);
    assert.equal(+row[2],0,`${mission}: ${out}`);
    assert.ok(+row[1]>=25,`${mission}: only ${row[1]} of 40 guards engaged`);
  }
});

// One alert guard closing on an animal that stays put (cases come from the seeded
// approach censuses in docs/guard-approach.md); every other guard is down.
function field(mission,heroAt,guardAt,{doors=false,heading,lastKnown=heroAt}={}){
  const base=createSoloGame(DEFAULT_BUILD,1947,mission);
  if(doors)for(const o of base.interactables)if(o.kind==='door'){o.open=true;base.edges[o.edge]='door';}
  const s={...base},u=hero(s),g=s.units[1];   // a fresh object: the opened doors rebuild geometry
  for(const other of s.units.slice(2))other.hp=0;
  Object.assign(u,{...heroAt,ap:20,hp:10000,maxHp:10000});Object.assign(g,{...guardAt,alert:true,lastKnown:{...lastKnown},alertAge:0,...(heading===undefined?{}:{heading})});
  s.engaged=true;s.phase='player';Core.refresh(s,{forceFog:true});
  return s;
}
// Plays rounds and returns the rounds in which the guard opened fire (each shot
// leaves a new effect naming its shooter) and how often its step turned back.
function approach(mission,heroAt,guardAt,{rounds=3,...options}={}){
  const s=field(mission,heroAt,guardAt,options),u=hero(s),g=s.units[1];
  let firing=0,reversals=0,last=null,saw=false;
  for(let round=0;round<rounds;round++){
    s.phase='player';s.engaged=true;let fired=false,effect=s.effect;Core.endTurn(s);
    for(let frame=0;s.phase==='enemy'&&frame<2000;frame++){
      const at={x:g.x,y:g.y};tick(s,.05);saw||=canSee(s,g,u);
      if(g.x!==at.x||g.y!==at.y){const step={x:g.x-at.x,y:g.y-at.y};if(last&&step.x*last.x+step.y*last.y<-.5*Math.hypot(step.x,step.y)*Math.hypot(last.x,last.y))reversals++;last=step;}
      if(s.effect!==effect){effect=s.effect;fired||=s.effect?.sequence?.[0]?.shooter===g.id;}
    }
    if(fired)firing++;
  }
  return {s,g,u,firing,reversals,saw};
}
const engages=(mission,cases,rounds=2)=>{for(const [heroAt,guardAt,heading,doors] of cases){
  const {g,firing}=approach(mission,heroAt,guardAt,{heading,doors,rounds});
  assert.ok(firing>=1,`${mission} ${JSON.stringify(heroAt)}: the guard never fired, ending at ${g.x.toFixed(2)},${g.y.toFixed(2)}`);
  assert.equal(g.alert,true);
}};

test('a guard goes round a crate to the animal beside it instead of freezing',()=>{
  // Each 0.75 m spot lies inside the crate; the old approach froze with no route.
  engages('night-ledger',[[{x:22.788,y:15.948},{x:19.283,y:13.6},296.3,false],[{x:14.66,y:18.022},{x:13.509,y:22.114},197.7,true]]);
});

test('a guard reaches an animal against a wall, whichever side of it the 0.75 m spot falls',()=>{
  // Night Ledger: the spot is inside the wall. Short Measure's packing hall: the spot
  // lies on the guard's side of the north wall, where the old approach walked 4.4 m
  // to stand 0.75 m from the animal, blind, until its alert lapsed.
  engages('night-ledger',[[{x:35.576,y:.975},{x:36.733,y:5.187},97,true]]);
  engages('short-measure',[[{x:19.494,y:7.176},{x:20.56,y:12.21},274.2,true]]);
});

test('Road Checkpoint guards do the same across a large sector',()=>{
  engages('road-checkpoint',[[{x:98.43,y:125.953},{x:96.317,y:120.088},248.1,true],[{x:118.839,y:115.831},{x:116.825,y:115.188},278,true]]);
});

test('the plan holds when the 0.75 m spot sits on a clearance edge',()=>{
  // Beside the ration scale the spot flips between free and solid with each 18 cm
  // step. Two plans keyed on it (walk to the spot, or around to the far side) sent
  // the guard back and forth on the spot; one goal set around the animal does not.
  const {g,firing,reversals}=approach('short-measure',{x:6.863,y:20.154},{x:8.732,y:15.13},{heading:236.1,doors:true});
  assert.equal(reversals,0,`the guard turned back ${reversals} times`);
  assert.ok(firing>=1,`the guard never fired, ending at ${g.x.toFixed(2)},${g.y.toFixed(2)}`);
});

test('a goal keeps its view of the animal wherever the guard stops beside it',()=>{
  // Node (34,12) sees the animal past a wall end by a hair; a guard stopping 6 cm
  // off it, inside the 8 cm at which it counts as arrived, could not, and froze
  // there. Goals are judged with walls grown by those 8 cm.
  const {s,g,firing}=approach('short-measure',{x:32.146,y:11.501},{x:36.717,y:10.464},{heading:122.4,doors:true});
  const animal={x:32.146,y:11.501,stance:'standing'};
  assert.ok(lineClear(s,{x:34,y:12,stance:'standing'},animal)&&!lineClear(s,{x:34.06,y:11.99,stance:'standing'},animal),'the case still sits on the wall end it pins');
  assert.ok(firing>=1,`the guard never fired, ending at ${g.x.toFixed(2)},${g.y.toFixed(2)}`);
});

test('a guard whose animal was last seen in a doorway shut since closes on the door from its own side',()=>{
  // The last-seen point lies inside the shut warehouse door (wall line x = 7.5), where
  // nothing can see it. Whichever half of the doorway it fell in, each guard closes on
  // the clear point nearest it on its own side: west guards stay west, east guards east.
  for(const x of [7.4,7.6])for(const [guardAt,west] of [[{x:4.5,y:18},true],[{x:10.5,y:18},false]]){
    const lastKnown={x,y:18},{s,g}=approach('night-ledger',{x:33,y:5},guardAt,{lastKnown,heading:0,rounds:3});
    assert.equal(freePoint(s,lastKnown,null,{units:false}),false);
    const where=`last seen at x ${x}, guard from ${guardAt.x}: ended at ${g.x.toFixed(2)},${g.y.toFixed(2)}`;
    assert.ok(distance(g,guardAt)>1&&distance(g,{x:7.5,y:18})<QUARRY_REACH+.5,where);
    assert.equal(g.x<7.5,west,where);
  }
  // A guard already beside the door, closer than 0.75 m to the clear point, stays put. Its
  // own body must not push that point through to the far side: counting it set the
  // guard walking round the warehouse until a step uncovered its own side again.
  const {g}=approach('night-ledger',{x:33,y:5},{x:7.18,y:18},{lastKnown:{x:7.75,y:18},heading:0,rounds:2});
  assert.ok(distance(g,{x:7.18,y:18})<.05,`the guard at the door wandered to ${g.x.toFixed(2)},${g.y.toFixed(2)}`);
});

test('off the axis of a shut door, the guard takes the side it can walk to',()=>{
  // Road Checkpoint: heard shooting from the office's front doorway, which is then shut.
  // The nearest clear point in a straight line is inside the sealed office; each side
  // gets a stand-in and the search takes the one it reaches, outside. At 0.29 m inside
  // the door line the outside's clearance edge is 0.6 m off, past where a scan
  // stopping 0.5 m beyond the first clear ring looks; that guard stayed put.
  for(const y of [115.3,115.21]){
    const lastKnown={x:117,y},{s,g}=approach('road-checkpoint',{x:20,y:20},{x:88,y:120},{lastKnown,heading:0,rounds:3});
    assert.equal(freePoint(s,lastKnown,null,{units:false}),false);
    assert.ok(distance(g,{x:88,y:120})>3&&g.y>115.5,`last seen at y ${y}: the guard ended at ${g.x.toFixed(2)},${g.y.toFixed(2)}`);
  }
  // From (88,120) a straight walk to the outside stand-in opens. From these spots none
  // does, and the inside stand-in is the nearer in a straight line: the search picks the
  // side. Road Checkpoint (100.3,116.2) goes outside; Night Ledger (7.8,12.2), north of
  // the warehouse, goes to the outside of its door rather than round to the inside.
  for(const [mission,heroAt,guardAt,lastKnown,outside] of [['road-checkpoint',{x:20,y:20},{x:100.3,y:116.2},{x:117,y:115.3},q=>q.y>115.5],['night-ledger',{x:33,y:5},{x:7.8,y:12.2},{x:7.75,y:18},q=>q.x<7.5]]){
    const s=field(mission,heroAt,guardAt,{lastKnown}),g=s.units[1],[near,far]=[...standIns(s,lastKnown)].sort((a,b)=>distance(a,g)-distance(b,g)),path=approachPath(s,g,lastKnown);
    assert.ok(!outside(near)&&outside(far)&&path?.length>1,`${mission}: the nearer stand-in is inside and the plan is a search (${JSON.stringify(path)})`);
    const {g:end}=approach(mission,heroAt,guardAt,{lastKnown,heading:0,rounds:3});
    assert.ok(distance(end,guardAt)>3&&outside(end),`${mission}: from ${guardAt.x},${guardAt.y} the guard ended at ${end.x.toFixed(2)},${end.y.toFixed(2)}`);
  }
  // Night Ledger: a guard 2.5 m from the warehouse door outside takes the outside, not
  // the inside 10.5 m round by the south gap.
  const near=approach('night-ledger',{x:33,y:5},{x:7,y:20.5},{lastKnown:{x:7.75,y:18},heading:0,rounds:3});
  assert.ok(near.g.x<7.5&&distance(near.g,{x:7.5,y:18})<QUARRY_REACH+.5,`the guard ended at ${near.g.x.toFixed(2)},${near.g.y.toFixed(2)}`);
});

test('stand-ins depend on the scenery alone, so a unit standing on one changes nothing',()=>{
  // They are kept per geometry, so they must not depend on where units stand.
  const lastKnown={x:7.75,y:18},bare=createSoloGame(DEFAULT_BUILD,1947,'night-ledger'),expected=standIns(bare,lastKnown);
  assert.equal(expected.length,2,'one stand-in each side of the shut warehouse door');
  for(const spot of expected){const s=createSoloGame(DEFAULT_BUILD,1947,'night-ledger');Object.assign(s.units[1],spot);assert.deepEqual(standIns(s,lastKnown),expected);}
});

test('wherever the animal stood in a doorway shut since, each side of the door gets one stand-in at its edge',()=>{
  // Every door on every mission, a 5 cm grid over the open doorway (0.30 m either side
  // of the door line, 0.20 m along it): each point the shut door covers gets two
  // stand-ins, one each side, each the innermost clear point, within a 5 cm ring of
  // the clearance edge (0.31 m off the line). From 0.30 m inside, the far edge is
  // 0.61 m away: a scan stopping 0.5 m past the first clear ring misses it.
  let tested=0;
  for(const mission of ['night-ledger','road-checkpoint','short-measure'])for(const door of createSoloGame(DEFAULT_BUILD,1947,mission).interactables.filter(o=>o.kind==='door')){
    const make=open=>{const base=createSoloGame(DEFAULT_BUILD,1947,mission);if(open){base.interactables.find(o=>o.id===door.id).open=true;base.edges[door.edge]='door';}return {...base};};
    const shut=make(false),open=make(true),n=door.edge.startsWith('e:')?{x:1,y:0}:{x:0,y:1},across=q=>(q.x-door.x)*n.x+(q.y-door.y)*n.y;
    for(let a=-6;a<=6;a++)for(let l=-4;l<=4;l++){
      const p={x:door.x+(n.x*a+n.y*l)*.05,y:door.y+(n.y*a+n.x*l)*.05};
      if(!freePoint(open,p,null,{units:false})||freePoint(shut,p,null,{units:false}))continue;tested++;
      const stands=standIns(shut,p),where=`${door.id}, last seen ${(a*.05).toFixed(2)} m across: ${JSON.stringify(stands.map(q=>across(q).toFixed(2)))}`;
      assert.equal(stands.length,2,where);
      assert.deepEqual(stands.map(q=>Math.sign(across(q))).sort(),[-1,1],where);
      for(const q of stands)assert.ok(Math.abs(across(q))<.4,where);
    }
  }
  assert.ok(tested>=1000,`only ${tested} points`);
});

test('under an open leaf, the stand-ins sit on its two faces and none behind the wall',()=>{
  // The warehouse door swung open over the spot the animal stood on, beside its hinge.
  // A clear point behind the warehouse wall is near it in a straight line but could never
  // see it; guards outside walked there and stood blind beside the doorway. Now the
  // stand-ins are those that would see the spot but for the leaf, and the guards look in.
  for(const lastKnown of [{x:7.83,y:17.14},{x:7.83,y:17.3}]){
    const s=field('night-ledger',{x:33,y:5},{x:20,y:5},{doors:true}),stands=standIns(s,lastKnown);
    assert.equal(freePoint(s,lastKnown,null,{units:false}),false);
    assert.equal(stands.length,2,JSON.stringify(stands));
    assert.ok(stands.every(q=>q.x>7.58)&&stands.some(q=>q.y<17.36)&&stands.some(q=>q.y>17.52),`stand-ins ${JSON.stringify(stands)}`);
    for(const guardAt of [{x:6.5,y:15},{x:4,y:14},{x:5,y:20.5}]){
      const {s:play,g}=approach('night-ledger',{x:33,y:5},guardAt,{lastKnown,heading:0,doors:true,rounds:3});
      assert.ok(stands.some(q=>lineClear(play,{...g,stance:'standing'},{...q,stance:'standing'})),`from ${guardAt.x},${guardAt.y} the guard ended at ${g.x.toFixed(2)},${g.y.toFixed(2)}, seeing neither face of the leaf`);
    }
  }
});

test('stand-ins are kept per point and per geometry',()=>{
  // Two last-seen points in one grid cell keep their own stand-ins, and a door opening
  // over a point gives it new ones: shut, one each side of the door line (x 7.5); open,
  // one each face of the leaf (y 17.36-17.52), both inside the warehouse.
  const a={x:7.6,y:17.8},b={x:7.6,y:18.3},s=createSoloGame(DEFAULT_BUILD,1947,'night-ledger'),u=hero(s);
  standIns(s,a);assert.deepEqual(standIns(s,b),standIns(createSoloGame(DEFAULT_BUILD,1947,'night-ledger'),b));
  const p={x:7.8,y:17.68},shut=standIns(s,p);
  assert.ok(shut.some(q=>q.x<7.5)&&shut.some(q=>q.x>7.5),`door shut: ${JSON.stringify(shut)}`);
  Object.assign(u,{x:7,y:18});assert.ok(Core.performInteraction(s,'warehouse-door','open').ok);
  const open=standIns(s,p);
  assert.ok(open.length===2&&open.every(q=>q.x>7.58)&&open.some(q=>q.y<17.36)&&open.some(q=>q.y>17.52),`door open: ${JSON.stringify(open)}`);
});

test('the straight walk takes the nearest stand-in it can walk straight to',()=>{
  // Road Checkpoint, the front door shut over the last-seen point: from (105,117) the
  // stand-in inside the sealed office is 0.11 m nearer in a straight line, but only the
  // outside one has a straight walk; the guard takes it rather than a search that stops
  // at a node up to 2 m off.
  const short=(path,q)=>path?.length===1&&Math.abs(distance(path[0],q)-.75)<1e-9;
  const lastKnown={x:117,y:115.3},s=field('road-checkpoint',{x:20,y:20},{x:105,y:117},{lastKnown}),g=s.units[1],[inside,outside]=standIns(s,lastKnown);
  assert.ok(inside.y<115.5&&outside.y>115.5&&distance(g,inside)<distance(g,outside),'the inside stand-in is the nearer');
  assert.ok(short(approachPath(s,g,lastKnown),outside),JSON.stringify(approachPath(s,g,lastKnown)));
  // Night Ledger, the warehouse door's leaf open over the point: with straight walks to
  // both faces open (each checked alone as a last-seen point), a guard takes the
  // nearer, whether it comes first in the list or second.
  const leaf={x:8.6,y:17.7};
  for(const guardAt of [{x:9.5,y:16.5},{x:9.75,y:18}]){
    const s=field('night-ledger',{x:33,y:5},guardAt,{lastKnown:leaf,doors:true}),g=s.units[1],stands=standIns(s,leaf);
    const [near,far]=[...stands].sort((a,b)=>distance(a,g)-distance(b,g));
    assert.ok(stands.length===2&&distance(g,far)-distance(g,near)>.3&&stands.every(q=>short(approachPath(s,g,q),q)),`from ${guardAt.x},${guardAt.y}: ${JSON.stringify(stands)}`);
    assert.ok(short(approachPath(s,g,leaf),near),`from ${guardAt.x},${guardAt.y}: ${JSON.stringify(approachPath(s,g,leaf))}`);
  }
});

test('a guard that steps into a strip no grid node is a straight walk from walks on through it',()=>{
  // Short Measure: between the ration room's south wall and the sealed-load-arrival prop
  // runs a strip 13 cm wide for a body's centre, and from most of it no grid node is a
  // straight walk. A route smoothed along it led the guard in; its next plan found no
  // node to start from, its turn ended there, and it stood there until its alert
  // lapsed. It now walks first to the nearest point a node is a straight walk from.
  const base=createSoloGame(DEFAULT_BUILD,1947,'short-measure');
  for(const o of base.interactables)if(o.kind==='door'&&['ration-west','ration-east','packing-west','packing-east','dispatch-west'].includes(o.id)){o.open=true;base.edges[o.edge]='door';}
  const s={...base},u=hero(s),g=s.units[2],lastKnown={x:2.074,y:18.537};for(const other of s.units.slice(1))if(other!==g)other.hp=0;
  Object.assign(u,{x:33,y:24,ap:20,hp:10000,maxHp:10000});Object.assign(g,{x:8.367,y:22.905,heading:180,alert:true,lastKnown:{...lastKnown},alertAge:0});
  assert.ok(freePoint(s,g,g.id)&&!navigationPath(s,g,lastKnown.x,lastKnown.y),'the strip still has no grid node a straight walk away');
  const out=approachPath(s,g,lastKnown);
  assert.ok(out?.length&&walkSegment(s,g,out[0],g.id),`inside the strip the plan's first leg is a straight walk: ${JSON.stringify(out?.[0])}`);
  Object.assign(g,{x:9.806,y:22.865});s.engaged=true;s.phase='player';Core.refresh(s,{forceFog:true});
  const ends=[];for(let round=0;round<3;round++){s.phase='player';s.engaged=true;Core.endTurn(s);for(let frame=0;s.phase==='enemy'&&frame<2000;frame++)tick(s,.05);ends.push(`${g.x.toFixed(2)},${g.y.toFixed(2)}`);}
  assert.ok(distance(g,lastKnown)<.75+.08,`the guard ended its rounds at ${ends.join(' | ')}`);
});

test('a guard in such a strip leaves by the way that is shortest to walk',()=>{
  // The nearest way out of the strip can lead away from the animal. From (7.76,22.94)
  // the short walk to (13,23.2) leaves east; from (8.44,22.93) the short walk to
  // (4.5,23.6) leaves west. Taking the nearest way out planned 10.0 m and 8.0 m; the
  // search starts from a way out on every bearing, each at the cost of walking there,
  // and its plan is shorter than the straight line to the animal.
  const base=createSoloGame(DEFAULT_BUILD,1947,'short-measure');for(const o of base.interactables)if(o.kind==='door'){o.open=true;base.edges[o.edge]='door';}
  const s={...base},g=s.units[2];for(const other of s.units.slice(1))if(other!==g)other.hp=0;Object.assign(hero(s),{x:33,y:5});
  for(const [from,lastKnown,east] of [[{x:7.76,y:22.94},{x:13,y:23.2},true],[{x:8.44,y:22.93},{x:4.5,y:23.6},false]]){
    Object.assign(g,from);
    assert.ok(freePoint(s,g,g.id)&&!navigationPath(s,g,lastKnown.x,lastKnown.y),`${from.x},${from.y} lies in the strip`);
    const path=approachPath(s,g,lastKnown),walk=path.reduce((total,w,i)=>total+distance(w,i?path[i-1]:g),0);
    assert.ok((path[0].x>from.x)===east&&walk<distance(from,lastKnown),`from ${from.x},${from.y}: ${walk.toFixed(2)} m, first leg to ${path[0].x.toFixed(2)},${path[0].y.toFixed(2)}`);
  }
});

test('a guard boxed in by other units finds no way out through them',()=>{
  // Five guards stand round it 0.47 m off, closer than two bodies, so no grid node and no
  // way out is a straight walk away: it has no plan, where with them gone it has one.
  const s=createSoloGame(DEFAULT_BUILD,1947,'road-checkpoint'),g=s.units[1],ring=s.units.slice(2),centre={x:60.4,y:60.3},lastKnown={x:70,y:66};
  Object.assign(hero(s),{x:20,y:20});Object.assign(g,{...centre,alert:true,lastKnown:{...lastKnown}});
  ring.forEach((u,i)=>{const a=i/ring.length*Math.PI*2;Object.assign(u,{x:centre.x+Math.cos(a)*.47,y:centre.y+Math.sin(a)*.47});});
  assert.equal(ring.length,5);
  assert.equal(approachPath(s,g,lastKnown),null);
  for(const u of ring)u.hp=0;
  assert.ok(approachPath(s,g,lastKnown)?.length,'with the ring gone the guard has a plan');
});

test('a straight walk whose spot sees the animal only past a wall edge closer than 8 cm takes the search',()=>{
  // A guard stops anywhere within 8 cm of its spot, so the spot's view must clear every
  // wall by 8 cm. From these spots the line to the animal passes 3.5 cm (Night Ledger)
  // and 1.5 cm (Short Measure) from a wall edge; the guard goes to a node whose view holds.
  for(const [mission,doors,guardAt,lastKnown] of [['night-ledger',false,{x:18.544,y:18.473},{x:20.575,y:20.822}],['short-measure',true,{x:27.682,y:18.134},{x:24.438,y:13.18}]]){
    const s=field(mission,{x:2,y:2},guardAt,{lastKnown,doors}),g=s.units[1],d=distance(guardAt,lastKnown);
    const aim={x:lastKnown.x-(lastKnown.x-guardAt.x)/d*.75,y:lastKnown.y-(lastKnown.y-guardAt.y)/d*.75};
    assert.ok(freePoint(s,aim,g.id)&&walkSegment(s,g,aim,g.id)&&lineClear(s,{...aim,stance:'standing'},{...lastKnown,stance:'standing'}),`${mission}: a straight walk reaches a spot with a clear line`);
    const path=approachPath(s,g,lastKnown);
    assert.ok(path?.length&&distance(path[path.length-1],aim)>.08,`${mission}: the guard heads for ${JSON.stringify(path?.at(-1))}, not the spot`);
  }
});

test('the way out of such a strip is a straight walk, even where no node of the route beyond is one',()=>{
  // Crates on open Night Ledger ground leave a strip 6 cm wide for a body's centre, shut
  // at its west end and halfway between two rows of grid nodes. 1.1 m inside it neither
  // a node nor any later point of the route is a straight walk away, so the plan's first
  // leg runs along the strip to its mouth (x 26), the first point out from which a node is.
  const base=createSoloGame(DEFAULT_BUILD,1947,'night-ledger'),radius=.23;
  base.obstacles=[...(base.obstacles||[]),{x0:23,x1:26,y0:18.6,y1:19.5-.03-radius,height:1,kind:'crate'},{x0:23,x1:26,y0:19.5+.03+radius,y1:20.4,height:1,kind:'crate'},{x0:22.6,x1:23,y0:18.6,y1:20.4,height:1,kind:'crate'}];
  const s={...base},g=s.units[1],lastKnown={x:29,y:22};for(const other of s.units.slice(2))other.hp=0;Object.assign(hero(s),{x:33,y:5});
  Object.assign(g,{x:24.9,y:19.5,alert:true,lastKnown:{...lastKnown},alertAge:0});
  assert.ok(freePoint(s,g,g.id)&&!navigationPath(s,g,lastKnown.x,lastKnown.y),'no grid node is a straight walk from the guard');
  const path=approachPath(s,g,lastKnown);
  assert.ok(path?.length>1&&walkSegment(s,g,path[0],g.id)&&path[0].x>25.99&&path[0].x<26.1,`first legs ${JSON.stringify(path?.slice(0,2))}`);
});

test('a last-seen point inside a prop an old save predates still draws the guard to it',()=>{
  // A save from before the ration scale was solid may hold a last-seen point on its clue
  // spot, 0.78 m from clear ground; the stand-in scan reaches it there.
  const lastKnown={x:8,y:20},{s,g}=approach('short-measure',{x:33,y:5},{x:13.5,y:19.3},{lastKnown,heading:0,doors:true,rounds:3});
  assert.equal(freePoint(s,lastKnown,null,{units:false}),false);
  assert.ok(distance(g,{x:13.5,y:19.3})>2&&distance(g,lastKnown)<QUARRY_REACH+1,`the guard ended at ${g.x.toFixed(2)},${g.y.toFixed(2)}`);
});

test('the shared scenery table holds no unit: a unit beside a walk blocks it, and a doorway reopens once it leaves',()=>{
  const s=createSoloGame(DEFAULT_BUILD,1947,'night-ledger'),u=hero(s),g=s.units[1],cost=path=>path?path.reduce((total,p)=>total+p.cost,0):Infinity;
  // Two radii are 0.46 m: a unit 0.40 m beside a 1 m walk blocks it, one 0.60 m off does not.
  Object.assign(g,{x:10.5,y:10.4});assert.equal(walkSegment(s,{x:10,y:10},{x:11,y:10},u.id),false);
  Object.assign(g,{x:10.5,y:10.6});assert.equal(walkSegment(s,{x:10,y:10},{x:11,y:10},u.id),true);
  // Each first search on a fresh geometry runs with a unit in the way; a table that
  // stored that answer would keep the doorway shut after the unit leaves.
  Object.assign(g,{x:20,y:5});Object.assign(u,{x:7,y:18});assert.ok(Core.performInteraction(s,'warehouse-door','open').ok);
  Object.assign(u,{x:6,y:15});Object.assign(g,{x:7.5,y:18});const held=cost(navigationPath(s,u,9,18));
  Object.assign(g,{x:20,y:5});const left=cost(navigationPath(s,u,9,18));
  assert.ok(held>12&&left<12,`a unit in the doorway: ${held} AP; gone: ${left} AP`);
  Object.assign(u,{x:7,y:18});assert.ok(Core.performInteraction(s,'warehouse-door','close').ok&&Core.performInteraction(s,'warehouse-door','open').ok);
  Object.assign(u,{x:6,y:15});Object.assign(g,{x:8,y:18});const onNode=cost(navigationPath(s,u,9,18));
  Object.assign(g,{x:20,y:5});const gone=cost(navigationPath(s,u,9,18));
  assert.ok(onNode>12&&gone<12,`a unit on the east node: ${onNode} AP; gone: ${gone} AP`);
});

test('a straight walk still stops exactly 0.75 m short of where the animal was seen',()=>{
  // Open ground, the animal long gone: the guard walks straight to the 0.75 m spot on
  // its own line, as before, rather than to a grid node's line.
  const lastKnown={x:9.42,y:8.227},guardAt={x:5.668,y:6.159},d=distance(guardAt,lastKnown);
  const aim={x:lastKnown.x-(lastKnown.x-guardAt.x)/d*.75,y:lastKnown.y-(lastKnown.y-guardAt.y)/d*.75};
  const {g,saw}=approach('night-ledger',{x:5,y:24},guardAt,{lastKnown,heading:0,rounds:2});
  assert.equal(saw,false);
  assert.ok(distance(g,aim)<.08,`the guard stopped ${distance(g,aim).toFixed(3)} m from the 0.75 m spot`);
});

test('a routed approach still ends 0.75 m short of where the animal was seen',()=>{
  // No straight walk at first: the search takes the guard to a node within
  // QUARRY_REACH that sees the spot, and from there it walks straight to 0.75 m short.
  const lastKnown={x:23.324,y:23.319};
  const {g,saw}=approach('night-ledger',{x:5,y:24},{x:19.933,y:18.749},{lastKnown,heading:0,rounds:3});
  assert.equal(saw,false);
  assert.ok(distance(g,lastKnown)<=.75+.08,`the guard stopped ${distance(g,lastKnown).toFixed(2)} m away (reach ${QUARRY_REACH} m)`);
});

test('an animal shut behind closed doors costs one bounded search, not the whole sector',()=>{
  // The quarry's goals sit in a small pocket. After 256 nodes the search floods back
  // from them, finds the pocket sealed and stops; the full search read the unit
  // list 18,010 times (each freePoint and walkSegment reads it once).
  const s=createSoloGame(DEFAULT_BUILD,1947,'road-checkpoint'),u=hero(s),g=s.units[1];
  for(const other of s.units.slice(2))other.hp=0;
  Object.assign(u,{x:114.921,y:109.319,ap:20,hp:10000,maxHp:10000});Object.assign(g,{x:113.354,y:101.868,alert:true,lastKnown:{x:114.921,y:109.319},alertAge:0});
  s.engaged=true;s.phase='player';Core.refresh(s,{forceFog:true});
  const units=s.units;let reads=0;Object.defineProperty(s,'units',{get(){reads++;return units;}});
  Core.endTurn(s);reads=0;for(let frame=0;s.phase==='enemy'&&frame<2000;frame++)tick(s,.05);
  assert.equal(distance(g,{x:113.354,y:101.868}),0,'no route exists, so the guard stays put');
  assert.ok(reads<3000,`the guard's turn read the unit list ${reads} times`);
});

test('a door opening between searches reopens the route at once',()=>{
  // Searches share one scenery table per geometry. Opening the warehouse door
  // rebuilds the geometry, so the very next search must route through the doorway
  // (no straight walk exists either way: the line runs into the wall beside it).
  const s=createSoloGame(DEFAULT_BUILD,1947,'night-ledger'),u=hero(s),cost=path=>path.reduce((total,p)=>total+p.cost,0);
  Object.assign(u,{x:6,y:15});const around=navigationPath(s,u,9,18);
  assert.ok(cost(around)>30,`with the door shut the route goes round (${cost(around)} AP)`);
  Object.assign(u,{x:7,y:18});assert.ok(Core.performInteraction(s,'warehouse-door','open').ok);
  Object.assign(u,{x:6,y:15});const through=navigationPath(s,u,9,18);
  assert.ok(through.length>1&&cost(through)<12,`with the door open the route costs ${cost(through)} AP`);
});

test('a save taken mid-approach resumes on exactly the same route',()=>{
  // Nothing about the approach is held between ticks: saved and reloaded at any
  // tick of its turn, a guard walks on exactly as the one never saved.
  const cases=[['short-measure',{x:19.494,y:7.176},{x:20.56,y:12.21},{heading:274.2,doors:true}],['night-ledger',{x:22.788,y:15.948},{x:19.283,y:13.6},{heading:296.3}],['night-ledger',{x:5,y:24},{x:19.933,y:18.749},{heading:0,lastKnown:{x:23.324,y:23.319}}],['night-ledger',{x:33,y:5},{x:10.5,y:18},{heading:0,lastKnown:{x:7.4,y:18}}]];
  const walk=(s,ticks)=>{const g=s.units[1],trail=[];for(let i=0;i<ticks;i++){if(s.phase!=='enemy'){s.phase='player';s.engaged=true;Core.endTurn(s);}tick(s,.05);trail.push([g.x,g.y]);}return trail;};
  for(const [mission,heroAt,guardAt,options] of cases)for(const at of [10,16,24]){
    const s=field(mission,heroAt,guardAt,options);Core.endTurn(s);walk(s,at);
    assert.ok(distance(s.units[1],guardAt)>.1,`${mission} tick ${at}: the save is taken mid-walk`);
    const resumed=decodeSave(encodeSave(s));
    assert.deepEqual(walk(resumed,60),walk(s,60),`${mission}: resumed at tick ${at}`);
  }
});
