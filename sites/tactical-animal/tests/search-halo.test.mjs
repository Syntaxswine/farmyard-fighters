import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {SearchHalo,searchHaloCandidates,searchHaloTarget,SEARCH_HALO_LIMIT} from '../dist/search-halo.js';
import {createSoloGame,hero,Core,encodeSave} from '../dist/solo-game.js';
import {blockWindow} from '../dist/world-grid.js';

test('gold marks only visible searchable contents, brightens within reach, and leaves discovery/save state unchanged',()=>{
  const state=createSoloGame(),before=encodeSave(state),body=state.interactables.find(object=>object.kind==='body');
  const candidates=searchHaloCandidates(state,blockWindow(state,hero(state)));
  assert.ok(candidates.some(object=>object.id==='supply-chest'&&object.strength===1));assert.ok(candidates.some(object=>object.id===body.id));
  assert.ok(candidates.every(object=>['chest','body'].includes(object.kind)));assert.equal(encodeSave(state),before);
  const chest=state.interactables.find(object=>object.kind==='chest');chest.inventory=[];assert.ok(!searchHaloCandidates(state).some(object=>object.id===chest.id));
  state.visible.clear();assert.equal(searchHaloCandidates(state).length,0);assert.ok(state.seen.size>0,'remembered terrain alone must not light an object');
});

test('LOS and camera residency exclude known items behind walls or outside the active window',()=>{
  const state=createSoloGame(),chest=state.interactables.find(object=>object.kind==='chest'),blocked=structuredClone(state);
  blocked.edges['s:5:23']='wall';blocked.visible.add(Core.key(chest.x,chest.y));
  assert.ok(!searchHaloCandidates(blocked).some(object=>object.id===chest.id));
  assert.equal(searchHaloCandidates(state,{x:20,y:1,w:10,h:10}).length,0);
  hero(state).hp=0;assert.equal(searchHaloCandidates(state).length,0);
});

test('dense loot stays bounded with deterministic nearest-item priority',()=>{
  const state=createSoloGame();state.interactables=Array.from({length:40},(_,i)=>({id:'loot-'+String(i).padStart(2,'0'),kind:'chest',x:5,y:23-i*.01,range:1.7,inventory:[{type:'dressing',quantity:1}]}));
  const result=searchHaloCandidates(state);assert.equal(result.length,SEARCH_HALO_LIMIT);assert.equal(result[0].id,'loot-00');
});

test('charred loot outlines its ash painting instead of resurrecting a dissolved body or highlighting flames',()=>{
  const body={kind:'body',unitId:4,strength:.55},unit={id:4,hp:0},rig=new T.Group(),ash=new T.Mesh(),view={state:{units:[unit]},actors:new Map([[4,{worker:{root:rig}}]]),burnEffects:{sessions:new Map([[4,{effects:{ash,group:new T.Group()}}]])}};
  assert.equal(searchHaloTarget(body,view).root,rig);assert.equal(searchHaloTarget(body,view).width,1.75);unit.burningTurns=1;assert.equal(searchHaloTarget(body,view).root,null);unit.burnedRemains=true;
  assert.equal(searchHaloTarget(body,view).root,ash);view.burnEffects.sessions.clear();assert.equal(searchHaloTarget(body,view).root,undefined);
  ash.geometry.dispose();ash.material.dispose();
});

test('silhouette proxies follow sprite/mesh contours, reuse their resources, and release only what the halo owns',()=>{
  const halo=new SearchHalo(),texture=new T.Texture(),material=new T.MeshStandardMaterial({map:texture}),geometry=new T.BoxGeometry(),root=new T.Group(),mesh=new T.Mesh(geometry,material),sprite=new T.Sprite(new T.SpriteMaterial({map:texture}));
  root.add(mesh,sprite);root.position.set(4,0,9);root.updateMatrixWorld(true);let borrowedDisposals=0;
  for(const resource of [texture,material,geometry])resource.addEventListener('dispose',()=>borrowedDisposals++);
  halo.sync([{root,strength:.55}]);assert.equal(halo.proxies.size,2);const first=halo.proxies.get(mesh),paint=halo.proxies.get(sprite);
  assert.equal(first.clone.geometry,geometry);assert.equal(first.clone.material.map,texture);assert.equal(paint.clone.material.map,texture);assert.deepEqual(first.clone.matrix.toArray(),mesh.matrixWorld.toArray());
  halo.sync([{root,strength:1}]);assert.equal(halo.proxies.get(mesh),first);assert.equal(first.materials[0].userData.strength.value,1);
  let retired=0;for(const record of halo.proxies.values())for(const material of record.materials)material.addEventListener('dispose',()=>retired++);
  root.visible=false;halo.sync([{root}]);assert.equal(halo.proxies.size,0);assert.equal(retired,2);assert.equal(borrowedDisposals,0);
  let fixedDisposed=0;for(const resource of [halo.field,halo.mask,halo.light,halo.edges,halo.composite,halo.quad.geometry])resource.addEventListener('dispose',()=>fixedDisposed++);
  halo.dispose();halo.dispose();assert.equal(fixedDisposed,6);assert.equal(borrowedDisposals,0);
  geometry.dispose();material.dispose();sprite.material.dispose();texture.dispose();
});

function renderer(){return {size:new T.Vector2(390,844),target:null,color:new T.Color(0x17241e),alpha:1,autoClear:true,shadowMap:{autoUpdate:true},capabilities:{maxSamples:4},passes:[],getSize(out){return out.copy(this.size);},getPixelRatio:()=>1.75,getRenderTarget(){return this.target;},setRenderTarget(value){this.target=value;},getClearColor(out){return out.copy(this.color);},getClearAlpha(){return this.alpha;},setClearColor(value,alpha){this.color.set(value);this.alpha=alpha;},render(scene){scene.updateMatrixWorld(true);this.passes.push(this.target);if(this.fail&&this.passes.length===2)throw Error('GPU fixture failure');}};}

test('body width uses its own mask pass while chest width, masks and renderer clearing stay intact',()=>{
  const state=createSoloGame(),chestObject=state.interactables.find(object=>object.kind==='chest'),halo=new SearchHalo(),r=renderer(),scene=new T.Scene(),body=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial()),chest=new T.Sprite(new T.SpriteMaterial()),visible=[];
  scene.add(body,chest);const view={interactionArt:{records:new Map([[chestObject.id,{sprite:chest}]])}};
  assert.equal(searchHaloTarget({...chestObject,strength:1},view).width,1);
  const render=r.render.bind(r);r.render=pass=>{if(pass===halo.maskScene)visible.push([...halo.proxies].filter(([,record])=>record.clone.visible).map(([source])=>source));render(pass);};
  halo.render(r,scene,new T.Camera(),[{root:body,width:1.75},{root:chest,width:1}],3000);
  assert.deepEqual(visible,[[chest],[body]]);assert.equal(r.passes.length,6);assert.equal(r.autoClear,true);assert.equal(halo.proxies.size,2);
  const materials=[...halo.proxies.values()].flatMap(record=>record.materials);halo.render(r,scene,new T.Camera(),[{root:body,width:2},{root:chest,width:1}],4000);
  assert.deepEqual([...halo.proxies.values()].flatMap(record=>record.materials),materials,'width changes reuse the existing masks and materials');
  halo.dispose();body.geometry.dispose();body.material.dispose();chest.material.dispose();
});

test('posed body masks share the current skeleton without changing or disposing the original rig',()=>{
  const halo=new SearchHalo(),geometry=new T.BoxGeometry(),material=new T.MeshBasicMaterial(),body=new T.SkinnedMesh(geometry,material),bone=new T.Bone();
  body.add(bone);const skeleton=new T.Skeleton([bone]);body.bind(skeleton);body.position.set(6,0,24);body.updateMatrixWorld(true);bone.rotation.z=.4;body.updateMatrixWorld(true);skeleton.update();
  const binding=body.bindMatrixInverse.clone(),pose=bone.matrixWorld.clone();halo.sync([{root:body}]);const proxy=halo.proxies.get(body).clone;halo.maskScene.updateMatrixWorld(true);
  assert.equal(proxy.skeleton,skeleton);assert.equal(proxy.geometry,geometry);assert.notEqual(proxy.bindMatrixInverse,body.bindMatrixInverse);assert.deepEqual(body.bindMatrixInverse.toArray(),binding.toArray());assert.deepEqual(bone.matrixWorld.toArray(),pose.toArray());
  let rigDisposed=0;skeleton.dispose=()=>rigDisposed++;halo.dispose();assert.equal(rigDisposed,0);geometry.dispose();material.dispose();
});

test('animation time changes without rebuilding proxies/targets, reduced motion freezes the light, and render failures restore state',()=>{
  let reduced=false;const halo=new SearchHalo({reducedMotion:()=>reduced}),r=renderer(),scene=new T.Scene(),root=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial());scene.add(root);
  halo.render(r,scene,new T.Camera(),[{root}],1000);const proxy=halo.proxies.get(root);assert.equal(halo.time.value,1);assert.equal(r.passes.length,4);assert.equal(halo.mask.width,293);assert.equal(halo.mask.height,633);
  halo.render(r,scene,new T.Camera(),[{root}],3000);assert.equal(halo.time.value,3);assert.equal(halo.proxies.get(root),proxy);
  reduced=true;halo.render(r,scene,new T.Camera(),[{root}],6000);assert.equal(halo.time.value,0);assert.equal(r.target,null);assert.equal(r.color.getHex(),0x17241e);assert.equal(r.shadowMap.autoUpdate,true);
  r.passes=[];r.fail=true;assert.throws(()=>halo.render(r,scene,new T.Camera(),[{root}],8000),/GPU fixture failure/);assert.equal(r.target,null);assert.equal(r.color.getHex(),0x17241e);assert.equal(r.shadowMap.autoUpdate,true);assert.equal(r.autoClear,true);
  r.fail=false;r.passes=[];halo.render(r,scene,new T.Camera(),[],9000);assert.equal(r.passes.length,1);halo.dispose();root.geometry.dispose();root.material.dispose();
});
