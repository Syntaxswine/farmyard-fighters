import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Core,createSoloGame,DEFAULT_BUILD,hero,refresh,encodeSave,decodeSave} from '../dist/solo-game.js';
import {WALL_DIMENSIONS} from '../dist/world-dimensions.js';
function ready(primary='assault',secondary='pistol'){
  const s=createSoloGame({...DEFAULT_BUILD,primary,secondary,utility:'grenade'}),u=hero(s);
  for(const g of s.units.slice(1)){g.x=36;g.y=27;g.alert=true;}
  u.x=4;u.y=25;u.heading=0;u.ap=12;s.engaged=true;s.phase='player';refresh(s,{forceFog:true});return s;
}
test('half-cost grenade throws depend on the equipped weapon, not a stowed pistol',()=>{
  const s=ready(),u=hero(s);assert.equal(Core.grenadeCost(u),5);
  for(const weapon of ['pistol','smg']){u.weapon=weapon;assert.equal(Core.grenadeCost(u),2.5);}
  for(const weapon of ['assault','rifle','hmg','shotgun','sniper','rpg','knife','grenade']){u.weapon=weapon;assert.equal(Core.grenadeCost(u),5);}
});
test('a direct throw spends exactly one grenade and fractional AP while keeping the SMG equipped',()=>{
  const s=ready('smg'),u=hero(s),ammo=u.ammo.smg,point={x:10,y:25};u.ap=2.5;
  assert.equal(Core.previewGrenade(s,u,point).cost,2.5);assert.equal(Core.throwGrenade(s,u,point),true);
  assert.equal(u.ap,0);assert.equal(u.ammo.grenade,2);assert.equal(u.weapon,'smg');assert.equal(u.ammo.smg,ammo);
  const saved=decodeSave(encodeSave(s));assert.equal(hero(saved).ammo.grenade,2);assert.equal(hero(saved).weapon,'smg');
});
test('pistol throws cost 2.5 AP and standard weapons cost 5 AP with no additional equip cost',()=>{
  for(const weapon of ['pistol','assault']){const s=ready(),u=hero(s);u.weapon=weapon;
    const before=u.ap,cost=Core.grenadeCost(u),rounds=u.ammo[weapon];assert.equal(Core.throwGrenade(s,u,{x:10,y:25}),true);
    assert.equal(u.ap,before-cost);assert.equal(u.weapon,weapon);assert.equal(u.ammo[weapon],rounds);
  }
});
test('invalid throws leave all resources unchanged: AP, stock, range, turn, and landing point',()=>{
  for(const invalid of ['ap','stock','range','turn','point','unexplored']){
    const s=ready('smg'),u=hero(s);let point={x:10,y:25};
    if(invalid==='ap')u.ap=2.49;if(invalid==='stock')u.ammo.grenade=0;if(invalid==='range')point={x:16,y:25};
    if(invalid==='turn')s.phase='enemy';if(invalid==='point')point={x:NaN,y:25};if(invalid==='unexplored')s.seen.clear();
    const before=encodeSave(s);assert.equal(Core.previewGrenade(s,u,point).ok,false,invalid);assert.equal(Core.throwGrenade(s,u,point),false,invalid);assert.equal(encodeSave(s),before,invalid);
  }
});
test('grenade stock is finite and selecting a dressing provides no grenades',()=>{
  const s=ready('smg'),u=hero(s);u.ap=20;
  for(let i=0;i<3;i++)assert.equal(Core.throwGrenade(s,u,{x:10,y:25}),true);
  assert.equal(u.ammo.grenade,0);assert.equal(Core.throwGrenade(s,u,{x:10,y:25}),false);
  const noGrenades=createSoloGame();assert.equal(Core.previewGrenade(noGrenades,hero(noGrenades),{x:5,y:20}).reason,'No grenades remaining');
});
test('blast damages nearby opponents, spares distant ones, and warns about self damage',()=>{
  const s=ready(),u=hero(s),[a,b,c]=s.units.slice(1);a.x=10;a.y=25;b.x=12;b.y=25;c.x=16;c.y=25;
  refresh(s,{forceFog:true});const hp=s.units.map(v=>v.hp);assert.equal(Core.throwGrenade(s,u,{x:10,y:25}),true);
  assert.equal(u.hp,hp[0]);assert.ok(a.hp<hp[1]);assert.ok(b.hp<hp[2]);assert.equal(c.hp,hp[3]);
  const self=ready(),v=hero(self);assert.equal(Core.previewGrenade(self,v,{x:6,y:25}).selfDanger,true);
  const ownHp=v.hp;assert.equal(Core.throwGrenade(self,v,{x:6,y:25}),true);assert.ok(v.hp<ownHp);
});
test('walls block blast damage even when opponents are inside its radius',()=>{
  const s=ready(),u=hero(s),g=s.units[1];u.x=19;u.y=10;u.heading=0;g.x=22;g.y=10;refresh(s,{forceFog:true});
  const hp=g.hp;assert.equal(Core.throwGrenade(s,u,{x:19,y:10}),true);assert.equal(g.hp,hp);
});
test('throwing during exploration starts combat and charges the throw once',()=>{
  const s=createSoloGame({...DEFAULT_BUILD,utility:'grenade'}),u=hero(s);assert.equal(s.phase,'explore');
  assert.equal(Core.throwGrenade(s,u,{x:5,y:18}),true);assert.equal(s.phase,'player');assert.equal(u.ap,u.maxAp-5);assert.equal(u.ammo.grenade,2);
});
test('a grenade already equipped in an older save uses the same finite throw rules',()=>{
  const s=ready(),u=hero(s),g=s.units[1];u.weapon='grenade';g.x=10;g.y=25;refresh(s,{forceFog:true});
  assert.equal(Core.previewAttack(s,u,g).cost,5);assert.equal(Core.attack(s,u,g),true);assert.equal(u.ap,7);assert.equal(u.ammo.grenade,2);
});

function explored(s){for(let y=1;y<=28;y++)for(let x=1;x<=38;x++)s.seen.add(Core.key(x,y));}
test('a grenade below the inherited two-metre wall cannot pass through its visible face',()=>{
  const s=ready(),u=hero(s);u.x=19;u.y=10;explored(s);const point={x:22,y:10},before=encodeSave(s);
  assert.equal(WALL_DIMENSIONS.height,2);
  const crossing=Core.grenadeTrajectory(u,point)[16];assert.equal(crossing.x,20.5);assert.ok(crossing.z>1.41&&crossing.z<WALL_DIMENSIONS.height);
  assert.equal(Core.previewGrenade(s,u,point).reason,'Throw path is blocked');assert.equal(Core.throwGrenade(s,u,point),false);assert.equal(encodeSave(s),before);
});
test('a high lob clears a wall while its blast still respects wall protection',()=>{
  const s=ready(),u=hero(s),g=s.units[1];u.x=18;u.y=10;g.x=23;g.y=10;explored(s);
  const point={x:23,y:10},p=Core.previewGrenade(s,u,point),hp=u.hp,guardHp=g.hp;
  assert.equal(p.ok,true);assert.equal(p.selfDanger,false);assert.equal(Core.throwGrenade(s,u,point),true);
  assert.equal(u.hp,hp);assert.ok(g.hp<guardHp);
});
test('nearby flight obstructions and solid landing points cannot consume a grenade or AP',()=>{
  for(const point of [{x:22,y:10},{x:20.5,y:10},{x:22,y:15}]){
    const s=ready(),u=hero(s);u.x=20.2;u.y=10;explored(s);
    const before=encodeSave(s),p=Core.previewGrenade(s,u,point);
    assert.equal(p.ok,false);assert.match(p.reason,/blocked|obstacle/);assert.equal(Core.throwGrenade(s,u,point),false);assert.equal(encodeSave(s),before);
  }
});
test('the preview footprint stops at blast-blocking walls and does not explore fog',()=>{
  const s=ready(),point={x:19,y:10};explored(s);const before=encodeSave(s),edge=Core.grenadeBlastFootprint(s,point);
  assert.ok(edge[0].x<20.42);assert.equal(Core.grenadeAffects(s,point,{x:22,y:10}),false);
  assert.ok(Math.abs(edge[48].x-14)<1e-7);assert.equal(Core.grenadeAffects(s,point,{x:17,y:10}),true);
  assert.equal(encodeSave(s),before);
  s.seen.clear();assert.deepEqual(Core.grenadeBlastFootprint(s,point),[]);
  s.seen.add(Core.key(point.x,point.y));
  for(const p of Core.grenadeBlastFootprint(s,point))assert.ok(Math.hypot(p.x-point.x,p.y-point.y)<.8);
});
