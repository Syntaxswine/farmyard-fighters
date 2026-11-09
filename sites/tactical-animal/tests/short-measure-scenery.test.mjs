import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {createSoloGame,DEFAULT_BUILD,Core,hero,distance,geometry,freePoint,walkSegment,lineClear,navigationPath,previewGrenade,encodeSave,decodeSave,tick,getMission,approachPath} from '../dist/solo-game.js';
import {missionScenery,missionArtBindings,clueAnchorHeight,SCENERY_DIGEST} from '../dist/mission-scenery.js';
import {SHORT_MEASURE_SOLIDS,SOLIDS_VERSION,SOLIDS_DIGEST} from '../dist/mission-art/short-measure/solids.js';
import {solidPartBoxes} from '../dist/mission-art/short-measure/solid-parts.js';
import {PLACEMENTS,ART_VERSION,bindingFor} from '../dist/mission-art/short-measure/manifest.js';
import {createShortMeasureKit,createShortMeasureArt} from '../dist/mission-art/short-measure/kit.js';
import {createMissionArt} from '../dist/mission-art-view.js';
import {InteractionScenery} from '../dist/interaction-view.js';
import {FieldView} from '../dist/field-view.js';
import {OriginalEnvironment} from '../dist/original-art.js';
import {createHash} from 'node:crypto';
import {blockWindow} from '../dist/world-grid.js';

const GRENADES={...DEFAULT_BUILD,utility:'grenade'};
const mill=()=>createSoloGame(GRENADES,1947,'short-measure');

test('the registered solid table is exactly what the kit builds today',()=>{
  const kit=createShortMeasureKit();
  try{
    const rebuilt=PLACEMENTS.filter(p=>p.owner).map(p=>{const b=bindingFor(p);return {id:p.id,owner:b.owner,footprint:b.footprint,height:b.height,shapeKey:b.occlusion.shapeKey,parts:solidPartBoxes(kit.solidParts(kit.place(p.id,{binding:b})))};});
    assert.deepEqual(rebuilt,SHORT_MEASURE_SOLIDS,'run node sites/tactical-animal/tools/short-measure-art.mjs');
    assert.equal(SOLIDS_VERSION,ART_VERSION);
    assert.equal(SOLIDS_DIGEST,createHash('sha256').update(JSON.stringify(rebuilt)).digest('hex').slice(0,16));
  }finally{kit.dispose();}
});

test('part boxes map three.js axes to world axes and round outward to the millimetre',()=>{
  const geometry=new T.BoxGeometry(1,1,1),mesh=new T.Mesh(geometry),boxes=()=>{mesh.updateMatrixWorld(true);return solidPartBoxes([{geometry,matrixWorld:mesh.matrixWorld}]);};
  mesh.position.set(10,.25,20);mesh.scale.set(2,.5,1);
  assert.deepEqual(boxes(),[[9,11,19.5,20.5,0,.5]]);   // three z is world y (south); three y is height
  mesh.rotation.y=Math.PI/2;
  assert.deepEqual(boxes(),[[9.5,10.5,19,21,0,.5]]);   // a quarter turn swaps width and depth exactly
  mesh.rotation.y=0;mesh.position.x=10.0004;
  assert.deepEqual(boxes(),[[9,11.001,19.5,20.5,0,.5]]); // 0.4 mm off the grid grows the box, never shrinks it
  geometry.dispose();
});

test('Short Measure registers each new prop once on the ground and every owned placement by its parts',()=>{
  const s=mill(),boxes=geometry(s),props=boxes.filter(b=>b.kind==='prop'),parts=boxes.filter(b=>b.kind==='part');
  assert.deepEqual(props.map(b=>b.placementId).sort(),['freight-scale','sealed-load-arrival','shipping-manifest','worker-scale']);
  assert.equal(parts.length,SHORT_MEASURE_SOLIDS.reduce((n,solid)=>n+solid.parts.length,0));
  const scale=props.find(b=>b.placementId==='worker-scale');
  assert.deepEqual([scale.x0,scale.y0,scale.x1,scale.y1,scale.height],[7.15,19.45,8.85,20.55,1.72]);
  // The sealed load keeps its four crate cells as its reservation and adds only parts.
  assert.equal(boxes.filter(b=>b.kind==='crate'&&b.interactionId==='sealed-load').length,4);
  assert.ok(boxes.filter(b=>b.placementId==='sealed-load').every(b=>b.kind==='part'));
  // A prop that embodies a clue or the objective may be reached into.
  for(const id of ['worker-scale','sealed-load','shipping-manifest'])assert.ok(boxes.filter(b=>b.placementId===id).every(b=>b.interactionId===id),id);
  assert.ok(boxes.filter(b=>['freight-scale','sealed-load-arrival'].includes(b.placementId)).every(b=>!b.interactionId));
  assert.deepEqual(props.filter(b=>b.cover).map(b=>b.placementId),['sealed-load-arrival']);
  for(const id of ['night-ledger','road-checkpoint'])assert.equal(geometry(createSoloGame(DEFAULT_BUILD,1947,id)).filter(b=>b.kind==='prop'||b.kind==='part').length,0,id);
});

test('the kit accepts every binding the simulation reports; without the crates neither side keeps the sealed load',()=>{
  const mission=getMission('short-measure'),s=mill();
  const art=createShortMeasureArt({missionId:mission.id,bindings:missionArtBindings(mission,s.map)});
  try{assert.deepEqual(art.skipped,[]);}finally{art.dispose();}
  const map=s.map.map(row=>row.slice());for(const [x,y] of [[27,19],[28,19],[27,20],[28,20]])map[y][x]='floor';
  assert.equal(missionArtBindings(mission,map)['sealed-load'],undefined);
  assert.equal(missionScenery(mission,map).filter(b=>b.placementId==='sealed-load').length,0);
  const bare=createShortMeasureArt({missionId:mission.id,bindings:missionArtBindings(mission,map)});
  try{assert.deepEqual(bare.skipped,['sealed-load']);}finally{bare.dispose();}
});

// Every geometry ruling, run against one open strip of Night Ledger. A shooter
// at (2,3) faces a standing guard at (8,3); the box under test sits halfway.
// Columns stand from the ground (z0 = 0); parts fill only [z0, height].
const A={x:2,y:3},B={x:8,y:3};
function strip(obstacles,{stance='standing'}={}){
  const fresh=createSoloGame(GRENADES,1947,'night-ledger'),s={...fresh,obstacles},u=hero(s),g=s.units[1];
  Object.assign(u,{...A,stance,ap:20});Object.assign(g,{...B,stance,weapon:'rifle',hp:100});
  s.engaged=true;s.phase='player';s.seed=0;Core.refresh(s,{forceFog:true});
  return {s,u,g};
}
const mid=(z0,z1,kind='part',extra={})=>({x0:4.88,x1:5.12,y0:2,y1:4,height:z1,kind,...(kind==='part'?{z0}:{}),...extra});
// Height of each consumer's line where it crosses the box (t = .5).
const LINE={
  proneSight:.3,                                   // prone eye to prone eye
  bullets:(1.1+1.75*.62)/2,                        // standing eye to standing torso
  grenade:1.1*.5+.08*.5+Math.min(2.5,6*.35),       // grenadeTrajectory at its midpoint
  flame:null,                                      // three rays: 1.1, 1.425 and 0.8 m here
};
const variants=consumer=>{
  if(consumer==='flame')return {through:[.7,1.5],above:[1.6,2.2],below:[0,.6]};
  const h=LINE[consumer];return {through:[h-.1,h+.1],above:[h+.2,h+.6],below:[0,Math.max(.01,h-.2)]};
};
const blocks={
  walking:box=>!freePoint(strip([box]).s,{x:5,y:3},null,{units:false}),
  standingSight:box=>{const {s,u,g}=strip([box]);return !lineClear(s,u,g);},
  proneSight:box=>{const {s,u,g}=strip([box],{stance:'prone'});return !lineClear(s,u,g);},
  bullets:box=>{
    const {s,u,g}=strip([box]),p=Core.previewAttack(s,u,g);if(!p.ok)return true;
    assert.ok(p.chance>30,'seed 0 must roll a hit');Core.attack(s,u,g,false,false,'torso',false,'hip');return g.hp===100;
  },
  grenade:box=>{const {s,u,g}=strip([box]);return previewGrenade(s,u,g).reason==='Throw path is blocked';},
  flame:box=>{const {s,u,g}=strip([box]);return !Core.previewFlame(s,u,Core.headingTo(u,g)).contacts.some(c=>c.id===g.id);},
};
test('each geometry kind answers only its own questions (the rulings table)',()=>{
  const prop=mid(0,3,'prop'),crate=mid(0,.92,'crate'),wall=mid(0,2,'wall');
  const table={};
  for(const [consumer,probe] of Object.entries(blocks)){
    const v=variants(consumer==='walking'||consumer==='standingSight'?'bullets':consumer);
    table[consumer]={prop:probe(prop),...Object.fromEntries(Object.entries(v).map(([name,[z0,z1]])=>[name,probe(mid(z0,z1))])),crate:probe(crate)};
    if(['walking','standingSight','proneSight','bullets','flame'].includes(consumer))table[consumer].wall=probe(wall);
  }
  assert.deepEqual(table,{
    walking:      {prop:true, through:false,above:false,below:false,crate:true, wall:true},
    standingSight:{prop:false,through:false,above:false,below:false,crate:false,wall:true},
    proneSight:   {prop:false,through:true, above:false,below:false,crate:true, wall:true},
    bullets:      {prop:false,through:true, above:false,below:false,crate:false,wall:true},
    grenade:      {prop:false,through:true, above:false,below:false,crate:false},
    flame:        {prop:false,through:true, above:false,below:false,crate:false,wall:true},
  });
});

test('cover and grenade landings follow the ground, not the parts',()=>{
  const near=(kind,extra={})=>({x0:7.2,x1:7.6,y0:2.5,y1:3.5,height:1,kind,...(kind==='part'?{z0:.4}:{}),...extra});
  const cover=box=>{const {s,u,g}=strip([box]);return Core.previewAttack(s,u,g).cover;};
  assert.deepEqual([cover(near('prop',{cover:true})),cover(near('prop')),cover(near('part')),cover(near('crate'))],[20,0,0,20]);
  const at=(kind,extra={})=>({x0:6.8,x1:7.2,y0:3.6,y1:4,height:1,kind,...(kind==='part'?{z0:.6}:{}),...extra});
  const landing=box=>{const {s,u}=strip([box]);return previewGrenade(s,u,{x:7,y:3.8}).reason;};
  assert.deepEqual([landing(at('prop')),landing(at('part')),landing(at('crate'))],['Landing point is inside an obstacle','','Landing point is inside an obstacle']);
});

// Real kit geometry: the dispatch desk's top spans z .86-.98 over legs and low
// end rails. Shooter and target stand either side of it along y = 6.1.
function office(shooter,target){
  const s=mill(),u=hero(s),g=s.units[1];
  Object.assign(u,{x:29.4,y:6.1,stance:shooter,ap:20});Object.assign(g,{x:34.6,y:6.1,stance:target,weapon:'rifle',hp:100});
  s.engaged=true;s.phase='player';s.seed=0;Core.refresh(s,{forceFog:true});
  return {s,u,g};
}
test('the desk keeps its open air: a kneeling shot passes under the top, a standing shot stops on it',()=>{
  for(const [shooter,hit] of [['kneeling',true],['standing',false]]){
    const {s,u,g}=office(shooter,'kneeling'),p=Core.previewAttack(s,u,g);
    assert.ok(p.ok,p.reason);assert.ok(p.chance>30);
    assert.ok(Core.attack(s,u,g,false,false,'torso',false,'hip'));
    assert.equal(g.hp<100,hit,`${shooter} shooter`);
  }
});

test('prone animals see beneath the desk between its legs, but not through the ration scale',()=>{
  const s=mill(),[a,b]=[{x:32,y:4.6,stance:'prone'},{x:32,y:7.6,stance:'prone'}];
  assert.equal(lineClear(s,a,b),true);                                    // under the top, between the legs
  assert.equal(lineClear(s,{...a,stance:'standing'},{...b,stance:'standing'}),true);
  const c={x:6.4,y:19.65,stance:'prone'},d={x:9.6,y:19.65,stance:'prone'};
  assert.equal(lineClear(s,c,d),false);                                   // the scale's upright at prone eye height
  assert.equal(lineClear(s,{...c,stance:'standing'},{...d,stance:'standing'}),true);
});

test('the ration scale is solid around its clue, which stays inspectable from either side',()=>{
  const s=mill(),u=hero(s);
  assert.equal(freePoint(s,{x:8,y:20},null,{units:false}),false);
  assert.equal(walkSegment(s,{x:6.3,y:20},{x:10.5,y:20}),false);
  Object.assign(u,{x:6.3,y:20});const path=navigationPath(s,u,10.5,20);
  assert.ok(path?.length>1);let from={x:u.x,y:u.y};for(const p of path){assert.ok(walkSegment(s,from,p,u.id));from=p;}
  for(const [x,y] of [[8,21],[8,19.1]]){Object.assign(u,{x,y});const p=Core.previewInteraction(s,'worker-scale','inspect');assert.ok(p.ok,`${x},${y}: ${p.reason}`);}
});

// A guard aims 0.75 m short of its quarry. Beside a prop that spot is solid ground.
function standoff(heroAt,guardAt,{doors=false,heading,rounds=3,watch=null,dt=.05}={}){
  const base=mill();
  if(doors)for(const o of base.interactables)if(o.kind==='door'){o.open=true;base.edges[o.edge]='door';}
  const s={...base},u=hero(s),g=s.units[1];   // a fresh object: the opened doors rebuild geometry
  for(const other of s.units.slice(2))other.hp=0;
  Object.assign(u,{...heroAt,ap:20,hp:10000,maxHp:10000});Object.assign(g,{...guardAt,alert:true,lastKnown:{...heroAt},alertAge:0,...(heading===undefined?{}:{heading})});
  s.engaged=true;s.phase='player';Core.refresh(s,{forceFog:true});
  // Count the rounds in which the guard opens fire (each shot leaves a new
  // effect naming its shooter); a frozen guard never does.
  let firing=0;
  for(let round=0;round<rounds;round++){
    // Each round is a fight round: without this a lapsed contact drops to free
    // exploration, endTurn refuses, and later rounds silently never run.
    s.phase='player';s.engaged=true;
    let fired=false,last=s.effect;Core.endTurn(s);
    for(let frame=0;s.phase==='enemy'&&frame<2000;frame++){watch?.(s,g);tick(s,dt);if(s.effect!==last){last=s.effect;fired||=s.effect?.sequence?.[0]?.shooter===g.id;}}
    if(fired)firing++;
  }
  return {s,g,firing,moved:distance(g,guardAt)};
}
test('a guard closing on an animal beside a prop finds the clear side instead of freezing',()=>{
  // Inspecting the scale from (8,21) with a guard north of it; hiding behind the desk.
  for(const [heroAt,guardAt] of [[{x:8,y:21},{x:7.6,y:18.2}],[{x:32,y:5.3},{x:32,y:10.4}]]){
    const {g,firing}=standoff(heroAt,guardAt);
    assert.equal(firing,3,`guard fired in ${firing} of 3 rounds, ending at ${g.x.toFixed(2)},${g.y.toFixed(2)}`);
    assert.equal(g.alert,true);
  }
  // Review round 2's repros: the nearest free spot sat in a strip no route can end in
  // (beside the arrival bay), or boxed in by the open west leaf and the scale.
  for(const [heroAt,guardAt] of [[{x:9.11,y:23.68},{x:6.78,y:21.83}],[{x:6.5,y:20.01},{x:13.5,y:19.3}]]){
    const {g,firing}=standoff(heroAt,guardAt,{doors:true});
    assert.ok(firing>=1,`guard never fired; it ended at ${g.x.toFixed(2)},${g.y.toFixed(2)}`);assert.equal(g.alert,true);
  }
});

test('review-round census cases still engage, one only through the 8 cm waypoint rule',()=>{
  // Each froze (no shot, alert lapsed within four rounds) in review round 2's
  // 1,000-approach census. The first three picked spots no route could end on; the
  // approach search now targets grid nodes, where every route ends. The fourth
  // route opens 4 cm from the guard and still needs enemyStep to walk on past it.
  // Exact census values: these cases sit near decision edges, so rounding moves them.
  const cases=[
    ['route ends: a free spot no route can end on',{x:6.483179605067708,y:20.18899905295111},{x:13.743990889711291,y:18.425564061108183},53.496729796752334],
    ['route ends',{x:6.8748554619634525,y:23.375523177045398},{x:9.85492917953809,y:21.460194110655912},299.40732984803617],
    ['route ends',{x:6.809355099187233,y:23.353898395388388},{x:10.804398705091472,y:21.069675135676313},285.83095273934305],
    ['reached waypoint: the route opens 4 cm from the guard',{x:7.919327088585123,y:18.790288305529394},{x:7.180232108991293,y:22.87409519878036},262.29286341927946],
  ];
  for(const [rule,heroAt,guardAt,heading] of cases){
    // The precondition the fourth case pins: some plan's first waypoint lies inside
    // the 8 cm at which the guard counts as arrived, with more route after it.
    // 40FPS retains the census's spatial sampling at the doubled base pace.
    let opens=false;const watch=(s,g)=>{if(s.units[s.enemyIndex]!==g||!g.alert)return;const route=approachPath(s,g,g.lastKnown);opens||=route?.length>1&&distance(g,route[0])<.08;};
    const {g,firing}=standoff(heroAt,guardAt,{doors:true,heading,rounds:4,watch,dt:.025});
    assert.ok(firing>0||g.alert,`${rule}: guard froze at ${g.x.toFixed(2)},${g.y.toFixed(2)}`);
    if(rule.startsWith('reached waypoint'))assert.ok(opens,'the case no longer opens a route inside 8 cm of the guard');
  }
});

test('in a seeded sample beside every prop, no guard freezes while a standing spot near its aim is reachable',()=>{
  // Seeded sample of review round 2's approach census: the animal 0.24-0.74 m from
  // a prop face, the guard 2-9 m off at any bearing and heading, doors open 70%.
  // This pins the sample, not a law; the wider censuses are in docs/guard-approach.md.
  const random=(seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;})(2026);
  const probe=mill(),props=geometry(probe).filter(box=>box.kind==='prop');let cases=0;
  for(const p of props)for(let tries=0,taken=0;tries<400&&taken<10;tries++){
    const side=Math.floor(random()*4),gap=.24+random()*.5,along=random(),angle=random()*Math.PI*2,radius=2+random()*7,heading=random()*360,doors=random()<.7;
    const heroAt=[{x:p.x0+(p.x1-p.x0)*along,y:p.y0-gap},{x:p.x0+(p.x1-p.x0)*along,y:p.y1+gap},{x:p.x0-gap,y:p.y0+(p.y1-p.y0)*along},{x:p.x1+gap,y:p.y0+(p.y1-p.y0)*along}][side];
    const guardAt={x:heroAt.x+Math.cos(angle)*radius,y:heroAt.y+Math.sin(angle)*radius};
    if(!freePoint(probe,heroAt,null,{units:false})||!freePoint(probe,guardAt,null,{units:false}))continue;
    const aim={x:heroAt.x-(heroAt.x-guardAt.x)/radius*.75,y:heroAt.y-(heroAt.y-guardAt.y)/radius*.75};
    if(Math.hypot(Math.max(p.x0-aim.x,0,aim.x-p.x1),Math.max(p.y0-aim.y,0,aim.y-p.y1))>=.23)continue;
    taken++;cases++;
    const {s,g,firing,moved}=standoff(heroAt,guardAt,{doors,heading,rounds:1});
    if(firing||moved>.05)continue;
    // Frozen: legitimate only if no standing spot near the aim can be reached at all.
    let reachable=null;
    for(let ring=1;ring<=40&&!reachable;ring++)for(let i=0;i<16&&!reachable;i++){const q={x:aim.x+Math.cos(i/16*Math.PI*2)*ring*.05,y:aim.y+Math.sin(i/16*Math.PI*2)*ring*.05};if(freePoint(s,q,g.id)&&navigationPath(s,g,q.x,q.y))reachable=q;}
    assert.equal(reachable,null,`${p.placementId}: guard froze at ${guardAt.x.toFixed(2)},${guardAt.y.toFixed(2)} though (${reachable?.x.toFixed(2)},${reachable?.y.toFixed(2)}) was reachable`);
  }
  assert.ok(cases>=36,`only ${cases} approaches sampled`);
});

test('a guard that re-sights its quarry mid-approach heads for the new position, not the old one',()=>{
  // Round one closes on the animal beside the scale; then it is seen behind the
  // dispatch desk, where the 0.75 m aim again falls inside a prop. Nothing about the
  // approach is held between ticks, so the new sighting is the new goal at once.
  const base=mill();for(const o of base.interactables)if(o.kind==='door'){o.open=true;base.edges[o.edge]='door';}
  const s={...base},u=hero(s),g=s.units[1];
  for(const other of s.units.slice(2))other.hp=0;
  Object.assign(u,{x:8,y:21,ap:20,hp:10000,maxHp:10000});Object.assign(g,{x:7.6,y:18.2,alert:true,lastKnown:{x:8,y:21},alertAge:0});
  s.engaged=true;s.phase='player';Core.refresh(s,{forceFog:true});
  Core.endTurn(s);for(let frame=0;s.phase==='enemy'&&frame<2000;frame++)tick(s,.05);
  Object.assign(u,{x:32,y:5.3});g.lastKnown={x:32,y:5.3};g.alertAge=0;
  const before=distance(g,u);
  s.phase='player';s.engaged=true;Core.endTurn(s);for(let frame=0;s.phase==='enemy'&&frame<2000;frame++)tick(s,.05);
  assert.ok(before-distance(g,u)>1,`guard closed only ${(before-distance(g,u)).toFixed(2)} m on the new position`);
});

test('a save that stood on the old scale marker loads beside the scale and walks away; nothing else moves',()=>{
  const s=mill(),stored=JSON.parse(encodeSave(s));stored.units[0].x=8;stored.units[0].y=20;
  stored.queue=[{x:9.5,y:21.2,z:0,cost:3}];   // a route planned from inside the scale
  const restored=decodeSave(JSON.stringify(stored)),u=hero(restored);
  assert.ok(freePoint(restored,u,u.id));assert.ok(Math.hypot(u.x-8,u.y-20)<.85,`${u.x},${u.y}`);
  assert.deepEqual(restored.queue,[]);
  assert.deepEqual(restored.units.slice(1).map(g=>[g.x,g.y]),s.units.slice(1).map(g=>[g.x,g.y]));
  const before={x:u.x,y:u.y};for(let i=0;i<10;i++)tick(restored,.05,{x:0,y:1});
  assert.ok(Math.hypot(u.x-before.x,u.y-before.y)>.3);
  assert.equal(encodeSave(decodeSave(encodeSave(s))),encodeSave(s));  // a valid save is untouched
});

test('the art view follows map knowledge, hands the sealed load its crate tiles and hides collected paper',()=>{
  const s=mill(),errors=[],loads=[];
  const art=createMissionArt(s,{loader:{load:url=>{loads.push(url);return new T.Texture();}},onError:message=>errors.push(message)});
  try{
    assert.deepEqual([art.skipped,art.refused,errors],[[],[],[]]);
    assert.ok(loads[0].endsWith('mission-art/short-measure/shipping-manifest.svg'));
    assert.deepEqual([...art.replacedCells].sort(),['27,19','27,20','28,19','28,20']);
    const shown=()=>art.root.children.filter(child=>child.visible&&child.name!=='ground-markings').map(child=>child.name).sort();
    const paint=()=>art.root.getObjectByName('ground-markings').children.filter(mark=>mark.visible).map(mark=>mark.name);
    s.seen=new Set();art.update(s,blockWindow(s,hero(s)));assert.deepEqual(shown(),[]);assert.deepEqual(paint(),[]);
    s.seen.add('7,25');art.update(s,blockWindow(s,hero(s)));assert.deepEqual(paint(),['ration-lane-bar']);
    s.seen.add('9,20');art.update(s,blockWindow(s,hero(s)));assert.deepEqual(shown(),['worker-scale']);
    s.seen.add('32,6');art.update(s,blockWindow(s,hero(s)));assert.deepEqual(shown(),['shipping-manifest','worker-scale']);
    const paper=art.root.getObjectByName('collectible-paper');assert.equal(paper.visible,true);
    s.solo.objectives['shipping-manifest']=true;art.update(s,blockWindow(s,hero(s)));assert.equal(paper.visible,false);
  }finally{art.dispose();art.dispose();}
  assert.equal(createMissionArt(createSoloGame()),null);
});

test('a binding the kit refuses is reported, never hidden',()=>{
  const s=mill(),errors=[],bindings=missionArtBindings(getMission('short-measure'),s.map);
  bindings['worker-scale']={...bindings['worker-scale'],height:1.6};
  const art=createMissionArt(s,{loader:{load:()=>new T.Texture()},bindings,onError:message=>errors.push(message)});
  try{
    assert.deepEqual(art.refused,['worker-scale']);assert.ok(art.root.getObjectByName('worker-scale')===undefined);
    assert.equal(errors.length,1);assert.match(errors[0],/worker-scale/);
  }finally{art.dispose();}
});

// FieldView end to end without a GPU: images never finish loading, so only the
// synchronous scene graph and the mission art's lifecycle are exercised. Three.js
// objects are compared with ===: node:test walks whole scene graphs on a failure.
function bareView(state,importMissionArt){
  const view=Object.create(FieldView.prototype),errors=[];
  Object.assign(view,{state,generation:1,renderer:{capabilities:{getMaxAnisotropy:()=>1}},environment:new T.Group(),failed:new Set(),disposables:[],residentWindow:null,onLoading(){},onError:message=>errors.push(message)});
  if(importMissionArt)view.importMissionArt=importMissionArt;
  return {view,errors};
}
async function withImages(run){
  const previous=globalThis.document;
  globalThis.document={createElementNS:()=>({style:{},addEventListener(){},removeEventListener(){},set src(value){}})};
  try{return await run();}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
}
const SEALED=['27,19','27,20','28,19','28,20'];
test('the inherited cargo yields its crates only once the kit is in the scene, and the kit is disposed with the field',()=>withImages(async()=>{
  const s=mill();s.seen=new Set(['4,25']);   // the desk is unexplored
  const {view,errors}=bareView(s);view.buildEnvironment(s);
  assert.deepEqual([...view.art.replaced],[],'nothing is hidden before the kit arrives');
  const art=await view.missionArtReady;
  assert.deepEqual(errors,[]);assert.ok(view.missionArt===art&&art.root.parent===view.environment);
  assert.deepEqual([...view.art.replaced].sort(),SEALED);
  assert.equal(art.root.getObjectByName('shipping-manifest').visible,false,'fog applies the moment the kit arrives');
  // The field's generic traversal frees materials but never their maps, so only
  // the kit's own dispose frees its generated textures and the paper.
  const counts=new Map();
  art.root.traverse(mesh=>{if(!mesh.isMesh)return;for(const resource of [mesh.material,mesh.material.map].filter(Boolean))if(!counts.has(resource)){counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));}});
  view.clearEnvironment();assert.ok(view.missionArt===null);
  assert.ok([...counts.keys()].filter(resource=>resource.isTexture).length>=9);   // 8 surfaces + the paper
  assert.ok([...counts.values()].every(n=>n===1),'every kit material and texture is disposed exactly once');
}));

test('a kit that fails to load, refuses a stale table or arrives late leaves every inherited crate drawn',()=>withImages(async()=>{
  const failing=bareView(mill(),()=>Promise.reject(Error('offline')));failing.view.buildEnvironment(failing.view.state);
  assert.ok(await failing.view.missionArtReady===null);assert.deepEqual([...failing.view.art.replaced],[]);
  assert.equal(failing.errors.length,1);assert.match(failing.errors[0],/could not load: offline/);failing.view.clearEnvironment();
  // A page left open across a deploy fetches an art module with a newer table.
  const real=await import('../dist/mission-art-view.js');
  const stale=bareView(mill(),async()=>({createMissionArt:(state,options)=>real.createMissionArt(state,{...options,expectDigest:'an older table'})}));
  stale.view.buildEnvironment(stale.view.state);
  assert.ok(await stale.view.missionArtReady===null);assert.deepEqual([...stale.view.art.replaced],[]);assert.match(stale.errors[0],/Reload/);stale.view.clearEnvironment();
  // That refusal only works if the field hands over its own simulation's digest.
  let handed;const watching=bareView(mill(),async()=>({createMissionArt:(state,options)=>{handed=options.expectDigest;return null;}}));
  watching.view.buildEnvironment(watching.view.state);await watching.view.missionArtReady;
  assert.equal(handed,SCENERY_DIGEST);watching.view.clearEnvironment();
  const late=bareView(mill());late.view.buildEnvironment(late.view.state);late.view.generation++;
  assert.ok(await late.view.missionArtReady===null&&late.view.missionArt===undefined);assert.deepEqual([...late.view.art.replaced],[]);late.view.clearEnvironment();
  // Night Ledger never asks for the kit at all.
  let asked=0;const night=createSoloGame(),plain=bareView(night,()=>{asked++;return import('../dist/mission-art-view.js');});
  plain.view.buildEnvironment(night);assert.ok(await plain.view.missionArtReady===null);
  assert.equal(asked,0);assert.deepEqual(plain.errors,[]);plain.view.clearEnvironment();
}));

test('replaced crate tiles stop drawing and every other crate still draws',()=>{
  const s=mill();for(let y=0;y<30;y++)for(let x=0;x<40;x++)s.seen.add(`${x},${y}`);
  const env=new OriginalEnvironment({capabilities:{getMaxAnisotropy:()=>1}},s,{loader:{load:()=>new T.Texture(),loadAsync:()=>new Promise(()=>{})}});
  // A one-mesh stand-in for the painted cargo library, which needs real images.
  const proto=new T.Group();proto.add(new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial()));proto.updateMatrixWorld(true);
  env.library={build:()=>({root:proto,bounds:new T.Box3(new T.Vector3(-.5,0,-.5),new T.Vector3(.5,.92,.5))}),dispose(){}};
  for(const chunk of env.chunks.values())env.buildCargo(chunk);
  const drawn=()=>[...env.chunks.values()].flatMap(chunk=>chunk.cargo).reduce((n,{mesh})=>n+mesh.count,0);
  const crates=s.map.flat().filter(tile=>tile==='crate').length;
  env.update(s,hero(s),env.window);assert.equal(drawn(),crates);
  // replace() redraws at once: the kit may arrive while the player stands still.
  env.replace(SEALED);assert.equal(drawn(),crates-4);
  env.dispose();
});

test('the interaction hand rises with the clue marker above the scale',()=>{
  const s=mill(),view=Object.create(FieldView.prototype),camera=new T.OrthographicCamera(-6,6,6,-6,.1,100);
  camera.position.set(18,14,32);camera.lookAt(8,0,20);camera.updateMatrixWorld();
  Object.assign(view,{state:s,camera,container:{clientWidth:390,clientHeight:844}});
  const at=height=>{const p=new T.Vector3(8,height,20).project(camera);return {x:(p.x+1)*195,y:(1-p.y)*422};};
  const anchor=view.interactionAnchor(s.interactables.find(o=>o.id==='worker-scale'));
  assert.ok(Math.abs(anchor.x-at(2).x)<1e-6&&Math.abs(anchor.y-at(2).y)<1e-6);
  assert.ok(Math.abs(anchor.y-at(.8).y)>10);   // not at the authored .8 m, inside the prop
});

test('an embodied clue floats its marker above its prop; other markers keep their authored height',()=>{
  const s=mill(),mission=getMission('short-measure'),clue=id=>s.interactables.find(o=>o.id===id);
  assert.equal(clueAnchorHeight(mission,clue('worker-scale'),.8),1.72+.28);
  assert.equal(clueAnchorHeight(mission,clue('sealed-load'),.8),1.2);      // authored above its .92 m load already
  assert.equal(clueAnchorHeight(getMission('road-checkpoint'),{kind:'clue',id:'worker-scale',anchorHeight:.8},.8),.8);
  assert.equal(clueAnchorHeight(mission,{kind:'objective',id:'shipping-manifest'},.7),.7);
  const view=Object.create(InteractionScenery.prototype),marker=new T.Mesh(new T.OctahedronGeometry(.18),new T.MeshStandardMaterial());
  view.records=new Map([['worker-scale',{marker}]]);s.seen.add('8,20');view.update(s);
  assert.deepEqual(marker.position.toArray(),[8,2,20]);marker.geometry.dispose();marker.material.dispose();
});
