import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Core,encodeSave} from '../dist/solo-game.js';
import {recordFlame,pointInFlame,flameFogMask,flameMaskRect} from '../dist/flame-event.js';
import {flameScenario,gameplayReceipt} from './flame-scenarios.mjs';

test('all 54 legacy scenarios retain AP, fuel and RNG while exposed victims receive the restored lethal outcome',()=>{
  const baseline=JSON.parse(fs.readFileSync(new URL('./flame-gameplay-baseline.json',import.meta.url)));
  for(const row of baseline.rows){const {state,unit,target}=flameScenario(row),beforeFuel=unit.ammo.flamethrower,beforeAP=unit.ap,seed=state.seed,beforeHP=state.units.map(unit=>unit.hp);
    assert.equal(Core.attack(state,unit,target),true);
    assert.equal(state.units[1].hp,0);assert.equal(state.units[2].hp,0);assert.equal(state.units[3].hp,row.scene==='wall'?600:0);
    for(const v of state.units.slice(1,4))if(!v.hp)assert.equal(v.burnedRemains,true);
    assert.equal(unit.ap,row.ap);assert.equal(unit.ammo.flamethrower,row.fuel);assert.equal(state.seed,row.seed);
    assert.equal(unit.ap,beforeAP-6);assert.equal(unit.ammo.flamethrower,beforeFuel-1);assert.equal(state.seed,seed);
    const event=state.effect.sequence[0];assert.equal(event.flame.rays.length,37);assert.equal(event.flame.halfAngle,24*Math.PI/180);assert.equal(event.flame.range,10);
    assert.deepEqual(event.flame.source,{id:unit.id,species:unit.species,stance:unit.stance,heading:unit.heading,x:unit.x,y:unit.y});
    assert.deepEqual(event.impacts.map(hit=>[hit.id,hit.after]),state.units.filter(unit=>unit.id!==0&&unit.hp<beforeHP[unit.id]).map(unit=>[unit.id,unit.hp]));
    for(const impact of event.impacts){assert.ok(impact.before>impact.after);assert.equal(impact.dead,impact.after===0);}
  }
});

test('invalid flamethrower shots spend nothing and cannot start a visual event',()=>{
  for(const reason of ['ap','fuel','turn','range','wall']){
    const {state,unit,target}=flameScenario();
    if(reason==='ap')unit.ap=5.99;if(reason==='fuel')unit.ammo.flamethrower=0;if(reason==='turn')state.phase='enemy';if(reason==='range')target.x=16;if(reason==='wall'){unit.x=19;unit.y=10;target.x=22;target.y=10;}
    const before=encodeSave(state);assert.equal(Core.attack(state,unit,target),false,reason);assert.equal(encodeSave(state),before,reason);
  }
});

const source={id:0,species:'horse',stance:'standing',heading:0,x:4,y:25};
const allVisible=()=>new Set(Array.from({length:30},(_,y)=>Array.from({length:40},(_,x)=>`${x},${y}`)).flat());
test('the recorded cone ends before a two-metre wall and remains immutable when scenery changes',()=>{
  const walls=[{kind:'wall',height:2,x0:6.4,x1:6.6,y0:20,y1:28}],shape=recordFlame(source,10,walls,allVisible()),before=JSON.stringify(shape);
  assert.ok(shape.rays.every(ray=>ray.kind==='wall'&&ray.x<6.4));assert.equal(pointInFlame(shape,{x:6.2,y:25}),true);assert.equal(pointInFlame(shape,{x:7,y:25}),false);
  walls.length=0;assert.equal(JSON.stringify(shape),before);
});

test('the cone cannot bridge a hidden strip, and masks intersect shot-time visibility with current visibility',()=>{
  const visible=allVisible();for(let y=0;y<30;y++)visible.delete(`7,${y}`);
  const shape=recordFlame(source,10,[],visible);assert.ok(shape.rays.every(ray=>ray.kind==='fog'&&ray.x<6.5));assert.equal(pointInFlame(shape,{x:8,y:25}),false);
  const later=allVisible();later.delete('5,25');const rect=flameMaskRect(shape),mask=flameFogMask(shape,later),at=(x,y)=>((y-rect.origin.y)*rect.width+x-rect.origin.x)*4;
  assert.equal(mask[at(7,25)],0);assert.equal(mask[at(5,25)],0);assert.equal(mask[at(4,25)],255);
  visible.delete('4,25');const hidden=recordFlame(source,10,[],visible);assert.equal(hidden.sourceVisible,false);assert.ok(hidden.rays.every(ray=>ray.kind==='hidden'&&ray.distance===0));
});
