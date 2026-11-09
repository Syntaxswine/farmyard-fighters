import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {validateLandmarkArt,referencesForSector,requireCatalogueBindings} from '../../../maps/mount-dora/art/index.js';
const base=new URL('../../../maps/mount-dora/art/',import.meta.url),read=n=>JSON.parse(fs.readFileSync(new URL(n,base),'utf8'));
const manifest=read('manifest.json'),geography=read('geography.json'),assets=read('source/selected-assets.json'),provenance=read('source/provenance.json');
test('Mount Dora seven landmark recipes use exact reviewed assets and distinct source identities',()=>{
 assert.deepEqual(validateLandmarkArt(manifest,geography,assets),[]);assert.equal(manifest.landmarks.length,7);assert.equal(geography.features.length,68);
 assert.equal(manifest.engineRevision,'2502646482218524fd5129641da769bb82462e4d');assert.deepEqual(manifest.world.extent,[1440,1680]);assert.equal(manifest.world.sectorMetres,240);
 const raw=fs.readFileSync(new URL('source/nautilus/packages/assets/catalogue.js',base),'utf8'),catalogue=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));for(const a of assets.assets)assert.deepEqual(a,catalogue.find(c=>c.id===a.id));
 const wrong=structuredClone(manifest);wrong.landmarks[0].catalogueAssetIds.push('objects:invented-pavilion');assert.match(validateLandmarkArt(wrong,geography,assets).join(' '),/Unsupported catalogue/);assert.throws(()=>requireCatalogueBindings(manifest.landmarks[0],[]),/explicit bindings/);
});
test('Mount Dora town anchors preserve metres and never receive another half-tile shift',()=>{
 const light=manifest.landmarks.find(l=>l.id==='md:grantham-lighthouse');assert.deepEqual(light.geographicAnchor.townPoint,[500.2877,1169.7989]);assert.equal(light.geographicAnchor.sourceFeatureId,'osm:node/2704687214');
 const park=geography.features.find(f=>f.id==='osm:way/468920884');assert.deepEqual(park.townPoints[0],[450.0193,524.4105]);assert.deepEqual(park.townBounds,[440.3058,443.9572,519.8018,524.4105]);
 const inn=manifest.landmarks.find(l=>l.id==='md:lakeside-inn');assert.equal(inn.sourceFeatureIds.length,8);assert.match(inn.limitations.join(' '),/not the complete hotel/);assert.equal(new Set(inn.sourceFeatureIds).size,8);
 const boardwalk=geography.features.find(f=>f.id==='osm:way/688219167');assert.equal(boardwalk.kind,'polyline');assert.deepEqual(boardwalk.townPoints[0],[615.5621,1325.8834]);assert.deepEqual(boardwalk.townPoints.at(-1),[348.575,1544.733]);
});
test('Mount Dora cross-sector references retain one global identity without adding seam walls',()=>{
 const park='osm:way/468920884';for(const [c,r]of [[1,1],[2,1],[1,2],[2,2]]){const refs=referencesForSector(manifest,geography,c,r);assert.ok(refs.some(x=>x.globalSourceIds.includes(park)));assert.equal(refs.filter(x=>x.globalSourceIds.includes(park)).length,1);assert.match(refs.find(x=>x.globalSourceIds.includes(park)).geometryPolicy,/no seam caps/);}
 assert.throws(()=>referencesForSector(manifest,geography,6,0));assert.throws(()=>referencesForSector(manifest,geography,0,7));
 const before=JSON.stringify([manifest,geography]);referencesForSector(manifest,geography,2,4);assert.equal(JSON.stringify([manifest,geography]),before);
});
test('Mount Dora reference renderer and painted source bytes match immutable provenance',()=>{
 for(const file of provenance.files.filter(f=>f.local)){const bytes=fs.readFileSync(new URL(file.local,base));assert.equal(bytes.length,file.bytes,file.path);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);}
 assert.equal(provenance.geodataInputs['osm-downtown-snapshot.json'].bytes,3385887);assert.equal(geography.attribution,'© OpenStreetMap contributors, ODbL 1.0');
});
import {createLandmarkStudy} from '../../../maps/mount-dora/art/three.js';
import {roofErrors} from '../../../maps/mount-dora/art/source/nautilus/packages/roof-core/index.js';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
const prototypes=read('source/prototypes.json');
test('Mount Dora actual source geometry preserves native scale and disposes owned resources only',()=>{
 const atlas=new T.Texture(),plantTextures=Object.fromEntries(Object.keys(prototypes.textures).map(k=>[k,new T.Texture()]));let borrowedDisposals=0;for(const t of [atlas,...Object.values(plantTextures)])t.addEventListener('dispose',()=>borrowedDisposals++);
 const rows=[];for(const landmark of manifest.landmarks){let created=0,disposed=0;const host={...T,MeshStandardMaterial:class extends T.MeshStandardMaterial{constructor(options){super(options);created++;this.addEventListener('dispose',()=>disposed++);}}};const study=createLandmarkStudy({THREE:host,id:landmark.id,atlas,prototypes,plantTextures,geography}),metrics=study.metrics();rows.push({id:landmark.id,...metrics});assert.ok(metrics.triangles>0);assert.ok(metrics.triangles<50000);assert.ok(metrics.bounds.min.every(Number.isFinite));assert.ok(metrics.bounds.max.every(Number.isFinite));assert.equal(metrics.geographicallyPlaced,false);
  const gs=new Set();study.root.traverse(o=>{if(o.isMesh){gs.add(o.geometry);for(const a of Object.values(o.geometry.attributes))assert.ok(Array.from(a.array).every(Number.isFinite));}});let released=0;for(const g of gs)g.addEventListener('dispose',()=>released++);study.dispose();assert.equal(released,gs.size);assert.equal(disposed,created,'No unused native source materials leak');study.dispose();assert.equal(disposed,created);assert.equal(study.root.children.length,0);
 }
 const lighthouse=rows.find(r=>r.id==='md:grantham-lighthouse');assert.ok(Math.abs(lighthouse.bounds.max[1]-10.6)<1e-6);assert.equal(borrowedDisposals,0);assert.throws(()=>createLandmarkStudy({THREE:T,id:'objects:invented-lighthouse',atlas,prototypes,plantTextures,geography}));
});
test('Mount Dora source prototypes keep supported IDs and never silently lose a model',()=>{
 const known=new Set(assets.assets.map(a=>a.id));for(const model of Object.values(prototypes.models)){assert.ok(known.has(model.publicAssetId));assert.ok(model.batches.length);for(const b of model.batches){assert.equal(b.positions.length,b.normals.length);assert.equal(b.positions.length/3*2,b.uvs.length);}}
 for(const texture of Object.values(prototypes.textures)){const bytes=fs.readFileSync(new URL(texture.url,base));assert.equal(bytes.length,texture.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),texture.sha256);}
});
test('Mount Dora confirms the real native roof boundary gap rather than inventing one',()=>{
 const common={id:'cross-boundary-study',x:236,y:10,width:8,depth:6,z:1,style:'hip',axis:'x',pitch:28,overhang:.3,material:'metal',seed:19};
 const source=fs.readFileSync(new URL('source/nautilus/packages/roof-core/index.js',base),'utf8');assert.match(source,/including its overhang/);
 // Invoke the actual public source geometry entry at a valid local point, then outside the footprint.
 const okay=roofErrors({slopedRoofs:{version:1,roofs:[{...common,x:24}]}},240);assert.deepEqual(okay,[]);
 const bad=roofErrors({slopedRoofs:{version:1,roofs:[common]}},240);assert.ok(bad.some(e=>e.includes('fit inside')));
});
