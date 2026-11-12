import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {SoloTankEffects} from '../dist/tank-effects.js';
import {PreparedGroundFire} from '../dist/prepared-ground-fire.js';
import {FieldView} from '../dist/field-view.js';
import {Core,createSoloGame,DEFAULT_BUILD} from '../dist/solo-game.js';
const camera=new T.PerspectiveCamera();camera.position.set(10,14,12);
const lights=scene=>{const result=[];scene.traverse(o=>{if(o.isPointLight)result.push(o);});return result;};

test('level changes prepare barrel effects only when explosive barrels are present and retain enemy preloading',async()=>{
  const view=Object.create(FieldView.prototype),scene=new T.Scene(),actors=[];let artRequests=0;
  Object.assign(view,{scene,effects:[],pointers:new Map(),container:{},generation:0,samples:new Map(),failed:new Set(),actors:new Map(),parkedActors:new Map(),pending:new Map(),target:new T.Vector3(),
    clearEnvironment(){},updateCamera(){},resize(){},route(){},onLoading(){},actor(unit){actors.push(unit.id);},
    buildEnvironment(state){this.searchHalo={};this.art={get ready(){artRequests++;return Promise.resolve();},library:null};this.prepareExplosionGraphics(state,this.generation);}});
  const barrels=Core.enableRealtime(createSoloGame(DEFAULT_BUILD,1947,'quiet-shift'));
  const noBarrels=Core.enableRealtime(createSoloGame(DEFAULT_BUILD,1947,'quiet-shift'));noBarrels.props=noBarrels.props.filter(p=>p.kind!=='barrel-explosive');
  try{
    for(const state of [noBarrels,barrels,noBarrels]){
      actors.length=0;view.setGame(state);assert.deepEqual(actors,state.units.map(u=>u.id));assert.equal(view.prepareGraphics,true);
      if(state===barrels){
        // Supply declared textures while retaining the actual preparation path.
        view.tankEffects.loadTexture=async()=>new T.Texture();await view.effectsPreparation;
        assert.ok(view.tankEffects.ground);assert.equal(view.tankEffects.preparedBarrels.size,2);assert.equal(artRequests,1);
      }else{
        assert.equal(view.hasExplosiveBarrels,false);assert.equal(view.tankEffects,null);assert.equal(view.effectsBusy,false);assert.equal(view.effectsPreparation,null);
        assert.equal(view.burnEffects.ready,undefined);assert.equal(lights(scene).length,0);
      }
    }
    assert.equal(artRequests,1);
  }finally{view.clearEffects();}
});

test('prepared barrel fragments and effects are reused at impact without changing the scene light count',async()=>{
  const scene=new T.Scene(),geometry=new T.CylinderGeometry(.328,.328,.8,16),material=new T.MeshStandardMaterial(),textures=[];
  // Synthetic drum geometry exercises the production rupture/preparation path.
  // The native acceptance separately uses the actual painted cargo library.
  const library={build(){const root=new T.Group(),mesh=new T.Mesh(geometry,material);mesh.position.y=.4;root.add(mesh);return {root};}};
  const layer=new SoloTankEffects(scene,{loadTexture:async()=>{const t=new T.Texture();textures.push(t);return t;}});
  const prop={kind:'barrel-explosive',x:12,y:25,z:0};
  try{
    await layer.prepare(library,[prop],[{x:12,z:25}],128);
    const prepared=layer.preparedBarrels.get('barrel:12,25,0');assert.ok(prepared.motion);assert.ok(prepared.effects);
    assert.deepEqual(lights(scene),[layer.flashLight]);
    const s={units:[],visible:new Set(['12,25']),fires:[{x:12,y:25,z:0,turns:3}],fireAnimations:[{sequence:1,kind:'barrel',prop,route:[prop],fires:[{x:12,y:25,z:0,turns:3}]}]};
    layer.observe(s,0,[]);const burst=layer.bursts.get(1);
    assert.equal(burst.motion,prepared.motion);assert.equal(burst.effects,prepared.effects);
    layer.draw(camera,library);assert.ok(layer.flashLight.intensity>0);assert.deepEqual(lights(scene),[layer.flashLight]);
    layer.observe(s,1000,[]);layer.draw(camera,library);assert.equal(layer.flashLight.intensity,0);assert.deepEqual(lights(scene),[layer.flashLight]);
  }finally{layer.dispose();geometry.dispose();material.dispose();}
  assert.equal(scene.children.length,0);
});

test('ground fire reuses its cards and mask, clips actual active cells, and grows without dropping fire',async()=>{
  const scene=new T.Scene(),textures=[new T.Texture(),new T.Texture(),new T.Texture()],ground=new PreparedGroundFire(scene,textures);
  try{
    await ground.prepare(4);const fx=ground.effects,geometry=fx.ground[0].geometry,material=fx.ground[0].material;
    ground.draw([{x:12,y:25},{x:13,y:25}],0,camera,false);
    assert.equal(fx.ground.filter(m=>m.visible).length,2);assert.equal(fx.groundMask.image.data[7],255);
    ground.draw([{x:12,y:25},{x:15,y:26}],100,camera,false);
    assert.equal(fx.ground[0].geometry,geometry);assert.equal(fx.ground[0].material,material);
    assert.equal(fx.groundMask.image.data[7],0);assert.equal(fx.groundMask.image.data[(128+3)*4+3],255);
    const cells=Array.from({length:9},(_,i)=>({x:20+i,y:30}));ground.draw(cells,200,camera,false);await ground.growing;
    ground.draw(cells,250,camera,false);assert.equal(ground.replacement.effects.ground.filter(m=>m.visible).length,9);
    ground.draw([],300,camera,false);assert.equal(ground.replacement.effects.group.visible,false);assert.equal(lights(scene).length,0);
  }finally{ground.dispose();textures.forEach(t=>t.dispose());}
  assert.equal(scene.children.length,0);
});
