import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Core,decodeSave} from '../dist/solo-game.js';
import {aimOptions,availableAim} from '../dist/shooting-controls.js';
import {app} from './app-harness.mjs';

const descendants=element=>[element,...element.children.flatMap(descendants)];
const control=(a,id)=>descendants(a.el('context')).find(element=>element.dataset.control===id);
const pressed=button=>button['aria-pressed']==='true';
const unavailable=button=>button.disabled||button['aria-disabled']==='true';
function target(a,ap=14,weapon='assault'){
  a.s.engaged=true;a.s.phase='player';a.u.ap=ap;a.u.weapon=weapon;
  a.u.ammo[weapon]=Core.WEAPONS[weapon].mag;
  const guard=a.s.units.find(unit=>unit.team==='guard'&&Core.alive(unit));
  guard.x=a.u.x+1;guard.y=a.u.y;guard.hp=1000;
  a.s.detected.add(guard.id);
  a.view.options.onPick({unitId:guard.id});
  assert.equal(a.el('overlay').open,true);
  assert.equal(a.el('overlay').dataset.mode,'shooting');
  return guard;
}

test('new targets default to full, aimed or quick shots according to affordable AP, including fractional budgets',()=>{
  for(const [ap,expected] of [[14,'full'],[8,'full'],[7.99,'aimed'],[6,'aimed'],[5.99,'hip'],[4,'hip']]){
    const a=app();target(a,ap);
    for(const id of ['hip','aimed','full'])assert.equal(pressed(control(a,'aim-'+id)),id===expected,`${ap} AP, ${id}`);
    assert.equal(unavailable(control(a,'aim-full')),ap<8);
    assert.equal(unavailable(control(a,'aim-aimed')),ap<6);
    assert.equal(a.u.ap,ap);assert.equal(a.u.ammo.assault,30);
  }
});

test('aim prices use each weapon and burst rounding; unsupported weapons offer only the base shot',()=>{
  assert.deepEqual(aimOptions(Core.WEAPONS.shotgun,14).map(option=>option.cost),[5,8,10]);
  assert.deepEqual(aimOptions(Core.WEAPONS.hmg,14,true).map(option=>option.cost),[8,12,16]);
  assert.equal(availableAim(Core.WEAPONS.sniper,14),'aimed');
  for(const weapon of ['rpg','knife']){
    const a=app();target(a,14,weapon);
    assert.equal(pressed(control(a,'aim-hip')),true);
    assert.equal(control(a,'aim-full'),undefined);assert.equal(control(a,'aim-aimed'),undefined);
    assert.equal(control(a,'burst'),undefined);
    assert.equal(a.u.ap,14);
  }
  // The flamethrower retains base pricing but now deliberately bypasses this
  // single-target console in favour of its joystick-controlled area cone.
  assert.deepEqual(aimOptions(Core.WEAPONS.flamethrower,14).map(option=>option.cost),[6]);
});

test('aim, target and fire-mode switches are free; lower aim choices survive other selections',()=>{
  const a=app();target(a);
  control(a,'aim-hip').click();control(a,'zone-head').click();control(a,'burst').click();
  assert.equal(pressed(control(a,'aim-hip')),true);
  assert.equal(pressed(control(a,'zone-head')),true);
  assert.equal(pressed(control(a,'burst')),true);
  assert.equal(pressed(control(a,'single')),false);
  assert.equal(a.u.ap,14);assert.equal(a.u.ammo.assault,30);
  assert.equal(a.el('overlay').open,true);
  control(a,'exit').click();
  assert.equal(a.el('overlay').open,false);assert.equal(a.u.ap,14);assert.equal(a.u.ammo.assault,30);
});

test('burst re-prices aim levels and falls back to the best affordable aim without spending resources',()=>{
  const a=app();target(a,10);
  assert.equal(pressed(control(a,'aim-full')),true);
  control(a,'burst').click();
  assert.equal(pressed(control(a,'aim-aimed')),true);
  assert.equal(unavailable(control(a,'aim-full')),true);
  assert.match(control(a,'aim-full')['aria-label'],/12 AP/);
  assert.match(control(a,'fire')['aria-label'],/9 AP/);
  assert.equal(control(a,'fire').dataset.ready,'true');
  control(a,'aim-full').click();assert.equal(pressed(control(a,'aim-aimed')),true);
  control(a,'zone-legs').click();assert.equal(pressed(control(a,'aim-aimed')),true);
  assert.equal(a.u.ap,10);assert.equal(a.u.ammo.assault,30);
});

test('Fire spends exactly the selected shot cost and rounds and saves the completed attack',()=>{
  for(const burst of [false,true]){
    const a=app();target(a);
    control(a,'aim-aimed').click();control(a,'zone-head').click();
    if(burst)control(a,'burst').click();
    control(a,'fire').click();
    assert.equal(a.el('overlay').open,false);
    assert.equal(a.u.ap,14-(burst?9:6));
    assert.equal(a.u.ammo.assault,30-(burst?3:1));
    assert.equal(a.s.effect.sequence.length,burst?3:1);
    const saved=decodeSave(a.saved.get('tactical-animal-operation-v2'));
    assert.equal(saved.units[0].ap,a.u.ap);assert.equal(saved.units[0].ammo.assault,a.u.ammo.assault);
  }
});

test('unaffordable shots and blocked shots leave the trigger unavailable and spend nothing',()=>{
  for(const problem of ['AP','range']){
    const a=app(),guard=target(a,problem==='AP'?3:14);
    if(problem==='range')guard.x=a.u.x+30;
    // A free zone selection refreshes the authoritative preview.
    control(a,'zone-torso').click();
    const before={ap:a.u.ap,ammo:a.u.ammo.assault};
    assert.equal(unavailable(control(a,'fire')),true,problem);
    assert.equal(control(a,'fire').dataset.ready,'false',problem);
    control(a,'fire').click();
    assert.deepEqual({ap:a.u.ap,ammo:a.u.ammo.assault},before);
  }
});

test('reopening a target after firing selects the best aim for the remaining AP',()=>{
  const a=app(),guard=target(a,14);
  control(a,'fire').click();assert.equal(a.u.ap,6);
  a.s.detected.add(guard.id);a.view.options.onPick({unitId:guard.id});
  assert.equal(pressed(control(a,'aim-aimed')),true);
  assert.equal(unavailable(control(a,'aim-full')),true);
});

test('pressing an unaffordable aim or burst requests red feedback and preserves the valid selection',()=>{
  const a=app();target(a,5);
  for(const id of ['aim-aimed','aim-full','burst']){
    const b=control(a,id);
    assert.equal(b.disabled,false,'AP shortage must still acknowledge an attempted press');
    assert.equal(unavailable(b),true);b.click();
    assert.equal(b.classList.contains('is-ap-short'),true);
    assert.equal(pressed(control(a,'aim-hip')),true);assert.equal(pressed(control(a,'single')),true);
    assert.equal(a.u.ap,5);assert.equal(a.u.ammo.assault,30);assert.equal(a.el('overlay').open,true);
  }
  control(a,'fire').click();assert.equal(a.u.ap,1);assert.equal(a.u.ammo.assault,29);
});

test('an AP-blocked trigger flashes instead of firing or closing the panel',()=>{
  const a=app();target(a,3);const trigger=control(a,'fire');
  trigger.click();
  assert.equal(trigger.classList.contains('is-ap-short'),true);
  assert.equal(a.u.ap,3);assert.equal(a.u.ammo.assault,30);
  assert.equal(a.el('overlay').open,true);assert.equal(pressed(control(a,'aim-hip')),true);
});
