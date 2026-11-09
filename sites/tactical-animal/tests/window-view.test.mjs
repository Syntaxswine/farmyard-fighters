import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {WindowScenery,WindowEffects,windowResident} from '../dist/window-view.js';
import {windowSystem} from '../dist/window-catalogue.js';
import {windowReviewSource} from '../dist/window-review-map.js';
const fixture=()=>({map:windowReviewSource().terrain,windows:windowReviewSource().farmyardWindows.instances,seen:new Set(Array.from({length:30},(_,y)=>Array.from({length:35},(_,x)=>`${x},${y}`)).flat()),visible:new Set(['20,22','24,22','25,22','26,22']),revision:0});
const rect={x:0,y:0,w:48,h:48};
test('a seam-spanning window remains one asset until its whole footprint leaves residency',()=>{
  const s=fixture(),r=windowSystem.compile(s).find(r=>r.placement.id==='clear-b');assert.ok(windowResident(r,{x:0,y:0,w:24,h:24}));assert.ok(windowResident(r,{x:0,y:24,w:24,h:24}));
  const art=new WindowScenery(s);art.update(s,rect);const original=art.assets.get('clear-b');art.update(s,{x:0,y:24,w:24,h:24});assert.equal(art.assets.get('clear-b'),original);
  art.update(s,{x:96,y:96,w:48,h:48});assert.equal(art.assets.size,0);assert.equal(art.library.stats().assets,0);art.dispose();art.dispose();
});
test('accepted pane break cues are once-only, bounded, cleared on leaving and never replayed on restore',()=>{
  const s=fixture(),scene=new T.Scene(),fx=new WindowEffects(scene,s,{reduced:()=>false});let sounds=0;fx.sound=()=>sounds++;
  const event=windowSystem.breakPane(s,'clear-a','r0c0',{x:20,y:21.5,h:1.1});fx.observe(s,0,rect,()=>140);assert.ok(fx.holds('clear-a','r0c0'));assert.equal(fx.stats().active,0);fx.observe(s,141,rect,()=>140);assert.equal(fx.stats().active,1);assert.equal(sounds,1);
  fx.observe(s,200,rect);assert.equal(sounds,1);assert.equal(s.windowEvents.length,1);fx.observe(s,220,{x:96,y:96,w:48,h:48});assert.equal(fx.stats().active,0);assert.equal(scene.children.length,0);fx.observe(s,230,rect);assert.equal(fx.stats().active,0);
  const restored=new WindowEffects(scene,s);restored.observe(s,240,rect);assert.equal(restored.stats().active,0);assert.equal(event.sequence,1);restored.dispose();fx.dispose();
});
test('one blast cannot exceed the shared mobile triangle budget; tiny panes use less work',()=>{
  const s=fixture(),scene=new T.Scene(),fx=new WindowEffects(scene,s,{reduced:()=>false});windowSystem.blast(s,{x:25,y:23},3);fx.observe(s,0,rect);assert.equal(fx.stats().active,6);assert.ok(fx.stats().triangles<=210);
  fx.observe(s,2300,rect);assert.equal(fx.stats().active,0);assert.equal(scene.children.length,0);fx.dispose();
});
test('removed glass and its reflection stay hidden after leaving and revisiting a chunk',()=>{
  const s=fixture(),art=new WindowScenery(s);windowSystem.breakPane(s,'grid-a','r0c1',{x:25,y:21.5,h:.5});art.update(s,rect);let asset=art.assets.get('grid-a');assert.equal(asset.isPaneVisible('r0c1'),false);assert.equal(asset.isPaneVisible('r1c1'),true);assert.equal(asset.panes.get('r0c1').root.visible,false);
  art.update(s,{x:96,y:96,w:48,h:48});art.update(s,rect);asset=art.assets.get('grid-a');assert.equal(asset.isPaneVisible('r0c1'),false);assert.equal(asset.isPaneVisible('r1c1'),true);art.dispose();
});
test('real mesh ray hits supply the specific pane and height rather than a rounded tile',()=>{
  const s=fixture(),art=new WindowScenery(s);art.update(s,rect);const ray=new T.Raycaster(new T.Vector3(25,.4,25),new T.Vector3(0,0,-1));
  const hit=ray.intersectObjects(art.picks,false)[0];assert.equal(hit.object.userData.windowId,'grid-a');assert.equal(hit.object.userData.windowPaneId,'r0c1');assert.ok(Math.abs(hit.point.y-.4)<1e-8);
  windowSystem.breakPane(s,'grid-a','r0c1',{x:25,y:21.5,h:.4});art.update(s,rect);assert.equal(ray.intersectObjects(art.picks,false).some(h=>h.object.userData.windowId==='grid-a'&&h.object.userData.windowPaneId==='r0c1'),false);art.dispose();
});
test('an audio decode completing after disposal cannot play a stale break',async()=>{
  const fx=new WindowEffects(new T.Scene(),fixture());let ready,plays=0;fx.audioReady=new Promise(resolve=>ready=resolve);fx.audio={state:'running',createBufferSource(){plays++;},close:()=>Promise.resolve()};
  fx.sound();fx.dispose();fx.buffer={};ready();await Promise.resolve();await Promise.resolve();assert.equal(plays,0);assert.equal(fx.stats().voices,0);
});
