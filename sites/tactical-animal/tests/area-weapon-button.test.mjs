import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Core,DEFAULT_BUILD} from '../dist/solo-game.js';
import {app} from './app-harness.mjs';

const flamer=()=>app({initialStorage:[['tactical-animal-build-v1',JSON.stringify({...DEFAULT_BUILD,primary:'flamethrower',utility:'grenade'})]]});
const snapshot=a=>({ap:a.u.ap,x:a.u.x,y:a.u.y,fuel:a.u.ammo.flamethrower,grenades:a.u.ammo.grenade,weapon:a.u.weapon});
const options=a=>a.el('control-choices').children;
const openChoices=a=>a.el('grenade').fire('keydown',{key:'ArrowDown'});
const choose=(a,name)=>{const option=options(a).find(b=>b['aria-label'].startsWith(name+' ·'));assert.ok(option,name);option.click();};
const action=(a,name)=>{const option=a.el('overlay-actions').children.find(b=>b.textContent.startsWith(name));assert.ok(option,name);option.click();};

test('the field has exactly one grenade/flamethrower slot and a slow yellow readiness light',()=>{
  const html=fs.readFileSync(new URL('../dist/game.html',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../dist/field-hardware.css',import.meta.url),'utf8');
  const right=html.match(/<div class="right-controls">([\s\S]*?)<\/div>/)[1];
  assert.deepEqual([...right.matchAll(/<button id="([^"]+)"/g)].map(match=>match[1]),['end-turn','grenade','menu']);
  assert.match(right,/id="grenade"[^>]*data-face="yellow"[^>]*aria-haspopup="dialog"/);
  assert.doesNotMatch(html,/id="flame"/);assert.match(css,/area-fire-ready 2\.4s ease-in-out infinite/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)[\s\S]*data-ready='true'[^}]*animation: none; opacity: 1/);
});

test('one button switches icons, labels and counts with free selection and cancels the old preview',()=>{
  const a=flamer(),before=snapshot(a);assert.equal(a.el('grenade').dataset.kind,'flamethrower');assert.equal(a.el('grenade-label').textContent,'CONE');
  a.el('grenade').click();assert.equal(a.view.flameAiming,true);assert.equal(a.el('grenade').dataset.ready,'true');
  openChoices(a);assert.equal(a.el('control-picker').open,true);assert.equal(a.view.flameAiming,false);assert.equal(a.el('grenade').dataset.ready,'false');
  choose(a,'Grenade');assert.equal(a.el('control-picker').open,false);assert.equal(a.el('grenade').dataset.kind,'grenade');assert.equal(a.el('grenade-label').textContent,'GRENADE');assert.equal(a.el('grenade-count').textContent,3);assert.deepEqual(snapshot(a),before);
  a.el('grenade').click();assert.equal(a.view.aiming,true);assert.equal(a.el('grenade').dataset.ready,'false');openChoices(a);choose(a,'Flamethrower');
  assert.equal(a.view.aiming,false);assert.equal(a.el('grenade-label').textContent,'CONE');assert.equal(a.el('grenade-count').textContent,4);assert.deepEqual(snapshot(a),before);
});

test('a real long press on a ready flame opens choices without firing on release',async()=>{
  const a=flamer();a.el('grenade').click();const before=snapshot(a);a.el('grenade').fire('pointerdown');assert.equal(a.el('grenade').dataset.ready,'false');
  await new Promise(resolve=>setTimeout(resolve,480));assert.equal(a.el('control-picker').open,true);assert.deepEqual(snapshot(a),before);
  a.el('grenade').fire('pointerup');choose(a,'Grenade');a.el('grenade').click();
  assert.equal(a.s.solo.areaWeapon,'grenade');assert.equal(a.view.aiming,undefined);assert.equal(a.view.flameAiming,false);assert.deepEqual(snapshot(a),before);
});

test('both weapon lights track a valid released aim, loading, menus, cancellation and enemy turns',()=>{
  for(const kind of ['grenade','flamethrower']){
    const a=flamer(),button=a.el('grenade');a.key(kind==='grenade'?'g':'f');
    if(kind==='grenade')assert.equal(button.dataset.ready,'false');
    a.drag(40,-40);a.advance(3);assert.equal(button.dataset.ready,'false');a.el('joystick').fire('pointerup');assert.equal(button.dataset.ready,'true');assert.equal(button.dataset.lit,'true');
    a.el('loading').hidden=false;a.advance(3);assert.equal(button.dataset.ready,'false');assert.equal(button.disabled,true);a.el('loading').hidden=true;a.advance(3);assert.equal(button.dataset.ready,'true');
    a.document.hidden=true;a.advance(3);assert.equal(button.dataset.ready,'false');a.document.hidden=false;a.advance(3);assert.equal(button.dataset.ready,'true');
    a.key('Escape');assert.equal(button.dataset.ready,'false');a.key(kind==='grenade'?'g':'f');a.el('menu').click();assert.equal(button.dataset.ready,'false');
    action(a,'Continue operation');a.key(kind==='grenade'?'g':'f');a.s.phase='enemy';a.advance(3);assert.equal(button.dataset.ready,'false');assert.equal(button.disabled,true);
  }
});

test('invalid or unaffordable shots stay unlit, keep resources, and still permit the hold menu',()=>{
  const a=flamer();a.key('g');a.drag(-60,0);a.el('joystick').fire('pointerup');const before=snapshot(a);
  assert.equal(a.el('grenade').dataset.ready,'false');assert.equal(a.el('grenade').disabled,false);a.el('grenade').click();assert.deepEqual(snapshot(a),before);
  openChoices(a);choose(a,'Flamethrower');a.u.ammo.flamethrower=0;a.u.ap=0;a.s.engaged=true;a.s.phase='player';a.advance(3);
  const empty=snapshot(a);assert.equal(a.el('grenade').disabled,false);assert.equal(a.el('grenade').dataset.ready,'false');a.el('grenade').click();assert.deepEqual(snapshot(a),empty);
  openChoices(a);assert.equal(a.el('control-picker').open,true);choose(a,'Grenade');assert.equal(a.s.solo.areaWeapon,'grenade');assert.deepEqual(snapshot(a),empty);
});

test('losing focus cannot leave the shared button stuck in its held-down state',()=>{
  const a=flamer();a.key('f');const before=snapshot(a);a.el('grenade').fire('pointerdown');assert.equal(a.el('grenade').dataset.ready,'false');
  a.events.get('blur')();a.advance(3);assert.equal(a.el('grenade').dataset.ready,'true');assert.deepEqual(snapshot(a),before);
  a.el('grenade').fire('pointercancel');
});

test('advanced inventory can select grenades and the shared button preference survives resume',()=>{
  const a=flamer(),before=snapshot(a);a.el('menu').click();action(a,'Inventory & weapons');action(a,'Select grenades');
  assert.equal(a.s.solo.areaWeapon,'grenade');assert.equal(a.el('grenade-label').textContent,'GRENADE');assert.deepEqual(snapshot(a),before);
  const resumed=app({autoDeploy:false,initialStorage:[...a.saved]});resumed.el('resume').click();
  assert.equal(resumed.s.solo.areaWeapon,'grenade');assert.equal(resumed.el('grenade-label').textContent,'GRENADE');assert.equal(resumed.u.weapon,'flamethrower');
});

test('equipping a carried flamethrower retains the normal AP cost and absent weapons cannot be selected',()=>{
  const a=flamer();Core.equip(a.s,a.u,'pistol');a.s.engaged=true;a.s.phase='player';a.u.ap=10;a.advance(3);
  assert.equal(a.el('grenade').dataset.kind,'grenade');openChoices(a);assert.match(options(a)[1]['aria-label'],/2 AP to equip/);choose(a,'Flamethrower');
  assert.equal(a.u.weapon,'flamethrower');assert.equal(a.u.ap,8);assert.equal(a.el('grenade').dataset.kind,'flamethrower');
  const b=app();openChoices(b);assert.equal(options(b)[1].disabled,true);const before=snapshot(b);options(b)[1].click();assert.deepEqual(snapshot(b),before);
});

test('opponent taps still open the flamethrower cone even after choosing grenades for the shared slot',()=>{
  const a=flamer();openChoices(a);choose(a,'Grenade');const guard=a.s.units[1];
  Object.assign(a.u,{x:4,y:25,heading:0});Object.assign(guard,{x:8,y:25,hp:100});for(const other of a.s.units.slice(2))other.hp=0;Core.refresh(a.s);
  const before=snapshot(a);a.view.options.onPick({unitId:guard.id});
  assert.equal(a.view.flameAiming,true);assert.equal(a.el('overlay').open,false);assert.equal(a.el('grenade').dataset.kind,'flamethrower');assert.equal(a.el('grenade-label').textContent,'FIRE');assert.deepEqual(snapshot(a),before);
});
