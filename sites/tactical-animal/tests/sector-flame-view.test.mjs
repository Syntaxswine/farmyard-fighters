import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {FlameConePreview} from '../dist/flame-aim-view.js';
import {SoloFlameEffects} from '../dist/flame-effects.js';
import {recordFlame} from '../dist/flame-event.js';
import {flameScenario} from './flame-scenarios.mjs';

test('aim and discharge masks clip a fog hole at global sector coordinates and release resized textures',async()=>{
  const fixture=flameScenario(),unit={...fixture.unit,x:130,y:124,heading:0},visible=new Set();
  for(let y=110;y<140;y++)for(let x=115;x<150;x++)visible.add(`${x},${y}`);
  const shape=recordFlame(unit,10,[],visible),scene=new T.Scene(),aim=new FlameConePreview(scene),camera=new T.PerspectiveCamera();camera.position.set(140,14,136);
  let initialDisposed=0;aim.fog.addEventListener('dispose',()=>initialDisposed++);aim.update({shape,ok:true},visible);assert.equal(initialDisposed,1);
  const layer=new SoloFlameEffects(scene,{loadTexture:async()=>new T.Texture()});layer.enqueue({weapon:'flamethrower',flame:shape},0);
  const fire=layer.poseFor(unit);assert.ok(fire);layer.captureMuzzle(fire,{origin:new T.Vector3(130.55,1.17,124.02)});await layer.pending;
  const state={revision:1,visible};layer.beginFrame(0,state);layer.draw(state,camera);const slot=layer.slots[0];assert.equal(slot.group.visible,true);
  for(const mask of [aim,slot]){
    const {origin,width,height}=mask.rect,index=((124-origin.y)*width+131-origin.x)*4;
    assert.ok(origin.x>40&&origin.y>30);assert.ok(width<24&&height<24);assert.equal(mask.data.length,width*height*4);assert.equal(mask.data[index],255);
    assert.equal(mask.fog.image.width,width);assert.equal(mask.fog.image.height,height);
  }
  const aimTexture=aim.fog,fireTexture=slot.fog,aimBytes=aim.data,fireBytes=slot.data;visible.delete('131,124');
  aim.update({shape,ok:true},visible);layer.beginFrame(100,{revision:2,visible});layer.draw({revision:2,visible},camera);
  for(const mask of [aim,slot])assert.equal(mask.data[((124-mask.rect.origin.y)*mask.rect.width+131-mask.rect.origin.x)*4],0);
  assert.equal(aim.fog,aimTexture);assert.equal(slot.fog,fireTexture);assert.equal(aim.data,aimBytes);assert.equal(slot.data,fireBytes);
  for(const u of [aim.fill.material.uniforms,slot.sheets[0].material.uniforms]){assert.deepEqual(u.fogOrigin.value.toArray(),[slot.rect.origin.x,slot.rect.origin.y]);assert.deepEqual(u.fogSize.value.toArray(),[slot.rect.width,slot.rect.height]);}
  let disposed=0;for(const texture of [aimTexture,fireTexture])texture.addEventListener('dispose',()=>disposed++);aim.dispose();layer.dispose();assert.equal(disposed,2);assert.equal(scene.children.length,0);
});
