import test from 'node:test';
import assert from 'node:assert/strict';
import {EditingDocument} from '../dist/designer/a20b343a0234/tactics/editor-3d-controller.js';
import {blankMap} from '../dist/designer/a20b343a0234/tactics/core/maps.js';
import {placedWindows,placeWindow,removeWindow} from '../dist/window-authoring.js';
import {adaptAftSector} from '../dist/aft-sector.js';
import {createSoloGame,DEFAULT_BUILD,encodeSave,decodeSave} from '../dist/solo-game.js';
import {clipLegacyWindowBox} from '../dist/window-system.js';
import {windowReviewSource} from '../dist/window-review-map.js';

test('proving yard opens in the pinned designer and exports a playable ground-only map',()=>{
  const doc=new EditingDocument().open(JSON.stringify(windowReviewSource())),exported=doc.export(),reopened=new EditingDocument().open(exported),source=JSON.parse(exported);
  assert.equal(reopened.map.name,'Window proving yard');assert.equal(reopened.map.starts.length,4);assert.equal(reopened.map.exits.length,1);assert.ok(reopened.map.upper.every(layer=>!Object.keys(layer).length));
  assert.equal(placedWindows(reopened.map).length,9);assert.equal(adaptAftSector(source).windows.length,9);
  const state=createSoloGame(DEFAULT_BUILD,1,'window-yard',{authoredMap:source});assert.equal(state.units.length,3);assert.deepEqual([state.units[0].x,state.units[0].y],[20,25]);assert.equal(state.windows.find(p=>p.id==='borderless-five-storeys').dimensions.height,10.6);
});
test('existing editor export, import, undo and redo retain window IDs and replacement walls',()=>{
  const source=blankMap('Window authoring');source.edges['s:20:21']='wall-brick';source.edges['s:21:21']='window-brick';source.edges['s:22:21']='wall-concrete';
  const doc=new EditingDocument().open(JSON.stringify(source)),before=doc.export(),selection={type:'edge',edge:'s:20:21',z:0};
  doc.replace(placeWindow(doc.map,selection,'window.full.clear.3m',{id:'authored-one'}));
  assert.equal(placedWindows(doc.map)[0].id,'authored-one');assert.equal(doc.map.edges['s:21:21'],undefined);const exported=doc.export();
  assert.ok(doc.undo());assert.equal(doc.export(),before);assert.ok(doc.redo());assert.equal(doc.export(),exported);
  const reopened=new EditingDocument().open(exported);assert.equal(placedWindows(reopened.map)[0].id,'authored-one');assert.equal(adaptAftSector(JSON.parse(reopened.export())).windows[0].id,'authored-one');
  reopened.replace(removeWindow(reopened.map,'authored-one'));assert.equal(reopened.map.edges['s:21:21'],'window-brick');assert.equal(placedWindows(reopened.map).length,0);
});
test('authoring refuses doors, overlapping spans and upper floors',()=>{
  const map=blankMap('Windows');map.edges['e:20:21']='door-wood-closed';const edge={type:'edge',edge:'e:20:21',z:0};assert.throws(()=>placeWindow(map,edge,'window.waist.clear.2m',{id:'door'}),/door/);delete map.edges['e:20:21'];
  const next=placeWindow(map,edge,'window.waist.clear.2m',{id:'first'});assert.throws(()=>placeWindow(next,edge,'window.full.clear.3m',{id:'overlap'}),/overlap/);assert.throws(()=>placeWindow(map,{...edge,z:1},'window.full.clear.1m'),/ground/);
});
test('authored gameplay and its save resolve the same canonical window definitions',()=>{
  const source=blankMap('Authored playtest');source.terrain=source.terrain.map(row=>row.map(()=> 'yard'));source.starts=[{x:20,y:25,z:0}];const map=placeWindow(source,{type:'edge',edge:'s:20:21',z:0},'window.waist.grid-2x2.2m',{id:'saved-placement'});
  const s=createSoloGame(DEFAULT_BUILD,1,'window-yard',{authoredMap:map}),restored=decodeSave(encodeSave(s));assert.equal(restored.windows[0].id,'saved-placement');assert.equal(restored.windows[0].definitionId,'window.waist.grid-2x2.2m');
  assert.throws(()=>createSoloGame(DEFAULT_BUILD,1,'night-ledger',{authoredMap:map}),/playtest/);
});
test('editor clips only adjacent wall overhang and preserves door parts, upper floors and row zero',()=>{
  const covered=new Set(['s:20:0']),wall={source:{edge:'s:19:0'},center:[19,1,.5],size:[1.12,2,.16]},jamb={source:{edge:'s:10:0'},center:[9.55,1,.5],size:[.05,2,.2]};
  const clipped=clipLegacyWindowBox(wall,covered);assert.ok(Math.abs(clipped.center[0]+clipped.size[0]/2-19.5)<1e-8);assert.equal(clipLegacyWindowBox(jamb,covered),jamb);
  const upper={...wall,source:{edge:'s:19:0:1',z:1}};assert.equal(clipLegacyWindowBox(upper,covered),upper);assert.equal(clipLegacyWindowBox({...wall,source:{edge:'s:20:0:0'}},covered),null);
});
