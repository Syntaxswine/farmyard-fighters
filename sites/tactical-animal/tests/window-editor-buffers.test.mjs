import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createWindowLibrary} from '../dist/art/windows/geometry.js';
import {WINDOW_IDS,BORDERLESS_WINDOW_ID} from '../dist/art/windows/catalog.js';
import {adoptWindowBuffers} from '../dist/window-editor-buffers.js';

test('artist window buffers renderable in an iframe retain their exact data and shared ownership',()=>{
  const iframe=vm.runInNewContext('({Float32Array,Uint16Array,Uint32Array})'),library=createWindowLibrary();let foreign=0;
  try{for(const id of [...WINDOW_IDS,BORDERLESS_WINDOW_ID]){
    const asset=library.build(id,id===BORDERLESS_WINDOW_ID?{dimensions:{width:20,height:10.6}}:{}),buffers=new Map();
    asset.root.traverse(object=>{if(object.geometry)for(const attribute of [object.geometry.index,...Object.values(object.geometry.attributes)].filter(Boolean))buffers.set(attribute,[...attribute.array]);});
    for(const attribute of buffers.keys())if(!(attribute.array instanceof iframe[attribute.array.constructor.name]))foreign++;
    const bounds=asset.paneWorldBounds('r0c0');assert.equal(adoptWindowBuffers(asset.root,iframe),asset.root);
    for(const [attribute,values]of buffers){assert.ok(attribute.array instanceof iframe[attribute.array.constructor.name]);assert.deepEqual([...attribute.array],values);}
    assert.deepEqual(asset.paneWorldBounds('r0c0'),bounds);const arrays=[...buffers.keys()].map(attribute=>attribute.array);adoptWindowBuffers(asset.root,iframe);assert.ok([...buffers.keys()].every((attribute,i)=>attribute.array===arrays[i]));asset.dispose();
  }assert.ok(foreign>0);assert.equal(library.stats().assets,0);}finally{library.dispose();}
});
