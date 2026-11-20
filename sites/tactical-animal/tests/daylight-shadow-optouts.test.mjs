import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {DaylightRig} from '../dist/aft/tactics/daylight-rig.js';
import {createCargoLibrary} from '../dist/aft/tactics/painted-cargo.js';
import {WindowScenery} from '../dist/window-view.js';
import {windowSystem} from '../dist/window-catalogue.js';
import {windowReviewSource} from '../dist/window-review-map.js';
import {createShortMeasureArt} from '../dist/mission-art/short-measure/kit.js';
import {GROUND_MARKINGS} from '../dist/mission-art/short-measure/manifest.js';
import {OriginalEnvironment} from '../dist/original-art.js';
import {SoloTankEffects} from '../dist/tank-effects.js';
import {createSoloGame,DEFAULT_BUILD} from '../dist/solo-game.js';

// The field view runs DaylightRig.update at most every 200 ms. On every mesh with a
// standard, Phong or Lambert material it sets castShadow=!userData.noShadow, so art that
// opts out with castShadow=false alone casts a shadow again from the first pass. Each case
// builds its art through the production path, runs a real rig over it, and checks the
// opted-out meshes stay shadowless while a control set beside them still casts.
const lit=o=>o.isMesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m?.isMeshStandardMaterial||m?.isMeshPhongMaterial||m?.isMeshLambertMaterial);
function daylightPass(scene){
  const camera=new T.OrthographicCamera(-20,20,15,-15,.1,120);camera.position.set(20,14,40);camera.lookAt(20,0,25);camera.updateMatrixWorld();
  new DaylightRig(scene,{shadowMap:{}}).update(480,camera,0,true);
}
// Plain values only: node:test prints a failing operand, and a THREE object prints its scene graph.
function shadows(meshes,quiet){
  const out={quiet:0,quietCasting:0,control:0,controlSilent:0};
  for(const o of meshes){if(!lit(o))continue;if(quiet(o)){out.quiet++;if(o.castShadow)out.quietCasting++;}else{out.control++;if(!o.castShadow)out.controlSilent++;}}
  return out;
}
const meshesUnder=(...roots)=>{const list=[];for(const root of roots)root.traverse(o=>{if(o.isMesh)list.push(o);});return list;};
function expectQuiet(result,what){
  assert.ok(result.quiet>0&&result.control>0,`${what}: the fixture must build both kinds of mesh (${JSON.stringify(result)})`);
  assert.equal(result.quietCasting,0,`${what}: the daylight pass re-enabled ${result.quietCasting} of ${result.quiet} shadowless meshes`);
  assert.equal(result.controlSilent,0,`${what}: ${result.controlSilent} of ${result.control} control meshes stopped casting`);
}
// The painted labels draw on a canvas; their geometry and flags need no rasterizer.
const canvasDocument={createElement:()=>({getContext:()=>new Proxy({},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)})})};
async function withCanvas(run){
  const had=Object.hasOwn(globalThis,'document'),prior=globalThis.document;globalThis.document=canvasDocument;
  try{return await run();}finally{if(had)globalThis.document=prior;else delete globalThis.document;}
}

test('placed window glass lets the sun through after the daylight pass',()=>{
  const source=windowReviewSource(),seen=new Set(Array.from({length:30},(_,y)=>Array.from({length:35},(_,x)=>`${x},${y}`)).flat());
  const s={map:source.terrain,windows:source.farmyardWindows.instances,seen,visible:new Set(),revision:0};
  const art=new WindowScenery(s),scene=new T.Scene();
  try{
    art.update(s,{x:0,y:0,w:48,h:48});scene.add(art.root);daylightPass(scene);
    const meshes=meshesUnder(art.root),panes=windowSystem.compile(s).reduce((n,record)=>n+record.spec.panes.length,0);
    assert.equal(meshes.filter(o=>/^glass:/.test(o.name)).length,panes,'every placed pane has its glass');
    expectQuiet(shadows(meshes,o=>/^glass:/.test(o.name)),'window glass (frames, mullions and walls as control)');
  }finally{art.dispose();}
});

test('Short Measure ground paint casts no shadow after the daylight pass',()=>{
  const art=createShortMeasureArt({missionId:'short-measure'}),scene=new T.Scene(),paint=new Set(GROUND_MARKINGS.map(m=>m.id));
  try{
    scene.add(art.root);daylightPass(scene);
    assert.deepEqual(GROUND_MARKINGS.map(m=>!!art.root.getObjectByName(m.id)),GROUND_MARKINGS.map(()=>true),'every marking is built');
    // Unbound, the art keeps only its binding-free prop; its meshes are the control.
    expectQuiet(shadows(meshesUnder(art.root),o=>paint.has(o.name)),'ground paint (the unbound prop as control)');
  }finally{art.dispose();}
});

test('original cargo batches keep their painted labels shadowless after the daylight pass',()=>withCanvas(async()=>{
  const state=createSoloGame(DEFAULT_BUILD,1947,'quiet-shift'),renderer={capabilities:{getMaxAnisotropy:()=>4}};
  const loader={load(url,ready){const texture=new T.Texture({width:1254,height:1254});queueMicrotask(()=>ready?.(texture));return texture;},async loadAsync(url){return this.load(url);}};
  const view=new OriginalEnvironment(renderer,state,{loader}),scene=new T.Scene();
  try{
    await view.ready;scene.add(view.root);daylightPass(scene);
    // The library's own choice: parts it builds with castShadow=false (its labels).
    const shadowless=new Set();for(const {root} of view.prototypes.values())root.traverse(o=>{if(o.isMesh&&!o.castShadow)shadowless.add(o.material);});
    const batches=[...view.chunks.values()].flatMap(chunk=>chunk.cargo.map(({mesh})=>mesh));
    expectQuiet(shadows(batches,o=>shadowless.has(o.material)),'cargo label batches (crate and drum bodies as control)');
  }finally{view.dispose();}
}));

test('a rupturing barrel keeps its painted labels shadowless, prepared or drawn at impact',()=>withCanvas(async()=>{
  const scene=new T.Scene(),textures=[new T.Texture(),new T.Texture()],library=createCargoLibrary(...textures),loaded=[];
  const layer=new SoloTankEffects(scene,{loadTexture:async()=>{const t=new T.Texture();loaded.push(t);return t;}});
  const prepared={kind:'barrel-explosive',x:12,y:25,z:0},late={kind:'barrel-explosive',x:16,y:25,z:0};
  try{
    // One drum is prepared ahead of contact; the other is built by draw when it ruptures.
    await layer.prepare(library,[prepared],[{x:12,z:25}],16);
    const s={units:[],visible:new Set(['16,25']),fires:[],fireAnimations:[{sequence:1,kind:'barrel',prop:late,route:[late],fires:[]}]};
    layer.observe(s,0,[]);layer.draw(new T.PerspectiveCamera(),library);
    const motions=[layer.preparedBarrels.get('barrel:12,25,0')?.motion,layer.bursts.get(1)?.motion];
    assert.deepEqual(motions.map(m=>!!m),[true,true],'both rupture paths build the drum motion');
    // Every drum mesh sets castShadow as built (the library's labels false), so the
    // flags before the first pass are the authored choice.
    const built=new Map(motions.flatMap(m=>meshesUnder(m.root)).map(o=>[o,o.castShadow]));
    daylightPass(scene);
    for(const [i,motion] of motions.entries())expectQuiet(shadows(meshesUnder(motion.root),o=>built.get(o)===false),`${i?'drawn':'prepared'} drum labels (its panels and hoops as control)`);
  }finally{layer.dispose();library.dispose();textures.forEach(t=>t.dispose());loaded.forEach(t=>t.dispose());}
}));
