import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {CHECKPOINT_PROVENANCE,checkpointSource,checkpointMap,adaptAftSector,unpackSector} from '../dist/aft-sector.js';
import {getMission,missionMap,missionInteractables,validateMission} from '../dist/missions.js';

test('packed sector reproduces every byte of data from the original AFT editor export',()=>{
  const bytes=fs.readFileSync(new URL('../dist/'+CHECKPOINT_PROVENANCE.source,import.meta.url));
  assert.equal(bytes.length,CHECKPOINT_PROVENANCE.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),CHECKPOINT_PROVENANCE.sha256);
  assert.deepEqual(checkpointSource(),JSON.parse(bytes));
});

test('ground-level adapter preserves all 57,600 tiles and original obstacle positions',()=>{
  const source=checkpointSource(),world=checkpointMap();
  assert.deepEqual(world.terrain,source.terrain);assert.deepEqual(world.props,source.props);
  assert.deepEqual(world.worldBounds,{x:0,y:0,w:240,h:240});
  assert.deepEqual(world.source,CHECKPOINT_PROVENANCE);
  assert.equal(adaptAftSector(source).source,undefined);
  assert.equal(world.groundPalette,'aft-sector');assert.equal(world.obstacles.length,3);
  for(const [index,prop]of source.props.entries()){
    const box=world.obstacles[index];assert.equal((box.x0+box.x1)/2,prop.x);assert.equal((box.y0+box.y1)/2,prop.y);assert.equal(box.sourceKind,prop.kind);
  }
  assert.equal(Object.keys(world.edges).length,30);
  assert.deepEqual(world.doors.map(d=>[d.x,d.y,d.edge,d.open]),[[21,115.5,'s:21:115',false]]);
  // Every call owns its state; playing a sector cannot mutate the source/template.
  world.terrain[0][0]='crate';world.props.pop();world.doors[0].open=true;
  assert.equal(checkpointMap().terrain[0][0],'yard');assert.equal(checkpointMap().props.length,3);assert.equal(checkpointMap().doors[0].open,false);
});

test('unsupported authored features fail explicitly rather than producing a misleading playable map',()=>{
  for(const mutate of [s=>s.terrain[0][0]='water',s=>s.upper[0]['1,1']='floor',s=>s.stairs.push({x:1,y:1,z:0}),s=>s.props.push({kind:'truck',x:5,y:5}),s=>s.edges['e:2:2']='fence-chainlink',s=>s.starts[0].z=1]){
    const source=checkpointSource();mutate(source);assert.throws(()=>adaptAftSector(source),/unsupported|Unsupported|upper-floor/);
  }
  assert.throws(()=>unpackSector({width:240,height:240,terrainRLE:[['yard',57601]]}),/Invalid packed/);
  assert.throws(()=>unpackSector({width:240,height:240,terrainRLE:[['yard',1]]}),/Incomplete packed/);
});

test('Road Checkpoint is an optional complete mission crossing multiple original blocks',()=>{
  const mission=getMission('road-checkpoint',1),world=missionMap(mission.id,1),objects=missionInteractables({missionId:mission.id,layoutVersion:1});
  assert.deepEqual(validateMission(mission),[]);assert.equal(world.terrain.length,240);
  assert.equal(mission.guards.length,6);assert.equal(objects.filter(o=>o.kind==='door').length,1);
  assert.equal(objects.find(o=>o.kind==='door').edge,'s:21:115');
  assert.ok(mission.extraction.x>48);assert.equal(world.terrain[mission.objective.y][mission.objective.x],'floor');
  assert.equal(missionMap('night-ledger').terrain.length,30);assert.equal(missionMap('short-measure').terrain[0].length,40);
});
