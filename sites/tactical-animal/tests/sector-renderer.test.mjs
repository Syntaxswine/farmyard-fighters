import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {OriginalEnvironment,groundSurface} from '../dist/original-art.js';
import {InteractionScenery} from '../dist/interaction-view.js';
import {FieldView,drawMinimap} from '../dist/field-view.js';
import {createSoloGame,DEFAULT_BUILD,encodeSave,hero} from '../dist/solo-game.js';
import {blockWindow} from '../dist/world-grid.js';

const renderer={capabilities:{getMaxAnisotropy:()=>4}};
function assets(){
  const calls=[],textures=[];
  return {calls,textures,load(url,ready){calls.push(url);const texture=new T.Texture({width:1254,height:1254});textures.push(texture);queueMicrotask(()=>ready?.(texture));return texture;},async loadAsync(url){return this.load(url);}};
}
// The inherited cargo label is a canvas painting. Geometry tests need only its
// real library and material/texture ownership, without a browser rasterizer.
const canvasDocument={createElement:()=>({getContext:()=>new Proxy({},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)})})};
const checkpoint=()=>createSoloGame(DEFAULT_BUILD,1947,'road-checkpoint',{layoutVersion:1});

test('actual checkpoint scenery streams nine blocks, retains six across an interior seam, and never reloads shared art',async()=>{
  const prior=globalThis.document;globalThis.document=canvasDocument;
  const state=checkpoint(),loader=assets(),view=new OriginalEnvironment(renderer,state,{loader}),saved=encodeSave(state);
  try{
    await view.ready;
    assert.equal(view.chunks.size,9);assert.equal(view.root.children.length,9);
    assert.equal(groundSurface(state,21,112),'concrete');assert.equal(groundSurface(state,120,120),'grass');
    const focus={x:60,y:118};view.update(state,hero(state),blockWindow(state,focus));
    const old=new Map(view.chunks),created=view.stats.created,disposed=view.stats.disposed,requests=loader.calls.length;
    let sharedDisposals=0;for(const resource of [...view.textures,...view.materials,view.cube])resource.addEventListener('dispose',()=>sharedDisposals++);
    view.update(state,hero(state),blockWindow(state,{x:84,y:118}));
    assert.equal([...view.chunks].filter(([id,chunk])=>old.get(id)===chunk).length,6);
    assert.equal(view.stats.created-created,3);assert.equal(view.stats.disposed-disposed,3);assert.equal(sharedDisposals,0);
    for(let pass=0;pass<2;pass++)for(let y=12;y<240;y+=24)for(let x=12;x<240;x+=24){
      view.update(state,hero(state),blockWindow(state,{x,y}));
      assert.equal(view.chunks.size,9);assert.equal(view.root.children.length,9);
      assert.equal([...view.chunks.values()].flatMap(chunk=>chunk.grounds).reduce((n,batch)=>n+batch.records.length,0),72*72);
    }
    assert.equal(loader.calls.length,requests);assert.equal(new Set(loader.calls).size,requests);
    assert.equal(encodeSave(state),saved,'culling must not edit world state or remembered terrain');
    view.dispose();assert.equal(sharedDisposals,view.textures.length+view.materials.length+1);assert.equal(view.chunks.size,0);
  }finally{view.dispose();globalThis.document=prior;}
});

test('unexplored checkpoint geometry is prebuilt but its walls and original prop paintings stay hidden',async()=>{
  const prior=globalThis.document;globalThis.document=canvasDocument;
  const state=checkpoint(),loader=assets();state.seen.clear();state.visible.clear();
  const view=new OriginalEnvironment(renderer,state,{loader});
  try{
    await view.ready;const chunks=[...view.chunks.values()],walls=chunks.flatMap(chunk=>chunk.walls),cargo=chunks.flatMap(chunk=>chunk.cargo),bags=chunks.flatMap(chunk=>chunk.sandbags);
    assert.equal(bags.length,2);assert.ok(cargo.length>0);assert.ok(walls.length>0);
    assert.ok(walls.every(batch=>batch.mesh.count===0));assert.ok(cargo.every(batch=>batch.mesh.count===0));assert.ok(bags.every(({sprite})=>!sprite.visible));
    for(const chunk of chunks)for(const {mesh}of chunk.grounds)assert.ok(mesh.instanceColor.array.every(value=>value===0));
    for(const p of state.props){state.seen.add(`${p.x},${p.y}`);state.visible.add(`${p.x},${p.y}`);}
    for(const edge of Object.keys(state.edges)){const [,x,y]=edge.split(':');state.seen.add(`${x},${y}`);}
    view.update(state,hero(state),view.window);
    assert.ok(bags.every(({sprite})=>sprite.visible&&sprite.scale.x<=.961&&sprite.scale.y===.92));assert.ok(cargo.some(batch=>batch.mesh.count>0));
    const batch=walls.find(batch=>batch.mesh.count),matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3();batch.mesh.getMatrixAt(0,matrix);matrix.decompose(position,new T.Quaternion(),scale);assert.equal(scale.y,2);
    assert.ok(!chunks.flatMap(chunk=>chunk.source.walls).some(wall=>`${wall.axis}:${wall.x}:${wall.y}`==='s:21:115'),'persistent door has one authoritative leaf');
  }finally{view.dispose();globalThis.document=prior;}
});

test('interaction leaves and materials retire with their chunk and restore saved open/inspection state on revisit',async()=>{
  const state=checkpoint(),loader=assets(),view=new InteractionScenery(state,{loader}),door=state.interactables.find(object=>object.kind==='door'),before=encodeSave(state);
  await Promise.resolve();const first=view.records.get(door.id).leaf,paint=first.material.map;let disposed=0,textureDisposed=0;
  first.material.addEventListener('dispose',()=>disposed++);paint.addEventListener('dispose',()=>textureDisposed++);
  view.update(state,blockWindow(state,{x:180,y:180}));assert.equal(view.records.size,0);assert.equal(disposed,1);assert.equal(textureDisposed,0);assert.equal(encodeSave(state),before);
  door.open=true;state.seen.add('21,115');view.update(state,blockWindow(state,hero(state)));
  const replacement=view.records.get(door.id).leaf;assert.notEqual(replacement,first);assert.equal(replacement.material.map,paint);assert.equal(replacement.visible,true);
  assert.ok(replacement.scale.z>replacement.scale.x,'revisited horizontal door uses its saved open footprint');
  assert.equal(loader.calls.length,3);view.dispose();view.dispose();assert.equal(textureDisposed,1);assert.equal(view.records.size,0);
});

test('actor graphics reuse a bounded warm pool and release older rigs without deleting simulation units',()=>{
  const state=checkpoint(),snapshot=encodeSave(state),scene=new T.Scene(),retired=[];
  const view=Object.assign(Object.create(FieldView.prototype),{scene,actors:new Map(),parkedActors:new Map(),samples:new Map(),pending:new Map(),disposeActor(actor){retired.push(actor);}});
  for(let id=0;id<40;id++){
    const root=new T.Group(),actor={root};scene.add(root);view.actors.set(id,actor);view.pending.set('stale',{});
    view.reconcileActors([{id}]);assert.equal(view.actors.size,1);assert.ok(view.parkedActors.size<=8);assert.equal(scene.children.length,1);assert.equal(view.pending.size,0);
  }
  const cached=view.parkedActors.get(38);view.reconcileActors([{id:38}]);assert.equal(view.actors.get(38),cached);assert.equal(scene.children[0],cached.root);assert.ok(retired.length>20);assert.equal(encodeSave(state),snapshot);
});

test('the full-sector minimap fits far remembered cells and plots only currently detected opponents',()=>{
  const state=checkpoint(),rects=[],dots=[],arrows=[];state.seen=new Set(['0,0','239,239']);state.detected=new Set([state.units[1].id]);state.units[1].x=220;state.units[1].y=200;
  const context={fillRect(x,y,w,h){rects.push({x,y,w,h});},beginPath(){},moveTo(){},lineTo(){},stroke(){},save(){},scale(){},translate(x,y){arrows.push({x,y});},rotate(){},closePath(){},restore(){},fill(){},arc(x,y,r){dots.push({x,y,r,color:this.fillStyle});}};
  drawMinimap({width:240,height:240,getContext:()=>context},state);
  assert.equal(rects.length,3);assert.equal(rects[1].x,6);assert.equal(rects[2].x,6+239*.95);assert.equal(rects[2].y,6+239*.95);
  assert.deepEqual(dots.filter(dot=>dot.color==='#e16a47').map(({x,y})=>({x,y})),[{x:6+220*.95,y:6+200*.95}]);assert.equal(arrows.length,1);
});

test('late atlas arrivals after an operation closes dispose themselves without rebuilding retired chunks',async()=>{
  const state=checkpoint(),loader=assets(),resolvers=[];loader.loadAsync=()=>new Promise(resolve=>resolvers.push(resolve));
  const view=new OriginalEnvironment(renderer,state,{loader});view.dispose();const retired=view.stats.disposed;
  let disposed=0;for(const resolve of resolvers){const texture=new T.Texture();texture.addEventListener('dispose',()=>disposed++);resolve(texture);}
  await view.ready;assert.equal(disposed,2);assert.equal(view.chunks.size,0);assert.equal(view.root.children.length,0);assert.equal(view.stats.disposed,retired);
});
