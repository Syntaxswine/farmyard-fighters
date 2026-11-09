import test from 'node:test';
import assert from 'node:assert/strict';
import {Core,DEFAULT_BUILD,createSoloGame,hero,geometry,encodeSave} from '../dist/solo-game.js';
import {blockWindow,pointInWorldRect} from '../dist/world-grid.js';

test('an RPG shot still respects an obstruction beyond the nine-block rendering window',()=>{
  // Isolated firing-range setup, separate from the legal mission playthrough.
  const s={...createSoloGame({...DEFAULT_BUILD,primary:'rpg'},1947,'road-checkpoint'),edges:{'e:74:160':'wall'},interactables:[],obstacles:[]},unit=hero(s),target=s.units[1];
  Object.assign(unit,{x:47.2,y:160,ap:20});Object.assign(target,{x:80,y:160});
  for(const guard of s.units.slice(2))Object.assign(guard,{x:220+guard.id,y:220});
  s.phase='player';s.engaged=true;
  s.detected=new Set([target.id]);s.visible=new Set(['47,160','80,160']);
  const window=blockWindow(s,unit);
  assert.equal(window.blocks.length,9);assert.equal(pointInWorldRect(target,window),false);
  assert.equal(pointInWorldRect({x:74.5,y:160},window),false);
  assert.equal(geometry(s).filter(box=>box.kind==='wall').length,1);
  const preview=Core.previewAttack(s,unit,target);
  assert.equal(preview.reason,'Blocked by a wall');assert.ok(preview.distance<Core.WEAPONS.rpg.range);
  const before=encodeSave(s);assert.equal(Core.attack(s,unit,target),false);assert.equal(encodeSave(s),before);
  // Removing the wall in an independent range fixture permits the same shot.
  assert.equal(Core.previewAttack({...s,edges:{}},unit,target).ok,true);
});
