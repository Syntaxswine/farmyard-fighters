import * as T from './aft/tactics/vendor/three.module.js';
import {drawPlayerMapMarker} from './map-player-marker.js';
import {createBiomePlantFactory} from './aft/tactics/biome-foliage-models.js';
import {configureBiomeTexture,createBiomeMaterials} from './aft/tactics/biome-foliage-paint.js';
import {BIOME_FAMILIES,BIOME_TEXTURES} from './aft/tactics/biome-foliage-data.js';
import {selectBiomeTree} from './aft/tactics/biome-tree-mix.js';
import {groundHash} from './aft/tactics/biome-ground-composition.js';
import {FoliageCutaway} from './aft/tactics/foliage-cutaway.js';
import {createMountDoraPine} from './mount-dora-pines.js';
import {createMountDoraBroadleaf} from './mount-dora-broadleaf.js';
import {WALL_KIT} from './mount-dora-source/wall-runs.js';
import {windowChanges} from './render-residency.js';
import {blockWindow} from './world-grid.js';
import {getTourWorld} from './mount-dora-activity.js';
import {WALKER_RADIUS} from './mount-dora-world.js';
const origin=new URL('./aft/tactics/',import.meta.url);
const surfaceFiles={
  'ground-grass':'ground-grass.png',woodland:'ground-grass.png','ground-dirt':'ground-dirt.png','ground-gravel':'ground-gravel.png',
  'ground-asphalt':'ground-asphalt.png','ground-concrete':'ground-concrete.png',floor:'ground-concrete.png',
  'ground-wood-planks':'hybrid-surfaces/wood-factory-v2.png',bridge:'hybrid-surfaces/wood-factory-v2.png',water:'foliage/river-water.png',
  brick:'hybrid-surfaces/brick-factory-v1.png',concrete:'ground-concrete.png',wood:'hybrid-surfaces/wood-factory-v2.png'
};
const miniColors=['#17241e','#77845c','#486c7a','#62744c','#866d4c','#929078','#535858','#9d9c8b','#8f7958','#a18b67','#a7a68e'];
const plantModels={bush:'temperate-shrub',reeds:'wetland-reeds'};
function plantAppearance(plant){
  const {x,y,kind,maturePine,matureBroadleaf}=plant,variant=(x*13+y*17)%3;
  if(maturePine!==undefined)return {id:'mount-dora-mature-pine',variant:maturePine,createTree:createMountDoraPine};
  if(matureBroadleaf!==undefined)return {id:'mount-dora-mature-broadleaf',variant:matureBroadleaf,createTree:createMountDoraBroadleaf};
  if(kind.endsWith('-brush')){
    const low=BIOME_FAMILIES[kind==='wetland-brush'?'wetlands':'temperate'].low;
    return {id:low[Math.floor(groundHash(x,y,2018)*low.length)],variant,brush:true};
  }
  if(plantModels[kind])return {id:plantModels[kind],variant};
  const mature=kind.endsWith('-large');
  if(plant.mountDora?.habitat==='wetland'&&!plant.mountDora.sourceId)return {...selectBiomeTree('wetlands',x,y,1947),mature};
  return {id:kind.includes('pine')?'temperate-pine':'temperate-broadleaf',variant,mature};
}
// Original AFT textures/plant factory and exact Nautilus wall panels, adapted only for bounded residency.
export class TownEnvironment{
  constructor(renderer,state,{onLoading=()=>{},onError=()=>{},loader,artModule,createArt,loadAtlas}={}){
    this.world=getTourWorld(state);this.state=state;this.renderer=renderer;this.artModule=artModule;this.root=new T.Group();this.root.name='Mount Dora resident town';
    this.chunks=new Map();this.materials=new Map();this.textures=new Map();this.plantPrototypes=new Map();this.plantCutaway=new FoliageCutaway();
    this.stats={created:0,disposed:0,groundCells:0,wallPanels:0,plantModels:0,plantBatches:0};this.disposed=false;this.generation=0;
    this.cube=new T.BoxGeometry(1,1,1);this.plane=new T.PlaneGeometry(1,1);this.plane.rotateX(-Math.PI/2);this.wallGroup=new T.Group();this.root.add(this.wallGroup);
    const manager=new T.LoadingManager();manager.onStart=()=>{if(!this.disposed)onLoading(true);};manager.onLoad=()=>{if(!this.disposed)onLoading(!this.readyForMovement);};manager.onError=url=>{if(!this.disposed)onError('Town artwork could not load: '+new URL(url,origin).pathname.split('/').at(-1));};
    this.loader=loader||new T.TextureLoader(manager);this.onLoading=onLoading;onLoading(true);
    const load=file=>{if(this.textures.has(file))return this.textures.get(file);const p=this.loader.loadAsync(new URL('../assets/environment/'+file,origin).href).then(t=>{if(this.disposed){t.dispose();return null;}t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return t;});this.textures.set(file,p);return p;};
    for(const [kind,file]of Object.entries(surfaceFiles)){const material=new T.MeshStandardMaterial({color:kind==='water'?0x688b98:0xd4cfbe,roughness:kind==='water'?.6:.95});material.name='town-native:'+kind;this.materials.set(kind,material);
      material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\nvec3 townWorld=(modelMatrix*instanceMatrix*vec4(position,1.0)).xyz;\nvMapUv=townWorld.xz/2.0;\n#endif');};material.customProgramCacheKey=()=> 'town-ground-'+kind;
      load(file).then(texture=>{if(texture&&!this.disposed){material.map=texture;material.needsUpdate=true;}}).catch(()=>{});
    }
    this.atlasOwner=loadAtlas?.(T);const atlasReady=this.atlasOwner?.ready;
    if(!atlasReady||artModule?.ART_REVISION!==this.world.artRevision)throw Error('Town art and movement contract do not match.');
    const plantTextures={};this.plantTextures=plantTextures;const plantReady=Promise.all(Object.entries(BIOME_TEXTURES).map(async([id,path])=>{const texture=await this.loader.loadAsync(new URL(path,origin).href);if(this.disposed){texture.dispose();return;}plantTextures[id]=configureBiomeTexture(texture);})).then(()=>{
      if(this.disposed)return;
      this.plantTextures=plantTextures;this.plantMaterials=createBiomeMaterials(plantTextures);
      for(const [id,material] of Object.entries(this.plantMaterials))this.plantCutaway.decorate(material,0,id==='bark');
      this.plantFactory=createBiomePlantFactory(this.plantMaterials);
    });
    this.ready=Promise.all([atlasReady,plantReady,...this.textures.values()]).then(([atlas])=>{
      if(this.disposed)return;this.landmarks=createArt({THREE:T,atlas});this.landmarks.root.position.set(-.5,0,-.5);this.root.add(this.landmarks.root);this.readyForMovement=true;
      this.update(state,state.units[0],this.window||blockWindow(state,state.units[0]),true);onLoading(false);
    }).catch(error=>{if(!this.disposed){this.failed=error.message;onError(error.message);}});
    this.update(state,state.units[0],blockWindow(state,state.units[0]));
  }
  material(kind){const material=this.materials.get(kind);if(!material)throw Error('Unsupported town surface '+kind);return material;}
  release(chunk){chunk.root.removeFromParent();for(const mesh of chunk.meshes)mesh.dispose();chunk.root.clear();this.stats.disposed++;}
  buildPlants(chunk){
    const {rect}=chunk,plants=this.world.plantsFor([rect.x,rect.y,rect.x+rect.w-1,rect.y+rect.h-1]);
    const groups=new Map(),transform=new T.Matrix4(),position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3(),up=new T.Vector3(0,1,0);
    for(const plant of plants){
      const {id,variant,mature=false,brush=false,createTree}=plantAppearance(plant),key=id+':'+variant+':'+mature;
      if(!this.plantPrototypes.has(key)){
        const prototype=createTree?createTree(T,this.plantFactory.geometries,this.plantMaterials,variant):this.plantFactory.create(id,{variant,mature});
        this.plantPrototypes.set(key,prototype);
      }
      const model=this.plantPrototypes.get(key),low=model.userData.category==='low',jitter=brush?(groundHash(plant.x,plant.y,2084)-.5)*.16:0;
      const bounds=model.userData.bounds;
      const spread=brush?Math.max(Math.abs(bounds.min[0]),Math.abs(bounds.min[2]),bounds.max[0],bounds.max[2]):1;
      const size=brush?Math.min(1,.43/spread)*.85:1;
      position.set(plant.x+jitter,createTree?0:.008,plant.y-jitter);
      rotation.setFromAxisAngle(up,brush?groundHash(plant.x,plant.y,1947)*2*Math.PI:0);
      transform.compose(position,rotation,scale.setScalar(size));
      for(const part of model.children){
        const batch=part.geometry.id+':'+part.material.id+':'+low;
        if(!groups.has(batch))groups.set(batch,{geometry:part.geometry,material:part.material,low,matrices:[]});
        groups.get(batch).matrices.push(new T.Matrix4().multiplyMatrices(transform,part.matrixWorld));
      }
    }
    chunk.plantModels=plants.length;
    chunk.plantMeshes=[];
    for(const {geometry,material,low,matrices} of groups.values()){
      const mesh=new T.InstancedMesh(geometry,material,matrices.length);
      for(const [i,matrix] of matrices.entries())mesh.setMatrixAt(i,matrix);
      mesh.receiveShadow=true;mesh.computeBoundingSphere();
      if(!low)this.plantCutaway.attachShadow(mesh,0);
      chunk.root.add(mesh);chunk.meshes.push(mesh);chunk.plantMeshes.push({mesh,low});
    }
  }
  build(rect){
    const root=new T.Group(),meshes=[],groups=new Map(),matrix=new T.Matrix4(),rotation=new T.Quaternion(),position=new T.Vector3(),scale=new T.Vector3();
    for(let y=rect.y;y<rect.y+rect.h;y++)for(let x=rect.x;x<rect.x+rect.w;x++){const kind=this.world.tile(x,y);if(kind===null)continue;if(!groups.has(kind))groups.set(kind,[]);groups.get(kind).push({x,y});}
    let cells=0;
    for(const [kind,records]of groups){const mesh=new T.InstancedMesh(this.plane,this.material(kind),records.length);for(const [i,p]of records.entries()){matrix.compose(position.set(p.x,kind==='water'?-.025:0,p.y),rotation,scale.set(1.003,1,1.003));mesh.setMatrixAt(i,matrix);}mesh.receiveShadow=true;mesh.userData.noShadow=true;mesh.computeBoundingSphere();root.add(mesh);meshes.push(mesh);cells+=records.length;}
    const roofs=this.world.roofsFor(rect);
    if(roofs.length){const mesh=new T.InstancedMesh(this.cube,this.material('floor'),roofs.length);for(const [i,p]of roofs.entries()){matrix.compose(position.set(p.x,p.level*WALL_KIT.floorSpacing+.06,p.y),rotation,scale.set(1.002,.12,1.002));mesh.setMatrixAt(i,matrix);}mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();root.add(mesh);meshes.push(mesh);}
    this.root.add(root);this.stats.created++;return {rect,root,meshes,cells};
  }
  update(state,unit,window=blockWindow(state,unit),force=false){
    if(this.disposed)return;this.state=state;this.world.ensureCoverage(window,unit);
    const changed=this.window?.key!==window.key||this.dataRevision!==this.world.revision;
    if(changed||force){
      const delta=windowChanges(this.window,window);
      for(const rect of delta.disposed){const chunk=this.chunks.get(rect.id);if(chunk)this.release(chunk);this.chunks.delete(rect.id);}
      // A newly arrived source replaces only blocks that were incomplete or whose source changed.
      const fresh=new Set(delta.created.map(b=>b.id));
      for(const rect of window.blocks){const old=this.chunks.get(rect.id),signature=this.world.sectorIdsForBounds([rect.x,rect.y,rect.x+rect.w-1e-6,rect.y+rect.h-1e-6]).map(id=>this.world.cache.has(id)?id:'?'+id).join(':');if(!old||old.signature!==signature||fresh.has(rect.id)){if(old)this.release(old);const chunk=this.build(rect);chunk.signature=signature;this.chunks.set(rect.id,chunk);}}
      for(const child of [...this.wallGroup.children]){child.dispose();child.removeFromParent();}
      const groups=new Map();for(const panel of this.world.wallPanelsFor(window)){if(!groups.has(panel.material))groups.set(panel.material,[]);groups.get(panel.material).push(panel);}
      const matrix=new T.Matrix4(),p=new T.Vector3(),q=new T.Quaternion(),e=new T.Euler(),scale=new T.Vector3();let panelCount=0;
      for(const [kind,panels]of groups){const mesh=new T.InstancedMesh(this.cube,this.material(kind),panels.length);for(const [i,v]of panels.entries()){q.setFromEuler(e.set(0,v.yaw,0));matrix.compose(p.fromArray(v.center),q,scale.fromArray(v.size));mesh.setMatrixAt(i,matrix);}mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();this.wallGroup.add(mesh);panelCount+=panels.length;}
      this.stats.wallPanels=panelCount;
      if(this.plantFactory)for(const chunk of this.chunks.values())if(!chunk.plantMeshes)this.buildPlants(chunk);
      this.landmarks?.updateResident([window.x,window.y,window.x+window.w,window.y+window.h]);
      this.window=window;this.dataRevision=this.world.revision;
      this.stats.groundCells=0;this.stats.plantModels=0;this.stats.plantBatches=0;
      for(const chunk of this.chunks.values()){
        this.stats.groundCells+=chunk.cells;
        this.stats.plantModels+=chunk.plantModels||0;
        this.stats.plantBatches+=chunk.plantMeshes?.length||0;
      }
    }
  }
  // A walker stands on a raised deck wherever their body overlaps the drawn deck, and
  // anywhere on a deck cell over water (bridge) whose centre the deck covers, so no
  // walker stands at water level on a pier's walkable cells. Field cell centres are
  // integers, half a cell from town metres.
  surfaceHeight(x,y){const art=this.artModule;if(!art?.deckHeightAt)return 0;const cx=Math.floor(x+.5),cy=Math.floor(y+.5);
    return Math.max(art.deckHeightAt([x+.5,y+.5],WALKER_RADIUS),this.world?.tile(cx,cy)==='bridge'?art.deckHeightAt([cx+.5,cy+.5]):0);}
  setFocus(unit,camera){
    const eyeHeight=this.surfaceHeight(unit.x,unit.y)+(unit.stance==='prone'?.3:unit.stance==='kneeling'?.75:1.2);
    this.landmarks?.setFocus?.([unit.x+.5,unit.y+.5],{camera,eyeHeight});
    this.plantCutaway.update(camera,[{id:unit.id,position:[unit.x,eyeHeight,unit.y],level:0}]);
    const ppu=this.renderer.domElement.clientHeight*camera.zoom/(camera.top-camera.bottom);
    for(const {rect,plantMeshes} of this.chunks.values()){
      const near=unit.x>=rect.x-14&&unit.x<rect.x+rect.w+14&&unit.y>=rect.y-14&&unit.y<rect.y+rect.h+14;
      for(const {mesh,low} of plantMeshes||[]){
        mesh.visible=!low||ppu>=9;
        // DaylightRig re-derives castShadow from userData.noShadow whenever it runs; keep the two in step.
        mesh.castShadow=!low&&near&&ppu>=12;mesh.userData.noShadow=!mesh.castShadow;
      }
    }
  }
  metrics(){return {...this.stats,blocks:this.chunks.size,landmarks:this.landmarks?{...this.landmarks.metrics(),residentIds:this.landmarks.root.children.map(o=>o.name)}:null,decodedSectors:this.world.cache.size};}
  dispose(){if(this.disposed)return;this.disposed=true;this.readyForMovement=false;this.root.removeFromParent();for(const c of this.chunks.values())this.release(c);this.chunks.clear();for(const child of this.wallGroup.children)child.dispose();this.wallGroup.clear();this.plantPrototypes.clear();this.plantCutaway.dispose();this.landmarks?.dispose();this.atlasOwner?.dispose();this.plantFactory?.dispose();for(const m of Object.values(this.plantMaterials||{}))m.dispose();for(const t of Object.values(this.plantTextures||{}))t.dispose();for(const material of this.materials.values())material.dispose();for(const promise of this.textures.values())promise.then(t=>t?.dispose()).catch(()=>{});this.materials.clear();this.textures.clear();this.cube.dispose();this.plane.dispose();this.root.clear();}
}
const miniCache=new WeakMap();
export function drawTownMinimap(canvas,state,options={}){
  const world=getTourWorld(state),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.fillStyle=miniColors[0];ctx.fillRect(0,0,w,h);
  let cached=miniCache.get(world);
  if(!cached){const c=document.createElement('canvas');c.width=180;c.height=210;cached={canvas:c,revision:-1};miniCache.set(world,cached);}
  if(world.overviewImage&&cached.image!==world.overviewImage){cached.canvas.getContext('2d').drawImage(world.overviewImage,0,0,180,210);cached.image=world.overviewImage;}
  if(!world.overviewImage&&cached.revision!==world.overviewRevision){const c=cached.canvas.getContext('2d');for(let y=0;y<210;y++)for(let x=0;x<180;x++){c.fillStyle=miniColors[world.overview[y*180+x]];c.fillRect(x,y,1,1);}cached.revision=world.overviewRevision;}
  const scale=Math.min((w-12)/1440,(h-12)/1680),ox=(w-1440*scale)/2,oy=(h-1680*scale)/2;ctx.imageSmoothingEnabled=false;ctx.drawImage(cached.canvas,ox,oy,1440*scale,1680*scale);
  ctx.strokeStyle='#85907d';ctx.lineWidth=.5;for(let x=240;x<1440;x+=240){ctx.beginPath();ctx.moveTo(ox+x*scale,oy);ctx.lineTo(ox+x*scale,oy+1680*scale);ctx.stroke();}for(let y=240;y<1680;y+=240){ctx.beginPath();ctx.moveTo(ox,oy+y*scale);ctx.lineTo(ox+1440*scale,oy+y*scale);ctx.stroke();}
  ctx.fillStyle='#e16a47';
  for(const unit of state.units)if(unit.hp>0&&state.detected.has(unit.id)){
    ctx.beginPath();ctx.arc(ox+(unit.x+.5)*scale,oy+(unit.y+.5)*scale,options.expanded?3:2,0,Math.PI*2);ctx.fill();
  }
  const unit=state.units[0];drawPlayerMapMarker(canvas,ctx,{x:ox+(unit.x+.5)*scale,y:oy+(unit.y+.5)*scale,heading:unit.heading},options);
}
