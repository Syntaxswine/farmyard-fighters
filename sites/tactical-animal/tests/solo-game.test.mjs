import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ANIMALS,PRIMARY,DEFAULT_BUILD,Core,createSoloGame,hero,travel,movementRate,navigationPath,walkSegment,freePoint,refresh,interaction,interact,dressing,encodeSave,decodeSave,tick,BRIEF} from '../dist/solo-game.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function emptyCombat(){const s=createSoloGame();for(const g of s.units.slice(1)){g.x=36;g.y=27;g.alert=true;}s.engaged=true;s.phase='player';hero(s).x=4;hero(s).y=25;hero(s).ap=12;return s;}
test('every animal can use every primary weapon as the only player character',()=>{for(const a of ANIMALS)for(const primary of PRIMARY){const s=createSoloGame({...DEFAULT_BUILD,animal:a.id,primary});assert.equal(s.units.filter(u=>u.team==='squad').length,1);assert.equal(hero(s).species,a.species);assert.equal(hero(s).weapon,primary);assert.equal(hero(s).ammo[primary],Core.WEAPONS[primary].mag);}});
test('movement keeps fractional coordinates and charges Euclidean distance, including diagonals',()=>{const s=emptyCombat(),u=hero(s),d=Math.hypot(.37,.19);close(travel(s,u,.37,.19),d);close(u.x,4.37);close(u.y,25.19);close(u.ap,12-d*2);close(s.solo.apDistance,d*2);});
test('equal distances in cardinal and diagonal directions spend equal AP',()=>{const a=emptyCombat(),b=emptyCombat();travel(a,hero(a),1,0);travel(b,hero(b),Math.SQRT1_2,Math.SQRT1_2);close(hero(a).ap,hero(b).ap);});
test('an AP budget stops movement precisely in the middle of a former cell',()=>{const s=emptyCombat(),u=hero(s);u.ap=.73;travel(s,u,3,0);close(u.x,4.365);close(u.ap,0);assert.equal(travel(s,u,1,0),0);});
test('running, sneaking, and posture change AP per metre',()=>{const s=emptyCombat(),u=hero(s);assert.equal(movementRate(u),2);u.running=true;assert.equal(movementRate(u),1);u.running=false;u.sneaking=true;assert.equal(movementRate(u),3);u.stance='kneeling';assert.equal(movementRate(u),6);u.stance='prone';assert.equal(movementRate(u),12);});
test('stance and movement switches are free at zero AP and preserve stamina and position',()=>{
  const s=emptyCombat(),u=hero(s);u.ap=0;const before={x:u.x,y:u.y,stamina:u.stamina,travelled:u.travelled};
  for(const stance of ['kneeling','prone','kneeling','standing']){assert.equal(Core.setStance(s,u,stance),true);assert.equal(u.stance,stance);close(u.ap,0);}
  for(const mode of ['run','walk','sneak','walk','run']){assert.equal(Core.setMovementMode(s,u,mode),true);assert.equal(Core.movementModeOf(u),mode);close(u.ap,0);}
  assert.deepEqual({x:u.x,y:u.y,stamina:u.stamina,travelled:u.travelled},before);
});
test('free switches still respect turn ownership and valid choices',()=>{
  const s=emptyCombat(),u=hero(s);s.phase='enemy';
  assert.equal(Core.setStance(s,u,'prone'),false);assert.equal(Core.setMovementMode(s,u,'run'),false);assert.equal(u.stance,'standing');assert.equal(u.running,false);
  s.phase='player';assert.equal(Core.setStance(s,u,'flying'),false);assert.equal(Core.setMovementMode(s,u,'teleport'),false);
});
test('opponent inspection orders clear visible contacts by distance without changing the animal',()=>{
  const s=emptyCombat(),u=hero(s);u.heading=0;
  for(const [i,g] of s.units.slice(1).entries()){g.x=12-i*2;g.y=25;}
  refresh(s);const before=encodeSave(s);
  assert.deepEqual(Core.visibleOpponents(s).map(g=>g.id),[3,2,1]);assert.equal(encodeSave(s),before);
  s.detected.delete(3);s.units[2].hp=0;
  assert.deepEqual(Core.visibleOpponents(s).map(g=>g.id),[1]);
  s.units[1].x=30;s.units[1].y=5; // A stale detected ID must not reveal a contact through a wall.
  assert.deepEqual(Core.visibleOpponents(s),[]);
});
test('opponent inspection favors a clear silhouette over a similarly close contact behind cover',()=>{
  const s=emptyCombat(),u=hero(s);u.x=14;u.y=6;u.heading=0;
  s.units[1].x=19;s.units[1].y=6;s.units[2].x=19;s.units[2].y=4;s.units[3].hp=0;refresh(s);
  assert.deepEqual(Core.visibleOpponents(s).map(g=>g.id),[2,1]);
});
test('large movement requests cannot tunnel through a wall or crate',()=>{const s=emptyCombat(),u=hero(s);u.x=19;u.y=10;u.ap=100;travel(s,u,6,0);assert.ok(u.x<20.5-.23);assert.ok(freePoint(s,u,u.id));const t=emptyCombat(),v=hero(t);v.x=4;v.y=17;v.ap=100;travel(t,v,8,0);assert.ok(v.x<5.52-.23);});
test('blocked input spends no AP or stamina',()=>{const s=emptyCombat(),u=hero(s);u.x=20.18;u.y=10;const ap=u.ap,stamina=u.stamina;assert.equal(travel(s,u,1,0),0);close(u.ap,ap);close(u.stamina,stamina);});
test('navigation smooths a route around walls and preserves the exact floating destination',()=>{const s=createSoloGame(),u=hero(s);const path=navigationPath(s,u,31.2,6.1);assert.ok(path?.length);let a=u;for(const b of path){assert.ok(walkSegment(s,a,b,u.id));a=b;}close(a.x,31.2);close(a.y,6.1);});
test('exploration movement is free; exposure opens turn-based combat',()=>{const s=createSoloGame(),u=hero(s),ap=u.ap;travel(s,u,.25,0);close(u.ap,ap);u.x=14;u.y=12;u.heading=0;const g=s.units[1];g.heading=180;refresh(s);assert.equal(s.phase,'player');assert.ok(s.detected.has(g.id));});
test('shots spend finite ammunition and AP; reloading spends reserve',()=>{const s=emptyCombat(),u=hero(s),g=s.units[1];u.x=4;u.y=25;g.x=9;g.y=25;g.hp=500;g.heading=180;refresh(s);const before=u.ap;assert.equal(Core.attack(s,u,g),true);close(u.ap,before-Core.WEAPONS.assault.cost);assert.equal(u.ammo.assault,29);assert.equal(Core.reload(s,u),true);assert.equal(u.ammo.assault,30);assert.equal(u.ammoPouch.assault,89);});
test('field dressing has finite charges, heals within max HP, and respects AP',()=>{const s=emptyCombat(),u=hero(s);u.hp=u.maxHp-10;assert.equal(dressing(s),true);assert.equal(u.hp,u.maxHp);assert.equal(s.solo.dressings,1);close(u.ap,9);assert.equal(dressing(s),false);});
test('ledger then extraction requires proximity to both, with no remote mission completion',()=>{const s=createSoloGame(),u=hero(s);assert.equal(interact(s),false);u.x=BRIEF.objective.x+.21;u.y=BRIEF.objective.y;assert.equal(interact(s),true);assert.equal(s.solo.ledger,true);assert.equal(interact(s),false);u.x=BRIEF.extraction.x;u.y=BRIEF.extraction.y;assert.equal(interact(s),true);assert.equal(s.solo.status,'extracted');});
test('saves preserve exact positions, fractional AP, and detected sets',()=>{const s=emptyCombat(),u=hero(s);travel(s,u,.37,.19);const restored=decodeSave(encodeSave(s));close(hero(restored).x,u.x);close(hero(restored).ap,u.ap);assert.ok(restored.seen instanceof Set);assert.equal(restored.solo.version,2);});
test('combat input is ignored during guard turns and guard turns finish',()=>{const s=emptyCombat(),u=hero(s);for(const g of s.units.slice(1))g.alert=false;Core.endTurn(s);const x=u.x;let i=0;while(s.phase==='enemy'&&i++<120){tick(s,.05,{x:1,y:0});close(u.x,x);}assert.notEqual(s.phase,'enemy');});
test('a legal controller completes contact, combat, ledger recovery, and extraction',()=>{
  const s=createSoloGame();let frames=0;
  while(s.solo.status==='active'&&frames++<4000){
    const u=hero(s),action=interaction(s)?.ok;
    if(action){interact(s);continue;}
    if(s.phase==='enemy'){tick(s,.05);continue;}
    if(s.phase==='player'){
      if(u.hp<u.maxHp-30&&s.solo.dressings&&u.ap>=3){dressing(s);continue;}
      const target=[...s.detected].map(id=>s.units.find(v=>v.id===id)).find(g=>Core.previewAttack(s,u,g,true).ok);
      if(target){Core.attack(s,u,target,true);continue;}
      if(u.ammo[u.weapon]<3&&u.ap>=3&&Core.reload(s,u))continue;
      if(u.ap<2){Core.endTurn(s);continue;}
    }
    const goal=s.solo.ledger?BRIEF.extraction:BRIEF.objective;
    if(!s.queue.length&&!Core.move(s,u,goal.x,goal.y)){if(s.phase==='player')Core.endTurn(s);else break;}
    const x=u.x,y=u.y;tick(s,.05);
    if(s.phase==='player'&&x===u.x&&y===u.y&&!s.queue.length)Core.endTurn(s);
  }
  assert.equal(s.solo.status,'extracted');assert.ok(s.round>0);assert.ok(s.solo.distance>50);assert.ok(hero(s).hp>0);
});
