import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {FORMS,SKINS,ASSETS,CONTENTS,specification,TEXTURE_PATHS,BOOK_SKIN_ATLAS} from '../dist/art/library/catalog.js';
import {createLibraryFurniture,loadLibraryTextures} from '../dist/art/library/furniture.js';
const make=()=>createLibraryFurniture({atlas:new T.Texture(),cargo:new T.Texture(),bookSkins:new T.Texture()});

test('all 96 variants fit their tiles and body bounds at every quarter-turn',()=>{
 assert.equal(ASSETS.length,96);assert.equal(new Set(ASSETS.map(a=>a.id)).size,96);
 const lib=make();
 try{for(const f of FORMS)for(const s of SKINS)for(const c of CONTENTS)for(const rotation of [0,90,180,270]){
  const asset=lib.build(f.id,s.id,c,{rotation}),b=asset.bounds,[w,h,d]=asset.spec.size,tolerance=.012;
  assert.ok(b.min.x>=-w/2-tolerance&&b.max.x<=w/2+tolerance,`${asset.spec.id}: width`);
  assert.ok(b.min.z>=-d/2-tolerance&&b.max.z<=d/2+tolerance,`${asset.spec.id}: depth`);
  assert.ok(b.min.y>=-1e-6&&b.max.y<=h+tolerance,`${asset.spec.id}: height ${b.max.y}`);
  assert.ok(w<asset.spec.tiles[0]&&d<asset.spec.tiles[1]);
  assert.ok(asset.root.children.length<=20,'Books should be batched by shared material');
  assert.ok(asset.root.children.every(mesh=>mesh.isInstancedMesh));asset.dispose();
 }}finally{lib.dispose();}
});

test('skins keep identical shape and book layouts; empty variants contain no books',()=>{
 const lib=make();
 try{for(const f of FORMS)for(const c of CONTENTS){let layout;
  for(const s of SKINS){const asset=lib.build(f.id,s.id,c),next=asset.parts.map(p=>({role:p.role,matrix:p.matrix.toArray(),solid:p.solid}));
   if(layout)assert.deepEqual(next,layout);else layout=next;
   assert.equal(asset.parts.some(p=>p.role===(f.id.startsWith('bookcase')?'book-row':'book-spine')),c==='books');
   if(f.id.startsWith('library-table'))assert.equal(asset.parts.some(p=>p.role==='open-pages'),c==='books');
   assert.deepEqual(asset.spec.navigationFootprint,specification(f.id,'oak','empty').navigationFootprint);asset.dispose();
  }
 }}finally{lib.dispose();}
});

test('bookcase skins retain simple shelf geometry within the plain and ornate model budgets',()=>{
 const lib=make(),maps=new Set();
 try{for(const form of FORMS.filter(f=>f.id.startsWith('bookcase')))for(const skin of SKINS){
  const asset=lib.build(form.id,skin.id,'books'),rows=asset.parts.filter(p=>p.role==='book-row');
  assert.equal(rows.length,form.rows*form.bays*(form.doubleSided?2:1));
  assert.ok(!asset.parts.some(p=>['book-cover','book-pages','book-spine','spine-band','spine-label'].includes(p.role)));
  const triangles=asset.parts.reduce((n,p)=>n+p.geometry.index.count/3,0);
  assert.ok(triangles<=(form.ornate?1800:600),`${form.id}: ${triangles} triangles`);
  for(const row of rows){
   const map=row.material.map;assert.ok(map);assert.equal(row.geometry.index.count,36);maps.add(map);
   assert.ok(map.offset.x>=0&&map.offset.y>=0&&map.offset.x+map.repeat.x<=1&&map.offset.y+map.repeat.y<=1);
   const uv=row.geometry.attributes.uv;assert.ok(uv.getY(16)>=.25&&uv.getY(8)<=.25,'Spines and page surfaces use separate skin regions');
  }
  asset.dispose();
 }
 assert.equal(maps.size,SKINS.length*BOOK_SKIN_ATLAS.columns);
 }finally{lib.dispose();}
});

test('full-tile double cases pair two cabinet backs in 1 x 2 tiles with stocked long faces',()=>{
 const lib=make();
 try{for(const form of FORMS.filter(f=>f.fullTile))for(const contents of CONTENTS){
  const asset=lib.build(form.id,'walnut',contents);
  assert.deepEqual(asset.spec.tiles,[1,2]);assert.deepEqual(asset.spec.placementOffset,[0,.5]);
  assert.deepEqual(asset.spec.navigationFootprint,[-.49,-.99,.49,.99]);assert.match(asset.spec.origin,/front \+X/);
  const bodySize=asset.bounds.getSize(new T.Vector3());assert.ok(bodySize.x>.97&&bodySize.z>1.97,'Cabinet occupies almost the entire tile reservation');
  assert.equal(asset.parts.filter(p=>p.role==='back-panel').length,2);
  assert.equal(asset.parts.some(p=>p.role==='frieze-relief'),!!form.ornate);
  assert.equal(asset.parts.some(p=>p.role==='pilaster'),!!form.ornate);
  const rows=asset.parts.filter(p=>p.role==='book-row');assert.equal(rows.length,contents==='books'?16:0);
  if(contents==='books'){
   const faces=rows.map(p=>new T.Vector3(0,0,.5).applyMatrix4(p.matrix));
   assert.equal(faces.filter(p=>p.x>.4).length,8);assert.equal(faces.filter(p=>p.x<-.4).length,8);
   const meshes=asset.solidParts().filter(p=>p.role==='book-row').map(p=>{const mesh=new T.Mesh(p.geometry);mesh.matrixAutoUpdate=false;mesh.matrix.copy(p.matrixWorld);mesh.updateMatrixWorld(true);return mesh;});
   for(const side of [-1,1])assert.ok(new T.Raycaster(new T.Vector3(side*2,1.12,.45),new T.Vector3(-side,0,0),0,4).intersectObjects(meshes).length>0,'Painted book rows have physical depth on each long face');
  }
  const turned=specification(form.id,'walnut',contents,90);assert.deepEqual(turned.tiles,[2,1]);assert.deepEqual(turned.placementOffset,[.5,0]);
  asset.dispose();
 }}finally{lib.dispose();}
});

test('2 x 4 communal tables add six supports and four reading places without scaling the books',()=>{
 const lib=make();
 try{for(const contents of CONTENTS){
  const small=lib.build('library-table','sage',contents),large=lib.build('library-table-large','sage',contents);
  assert.deepEqual(large.spec.tiles,[2,4]);assert.deepEqual(large.spec.placementOffset,[.5,1.5]);
  assert.deepEqual(large.spec.navigationFootprint,[-.97,-1.97,.97,1.97]);
  assert.equal(large.parts.filter(p=>p.role==='table-leg').length,6);
  assert.equal(large.parts.filter(p=>p.role==='open-pages').length,contents==='books'?8:0);
  if(contents==='books'){
   const sizeA=new T.Vector3(),sizeB=new T.Vector3();small.parts.find(p=>p.role==='open-pages').matrix.decompose(new T.Vector3(),new T.Quaternion(),sizeA);large.parts.find(p=>p.role==='open-pages').matrix.decompose(new T.Vector3(),new T.Quaternion(),sizeB);
   assert.ok(sizeA.distanceTo(sizeB)<1e-10,'Books retain the same physical dimensions');
  }
  small.dispose();large.dispose();
 }}finally{lib.dispose();}
});

test('reading table uses 1 x 2 tiles and remains open under its top',()=>{
 const lib=make();
 try{for(const c of CONTENTS){const asset=lib.build('library-table','ivory',c);
  assert.deepEqual(asset.spec.tiles,[1,2]);assert.deepEqual(asset.spec.placementOffset,[0,.5]);
  assert.deepEqual(asset.spec.navigationFootprint,[-.47,-.97,.47,.97]);
  asset.root.position.set(10,0,20);asset.root.updateMatrixWorld(true);
  const solids=asset.solidParts(),meshes=solids.map(p=>{const mesh=new T.Mesh(p.geometry);mesh.matrixAutoUpdate=false;mesh.matrix.copy(p.matrixWorld);mesh.updateMatrixWorld(true);return mesh;});
  const under=new T.Raycaster(new T.Vector3(10,.5,23),new T.Vector3(0,0,-1),0,6);assert.equal(under.intersectObjects(meshes).length,0);
  // Aim through a plank, clear of the real two-millimetre central seam.
  const top=new T.Raycaster(new T.Vector3(10.1,.80,23),new T.Vector3(0,0,-1),0,6);assert.ok(top.intersectObjects(meshes).length>0);
  assert.ok(solids.every(p=>!['spine-label','spine-band','page-line','blank-label','label-holder','shelf-lip','front-edge'].includes(p.role)));
  asset.dispose();
 }}finally{lib.dispose();}
});

test('double-sided bookcases stock both faces, and validation rejects bad asset requests',()=>{
 const lib=make();
 try{
  const double=lib.build('bookcase-double','graphite','books');
  const spines=double.parts.filter(p=>p.role==='book-row').map(p=>new T.Vector3(0,0,.5).applyMatrix4(p.matrix));
  assert.ok(spines.some(p=>p.z>.3)&&spines.some(p=>p.z<-.3));double.dispose();
  for(const request of [['missing','oak','empty'],['library-table','missing','empty'],['bookcase-tall','oak','half-full']])assert.throws(()=>lib.build(...request),/Invalid/);
  assert.throws(()=>lib.build('library-table','oak','empty',{rotation:45}),/Invalid/);
 }finally{lib.dispose();}
});

test('asset release frees instance buffers once and the library owns only its cloned resources',()=>{
 const atlas=new T.Texture(),cargo=new T.Texture(),bookSkins=new T.Texture();let borrowed=0;for(const t of [atlas,cargo,bookSkins])t.addEventListener('dispose',()=>borrowed++);
 const lib=createLibraryFurniture({atlas,cargo,bookSkins}),a=lib.build('bookcase-wide','sage','books'),b=lib.build('library-table','walnut','empty');
 const instances=[...a.root.children,...b.root.children];let instanceDisposals=0;for(const mesh of instances)mesh.addEventListener('dispose',()=>instanceDisposals++);
 const resources=[...Object.values(lib.resources.geometries),...lib.resources.materials.values(),...lib.resources.textures],counts=new Map(resources.map(r=>[r,0]));
 for(const r of resources)r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));
 a.dispose();a.dispose();assert.equal(lib.stats().assets,1);assert.throws(()=>a.solidParts(),/disposed/);
 lib.dispose();lib.dispose();assert.equal(instanceDisposals,instances.length);assert.ok([...counts.values()].every(n=>n===1));assert.equal(borrowed,0);assert.equal(lib.stats().assets,0);assert.equal(lib.stats().geometries,0);
 assert.throws(()=>lib.build('library-table'),/disposed/);atlas.dispose();cargo.dispose();bookSkins.dispose();
});

test('partial texture failure releases successful loads; module only requests three declared atlases',async()=>{
 const texture=new T.Texture();let released=0;texture.addEventListener('dispose',()=>released++);const urls=[];
 await assert.rejects(loadLibraryTextures({loadAsync(url){urls.push(url);return url.includes('material-atlas-v2')?Promise.resolve(texture):Promise.reject(Error('missing'));}}),/could not be loaded/);
 assert.equal(released,1);assert.equal(urls.length,3);assert.equal(TEXTURE_PATHS.length,3);
});

test('published catalog matches the asset IDs and source hashes; review dependencies resolve',()=>{
 const root=path.resolve('sites/tactical-animal/dist'),manifest=JSON.parse(fs.readFileSync(path.join(root,'art/library/catalog.json'),'utf8'));
 assert.deepEqual(manifest.assets,ASSETS);
 for(const source of manifest.provenance.sources)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,source.path))).digest('hex'),source.sha256);
 const file=path.join(root,'art/library/index.html'),html=fs.readFileSync(file,'utf8');
 for(const match of html.matchAll(/(?:src|href)="([^"#?]+)"/g))assert.ok(fs.existsSync(path.resolve(path.dirname(file),match[1])),match[1]);
 execFileSync(process.execPath,['--check',path.join(root,'art/library/review.js')]);
 execFileSync(process.execPath,['--check',path.join(root,'art/library/thumbnail-renderer.js')]);
});

test('software catalog depth keeps intersecting low-poly faces visible on the correct side',async()=>{
 const {createThumbnailRenderer}=await import('../dist/art/library/thumbnail-renderer.js');
 const savedDocument=globalThis.document,surfaces=[];
 globalThis.document={createElement(){
  const canvas={width:0,height:0,pixels:null,toDataURL:()=> 'data:image/png;base64,'};
  const ctx={fillRect(){},getImageData:()=>({data:new Uint8ClampedArray(canvas.width*canvas.height*4)}),putImageData(image){canvas.pixels=image.data;}};
  canvas.getContext=type=>type==='webgl2'?null:ctx;surfaces.push(canvas);return canvas;
 }};
 let renderer;const geometry=new T.PlaneGeometry(2,2),red=new T.MeshStandardMaterial({color:0xff0000}),blue=new T.MeshStandardMaterial({color:0x0000ff});
 try{
  renderer=createThumbnailRenderer(32,32);assert.equal(renderer.mode,'software');
  const scene=new T.Scene();scene.background=new T.Color(0);
  const slanted=new T.Mesh(geometry,red);slanted.rotation.y=Math.PI/4;scene.add(slanted,new T.Mesh(geometry,blue));
  const camera=new T.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=5;camera.lookAt(0,0,0);
  renderer.render(scene,camera);const pixels=surfaces[1].pixels,left=(16*32+8)*4,right=(16*32+24)*4;
  assert.ok(pixels[left]>0&&pixels[left+2]===0,'Near red face covers blue on the left');
  assert.ok(pixels[right]===0&&pixels[right+2]>0,'Blue face covers the receding red face on the right');
 }finally{renderer?.dispose();geometry.dispose();red.dispose();blue.dispose();if(savedDocument===undefined)delete globalThis.document;else globalThis.document=savedDocument;}
});
