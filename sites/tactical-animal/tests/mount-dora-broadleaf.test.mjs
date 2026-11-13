import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {createBiomePlantFactory} from '../dist/aft/tactics/biome-foliage-models.js';
import {MATURE_TREE_SCALE} from '../dist/aft/tactics/biome-foliage-data.js';
import {createMountDoraBroadleaf,MATURE_BROADLEAF_STYLES} from '../dist/mount-dora-broadleaf.js';
import {MATURE_PINE_STYLES} from '../dist/mount-dora-pines.js';
import {TownWorld,decodeTownSector} from '../dist/mount-dora-world.js';
import * as art from '../dist/mission-art/mount-dora/manifest.js';
import {Core,DEFAULT_BUILD,createSoloGame,hero,confirmedImpact,projectileSegmentClear,freePoint} from '../dist/solo-game.js';

const base=new URL('../../../maps/mount-dora/',import.meta.url);
const project=JSON.parse(fs.readFileSync(new URL('project.json',base)));
const read=sector=>JSON.parse(fs.readFileSync(new URL(sector.file,base)));
const retention=JSON.parse(fs.readFileSync(new URL('source/retained-mature-trees.json',base)));

test('the port retains all 106 mature trees and keeps the crowns clear of roofs and each other',()=>{
  const world=new TownWorld(project,{baseURL:base,art});
  const broadleaves=[],pines=[];
  try{
    for(const sector of project.sectors){
      const raw=read(sector),roofs=world.roofBoundsForSector(sector);
      const packet=decodeTownSector(raw,sector,world.visualReplacement,world.physicalReplacement,roofs);
      const foundPines=packet.plants.records.filter(p=>p.maturePine!==undefined);
      pines.push(...foundPines);
      for(const p of packet.plants.records.filter(p=>p.matureBroadleaf!==undefined)){
        const seed=raw.props.find(s=>s.x+sector.origin.x===p.x&&s.y+sector.origin.y===p.y&&s.kind===p.kind);
        assert(seed&&seed.kind==='tree-broadleaf-large'&&seed.mountDora.placement==='declared-seeded-greenery');
        assert(seed.mountDora.sourceId===null&&['park','wood'].includes(seed.mountDora.habitat));
        const style=MATURE_BROADLEAF_STYLES[p.matureBroadleaf];
        const trunk=packet.plantSolids.records.find(t=>t.id===p.id);
        assert.deepEqual(trunk.centre,[p.x,p.y]);
        assert.equal(trunk.radius,style.radius);assert.equal(trunk.trunkHeight,style.trunkHeight);
        assert(trunk.radius<=.22*MATURE_TREE_SCALE);
        for(const [x0,y0,x1,y1] of roofs){
          assert(Math.hypot(Math.max(x0-p.x,0,p.x-x1),Math.max(y0-p.y,0,p.y-y1))>=style.reach);
        }
        broadleaves.push(p);
      }
    }
    const expected=new Map(retention.trees.map(p=>[p.x+','+p.y,[p.kind,p.variant]]));
    const rendered=new Map([...pines,...broadleaves].map(p=>[p.x+','+p.y,[p.kind,p.maturePine??p.matureBroadleaf]]));
    assert.deepEqual(rendered,expected);
    assert.equal(pines.length,52);
    assert.equal(broadleaves.length,54);
    assert.equal(retention.trees.filter(p=>p.previous).length,3);
    assert(retention.trees.every(p=>!p.previous||Math.hypot(p.x-p.previous[0],p.y-p.previous[1])<=5));
    assert.equal(new Set(broadleaves.map(p=>MATURE_BROADLEAF_STYLES[p.matureBroadleaf].form)).size,2);
    for(const [i,p] of broadleaves.entries()){
      assert(broadleaves.slice(0,i).every(q=>Math.hypot(p.x-q.x,p.y-q.y)>=21));
      const {reach}=MATURE_BROADLEAF_STYLES[p.matureBroadleaf];
      assert(pines.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>=reach+MATURE_PINE_STYLES[q.maturePine].crownWidth/2+1.5));
    }
  }finally{world.dispose();}
});

test('roof and wetland seeds retain their legacy tree path, while the adult shaft matches its cylinder',async()=>{
  const sector=project.sectors.find(s=>s.id==='C03'),raw=read(sector),world=await new TownWorld(project,{baseURL:base}).identify();
  delete raw.mountDora.retainedMatureTrees;
  raw.terrain=Array.from({length:240},()=>Array(240).fill('ground-grass'));
  raw.upper=[{},{}];raw.levels=3;delete raw.wallRuns;delete raw.foliage;
  const prop=(x,y,habitat='park')=>({x,y,z:0,kind:'tree-broadleaf-large',mountDora:{sourceId:null,placement:'declared-seeded-greenery',habitat}});
  raw.props=[prop(20,20),prop(50,50),prop(80,80,'wetland')];
  const packet=decodeTownSector(raw,sector,new Set(),new Set(),[[531,530,535,532]]);
  const [tree,roofTree,wetlandTree]=packet.plants.records,[trunk]=packet.plantSolids.records;
  assert.notEqual(tree.matureBroadleaf,undefined);
  assert.equal(roofTree.matureBroadleaf,undefined);
  assert.equal(wetlandTree.matureBroadleaf,undefined);
  assert.equal(packet.plantSolids.records.length,raw.props.length);
  const materials={bark:new T.MeshStandardMaterial(),leaves:new T.MeshStandardMaterial()};
  const factory=createBiomePlantFactory(materials);
  try{
    for(const [i,style] of MATURE_BROADLEAF_STYLES.entries()){
      const model=createMountDoraBroadleaf(T,factory.geometries,materials,i);
      const shaft=new T.Box3().setFromObject(model.getObjectByName('Broadleaf trunk'),true);
      const canopy=new T.Box3(),v=new T.Vector3();let reach=0;
      for(const part of model.children.filter(o=>o.name==='Broadleaf crown')){
        canopy.expandByObject(part,true);
        const positions=part.geometry.attributes.position;
        for(let n=0;n<positions.count;n++){
          v.fromBufferAttribute(positions,n).applyMatrix4(part.matrixWorld);
          reach=Math.max(reach,Math.hypot(v.x,v.z));
        }
      }
      assert(canopy.min.y>3.25&&reach+.35<style.reach);
      const dims=canopy.getSize(v),width=Math.max(dims.x,dims.z);
      assert(style.form==='oak'?width>=14&&width<=18:width<9&&dims.y>=width*.80);
      if(i===tree.matureBroadleaf){
        assert(Math.abs(shaft.min.y)<1e-8);
        assert(Math.abs(shaft.max.x-trunk.radius)<1e-7&&Math.abs(shaft.max.z-trunk.radius)<1e-7);
        assert(Math.abs(shaft.max.y-trunk.trunkHeight)<1e-7);
      }
    }
    world.startPoint={x:495,y:500};world.cache.set(sector.id,packet);
    const s=Core.enableRealtime(createSoloGame(DEFAULT_BUILD,1947,'mount-dora',{tourWorld:world})),u=hero(s);
    const a={x:495,y:500,h:1.1},b={x:505,y:500,h:1.1,ground:true};
    assert(!world.lineClear(a,b)&&!projectileSegmentClear(s,a,b));
    assert(Math.abs(confirmedImpact(s,u,b).point.x-(500-trunk.radius))<1e-7);
    const high=trunk.trunkHeight+.1;
    assert(world.lineClear({...a,h:high},{...b,h:high}));
    assert(projectileSegmentClear(s,{...a,h:high},{...b,h:high}));
    assert(world.walkSegment({x:497,y:501.3},{x:503,y:501.3}));
    assert(world.resumeClear({x:498.8,y:500}));
    Object.assign(u,{x:498.8,y:500});
    for(let n=0;n<52;n++){
      assert(Core.travel(s,u,.065,0)>0);
      assert(freePoint(s,u,u.id));
    }
    assert(u.x>500.4&&Math.abs(u.y-500)>trunk.radius);
  }finally{
    world.dispose();factory.dispose();
    for(const material of Object.values(materials))material.dispose();
  }
});
