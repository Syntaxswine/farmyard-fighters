import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {SoloFlameEffects,FLAME_LIMITS} from '../dist/flame-effects.js';
import {FieldView} from '../dist/field-view.js';
import {Core,encodeSave} from '../dist/solo-game.js';
import {flameScenario} from './flame-scenarios.mjs';
import {pointInFlame,flameMuzzleInReach} from '../dist/flame-event.js';
const camera=new T.PerspectiveCamera();camera.position.set(14,16,34);
function shot({realtime=false}={}){const fixture=flameScenario();if(realtime){Core.enableRealtime(fixture.state);assert(Core.fireFlame(fixture.state,fixture.unit,0));}else Core.attack(fixture.state,fixture.unit,fixture.target);return {...fixture,event:fixture.state.effect.sequence[0]};}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function capture(layer,unit){const fire=layer.poseFor(unit);assert.ok(fire);layer.captureMuzzle(fire,{origin:new T.Vector3(unit.x+.55,1.17,unit.y+.02)});}
const frame=(layer,state,now)=>{layer.beginFrame(now,state);layer.draw(state,camera);};

test('the first shot waits for one lazy atlas load, then remains visible through slow frames without gameplay changes',async()=>{
  const {state,unit,event}=shot(),scene=new T.Scene(),load=deferred();let requests=0;
  const layer=new SoloFlameEffects(scene,{loadTexture:()=>{requests++;return load.promise;}}),before=encodeSave(state);
  assert.equal(requests,0);layer.enqueue(event,1000);capture(layer,unit);await Promise.resolve();assert.equal(requests,1);
  frame(layer,state,4000);assert.equal(scene.children.length,0);assert.equal(layer.queue.length,1);
  load.resolve(new T.Texture());await layer.pending;frame(layer,state,5000);assert.equal(layer.queue[0].elapsed,0);
  frame(layer,state,9000);assert.equal(layer.queue[0].elapsed,.56);assert.ok(layer.slots[0].sheets.every(mesh=>mesh.visible));assert.ok(layer.slots[0].plumes.some(mesh=>mesh.visible));
  assert.ok(layer.slots[0].sheets[0].geometry.drawRange.count>0);assert.equal(layer.slots[0].sheets[0].material.uniforms.map.value,layer.texture);
  assert.match(layer.slots[0].sheets[0].material.fragmentShader,/soloFog/);assert.match(layer.slots[0].sheets[0].material.fragmentShader,/wedges\[k\]/);
  frame(layer,state,13000);assert.equal(layer.queue[0].elapsed,1.24);frame(layer,state,17000);assert.equal(layer.queue.length,0);
  assert.equal(requests,1);assert.equal(encodeSave(state),before);layer.dispose();assert.equal(scene.children.length,0);
});

test('a real-time jet follows the fitted nozzle after movement and ignition without rewriting the committed shot',async()=>{
  const {state,unit,event}=shot({realtime:true}),layer=new SoloFlameEffects(new T.Scene(),{loadTexture:async()=>new T.Texture()}),recorded=JSON.stringify(event);
  layer.enqueue(event,100,{followSource:true});
  await layer.pending;
  assert(Core.travel(state,unit,1,0)>.99);
  frame(layer,state,0);assert.equal(layer.slots.length,0);
  frame(layer,state,100);frame(layer,state,660);
  assert.equal(layer.poseFor(unit),null);
  assert.equal(layer.poseFor(unit,{realtime:true})?.entry.event,event);
  const fire=layer.poseFor(unit,{realtime:true}),muzzle=new T.Vector3(unit.x+.45,1.17,unit.y+.02),before=encodeSave(state);
  layer.captureMuzzle(fire,{origin:muzzle});layer.draw(state,camera);
  assert.deepEqual(fire.entry.muzzle,muzzle);assert.equal(fire.entry.shape.origin.x,unit.x);assert.equal(fire.entry.shape.origin.y,unit.y);
  const slot=layer.slots[0],geometry=slot.sheets[0].geometry;
  assert(slot.group.visible&&slot.sheets.some(mesh=>mesh.visible));assert(new T.Vector3().fromBufferAttribute(geometry.getAttribute('position'),0).distanceTo(muzzle)<1e-5);
  assert.equal(encodeSave(state),before);assert.equal(JSON.stringify(event),recorded);
  assert(Core.travel(state,unit,0,.5)>.49);frame(layer,state,780);
  const moving=layer.poseFor(unit,{realtime:true}),next=new T.Vector3(unit.x+.45,1.13,unit.y+.02);assert.equal(moving.atSource,false);
  layer.captureMuzzle(moving,{origin:next});layer.draw(state,camera);assert.deepEqual(moving.entry.muzzle,next);assert.equal(slot.sheets[0].geometry,geometry);
  assert(new T.Vector3().fromBufferAttribute(geometry.getAttribute('position'),0).distanceTo(next)<1e-5);assert.equal(moving.entry.shape.source.heading,event.flame.source.heading);
  layer.dispose();
});

test('a moving real-time jet reclips against the current wall and hides when the nozzle passes it',async()=>{
 const {state,unit,event}=shot({realtime:true}),layer=new SoloFlameEffects(new T.Scene(),{loadTexture:async()=>new T.Texture()});
 layer.enqueue(event,0,{followSource:true});await layer.pending;frame(layer,state,0);frame(layer,state,560);assert(Core.travel(state,unit,1,0)>.99);
 const walled={...state,revision:state.revision+1,obstacles:[{kind:'wall',x0:6.4,x1:6.6,y0:20,y1:28,height:2}]};Core.refresh(walled,{forceFog:true});
 layer.beginFrame(640,walled);let fire=layer.poseFor(unit,{realtime:true});layer.captureMuzzle(fire,{origin:new T.Vector3(unit.x+.55,1.17,unit.y+.02)});layer.draw(walled,camera);
 assert(fire.entry.shape.rays[18].distance<1.4);assert.equal(fire.entry.shape.rays[18].kind,'wall');assert(layer.slots[0].group.visible);
 assert(Core.travel(walled,unit,1.1,0)>1.09);layer.beginFrame(780,walled);fire=layer.poseFor(unit,{realtime:true});layer.captureMuzzle(fire,{origin:new T.Vector3(unit.x+.55,1.17,unit.y+.02)});layer.draw(walled,camera);
 assert(!layer.slots[0].group.visible);assert.equal(event.flame.origin.x,4);layer.dispose();
});

test('the live cone and fog mask follow movement even without a revision bump and never expose a hidden source',async()=>{
 const {state,unit,event}=shot({realtime:true}),layer=new SoloFlameEffects(new T.Scene(),{loadTexture:async()=>new T.Texture()});layer.enqueue(event,0,{followSource:true});await layer.pending;frame(layer,state,0);frame(layer,state,560);
 const slot=layer.slots[0],old=slot.maskShape;unit.x+=1;layer.beginFrame(650,state);layer.captureMuzzle(layer.poseFor(unit,{realtime:true}),{origin:new T.Vector3(unit.x+.55,1.17,unit.y+.02)});layer.draw(state,camera);
 assert.notEqual(slot.maskShape,old);assert.equal(slot.maskShape.origin.x,unit.x);assert(slot.group.visible);
 const hidden={...state,revision:state.revision+1,visible:new Set(state.visible)};hidden.visible.delete(Math.round(unit.x)+','+Math.round(unit.y));frame(layer,hidden,740);assert(!slot.group.visible);assert(state.visible.has('4,25'));
 layer.dispose();
});

test('mask updates can hide ground during playback without finding victims or moving any actor',async()=>{
  const {state,unit,event}=shot(),layer=new SoloFlameEffects(new T.Scene(),{loadTexture:async()=>new T.Texture()}),before=encodeSave(state);
  layer.enqueue(event,0);capture(layer,unit);await layer.pending;frame(layer,state,0);frame(layer,state,560);
  const slot=layer.slots[0],{origin,width,height}=slot.rect;
  assert.equal(slot.data[((25-origin.y)*width+5-origin.x)*4],255);
  assert.equal(slot.fog.image.width,width);assert.equal(slot.fog.image.height,height);
  assert.deepEqual(slot.shared.fogOrigin.value.toArray(),[origin.x,origin.y]);assert.deepEqual(slot.shared.fogSize.value.toArray(),[width,height]);
  const hidden={...state,revision:state.revision+1,visible:new Set()};frame(layer,hidden,650);assert.ok(slot.data.every(byte=>byte===0));
  assert.equal(encodeSave(state),before);assert.equal(layer.poseFor({...unit,x:unit.x+.3}),null);assert.equal(layer.poseFor({...unit,hp:0}),null);assert.equal(layer.poseFor({...unit,weapon:'pistol'}),null);
  layer.dispose();
});

test('painted jets never appear beyond a recorded wall even if the model muzzle lies past it',async()=>{
  const {state,unit,event}=shot();event.flame.rays=event.flame.rays.map(ray=>({...ray,x:unit.x+.25,y:unit.y+(ray.y-unit.y)*.025,distance:.25,kind:'wall'}));
  const layer=new SoloFlameEffects(new T.Scene(),{loadTexture:async()=>new T.Texture()});layer.enqueue(event,0);capture(layer,unit);await layer.pending;frame(layer,state,0);frame(layer,state,560);
  assert.equal(layer.slots[0].group.visible,false);layer.dispose();
});

test('a distant occlusion seam beside the muzzle bearing cannot suppress the entire directional jet',async()=>{
  const {state,unit,event}=shot(),shape=event.flame;
  shape.rays=shape.rays.map((ray,i)=>{const angle=shape.heading-shape.halfAngle+2*shape.halfAngle*i/36,distance=i===20?10:9.4;return {...ray,x:unit.x+Math.cos(angle)*distance,y:unit.y+Math.sin(angle)*distance,distance,kind:i===20?'range':'wall'};});
  const muzzle={x:unit.x+.55,y:unit.y+.02};assert.equal(pointInFlame(shape,muzzle),false);assert.equal(flameMuzzleInReach(shape,muzzle),true);
  const layer=new SoloFlameEffects(new T.Scene(),{loadTexture:async()=>new T.Texture()});layer.enqueue(event,0);capture(layer,unit);await layer.pending;frame(layer,state,0);frame(layer,state,560);
  assert.equal(layer.slots[0].group.visible,true);assert.ok(layer.slots[0].plumes.some(mesh=>mesh.visible));assert.equal(layer.slots[0].shared.wedges.value[19],0,'the far seam stays clipped');layer.dispose();
});

test('reduced motion uses a brief static painted sheet and no moving plume cards',async()=>{
  const {state,unit,event}=shot(),layer=new SoloFlameEffects(new T.Scene(),{loadTexture:async()=>new T.Texture(),reducedMotion:()=>true});
  layer.enqueue(event,0);capture(layer,unit);await layer.pending;frame(layer,state,0);const slot=layer.slots[0];
  assert.ok(slot.sheets.every(mesh=>mesh.visible&&mesh.material.uniforms.clock.value===.5));assert.ok(slot.plumes.every(mesh=>!mesh.visible));
  frame(layer,state,190);assert.equal(layer.queue.length,0);assert.equal(slot.group.visible,false);layer.dispose();
});

test('reduced-motion real-time fire follows its moving nozzle without adding plume animation',async()=>{
 const {state,unit,event}=shot({realtime:true}),layer=new SoloFlameEffects(new T.Scene(),{loadTexture:async()=>new T.Texture(),reducedMotion:()=>true});layer.enqueue(event,0,{followSource:true});await layer.pending;frame(layer,state,0);assert(Core.travel(state,unit,.4,0)>.39);
 layer.beginFrame(100,state);const nozzle=new T.Vector3(unit.x+.55,1.17,unit.y+.02);layer.captureMuzzle(layer.poseFor(unit,{realtime:true}),{origin:nozzle});layer.draw(state,camera);const slot=layer.slots[0];assert(slot.group.visible);assert(slot.sheets.every(s=>s.visible&&s.material.uniforms.clock.value===.5));assert(slot.plumes.every(p=>!p.visible));assert(slot.muzzle.distanceTo(nozzle)<1e-8);frame(layer,state,190);assert.equal(layer.queue.length,0);layer.dispose();
});

test('bounded slots reuse geometry and atlas resources across bursts of flame and release them once',async()=>{
  const {state,unit,event}=shot(),scene=new T.Scene(),texture=new T.Texture();let loads=0,textureDisposals=0;
  texture.addEventListener('dispose',()=>textureDisposals++);
  const layer=new SoloFlameEffects(scene,{loadTexture:async()=>{loads++;return texture;}});
  for(let i=0;i<20;i++)layer.enqueue(event,0);assert.equal(layer.queue.length,FLAME_LIMITS.queued);capture(layer,unit);await layer.pending;frame(layer,state,0);frame(layer,state,560);
  assert.equal(layer.slots.length,2);assert.equal(scene.children.length,2);const geometry=layer.slots.map(slot=>slot.sheets.map(mesh=>mesh.geometry));
  for(let now=1000;now<=12000;now+=400)frame(layer,state,now);
  assert.equal(layer.queue.length,0);layer.enqueue(event,13000);capture(layer,unit);frame(layer,state,13000);frame(layer,state,13560);
  layer.slots.forEach((slot,i)=>slot.sheets.forEach((mesh,j)=>assert.equal(mesh.geometry,geometry[i][j])));assert.equal(loads,1);
  const disposed=[];for(const slot of layer.slots){slot.fog.addEventListener('dispose',()=>disposed.push('fog'));for(const mesh of slot.sheets){mesh.geometry.addEventListener('dispose',()=>disposed.push('geometry'));mesh.material.addEventListener('dispose',()=>disposed.push('material'));}}
  layer.dispose();layer.dispose();assert.equal(scene.children.length,0);assert.equal(textureDisposals,1);assert.equal(disposed.filter(item=>item==='geometry').length,6);assert.equal(disposed.filter(item=>item==='fog').length,2);
});

test('asset failure and pending loads after restart/dispose cannot block combat or resurrect effects',async()=>{
  const {state,unit,event}=shot(),load=deferred(),scene=new T.Scene();let errors=0,disposed=0;
  const layer=new SoloFlameEffects(scene,{loadTexture:()=>load.promise,onError:()=>errors++});layer.enqueue(event,0);capture(layer,unit);const pending=layer.pending;
  layer.reset();const stale=new T.Texture();stale.addEventListener('dispose',()=>disposed++);load.resolve(stale);await pending;
  assert.equal(disposed,1);assert.equal(layer.texture,null);assert.equal(layer.queue.length,0);assert.equal(scene.children.length,0);
  const failure=new SoloFlameEffects(scene,{loadTexture:async()=>{throw Error('missing atlas');},onError:()=>errors++});failure.enqueue(event,0);await failure.pending;
  assert.equal(failure.status,'failed');assert.equal(failure.queue.length,0);assert.equal(errors,1);assert.equal(unit.ap,14);assert.equal(unit.ammo.flamethrower,3);
  assert.equal(Core.reload(state,unit),true);failure.dispose();layer.dispose();
});

test('unresolved texture loads retire safely and late arrivals are disposed',async()=>{
  const {state,unit,event}=shot(),load=deferred(),layer=new SoloFlameEffects(new T.Scene(),{loadTexture:()=>load.promise,onError(){}});layer.enqueue(event,0);capture(layer,unit);const pending=layer.pending;
  frame(layer,state,16000);assert.equal(layer.status,'failed');assert.equal(layer.poseFor(unit),null);
  let disposed=false;const texture=new T.Texture();texture.addEventListener('dispose',()=>disposed=true);load.resolve(texture);await pending;assert.equal(disposed,true);layer.dispose();
});

test('the actual field effect dispatcher uses the painted layer for fire while retaining separate burst tracers',()=>{
  const {event}=shot(),scene=new T.Scene(),view=Object.assign(Object.create(FieldView.prototype),{scene,effects:[],flameEffects:{enqueue(record){assert.equal(record,event);},dispose(){this.disposed=true;}}});
  view.queueEffects({sequence:[event]},1000);assert.equal(view.effects.length,0);assert.equal(scene.children.length,0);
  view.queueEffects({sequence:[{weapon:'assault',ax:4,ay:25,bx:8,by:25,shots:3,shot:0},{weapon:'assault',ax:4,ay:25,bx:8,by:25,shots:3,shot:1},{weapon:'assault',ax:4,ay:25,bx:8,by:25,shots:3,shot:2}]},1000);
  assert.equal(view.effects.length,3);assert.deepEqual(view.effects.map(effect=>effect.line.visible),[true,false,false]);const flames=view.flameEffects;view.clearEffects();assert.equal(flames.disposed,true);assert.equal(view.flameEffects,null);assert.equal(scene.children.length,0);
});
