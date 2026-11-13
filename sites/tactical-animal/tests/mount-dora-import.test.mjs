import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {TownWorld} from '../dist/mount-dora-world.js';

const pin=JSON.parse(fs.readFileSync(new URL('../mount-dora-import.json',import.meta.url)));
const base=new URL('../../../maps/mount-dora/',import.meta.url);
const digest=file=>createHash('sha256').update(fs.readFileSync(new URL(file,base))).digest('hex');

test('the imported town retains the reviewed upstream map, layout and mature-tree plan together',()=>{
  assert.equal(pin.source.commit,'8395204ce6b60aa20cc8936fc89fe4a40192920c');
  for(const [file,key]of [['project.json','projectSHA256'],['features.json','featuresSHA256'],['authored-buildings.json','authoredLayoutSHA256'],['source/retained-mature-trees.json','retainedTreePlanSHA256']])assert.equal(digest(file),pin.content[key],file);
  const trees=JSON.parse(fs.readFileSync(new URL('source/retained-mature-trees.json',base))).trees;
  assert.equal(trees.filter(t=>t.kind.startsWith('tree-pine')).length,pin.content.maturePines);
  assert.equal(trees.filter(t=>t.kind.startsWith('tree-broadleaf')).length,pin.content.matureBroadleaves);
});

test('the imported town keeps Fighters low cover and explicit object heights in production geometry',()=>{
  const project=JSON.parse(fs.readFileSync(new URL('project.json',base)));
  // Declared synthetic adapter fixture; it places no new object in geographic data.
  const art={PLACEMENTS:[{id:'synthetic-low-cover',kind:'crate',bounds:[10,10,12,12],collisionPolicy:'additional-solids',solids:[{kind:'circle',centre:[11,11],radius:.4,height:.65,cover:true}]}]};
  const world=new TownWorld(project,{art});
  try{
    const boxes=world.geometryBoxes([10,10,12,12]);assert.equal(boxes.length,1);
    assert.equal(boxes[0].height,.65);assert.equal(boxes[0].cover,true);
  }finally{world.dispose();}
});
