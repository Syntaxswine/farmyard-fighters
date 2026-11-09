import {test} from 'node:test';
import assert from 'node:assert/strict';
import {app} from './app-harness.mjs';

const snapshot=u=>({x:u.x,y:u.y,ap:u.ap,hp:u.hp,grenades:u.ammo.grenade,weapon:u.weapon,ammo:{...u.ammo}});

test('joystick aim and release hold a preview without walking or consuming AP or grenades',()=>{
  const a=app(),before=snapshot(a.u);a.el('grenade').click();assert.equal(a.el('grenade').dataset.ready,'false');
  a.drag(40,-40);const point={...a.view.preview.point};a.advance(10);
  assert.equal(a.el('grenade').dataset.ready,'false');assert.deepEqual(snapshot(a.u),before);
  a.el('joystick').fire('pointerup');a.advance(3);
  assert.deepEqual(a.view.preview.point,point);assert.equal(a.el('grenade').dataset.ready,'true');assert.deepEqual(snapshot(a.u),before);
  a.el('grenade').click();assert.equal(a.u.ammo.grenade,before.grenades-1);assert.equal(a.u.ap,before.ap-5);assert.equal(a.u.weapon,before.weapon);assert.equal(a.u.x,before.x);assert.equal(a.u.y,before.y);
  a.el('grenade').click();assert.equal(a.el('grenade').dataset.ready,'false');assert.equal(a.u.ammo.grenade,before.grenades-1);
});
test('cancellation, pointer loss, and Escape never throw or resume held movement',()=>{
  const a=app(),before=snapshot(a.u);a.el('grenade').click();a.drag(40,-40);a.el('joystick').fire('pointercancel');a.advance(3);
  assert.equal(a.view.aiming,true);assert.deepEqual(snapshot(a.u),before);
  a.key('Escape');a.advance(3);assert.equal(a.view.aiming,false);assert.deepEqual(snapshot(a.u),before);
  a.el('grenade').click();assert.equal(a.el('grenade').dataset.ready,'false');a.el('cancel-grenade').click();a.advance(3);assert.deepEqual(snapshot(a.u),before);
});
test('keyboard aim, blocked movement actions, and ground taps cannot move or end the turn',()=>{
  const a=app(),before=snapshot(a.u);a.key('g');a.key('w');a.key('d');a.advance(25);
  a.key('w','keyup');a.key('d','keyup');const point={...a.view.preview.point};
  a.view.options.onPick({x:10,y:25});a.key(' ');a.advance(3);
  assert.deepEqual(snapshot(a.u),before);assert.equal(a.s.phase,'explore');assert.deepEqual(a.view.preview.point,point);
  assert.equal(a.el('look').disabled,true);assert.equal(a.el('stance-cycle').disabled,true);assert.equal(a.el('movement-cycle').disabled,true);
  a.key('Enter');assert.equal(a.u.ammo.grenade,before.grenades-1);assert.equal(a.u.ap,before.ap-5);
});
test('invalid landing points disable Throw and Enter leaves resources untouched',()=>{
  const a=app(),before=snapshot(a.u);a.key('g');a.drag(-60,0);a.el('joystick').fire('pointerup');
  assert.equal(a.el('grenade').dataset.ready,'false');assert.match(a.el('grenade-warning').textContent,/point on the field/);
  a.key('Enter');assert.deepEqual(snapshot(a.u),before);
});
