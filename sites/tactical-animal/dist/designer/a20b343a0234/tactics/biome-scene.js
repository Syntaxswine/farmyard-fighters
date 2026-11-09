import {HedgeScene} from './hedge-scene.js';
import {StaticSubtreeMatrices} from './static-model-batches.js';
import {BIOME_OBSTACLES} from './biome-obstacle-data.js';
import {FoliageCutaway} from './foliage-cutaway.js';
import {createFoliageScreens} from './foliage-screen-scene.js';
import {SCREEN_ATLAS,FRINGE_ATLAS,createScreenMaterials} from './foliage-screen-paint.js';
import * as T from './vendor/three.module.js';
import {BIOME_TEXTURES,BIOME_FAMILIES} from './biome-foliage-data.js';
import {biomeTreeModels} from './biome-tree-mix.js';
import {configureBiomeTexture,createBiomeMaterials} from './biome-foliage-paint.js';
import {createBiomeObstacleMaterials} from './biome-obstacle-paint.js';
import {createBiomePlantFactory} from './biome-foliage-models.js';
import {createBiomeTerrain} from './biome-terrain.js';
import {createTerrainFill} from './biome-terrain-fill.js';
import {createMapGroundPaint,createBiomeMixSampler} from './biome-map-paint.js';
import {biomePlans,biomeEnabled,biomeTree,biomeFamilyAt,biomeSeed} from './biome-gameplay.js';
import {groundHash} from './biome-ground-composition.js';
import {DIMENSIONS} from './hybrid-world.js';
import {cliffSupportAt} from './cliff-support.js';

// Light woods keep an open understory: no shrub domes or continuous thickets.
export const OPEN_WOODLAND_PLANTS={jungle:'jungle-fern',temperate:'temperate-tuft',snow:'snow-grass',dry:'dry-tussock',wetlands:'wetland-reeds'};

// Summarize the existing fragment-fog mask, without changing what is known.
// A fully hidden screen chunk need not submit geometry at all. Partly visible
// chunks still use the exact per-fragment mask, including concealed interiors.
export function biomeVisibilitySummary(data,size){
 const stride=size+1,sums=new Uint32Array(stride*stride);
 for(let z=0;z<size;z++){let row=0;for(let x=0;x<size;x++){row+=data[z*size+x]?1:0;sums[(z+1)*stride+x+1]=sums[z*stride+x+1]+row;}}
 const count=(b,pad)=>{
  const x0=Math.max(0,Math.floor(b.min.x-pad)),z0=Math.max(0,Math.floor(b.min.z-pad)),x1=Math.min(size,Math.ceil(b.max.x+pad)+1),z1=Math.min(size,Math.ceil(b.max.z+pad)+1);
  if(x1<=x0||z1<=z0)return [0,0];
  return [sums[z1*stride+x1]-sums[z0*stride+x1]-sums[z1*stride+x0]+sums[z0*stride+x0],(x1-x0)*(z1-z0)];
 };
 return {any:b=>count(b,.5)[0]>0,all:b=>{const [n,area]=count(b,0);return n===area;}};
}

export function mixedBiomeFill(plan,map){
 const fills=new Map(),cache=new Map(),sampleBiome=createBiomeMixSampler(map,plan.level),get=family=>{if(!fills.has(family))fills.set(family,createTerrainFill(plan,family));return fills.get(family);};
 const blend=(method,x,y)=>{const mix=sampleBiome(x,y);return mix.reduce((n,p)=>n+get(p.family)[method](x,y)*p.weight,0);};
 const height=(x,y)=>{const key=x.toFixed(4)+','+y.toFixed(4);if(!cache.has(key))cache.set(key,blend('height',x,y)*(.25+.75*plan.densityAt(Math.floor(x+.5),Math.floor(y+.5))));return cache.get(key);};
 return {height,distance:(x,y)=>get(plan.family).distance(x,y),color:(x,y)=>sampleBiome(x,y).reduce((rgb,p)=>{const c=get(p.family).color(x,y);return rgb.map((v,i)=>v+c[i]*p.weight);},[0,0,0]),normal(x,y){const e=.08,dx=(height(x+e,y)-height(x-e,y))/(2*e),dy=(height(x,y+e)-height(x,y-e))/(2*e),n=Math.hypot(dx,1,dy);return [-dx/n,1/n,-dy/n];}};
}
export class BiomeScene{
 constructor(scene,loader,onReady=()=>{},onError=()=>{},{planSource=biomePlans}={}){
  this.root=new T.Group();this.root.name='Gameplay biomes';scene.add(this.root);this.loader=loader;this.onReady=onReady;this.onError=onError;
  this.hedges=new HedgeScene(scene,loader,onReady,onError);this.cutaway=new FoliageCutaway();this.cutawayTargets=[];this.inspection='both';this.vegetation=[];this.terrains=[];this.openTrees=[];this.paints=[];this.instances=[];this.layerMaterials=new Map();this.layers=new Map();this.textures={};this.signature=null;this.ready=false;this.disposed=false;this.planSource=planSource;
 }
 load(){
  if(this.loading||this.ready||this.failed)return;
  const urls={...BIOME_TEXTURES,screens:SCREEN_ATLAS,fringe:FRINGE_ATLAS,obstacles:'../assets/environment/biome-obstacles/paint-atlas-v1.png'};
  this.loading=Promise.all(Object.entries(urls).map(async([key,url])=>{const t=await this.loader.loadAsync(url);if(this.disposed){t.dispose();return;}this.textures[key]=configureBiomeTexture(t);})).then(()=>{
   if(this.disposed)return;this.materials=createBiomeMaterials(this.textures);this.screenMaterials=createScreenMaterials(this.textures.screens,this.textures.fringe);this.obstacleMaterials=createBiomeObstacleMaterials(this.textures.obstacles);this.factory=createBiomePlantFactory(this.materials);this.ready=true;this.onReady();
  }).catch(e=>{if(this.disposed)return;this.failed=true;this.onError(Error('Biome assets: '+e.message));});
 }
 layer(level,size){
  if(this.layers.has(level))return this.layers.get(level);
  const data=new Uint8Array(size*size).fill(255),texture=new T.DataTexture(data,size,size,T.RedFormat);texture.unpackAlignment=1;texture.needsUpdate=true;
  const value={texture,dim:{value:1},size};this.layers.set(level,value);return value;
 }
 decorate(material,level,size){
  if(material.userData.biomeVisibilityLevel===level)return material;
  material.userData.biomeVisibilityLevel=level;
  const visibility=this.layer(level,size),compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.customProgramCacheKey=()=>key+'-biome-map-visibility';
  material.onBeforeCompile=(s,r)=>{compile.call(material,s,r);Object.assign(s.uniforms,{biomeVisibility:{value:visibility.texture},biomeDim:visibility.dim});
   s.vertexShader='varying vec2 vBiomeVisibility;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    mat4 visibilityWorld=modelMatrix;
    #ifdef USE_INSTANCING
     visibilityWorld*=instanceMatrix;
    #endif
    vBiomeVisibility=(visibilityWorld*vec4(position,1.)).xz;
   `);s.fragmentShader='varying vec2 vBiomeVisibility;uniform sampler2D biomeVisibility;uniform float biomeDim;\n'+s.fragmentShader;
   s.fragmentShader=s.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    if(any(lessThan(vBiomeVisibility,vec2(-.5)))||any(greaterThan(vBiomeVisibility,vec2(${size-.5})))||texture2D(biomeVisibility,(floor(vBiomeVisibility+.5)+.5)/${size.toFixed(1)}).r<.5)discard;
   `).replace('#include <opaque_fragment>','outgoingLight*=biomeDim;\n#include <opaque_fragment>');
  };return material;
 }
 material(base,level,size,vegetation=true){const key=base.uuid+':'+level+':'+vegetation;if(!this.layerMaterials.has(key)){const m=base.clone();m.onBeforeCompile=base.onBeforeCompile;m.customProgramCacheKey=base.customProgramCacheKey;this.decorate(m,level,size);this.layerMaterials.set(key,vegetation?this.cutaway.decorate(m,level,base===this.materials?.bark):m);}return this.layerMaterials.get(key);}
 clear(){
  this.cutaway.clear();this.vegetation=[];
  for(const t of this.terrains){t.matrices?.dispose();t.screens?.dispose();t.dispose();}this.terrains=[];this.openTrees=[];for(const m of this.instances){m.removeFromParent();m.dispose();}this.instances=[];
  for(const p of this.paints)p.dispose();this.paints=[];for(const m of this.layerMaterials.values())m.dispose();this.layerMaterials.clear();for(const l of this.layers.values())l.texture.dispose();this.layers.clear();this.signature=null;
 }
 rebuild(map,seen,level,{editor=false,selectedLevel=level,dim=false}={}){
  this.hedges.rebuild(map,seen,level,{editor,selectedLevel,dim});this.map=map;this.level=level;this.root.visible=biomeEnabled(map);if(!this.root.visible){if(this.signature)this.clear();return false;}
  if(!this.ready){this.load();return false;}
  const definition=map.definition||map,signature=JSON.stringify([map.terrain||map.map,map.upper,map.coverOccupiedProps||map.props,map.foliage,map.environment,map.edges,map.stairs,map.climbs,definition.starts,definition.guards,definition.exits]);
  const size=(map.terrain||map.map).length;
  if(signature!==this.signature){
   this.clear();this.signature=signature;const plans=this.planSource(map),fills=new Map(),paints=new Map(),batches=new Map();
   const factory=level=>({create:(id,opts)=>{const p=this.factory.create(id,opts);p.traverse(m=>{if(m.isMesh)m.material=this.material(m.material,level,size);});return p;}});
   for(const plan of plans){
    const z=plan.level;if(!paints.has(z)){const paint=createMapGroundPaint(map,z,this.textures.ground);paints.set(z,paint);this.paints.push(paint);}
    if(!fills.has(z))fills.set(z,mixedBiomeFill(plan,map));
    const terrain=createBiomeTerrain(plan,plan.family,{ground:paints.get(z).ground,cliff:null,surfaceMaterial:this.material(plan.family==='snow'?this.materials.snow:this.obstacleMaterials[BIOME_OBSTACLES[plan.family].paint],z,size,false),plantMaterials:Object.fromEntries(Object.entries(this.materials).map(([k,m])=>[k,this.material(m,z,size)])),obstacleMaterials:Object.fromEntries(Object.entries(this.obstacleMaterials).map(([k,m])=>[k,this.material(m,z,size)])),plantFactory:factory(z),paintSeed:biomeSeed(map),fill:fills.get(z),onPaintReady:()=>this.onReady(),decorateMaterial:m=>this.decorate(m,z,size),groundSkinOptions:{maxResident:Math.max(1,Math.floor(16/plans.length)),...(plan.cells.length?{}:{canvasFactory:()=>null})}});
    terrain.screens=createFoliageScreens(plan,{plantMaterials:this.materials,screenMaterials:this.screenMaterials,decorate:m=>this.material(m,z,size)});terrain.root.add(terrain.screens.root);
    terrain.level=z;terrain.root.position.y=.008;this.root.add(terrain.root);terrain.matrices=new StaticSubtreeMatrices(terrain.root);this.terrains.push(terrain);
    const prototypes=[0,1,2].map(variant=>factory(z).create(OPEN_WOODLAND_PLANTS[plan.family],{variant}));
    const trees=biomeTreeModels(plan.family).flatMap(id=>[0,1,2].map(variant=>factory(z).create(id,{variant})));
    const treeSpecs=new Map(plan.trees.map(t=>[`${t.x},${t.y}`,t]));
    for(const c of plan.passableCells()){
     if(plan.treeAt(c.x,c.y)){
      const spec=treeSpecs.get(`${c.x},${c.y}`),tree=trees.find(p=>p.userData.id===spec.id&&p.userData.variant===spec.variant);
      this.batchPlant(batches,tree,c.x,c.height+.008,c.y,z,1);this.openTrees.push({x:c.x,y:c.y,z,height:c.height,id:tree.userData.id});continue;
     }
     const hash=groundHash(c.x+plan.origin[0],c.y+plan.origin[1],plan.seed+z*911);if(hash*100>=c.density)continue;
     const p=prototypes[Math.floor(groundHash(c.x,c.y,plan.seed+71)*prototypes.length)],b=p.userData.bounds,max=Math.max(Math.abs(b.min[0]),b.max[0],Math.abs(b.min[2]),b.max[2]),scale=Math.min(1,.43/max);
     const jitter=groundHash(c.x,c.y,plan.seed+z*911+137)-.5;
     this.batchPlant(batches,p,c.x+jitter*.16,c.height+.008,c.y-jitter*.16,z,scale*.85,hash*Math.PI*2);
    }
   }
   for(const p of map.props||[])if(biomeTree(p.kind)){
    const z=p.z||0,family=biomeFamilyAt(map,p.x,p.y,z),id=BIOME_FAMILIES[family].trees[p.kind.includes('pine')?1:0],variant=Math.floor(groundHash(p.x,p.y,biomeSeed(map))*3),plant=factory(z).create(id,{variant,mature:p.kind.endsWith('-large')}),support=cliffSupportAt(map,p),height=support?support.level*DIMENSIONS.floorSpacing+support.height:z*DIMENSIONS.floorSpacing;
    this.batchPlant(batches,plant,p.x,height,p.y,z,1,p.rotated?-Math.PI/2:0);
   }
   for(const {geometry,material,matrices,level,low}of batches.values()){const mesh=new T.InstancedMesh(geometry,material,matrices.length);matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.receiveShadow=true;Object.assign(mesh.userData,{biomeLevel:level,low});this.root.add(mesh);this.instances.push(mesh);}
  }
  if(!this.vegetation.length){
   const mark=(m,z,kind)=>{m.userData.foliageKind=kind;this.vegetation.push(m);this.cutaway.attachShadow(m,z);};
   for(const t of this.terrains){for(const m of t.treeInstances)mark(m,t.level,'trees');for(const c of t.chunks)for(const m of c.meshes)if(m.isInstancedMesh&&!t.treeInstances.includes(m))mark(m,t.level,'brush');t.screens?.root.traverse(m=>{if(m.isMesh)mark(m,t.level,'brush');});}
   for(const m of this.instances)mark(m,m.userData.biomeLevel,m.userData.low?'brush':'trees');
  }
  for(const [z,l]of this.layers){const data=l.texture.image.data;for(let y=0;y<size;y++)for(let x=0;x<size;x++){const key=z?`${x},${y},${z}`:`${x},${y}`;data[y*size+x]=editor||((!seen||seen.has(key))&&!map.concealedInteriors?.has(key))?255:0;}l.texture.needsUpdate=true;l.dim.value=dim&&z<selectedLevel?.38:1;}
  // Fragment fog also governs shadows: a shared batch with unknown ground must
  // not project hidden crowns into the visible part of the map.
  const visibility=new Map([...this.layers].map(([z,l])=>[z,biomeVisibilitySummary(l.texture.image.data,size)])),known=(z,bounds)=>visibility.get(z).all(bounds);
  for(const t of this.terrains){t.root.visible=t.level<=level;t.screens?.setVisibility?.(visibility.get(t.level).any,visibility.get(t.level).all);for(const c of t.chunks)c.shadowKnown=known(t.level,c.bounds);}
  for(const m of this.instances){m.visible=m.userData.biomeLevel<=level;m.userData.shadowKnown=known(m.userData.biomeLevel,m.boundingBox);}return true;
 }
 coversGround(x,y){return this.terrains.some(t=>t.level===0&&t.coversGround(x,y));}
 batchPlant(batches,plant,x,y,z,level,scale,yaw=0){
  plant.updateMatrixWorld(true);const low=plant.userData.category==='low',transform=new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw),new T.Vector3(scale,scale,scale));plant.traverse(m=>{if(!m.isMesh)return;const key=`${Math.floor(x/24)},${Math.floor(z/24)}:${level}:${low}:${m.geometry.uuid}:${m.material.uuid}`;if(!batches.has(key))batches.set(key,{geometry:m.geometry,material:m.material,matrices:[],level,low});batches.get(key).matrices.push(new T.Matrix4().multiplyMatrices(transform,m.matrixWorld));});
 }
 update(camera,focus,ppu){this.hedges.update(camera,focus,ppu,this.cutawayTargets);this.cutaway.update(camera,this.cutawayTargets);for(const m of this.vegetation)if(m.userData.inspectionVisible!==undefined)m.visible=m.userData.inspectionVisible;for(const t of this.terrains)if(t.root.visible){t.matrices?.sync();t.update(camera,{focus,ppu,shadowDetail:this.shadowDetail});t.screens?.update(ppu,focus,{shadowDetail:this.shadowDetail});}for(const m of this.instances){m.visible=m.userData.biomeLevel<=this.level&&(!m.userData.low||ppu>=9);const p=m.boundingSphere?.center,near=p&&p.distanceTo(focus)<28;m.castShadow=m.visible&&ppu>12&&!!near&&m.userData.shadowKnown;m.userData.noShadow=!m.castShadow;}for(const m of this.vegetation){m.userData.inspectionVisible=m.visible;if(this.inspection!=='both'&&this.inspection!==m.userData.foliageKind)m.visible=false;}}
 stats(){return {hedges:this.hedges.stats(),ready:this.ready,regions:this.terrains.length,trees:this.openTrees.length+this.terrains.reduce((n,t)=>n+t.trees.length,0),openWoodlandTrees:this.openTrees.length,blockedCells:this.terrains.reduce((n,t)=>n+t.stats.blockedCells,0),paint:this.terrains.map(t=>t.groundSkin.stats)};}
 dispose(){if(this.disposed)return;this.hedges.dispose();this.disposed=true;this.clear();this.cutaway.dispose();this.factory?.dispose();for(const m of Object.values(this.materials||{}))m.dispose();for(const m of Object.values(this.screenMaterials||{}))m.dispose();for(const m of Object.values(this.obstacleMaterials||{}))m.dispose();for(const t of Object.values(this.textures))t.dispose();this.root.removeFromParent();}
}
