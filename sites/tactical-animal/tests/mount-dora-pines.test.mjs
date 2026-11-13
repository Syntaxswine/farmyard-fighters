import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {createBiomePlantFactory} from '../dist/aft/tactics/biome-foliage-models.js';
import {createMountDoraPine,maturePinesForSector,MATURE_PINE_STYLES} from '../dist/mount-dora-pines.js';
import {TownWorld,decodeTownSector} from '../dist/mount-dora-world.js';
import {Core,DEFAULT_BUILD,createSoloGame,hero,confirmedImpact,projectileSegmentClear,freePoint} from '../dist/solo-game.js';

const base=new URL('../../../maps/mount-dora/',import.meta.url);
const project=JSON.parse(fs.readFileSync(new URL('project.json',base)));
const readSector=sector=>JSON.parse(fs.readFileSync(new URL(sector.file,base)));

test('mature pines reuse a sparse, stable set of seeded park and woodland positions',()=>{
  const all=[],countPines=p=>p.kind==='tree-pine'||p.kind==='tree-pine-large';
  let pineCount=0;
  for(const sector of project.sectors){
    const props=readSector(sector).props||[],pineProps=props.filter(countPines);
    pineCount+=pineProps.length;
    const picks=maturePinesForSector(props,sector.origin);
    assert.deepEqual(picks,maturePinesForSector([...props].reverse(),sector.origin));
    for(const [p,variant] of picks){
      assert(pineProps.includes(p)&&p.mountDora.sourceId===null);
      assert(['park','wood'].includes(p.mountDora.habitat));
      assert(MATURE_PINE_STYLES[variant]);
      all.push([p.x+sector.origin.x,p.y+sector.origin.y]);
    }
  }
  assert(all.length>0&&all.length<pineCount*.05);
  for(const [i,[x,y]] of all.entries()){
    assert(all.slice(0,i).every(([a,b])=>Math.hypot(x-a,y-b)>=17));
  }
});

test('the mature pine draws a raised crown and registers only its visible trunk as solid',async()=>{
  const materials={bark:new T.MeshStandardMaterial(),pine:new T.MeshStandardMaterial()};
  const factory=createBiomePlantFactory(materials);
  const sector=project.sectors.find(s=>s.id==='C03'),raw=readSector(sector);
  delete raw.mountDora.retainedMatureTrees;
  raw.terrain=Array.from({length:240},()=>Array(240).fill('ground-grass'));
  raw.upper=[{},{}];raw.levels=3;delete raw.wallRuns;delete raw.foliage;
  raw.props=[
    {x:20,y:20,z:0,kind:'tree-pine-large',mountDora:{sourceId:null,habitat:'park',placement:'declared-seeded-greenery'}},
    {x:5,y:30,z:0,kind:'tree-pine',maturePine:1}
  ];
  const world=await new TownWorld(project,{baseURL:base}).identify();
  try{
    const packet=decodeTownSector(raw,sector);
    world.startPoint={x:495,y:500};world.cache.set(sector.id,packet);
    assert.equal(packet.plantSolids.records.length,2);
    const [plant,sapling]=packet.plants.records,[trunk,smallTrunk]=packet.plantSolids.records;
    assert.deepEqual(trunk.centre,[plant.x,plant.y]);
    assert.equal(sapling.maturePine,undefined);
    assert.equal(smallTrunk.radius,.22);
    for(const variant of MATURE_PINE_STYLES.keys()){
      const model=createMountDoraPine(T,factory.geometries,materials,variant);
      const shaft=model.getObjectByName('Pine trunk'),bark=new T.Box3().setFromObject(shaft,true);
      const needles=new T.Box3();
      for(const mesh of model.children.filter(child=>child.name==='Pine needles'))needles.expandByObject(mesh,true);
      const spread=needles.getSize(new T.Vector3());
      assert(spread.x>=10&&spread.z>=10&&Math.max(spread.x,spread.z)<13);
      assert(needles.min.y>7.5&&needles.max.y>bark.max.y);
      if(variant===plant.maturePine){
        assert(Math.abs(bark.min.y)<1e-7);
        assert(Math.abs(bark.max.x-trunk.radius)<1e-7&&Math.abs(bark.max.z-trunk.radius)<1e-7);
        assert(Math.abs(bark.max.y-trunk.trunkHeight)<1e-6);
      }
    }
    const state=Core.enableRealtime(createSoloGame(DEFAULT_BUILD,1947,'mount-dora',{tourWorld:world})),unit=hero(state);
    const start={x:495,y:500,h:1.1},end={x:505,y:500,h:1.1,ground:true};
    assert(!world.lineClear(start,end)&&!projectileSegmentClear(state,start,end));
    assert(Math.abs(confirmedImpact(state,unit,end).point.x-(500-trunk.radius))<1e-7);
    const high=trunk.trunkHeight+.15;
    assert(world.lineClear({...start,h:high},{...end,h:high}));
    assert(projectileSegmentClear(state,{...start,h:high},{...end,h:high}));
    assert(world.walkSegment({x:496,y:502},{x:504,y:502}),'ground under the crown stays walkable');

    Object.assign(unit,{x:498.8,y:500});
    for(let step=0;step<52;step++){
      assert(Core.travel(state,unit,.065,0)>0);
      assert(freePoint(state,unit,unit.id));
    }
    assert(unit.x>500.4&&Math.abs(unit.y-500)>trunk.radius);
  }finally{
    world.dispose();factory.dispose();
    for(const material of Object.values(materials))material.dispose();
  }
});
