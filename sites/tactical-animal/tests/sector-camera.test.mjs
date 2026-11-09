import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {FieldView} from '../dist/field-view.js';
import {clampCameraPoint,groundCameraExtents,residentCameraSpan} from '../dist/render-residency.js';
import {blockWindow} from '../dist/world-grid.js';
import {Core,createSoloGame,DEFAULT_BUILD,hero} from '../dist/solo-game.js';

test('real orthographic ground corners remain inside residency at maximum landscape zoom, seams and sector edges',()=>{
  const state=createSoloGame(DEFAULT_BUILD,1947,'road-checkpoint'),view=Object.assign(Object.create(FieldView.prototype),{state,camera:new T.OrthographicCamera(),target:new T.Vector3(),container:{clientWidth:844,clientHeight:390},span:35,requestedSpan:35});
  const ray=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),0);
  for(const [width,height]of [[844,390],[390,844],[320,640]])for(const x of [0,23.49,23.5,47.49,47.5,71.49,71.5,120,215.5,239])for(const y of [0,47.49,47.5,120,239]){
    view.container.clientWidth=width;view.container.clientHeight=height;view.target.set(x,0,y);view.updateCamera();
    const window=view.residentWindow,extent=groundCameraExtents({width,height});
    assert.ok(window.blocks.length<=25);
    assert.ok(Math.max(-.5,x-extent.x*view.span)>=window.x-.5-1e-5);assert.ok(Math.min(239.5,x+extent.x*view.span)<=window.x+window.w-.5+1e-5);
    assert.ok(Math.max(-.5,y-extent.y*view.span)>=window.y-.5-1e-5);assert.ok(Math.min(239.5,y+extent.y*view.span)<=window.y+window.h-.5+1e-5);
    for(const a of [-1,1])for(const b of [-1,1]){
      ray.setFromCamera(new T.Vector2(a,b),view.camera);const point=ray.ray.intersectPlane(plane,new T.Vector3());assert.ok(point);
      if(point.x>=-.5&&point.x<=239.5&&point.z>=-.5&&point.z<=239.5)assert.ok(point.x>=window.x-.5-1e-5&&point.x<=window.x+window.w-.5+1e-5&&point.z>=window.y-.5-1e-5&&point.z<=window.y+window.h-.5+1e-5);
    }
    assert.ok(residentCameraSpan(state,{x,y},{width,height},13)>12.99,'close phone framing remains available');
  }
  view.target.set(-1000,0,1000);view.updateCamera();assert.deepEqual(view.target.toArray(),[0,0,239]);
  assert.deepEqual(clampCameraPoint(state,{x:120,y:121}),{x:120,y:121});
});

test('legacy missions preserve their zoom range and void-rim camera bounds',()=>{
  for(const id of ['night-ledger','short-measure']){
    const state=createSoloGame(DEFAULT_BUILD,1947,id);
    assert.equal(residentCameraSpan(state,{x:5,y:24},{width:844,height:390},35),35);assert.equal(residentCameraSpan(state,{x:5,y:24},{width:390,height:844},6),6);
    assert.deepEqual(clampCameraPoint(state,{x:-1,y:1000}),{x:1,y:28});
  }
});

test('portrait follow fits the merc and spotted contacts within a readable zoom',()=>{
  const state=createSoloGame(DEFAULT_BUILD,1947,'road-checkpoint');
  Core.enableRealtime(state);
  const player=hero(state),[near,far]=state.units.filter(u=>u.team==='guard');
  Object.assign(player,{x:100,y:100});Object.assign(near,{x:115,y:95});Object.assign(far,{x:80,y:115});
  const width=390,height=844,base=18.72;
  const view=Object.assign(Object.create(FieldView.prototype),{state,camera:new T.OrthographicCamera(),target:new T.Vector3(player.x,0,player.y),
    container:{clientWidth:width,clientHeight:height,getBoundingClientRect:()=>({left:0,top:0,width,height})},span:base,requestedSpan:base,follow:true});
  let now=0;
  const advance=()=>{for(let i=0;i<120;i++)view.updateFollowCamera(state,now+=1000/60);};
  const onScreen=unit=>[0,1.8].every(h=>view.projectWorldPoint({...unit,h}).visible);
  state.detected.clear();advance();
  assert.ok(Math.abs(view.span-base)<.01);
  assert.equal(onScreen(near),false);

  state.detected.add(near.id);state.detected.add(far.id);advance();
  assert.ok(view.span>base&&view.span<=height/20);
  assert.ok(onScreen(player)&&onScreen(near));
  const feet=view.projectWorldPoint(player),head=view.projectWorldPoint({...player,h:1.8});
  assert.ok(feet.y-head.y>=26);
  assert.deepEqual([...state.detected],[near.id,far.id]);

  assert.ok(view.focusOpponent(near.id));advance();
  assert.ok(onScreen(near)&&Math.abs(view.span-base)<.01);
  view.center();advance();
  assert.ok(onScreen(player)&&onScreen(near));
  Object.assign(near,{x:102,y:101});state.detected.delete(far.id);advance();
  assert.ok(Math.abs(view.span-base*1.15)<.02,'a contact already in frame still gets a small pullback');
  state.detected.clear();advance();
  assert.ok(Math.abs(view.span-base)<.01&&Math.hypot(view.target.x-player.x,view.target.z-player.y)<.02);
});
