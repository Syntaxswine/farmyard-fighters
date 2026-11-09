import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {Core,createSoloGame,DEFAULT_BUILD,hero,encodeSave} from '../dist/solo-game.js';
import {FieldView} from '../dist/field-view.js';

function ready(primary='assault'){
  const state=createSoloGame({...DEFAULT_BUILD,primary:primary==='pistol'?'assault':primary}),unit=hero(state),target=state.units[1];unit.weapon=primary;
  for(const guard of state.units.slice(1)){guard.x=36;guard.y=27;guard.alert=true;}
  unit.x=4;unit.y=25;unit.ap=100;target.x=10;target.y=25;target.hp=1000;
  state.engaged=true;state.phase='player';state.seed=42;Core.refresh(state,{forceFog:true});
  return {state,unit,target};
}
const layer=()=>Object.assign(Object.create(FieldView.prototype),{scene:new T.Scene(),effects:[]});

test('each burst weapon emits one shot effect for every spent round, charging the attack AP only once',()=>{
  for(const weapon of ['assault','smg','hmg']){
    const {state,unit,target}=ready(weapon),preview=Core.previewAttack(state,unit,target,true),ammo=unit.ammo[weapon],ap=unit.ap;
    assert.equal(Core.attack(state,unit,target,true),true);
    assert.equal(state.effect.sequence.length,preview.rounds);assert.equal(preview.rounds,3);
    assert.equal(unit.ammo[weapon],ammo-3);assert.equal(unit.ap,ap-preview.cost);
    for(const [index,event] of state.effect.sequence.entries()){
      assert.equal(event.shot,index);assert.equal(event.shots,3);assert.equal(event.shooter,unit.id);assert.equal(event.target,target.id);assert.equal(event.weapon,weapon);
    }
  }
});

test('per-round effects preserve hit/miss rolls, damage, ammunition, and random state',()=>{
  const burst=ready(),single=ready();
  Core.attack(burst.state,burst.unit,burst.target,true,false,'head');
  const hits=[];for(let i=0;i<3;i++){Core.attack(single.state,single.unit,single.target,false,false,'head');hits.push(single.state.effect.sequence[0].hit);}
  assert.ok(hits.includes(true)&&hits.includes(false),'The fixture exercises both hits and misses');
  assert.deepEqual(burst.state.effect.sequence.map(event=>event.hit),hits);
  assert.equal(burst.target.hp,single.target.hp);assert.equal(burst.state.seed,single.state.seed);assert.equal(burst.unit.ammo.assault,single.unit.ammo.assault);
});

test('single fire and weapons without burst capability still produce just one shot',()=>{
  for(const [weapon,burst] of [['assault',false],['pistol',true],['rifle',true],['shotgun',true],['rpg',false],['flamethrower',false]]){
    const {state,unit,target}=ready(weapon);assert.equal(Core.attack(state,unit,target,burst),true);
    assert.equal(state.effect.sequence.length,1);assert.equal(state.effect.sequence[0].shot,0);assert.equal(state.effect.sequence[0].shots,1);
  }
});

test('insufficient ammunition or AP rejects the complete burst without emitting effects or spending resources',()=>{
  for(const reason of ['ammo','ap']){
    const {state,unit,target}=ready();if(reason==='ammo')unit.ammo.assault=2;else unit.ap=Core.previewAttack(state,unit,target,true).cost-1;
    const before=encodeSave(state);assert.equal(Core.attack(state,unit,target,true),false);assert.equal(encodeSave(state),before);
  }
});

test('the actual field renderer shows three separate timed tracer pulses and releases every effect',()=>{
  const {state,unit,target}=ready();Core.attack(state,unit,target,true);
  const view=layer();view.queueEffects(state.effect,1000);const schedule=[...view.effects],disposed=[];
  assert.equal(schedule.length,3);assert.equal(schedule[0].line.visible,true);assert.equal(schedule[1].line.visible,false);assert.equal(schedule[2].line.visible,false);
  for(const effect of schedule){effect.line.geometry.addEventListener('dispose',()=>disposed.push('geometry'));effect.line.material.addEventListener('dispose',()=>disposed.push('material'));}
  for(const effect of schedule){
    view.animateEffects(effect.at+1);
    assert.deepEqual(view.scene.children.filter(line=>line.visible),[effect.line]);
    assert.ok(effect.line.material.opacity>=0&&effect.line.material.opacity<=1);
    view.animateEffects(effect.at+effect.ttl+1);assert.equal(view.scene.children.filter(line=>line.visible).length,0);
  }
  assert.equal(view.effects.length,0);assert.equal(view.scene.children.length,0);
  assert.equal(disposed.filter(type=>type==='geometry').length,3);assert.equal(disposed.filter(type=>type==='material').length,3);
});

test('overlapping attacks retain later queued rounds without showing them early',()=>{
  const {state,unit,target}=ready();Core.attack(state,unit,target,true);
  const view=layer();view.queueEffects(state.effect,1000);view.queueEffects(state.effect,1200);
  const last=view.effects.at(-1);for(let now=1000;now<1460;now+=10)view.animateEffects(now);
  view.animateEffects(last.at-1);assert.equal(last.line.visible,false);assert.ok(view.effects.includes(last));
  view.animateEffects(last.at+1);assert.equal(last.line.visible,true);view.animateEffects(2000);assert.equal(view.scene.children.length,0);
});

test('a stalled frame cannot skip the remaining rounds or collapse them into one pulse',()=>{
  const {state,unit,target}=ready();Core.attack(state,unit,target,true);
  const view=layer();view.queueEffects(state.effect,1000);const rounds=[...view.effects];
  for(const [index,time] of [1000,2000,3000].entries()){
    view.animateEffects(time);assert.deepEqual(view.scene.children.filter(line=>line.visible),[rounds[index].line]);
  }
  view.animateEffects(4000);assert.equal(view.effects.length,0);
});

test('legacy single-shot effects and grenade arcs keep their existing duration and blast ring',()=>{
  const view=layer(),single={weapon:'assault',ax:4,ay:25,bx:10,by:25,hit:true};view.queueEffects(single,1000);
  assert.equal(view.effects[0].ttl,240);view.animateEffects(1240);assert.equal(view.effects.length,0);
  view.queueEffects({sequence:[{...single,weapon:'grenade',blast:5}]},2000);
  assert.equal(view.effects.length,2);assert.equal(view.effects[0].line.geometry.attributes.position.count,33);
  assert.ok(view.effects.every(effect=>effect.at===2000&&effect.ttl===700));view.animateEffects(2700);assert.equal(view.effects.length,0);
});

test('a slow frame plays each burst report once while independent shooters can fire together',()=>{
  const view=layer(),calls=[];
  view.state=ready().state;view.weaponAudio={setCamera(){},play(id){calls.push(id);}};
  const event={weapon:'assault',shooter:0,ax:4,ay:25,bx:10,by:25,hit:false,shot:0,shots:2};
  const reply={...event,weapon:'pistol',shooter:1,shot:0,shots:1,catchupDelayMs:50};
  view.queueEffects({sequence:[event,{...event,shot:1},reply]},0);
  view.animateEffects(0);view.animateEffects(1);
  assert.deepEqual(calls,['ak47-shot']);
  view.animateEffects(200);view.animateEffects(201);
  assert.deepEqual(calls,['ak47-shot','ak47-shot','tt33']);
});
