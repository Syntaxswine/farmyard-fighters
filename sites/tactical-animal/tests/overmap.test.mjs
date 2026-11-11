import test from 'node:test';
import assert from 'node:assert/strict';
import {generateOvermap} from '../dist/overmap-generator.js';
import {validateOvermap,assertOvermap,regionRoute,regionFoliage,replaceElement,sectorBlueprint,routeClearForElement} from '../dist/overmap-model.js';
import {ELEMENTS,GUARD_KITS,GUARD_TYPES,elementById,guardsForInstance,rotatePoint,buildingForElement} from '../dist/overmap-elements.js';
import {WEAPONS} from '../dist/aft/tactics/solo-weapon-data.js';
import {patrolError} from '../dist/aft/tactics/character-patrol.js';

const posts=region=>region.elements.filter(item=>elementById(item.element,item.revision).kind==='fortification');
const firstPost=map=>{
  const region=map.regions[0];
  return {region,item:posts(region)[0]};
};

test('seeded overmaps assign every block and connect the weak approach of every post',()=>{
  for(const seed of [0,7,42,1947,0xffffffff]){
    const map=generateOvermap(seed);
    assert.equal(map.blockMetres,24);assert.equal(map.sectorMetres,240);
    assert.equal(map.regions.length,24);
    assert.equal(validateOvermap(map).valid,true);
    for(const region of map.regions){
      const route=regionRoute(region);
      assert.equal(posts(region).length,3);
      for(const item of region.elements)assert.ok(routeClearForElement(item,route));
      for(const item of posts(region)){
        const element=elementById(item.element,item.revision);
        const point=rotatePoint(element.weakPoint,item.rotation).map((v,i)=>v+[item.x,item.y][i]*24);
        assert.ok(route.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<1e-9),item.id);
      }
    }
  }
});

test('generation repeats exactly and supports the declared range of post counts',()=>{
  assert.deepEqual(generateOvermap(7),generateOvermap(7));
  assert.notDeepEqual(generateOvermap(7),generateOvermap(8));
  for(const encounters of [1,2,3,4]){
    const map=generateOvermap(42,{width:2,height:2,encounters});
    assert.ok(validateOvermap(map).valid);
    assert.ok(map.regions.every(region=>posts(region).length===encounters));
  }
  for(const [seed,options]of [[-1,{}],[1.2,{}],[0x100000000,{}],[7,{width:1}],[7,{height:16}],[7,{encounters:5}],[7,{unrecognized:true}]])
    assert.throws(()=>generateOvermap(seed,options));
});

test('every fortification variation replaces a post while preserving its rotated route contract',()=>{
  const map=generateOvermap(7),found=new Map();
  for(const region of map.regions)for(const item of posts(region))if(!found.has(item.rotation))found.set(item.rotation,{region,item});
  assert.equal(found.size,4);
  for(const {region,item}of found.values())for(const design of ELEMENTS.filter(e=>e.kind==='fortification')){
    const before=JSON.stringify(map);
    const next=replaceElement(map,region.id,item.id,design.id,{guardType:'dog',kit:'infantry',behavior:'patrol'});
    assert.equal(JSON.stringify(map),before);
    assert.equal(next.revision,1);
    assert.equal(validateOvermap(next).valid,true);
    const changed=next.regions.find(r=>r.id===region.id).elements.find(e=>e.id===item.id);
    assert.equal(changed.element,design.id);
    assert.equal(changed.rotation,item.rotation);
    const guards=guardsForInstance(changed);
    assert.deepEqual(guards.map(g=>g.weapon),['assault','rifle']);
    assert.ok(guards.every(g=>g.species==='dog'));
    assert.equal(guards[0].patrol,undefined);
    assert.equal(patrolError(guards[1].patrol),'');
  }
});

test('equipment and guard types use existing production identifiers',()=>{
  const map=generateOvermap(42),{item}=firstPost(map);
  for(const kit of GUARD_KITS)for(const type of GUARD_TYPES){
    const guards=guardsForInstance({...item,kit:kit.id,guardType:type.id});
    assert.ok(guards.every(g=>WEAPONS[g.weapon]));
    assert.equal(guards.length,2);
  }
});

test('route and footprint corruption is rejected even when an imported document claims success',()=>{
  const map=generateOvermap(7);
  const changes=[
    m=>{m.regions[0].path.splice(1,1);},
    m=>{m.regions[0].elements[0].rotation=(m.regions[0].elements[0].rotation+90)%360;},
    m=>{m.regions[0].elements[1].x=m.regions[0].elements[0].x;m.regions[0].elements[1].y=m.regions[0].elements[0].y;},
    m=>{m.regions[0].elements[0].revision=999;},
    m=>{m.regions[0].elements[0].guardType='unknown';},
    m=>{m.regions[0].entry=m.regions[0].exit;},
    m=>{m.route[1]=m.route[0];},
    m=>{m.regions[0].path[1]=null;},
    m=>{m.regions[0].elements[0]=null;},
    m=>{m.regions[0]=null;}
  ];
  for(const change of changes){
    const broken=structuredClone(map);broken.valid=true;change(broken);
    assert.equal(validateOvermap(broken).valid,false);
    assert.throws(()=>assertOvermap(broken));
  }
  const {region,item}=firstPost(map);
  assert.throws(()=>replaceElement(map,region.id,item.id,'ground.grass'),/role and footprint/);
  assert.throws(()=>replaceElement(map,region.id,item.id,item.element,{guardType:'unknown'}),/guard type/);
});

test('fence selection respects whole-route clearance and failed replacements preserve the document',()=>{
  const map=generateOvermap(7);
  let blocked;
  for(const region of map.regions)for(const item of region.elements){
    if(elementById(item.element,item.revision).kind!=='connection')continue;
    const candidate={...item,element:'cover.fence'};
    if(!routeClearForElement(candidate,regionRoute(region))){blocked={region,item};break;}
  }
  assert.ok(blocked,'The fixture exercises a connector where a solid fence would block the route.');
  const before=JSON.stringify(map);
  assert.throws(()=>replaceElement(map,blocked.region.id,blocked.item.id,'cover.fence'),/route intersects/);
  assert.equal(JSON.stringify(map),before);
});

test('exported blueprints retain edited arrangements, native building dimensions, openings and vegetation',()=>{
  const map=generateOvermap(7),{region,item}=firstPost(map);
  const edited=replaceElement(map,region.id,item.id,'house.breezeway',{behavior:'patrol'});
  const roundTrip=assertOvermap(JSON.parse(JSON.stringify(edited)));
  assert.deepEqual(roundTrip,edited);
  const exported=sectorBlueprint(roundTrip,region.id);
  const building=exported.buildings.find(b=>b.instance===item.id);
  const source=buildingForElement(elementById('house.breezeway'));
  assert.equal(building.source.id,'dogwood-breezeway');
  assert.deepEqual(building.source.parts,source.source.parts);
  assert.ok(building.groundFloor.walls.some(w=>w.openings.some(o=>o.type==='door')));
  assert.ok(Object.keys(exported.foliage).length>0);
  assert.deepEqual(exported.foliage,regionFoliage(region));
  assert.equal(exported.guards.length,6);
  assert.ok(exported.guards.some(g=>g.patrol));
  assert.ok(exported.elementDefinitions.some(e=>e.id==='house.breezeway'));
});
