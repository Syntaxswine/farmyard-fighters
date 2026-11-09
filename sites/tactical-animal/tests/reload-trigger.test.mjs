import test from 'node:test';
import assert from 'node:assert/strict';
import {Core,DEFAULT_BUILD,decodeSave} from '../dist/solo-game.js';
import {app} from './app-harness.mjs';

const nodes=element=>[element,...element.children.flatMap(nodes)];
const control=(a,id)=>nodes(a.el('context')).find(node=>node.dataset.control===id);
function targeting(weapon='assault',{ammo=0,reserve=40,ap=14}={}){
  const a=app(),guard=a.s.units.find(unit=>unit.team==='guard'&&Core.alive(unit));
  a.s.engaged=true;a.s.phase='player';Object.assign(a.u,{weapon,ap});a.u.ammo[weapon]=ammo;a.u.ammoPouch[weapon]=reserve;
  Object.assign(guard,{x:a.u.x+1,y:a.u.y,hp:1000});a.s.detected.add(guard.id);a.view.options.onPick({unitId:guard.id});
  return {a,guard};
}
const flamer=()=>app({initialStorage:[['tactical-animal-build-v1',JSON.stringify({...DEFAULT_BUILD,primary:'flamethrower',utility:'grenade'})]]});

test('empty guns replace the wide Fire action with Reload and refill only from the matching reserve',()=>{
  for(const weapon of ['assault','rifle','smg','shotgun','sniper','hmg','rpg','pistol']){
    const {a}=targeting(weapon,{reserve:7});a.u.ammoPouch.pistol=weapon==='pistol'?7:24;
    const trigger=control(a,'fire');assert.equal(trigger.dataset.action,'reload');assert.equal(trigger.dataset.ready,'true');
    assert.match(trigger['aria-label'],/^Reload .*3 AP/);assert.match(trigger.innerHTML,/>RELOAD</);assert.match(trigger.innerHTML,/#reload/);
    trigger.click();const count=Math.min(7,Core.WEAPONS[weapon].mag);
    assert.equal(a.u.ammo[weapon],count);assert.equal(a.u.ammoPouch[weapon],7-count);assert.equal(a.u.ap,11);assert.equal(a.u.weapon,weapon);
    if(weapon!=='pistol')assert.equal(a.u.ammoPouch.pistol,24);
    assert.equal(a.el('overlay').open,true);assert.equal(control(a,'fire').dataset.action,'fire');assert.equal(a.s.effect,undefined);
    const saved=decodeSave(a.saved.get('tactical-animal-operation-v2'));assert.equal(saved.units[0].ap,11);assert.equal(saved.units[0].ammo[weapon],count);
  }
});

test('Reload uses its own AP cost, preserves targeting choices, and does not also fire',()=>{
  const {a}=targeting('assault',{ap:6});control(a,'zone-head').click();control(a,'burst').click();
  assert.equal(control(a,'fire').dataset.action,'reload');control(a,'fire').click();
  assert.equal(a.u.ap,3);assert.equal(a.u.ammo.assault,30);assert.equal(a.s.effect,undefined);
  assert.equal(control(a,'zone-head')['aria-pressed'],'true');assert.equal(control(a,'burst')['aria-pressed'],'true');
  assert.equal(control(a,'fire').dataset.action,'fire');assert.equal(control(a,'fire')['aria-disabled'],'true');
  assert.match(a.el('overlay-content').innerHTML,/3\.0 AP.*30 ROUNDS/);
});

test('no reserve and insufficient reload AP never spend resources or close targeting',()=>{
  const missing=targeting('assault',{reserve:0}).a,short=targeting('assault',{ap:2.99}).a;
  for(const a of [missing,short]){
    const before={ap:a.u.ap,ammo:a.u.ammo.assault,reserve:a.u.ammoPouch.assault},trigger=control(a,'fire');
    assert.equal(trigger.dataset.action,'reload');assert.equal(trigger.dataset.ready,'false');assert.equal(trigger['aria-disabled'],'true');
    trigger.click();assert.deepEqual({ap:a.u.ap,ammo:a.u.ammo.assault,reserve:a.u.ammoPouch.assault},before);assert.equal(a.el('overlay').open,true);assert.equal(a.s.effect,undefined);
  }
  assert.ok(nodes(missing.el('context')).some(node=>node.textContent==='No spare ammunition'));
  assert.equal(control(short,'fire').classList.contains('is-ap-short'),true);
});

test('the last single or burst shot leaves Reload available when its target survives',()=>{
  for(const burst of [false,true]){
    const {a,guard}=targeting('assault',{ammo:burst?3:1});control(a,'aim-hip').click();if(burst)control(a,'burst').click();
    control(a,'fire').click();assert.ok(guard.hp>0);assert.equal(a.u.ammo.assault,0);assert.equal(a.el('overlay').open,true);assert.equal(control(a,'fire').dataset.action,'reload');
    const effect=a.s.effect,ap=a.u.ap;control(a,'fire').click();assert.equal(a.u.ap,ap-3);assert.equal(a.u.ammo.assault,30);assert.equal(a.s.effect,effect);assert.equal(control(a,'fire').dataset.action,'fire');
  }
});

test('empty magazines still reload when the target is beyond firing range; melee never becomes Reload',()=>{
  const {a,guard}=targeting();guard.x=a.u.x+30;control(a,'zone-torso').click();assert.equal(control(a,'fire').dataset.ready,'true');control(a,'fire').click();assert.equal(a.u.ammo.assault,30);
  assert.equal(control(a,'fire').dataset.ready,'false');assert.ok(nodes(a.el('context')).some(node=>node.textContent==='Out of range'));
  const knife=targeting('knife').a;assert.equal(control(knife,'fire').dataset.action,'fire');
});

test('the last fuel charge becomes Reload and reloading the area control preserves the weapon and grenades',()=>{
  const a=flamer();a.s.engaged=true;a.s.phase='player';a.u.ap=14;a.u.ammo.flamethrower=1;a.advance(3);
  a.el('grenade').click();a.el('grenade').click();assert.equal(a.u.ammo.flamethrower,0);assert.equal(a.u.ap,8);
  assert.equal(a.el('grenade-label').textContent,'RELOAD');assert.equal(a.el('grenade').dataset.action,'reload');assert.match(a.el('area-icon').innerHTML,/#reload/);assert.equal(a.el('grenade-cost').textContent,'3 AP');
  const grenades=a.u.ammo.grenade,reserve=a.u.ammoPouch.flamethrower,effect=a.s.effect;a.el('grenade').click();
  assert.equal(a.u.ap,5);assert.equal(a.u.ammo.flamethrower,4);assert.equal(a.u.ammoPouch.flamethrower,reserve-4);assert.equal(a.u.weapon,'flamethrower');assert.equal(a.u.ammo.grenade,grenades);assert.equal(a.s.effect,effect);
  assert.equal(a.el('grenade-label').textContent,'CONE');assert.doesNotMatch(a.el('area-icon').innerHTML,/#reload/);assert.equal(a.view.flameAiming,false);
});

test('area Reload is free outside combat and still permits weapon selection without fuel or reserve',()=>{
  const a=flamer();a.u.ammo.flamethrower=0;a.u.ap=0;a.advance(3);assert.equal(a.el('grenade-cost').textContent,'0 AP');a.el('grenade').click();assert.equal(a.u.ap,0);assert.equal(a.u.ammo.flamethrower,4);
  a.u.ammo.flamethrower=0;a.u.ammoPouch.flamethrower=0;a.advance(3);const reserve=a.u.ammoPouch.flamethrower;a.el('grenade').click();assert.equal(a.u.ammo.flamethrower,0);assert.equal(a.u.ammoPouch.flamethrower,reserve);assert.match(a.el('toast').textContent,/No spare/);
  a.el('grenade').fire('keydown',{key:'ArrowDown'});assert.equal(a.el('control-picker').open,true);
  a.el('control-choices').children.find(button=>button['aria-label'].startsWith('Grenade ·')).click();assert.equal(a.el('grenade-label').textContent,'GRENADE');assert.equal(a.el('grenade').dataset.action,'aim');
});
