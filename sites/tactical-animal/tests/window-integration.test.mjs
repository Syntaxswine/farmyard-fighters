import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoloGame,DEFAULT_BUILD,hero,Core,geometry,lineClear,confirmedImpact,encodeSave,decodeSave,freePoint} from '../dist/solo-game.js';
import {windowSystem} from '../dist/window-catalogue.js';
import {windowToWorld,windowToLocal,legacyWallSpan} from '../dist/window-system.js';
import {adaptAftSector} from '../dist/aft-sector.js';
import {windowReviewSource} from '../dist/window-review-map.js';
import {fracturePane,shardPose,createWindowShatter} from '../dist/window-shatter.js';
const game=()=>{const s=createSoloGame({...DEFAULT_BUILD,utility:'grenade'},1947,'window-yard');s.phase='player';hero(s).ap=99;s.units=s.units.slice(0,1);s.detected.clear();for(let y=15;y<32;y++)for(let x=14;x<33;x++){s.seen.add(`${x},${y}`);s.visible.add(`${x},${y}`);}return structuredClone(s);};
test('large clear panes, divisions and repeated instances keep independent saved damage',()=>{
  const s=game(),before=s.seed;assert.equal(windowSystem.breakPane(s,'clear-a','r0c0',{x:20,y:21.5,h:1.1}).sequence,1);
  assert.equal(windowSystem.breakPane(s,'clear-a','r0c0',{x:20,y:21.5,h:1.1}),null);
  assert.equal(windowSystem.broken(s,'clear-b','r0c0'),false);windowSystem.breakPane(s,'grid-a','r0c1',{x:25,y:21.5,h:.5});
  assert.equal(windowSystem.broken(s,'grid-a','r1c1'),false);assert.equal(s.seed,before);
  const text=encodeSave(s);assert.ok(!text.includes('windowEvents'));const restored=decodeSave(text);assert.deepEqual(restored.windowBreaks,JSON.parse(JSON.stringify(s.windowBreaks)));assert.equal(restored.windowEvents,undefined);
  assert.equal(windowSystem.breakPane(restored,'clear-a','r0c0',{}),null);
  const bad=JSON.parse(text);bad.windowBreaks['grid-a']=['missing'];assert.throws(()=>decodeSave(JSON.stringify(bad)),/window damage/);
});
test('real pane, mullion, sill and lower-wall heights intercept shots at each quarter turn',()=>{
  for(const rotation of [0,90,180,270]){
    const s=game(),p={id:'rotated',definitionId:'window.waist.grid-2x2.2m',x:rotation%180?20.5:20.5,y:rotation%180?20.5:20.5,rotation};
    // Even spans are centred between cells in the along direction.
    s.windows=[p];s.edges={};const a=hero(s),at=windowToWorld(p,[-.5,1.1,3]);Object.assign(a,{x:at.x,y:at.y});
    const target=(x,h)=>({...windowToWorld(p,[x,h,-2]),ground:true});
    assert.equal(confirmedImpact(s,a,target(-.5,1.15)).box.kind,'glass');
    Object.assign(a,windowToWorld(p,[0,1.1,3]));
    assert.equal(confirmedImpact(s,a,target(0,1.15)).box.role,'mullion');
    Object.assign(a,at);
    assert.equal(confirmedImpact(s,a,target(-.5,.2)).box.role,'lower-wall');
    assert.equal(lineClear(s,a,target(-.5,1.15)),true);
    assert.equal(freePoint(s,windowToWorld(p,[-.5,0,0]),a.id,{units:false}),false);
    const local=windowToLocal(p,target(-.5,1.15));assert.ok(Math.abs(local[0]+.5)<1e-8);
  }
});
test('one burst breaks a full-span pane then subsequent rounds pass through the hole',()=>{
  const s=game(),a=hero(s);s.seed=1;a.x=20;a.y=25;a.ammo.assault=30;a.ap=99;
  const b={...structuredClone(a),id:4,team:'guard',name:'Target',x:20,y:19,hp:999,maxHp:999,pack:[],weapon:'pistol'};s.units.push(b);s.detected.add(b.id);a.stats={...a.stats,firearms:100};
  // Seed 1 accepts its first shot; later accuracy rolls retain normal rules.
  assert.equal(Core.attack(s,a,b,true),true);assert.equal(s.windowBreaks['clear-a'].length,1);assert.equal(s.windowEvents.length,1);assert.equal(s.effect.sequence[0].windowSequences.length,1);
  assert.ok(s.effect.sequence.slice(1).some(e=>e.impact?.unitId===b.id));assert.equal(a.ammo.assault,30-s.effect.sequence.length);
  assert.ok(!geometry(s).some(b=>b.windowId==='clear-a'&&b.kind==='glass'));
});
test('a frame hit consumes the shot without breaking adjacent panes',()=>{
  const s=game(),a=hero(s);a.x=25;a.y=25;const p={ground:true,x:25,y:21.5,h:1.99,name:'Frame'};
  assert.ok(Core.attack(s,a,p));assert.equal(s.windowSequence||0,0);assert.equal(a.ammo.assault,29);
});
test('glass stays transparent to standing and prone sight while the waist wall remains opaque',()=>{
  const s=game();assert.equal(lineClear(s,{x:20,y:25,stance:'prone'},{x:20,y:19,stance:'prone'}),true);
  assert.equal(lineClear(s,{x:19.5,y:26,stance:'prone'},{x:19.5,y:30,stance:'prone'}),false);
  assert.equal(lineClear(s,{x:19.5,y:26,stance:'standing'},{x:19.5,y:30,stance:'standing'}),true);
});
test('flame preview and damage stop at glass, then agree on the open pane after a bullet breaks it',()=>{
  const s=game(),a=hero(s);a.weapon='flamethrower';a.ammo.flamethrower=5;a.heading=270;a.x=20;a.y=25;
  const b={...structuredClone(a),id:8,team:'guard',name:'Glass target',x:20,y:19,weapon:'pistol',pack:[]};s.units.push(b);s.detected.add(b.id);
  let p=Core.previewFlame(s,a,270);assert.ok(p.shape.rays[18].distance<4);assert.equal(p.contacts.some(u=>u.id===b.id),false);
  a.weapon='assault';a.ammo.assault=30;s.seed=1;assert.ok(Core.attack(s,a,{ground:true,x:20,y:21.5,h:1.1}));
  a.weapon='flamethrower';a.ap=99;p=Core.previewFlame(s,a,270);assert.ok(p.shape.rays[18].distance>6);assert.equal(p.contacts.some(u=>u.id===b.id),true);
});
test('grenade and tank blasts emit independent pane events through their committed combat path',()=>{
  const s=game(),a=hero(s);a.x=20;a.y=25;assert.ok(Core.throwGrenade(s,a,{x:20,y:23}));assert.ok(s.windowEvents.length>0);assert.equal(s.effect.sequence[0].windowSequences.length,s.windowEvents.length);
  const t=game(),shooter=hero(t);t.seed=1;const victim={...structuredClone(shooter),id:9,name:'Fuel carrier',team:'guard',weapon:'flamethrower',x:20,y:24,ammo:{flamethrower:5},ammoPouch:{flamethrower:5},pack:[{type:'weapon',kind:'flamethrower'}]};t.units.push(victim);t.detected.add(victim.id);
  assert.ok(Core.attack(t,shooter,victim,false,false,'weapon'));assert.equal(victim.tanksExploded,true);assert.ok(t.windowEvents.length>0);assert.equal(t.effect.sequence[0].windowSequences.length,t.windowEvents.length);
});
test('divided-window flame clipping and damage use the same stance-height opening',()=>{
  const base=game();base.windows=[{id:'bands',definitionId:'window.full.horizontal-2.3m',x:20,y:21.5,rotation:0}];base.edges={};
  for(const [pane,passes]of [['r0c0',false],['r1c0',true]]){const s=structuredClone(base),a=hero(s);a.weapon='flamethrower';a.ammo.flamethrower=5;
    const b={...structuredClone(a),id:9,team:'guard',name:'Target',x:20,y:19,weapon:'pistol',pack:[]};s.units.push(b);s.detected.add(b.id);windowSystem.breakPane(s,'bands',pane,{x:20,y:21.5,h:.5});
    const p=Core.previewFlame(s,a,270);assert.equal(p.contacts.some(u=>u.id===b.id),passes);assert.equal(p.shape.rays[18].distance>6,passes);
  }
});
test('blast visits independent sections, respects opaque walls and never repeats a break',()=>{
  const s=game(),before=s.seed;const events=windowSystem.blast(s,{x:25,y:23},3,{occluded:()=>false});assert.equal(events.filter(e=>e.instanceId==='grid-a').length,6);
  assert.equal(windowSystem.blast(s,{x:25,y:23},3,{occluded:()=>false}).length,0);assert.equal(s.seed,before);
  const fresh=game();assert.equal(windowSystem.blast(fresh,{x:25,y:23},3,{occluded:()=>true}).length,0);assert.ok(windowSystem.blast(fresh,{x:25,y:23},3,{occluded:()=>true,ignoreWalls:true}).length>0);
});
test('authoring extension removes every covered segment and leaves legacy windows compatible',()=>{
  const source=windowReviewSource();source.edges['s:19:21']='window-brick';source.edges['s:20:21']='wall-brick';source.edges['s:21:21']='wall-brick';
  const map=adaptAftSector(source);assert.equal(map.edges['s:19:21'],undefined);assert.equal(map.edges['s:20:21'],undefined);assert.equal(map.edges['s:21:21'],undefined);
  delete source.farmyardWindows;assert.equal(adaptAftSector(source).edges['s:19:21'],'wall');
  const covered=new Set(['s:19:21','s:20:21','s:21:21']);assert.equal(legacyWallSpan('s:20:21',covered),null);assert.equal(legacyWallSpan('s:18:21',covered).max,18.5);assert.equal(legacyWallSpan('s:22:21',covered).min,21.5);
});
test('unsupported window placements, duplicate IDs and upper floors are rejected',()=>{
  for(const mutate of [s=>s.windows.push({...s.windows[0]}),s=>s.windows[0].z=1,s=>s.windows[0].rotation=45,s=>s.windows[0].x=.123,s=>s.windows[0].definitionId='unknown']){const s=game();mutate(s);s.windows=[...s.windows];assert.throws(()=>windowSystem.compile(s));}
});
test('adapted study partitions actual large and tiny bounds and settles on the receiving floor',()=>{
  for(const bounds of [{min:[-1.445,.055,-.004],max:[1.445,1.945,.004]},{min:[.4,.9,-.004],max:[.55,1.1,.004]}]){
    const pieces=fracturePane(17,bounds);let area=0;
    for(const p of pieces){const v=p.local.map(q=>q.map((n,i)=>n+p.center[i]));area+=Math.abs((v[1][0]-v[0][0])*(v[2][1]-v[0][1])-(v[1][1]-v[0][1])*(v[2][0]-v[0][0]))/2;assert.ok(shardPose(p,2.2).settled);assert.ok(shardPose(p,.1).position[2]-p.radius>.1);}
    assert.ok(Math.abs(area-(bounds.max[0]-bounds.min[0])*(bounds.max[1]-bounds.min[1]))<1e-8);assert.ok(pieces.length<=70);
    const fx=createWindowShatter({kind:'window.full.clear.3m',bounds,includePane:false});fx.sample(.6);assert.ok(fx.diagnostics().bounds.filter((_,i)=>i%3===1).every(y=>y>=.0029));fx.sample(2.2);assert.equal(fx.diagnostics().shardsVisible,false);fx.dispose();fx.dispose();
  }
  assert.equal(fracturePane().length,70);assert.deepEqual(fracturePane(23),fracturePane(23));
});
