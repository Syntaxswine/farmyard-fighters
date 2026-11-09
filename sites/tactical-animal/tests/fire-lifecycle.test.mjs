import test from 'node:test';
import assert from 'node:assert/strict';
import {Core,DEFAULT_BUILD,createSoloGame,hero,refresh,tick,encodeSave,decodeSave,walkSegment} from '../dist/solo-game.js';

export function fireFixture(){
  const s={...createSoloGame({...DEFAULT_BUILD,primary:'flamethrower'}),edges:{},interactables:[]};
  Object.assign(hero(s),{x:4.17,y:24.23,ap:20,heading:0});
  for(const [i,u]of s.units.slice(1).entries())Object.assign(u,{x:9.17+i,y:24.23,hp:1000,alert:false});
  s.phase='player';s.engaged=true;refresh(s,{forceFog:true});return s;
}
function finishRound(s){const round=s.round;assert.ok(Core.endTurn(s));for(let i=0;s.phase==='enemy'&&i<500;i++)tick(s,.05);assert.equal(s.round,round+1);}

test('direct spray permanently kills high-HP victims and allies and commits stationary burned remains',()=>{
  const s=fireFixture(),u=hero(s);s.units[2].team='ally';
  const positions=s.units.map(v=>[v.x,v.y]),seed=s.seed;assert.ok(Core.fireFlame(s,u,0));
  for(const v of s.units.slice(1)){assert.equal(v.hp,0);assert.equal(v.casualty,'dead');assert.equal(v.burnedRemains,true);assert.equal(v.burningTurns,0);}
  assert.equal(u.ap,14);assert.equal(u.ammo.flamethrower,3);assert.equal(s.seed,seed);assert.deepEqual(s.units.map(v=>[v.x,v.y]),positions);
  assert.ok(s.fireAnimations.every(e=>e.kind==='ash'&&e.route.length===1));
  assert.ok(s.interactables.some(o=>o.kind==='body'&&o.unitId===1));
});

test('walls and sufficiently high cover protect victims, while an exposed standing head can be hit',()=>{
  const base=fireFixture(),s={...base,obstacles:[{x0:6,x1:7,y0:22,y1:27,height:.92,kind:'crate'}]};
  s.units[1].stance='prone';s.units[2].stance='standing';s.units[3].stance='kneeling';
  assert.ok(Core.fireFlame(s,hero(s),0));assert.equal(s.units[1].hp,1000);assert.equal(s.units[2].hp,0);
  const w={...fireFixture(),edges:{'e:6:24':'wall'}};assert.ok(Core.fireFlame(w,hero(w),0));assert.equal(w.units[1].hp,1000);
});

test('ignition forces standing, zero AP, three legal seeded panic turns, then permanent ash',()=>{
  const s=fireFixture(),g=s.units[1];Object.assign(g,{stance:'prone',running:true});assert.ok(Core.ignite(s,g));
  assert.equal(g.burningTurns,3);assert.equal(g.ap,0);assert.equal(g.stance,'standing');assert.equal(g.running,false);
  for(const expected of [2,1,0]){finishRound(s);assert.equal(g.burningTurns,expected);}
  assert.equal(g.hp,0);assert.equal(g.burnedRemains,true);
  for(const e of s.fireAnimations.filter(e=>e.kind==='panic')){assert.ok(e.route.length<=4);for(let i=1;i<e.route.length;i++){assert.ok(Math.abs(e.route[i].x-e.route[i-1].x)<=1+1e-7);assert.ok(Math.abs(e.route[i].y-e.route[i-1].y)<=1+1e-7);}}
  assert.ok(Math.abs((g.x-Math.floor(g.x))-.17)<1e-7);assert.ok(Math.abs((g.y-Math.floor(g.y))-.23)<1e-7);
});

test('blocked panic stays in place, never opens a door, and still expires',()=>{
  const s={...fireFixture(),obstacles:[{x0:8.6,x1:8.8,y0:23,y1:25,height:2,kind:'wall'},{x0:9.6,x1:9.8,y0:23,y1:25,height:2,kind:'wall'},{x0:8.6,x1:9.8,y0:23.6,y1:23.8,height:2,kind:'wall'},{x0:8.6,x1:9.8,y0:24.6,y1:24.8,height:2,kind:'wall'}]},g=s.units[1],position=[g.x,g.y];
  Core.ignite(s,g);for(let i=0;i<3;i++)finishRound(s);
  assert.deepEqual([g.x,g.y],position);assert.equal(g.hp,0);assert.ok(s.fireAnimations.filter(e=>e.unitId===g.id&&e.kind==='panic').every(e=>e.route.length===1));
});

test('burning players and guards cannot act; a solo burning player advances without using controls',()=>{
  const s=fireFixture(),u=hero(s),g=s.units[1];for(const other of s.units.slice(1))other.hp=0;
  Core.ignite(s,u);assert.equal(Core.canControl(s,u),false);
  const before=encodeSave(s);assert.equal(Core.move(s,u,5,24),false);assert.equal(Core.reload(s,u),false);assert.equal(Core.equip(s,u,'pistol'),false);assert.equal(Core.setStance(s,u,'prone'),false);assert.equal(Core.fireFlame(s,u,0),false);assert.equal(encodeSave(s),before);
  for(let frames=0;s.solo.status==='active'&&frames<1000;frames++)tick(s,.05,{x:1,y:0});
  assert.equal(s.solo.status,'lost');assert.equal(u.hp,0);assert.equal(u.burnedRemains,true);assert.equal(u.ap,0);
  const t=fireFixture();Core.ignite(t,t.units[1]);t.phase='enemy';assert.equal(Core.attack(t,t.units[1],hero(t),false,true),false);
});

test('repeated ignition cannot refresh the countdown; saves keep committed state and discard playback',()=>{
  const s=fireFixture(),g=s.units[1];Core.ignite(s,g);finishRound(s);assert.equal(Core.ignite(s,g),false);assert.equal(g.burningTurns,2);
  const restored=decodeSave(encodeSave(s));assert.equal(restored.fireAnimations,undefined);assert.equal(restored.effect,undefined);assert.equal(restored.units[1].burningTurns,2);assert.deepEqual(restored.units,s.units);assert.equal(restored.seed,s.seed);
  finishRound(s);finishRound(restored);assert.deepEqual(restored.units,s.units);assert.equal(restored.seed,s.seed);
  finishRound(restored);assert.equal(restored.units[1].burnedRemains,true);
});

test('ground fire entry stops ordinary movement and fire preserves turns after contact ends',()=>{
  const s=fireFixture(),u=hero(s);s.fires=[{x:5,y:24,z:0,turns:3}];for(const g of s.units.slice(1))g.hp=0;refresh(s);
  assert.equal(s.phase,'player');Core.travel(s,u,2,0);assert.equal(u.burningTurns,3);assert.ok(u.x<5);assert.equal(u.ap,0);assert.equal(s.queue.length,0);
});

test('malformed burn/ground-fire saves are rejected',()=>{
  const s=fireFixture();Core.ignite(s,s.units[1]);
  for(const edit of [v=>v.units[1].burningTurns=4,v=>v.units[1].ap=1,v=>v.units[1].stance='prone',v=>v.fires=[{x:999,y:1,turns:3}],v=>v.panicDelay=-1]){const value=JSON.parse(encodeSave(s));edit(value);assert.throws(()=>decodeSave(JSON.stringify(value)),/Unsupported/);}
});
