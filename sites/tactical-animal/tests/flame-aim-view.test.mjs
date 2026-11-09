import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {FlameConePreview} from '../dist/flame-aim-view.js';
import {recordFlame} from '../dist/flame-event.js';
import {Core,encodeSave} from '../dist/solo-game.js';
import {flameScenario} from './flame-scenarios.mjs';
import {FieldView} from '../dist/field-view.js';

test('the area preview reuses bounded buffers, masks current fog, and disposes its resources once',()=>{
  const {state,unit}=flameScenario(),before=encodeSave(state),scene=new T.Scene(),preview=new FlameConePreview(scene);
  const geometry=preview.fill.geometry,edge=preview.outline.geometry;let disposed=0;
  for(const resource of [geometry,edge,preview.fill.material,preview.outline.material,preview.fog])resource.addEventListener('dispose',()=>disposed++);
  for(let heading=0;heading<360;heading+=5)preview.update(Core.previewFlame(state,unit,heading),state.visible);
  assert.equal(preview.fill.geometry,geometry);assert.equal(preview.outline.geometry,edge);assert.ok(geometry.drawRange.count<=108);assert.ok(edge.drawRange.count<=216);
  assert.ok(preview.bytes.some(byte=>byte===255));preview.update(Core.previewFlame(state,unit,0),new Set());assert.ok(preview.bytes.every(byte=>byte===0));
  assert.match(preview.fill.material.fragmentShader,/texture2D\(fogMask/);assert.equal(encodeSave(state),before);preview.hide();assert.equal(preview.root.visible,false);
  preview.dispose();preview.dispose();assert.equal(disposed,5);assert.equal(scene.children.length,0);
});

test('cone triangles end before walls and never join an occlusion gap',()=>{
  const {state,unit}=flameScenario(),shape=recordFlame({...unit,heading:0},10,[{kind:'wall',x0:6.4,x1:6.6,y0:20,y1:28}],state.visible),layer=new FlameConePreview(new T.Scene());
  layer.update({shape,ok:true},state.visible);const buffer=layer.fill.geometry.getAttribute('position');
  for(let i=0;i<layer.fill.geometry.drawRange.count;i++)assert.ok(buffer.getX(i)<6.4);
  shape.rays=shape.rays.map((ray,i)=>({...ray,kind:i%2?'fog':'wall'}));layer.update({shape,ok:true},state.visible);
  assert.equal(layer.fill.geometry.drawRange.count,0);assert.equal(layer.root.visible,false);layer.dispose();
});

test('the real area camera restores follow after cancel and preserves the original zoom',()=>{
  const {state,unit}=flameScenario(),scene=new T.Scene(),camera=new T.OrthographicCamera(),container={clientWidth:390,clientHeight:844};
  const view=Object.assign(Object.create(FieldView.prototype),{scene,camera,container,state,span:13,target:new T.Vector3(),pointers:new Map(),marker:new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial()),blastMarker:{},blastArea:{},pathLine:new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial()),resize(){this.updateCamera();}});
  view.beginFlameAim();view.previewFlame(0,Core.previewFlame(state,unit,0));view.trackGrenadeCamera(0);
  assert.equal(view.grenadeCamera.kind,'flame');assert.equal(view.follow,false);assert.ok(view.span>=13);assert.equal(view.flameAim.heading,0);
  view.endFlameAim();assert.equal(view.grenadeCamera,null);assert.equal(view.returnSpan,13);assert.equal(view.follow,true);assert.equal(view.flameAim,null);assert.equal(view.flameCone.root.visible,false);
  view.beginFlameAim();view.previewFlame(0,Core.previewFlame(state,unit,0));view.endFlameAim({linger:1});view.flameEffects={queue:[{}]};
  const later=performance.now()+1000;view.trackGrenadeCamera(later);assert.ok(view.grenadeCamera,'pending first-shot artwork retains the area camera');
  view.flameEffects.queue=[];view.trackGrenadeCamera(later+100);assert.equal(view.grenadeCamera,null);assert.equal(view.returnSpan,13);view.flameEffects=null;
  view.effects=[];view.clearEffects();view.marker.geometry.dispose();view.marker.material.dispose();view.pathLine.geometry.dispose();view.pathLine.material.dispose();
});
