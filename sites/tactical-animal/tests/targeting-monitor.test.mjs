import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Core} from '../dist/solo-game.js';
import {spriteCandidates,targetRegion,createTargetMonitor} from '../dist/targeting-monitor.js';
import {app} from './app-harness.mjs';

const nodes=element=>[element,...element.children.flatMap(nodes)];
const button=(a,id)=>nodes(a.el('context')).find(node=>node.dataset.control===id);
const monitor=a=>nodes(a.el('context')).find(node=>node.className==='target-monitor');
function targeting({ap=14,weapon='assault',pose='standing'}={}){
  const a=app(),guard=a.s.units.find(unit=>unit.team==='guard'&&unit.hp>0);
  a.s.engaged=true;a.s.phase='player';a.u.ap=ap;a.u.weapon=weapon;a.u.ammo[weapon]=Core.WEAPONS[weapon].mag;
  guard.x=a.u.x+1;guard.y=a.u.y;guard.hp=1000;guard.stance=pose;a.s.detected.add(guard.id);
  a.view.options.onPick({unitId:guard.id});return {a,guard};
}

test('the CRT uses the selected visible guard sprite and authoritative hit chance for every body zone',()=>{
  const {a,guard}=targeting(),before={ap:a.u.ap,ammo:a.u.ammo.assault};
  assert.equal(monitor(a).dataset.zone,'torso');
  for(const zone of ['head','weapon','legs','torso']){
    button(a,'zone-'+zone).click();const screen=monitor(a),preview=Core.previewAttack(a.s,a.u,guard,false,zone,null,'full');
    assert.equal(screen.dataset.zone,zone);assert.equal(+screen.dataset.chance,preview.chance);
    assert.match(screen.dataset.sprite,/pig-foreman/);
    assert.ok(nodes(screen).some(node=>node.tagName==='rect'&&node['data-zone']===zone));
    assert.ok(nodes(screen).some(node=>node.textContent===`${preview.chance}%`));
  }
  assert.deepEqual({ap:a.u.ap,ammo:a.u.ammo.assault},before);
});

test('aim and burst changes refresh the monitor immediately and never fire during selection',()=>{
  const {a,guard}=targeting();button(a,'zone-head').click();
  button(a,'aim-hip').click();
  assert.equal(+monitor(a).dataset.chance,Core.previewAttack(a.s,a.u,guard,false,'head',null,'hip').chance);
  button(a,'aim-aimed').click();button(a,'burst').click();
  assert.equal(+monitor(a).dataset.chance,Core.previewAttack(a.s,a.u,guard,true,'head',null,'aimed').chance);
  assert.match(button(a,'fire')['aria-label'],/9 AP/);
  assert.equal(a.u.ap,14);assert.equal(a.u.ammo.assault,30);assert.equal(a.s.effect,undefined);
});

test('body locations precede aim, the wide Fire action precedes the final Single/Burst/Exit row, and Exit is free',()=>{
  const {a}=targeting(),root=a.el('context'),columns=root.children.find(node=>node.className==='shooting-columns');
  assert.equal(columns.children[0].className,'shooting-group zone-bank');
  assert.equal(columns.children[1].className,'shooting-group aim-bank');
  const trigger=root.children.find(node=>node.className==='shooting-group trigger-bank');
  assert.ok(root.children.indexOf(button(a,'fire'))<root.children.indexOf(trigger));
  assert.deepEqual(trigger.children[1].children.map(node=>node.dataset.control),['single','burst','exit']);
  button(a,'zone-head').click();button(a,'aim-hip').click();button(a,'burst').click();button(a,'exit').click();
  assert.equal(a.el('overlay').open,false);assert.equal(a.u.ap,14);assert.equal(a.u.ammo.assault,30);
  a.el('menu').click();assert.equal(monitor(a),undefined,'Exit clears the selected shot');
});

test('weapons without burst show Single and Exit and retain an independent explicit Fire action',()=>{
  for(const weapon of ['rifle','rpg','knife']){
    const {a}=targeting({weapon});
    assert.equal(button(a,'burst'),undefined);assert.ok(button(a,'single'));assert.ok(button(a,'fire'));assert.ok(button(a,'exit'));
    button(a,'single').click();assert.equal(a.u.ap,14);assert.equal(a.s.effect,undefined);
    button(a,'exit').click();assert.equal(a.el('overlay').open,false);assert.equal(a.u.ap,14);
  }
});

test('hidden or dead targets never produce a portrait, and losing visibility removes the existing preview',()=>{
  const {a,guard}=targeting();a.s.detected.delete(guard.id);button(a,'zone-head').click();assert.equal(monitor(a),undefined);
  assert.equal(createTargetMonitor(a.s,guard,{chance:80}),null);
  a.s.detected.add(guard.id);guard.hp=0;assert.equal(createTargetMonitor(a.s,guard,{chance:80}),null);
});

test('sprite fallbacks preserve species and disclose pose references rather than leaving an empty monitor',()=>{
  const {a}=targeting();const screen=monitor(a),original=screen.dataset.sprite;
  nodes(screen).find(node=>node.tagName==='image').fire('error');
  assert.notEqual(screen.dataset.sprite,original);assert.match(screen.dataset.sprite,/pig-foreman/);
  nodes(screen).find(node=>node.tagName==='image').fire('error');
  assert.equal(screen.dataset.signal,'unavailable');assert.ok(nodes(screen).some(node=>node.textContent==='TARGET IMAGE UNAVAILABLE'));
  assert.ok(nodes(screen).some(node=>/HIT$/.test(node.textContent)));
});

test('available species and poses resolve only existing inherited images with valid regions and framing',()=>{
  for(const species of ['horse','goat','bull','cow','donkey','sheep','skunk','pig-foreman','pig-director','rabbit','dog','hen'])for(const stance of ['standing','kneeling','prone']){
    const choices=spriteCandidates({species,stance,weapon:'rifle'});assert.ok(choices.length,`${species} ${stance}`);
    const sprite=choices[0];assert.ok(fs.existsSync(new URL(sprite.url)));const [iw,ih,x,y,w,h]=sprite.frame;
    assert.ok(w>0&&h>0&&x>=0&&y>=0&&x+w<=iw&&y+h<=ih);
    for(const zone of ['head','torso','weapon','legs']){const region=targetRegion(sprite,zone);assert.ok(region.x>=x&&region.y>=y&&region.x+region.width<=x+w&&region.y+region.height<=y+h);}
    if(['bull','rabbit','dog'].includes(species))assert.equal(sprite.reference,true);
    else assert.equal(sprite.pose,stance);
  }
});

test('Escape cancels the shot without firing and the AP-shortage feedback preserves the CRT selection',()=>{
  const {a}=targeting({ap:6});button(a,'aim-full').click();
  assert.equal(button(a,'aim-full').classList.contains('is-ap-short'),true);
  assert.equal(button(a,'aim-aimed')['aria-pressed'],'true');assert.equal(monitor(a).dataset.zone,'torso');
  a.el('overlay').fire('cancel');a.el('overlay').close();
  assert.equal(a.u.ap,6);assert.equal(a.u.ammo.assault,30);assert.equal(a.s.effect,undefined);
  a.el('menu').click();assert.equal(monitor(a),undefined);
});

test('targeting symbols keep the release version before their SVG fragment',async()=>{
  const {switchSymbol}=await import('../dist/shooting-controls.js?v=crt-review');
  const url=new URL(switchSymbol('exit'));
  assert.equal(url.search,'?v=crt-review');assert.equal(url.hash,'#exit');
  assert.match(url.pathname,/assets\/ui\/industrial-switches\/symbols\.svg$/);
});
