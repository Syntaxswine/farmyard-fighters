import test from 'node:test';
import assert from 'node:assert/strict';
import {recordFlame,flameMaskRect,flameFogMask} from '../dist/flame-event.js';

const source={id:0,species:'sheep',stance:'standing',heading:0,x:174,y:125};
const visible=new Set(Array.from({length:31},(_,y)=>Array.from({length:31},(_,x)=>`${159+x},${110+y}`)).flat());
const pixel=(rect,x,y)=>((y-rect.origin.y)*rect.width+x-rect.origin.x)*4;

test('flame masks follow local recorded cells at large global coordinates',()=>{
  const shape=recordFlame(source,10,[],visible),rect=flameMaskRect(shape),later=new Set(visible);later.delete('176,125');
  assert.deepEqual(rect,{origin:{x:163,y:114},width:23,height:23});
  const bytes=flameFogMask(shape,later);assert.equal(bytes.length,23*23*4);
  assert.equal(bytes[pixel(rect,174,125)],255);assert.equal(bytes[pixel(rect,176,125)],0);
  later.add('159,110');assert.equal(bytes[pixel(rect,163,114)],0,'Rectangle corners outside the recorded circle remain hidden.');
  assert.equal(flameFogMask(shape,new Set(),bytes,rect),bytes);assert.ok(bytes.every(value=>value===0));
});

test('local masks retain shot-time holes, accept negative coordinates, and safely size reused buffers',()=>{
  const shape={origin:{x:-2,y:150},visibleCells:['-2,150','-1,150','-2,151']},rect=flameMaskRect(shape);
  assert.deepEqual(rect,{origin:{x:-2,y:150},width:2,height:2});
  const mask=flameFogMask(shape,new Set(['-2,150','-1,150','-2,151','-1,151']),new Uint8Array(1),rect);
  assert.equal(mask.length,16);assert.equal(mask[pixel(rect,-2,151)],255);assert.equal(mask[pixel(rect,-1,151)],0);
  assert.deepEqual(flameMaskRect({...shape,visibleCells:[]}),{origin:{x:-2,y:150},width:1,height:1});
  assert.deepEqual([...flameFogMask({...shape,visibleCells:[]},visible)],[0,0,0,0]);
});
