import * as T from './aft/tactics/vendor/three.module.js';
import {createBiomePlantFactory} from './aft/tactics/biome-foliage-models.js';
import {configureBiomeTexture,createBiomeMaterials} from './aft/tactics/biome-foliage-paint.js';
import {BIOME_TEXTURES} from './aft/tactics/biome-foliage-data.js';
import {FoliageCutaway} from './aft/tactics/foliage-cutaway.js';
import {createMountDoraPine} from './mount-dora-pines.js';
import {createFurnitureLibrary} from './aft/tactics/painted-furniture.js';
import {PAINTED_ATLAS} from './aft/tactics/painted-environment-scene.js';
import {CARGO_ATLAS} from './aft/tactics/painted-cargo.js';
import {barrierParts,barrierGeometry} from './barrier-art.js';
import {PRISON_PLANTS,PRISON_BARRIERS,PRISON_FURNITURE} from './prison-map.js';
import {pointInWorldRect} from './world-grid.js';

const origin=new URL('./aft/tactics/',import.meta.url),key=p=>`${Math.round(p.x)},${Math.round(p.y)}`;
export class PrisonScenery{
  constructor(state,{onLoading=()=>{},onError=()=>{},loadTexture=url=>new T.TextureLoader().loadAsync(url)}={}){
    this.root=new T.Group();this.root.name='Pinewire Prison / inherited AFT scenery';this.state=state;this.batches=[];this.furniture=[];this.textures=[];this.materials=[];this.cutaway=new FoliageCutaway();this.geometries=barrierGeometry();this.disposed=false;
    this.stats={trees:PRISON_PLANTS.filter(p=>p.kind==='pine').length,brush:PRISON_PLANTS.filter(p=>p.kind==='brush').length,fencePanels:PRISON_BARRIERS.filter(p=>p.kind==='fence-chainlink').length,cells:8,beds:8,batches:0};
    onLoading(true);
    const load=async file=>{const texture=await loadTexture(new URL(file,origin).href);if(this.disposed){texture.dispose();return null;}this.textures.push(texture);return texture;};
    this.ready=Promise.all([Promise.all(Object.entries(BIOME_TEXTURES).map(async([id,file])=>[id,await load(file)])),load(PAINTED_ATLAS),load(CARGO_ATLAS)]).then(([plants,atlas,cargo])=>{
      if(this.disposed)return;
      this.plantMaterials=createBiomeMaterials(Object.fromEntries(plants.map(([id,t])=>[id,configureBiomeTexture(t)])));
      for(const [id,m]of Object.entries(this.plantMaterials))this.cutaway.decorate(m,0,id==='bark');
      this.factory=createBiomePlantFactory(this.plantMaterials);
      this.iron=new T.MeshStandardMaterial({color:0x858b7c,roughness:.82});this.materials.push(this.iron);
      this.buildBarriers();this.buildPlants();
      this.library=createFurnitureLibrary(atlas,cargo);
      for(const p of PRISON_FURNITURE){const model=this.library.build(p.form,'cream');model.root.position.set(p.x,0,p.y);model.root.name=p.id;this.root.add(model.root);this.furniture.push({root:model.root,p});}
      this.stats.batches=this.batches.length;this.update(this.state,this.window);
    }).catch(error=>{if(!this.disposed)onError('Prison artwork could not load: '+error.message);}).finally(()=>{if(!this.disposed)onLoading(false);});
  }
  batch(parts){
    const groups=new Map();
    for(const part of parts){const id=part.geometry.id+':'+part.material.id;if(!groups.has(id))groups.set(id,{geometry:part.geometry,material:part.material,parts:[]});groups.get(id).parts.push(part);}
    for(const group of groups.values()){
      const mesh=new T.InstancedMesh(group.geometry,group.material,group.parts.length);mesh.count=0;mesh.receiveShadow=true;
      if(group.parts[0].plant)this.cutaway.attachShadow(mesh,0);
      this.root.add(mesh);this.batches.push({mesh,parts:group.parts});
    }
  }
  buildBarriers(){
    const parts=[],matrix=new T.Matrix4(),parent=new T.Matrix4(),position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3(),up=new T.Vector3(0,1,0);
    for(const record of PRISON_BARRIERS){
      const [axis,x,y]=record.edge.split(':'),p={x:+x+(axis==='e'?.5:0),y:+y+(axis==='s'?.5:0),edge:record.edge};
      parent.compose(position.set(p.x,1,p.y),rotation.setFromAxisAngle(up,axis==='e'?Math.PI/2:0),scale.set(1,1,1));
      for(const part of barrierParts(record.kind)){
        const q=new T.Quaternion().setFromEuler(new T.Euler(...(part.rotation||[0,0,0])));
        matrix.compose(new T.Vector3(...part.center),q,new T.Vector3(...part.size));
        parts.push({geometry:this.geometries[part.shape||'box'],material:this.iron,matrix:new T.Matrix4().multiplyMatrices(parent,matrix),p});
      }
    }
    this.batch(parts);
  }
  buildPlants(){
    const models=new Map(),parts=[],at=new T.Matrix4();
    for(const p of PRISON_PLANTS){
      const id=p.kind+':'+p.variant;
      if(!models.has(id)){
        const model=p.kind==='pine'?createMountDoraPine(T,this.factory.geometries,this.plantMaterials,p.variant):this.factory.create('temperate-shrub',{variant:p.variant});
        if(p.kind==='brush'){const b=model.userData.bounds,r=Math.max(...b.min.map(Math.abs),...b.max);model.scale.setScalar(Math.min(1,.42/r));}
        model.updateMatrixWorld(true);models.set(id,model);
      }
      const model=models.get(id);at.makeTranslation(p.x,0,p.y);
      for(const child of model.children)parts.push({geometry:child.geometry,material:child.material,matrix:new T.Matrix4().multiplyMatrices(at,child.matrixWorld),p,plant:true});
    }
    this.batch(parts);
  }
  update(state,window){
    this.state=state;this.window=window;if(this.disposed)return;
    const color=new T.Color();
    for(const {mesh,parts}of this.batches){let count=0;for(const part of parts){const p=part.p;if(window&&!pointInWorldRect(p,window))continue;
      const [axis,x,y]=p.edge?.split(':')||[],cells=p.edge?[`${x},${y}`,`${+x+(axis==='e'?1:0)},${+y+(axis==='s'?1:0)}`]:[key(p)];
      if(!cells.some(c=>state.seen.has(c)))continue;
      mesh.setMatrixAt(count,part.matrix);mesh.setColorAt(count++,color.setScalar(cells.some(c=>state.visible.has(c))?1:.4));
    }mesh.count=count;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;if(count)mesh.computeBoundingSphere();}
    for(const item of this.furniture)item.root.visible=(!window||pointInWorldRect(item.p,window))&&state.seen.has(key(item.p));
  }
  setFocus(state,camera,now){
    const units=state.units.filter(u=>u.team==='squad'||u.hp>0&&state.detected.has(u.id));
    this.cutaway.update(camera,units.map(u=>({id:u.id,position:[u.x,.8,u.y],level:0,radius:u.team==='squad'?1.5:1.1,known:true})),now);
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.root.removeFromParent();for(const {mesh}of this.batches)mesh.dispose();this.cutaway.dispose();this.library?.dispose();this.factory?.dispose();for(const m of [...this.materials,...Object.values(this.plantMaterials||{})])m.dispose();for(const g of Object.values(this.geometries))g.dispose();for(const t of this.textures)t.dispose();this.root.clear();}
}
