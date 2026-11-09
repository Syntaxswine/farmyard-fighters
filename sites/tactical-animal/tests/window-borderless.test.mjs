import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {BORDERLESS_WINDOW_ID,describeWindow} from '../dist/art/windows/catalog.js';
import {createWindowLibrary} from '../dist/art/windows/geometry.js';
import {windowSystem,windowDefinition} from '../dist/window-catalogue.js';
import {WindowScenery,WindowEffects,windowResident} from '../dist/window-view.js';
import {Core,createSoloGame,DEFAULT_BUILD,hero,geometry,confirmedImpact,encodeSave,decodeSave} from '../dist/solo-game.js';
import {placeWindow,authoredWindowDimensions,placedWindows} from '../dist/window-authoring.js';
import {EditingDocument} from '../dist/designer/a20b343a0234/tactics/editor-3d-controller.js';
import {blankMap} from '../dist/designer/a20b343a0234/tactics/core/maps.js';
import {windowReviewSource} from '../dist/window-review-map.js';
import {adaptAftSector} from '../dist/aft-sector.js';
const sheet=(id='large-a',y=12.5)=>({id,definitionId:BORDERLESS_WINDOW_ID,x:24.5,y,rotation:0,dimensions:{width:20,height:10.6}});
function game(){const s=structuredClone(createSoloGame({...DEFAULT_BUILD,utility:'grenade'},1,'window-yard'));s.windows=[sheet(),sheet('large-b',7.5),{id:'divided',definitionId:'window.full.grid-3x2.3m',x:25,y:21.5,rotation:0}];s.edges={};s.units=s.units.slice(0,1);s.detected.clear();s.phase='player';hero(s).ap=99;for(let y=0;y<30;y++)for(let x=10;x<40;x++){s.seen.add(`${x},${y}`);s.visible.add(`${x},${y}`);}return s;}
test('metre tiles and storeys convert explicitly while the framed definitions keep their original height',()=>{
  assert.deepEqual(authoredWindowDimensions('20','5','metres'),{width:20,height:5});assert.deepEqual(authoredWindowDimensions('20','5','storeys'),{width:20,height:10.6});
  const a=windowDefinition(BORDERLESS_WINDOW_ID,{}, {width:20,height:5}),b=windowDefinition(BORDERLESS_WINDOW_ID,{}, {width:20,height:10.6});assert.equal(a.height,5);assert.equal(b.height,10.6);assert.notEqual(a.raw.cacheKey,b.raw.cacheKey);assert.equal(windowDefinition('window.full.clear.3m').height,2);assert.equal(describeWindow('window.full.borderless.3m').height,2.12);
});
test('one tall sheet survives residency that contains only its outer portion',()=>{
  const s=game(),record=windowSystem.compile(s)[0],outer={x:0,y:0,w:24,h:24};assert.ok(record.placement.x>outer.x+outer.w-.5);assert.ok(windowResident(record,outer));assert.equal(record.edges.length,20);assert.deepEqual(record.spec.panes.map(p=>p.id),['r0c0']);assert.equal(record.spec.solids.length,0);
  const art=new WindowScenery(s);art.update(s,outer);assert.ok(art.assets.has('large-a'));assert.equal(art.assets.get('large-a').paneWorldBounds('r0c0').max[1],10.6);art.dispose();
  const envelope=geometry(s).find(b=>b.windowId==='large-a'&&b.kind==='glass');assert.equal(envelope.height,10.6);assert.equal(envelope.x1-envelope.x0,20);assert.ok(!geometry(s).some(b=>b.windowId==='large-a'&&b.kind==='wall'));
});
test('an accepted click above two metres breaks the whole sheet once and leaves other instances intact',()=>{
  const s=game(),a=hero(s),point={ground:true,windowId:'large-a',x:20,y:12.5,h:9};assert.ok(Core.previewPointAttack(s,a,point).ok);const impact=confirmedImpact(s,a,point);assert.equal(impact.box.windowId,'large-a');assert.ok(impact.point.h>8.9);
  assert.ok(Core.attack(s,a,point));assert.deepEqual(s.windowBreaks['large-a'],['r0c0']);assert.equal(windowSystem.broken(s,'large-b','r0c0'),false);assert.equal(s.windowSequence,1);assert.equal(s.windowEvents.length,1);assert.ok(!geometry(s).some(b=>b.windowId==='large-a'&&b.kind==='glass'));
  a.ap=99;assert.ok(Core.attack(s,a,point));assert.equal(s.windowSequence,1);assert.equal(s.windowEvents.length,1);assert.equal(Core.previewPointAttack(s,a,{...point,h:10.7}).ok,false);
  const fx=new WindowEffects(new T.Scene(),s);fx.observe(s,0,{x:0,y:0,w:24,h:24});assert.equal(fx.stats().active,0);fx.dispose();
});
test('dimensions and one damage identity round-trip through the actual editor and operation save',()=>{
  const source=blankMap('Large sheet');for(let x=15;x<35;x++)source.edges[`s:${x}:12`]=x%2?'wall-brick':'window-concrete';
  const doc=new EditingDocument().open(JSON.stringify(source)),before=doc.export();doc.replace(placeWindow(doc.map,{type:'edge',edge:'s:15:12',z:0},BORDERLESS_WINDOW_ID,{id:'authored-large',dimensions:{width:20,height:10.6}}));const exported=doc.export();
  assert.ok(doc.undo());assert.equal(doc.export(),before);assert.ok(doc.redo());assert.equal(doc.export(),exported);const reopened=new EditingDocument().open(exported);assert.deepEqual(placedWindows(reopened.map)[0].dimensions,{width:20,height:10.6});
  const s=createSoloGame(DEFAULT_BUILD,1,'window-yard',{authoredMap:JSON.parse(reopened.export())});windowSystem.breakPane(s,'authored-large','r0c0',{x:20,y:12.5,h:9});const saved=encodeSave(s),restored=decodeSave(saved);assert.deepEqual(restored.windows[0].dimensions,{width:20,height:10.6});assert.deepEqual(restored.windowBreaks['authored-large'],['r0c0']);assert.equal(restored.windowEvents,undefined);
  const forged=JSON.parse(saved);forged.windows[0].bounds={min:[0,0,0],max:[1,999999,1]};assert.equal(windowSystem.compile(decodeSave(JSON.stringify(forged)))[0].spec.height,10.6);
  const malformed=JSON.parse(saved);malformed.solo.authoredMap.farmyardWindows.instances[0].dimensions.height=null;assert.throws(()=>decodeSave(JSON.stringify(malformed)));
  const missing=JSON.parse(saved);delete missing.solo.authoredMap.farmyardWindows.instances[0].dimensions;assert.throws(()=>decodeSave(JSON.stringify(missing)),/retain its dimensions/);
});
test('borderless geometry has continuous broad faces without tile caps or structural strips',()=>{
  const library=createWindowLibrary(),asset=library.build(BORDERLESS_WINDOW_ID,{dimensions:{width:20,height:10.6}});assert.equal(asset.panes.size,1);assert.equal(asset.solidParts().length,0);assert.equal(asset.spec.sill,0);assert.equal(asset.spec.frameDepth,0);let lines=0;asset.root.traverse(o=>{if(o.isLine)lines++;});assert.equal(lines,0);
  const mesh=asset.panes.get('r0c0').glass,indices=mesh.geometry.index,normals=mesh.geometry.attributes.normal;assert.equal(indices.count,12);for(let i=0;i<indices.count;i++){const vertex=indices.getX(i);assert.equal(normals.getX(vertex),0);assert.equal(normals.getY(vertex),0);assert.equal(Math.abs(normals.getZ(vertex)),1);}
  const bounds=asset.paneWorldBounds('r0c0');assert.equal(bounds.max[0]-bounds.min[0],20);assert.equal(bounds.max[1]-bounds.min[1],10.6);asset.setPaneVisible('r0c0',false);assert.equal(asset.isPaneVisible('r0c0'),false);asset.dispose();library.dispose();
});
test('malformed and unrepresentable dimensions are rejected without trusting saved raw bounds',()=>{
  for(const dimensions of [{width:0,height:5},{width:241,height:5},{width:20.5,height:5},{width:20,height:0},{width:20,height:-1},{width:20,height:Infinity},{width:20,height:NaN},{width:20,height:1e308},{width:'20',height:5},{width:20,height:5,units:'unknown'}]){const s=game();s.windows=[{...sheet(),dimensions}];assert.throws(()=>windowSystem.compile(s));}
  const valid=game();valid.windows=[{...sheet(),dimensions:{width:20,height:80}}];assert.equal(windowSystem.compile(valid)[0].spec.height,80);
});
test('divided cells remain independent beside a large one-pane sheet',()=>{
  const s=game();windowSystem.breakPane(s,'large-a','r0c0',{x:20,y:12.5,h:9});windowSystem.breakPane(s,'divided','r0c1',{x:25,y:21.5,h:.5});const panes=geometry(s).filter(b=>b.windowId==='divided'&&b.kind==='glass');assert.equal(panes.length,5);assert.equal(windowSystem.broken(s,'large-b','r0c0'),false);
});
test('one accepted large-sheet break uses one bounded effect and cannot replay after leaving',()=>{
  const s=game(),scene=new T.Scene(),fx=new WindowEffects(scene,s),outer={x:0,y:0,w:24,h:24};assert.ok(Core.attack(s,hero(s),{ground:true,windowId:'large-a',x:20,y:12.5,h:9}));
  fx.observe(s,0,outer);assert.equal(fx.stats().active,1);assert.ok(fx.stats().triangles<=70);assert.ok(fx.active[0].effect.duration>2.2);fx.observe(s,10,{x:96,y:96,w:24,h:24});assert.equal(fx.stats().active,0);fx.observe(s,20,outer);assert.equal(fx.stats().active,0);fx.dispose();
});
test('the playable large-sheet fixture suppresses every old wall strip without adding upper traversal',()=>{
  const s=createSoloGame(DEFAULT_BUILD,1,'window-yard'),record=windowSystem.compile(s).find(r=>r.placement.id==='borderless-five-storeys');assert.equal(record.edges.length,20);for(const edge of record.edges)assert.equal(s.edges[edge],undefined);
  assert.equal(geometry(s).some(b=>b.kind==='wall'&&b.y0<=12.5&&b.y1>=12.5&&b.x1>14.5&&b.x0<34.5),false);
  const source=windowReviewSource();source.upper=[{'20,12':'floor'}];assert.throws(()=>adaptAftSector(source),/unsupported vertical traversal/);
});
