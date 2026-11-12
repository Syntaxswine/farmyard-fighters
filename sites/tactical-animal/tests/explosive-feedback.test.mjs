import test from 'node:test';
import assert from 'node:assert/strict';
import {Core,DEFAULT_BUILD,createSoloGame,hero,tick,encodeSave,decodeSave,geometry,confirmedImpact} from '../dist/solo-game.js';
import {windowReviewSource} from '../dist/window-review-map.js';
import {FieldView} from '../dist/field-view.js';
import {ExplosionShake} from '../dist/explosion-shake.js';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {app} from './app-harness.mjs';

function fixture({seed=1,primary='assault',props=[{kind:'barrel-explosive',x:28,y:25,z:0}],guards=[],edges={}}={}){
  const source=windowReviewSource();source.edges=edges;source.farmyardWindows.instances=[];
  source.starts[0]={x:20,y:25,z:0,heading:0};source.props=props;source.guards=guards;
  return Core.enableRealtime(createSoloGame({...DEFAULT_BUILD,primary,utility:'grenade'},seed,'window-yard',{authoredMap:source}));
}
function shoot(s,target,zone='torso'){
  Core.configureRealtime(s,{fireMode:'single'});
  assert.equal(Core.attack(s,hero(s),target,false,false,zone),true);
  for(let i=0;i<80&&!s.effect;i++)tick(s,.05);
  const shot=s.effect?.sequence.find(e=>e.shooter===0);assert.ok(shot,'Production simulation emits the shot');return shot;
}
const barrelPoint={x:28,y:25,h:.4,ground:true,barrelId:'barrel:28,25,0'};

test('one barrel tap uses production firing until it is destroyed, with no menu or held pointer',()=>{
  const a=app({realTime:true,search:'?activity=quiet-shift'}),barrel=a.s.props[0],ammo=a.u.ammo.assault;
  a.view.options.onPick({...barrel,h:.4,ground:true,barrelId:`barrel:${barrel.x},${barrel.y},0`});
  assert.equal(a.el('overlay').open,false);assert.equal(Core.realtimeStatus(a.s).triggerHeld,false);assert.equal(a.s.realtime.autoFire,false);
  for(let i=0;i<100&&a.s.props.length;i++)a.advance();
  assert.equal(a.s.props.length,0);assert.ok(a.u.ammo.assault<ammo);
  const after=a.u.ammo.assault;a.advance(20);assert.equal(a.u.ammo.assault,after);
});

test('barrel firing can wait for reload, cancels on movement, and never resumes an attack from a save',()=>{
  const s=fixture(),player=hero(s);player.ammo.assault=0;
  assert.equal(Core.targetBarrel(s,player,barrelPoint),true);
  const restored=decodeSave(encodeSave(s));for(let i=0;i<70;i++)tick(restored,.05);assert.equal(restored.props.length,1);
  for(let i=0;i<100&&s.props.length;i++)tick(s,.05);assert.equal(s.props.length,0);
  const moving=fixture();assert.ok(Core.targetBarrel(moving,hero(moving),barrelPoint));tick(moving,.05,{x:0,y:1});
  for(let i=0;i<30;i++)tick(moving,.05);assert.equal(hero(moving).ammo.assault,30);assert.equal(moving.props.length,1);
});

test('Quiet Shift offers a reachable barrel chain from the normal arrival point without harming the player',()=>{
  const s=Core.enableRealtime(createSoloGame({...DEFAULT_BUILD,utility:'grenade'},1,'quiet-shift'));
  const barrels=s.props.filter(p=>p.kind==='barrel-explosive');assert.equal(barrels.length,2);
  const player=hero(s),hp=player.hp,point=barrels[0];
  assert.ok(Math.hypot(point.x-player.x,point.y-player.y)>5);
  const shot=shoot(s,{...point,h:.4,ground:true,barrelId:`barrel:${point.x},${point.y},0`});
  assert.equal(shot.explosions.filter(e=>e.kind==='barrel').length,2);assert.equal(s.props.length,0);
  assert.equal(player.hp,hp);assert.equal(s.units.filter(u=>u.team==='guard'&&u.hp>0).length,2);
  const restored=decodeSave(encodeSave(s));assert.equal(restored.props.length,0);
});

test('shooting a barrel commits one chain reaction, removes collision and retains the destroyed state on resume',()=>{
  const props=[{kind:'barrel-explosive',x:28,y:25,z:0},{kind:'barrel-explosive',x:31,y:25,z:0}];
  const guards=[{name:'Nearby guard',species:'pig-foreman',weapon:'pistol',x:29,y:25,heading:0}];
  const s=fixture({props,guards});assert.equal(geometry(s).filter(b=>b.sourceKind==='barrel-explosive').length,2);
  const shot=shoot(s,barrelPoint);
  assert.equal(shot.explosions.filter(e=>e.kind==='barrel').length,2);
  assert.equal(s.props.length,0);assert.equal(geometry(s).filter(b=>b.sourceKind==='barrel-explosive').length,0);
  assert.equal(s.units[1].hp,0);assert.equal(s.realtime.kills,1);assert.equal(hero(s).ammo.assault,29);
  assert.equal(s.fireAnimations.filter(e=>e.kind==='barrel').length,2);assert.ok(s.fires.length);
  assert.equal(Core.previewAttack(s,hero(s),barrelPoint).ok,false);
  const restored=decodeSave(encodeSave(s));assert.equal(restored.props.length,0);assert.equal(restored.effect,undefined);
  assert.equal(restored.fireAnimations,undefined);assert.equal(geometry(restored).filter(b=>b.sourceKind==='barrel-explosive').length,0);
});

test('a missed shot can detonate a barrel along its real stray ray, while intact cover intercepts it first',()=>{
  for(const blocked of [false,true]){
    const s=fixture({seed:20,props:[{kind:'barrel-explosive',x:36,y:26,z:0}],
      guards:[{name:'Intended target',species:'pig-foreman',weapon:'pistol',x:28,y:25,heading:0}],
      edges:blocked?{'e:33:26':'wall-brick'}:{}});
    hero(s).stats.firearms=hero(s).stats.dexterity=30;
    const preview=Core.previewAttack(s,hero(s),s.units[1],false,'legs');
    const die=((Math.imul(s.seed,1664525)+1013904223)>>>0)/4294967296*100;
    assert.ok(die>=preview.chance,'Fixture fails the intended-target accuracy roll');
    const shot=shoot(s,s.units[1],'legs');
    assert.equal(s.units[1].hp,s.units[1].maxHp);
    assert.equal(shot.explosions.length,blocked?0:1);
    assert.equal(s.props.length,blocked?1:0);
    assert.equal(shot.wallEdge,blocked?'e:33:26':undefined);
    if(!blocked)assert.ok(Math.hypot(shot.traceEnd.x-36,shot.traceEnd.y-26)<=.328001);
  }
});

test('RPG and grenade blast footprints also detonate barrels through production combat',()=>{
  const grenade=fixture();assert.equal(Core.throwGrenade(grenade,hero(grenade),{x:27,y:25}),true);
  assert.equal(grenade.effect.sequence[0].weapon,'grenade');assert.equal(grenade.props.length,0);
  const rocket=fixture({primary:'rpg'});
  const shot=shoot(rocket,barrelPoint);assert.equal(shot.weapon,'rpg');assert.equal(rocket.props.length,0);
});

test('a barrel collision follows the actual drum: empty tile corners and overhead rounds stay clear',()=>{
  const s=fixture(),player=hero(s);
  assert.ok(confirmedImpact(s,player,barrelPoint)?.box.barrelId);
  assert.equal(confirmedImpact(s,player,{ground:true,x:28.45,y:25.45,h:.4}),null);
  assert.equal(confirmedImpact(s,player,{ground:true,x:32,y:25,h:2}),null);
});

test('blast shake falls off with distance, stays bounded under overlapping blasts, and settles without gameplay RNG',()=>{
  const near=new ExplosionShake(),far=new ExplosionShake();
  near.blast('barrel',{x:0,y:0},{x:0,y:0},0);far.blast('barrel',{x:20,y:0},{x:0,y:0},0);
  assert.ok(Math.hypot(...Object.values(near.sample(0)))>Math.hypot(...Object.values(far.sample(0))));
  const single=Math.hypot(...Object.values(near.sample(0)));
  near.blast('grenade',{x:0,y:0},{x:0,y:0},0);near.blast('barrel',{x:0,y:0},{x:0,y:0},0);
  assert.ok(Math.hypot(...Object.values(near.sample(0)))>=single,'Concurrent blasts reinforce the shake');
  for(let i=0;i<20;i++)near.blast('rpg',{x:0,y:0},{x:0,y:0},0);
  for(let now=0;now<500;now+=8){const p=near.sample(now);assert.ok(Math.hypot(p.x,p.y)<=12.000001);}
  assert.deepEqual(near.sample(500),{x:0,y:0});assert.equal(near.pulses.length,0);
  const reduced=new ExplosionShake({reducedMotion:()=>true});reduced.blast('grenade',{x:0,y:0},{x:0,y:0},0);
  assert.deepEqual(reduced.sample(0),{x:0,y:0});assert.equal(reduced.count,0);
});

test('grenade shake waits for impact while rocket shake starts at discharge, and each blast shakes once',()=>{
  for(const weapon of ['grenade','rpg']){
    const view=Object.create(FieldView.prototype);Object.assign(view,{scene:new T.Scene(),state:fixture(),effects:[],explosionShake:new ExplosionShake(),weaponSound:()=>{}});
    const event={weapon,shooter:0,ax:20,ay:25,bx:26,by:25,blast:5,hit:false};
    try{
      view.queueEffects({sequence:[event]},1000);view.animateEffects(1000);
      assert.equal(view.explosionShake.count,weapon==='rpg'?1:0);
      if(weapon==='grenade'){view.animateEffects(1499);assert.equal(view.explosionShake.count,0);view.animateEffects(1500);assert.equal(view.explosionShake.count,1);}
      view.animateEffects(1600);assert.equal(view.explosionShake.count,1);
    }finally{view.clearEffects();}
  }
});

test('shake moves only the rendered camera and restores its exact pose even if rendering throws',()=>{
  const view=Object.create(FieldView.prototype),camera=new T.OrthographicCamera();camera.position.set(20,18,35);camera.lookAt(20,0,25);camera.updateMatrixWorld();
  Object.assign(view,{camera,target:new T.Vector3(20,0,25),span:18,container:{clientHeight:800},explosionShake:new ExplosionShake()});
  const before=camera.position.clone(),target=view.target.clone();view.explosionShake.blast('rpg',{x:20,y:25},{x:20,y:25},0);
  for(const now of [0,30,70]){view.renderWithShake(now,()=>assert.ok(camera.position.distanceTo(before)>0));assert.deepEqual(camera.position,before);assert.deepEqual(view.target,target);}
  assert.throws(()=>view.renderWithShake(90,()=>{throw Error('render failure');}));assert.deepEqual(camera.position,before);
  view.renderWithShake(500,()=>assert.deepEqual(camera.position,before));
});
