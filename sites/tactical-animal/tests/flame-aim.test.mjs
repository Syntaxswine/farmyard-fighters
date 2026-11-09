import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Core,encodeSave,DEFAULT_BUILD} from '../dist/solo-game.js';
import {FlameAim} from '../dist/flame-controls.js';
import {screenToGround} from '../dist/grenade-controls.js';
import {flameCases,flameScenario,gameplayReceipt} from './flame-scenarios.mjs';
import {app} from './app-harness.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} differs from ${b}`);
const snapshot=a=>({x:a.u.x,y:a.u.y,heading:a.u.heading,ap:a.u.ap,hp:a.u.hp,fuel:a.u.ammo.flamethrower,grenades:a.u.ammo.grenade,seed:a.s.seed});
const flamer=()=>app({initialStorage:[['tactical-animal-build-v1',JSON.stringify({...DEFAULT_BUILD,primary:'flamethrower',utility:'grenade'})]]});

test('directional fire preserves all 54 targeted-shot damage, casualty, wall, resource, fog and RNG outcomes',()=>{
  for(const scenario of flameCases){
    const old=flameScenario(scenario),cone=flameScenario(scenario),heading=Core.headingTo(cone.unit,cone.target);
    assert.equal(Core.attack(old.state,old.unit,old.target),true);assert.equal(Core.fireFlame(cone.state,cone.unit,heading),true);
    const expected=gameplayReceipt(old.state),actual=gameplayReceipt(cone.state);delete expected.log;delete actual.log;
    assert.deepEqual(actual,expected,JSON.stringify(scenario));
    assert.deepEqual(cone.state.effect.sequence[0].impacts,old.state.effect.sequence[0].impacts);
    assert.deepEqual(cone.state.effect.sequence[0].flame,old.state.effect.sequence[0].flame);
  }
});

test('a cone can fire into empty ground with no target, spends exactly 6 AP and one fuel, and never rolls RNG',()=>{
  const {state,unit}=flameScenario();for(const guard of state.units.slice(1))guard.hp=0;Core.refresh(state);
  const before={ap:unit.ap,fuel:unit.ammo.flamethrower,seed:state.seed};
  assert.equal(Core.previewFlame(state,unit,90).ok,true);assert.equal(Core.fireFlame(state,unit,90),true);
  assert.equal(unit.ap,before.ap-6);assert.equal(unit.ammo.flamethrower,before.fuel-1);assert.equal(state.seed,before.seed);
  assert.equal(unit.heading,90);assert.equal(state.effect.sequence[0].target,undefined);assert.deepEqual(state.effect.sequence[0].impacts,[]);
});

test('the preview is read only, uses the full fixed cone, and only names visible contacts',()=>{
  const {state,unit,target}=flameScenario();state.detected.delete(target.id);const before=encodeSave(state);
  const p=Core.previewFlame(state,unit,360);
  assert.equal(p.ok,true);assert.equal(p.heading,0);assert.equal(p.range,10);assert.equal(p.spread,48);assert.equal(p.cost,6);
  assert.ok(!p.contacts.some(contact=>contact.id===target.id));assert.equal(encodeSave(state),before);
  state.visible.delete(Core.key(9,26));assert.ok(!Core.previewFlame(state,unit,0).contacts.some(contact=>contact.id===state.units[2].id));
});

test('invalid directional shots cannot spend resources, turn the animal or replace an effect',()=>{
  for(const invalid of ['ap','fuel','turn','weapon','heading']){
    const {state,unit}=flameScenario();
    if(invalid==='ap')unit.ap=5.99;if(invalid==='fuel')unit.ammo.flamethrower=0;if(invalid==='turn')state.phase='enemy';if(invalid==='weapon')unit.weapon='pistol';
    const heading=invalid==='heading'?NaN:90,before=encodeSave(state),effect=state.effect;
    assert.equal(Core.previewFlame(state,unit,heading).ok,false);assert.equal(Core.fireFlame(state,unit,heading),false);
    assert.equal(encodeSave(state),before);assert.equal(state.effect,effect);
  }
});

test('thumb direction maps to the fixed camera, holds on release and never shortens the flame range',()=>{
  const aim=new FlameAim();aim.start(135);assert.equal(aim.aim({x:.02,y:0}),135);
  for(const offset of [{x:1,y:0},{x:0,y:-1},{x:1,y:1},{x:-2,y:3}]){
    const direction=screenToGround(offset.x,offset.y),heading=Math.atan2(direction.y,direction.x)*180/Math.PI;
    near(aim.aim(offset),heading);near(aim.aim({x:offset.x*.5,y:offset.y*.5}),heading);near(aim.aim({x:0,y:0}),heading);
  }
  aim.cancel();assert.equal(aim.active,false);assert.equal(aim.aim({x:1,y:0}),null);
});

test('joystick cone aiming holds position and resources, then one explicit released tap fires',()=>{
  const a=flamer(),before=snapshot(a);assert.equal(a.el('grenade').dataset.kind,'flamethrower');a.el('grenade').click();
  assert.equal(a.view.flameAiming,true);assert.equal(a.el('grenade-label').textContent,'FIRE');a.drag(40,-30);a.advance(8);
  const heading=a.view.flamePreview.heading;assert.equal(a.el('grenade').dataset.ready,'false');a.el('grenade').click();assert.deepEqual(snapshot(a),before);
  assert.equal(a.el('end-turn').disabled,true);assert.equal(a.el('stance-cycle').disabled,true);assert.equal(a.el('movement-cycle').disabled,true);assert.equal(a.el('interaction-hand').hidden,true);
  a.el('joystick').fire('pointerup');a.advance(3);assert.equal(a.view.flamePreview.heading,heading);assert.deepEqual(snapshot(a),before);
  a.el('grenade').click();assert.equal(a.view.flameAiming,false);assert.equal(a.u.ammo.flamethrower,before.fuel-1);assert.equal(a.u.ap,before.ap-6);assert.equal(a.u.x,before.x);assert.equal(a.u.y,before.y);
  assert.equal(a.el('grenade-label').textContent,'CONE');
});

test('pointer loss, Escape, Cancel and opening options never fire or resume held movement',()=>{
  for(const cancel of ['pointercancel','lostpointercapture','cancel-flame','Escape','menu']){
    const a=flamer(),before=snapshot(a);a.key('f');a.drag(40,-30);
    if(cancel.startsWith('pointer')||cancel==='lostpointercapture'){a.el('joystick').fire(cancel);assert.equal(a.view.flameAiming,true);a.key('Escape');}
    else if(cancel==='Escape')a.key(cancel);else a.el(cancel).click();
    a.advance(6);assert.equal(a.view.flameAiming,false);assert.deepEqual(snapshot(a),before);assert.equal(a.u.isMoving,false);
  }
});

test('keyboard cone aim blocks movement and end turn; released Enter fires; grenade aim stays exclusive',()=>{
  const a=flamer(),before=snapshot(a);a.key('f');a.key('w');a.key('d');a.advance(5);a.key('Enter');a.key(' ');
  a.view.options.onPick({x:10,y:25});assert.deepEqual(snapshot(a),before);assert.equal(a.s.phase,'explore');
  a.key('w','keyup');a.key('d','keyup');a.key('Enter');assert.equal(a.u.ammo.flamethrower,before.fuel-1);
  const b=flamer(),resources=snapshot(b);b.key('f');b.key('g');assert.equal(b.view.flameAiming,false);assert.equal(b.view.aiming,true);
  b.key('f');assert.equal(b.view.aiming,false);assert.equal(b.view.flameAiming,true);assert.deepEqual(snapshot(b),resources);
});

test('tapping a guard with the flamethrower opens the aimed cone directly without the shooting menu',()=>{
  const a=flamer(),guard=a.s.units[1];Object.assign(a.u,{x:4,y:25,heading:0});Object.assign(guard,{x:8,y:25,hp:100});for(const other of a.s.units.slice(2))other.hp=0;Core.refresh(a.s);
  assert.ok(a.s.detected.has(guard.id));const before=snapshot(a);a.view.options.onPick({unitId:guard.id});
  assert.equal(a.view.flameAiming,true);assert.equal(a.el('overlay').open,false);near(a.view.flamePreview.heading,0);assert.deepEqual(snapshot(a),before);
  a.key('Escape');a.el('menu').click();assert.ok(a.el('context').children.some(child=>child.textContent==='Aim cone'));
});
