import * as T from './vendor/three.module.js';
import {createUtilityHelicopter,HELICOPTER_PAINT,HELICOPTER_GROUND} from './utility-helicopter.js';
import {createHelicopterSmoke,HELICOPTER_SMOKE} from './utility-helicopter-smoke.js';
import {createChairLibrary,CHAIR_PAINT} from './painted-chairs.js';
import {createGuardhouseMachineLibrary,GUARDHOUSE_MACHINE_PAINT} from './guardhouse-machines.js';
import {sceneryRule,isScenery,sceneryId,sceneryPoint,sceneryRotation,scenerySize} from './scenery-catalog.js';
import {createFactoryMachineLibrary} from './factory-machine-library.js';
import {createStoneArchLibrary} from './stone-arch-scene.js';
import {machinePaintPath} from './factory-machine-paint.js';
import {terrainKnown} from './battle-visibility.js';
import {DIMENSIONS} from './hybrid-world.js';

// One presentation owner for editor and gameplay. Smoke is residual exhaust:
// it neither ignites people nor creates a tactical smoke/grenade volume.
export class SceneryScene{
 constructor(scene,loader,onReady=()=>{},onError=()=>{},renderer=null){
  this.renderer=renderer;this.group=new T.Group();this.group.name='Placed scenery';scene.add(this.group);
  this.loader=loader;this.onReady=onReady;this.onError=onError;this.items=new Map();this.pending=new Map();this.loaded=new Map();this.textures=new Set();this.disposed=false;this.animated=false;
 }
 load(family){
  if(this.pending.has(family))return;
  if(family==='stone-arch'){this.loaded.set(family,{library:createStoneArchLibrary()});this.pending.set(family,Promise.resolve());this.onReady();return;}
  if(family.startsWith('machine-')){
   const form=family.slice(8),started=performance.now(),url=new URL(`./machine-${form}-10k-data.json`,import.meta.url);this.loader.manager?.itemStart(url.href);
   const promise=Promise.all([fetch(url).then(r=>{if(!r.ok)throw Error(`Machine mesh could not load (HTTP ${r.status})`);return r.json();}),this.loader.loadAsync(machinePaintPath(form)).then(texture=>{if(this.disposed)texture.dispose();else this.textures.add(texture);return texture;})]).then(([data,texture])=>{
    if(this.disposed)return;texture.colorSpace=T.SRGBColorSpace;const library=createFactoryMachineLibrary(this.renderer,data,texture);this.loaded.set(family,{library,preparedMs:performance.now()-started});this.preview(this.previewProp);this.onReady();
   }).catch(error=>{this.loader.manager?.itemError(url.href);if(!this.disposed)this.onError(error);}).finally(()=>this.loader.manager?.itemEnd(url.href));this.pending.set(family,promise);return;
  }
  const paths=family==='helicopter'?[HELICOPTER_PAINT,HELICOPTER_GROUND,HELICOPTER_SMOKE]:[family==='chair'?CHAIR_PAINT:GUARDHOUSE_MACHINE_PAINT];
  const promise=Promise.all(paths.map(async path=>{const texture=await this.loader.loadAsync(path);if(this.disposed){texture.dispose();return null;}texture.colorSpace=T.SRGBColorSpace;this.textures.add(texture);return texture;})).then(textures=>{
   if(this.disposed)return;const library=family==='chair'?createChairLibrary(textures[0]):family==='console'?createGuardhouseMachineLibrary(textures[0]):null;
   this.loaded.set(family,{textures,library});this.preview(this.previewProp);this.onReady();
  }).catch(error=>{if(!this.disposed)this.onError(error);});
  this.pending.set(family,promise);
 }
 remove(item){item.smoke?.dispose();item.model.dispose();item.root.removeFromParent();}
 preview(prop){
  this.previewProp=prop||null;
  if(!prop||this.previewItem?.kind!==prop.kind){if(this.previewItem)this.remove(this.previewItem);this.previewItem=null;}
  if(!prop||this.disposed)return;const rule=sceneryRule(prop);if(!rule)return;const family=rule.model==='machine'?prop.kind:rule.model,resources=this.loaded.get(family);if(!resources){this.load(family);return;}
  if(!this.previewItem){const model=rule.model==='helicopter'?createUtilityHelicopter(resources.textures[0],{state:rule.state,groundTexture:resources.textures[1]}):resources.library.build(rule.form,{finish:rule.finish,screen:rule.screen});this.previewItem={kind:prop.kind,model,root:model.root};this.group.add(model.root);}
  const {root}=this.previewItem,point=sceneryPoint(prop,rule.origin||[0,0],'render');root.position.set(point.x,point.h,point.y);root.rotation.y=-sceneryRotation(prop)*Math.PI/180;root.updateMatrixWorld(true);
 }
 rebuild(map,level=3){
  const keep=new Set();
  for(const prop of map.props||[]){
   const rule=sceneryRule(prop);if(!rule||(prop.z||0)>level)continue;
   const {w,h}=scenerySize(prop);let known=false;
   for(let y=0;y<h&&!known;y++)for(let x=0;x<w&&!known;x++){const k=prop.z?`${prop.x+x},${prop.y+y},${prop.z}`:`${prop.x+x},${prop.y+y}`;known=terrainKnown(map,k)&&!map.concealedInteriors?.has(k);}
   if(!known)continue;
   const family=rule.model==='machine'?prop.kind:rule.model,resources=this.loaded.get(family);if(!resources){this.load(family);continue;}
   const id=sceneryId(prop),key=prop.kind+':'+sceneryRotation(prop);keep.add(id);let item=this.items.get(id);
   if(item?.key!==key){
    if(item)this.remove(item);
    const model=rule.model==='helicopter'?createUtilityHelicopter(resources.textures[0],{state:rule.state,groundTexture:resources.textures[1]}):resources.library.build(rule.form,{finish:rule.finish,screen:rule.screen});
    const root=model.root,point=sceneryPoint(prop,rule.origin||[0,0],'render');root.position.set(point.x,(prop.z||0)*DIMENSIONS.floorSpacing,point.y);root.rotation.y=-sceneryRotation(prop)*Math.PI/180;root.userData.placedScenery={kind:prop.kind,gameplayIntegrated:true};root.updateMatrixWorld(true);this.group.add(root);
    const smoke=rule.smoke?createHelicopterSmoke(resources.textures[2],model):null;if(smoke)this.group.add(smoke.group);
    item={key,root,model,smoke};this.items.set(id,item);
   }
   item.prop=prop;
  }
  for(const [id,item]of this.items)if(!keep.has(id)){this.remove(item);this.items.delete(id);}
  this.animated=[...this.items.values()].some(item=>!!item.smoke);
 }
 update(seconds,camera,{reducedMotion=false}={}){for(const item of this.items.values())item.smoke?.update(reducedMotion?0:seconds,camera,item.root.visible);}
 stats(){return [...this.loaded].filter(([family])=>family.startsWith('machine-')).map(([family,r])=>({family,instances:[...this.items.values()].filter(i=>i.prop.kind===family).length,preparations:r.library.preparations,preparationMs:r.library.preparationMs,loadAndPreparationMs:r.preparedMs,triangles:r.library.triangleCount,geometryBytes:r.library.geometryBytes,estimatedTextureBytes:r.library.estimatedTextureBytes}));}
 hit(ray,level){let nearest=null;for(const item of this.items.values())if((item.prop.z||0)===level){const hit=ray.intersectObject(item.root,true)[0];if(hit&&(!nearest||hit.distance<nearest.distance))nearest={prop:item.prop,distance:hit.distance};}return nearest;}
 dispose(){if(this.disposed)return;this.preview(null);this.disposed=true;for(const item of this.items.values())this.remove(item);this.items.clear();for(const resources of this.loaded.values())resources.library?.dispose();this.loaded.clear();for(const t of this.textures)t.dispose();this.textures.clear();this.group.removeFromParent();this.group.clear();}
}
