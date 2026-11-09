import {test} from 'node:test';
import assert from 'node:assert/strict';
import {app} from './app-harness.mjs';
import {Core} from '../dist/solo-game.js';

function contact(a) {
  a.s.engaged=true;
  a.s.phase='player';
  a.advance(3);
  assert.equal(a.s.phase,'player');
}

test('End Turn lights on contact, stays lit while guards act, and goes dark when combat breaks',()=>{
  const a=app(),button=a.el('end-turn');
  assert.equal(a.s.phase,'explore');
  assert.equal(button.dataset.lit,'false');
  assert.equal(button.disabled,true);
  contact(a);
  assert.equal(button.dataset.lit,'true');
  assert.equal(button.disabled,false);
  button.click();a.advance(3);
  assert.equal(a.s.phase,'enemy');
  assert.equal(button.dataset.lit,'true');
  assert.equal(button.disabled,true);
  assert.equal(button['aria-label'],'Guards are acting');
  a.s.phase='explore';a.s.engaged=false;
  for(const unit of a.s.units)if(unit.team==='guard')unit.alert=false;
  a.advance(3);
  assert.equal(a.s.phase,'explore');
  assert.equal(button.dataset.lit,'false');
  assert.equal(button.disabled,true);
});

test('the combat lamp stays on while grenade aiming disables End Turn and when AP is exhausted',()=>{
  const a=app(),button=a.el('end-turn');contact(a);
  a.el('grenade').click();
  assert.equal(a.view.aiming,true);
  assert.equal(button.disabled,true);
  assert.equal(button.dataset.lit,'true');
  a.el('cancel-grenade').click();a.u.ap=0;a.advance(3);
  assert.equal(a.s.phase,'player');
  assert.equal(button.dataset.lit,'true');
  assert.equal(button.disabled,false);
});

test('the skinned Zoom controls retain their direction and spend no action points',()=>{
  const a=app(),before={x:a.u.x,y:a.u.y,ap:a.u.ap,phase:a.s.phase};
  a.el('zoom-in').click();assert.equal(a.view.zoomFactor,.83);
  a.el('zoom-out').click();assert.equal(a.view.zoomFactor,.83*1.2);
  assert.deepEqual({x:a.u.x,y:a.u.y,ap:a.u.ap,phase:a.s.phase},before);
});

test('mode switches light for run, sneak and a lowered stance while free taps preserve AP',()=>{
  const a=app(),ap=a.u.ap,movement=a.el('movement-cycle'),stance=a.el('stance-cycle');
  assert.equal(movement.dataset.lit,'false');assert.equal(stance.dataset.lit,'false');
  movement.click();assert.equal(Core.movementModeOf(a.u),'run');assert.equal(movement.dataset.lit,'true');
  movement.click();assert.equal(movement.dataset.lit,'false');
  movement.click();assert.equal(Core.movementModeOf(a.u),'sneak');assert.equal(movement.dataset.lit,'true');
  for(const value of ['kneeling','prone','kneeling','standing']){stance.click();assert.equal(a.u.stance,value);assert.equal(stance.dataset.lit,String(value!=='standing'));}
  assert.equal(a.u.ap,ap);
});

test('the real-time Sneak toggle shows sight independently of pace',()=>{
  const a=app({realTime:true}),button=a.el('movement-cycle'),indicator=a.el('sneak-indicator');
  assert(a.u.running);
  assert.equal(button['aria-label'],'Sneak');
  assert.equal(button['aria-pressed'],'false');
  assert.equal(button.dataset.stealth,'clear');
  assert.equal(a.el('movement-label').textContent,'SNEAK');
  button.click();
  assert(a.u.sneaking);
  assert.equal(button['aria-pressed'],'true');
  assert.equal(button.dataset.stealth,'clear');

  const guard=a.s.units.find(u=>u.team==='guard');
  Object.assign(guard,{x:a.u.x+1,y:a.u.y,heading:180});
  Core.refresh(a.s);a.advance(3);
  assert.equal(button.dataset.stealth,'spotted');
  assert.equal(indicator.textContent,'SEEN');
  assert.equal(a.el('sneak-status').textContent,'A guard has you in sight.');
  button.click();
  assert(a.u.running);
  assert.equal(button['aria-pressed'],'false');
  assert.equal(button.dataset.stealth,'spotted');
});

test('the opponent lamp follows visibility and goes dark after contact is lost',()=>{
  const a=app(),eye=a.el('look'),guard=a.s.units.find(u=>u.team==='guard');
  assert.equal(eye.dataset.lit,'false');
  guard.x=a.u.x+1;guard.y=a.u.y;Core.refresh(a.s);a.advance(3);
  assert.equal(eye.dataset.lit,'true');assert.ok(a.el('visible-count').textContent>0);
  guard.x=35;guard.y=3;Core.refresh(a.s);a.advance(3);
  assert.equal(eye.dataset.lit,'false');assert.equal(a.el('visible-count').textContent,0);
});

test('changing equipment and operation keeps loaded artwork mounted and selection current',()=>{
  const a=app({autoDeploy:false}),primary=a.el('primary').children,secondary=a.el('secondary').children;
  primary[5].click();assert.equal(a.el('primary').children,primary);assert.equal(primary[5]['aria-pressed'],'true');
  primary[6].click();assert.equal(primary[5]['aria-pressed'],'false');assert.equal(primary[6]['aria-pressed'],'true');
  secondary[0].click();assert.equal(a.el('secondary').children,secondary);assert.equal(secondary[0]['aria-pressed'],'true');
  a.el('operation-select').value='short-measure';a.el('operation-select').fire('change');
  assert.equal(a.el('primary').children,primary);assert.equal(a.el('secondary').children,secondary);
  assert.equal(primary.filter(b=>b['aria-pressed']==='true').length,1);
});
