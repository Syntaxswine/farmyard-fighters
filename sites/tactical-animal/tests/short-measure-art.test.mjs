import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {PLACEMENTS,GROUND_MARKINGS,SOURCES,STRUCTURES,CAMERAS,bindingFor,acceptsBinding} from '../dist/mission-art/short-measure/manifest.js';
import {createShortMeasureKit,createShortMeasureArt} from '../dist/mission-art/short-measure/kit.js';
import {FIELD_CAMERA} from '../dist/grenade-controls.js';
import {CRATE_DIMENSIONS} from '../dist/world-dimensions.js';
const root=path.resolve('sites/tactical-animal/dist');
const blockout=JSON.parse(fs.readFileSync(path.join(root,'mission-art/short-measure/blockout.json'),'utf8'));

test('solid art is absent unless its full scenery binding agrees',()=>{
 assert.equal(createShortMeasureArt({missionId:'night-ledger'}),null);
 const unbound=createShortMeasureArt({missionId:'short-measure'});
 assert.deepEqual(unbound.root.children.map(n=>n.name),['worker-empty-sacks','ground-markings']);
 assert.equal(unbound.skipped.length,5);unbound.dispose();
 const kit=createShortMeasureKit();
 try{
  for(const p of PLACEMENTS.filter(p=>p.owner)){
   const valid=bindingFor(p);assert.equal(acceptsBinding(p,valid),true);
   assert.equal(kit.place(p.id,{binding:{...valid,height:valid.height+.01}}),null);
   assert.equal(kit.place(p.id,{binding:{...valid,owner:'unrelated-collider'}}),null);
   assert.equal(kit.place(p.id,{binding:{...valid,occlusion:{mode:'opaque-box'}}}),null);
   assert.equal(kit.place(p.id,{binding:{...valid,footprint:valid.footprint.map((n,i)=>n+(i===0?.01:0))}}),null);
   assert.equal(kit.place(p.id,{binding:{...valid,footprint:[NaN,0,1,1]}}),null);
   assert.ok(kit.place(p.id,{binding:valid}));
  }
 }finally{kit.dispose();}
});

test('open air around station beams and desk legs is preserved by mesh-part occlusion',()=>{
 const kit=createShortMeasureKit();
 try{
  const p=PLACEMENTS.find(p=>p.id==='worker-scale'),model=kit.place(p.id,{binding:bindingFor(p)}),parts=kit.solidParts(model);
  assert.ok(parts.length>20);assert.ok(parts.every(part=>part.geometry&&part.matrixWorld));
  // Above the empty pan, beside the upright, a horizontal ray stays clear.
  const raycaster=new T.Raycaster(new T.Vector3(8.5,1.05,22),new T.Vector3(0,0,-1),0,4);
  const meshes=parts.map(part=>{const mesh=new T.Mesh(part.geometry);mesh.matrixAutoUpdate=false;mesh.matrix.copy(part.matrixWorld);mesh.updateMatrixWorld(true);return mesh;});
  assert.equal(raycaster.intersectObjects(meshes).length,0);
  const desk=kit.createProp('dispatch-desk'),deskParts=kit.solidParts(desk);
  const underDesk=new T.Raycaster(new T.Vector3(0,.5,2),new T.Vector3(0,0,-1),0,4);
  const deskMeshes=deskParts.map(part=>{const mesh=new T.Mesh(part.geometry);mesh.matrixAutoUpdate=false;mesh.matrix.copy(part.matrixWorld);mesh.updateMatrixWorld(true);return mesh;});
  assert.equal(underDesk.intersectObjects(deskMeshes).length,0);
  assert.deepEqual(kit.solidParts(kit.createProp('sacks-empty')),[]);
 }finally{kit.dispose();}
});

test('visible prop bounds fit the published world reservation, including paper and seals',()=>{
 const kit=createShortMeasureKit();
 try{
  for(const p of PLACEMENTS){
   const model=kit.place(p.id,{binding:bindingFor(p)});model.updateMatrixWorld(true);
   const bounds=new T.Box3().setFromObject(model),[w,n,e,s]=p.footprint,tolerance=.012;
   assert.ok(bounds.min.x>=w-tolerance&&bounds.max.x<=e+tolerance,`${p.id}: x ${bounds.min.x}..${bounds.max.x}`);
   assert.ok(bounds.min.z>=n-tolerance&&bounds.max.z<=s+tolerance,`${p.id}: z ${bounds.min.z}..${bounds.max.z}`);
   assert.ok(bounds.min.y>=-tolerance&&bounds.max.y<=p.height+tolerance,`${p.id}: y ${bounds.min.y}..${bounds.max.y}`);
  }
 }finally{kit.dispose();}
});

test('story props fit a full phone canvas at the gameplay camera scale',()=>{
 const width=390,height=844,kit=createShortMeasureKit();
 try{
  for(const [view,ids] of [['arrival',['worker-scale','freight-scale','sealed-load-arrival','worker-empty-sacks']],['office',['shipping-manifest']]]){
   const {target,span}=CAMERAS[view],halfWidth=span*width/height/2;
   assert.equal(span,13);
   const camera=new T.OrthographicCamera(-halfWidth,halfWidth,span/2,-span/2,.1,120);
   camera.position.set(target[0]+FIELD_CAMERA.x,FIELD_CAMERA.y,target[1]+FIELD_CAMERA.z);camera.lookAt(target[0],0,target[1]);camera.updateMatrixWorld(true);
   for(const id of ids){
    const p=PLACEMENTS.find(p=>p.id===id),model=kit.place(id,{binding:bindingFor(p)});model.updateWorldMatrix(true,true);
    // Project real vertices; a whole-prop box invents tall empty corners.
    model.traverse(mesh=>{if(!mesh.isMesh)return;const position=mesh.geometry.attributes.position;
     for(let i=0;i<position.count;i++){
      const point=new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).project(camera),px=(point.x+1)*width/2,py=(1-point.y)*height/2;
      assert.ok(px>=0&&px<=width,`${view}/${id} leaves phone width: ${px}`);
      assert.ok(py>=215&&py<=730,`${view}/${id} hides behind review overlays: ${py}`);
     }
    });
   }
  }
 }finally{kit.dispose();}
});

// Intersection of a route segment and the prop footprint expanded by player radius.
function intersects(a,b,box,pad=.28){
 let low=0,high=1;
 for(let axis=0;axis<2;axis++){
  const delta=b[axis]-a[axis],min=box[axis]-pad,max=box[axis+2]+pad;
  if(Math.abs(delta)<1e-10){if(a[axis]<min||a[axis]>max)return false;}
  else{const t1=(min-a[axis])/delta,t2=(max-a[axis])/delta;low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));if(low>high)return false;}
 }return true;
}
test('new solids preserve authored routes, door approaches and objective use point',()=>{
 const solids=PLACEMENTS.filter(p=>p.owner);
 for(const p of solids){
  for(const route of blockout.routes)for(let i=1;i<route.points.length;i++)assert.equal(intersects(route.points[i-1],route.points[i],p.footprint),false,`${p.id} blocks ${route.id}`);
  for(const room of blockout.rooms)for(const door of room.doors)assert.equal(intersects(door,door,p.footprint),false,`${p.id} blocks ${room.id} door`);
  for(const point of [blockout.spawn,blockout.extraction,...blockout.objectives.map(o=>o.at),...blockout.guardPosts.map(g=>g.at)])assert.equal(intersects(point,point,p.footprint),false,`${p.id} occupies reserved point ${point}`);
 }
 assert.equal(PLACEMENTS.find(p=>p.id==='worker-empty-sacks').height,.055);
 assert.ok(STRUCTURES.every(p=>p.wallHeight===2));
 // The cover replacement is sized to the runtime crate collider over the same cells.
 const cover=blockout.cover.find(([x,z])=>x===27&&z===19),[x,z,w,d]=cover,{half,height}=CRATE_DIMENSIONS,load=PLACEMENTS.find(p=>p.id==='sealed-load');
 assert.deepEqual(load.footprint,[x-half,z-half,x+w-1+half,z+d-1+half]);assert.equal(load.height,height);
});

test('objective collection hides only the paper and tab, and disposal owns resources once',()=>{
 const borrowed=new T.Texture();let borrowedDisposals=0;borrowed.addEventListener('dispose',()=>borrowedDisposals++);
 const kit=createShortMeasureKit({paperTexture:borrowed}),p=PLACEMENTS.find(p=>p.id==='shipping-manifest'),desk=kit.place(p.id,{binding:bindingFor(p)});
 const count=desk.children.length;kit.setCollected(desk,true);
 assert.equal(desk.getObjectByName('collectible-paper').visible,false);
 assert.equal(desk.getObjectByName('collectible-tab').visible,false);
 assert.equal(desk.children.length,count);kit.setCollected(desk,false);assert.equal(desk.getObjectByName('collectible-paper').visible,true);
 const resources=[...Object.values(kit.resources.geometry),...Object.values(kit.resources.materials),...kit.resources.textures];
 const counts=new Map(resources.map(r=>[r,0]));for(const r of resources)r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));
 kit.dispose();kit.dispose();assert.ok([...counts.values()].every(n=>n===1));assert.equal(borrowedDisposals,0);
 assert.throws(()=>kit.createProp('scale-worker'),/disposed/);borrowed.dispose();
});

test('published provenance, anchors and generated manifest remain reviewable',()=>{
 for(const source of Object.values(SOURCES)){assert.ok(fs.existsSync(path.join(root,source.path)),source.path);assert.ok(source.license);}
 const generated=JSON.parse(fs.readFileSync(path.join(root,'mission-art/short-measure/placements.json'),'utf8'));
 assert.deepEqual(generated.placements,PLACEMENTS);assert.deepEqual(generated.sources,SOURCES);assert.deepEqual(generated.groundMarkings,GROUND_MARKINGS);
 for(const id of ['worker-scale','sealed-load','shipping-manifest'])assert.deepEqual(PLACEMENTS.find(p=>p.id===id).anchor,[...blockout.storyPoints,...blockout.objectives].find(p=>p.id===id).at);
 assert.deepEqual(STRUCTURES.map(s=>s.id),blockout.rooms.map(s=>s.id));
 assert.ok(fs.readFileSync(path.join(root,'mission-art/short-measure/reserve-7.svg'),'utf8').includes('M25 23H78V35L50 79H33L62 36H25Z'));
 const review=fs.readFileSync(path.join(root,'mission-art/short-measure/review.js'),'utf8');
 execFileSync(process.execPath,['--check',path.join(root,'mission-art/short-measure/review.js')]);
 for(const entry of ['review.html','map.html']){
  const htmlPath=path.join(root,'mission-art/short-measure',entry),html=fs.readFileSync(htmlPath,'utf8');
  for(const match of html.matchAll(/(?:src|href)="([^"#?]+)"/g))assert.ok(fs.existsSync(path.resolve(path.dirname(htmlPath),match[1])),match[1]);
 }
 assert.deepEqual([...review.matchAll(/loadAsync\('([^']+)'\)/g)].map(m=>m[1]),['./shipping-manifest.svg']);
 assert.equal(review.includes('designer/'),false);
});
