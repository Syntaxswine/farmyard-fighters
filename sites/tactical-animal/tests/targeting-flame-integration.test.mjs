import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Core,DEFAULT_BUILD} from '../dist/solo-game.js';
import {app} from './app-harness.mjs';

const nodes=element=>[element,...element.children.flatMap(nodes)];
const control=(a,id)=>nodes(a.el('context')).find(node=>node.dataset.control===id);
const resource=a=>({ap:a.u.ap,weapon:a.u.weapon,fuel:a.u.ammo.flamethrower,grenades:a.u.ammo.grenade,sidearm:a.u.ammo.pistol});

test('exiting the sidearm CRT returns to shared flame/grenade aiming without leaking a target or spending resources',()=>{
  const a=app({initialStorage:[['tactical-animal-build-v1',JSON.stringify({...DEFAULT_BUILD,primary:'flamethrower',secondary:'pistol',utility:'grenade'})]]});
  const guard=a.s.units.find(unit=>unit.team==='guard'&&unit.hp>0);
  a.s.engaged=true;a.s.phase='player';a.u.ap=14;guard.x=a.u.x+1;guard.y=a.u.y;guard.hp=1000;Core.refresh(a.s);
  assert.ok(Core.equip(a.s,a.u,'pistol'));
  a.view.options.onPick({unitId:guard.id});
  assert.equal(a.el('overlay').dataset.mode,'shooting');
  assert.ok(nodes(a.el('context')).some(node=>node.className==='target-monitor'));
  const before=resource(a);control(a,'zone-head').click();control(a,'exit').click();
  assert.equal(a.el('overlay').open,false);assert.deepEqual(resource(a),before);
  a.el('grenade').fire('keydown',{key:'ArrowDown'});
  const chooseFlame=a.el('control-choices').children.find(button=>button['aria-label'].startsWith('Flamethrower ·'));
  assert.ok(chooseFlame);chooseFlame.click();
  assert.equal(a.u.weapon,'flamethrower');assert.equal(a.el('grenade').dataset.kind,'flamethrower');
  const equipped=resource(a);assert.equal(before.ap-equipped.ap,2);
  a.view.options.onPick({unitId:guard.id});
  assert.equal(a.view.flameAiming,true);assert.equal(a.el('overlay').open,false);
  assert.equal(a.el('flame-aim').hidden,false);assert.equal(a.el('grenade-aim').hidden,true);
  assert.equal(control(a,'fire'),undefined);assert.equal(a.el('grenade').dataset.ready,'true');
  a.el('cancel-flame').click();assert.deepEqual(resource(a),equipped);
  a.el('grenade').fire('keydown',{key:'ArrowDown'});
  a.el('control-choices').children.find(button=>button['aria-label'].startsWith('Grenade ·')).click();
  a.el('grenade').click();assert.equal(a.view.aiming,true);assert.equal(a.view.flameAiming,false);
  a.el('cancel-grenade').click();assert.deepEqual(resource(a),equipped);
});
