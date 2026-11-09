import * as T from './vendor/three.module.js';
import {STRATEGIC_SITE_ATLAS,createStrategicSiteLibrary} from './strategic-sites.js';
import {siteRule,siteId,isStrategicSite,intactSite} from './strategic-site-rules.js';
import {terrainKnown} from './battle-visibility.js';
import {DIMENSIONS} from './hybrid-world.js';

// Both editor and game use the reviewed roots at their authored tile scale.
export class StrategicSiteScene {
 constructor(scene,loader,onReady=()=>{},onError=()=>{}){
  this.group=new T.Group();scene.add(this.group);this.loader=loader;this.onReady=onReady;this.onError=onError;this.items=new Map();this.disposed=false;
 }
 load(){
  if(this.ready)return;
  this.ready=this.loader.loadAsync(STRATEGIC_SITE_ATLAS).then(texture=>{
   if(this.disposed){texture.dispose();return;}
   texture.colorSpace=T.SRGBColorSpace;this.texture=texture;this.library=createStrategicSiteLibrary(texture);this.onReady();
  }).catch(error=>{if(!this.disposed)this.onError(error);});
 }
 rebuild(map,level=3){
  const props=(map.props||[]).filter(isStrategicSite);
  if(props.length&&!this.library)this.load();
  if(!this.library)return;
  const keep=new Set();
  for(const p of props){
   if((p.z||0)>level)continue;
   let known=false;for(let y=0;y<8&&!known;y++)for(let x=0;x<8&&!known;x++){const k=(p.z?`${p.x+x},${p.y+y},${p.z}`:`${p.x+x},${p.y+y}`);known=terrainKnown(map,k);}
   if(!known)continue;
   const id=siteId(p),rule=siteRule(p),key=p.kind+':'+!!p.rotated;keep.add(id);let item=this.items.get(id);
   if(item?.key!==key){item?.root.removeFromParent();const {root}=this.library.build(rule.strategicSite,{state:rule.state});root.position.set(p.x+3.5,(p.z||0)*DIMENSIONS.floorSpacing,p.y+3.5);root.rotation.y=p.rotated?-Math.PI/2:0;root.updateMatrixWorld(true);this.group.add(root);item={root,key};this.items.set(id,item);}
   item.prop=p;
  }
  for(const [id,item]of this.items)if(!keep.has(id)){item.root.removeFromParent();this.items.delete(id);}
 }
 hit(ray,level,{intact=false}={}){
  let nearest=null;
  for(const item of this.items.values())if((item.prop.z||0)===level&&(!intact||intactSite(item.prop))){const hit=ray.intersectObject(item.root,true)[0];if(hit&&(!nearest||hit.distance<nearest.distance))nearest={prop:item.prop,distance:hit.distance};}
  return nearest;
 }
 dispose(){this.disposed=true;this.group.removeFromParent();this.group.clear();this.items.clear();this.library?.dispose();this.texture?.dispose();}
}
