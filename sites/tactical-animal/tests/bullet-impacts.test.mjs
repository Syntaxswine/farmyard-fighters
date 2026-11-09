import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {BodyImpactEffects} from '../dist/body-impact-effects.js';
import {FieldView} from '../dist/field-view.js';
import {Core,createSoloGame,DEFAULT_BUILD,encodeSave,geometry,hero,tick} from '../dist/solo-game.js';
import {traceEnd} from '../dist/weapon-feedback.js';
import {WINDOW_REVIEW_ID,windowReviewSource} from '../dist/window-review-map.js';

function yard(wall=false){
  const source=windowReviewSource();
  source.farmyardWindows.instances=[];
  source.edges=wall?{'e:21:25':'wall-brick'}:{};
  source.guards=wall?[]:[{x:25,y:25,species:'pig-foreman',weapon:'pistol',heading:0}];
  const state=Core.enableRealtime(createSoloGame({...DEFAULT_BUILD,primary:'smg'},1,WINDOW_REVIEW_ID,{authoredMap:source}));
  hero(state).stats.firearms=hero(state).stats.dexterity=100;
  return state;
}

function shoot(state,target){
  const unit=hero(state);
  assert.ok(Core.attack(state,unit,target));
  for(let i=0;i<25;i++){
    tick(state,.05);
    const shot=state.effect?.sequence.find(event=>event.shooter===unit.id);
    if(shot)return shot;
  }
  assert.fail('No committed player shot');
}

function field(state){
  const view=Object.assign(Object.create(FieldView.prototype),{state,scene:new T.Scene(),camera:new T.OrthographicCamera(),effects:[],actors:new Map()});
  view.camera.position.set(24,14,36);view.camera.lookAt(20,0,25);
  return view;
}

test('a visible SMG hit plays the borrowed painted burst at the committed entrance contact',async()=>{
  const state=yard(),victim=state.units[1];
  const event=shoot(state,victim),impact=event.bodyImpact;
  assert.equal(event.impact?.unitId,victim.id);
  assert.ok(victim.hp<victim.maxHp&&impact);
  assert.ok(impact.contact.x>event.ax&&impact.contact.x<event.bx);
  const view=field(state),texture=new T.Texture();
  let released=false;texture.addEventListener('dispose',()=>{released=true;});
  const effects=view.bodyImpacts=new BodyImpactEffects(view.scene,{loadTexture:async()=>texture});
  const before=encodeSave(state);
  try{
    view.queueEffects({sequence:[event]},100);
    view.drawShotTraces(state,100);
    assert.equal(effects.pending.length,1);
    await effects.ready;
    effects.draw(state,view.camera,120);
    assert.equal(effects.pool.active,1);
    assert.ok(effects.pool.effect.mesh.visible);
    const slot=effects.pool.slots.find(slot=>slot.active);
    assert.ok(new T.Vector3().setFromMatrixPosition(slot.matrix).distanceTo(new T.Vector3(impact.contact.x,impact.contact.h,impact.contact.y))<1e-7);
    assert.equal(view.effects[0].impact,undefined);
    const hidden={...state,visible:new Set()};
    effects.draw(hidden,view.camera,140);
    assert.equal(effects.pool.effect.mesh.visible,false);
    effects.draw(state,view.camera,700);
    assert.equal(effects.pool.active,0);
    assert.equal(encodeSave(state),before);
  }finally{view.clearEffects();}
  assert.equal(view.scene.children.length,0);
  assert.equal(released,true);
});

test('a resolved wall hit uses the AFT marker at the collision point',()=>{
  const state=yard(true),aim={x:24,y:25,h:1.1,ground:true};
  state.seen.add(Core.key(aim.x,aim.y));
  const event=shoot(state,aim),wall=geometry(state).find(box=>box.kind==='wall');
  assert.ok(event.missImpact);
  assert.equal(event.traceEnd,undefined);
  assert.equal(event.bodyImpact,undefined);
  assert.ok(Math.abs(event.bx-wall.x0)<1e-7);
  const view=field(state);
  try{
    view.queueEffects({sequence:[event]},100);
    view.drawShotTraces(state,100);
    const {impact}=view.effects[0];
    assert.ok(impact?.visible&&impact.position.equals(traceEnd(event)));
    assert.equal(impact.material.color.getHex(),0xd5b78a);
    view.drawShotTraces({...state,visible:new Set()},120);
    assert.equal(impact.visible,false);
  }finally{view.clearEffects();}
  assert.equal(view.scene.children.length,0);
});
