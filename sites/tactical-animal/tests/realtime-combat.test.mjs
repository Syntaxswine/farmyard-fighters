import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Core,ANIMALS,createSoloGame,DEFAULT_BUILD,FIRST_REALTIME_MISSION,MISSIONS,geometry,hero,tick,encodeSave,decodeSave,lineClear,walkSegment,realtimeWeaponAim} from '../dist/solo-game.js';
import {windowReviewSource,WINDOW_REVIEW_ID} from '../dist/window-review-map.js';
import {shotSeconds,WEAPON_TIMING} from '../dist/realtime-combat.js';
import {loadTownTour} from '../dist/mount-dora-entry.js';
import {getTourWorld} from '../dist/mount-dora-activity.js';
import {readTourProgress} from '../dist/mount-dora-progress.js';
import {app} from './app-harness.mjs';

// Declared synthetic editor document; every command runs through the production adapter/Core.
function fixture({primary='assault',guards=[{x:28,y:25}],crate=false,door=false,edges}={}){
 const source=windowReviewSource();source.edges=edges??(door?{'e:20:25':'door-wood-closed'}:{});source.farmyardWindows.instances=[];
 source.guards=guards.map((g,i)=>({name:'Target '+i,species:'pig-foreman',weapon:'pistol',heading:0,...g}));
 if(crate)source.terrain[25][27]='crate';
 const s=Core.enableRealtime(createSoloGame({...DEFAULT_BUILD,primary,utility:'grenade',fireMode:'single'},1,WINDOW_REVIEW_ID,{authoredMap:source}));
 for(const u of s.units){u.hp=u.maxHp=10000;}hero(s).stats.firearms=hero(s).stats.dexterity=100;if(crate){s.units[1].stance='kneeling';Core.refresh(s);}
 return s;
}
function advance(s,seconds,input=null,step=.05){for(let t=0;t<seconds-1e-8;t+=step)tick(s,Math.min(step,seconds-t),input);}
function action(a,label){const b=a.el('overlay-actions').children.find(b=>b.textContent.startsWith(label));assert(b,label);return b;}

test('the visible aim follows an accepted order before discharge without spending a round',()=>{
 const s=fixture({primary:'hmg'}),u=hero(s),target=s.units[1],ammo=u.ammo.hmg;
 Core.setStance(s,u,'prone');assert.equal(realtimeWeaponAim(s,u),null);
 assert.ok(Core.attack(s,u,target,false,false,'legs',false,'aimed'));
 advance(s,.25);
 const saved=encodeSave(s),first=realtimeWeaponAim(s,u);
 assert.ok(first.progress>0&&first.progress<1);
 assert.deepEqual([first.x,first.y,first.h],[target.x,target.y,1.75*.25]);
 assert.equal(encodeSave(s),saved);
 assert.equal(u.ammo.hmg,ammo);
 advance(s,.50);
 assert.ok(realtimeWeaponAim(s,u).progress>first.progress);
 assert.equal(u.ammo.hmg,ammo);
 advance(s,.30);
 assert.equal(u.ammo.hmg,ammo-1);
 assert.equal(realtimeWeaponAim(s,u),null);
});

test('full inherited operations coexist with an initially unengaged real-time encounter',()=>{
 assert.equal(MISSIONS.length,3);
 const s=Core.enableRealtime(createSoloGame(DEFAULT_BUILD,1,FIRST_REALTIME_MISSION.id));
 assert.equal(s.phase,'explore');assert.equal(s.realtime.autoFire,false);assert.equal(Core.realtimeStatus(s).fireMode,'auto');assert.equal(s.units.filter(v=>v.team==='guard'&&v.hp>0).length,2);
 assert(s.interactables.some(o=>o.kind==='door'));assert(s.interactables.some(o=>o.kind==='chest'));assert(s.units.filter(v=>v.team==='guard'&&v.hp>0).every(v=>!v.alert));
});
test('the introductory encounter can be completed legally with automatic combat, collection and extraction',()=>{
 const s=Core.enableRealtime(createSoloGame({...DEFAULT_BUILD,animal:ANIMALS.find(a=>a.name==='Yakov').id},1947,FIRST_REALTIME_MISSION.id));
 Core.configureRealtime(s,{autoFire:true,aim:'aimed'});
 function go(x,y){assert(Core.move(s,hero(s),x,y));for(let i=0;i<2000&&s.queue.length;i++){tick(s,.05);assert.notEqual(s.solo.status,'lost');}assert(Math.hypot(hero(s).x-x,hero(s).y-y)<.1);}
 go(19,23);go(19,13.5);for(let i=0;i<200&&s.realtime.kills<1;i++)tick(s,.05);assert(s.realtime.kills>0);go(24,13.5);go(30,14);go(31,6);
 assert(Core.performInteraction(s,FIRST_REALTIME_MISSION.objective.id,'collect').ok);go(30,14);go(19,13.5);go(19,23);go(5,24);assert(Core.performInteraction(s,'extraction','extract').ok);assert.equal(s.solo.status,'extracted');assert(hero(s).hp>0);assert(hero(s).ammo.assault<30);
});
test('continuous movement spends neither AP nor stamina, including during contact',()=>{
 const s=fixture(),u=hero(s),ap=u.ap,stamina=u.stamina;advance(s,.5,{x:0,y:1});
 assert(Math.abs(u.y-32.2)<1e-7);assert.equal(u.ap,ap);assert.equal(u.stamina,stamina);assert.notEqual(s.phase,'enemy');assert.equal(Core.endTurn(s),false);
});
test('posture controls base speed and sneak halves every posture',()=>{
 const s=fixture(),u=hero(s);for(const [stance,speed]of [['standing',14.4],['kneeling',7.2],['prone',3.6]]){
 Core.setStance(s,u,stance);Core.setMovementMode(s,u,'run');assert.equal(Core.movementSpeed(u),speed);Core.setMovementMode(s,u,'sneak');assert.equal(Core.movementSpeed(u),speed/2);}
});
test('hold fire preserves ammunition even with an eligible opponent',()=>{
 const s=fixture(),u=hero(s);assert(Core.realtimeTarget(s));advance(s,1);assert.equal(u.ammo.assault,30);assert.equal(s.realtime.targetId,null);
});
test('nearest, weakest, threat and explicit pin choose among clear visible hostiles',()=>{
 const s=fixture({guards:[{x:28,y:25},{x:28,y:29},{x:31,y:21,weapon:'hmg'}]});s.units[2].hp=50;
 assert.equal(Core.realtimeTarget(s).id,1);Core.configureRealtime(s,{priority:'weakest'});assert.equal(Core.realtimeTarget(s).id,2);
 Core.configureRealtime(s,{priority:'threat'});assert.equal(Core.realtimeTarget(s).id,3);assert(Core.pinRealtimeTarget(s,1));assert.equal(Core.realtimeTarget(s).id,1);
});
test('a nearer alternative does not cause rapid target oscillation',()=>{
 const s=fixture({guards:[{x:28,y:25},{x:27,y:29}]});s.realtime.targetId=1;assert.equal(Core.realtimeTarget(s).id,1);s.units[2].x=24;Core.refresh(s);assert.equal(Core.realtimeTarget(s).id,2);
});
test('visible targets behind solid crate cover are rejected by the real projectile query',()=>{
 const s=fixture({crate:true}),u=hero(s),g=s.units[1];assert(Core.canSee(s,u,g));assert.equal(Core.previewAttack(s,u,g).ok,false);assert.match(Core.previewAttack(s,u,g).reason,/cover/);
 assert.equal(Core.realtimeTarget(s),null);Core.configureRealtime(s,{autoFire:true});advance(s,1);assert.equal(u.ammo.assault,30);
});
test('real time cannot acquire invisible or out-of-range targets',()=>{
 const s=fixture(),u=hero(s),g=s.units[1];g.x=50;Core.refresh(s);assert.equal(Core.realtimeTarget(s),null);g.x=28;u.heading=180;Core.refresh(s);assert.equal(Core.realtimeTarget(s),null);
});
test('aim adds proportional acquisition and shot intervals without per-shot selection',()=>{
 for(const aim of ['hip','aimed','full']){
  const s=fixture(),u=hero(s),seconds=shotSeconds(u.weapon,aim);Core.configureRealtime(s,{autoFire:true,aim});advance(s,seconds-.05);assert.equal(u.ammo.assault,30,aim+' first delay');advance(s,.05);assert.equal(u.ammo.assault,29,aim+' first shot');advance(s,seconds);assert.equal(u.ammo.assault,28,aim+' next shot');
 }
});
test('automatic guns fire singles, three-round bursts and full auto at the selected cadence',()=>{
 for(const primary of ['assault','smg','hmg']){
  for(const [fireMode,rounds] of [['single',1],['burst',3]]){
   const s=fixture({primary}),u=hero(s),loaded=u.ammo[primary],interval=shotSeconds(primary,'hip',fireMode);
   assert(Core.configureRealtime(s,{autoFire:true,fireMode}));
   advance(s,interval-.01);assert.equal(u.ammo[primary],loaded);
   advance(s,.01);assert.equal(u.ammo[primary],loaded-rounds);
   assert.equal(s.effect.sequence.filter(event=>event.shooter===u.id).length,rounds);
  }
  for(const aim of ['hip','aimed','full']){
   const interval=shotSeconds(primary,aim,'auto');
   assert(interval<shotSeconds(primary,aim,'single'));
   for(const step of [.05,.017]){
    const s=fixture({primary}),u=hero(s),loaded=u.ammo[primary];
    assert(Core.configureRealtime(s,{autoFire:true,fireMode:'auto',aim}));
    advance(s,interval*6+.002,null,step);
    assert.equal(u.ammo[primary],loaded-6,primary+' '+aim+' '+step);
    const shot=s.effect.sequence.findLast(event=>event.shooter===u.id);
    assert(shot.fullAuto);assert.equal(shot.shots,1);
   }
  }
 }
});

test('full-auto misses pass on both sides of the target and stop at cover or ground',()=>{
 const edges=Object.fromEntries(Array.from({length:11},(_,i)=>['e:29:'+(20+i),'wall-brick']));
 const s=fixture({edges,guards:[{x:28,y:25,heading:180}]}),u=hero(s),guard=s.units[1];
 u.stats.firearms=u.stats.dexterity=1;
 assert(Core.configureRealtime(s,{autoFire:true,fireMode:'auto'}));
 const shots=new Set();
 for(let frame=0;frame<54;frame++){
  tick(s,.02);
  for(const event of s.effect?.sequence??[])if(event.shooter===u.id)shots.add(event);
 }
 const misses=[...shots].filter(event=>event.fullAuto&&!event.hit&&event.traceEnd);
 const wall=geometry(s).find(box=>box.kind==='wall');
 assert(misses.some(event=>event.traceEnd.y<guard.y-.25));
 assert(misses.some(event=>event.traceEnd.y>guard.y+.25));
 assert(misses.some(event=>event.missImpact&&Math.abs(event.traceEnd.x-wall.x0)<1e-6));
 assert(misses.some(event=>event.missImpact&&event.traceEnd.h===0));
 assert.equal(guard.hp,guard.maxHp);
});

test('a held trigger fires repeatedly, a tap fires once, and a saved game never restores a hold',()=>{
 const s=fixture(),u=hero(s),g=s.units[1];
 assert(Core.pressRealtimeTrigger(s,u,g));
 advance(s,.57);assert.equal(u.ammo.assault,26);assert(Core.realtimeStatus(s).triggerHeld);
 const resumed=decodeSave(encodeSave(s));
 assert(!Core.realtimeStatus(resumed).triggerHeld);
 advance(resumed,.6);assert.equal(hero(resumed).ammo.assault,26);
 assert(Core.releaseRealtimeTrigger(s,true));advance(s,.6);assert.equal(u.ammo.assault,26);
 assert(Core.pressRealtimeTrigger(s,u,g));advance(s,.05);assert(Core.releaseRealtimeTrigger(s,true));
 advance(s,.6);assert.equal(u.ammo.assault,25);
 assert(Core.pressRealtimeTrigger(s,u,g));assert(Core.releaseRealtimeTrigger(s));advance(s,.6);assert.equal(u.ammo.assault,25);
});

test('old burst preferences and queued attacks load, and a sidearm keeps the automatic preference for later',()=>{
 const s=fixture(),u=hero(s);
 assert(Core.attack(s,u,s.units[1],true));advance(s,.4);assert.equal(u.ammo.assault,30);
 const old=JSON.parse(encodeSave(s));delete old.realtime.fireMode;old.realtime.burst=true;
 const manual=old.realtime.actors[u.id].manual;delete manual.fireMode;manual.burst=true;
 const restored=decodeSave(JSON.stringify(old)),player=hero(restored);
 assert.equal(Core.realtimeStatus(restored).fireMode,'burst');
 advance(restored,.35);assert.equal(player.ammo.assault,27);
 assert(Core.configureRealtime(restored,{fireMode:'auto'}));
 assert(Core.equip(restored,player,'pistol'));
 assert.equal(Core.realtimeStatus(restored).fireMode,'single');
 assert.equal(Core.configureRealtime(restored,{fireMode:'auto'}),false);
 assert.equal(Core.pressRealtimeTrigger(restored,player,restored.units[1]),false);
 assert(Core.equip(restored,player,'assault'));
 assert.equal(Core.realtimeStatus(decodeSave(encodeSave(restored))).fireMode,'auto');
});

test('three-round point bursts use the two remaining rounds before an ordinary timed reload',()=>{
 const s=fixture(),u=hero(s),point={x:u.x+4,y:u.y,h:1,ground:true};
 u.ammo.assault=2;
 assert.equal(Core.previewPointAttack(s,u,point,true).rounds,2);
 assert(Core.attack(s,u,point,true));advance(s,.75);assert.equal(u.ammo.assault,0);
 assert.equal(s.effect.sequence.filter(event=>event.shooter===u.id).length,2);
 advance(s,.05);assert(Core.realtimeStatus(s).reloading);
});

test('frame partitions preserve shot count and the simulation does not catch up unlimited wall time',()=>{
 const a=fixture(),b=fixture();Core.configureRealtime(a,{autoFire:true});Core.configureRealtime(b,{autoFire:true});advance(a,1,null,.02);advance(b,1,null,.05);assert.equal(hero(a).ammo.assault,hero(b).ammo.assault);
 const elapsed=a.elapsed;tick(a,30);assert(Math.abs(a.elapsed-elapsed-1)<1e-6);
});
test('changing aim cannot bypass recovery from a committed shot',()=>{
 const s=fixture(),u=hero(s);Core.configureRealtime(s,{autoFire:true});advance(s,.5);assert.equal(u.ammo.assault,29);
 Core.configureRealtime(s,{aim:'full'});Core.configureRealtime(s,{aim:'hip'});advance(s,.45);assert.equal(u.ammo.assault,29);
});
test('manual firearm shots are acquired over time and use the production impact and ammo path',()=>{
 const s=fixture(),u=hero(s),g=s.units[1];assert(Core.attack(s,u,g,false,false,'torso',false,'full'));assert.equal(u.ammo.assault,30);advance(s,.95);assert.equal(u.ammo.assault,30);advance(s,.05);assert.equal(u.ammo.assault,29);assert(g.hp<10000);assert(s.effect.sequence.some(e=>e.shooter===u.id));
});
test('empty magazines start real reloads, permit movement and consume reserve only on completion',()=>{
 const s=fixture(),u=hero(s);u.ammo.assault=0;const reserve=u.ammoPouch.assault;tick(s,.05);assert(Core.realtimeStatus(s).reloading);assert.equal(u.ammo.assault,0);assert.equal(u.ammoPouch.assault,reserve);
 const y=u.y;advance(s,.5,{x:0,y:1});assert(u.y>y);assert.equal(u.ammo.assault,0);advance(s,WEAPON_TIMING.assault.reload-.5);assert.equal(u.ammo.assault,30);assert.equal(u.ammoPouch.assault,reserve-30);
});
test('an early reload transfers only missing rounds and a weapon swap cancels without wasting reserve',()=>{
 const s=fixture(),u=hero(s);u.ammo.assault=20;const reserve=u.ammoPouch.assault;assert(Core.reload(s,u));advance(s,1);assert(Core.equip(s,u,'pistol'));assert.equal(u.ammoPouch.assault,reserve);assert.equal(u.ammo.assault,20);
 advance(s,.6);Core.equip(s,u,'assault');assert(Core.reload(s,u));advance(s,2.4);assert.equal(u.ammo.assault,30);assert.equal(u.ammoPouch.assault,reserve-10);
});
test('no reserve means no automatic refill, and explosives never fire automatically',()=>{
 const s=fixture(),u=hero(s);u.ammo.assault=0;u.ammoPouch.assault=0;Core.configureRealtime(s,{autoFire:true});advance(s,3);assert.equal(u.ammo.assault,0);assert.equal(Core.realtimeStatus(s).reloading,false);
 const r=fixture({primary:'rpg'});Core.configureRealtime(r,{autoFire:true});advance(r,3);assert.equal(hero(r).ammo.rpg,1);
});
test('continuous guards fire and reload on the same clock without stopping player movement',()=>{
 const s=fixture(),u=hero(s),g=s.units[1];g.heading=180;g.ammo.pistol=1;Core.refresh(s);advance(s,.7);assert.equal(g.ammo.pistol,0);assert(s.effect.sequence.some(e=>e.shooter===g.id));advance(s,.1);assert(s.realtime.actors[g.id].reload);advance(s,1.85);assert(g.ammo.pistol>0);assert.notEqual(s.phase,'enemy');
});
test('save and resume retain reload, aim, target preference, resources and acquired skill XP',()=>{
 const s=fixture(),u=hero(s);u.ammo.assault=12;Core.configureRealtime(s,{autoFire:true,aim:'full',priority:'weakest'});Core.reload(s,u);advance(s,.7);
 const copy=decodeSave(encodeSave(s));assert.equal(copy.realtime.aim,'full');assert.equal(copy.realtime.priority,'weakest');assert(Math.abs(copy.realtime.actors[0].reload.remaining-1.7)<1e-7);assert.equal(hero(copy).ammo.assault,12);advance(copy,1.7);assert.equal(hero(copy).ammo.assault,30);
});
test('unsupported real-time save timers and target data are rejected',()=>{
 const s=fixture(),raw=JSON.parse(encodeSave(s));raw.realtime.actors[0].cooldown=-1;assert.throws(()=>decodeSave(JSON.stringify(raw)),/real-time/);
 raw.realtime.actors[0].cooldown=0;raw.realtime.pinnedId=999;assert.throws(()=>decodeSave(JSON.stringify(raw)),/real-time/);
});
test('opening editor doors changes the same movement/sight collision and persists in real time',()=>{
 const s=fixture({guards:[],door:true}),u=hero(s),door=s.interactables.find(o=>o.kind==='door');assert(!walkSegment(s,u,{x:21,y:25},u.id));assert(!lineClear(s,u,{x:21,y:25}));
 assert(Core.performInteraction(s,door.id,'open').ok);assert(walkSegment(s,u,{x:21,y:25},u.id));assert(lineClear(s,u,{x:21,y:25}));const copy=decodeSave(encodeSave(s));assert(copy.interactables.find(o=>o.id===door.id).open);
});
test('grenades and flamethrowers keep production resources, effects and timed recovery',()=>{
 const s=fixture(),u=hero(s);assert(Core.throwGrenade(s,u,{x:20,y:17}));assert.equal(u.ammo.grenade,2);assert(s.effect.sequence.some(e=>e.weapon==='grenade'));assert.equal(Core.throwGrenade(s,u,{x:20,y:17}),false);
 const f=fixture({primary:'flamethrower'}),v=hero(f);assert(Core.fireFlame(f,v,270));assert.equal(v.ammo.flamethrower,3);assert(f.effect.sequence[0].flame);assert.equal(Core.fireFlame(f,v,270),false);
});
test('Fire at Will enables the flamethrower and uses its real cone, fuel, ash and skill credit',()=>{
 const s=fixture({primary:'flamethrower'}),u=hero(s),g=s.units[1],a=app({realTime:true,initialState:s});
 assert.equal(a.el('end-turn').disabled,false);a.el('end-turn').click();assert(s.realtime.autoFire);
 a.advance(1);
 assert.equal(u.ammo.flamethrower,3);assert.equal(g.hp,0);assert(g.burnedRemains);assert.equal(s.realtime.earned.heavyWeapons,1);
 assert(s.effect.sequence.some(e=>e.weapon==='flamethrower'&&e.flame&&e.impacts.some(v=>v.id===g.id&&v.dead)));
});
test('automatic flame uses cone exposure above cover instead of a bullet torso ray',()=>{
 const s=fixture({primary:'flamethrower',crate:true}),u=hero(s),g=s.units[1];
 assert(Core.previewFlame(s,u,Core.headingTo(u,g)).contacts.some(v=>v.id===g.id));assert.equal(Core.realtimeTarget(s)?.id,g.id);
 Core.configureRealtime(s,{autoFire:true});advance(s,.05);assert.equal(u.ammo.flamethrower,3);assert.equal(g.hp,0);
});
test('automatic flame respects glass, walls, range, hold fire and manual area-aim suspension',()=>{
 const source=windowReviewSource();source.guards=source.guards.slice(0,1);
 const glass=Core.enableRealtime(createSoloGame({...DEFAULT_BUILD,primary:'flamethrower'},1,WINDOW_REVIEW_ID,{authoredMap:source}));
 assert(Core.canSee(glass,hero(glass),glass.units[1]));assert.equal(Core.realtimeTarget(glass),null);Core.configureRealtime(glass,{autoFire:true});advance(glass,2);assert.equal(hero(glass).ammo.flamethrower,4);
 const wall=fixture({primary:'flamethrower',door:true});Core.configureRealtime(wall,{autoFire:true});advance(wall,2);assert.equal(hero(wall).ammo.flamethrower,4);
 const s=fixture({primary:'flamethrower'}),u=hero(s);advance(s,2);assert.equal(u.ammo.flamethrower,4);
 Core.configureRealtime(s,{autoFire:true});s.realtime.suspended=true;advance(s,2);assert.equal(u.ammo.flamethrower,4);
 s.units[1].x=40;Core.refresh(s);s.realtime.suspended=false;advance(s,2);assert.equal(u.ammo.flamethrower,4);
});
test('flame fires immediately then at a fixed three-second interval, without aim or retarget modifiers',()=>{
 for(const aim of ['hip','aimed','full']){
  const s=fixture({primary:'flamethrower',guards:[{x:28,y:25},{x:12,y:25}]}),u=hero(s);Core.configureRealtime(s,{autoFire:true,aim});advance(s,.05);assert.equal(u.ammo.flamethrower,3);
  Core.turnTo(s,u,180);Core.configureRealtime(s,{aim:aim==='full'?'hip':'full'});advance(s,2.95);assert.equal(u.ammo.flamethrower,3);advance(s,.05);assert.equal(u.ammo.flamethrower,2);
 }
});
test('automatic flame preserves movement routes and the disabled aim control retains firearm settings',()=>{
 const s=fixture({primary:'flamethrower',guards:[{x:28,y:25},{x:60,y:60}]}),u=hero(s);Core.setStance(s,u,'prone');Core.configureRealtime(s,{autoFire:true});assert(Core.move(s,u,36,25));advance(s,.05);assert.equal(u.ammo.flamethrower,3);assert(s.queue.length);const before=s.solo.distance;advance(s,.3);assert(s.solo.distance>before);
 const state=fixture({primary:'flamethrower'});Core.configureRealtime(state,{aim:'full'});const a=app({realTime:true,initialState:state});assert(a.el('realtime-aim').disabled);assert.equal(a.el('realtime-aim-label').textContent,'AREA FIRE');a.key('q');assert.equal(state.realtime.aim,'full');Core.equip(state,hero(state),'pistol');a.advance(3);assert.equal(a.el('realtime-aim').disabled,false);assert.equal(a.el('realtime-aim-label').textContent,'FULL AIM');
});
test('the live application keeps walking when automatic flame kills the last guard',()=>{
 const s=fixture({primary:'flamethrower'}),a=app({realTime:true,initialState:s});a.el('end-turn').click();a.view.options.onPick({x:36,y:25});assert(s.queue.length);a.advance(1);
 assert.equal(s.phase,'won');assert(s.queue.length);const distance=s.solo.distance;a.advance(3);assert(s.solo.distance>distance);
});
test('automatic flame resumes after a saved fuel reload and stops when reserve is exhausted',()=>{
 const s=fixture({primary:'flamethrower'}),u=hero(s);u.ammo.flamethrower=0;const reserve=u.ammoPouch.flamethrower;Core.configureRealtime(s,{autoFire:true});tick(s,.05);advance(s,.7);
 const copy=decodeSave(encodeSave(s));assert(copy.realtime.actors[0].reload);advance(copy,2.8);assert.equal(hero(copy).ammo.flamethrower,4);assert.equal(hero(copy).ammoPouch.flamethrower,reserve-4);advance(copy,1.9);assert.equal(hero(copy).ammo.flamethrower,3);assert.equal(copy.units[1].hp,0);
 const empty=fixture({primary:'flamethrower'});hero(empty).ammo.flamethrower=hero(empty).ammoPouch.flamethrower=0;Core.configureRealtime(empty,{autoFire:true});advance(empty,5);assert.equal(hero(empty).ammo.flamethrower,0);assert.equal(Core.realtimeStatus(empty).reloading,false);
});
test('automatic flame retains the production tank explosion and burning-ground effects',()=>{
 const s=fixture({primary:'flamethrower',guards:[{x:28,y:25,weapon:'flamethrower'}]});Core.configureRealtime(s,{autoFire:true});advance(s,.05);
 assert.equal(hero(s).ammo.flamethrower,3);assert(s.units[1].tanksExploded);assert(s.fires.length);assert(s.effect.sequence.some(e=>e.explosions.some(v=>v.kind==='tank')));
});
test('burning follows the inherited three panic stages on real-time seconds, including resume',()=>{
 const s=fixture(),u=hero(s);assert(Core.ignite(s,u));advance(s,3);assert.equal(u.burningTurns,2);const copy=decodeSave(encodeSave(s));advance(copy,6);assert.equal(hero(copy).hp,0);assert.equal(copy.solo.status,'lost');assert(hero(copy).burnedRemains);
});
test('sneak opening damage is larger, but toggling sneak against an aware target grants no bonus',()=>{
 const quiet=fixture(),loud=fixture();for(const s of [quiet,loud])Core.setMovementMode(s,hero(s),'sneak');loud.units[1].alert=true;
 for(const s of [quiet,loud]){Core.configureRealtime(s,{autoFire:true});advance(s,.5);}
 assert(quiet.units[1].hp<loud.units[1].hp);assert.equal(10000-quiet.units[1].hp,37);assert.equal(10000-loud.units[1].hp,24);
});
test('real kills award weapon XP once, improve skill, and survive resuming the operation',()=>{
 const s=fixture({guards:[{x:28,y:25},{x:29,y:28},{x:29,y:22}]}),u=hero(s);u.stats.firearms=50;const before=u.stats.firearms;Core.configureRealtime(s,{autoFire:true});for(const g of s.units.filter(v=>v.team==='guard'))g.hp=1;
 for(let i=0;i<300&&s.realtime.kills<3;i++)tick(s,.05);
 assert.equal(s.realtime.kills,3);assert.equal(u.stats.firearms,before+1);advance(s,1);assert.equal(s.realtime.kills,3);assert.equal(decodeSave(encodeSave(s)).realtime.kills,3);
});
test('real application controls toggle fire, persist aim, pause with menus/background and isolate Commando saves',()=>{
 const turnBasedKey='tactical-animal-operation-v2',realtimeKey='farmyard-realtime:tactical-animal-operation-v2';
 const s=fixture(),a=app({realTime:true,initialState:s,initialStorage:[[turnBasedKey,'turn-based'],[realtimeKey,'real-time']]});
 a.el('end-turn').click();assert(s.realtime.autoFire);a.el('realtime-aim').click();assert.equal(s.realtime.aim,'aimed');a.key(' ');assert.equal(s.realtime.autoFire,false);
 a.el('menu').click();const elapsed=s.elapsed;a.advance(20);assert.equal(s.elapsed,elapsed);action(a,'Continue operation').click();a.visibility(true);a.advance(20);assert.equal(s.elapsed,elapsed);a.visibility(false);a.advance(2);assert(s.elapsed>elapsed);
 assert.equal(a.saved.get(turnBasedKey),'turn-based');assert.equal(a.saved.get(realtimeKey),'real-time');assert(a.saved.has('farmyard-fighters:tactical-animal-operation-v2'));
});
test('loadout default and the dedicated Weapons menu keep preparation and operation modes separate',()=>{
 const a=app({realTime:true,autoDeploy:false}),picker=a.el('loadout-fire-mode');
 assert.equal(picker.value,'auto');assert.equal(a.el('loadout-fire-mode-picker').hidden,false);
 picker.value='burst';picker.fire('change');
 const prefs=JSON.parse(a.saved.get('farmyard-fighters:tactical-animal-first-shift-v1'));
 assert.equal(prefs.builds[FIRST_REALTIME_MISSION.id].fireMode,'burst');
 a.el('deploy').click();
 assert.equal(Core.realtimeStatus(a.s).fireMode,'burst');assert.equal(a.s.realtime.autoFire,false);
 a.el('weapons').click();assert.match(a.el('overlay-content').innerHTML,/<h2>Weapons\.<\/h2>/);
 const elapsed=a.s.elapsed;a.advance(10);assert.equal(a.s.elapsed,elapsed);
 assert.equal(action(a,'3-round burst').textContent,'3-round burst · selected');
 action(a,'Single shot').click();
 assert.equal(Core.realtimeStatus(a.s).fireMode,'single');
 action(a,'Return to operation').click();
 a.el('menu').click();action(a,'Choose operation, animal & loadout').click();
 assert.equal(picker.value,'burst');
 picker.value='auto';picker.fire('change');
 a.el('resume').click();assert.equal(Core.realtimeStatus(a.s).fireMode,'single');
 a.el('menu').click();action(a,'Choose operation, animal & loadout').click();
 assert.equal(picker.value,'auto');
});
test('a corrupt career cannot prevent the actual operation from saving',()=>{
 const a=app({realTime:true,initialState:fixture(),initialStorage:[['farmyard-fighters:careers-v1','invalid']]});
 assert(a.saved.has('farmyard-fighters:tactical-animal-operation-v2'));assert.match(a.el('toast').textContent,/character progression/);
});
test('Mount Dora keeps the real-time scheduler, resources and reload checkpoint in its streamed save',async()=>{
 const projectURL=new URL('../../../maps/mount-dora/project.json',import.meta.url),fetcher=async url=>new Response(fs.readFileSync(url));
 const s=Core.enableRealtime(await loadTownTour({build:{...DEFAULT_BUILD,utility:'grenade'},fetcher,projectURL}));let copy;
 try{hero(s).ammo.assault=7;Core.reload(s,hero(s));advance(s,.6);copy=await loadTownTour({progress:readTourProgress(encodeSave(s)),fetcher,projectURL});assert.equal(hero(copy).ammo.assault,7);assert(copy.realtime.actors[0].reload);advance(copy,1.8);assert.equal(hero(copy).ammo.assault,30);}finally{getTourWorld(s).dispose();if(copy)getTourWorld(copy).dispose();}
});
