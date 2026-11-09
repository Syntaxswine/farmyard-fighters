import * as T from './vendor/three.module.js';
import {createPaintedHedges,SCREEN_ATLAS,FRINGE_ATLAS} from './painted-hedges.js';
import {hedgeGroups} from './hedge-data.js';
import {HEDGE_CHUNK_SIZE as CHUNK} from './hedge-layout.js';
import {configureBiomeTexture} from './biome-foliage-paint.js';
import {FoliageCutaway} from './foliage-cutaway.js';

// Persistent spatial batches, shared textures, and fragment fog. Camera motion,
// selection, turns and visibility updates never rebuild hedge geometry.
export class HedgeScene{
 constructor(scene,loader,onReady=()=>{},onError=()=>{}){
  this.root=new T.Group();this.root.name='Joined hedges';scene.add(this.root);this.loader=loader;this.onReady=onReady;this.onError=onError;
  this.items=new Map();this.layers=new Map();this.textures={};this.cutaway=new FoliageCutaway();this.builds=0;
 }
 load(){
  if(this.loading)return;
  this.loading=Promise.all(Object.entries({screen:SCREEN_ATLAS,fringe:FRINGE_ATLAS}).map(async([key,url])=>{const t=await this.loader.loadAsync(url);if(this.disposed)t.dispose();else this.textures[key]=configureBiomeTexture(t);})).then(()=>{if(!this.disposed){this.ready=true;this.onReady();}}).catch(e=>{if(!this.disposed)this.onError(Error('Hedge paint: '+e.message));});
 }
 layer(level,size){
  if(!this.layers.has(level)){const data=new Uint8Array(size*size),texture=new T.DataTexture(data,size,size,T.RedFormat);texture.unpackAlignment=1;texture.needsUpdate=true;this.layers.set(level,{texture,size,dim:{value:1}});}
  return this.layers.get(level);
 }
 decorate(material,level,size){
  const layer=this.layer(level,size),compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.customProgramCacheKey=()=>key+'-hedge-fog-'+level;
  material.onBeforeCompile=(s,r)=>{
   compile.call(material,s,r);s.uniforms.hedgeKnown={value:layer.texture};s.uniforms.hedgeDim=layer.dim;
   s.vertexShader='varying vec2 hedgeGround;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nhedgeGround=(modelMatrix*vec4(position,1.)).xz;');
   s.fragmentShader='varying vec2 hedgeGround;uniform sampler2D hedgeKnown;uniform float hedgeDim;\n'+s.fragmentShader;
   s.fragmentShader=s.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    if(any(lessThan(hedgeGround,vec2(-.5)))||any(greaterThan(hedgeGround,vec2(${size-.5})))||texture2D(hedgeKnown,(floor(hedgeGround+.5)+.5)/${size.toFixed(1)}).r<.5)discard;
   `).replace('#include <opaque_fragment>','outgoingLight*=hedgeDim;\n#include <opaque_fragment>');
  };
  return this.cutaway.decorate(material,level,material.userData.hedgeWood===true);
 }
 remove(item){
  for(const m of item.model.root.children){const key=m.material.uuid+':'+item.level,shadow=this.cutaway.depthMaterials.get(key);if(shadow){shadow.depth.dispose();shadow.distance.dispose();this.cutaway.depthMaterials.delete(key);}}
  item.model.dispose();
 }
 rebuild(map,seen,level=3,{editor=false,selectedLevel=level,dim=false}={}){
  if(this.disposed)return;
  this.level=level;const groups=hedgeGroups(map),size=(map.terrain||map.map)?.length||240,keep=new Set();
  if(groups.length&&!this.ready)this.load();
  if(this.size!==size){for(const item of this.items.values())this.remove(item);this.items.clear();for(const l of this.layers.values())l.texture.dispose();this.layers.clear();this.size=size;}
  if(this.ready)for(const group of groups){
   const z=group.level,layer=this.layer(z,size),data=layer.texture.image.data;data.fill(0);
   const known=c=>{const key=z?`${c.x},${c.z},${z}`:`${c.x},${c.z}`;return editor||(!seen||seen.has(key))&&!map.concealedInteriors?.has(key);};
   for(const c of group.cells)if(known(c))data[c.z*size+c.x]=255;
   layer.texture.needsUpdate=true;layer.dim.value=dim&&z<selectedLevel?.38:1;
   const chunks=new Map();for(const c of group.cells){const k=`${Math.floor(c.x/CHUNK)},${Math.floor(c.z/CHUNK)}`;if(!chunks.has(k))chunks.set(k,[]);chunks.get(k).push(c);}
   for(const [chunk,cells]of chunks){
    const [cx,cy]=chunk.split(',').map(Number),halo=group.cells.filter(c=>c.x>=cx*CHUNK-2&&c.x<(cx+1)*CHUNK+2&&c.z>=cy*CHUNK-2&&c.z<(cy+1)*CHUNK+2),signature=JSON.stringify(halo),id=z+':'+chunk;keep.add(id);let item=this.items.get(id);
    if(item?.signature!==signature){
     if(item)this.remove(item);
     const model=createPaintedHedges(halo,this.textures,{chunk});const materials=new Set();
     for(const m of model.root.children){if(!materials.has(m.material)){m.material.userData.hedgeWood=m.userData.layer==='wood';this.decorate(m.material,z,size);materials.add(m.material);}this.cutaway.attachShadow(m,z);}
     this.root.add(model.root);item={model,signature,level:z,center:new T.Vector3(cells.reduce((s,c)=>s+c.x,0)/cells.length,0,cells.reduce((s,c)=>s+c.z,0)/cells.length)};this.items.set(id,item);this.builds++;
    }
    item.known=cells.some(known);item.shadowKnown=cells.every(known);item.model.root.visible=z<=level&&item.known;
   }
  }
  for(const [id,item]of this.items)if(!keep.has(id)){this.remove(item);this.items.delete(id);}
 }
 update(camera,focus,ppu,targets=[]){
  this.cutaway.update(camera,targets);
  for(const item of this.items.values()){
   item.model.root.visible=item.level<=this.level&&item.known;item.model.setDetail(ppu>=9);
   const shadow=item.model.root.visible&&item.shadowKnown&&ppu>12&&item.center.distanceTo(focus)<28;
   for(const m of item.model.root.children){m.castShadow=shadow&&m.userData.layer!=='leaves';m.userData.noShadow=!m.castShadow;}
  }
 }
 stats(){return {ready:!!this.ready,chunks:this.items.size,builds:this.builds,meshes:[...this.items.values()].reduce((n,i)=>n+i.model.root.children.length,0)};}
 dispose(){if(this.disposed)return;this.disposed=true;for(const item of this.items.values())this.remove(item);this.items.clear();this.cutaway.dispose();for(const l of this.layers.values())l.texture.dispose();this.layers.clear();for(const t of Object.values(this.textures))t.dispose();this.root.removeFromParent();}
}
