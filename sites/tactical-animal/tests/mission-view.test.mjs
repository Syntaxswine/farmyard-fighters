import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {FieldView,drawMinimap} from '../dist/field-view.js';
import {InteractionScenery} from '../dist/interaction-view.js';
import {createSoloGame,DEFAULT_BUILD,getMission} from '../dist/solo-game.js';

test('minimap objective and extraction markers use the active operation before and after collection',()=>{
  for(const id of ['night-ledger','short-measure']){
    const state=createSoloGame(DEFAULT_BUILD,1947,id),mission=getMission(id),dots=[];
    const context={fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},save(){},scale(){},translate(){},rotate(){},closePath(){},restore(){},fill(){},arc(x,y,r){dots.push({x,y,r,color:this.fillStyle});}};
    const canvas={width:380,height:280,getContext:()=>context};
    const xy=point=>{const scale=268/28;return {x:(380-38*scale)/2+(point.x-1)*scale,y:6+(point.y-1)*scale};};
    const objectives=()=>dots.filter(d=>['#df613f','#c4d29a'].includes(d.color));
    drawMinimap(canvas,state);assert.equal(objectives().length,2);
    assert.deepEqual(objectives().map(({x,y,color})=>({x,y,color})),[{...xy(mission.objective),color:'#df613f'},{...xy(mission.extraction),color:'#c4d29a'}]);
    state.solo.objectives[mission.objective.id]=true;dots.length=0;drawMinimap(canvas,state);
    assert.deepEqual(objectives().map(({x,y,color})=>({x,y,color})),[{...xy(mission.extraction),color:'#c4d29a'}]);
  }
});

test('replacing a field clears pending effects, old actors, gestures, and grenade camera framing',()=>{
  const view=Object.create(FieldView.prototype),line=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial()),scene=new T.Scene();scene.add(line);
  let geometryDisposed=false,materialDisposed=false,cleared=false,built=null,released=null,routed=null,actorDisposed=false;
  line.geometry.addEventListener('dispose',()=>geometryDisposed=true);line.material.addEventListener('dispose',()=>materialDisposed=true);
  Object.assign(view,{scene,effects:[{line,at:99999,started:false}],lastEffect:{},pointers:new Map([[9,{}]]),container:{hasPointerCapture:()=>true,releasePointerCapture:id=>released=id},gesture:{},pinch:{},grenadeCamera:{baseSpan:31},returnSpan:31,focusedId:2,follow:false,span:31,generation:4,samples:new Map([[0,{}]]),failed:new Set([2]),actors:new Map([[1,{}]]),pending:new Map([[2,4]]),target:new T.Vector3(5,0,24),disposeActor(){actorDisposed=true;},clearEnvironment(){cleared=true;},buildEnvironment(s){built=s;},updateCamera(){},resize(){},route(path){routed=path;}});
  const state=createSoloGame(DEFAULT_BUILD,1947,'short-measure');view.setGame(state);
  assert.equal(view.generation,5);assert.equal(cleared,true);assert.equal(built,state);assert.equal(actorDisposed,true);
  assert.equal(geometryDisposed,true);assert.equal(materialDisposed,true);assert.deepEqual(scene.children,[view.tankEffects.flashLight]);assert.equal(view.tankEffects.flashLight.intensity,0);assert.deepEqual(view.effects,[]);assert.equal(view.lastEffect,null);
  assert.equal(released,9);assert.equal(view.pointers.size,0);assert.equal(view.pending.size,0);assert.equal(view.actors.size,0);assert.equal(view.samples.size,0);assert.equal(view.failed.size,0);
  assert.equal(view.grenadeCamera,null);assert.equal(view.returnSpan,null);assert.equal(view.gesture,null);assert.equal(view.pinch,null);assert.equal(view.focusedId,null);assert.equal(view.follow,true);assert.equal(view.span,18.72);
  assert.deepEqual(view.target.toArray(),[4,0,25]);assert.deepEqual(routed,[]);
  view.clearEffects();assert.equal(scene.children.length,0);
});

test('inspectable blockout markers and horizontal doors respect map knowledge and saved inspection state',()=>{
  const state=createSoloGame(DEFAULT_BUILD,1947,'short-measure'),view=Object.create(InteractionScenery.prototype),marker=new T.Mesh(new T.OctahedronGeometry(.18),new T.MeshStandardMaterial()),leaf=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());
  view.records=new Map([['worker-scale',{marker}],['packing-south',{leaf}]]);
  view.update(state);assert.equal(marker.visible,false);assert.equal(leaf.visible,false);assert.equal(view.picks.length,0);
  state.visible.add('8,20');state.seen.add('8,20');state.seen.add('19,17');view.update(state);
  // The ration scale now stands around this clue, so its marker floats above the prop.
  assert.equal(marker.visible,true);assert.deepEqual(marker.position.toArray(),[8,2,20]);assert.equal(leaf.visible,true);
  assert.ok(Math.abs(leaf.scale.x-1.12)<1e-6);assert.equal(leaf.scale.y,2);assert.ok(Math.abs(leaf.scale.z-.16)<1e-6);
  const before=marker.material.color.getHex();state.solo.inspected.push('worker-scale');view.update(state);assert.notEqual(marker.material.color.getHex(),before);
  assert.equal(view.picks.length,2);marker.geometry.dispose();marker.material.dispose();leaf.geometry.dispose();leaf.material.dispose();
});

test('field loading waits for the GPU warm-up draw and releases its fence on completion or replacement',()=>{
  const view=Object.create(FieldView.prototype),fence={},deleted=[],loading=[];let status=1;
  const gl={TIMEOUT_EXPIRED:1,clientWaitSync:value=>{assert.equal(value,fence);return status;},deleteSync:value=>deleted.push(value)};
  Object.assign(view,{renderer:{getContext:()=>gl},graphicsFence:fence,pending:new Map(),failed:new Set(),effects:[],onLoading:value=>loading.push(value)});
  view.reportLoading();assert.deepEqual(loading,[true]);assert.equal(view.waitingForGraphics(),true);assert.equal(deleted.length,0);
  status=2;assert.equal(view.waitingForGraphics(),false);assert.equal(view.graphicsFence,null);assert.deepEqual(deleted,[fence]);assert.equal(loading.at(-1),false);
  view.graphicsFence=fence;view.clearEffects();assert.equal(view.graphicsFence,null);assert.deepEqual(deleted,[fence,fence]);
});
