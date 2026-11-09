import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cycleStep,nextCameraFocus,bindPressHold} from '../dist/mobile-controls.js';

test('stance taps reverse at each end, always passing through kneeling',()=>{
  let value='standing',direction=1;const sequence=[value];
  for(let i=0;i<8;i++){({value,direction}=cycleStep(['standing','kneeling','prone'],value,direction));sequence.push(value);}
  assert.deepEqual(sequence,['standing','kneeling','prone','kneeling','standing','kneeling','prone','kneeling','standing']);
});
test('run and sneak taps always pass through off, including after a direct choice',()=>{
  let value='walk',direction=-1;const sequence=[value],values=['run','walk','sneak'];
  for(let i=0;i<5;i++){({value,direction}=cycleStep(values,value,direction));sequence.push(value);}
  assert.deepEqual(sequence,['walk','run','walk','sneak','walk','run']);
  assert.equal(cycleStep(values,'sneak',1).value,'walk');assert.equal(cycleStep(values,'run',-1).value,'walk');
});

test('the camera advances through every ranked opponent, then the animal, before starting again',()=>{
  const contacts=[{id:3},{id:1},{id:2}],sequence=[];let focusedId=null;
  for(let i=0;i<8;i++){focusedId=nextCameraFocus(contacts,focusedId)?.id??null;sequence.push(focusedId);}
  assert.deepEqual(sequence,[3,1,2,null,3,1,2,null]);
});
test('the eye recenters with no visible opponents and restarts after a focused contact disappears',()=>{
  assert.equal(nextCameraFocus([],null),null);assert.equal(nextCameraFocus([],1),null);
  assert.equal(nextCameraFocus([{id:2}],1).id,2);assert.equal(nextCameraFocus([{id:2}],2),null);
});

class Control extends EventTarget{setPointerCapture(){}}
function fire(button,type,props={}){const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:1,button:0,clientX:20,clientY:20,detail:1,...props});button.dispatchEvent(e);return e;}
test('a long press opens choices once and does not also cycle on release',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const b=new Control();let taps=0,holds=0,paused=false;
  bindPressHold(b,{tap:()=>taps++,hold:()=>{holds++;paused=true;},canUse:()=>!paused});
  fire(b,'pointerdown');t.mock.timers.tick(449);assert.equal(holds,0);t.mock.timers.tick(1);assert.equal(holds,1);
  fire(b,'pointerup');fire(b,'click');assert.equal(taps,0);
  paused=false;fire(b,'pointerdown');fire(b,'pointerup');fire(b,'click');assert.equal(taps,1);assert.equal(holds,1);
});
test('dragging away and pointer cancellation discard both hold and tap',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const b=new Control();let calls=0;
  bindPressHold(b,{tap:()=>calls++,hold:()=>calls++,canUse:()=>true});
  fire(b,'pointerdown');fire(b,'pointermove',{clientX:50});t.mock.timers.tick(600);fire(b,'pointerup');fire(b,'click');
  fire(b,'pointerdown');fire(b,'pointercancel');t.mock.timers.tick(600);fire(b,'click');assert.equal(calls,0);
});
test('keyboard activation remains available after a cancelled pointer and opens choices with down arrow',()=>{
  const b=new Control();let taps=0,holds=0;
  bindPressHold(b,{tap:()=>taps++,hold:()=>holds++,canUse:()=>true});
  fire(b,'pointerdown');fire(b,'pointercancel');fire(b,'click',{detail:0});fire(b,'keydown',{key:'ArrowDown'});
  assert.equal(taps,1);assert.equal(holds,1);
});

test('a secondary touch tap works without a browser click and suppresses any later duplicate',()=>{
  const b=new Control();let taps=0;bindPressHold(b,{tap:()=>taps++,hold:()=>{},canUse:()=>true});fire(b,'pointerdown',{pointerId:2,pointerType:'touch',isPrimary:false});fire(b,'pointerup',{pointerId:2,pointerType:'touch',isPrimary:false});assert.equal(taps,1);fire(b,'click');assert.equal(taps,1);fire(b,'click',{detail:0});assert.equal(taps,2);
});
