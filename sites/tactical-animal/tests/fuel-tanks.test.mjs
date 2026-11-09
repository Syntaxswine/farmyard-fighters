import test from 'node:test';
import assert from 'node:assert/strict';
import {Core,DEFAULT_BUILD,createSoloGame,hero,refresh,tankExplosionChance,encodeSave,decodeSave,tick} from '../dist/solo-game.js';
const next=seed=>(Math.imul(seed,1664525)+1013904223)>>>0;
function fixture({held=true,distance=8}={}){
  const s={...createSoloGame(DEFAULT_BUILD),edges:{},interactables:[]},a=hero(s),b=s.units[1];
  Object.assign(a,{x:4.17,y:25.23,ap:20});Object.assign(b,{x:a.x+distance,y:a.y,hp:1000,weapon:held?'flamethrower':'pistol',alert:true,slots:['flamethrower','pistol'],pack:[{type:'weapon',kind:'flamethrower',rounds:4,condition:100},{type:'weapon',kind:'pistol',rounds:8,condition:90}],ammo:{flamethrower:4,pistol:8},ammoPouch:{flamethrower:12,pistol:24}});
  for(const [i,g]of s.units.slice(2).entries())Object.assign(g,{x:35,y:2+i,hp:1000,alert:false});
  s.phase='player';s.engaged=true;refresh(s,{forceFog:true});return {s,a,b};
}
function seedFor(chance,explodes=true,hit=true,accuracy=.7){for(let seed=1;seed<100000;seed++){const first=next(seed)/2**32,second=next(next(seed))/2**32;if((first<accuracy)===hit&&(second<chance)===explodes)return seed;}throw Error('No fixture seed');}
function shoot(f,zone='torso',burst=false,explode=true){const chance=Core.previewAttack(f.s,f.a,f.b,burst,zone).chance/100;f.s.seed=seedFor(tankExplosionChance(f.b,zone),explode,true,chance);assert.ok(Core.attack(f.s,f.a,f.b,burst,false,zone));return f.s.effect;}

test('tank eligibility is exactly conditional 25% torso and 90% held weapon; reserve fuel alone never qualifies',()=>{
  for(const held of [true,false]){const {b}=fixture({held});assert.equal(tankExplosionChance(b,'torso'),.25);assert.equal(tankExplosionChance(b,'weapon'),held?.9:0);for(const zone of ['head','legs'])assert.equal(tankExplosionChance(b,zone),0);b.ammo.flamethrower=0;assert.equal(tankExplosionChance(b,'torso'),0);b.ammo.flamethrower=4;b.tanksExploded=true;assert.equal(tankExplosionChance(b,'weapon'),0);}
  const {b}=fixture();b.weapon='rifle';b.pack=[];assert.equal(tankExplosionChance(b,'torso'),0);
});

test('preview never rolls; confirmed eligible hits consume one separate conditional roll',()=>{
  for(const held of [true,false])for(const zone of ['torso','weapon']){
    const f=fixture({held}),chance=tankExplosionChance(f.b,zone),before=encodeSave(f.s);Core.previewAttack(f.s,f.a,f.b,false,zone);assert.equal(encodeSave(f.s),before);
    const accuracy=Core.previewAttack(f.s,f.a,f.b,false,zone).chance/100;f.s.seed=chance?seedFor(chance,true,true,accuracy):1;const seed=f.s.seed;
    assert.ok(Core.attack(f.s,f.a,f.b,false,false,zone));assert.equal(f.s.seed,chance?next(next(seed)):next(seed));assert.equal(!!f.b.tanksExploded,!!chance);
  }
});

test('ineligible zones, empty or destroyed tanks, melee and misses never roll a tank chance',()=>{
  for(const kind of ['head','legs','empty','destroyed','melee','miss']){
    const f=fixture({distance:kind==='melee'?.75:8}),zone=['head','legs'].includes(kind)?kind:'torso';
    if(kind==='empty')f.b.ammo.flamethrower=0;if(kind==='destroyed')f.b.tanksExploded=true;if(kind==='melee'){f.a.weapon='knife';f.a.pack.push({type:'weapon',kind:'knife'});}
    const accuracy=Core.previewAttack(f.s,f.a,f.b,false,zone).chance/100;f.s.seed=kind==='miss'?seedFor(.25,true,false,accuracy):seedFor(.25,true,true,accuracy);const seed=f.s.seed;
    assert.ok(Core.attack(f.s,f.a,f.b,false,false,zone),kind);assert.equal(f.s.seed,next(seed),kind);assert.equal(f.s.effect.sequence[0].explosions.length,0,kind);
  }
});

test('conditional failures preserve a loaded tank and ordinary damage',()=>{
  for(const zone of ['torso','weapon']){const f=fixture();shoot(f,zone,false,false);assert.equal(f.b.tanksExploded,undefined);assert.ok(f.b.hp<1000&&f.b.hp>0);assert.equal(f.b.ammo.flamethrower,4);}
});

test('the actual intercepted character and impact zone determine the detonation',()=>{
  const f=fixture(),selected=f.s.units[2];Object.assign(selected,{x:18,y:25.23,hp:1000});refresh(f.s,{forceFog:true});
  f.s.seed=seedFor(.25,true,true,Core.previewAttack(f.s,f.a,selected).chance/100);assert.ok(Core.attack(f.s,f.a,selected));
  assert.deepEqual(f.s.effect.sequence[0].impact,{unitId:f.b.id,zone:'torso'});assert.equal(f.b.tanksExploded,true);assert.equal(selected.hp,1000);
});

test('fuel blasts ignore walls, kill the continuous central square, ignite the five-metre radius, and create dry fire',()=>{
  const f=fixture(),near=f.s.units[2],outer=f.s.units[3];Object.assign(near,{x:f.b.x+1.4,y:f.b.y+1.4,hp:1000});Object.assign(outer,{x:f.b.x+4,y:f.b.y,hp:1000});
  const s={...f.s,edges:{[`e:${Math.floor(f.b.x)+2}:25`]:'wall'}};f.s=s;s.map[25][13]='water';shoot(f);
  assert.equal(f.b.hp,0);assert.equal(near.hp,0);assert.equal(near.burnedRemains,true);assert.equal(outer.hp,1000);assert.equal(outer.burningTurns,3);
  assert.ok(s.fires.length>40);assert.ok(s.fires.every(p=>p.turns===3&&Math.hypot(p.x-f.b.x,p.y-f.b.y)<=5));assert.equal(s.fires.some(p=>p.x===13&&p.y===25),false);
});

test('detonation removes loaded and spare fuel, held/stowed weapons and slots while preserving unrelated loot',()=>{
  for(const held of [true,false]){const f=fixture({held});shoot(f);assert.equal(f.b.ammo.flamethrower,0);assert.equal(f.b.ammoPouch.flamethrower,0);assert.equal(f.b.pack.some(i=>i.kind==='flamethrower'),false);assert.equal(f.b.slots.includes('flamethrower'),false);assert.equal(f.b.weapon,held?'hands':'pistol');assert.equal(f.b.ammo.pistol,8);
    const body=f.s.interactables.find(o=>o.unitId===f.b.id);assert.ok(body.inventory.some(i=>i.kind==='pistol'));assert.ok(body.inventory.some(i=>i.id==='ammo:pistol'&&i.quantity===24));assert.equal(body.inventory.some(i=>i.kind==='flamethrower'||i.kind==='hands'),false);
  }
});

test('a central blast that kills the shooter interrupts the burst and charges only the emitted round',()=>{
  const f=fixture({distance:1.25}),ammo=f.a.ammo.assault,cost=Core.previewAttack(f.s,f.a,f.b,true,'weapon').cost;shoot(f,'weapon',true);assert.equal(f.a.hp,0);assert.equal(f.a.ammo.assault,ammo-1);assert.equal(f.s.effect.sequence.length,1);assert.equal(f.s.effect.cost,cost);assert.equal(f.a.pack.find(i=>i.kind==='assault').rounds,ammo-1);assert.equal(f.s.solo.status,'lost');
});

test('ordered bursts detonate once and do not roll again against destroyed remains',()=>{
  const f=fixture(),ammo=f.a.ammo.assault,ap=f.a.ap,cost=Core.previewAttack(f.s,f.a,f.b,true,'weapon').cost;shoot(f,'weapon',true);assert.equal(f.s.effect.sequence.length,3);assert.equal(f.a.ammo.assault,ammo-3);assert.equal(f.a.ap,ap-cost);assert.equal(f.s.effect.sequence.flatMap(e=>e.explosions).length,1);assert.equal(f.s.fireAnimations.filter(e=>e.kind==='tank').length,1);
});

test('a later burst impact can detonate after the first conditional roll fails',()=>{
  const f=fixture(),accuracy=Core.previewAttack(f.s,f.a,f.b,true,'torso').chance/100;let chosen;
  for(let seed=1;seed<100000;seed++){const a=next(seed),b=next(a),c=next(b),d=next(c);if(a/2**32<accuracy&&b/2**32>=.25&&c/2**32<accuracy&&d/2**32<.25){chosen=seed;break;}}
  assert.ok(chosen);f.s.seed=chosen;assert.ok(Core.attack(f.s,f.a,f.b,true,false,'torso'));
  assert.equal(f.s.effect.sequence[0].explosions.length,0);assert.equal(f.s.effect.sequence[1].explosions.length,1);assert.equal(f.s.effect.sequence[2].explosions.length,0);
  let expected=chosen;for(let i=0;i<5;i++)expected=next(expected);assert.equal(f.s.seed,expected);
});

test('a scenery-intercepted ray never rolls against the intended tank',()=>{
  const f=fixture();f.s={...f.s,obstacles:[{x0:8,x1:9,y0:24,y1:27,height:2,kind:'crate'}]};
  f.s.seed=seedFor(.9,true,true,Core.previewAttack(f.s,f.a,f.b,false,'weapon').chance/100);const seed=f.s.seed;
  assert.ok(Core.attack(f.s,f.a,f.b,false,false,'weapon'));assert.equal(f.s.seed,next(seed));assert.equal(f.b.hp,1000);assert.equal(f.b.tanksExploded,undefined);
});

test('an overlapping fuel blast never refreshes an existing mid-burn countdown',()=>{
  const f=fixture(),outer=f.s.units[2];Object.assign(outer,{x:f.b.x+4,y:f.b.y,hp:1000});Core.ignite(f.s,outer);
  // Isolated valid mid-burn fixture; the attack is resolved normally.
  outer.burningTurns=2;shoot(f);assert.equal(outer.burningTurns,2);assert.equal(f.s.fireAnimations.filter(e=>e.unitId===outer.id&&e.kind==='ignite').length,1);
});

test('a fuel casualty in a grenade impact list cannot detonate its intact tank after death',()=>{
  const f=fixture(),neighbor=f.s.units[2];Object.assign(neighbor,{x:f.b.x+1,y:f.b.y,weapon:'flamethrower',hp:1000,ammo:{flamethrower:4},ammoPouch:{flamethrower:12},pack:[{type:'weapon',kind:'flamethrower',rounds:4,condition:100}]});f.a.ammo.grenade=1;f.s.seed=1;
  assert.ok(Core.throwGrenade(f.s,f.a,f.b));assert.equal(f.s.effect.sequence[0].explosions.length,1);assert.equal(neighbor.hp,0);assert.equal(neighbor.tanksExploded,undefined);assert.equal(neighbor.ammo.flamethrower,4);
});

test('saving mid-fire restores destruction and burn state without replaying damage, movement or RNG',()=>{
  const f=fixture(),outer=f.s.units[2];Object.assign(outer,{x:f.b.x+4,y:f.b.y,hp:1000});shoot(f);const restored=decodeSave(encodeSave(f.s));
  assert.equal(encodeSave(restored),encodeSave(f.s));assert.equal(restored.effect,undefined);assert.equal(restored.fireAnimations,undefined);assert.equal(restored.seed,f.s.seed);assert.equal(restored.units[1].tanksExploded,true);
  for(let round=0;round<3;round++){assert.ok(Core.endTurn(restored));for(let i=0;restored.phase==='enemy'&&i<500;i++)tick(restored,.05);}
  assert.equal(restored.fires.length,0);assert.equal(restored.units[2].hp,0);assert.equal(restored.units[2].burnedRemains,true);
  const invalid=JSON.parse(encodeSave(f.s));invalid.units[1].ammo.flamethrower=1;assert.throws(()=>decodeSave(JSON.stringify(invalid)),/destroyed-tank/);
});
