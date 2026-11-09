import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_BLOCK_SIZE,WORLD_SECTOR_SIZE,gridDimensions,worldBounds,blockForPoint,blockWindow,pointInWorldRect} from '../dist/world-grid.js';

test('240-metre sector exposes a 72-metre nine-block window',()=>{
  assert.equal(WORLD_BLOCK_SIZE,24);assert.equal(WORLD_SECTOR_SIZE,240);
  const world={width:240,height:240},window=blockWindow(world,{x:120,y:120});
  assert.deepEqual(gridDimensions(world),{width:240,height:240});
  assert.equal(window.blocks.length,9);assert.equal(window.w,72);assert.equal(window.h,72);
  assert.equal(new Set(window.blocks.map(b=>b.id)).size,9);
  assert.ok(window.blocks.every(b=>b.w===24&&b.h===24));
});

test('crossing the true tile seam retains six blocks and replaces three',()=>{
  assert.deepEqual(blockForPoint({x:47.499,y:110}),{x:1,y:4});
  assert.deepEqual(blockForPoint({x:47.5,y:110}),{x:2,y:4});
  const world={width:240,height:240},a=blockWindow(world,{x:47.499,y:110}),b=blockWindow(world,{x:47.5,y:110});
  const retained=b.blocks.filter(block=>a.blocks.some(old=>old.id===block.id));
  assert.equal(retained.length,6);assert.equal(b.blocks.length-retained.length,3);
  assert.equal(pointInWorldRect({x:47.5,y:110},b),true);
});

test('corners retain nine blocks without leaving world bounds; small maps need only four',()=>{
  for(const x of [-100,0,239,999])for(const y of [-100,0,239,999]){
    const window=blockWindow({width:240,height:240},{x,y});
    assert.equal(window.blocks.length,9);
    assert.ok(window.blocks.every(b=>b.x>=0&&b.y>=0&&b.x+b.w<=240&&b.y+b.h<=240));
  }
  const small={map:Array.from({length:30},()=>Array(40).fill('yard'))};
  assert.deepEqual(worldBounds(small),{x:1,y:1,w:38,h:28});
  assert.deepEqual(worldBounds({...small,worldBounds:{x:0,y:0,w:40,h:30}}),{x:0,y:0,w:40,h:30});
  const window=blockWindow(small,{x:5,y:24});
  assert.equal(window.blocks.length,4);assert.equal(window.w,40);assert.equal(window.h,30);
});
