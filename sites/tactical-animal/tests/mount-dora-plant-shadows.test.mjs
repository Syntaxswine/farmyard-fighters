import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {TownEnvironment} from '../dist/mount-dora-view.js';
import {DaylightRig} from '../dist/aft/tactics/daylight-rig.js';
import {FoliageCutaway} from '../dist/aft/tactics/foliage-cutaway.js';
import {createBiomePlantFactory} from '../dist/aft/tactics/biome-foliage-models.js';
import {configureBiomeTexture,createBiomeMaterials} from '../dist/aft/tactics/biome-foliage-paint.js';
import {BIOME_TEXTURES} from '../dist/aft/tactics/biome-foliage-data.js';
import {MAX_CAMERA_SPAN} from '../dist/render-residency.js';

// field-view.js runs TownEnvironment.setFocus every frame and, at most every
// 200 ms, DaylightRig.update after it, then renders. Both write plant
// castShadow. The rig re-derives it from userData.noShadow, so unless setFocus
// keeps that flag in step, every plant casts a shadow on the daylight frames
// (the 5 Hz tree-shadow flicker on the Mount Dora walking tour).
const CLIENT_HEIGHT=720;
const DEFAULT_SPAN=13*1.2**2; // field-view.js DEFAULT_CAMERA_SPAN

// The town camera as field-view.js frames it: span tall, offset (0, 14, hypot(10, 12)).
function townCamera(unit,span){
  const aspect=16/9,camera=new T.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,.1,120);
  camera.position.set(unit.x,14,unit.y+Math.hypot(10,12));camera.lookAt(unit.x,0,unit.y);camera.updateMatrixWorld();
  return camera;
}
// The outer two 24 m blocks of a resident row, planted with every plant kind the Mount Dora
// sectors place (props and foliage brush), a mature slash pine and a wetland-habitat tree.
// The production buildPlants batches them with the production biome materials and foliage
// cutaway; blank textures stand in for the atlases.
function fixture(){
  const textures=Object.fromEntries(Object.keys(BIOME_TEXTURES).map(id=>[id,configureBiomeTexture(new T.Texture())]));
  const materials=createBiomeMaterials(textures),cutaway=new FoliageCutaway();
  for(const [id,material] of Object.entries(materials))cutaway.decorate(material,0,id==='bark');
  const planted=x=>[
    {x:x+2,y:3,kind:'tree-broadleaf'},{x:x+6,y:3,kind:'tree-broadleaf-large'},{x:x+10,y:3,kind:'tree-pine'},{x:x+14,y:3,kind:'tree-pine-large'},
    {x:x+18,y:3,kind:'tree-pine',maturePine:0},{x:x+2,y:12,kind:'tree-broadleaf',mountDora:{habitat:'wetland',sourceId:null}},
    {x:x+6,y:12,kind:'bush'},{x:x+10,y:12,kind:'reeds'},{x:x+14,y:12,kind:'woodland-brush'},{x:x+18,y:12,kind:'wetland-brush'}];
  const town={chunks:new Map(),renderer:{domElement:{clientHeight:CLIENT_HEIGHT}},plantCutaway:cutaway,plantPrototypes:new Map(),
    plantMaterials:materials,plantFactory:createBiomePlantFactory(materials),world:{plantsFor:([x])=>planted(x)}};
  const scene=new T.Scene();
  for(const [name,rect] of Object.entries({west:{x:0,y:0,w:24,h:24},east:{x:48,y:0,w:24,h:24}})){
    const chunk={rect,root:new T.Group(),meshes:[]};
    TownEnvironment.prototype.buildPlants.call(town,chunk);town.chunks.set(name,chunk);scene.add(chunk.root);
  }
  // A batch setFocus never sees: the control that the rig really rewrites meshes like these.
  const control=new T.InstancedMesh(new T.BoxGeometry(),materials.bark,1);scene.add(control);
  return {town,control,daylight:new DaylightRig(scene,{shadowMap:{}})};
}
// Plain booleans per block and batch height, never THREE objects (node:test inspects failures).
const batches=town=>Object.fromEntries([...town.chunks].flatMap(([name,chunk])=>[
  [name+'Tall',chunk.plantMeshes.filter(p=>!p.low).map(p=>p.mesh.castShadow)],
  [name+'Low',chunk.plantMeshes.filter(p=>p.low).map(p=>p.mesh.castShadow)]]));
const summary=groups=>Object.fromEntries(Object.entries(groups).map(([name,list])=>[name,list.every(Boolean)?'on':list.some(Boolean)?'mixed':'off']));

test('the 200 ms daylight pass keeps the plant shadows TownEnvironment.setFocus chose',()=>{
  // setFocus draws tree shadows at 12 px per metre or closer.
  assert(CLIENT_HEIGHT/DEFAULT_SPAN>=12&&CLIENT_HEIGHT/MAX_CAMERA_SPAN<12,'the two zooms must fall either side of the plant-shadow gate');
  const {town,control,daylight}=fixture();
  for(const [name,list] of Object.entries(batches(town)))assert(list.length>0,'buildPlants made no '+name+' batch');
  let now=0;
  const frame=(unit,span)=>{
    const camera=townCamera(unit,span);
    TownEnvironment.prototype.setFocus.call(town,unit,camera);
    const chosen=batches(town);
    daylight.update(480,camera,now+=200,true);
    assert.deepEqual(batches(town),chosen,'the daylight pass changed plant shadows setFocus chose');
    return summary(chosen);
  };
  const west={id:'hero',x:6,y:6,stance:'standing'},east={...west,x:54};
  assert.deepEqual(frame(west,DEFAULT_SPAN),{westTall:'on',westLow:'off',eastTall:'off',eastLow:'off'});
  assert.equal(control.castShadow,true,'control: the rig sets castShadow from userData.noShadow on plant batches');
  assert.deepEqual(frame(west,MAX_CAMERA_SPAN),{westTall:'off',westLow:'off',eastTall:'off',eastLow:'off'});
  // Zooming back in and walking on must turn shadows back on, not leave them off.
  assert.deepEqual(frame(west,DEFAULT_SPAN),{westTall:'on',westLow:'off',eastTall:'off',eastLow:'off'});
  assert.deepEqual(frame(east,DEFAULT_SPAN),{westTall:'off',westLow:'off',eastTall:'on',eastLow:'off'});
});
