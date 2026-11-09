import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const provenance=JSON.parse(fs.readFileSync(new URL('../designer-provenance.json',import.meta.url),'utf8'));
const entry=new URL('../dist/'+provenance.entry,import.meta.url);
const {EditingDocument}=await import(new URL('editor-3d-controller.js',entry));
const {blankMap,parseMap}=await import(new URL('core/maps.js',entry));
const {blockCanvas,extractBlock,isBlock,validateBlock}=await import(new URL('core/blocks.js',entry));
const placeCrate=document=>document.apply({tool:'prop',start:{x:12,y:12,z:0},options:{propKind:'crate-wood'}});

test('the imported designer opens and exports its original factory map',()=>{
  const original=fs.readFileSync(new URL('default-factory.json',entry),'utf8'),document=new EditingDocument().open(original);
  assert.equal(document.block,false);assert.ok(document.map.starts.length>0);
  const reopened=new EditingDocument().open(document.export());
  assert.equal(reopened.map.name,document.map.name);assert.equal(reopened.map.props.length,document.map.props.length);assert.equal(reopened.map.guards.length,document.map.guards.length);
  assert.equal(JSON.parse(reopened.export()).version,2);
});
test('placed scenery survives export, import, undo, and redo with the original map format',()=>{
  const document=new EditingDocument().open(JSON.stringify(blankMap('Farmyard test')));
  const before=document.export();assert.equal(placeCrate(document).ok,true);
  assert.equal(document.inspect(12,12,0,{mode:'prop'}).data.kind,'crate-wood');
  assert.equal(parseMap(document.export()).props.some(p=>p.x===12&&p.y===12&&p.kind==='crate-wood'),true);
  assert.equal(document.undo(),true);assert.equal(document.export(),before);
  assert.equal(document.redo(),true);
  assert.equal(new EditingDocument().open(document.export()).inspect(12,12,0,{mode:'prop'}).data.kind,'crate-wood');
});
test('reusable blocks keep their portable format and editing history',()=>{
  const document=new EditingDocument().open(JSON.stringify(extractBlock(blockCanvas('Farmyard block'))));
  assert.equal(document.block,true);assert.equal(document.size,24);assert.equal(placeCrate(document).ok,true);
  const exported=JSON.parse(document.export());assert.equal(isBlock(exported),true);assert.doesNotThrow(()=>validateBlock(exported));
  assert.equal(document.undo(),true);assert.equal(document.map.props.length,0);assert.equal(document.redo(),true);
  const reopened=new EditingDocument().open(document.export());assert.equal(reopened.block,true);assert.equal(reopened.map.props[0].kind,'crate-wood');
});
