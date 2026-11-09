// Build-time reuse of fixed Farmyard/AFT model factories. No runtime Three copy.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import * as T from '../../../../sites/tactical-animal/dist/aft/tactics/vendor/three.module.js';
import {createBiomePlantFactory} from '../../../../sites/tactical-animal/dist/aft/tactics/biome-foliage-models.js';
import {BIOME_PAINT,BIOME_TEXTURES,BIOME_FAMILIES} from '../../../../sites/tactical-animal/dist/aft/tactics/biome-foliage-data.js';
import {buildWorld} from '../../../../sites/tactical-animal/dist/aft/tactics/hybrid-world.js';
import {environmentVisuals} from '../../../../sites/tactical-animal/dist/aft/tactics/environment-visuals.js';
import {createFurnitureLibrary} from '../../../../sites/tactical-animal/dist/aft/tactics/painted-furniture.js';
import {environmentGeometries} from '../../../../sites/tactical-animal/dist/aft/tactics/environment-geometry.js';
const root=fileURLToPath(new URL('../',import.meta.url)),repo=fileURLToPath(new URL('../../../../',import.meta.url)),base='251bf8094b5f9ebe44208443084c1a6d6658512a',sha=b=>crypto.createHash('sha256').update(b).digest('hex'),round=n=>Math.abs(n)<1e-12?0:Number(n.toFixed(8)),models={};
const source=[];function record(relative){const actual=fs.readFileSync(path.join(repo,relative)),original=execFileSync('git',['show',base+':'+relative],{cwd:repo,maxBuffer:16*1024*1024});if(!actual.equals(original)&&actual.toString().replace(/\r\n/g,'\n')!==original.toString().replace(/\r\n/g,'\n'))throw Error('Moving source: '+relative);source.push({path:relative,revision:base,sha256:sha(original),bytes:original.length});return original;}
record('sites/tactical-animal/dist/art/library/thumbnail-renderer.js');
for(const n of ['biome-foliage-models.js','biome-foliage-data.js','biome-plant-parts.js','foliage-models.js','environment-geometry.js','hybrid-world.js','environment-visuals.js','environment-models.js','painted-furniture.js'])record('sites/tactical-animal/dist/aft/tactics/'+n);
function data(g){const d={positions:Array.from(g.attributes.position.array,round),normals:Array.from(g.attributes.normal.array,round),uvs:g.attributes.uv?Array.from(g.attributes.uv.array,round):Array(g.attributes.position.count*2).fill(0)};return d;}
const materials=Object.fromEntries([...Object.keys(BIOME_PAINT),'grey'].map(id=>{const m=new T.MeshStandardMaterial();m.name=id;return [id,m];})),plants=createBiomePlantFactory(materials);
for(const [id,model]of [['shade-tree',BIOME_FAMILIES.temperate.trees[0]],['wetland-tree',BIOME_FAMILIES.wetlands.trees[0]],['wetland-tree-2',BIOME_FAMILIES.wetlands.trees[1]]]){
 const plant=plants.create(model,{variant:1,mature:true}),batches=[];plant.updateMatrixWorld(true);plant.traverse(m=>{if(!m.isMesh)return;const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(m.matrixWorld);batches.push({paint:m.material.name,...data(g)});g.dispose();});models[id]={publicAssetId:id==='shade-tree'?'objects:tree-broadleaf-large':'foliage:wetland-v1',sourceModel:model,sourceVariant:1,mature:true,batches};
}
const shapes=environmentGeometries();
for(const kind of ['table-wood','reeds']){
 const map={version:2,width:9,height:9,levels:3,terrain:Array.from({length:9},()=>Array(9).fill('ground-grass')),upper:[{},{}],edges:{},props:[{kind,x:4,y:4,z:0}],stairs:[],climbs:[],guards:[],starts:[],exits:[]};const world=buildWorld(map);if(world.diagnostics.length)throw Error(JSON.stringify(world.diagnostics));const batches=[];
 for(const b of environmentVisuals(world,map,{biomes:false}).filter(b=>b.source.prop)){
  const shape=shapes[b.shape||'box'];if(!shape)throw Error('Unsupported existing shape '+b.shape);const g=shape.index?shape.toNonIndexed():shape.clone(),q=new T.Quaternion().setFromEuler(new T.Euler(...(b.rotation||[0,0,0]))).premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),b.yaw||0));g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(b.center[0]-4,b.center[1],b.center[2]-4),q,new T.Vector3(...b.size)));batches.push({material:b.material,...data(g)});g.dispose();
 }models[kind]={publicAssetId:'objects:'+kind,batches};
}
const furniture=createFurnitureLibrary(new T.Texture(),new T.Texture()),streetlight=furniture.build('streetlight'),lightBatches=[];streetlight.root.updateMatrixWorld(true);
streetlight.root.traverse(m=>{if(!m.isMesh)return;const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(m.matrixWorld);lightBatches.push({material:m.material.name,color:m.material.color.toArray(),roughness:m.material.roughness,...data(g)});g.dispose();});
models.streetlight={publicAssetId:'objects:streetlight',sourceFactory:'painted-furniture.js:createFurnitureLibrary',batches:lightBatches};furniture.dispose();
for(const [id,m]of Object.entries(models))if(!m.batches.length)throw Error('Source model produced no geometry: '+id);
// Static source parts with identical paint can share one batch. No motion/state is merged.
for(const m of Object.values(models)){const groups=new Map();for(const b of m.batches){const key=JSON.stringify([b.paint,b.material,b.color,b.roughness]);if(!groups.has(key))groups.set(key,{...b,positions:[],normals:[],uvs:[]});const g=groups.get(key);g.positions.push(...b.positions);g.normals.push(...b.normals);g.uvs.push(...b.uvs);}m.batches=[...groups.values()];}
const used=new Set(Object.values(models).flatMap(m=>m.batches.map(b=>b.paint?BIOME_PAINT[b.paint].atlas:null)).filter(Boolean)),textures={};
for(const key of used){const relative='sites/tactical-animal/dist/aft/'+BIOME_TEXTURES[key].replace('../',''),bytes=record(relative),file='source/plant-'+key+'.png';fs.writeFileSync(path.join(root,file),bytes);textures[key]={url:file,sha256:sha(bytes),bytes:bytes.length};}
fs.writeFileSync(path.join(root,'source/prototypes.json'),JSON.stringify({schema:1,metresPerUnit:1,source,models,paints:BIOME_PAINT,textures})+'\n');
plants.dispose();for(const m of Object.values(materials))m.dispose();for(const g of new Set(Object.values(shapes)))g.dispose();console.log(JSON.stringify({models:Object.keys(models),textures:[...used]}));
