import * as T from './aft/tactics/vendor/three.module.js';
import {PROP_ART} from './aft/tactics/prop-art.js';
import {doorFootprint} from './interactions.js';
import {missionForState} from './missions.js';
import {clueAnchorHeight} from './mission-scenery.js';
import {blockWindow,pointInWorldRect} from './world-grid.js';

// Reuse the parent game's chest paintings and timber surface. The simulation
// supplies the authoritative positions, open state, and physical footprints.
export class InteractionScenery {
  constructor(state,{onLoading=()=>{},onError=()=>{},loader}={}){
    this.root=new T.Group();this.records=new Map();this.resources=[];this.disposed=false;
    const manager=new T.LoadingManager();manager.onStart=()=>{if(!this.disposed)onLoading(true);};manager.onLoad=()=>{if(!this.disposed)onLoading(false);};manager.onError=url=>{if(!this.disposed)onError('Interaction artwork could not load: '+url.split('/').at(-1));};
    loader ||= new T.TextureLoader(manager);const origin=new URL('./aft/assets/environment/',import.meta.url);
    const painted=name=>{
      const art=PROP_ART[name],texture=loader.load(new URL(art.file,origin).href,texture=>{
        const [x0,y0,x1,y1]=art.crop,w=texture.image.width,h=texture.image.height;
        texture.offset.set(x0/w,(h-y1)/h);texture.repeat.set((x1-x0)/w,(y1-y0)/h);texture.needsUpdate=true;
      });texture.colorSpace=T.SRGBColorSpace;this.resources.push(texture);return texture;
    };
    this.chestPaint={closed:painted('supply-chest-closed'),open:painted('supply-chest-open')};
    const wood=loader.load(new URL('hybrid-surfaces/wood-factory-v2.png',origin).href);wood.colorSpace=T.SRGBColorSpace;this.resources.push(wood);
    this.assets={wood,cube:new T.BoxGeometry(1,1,1),clue:new T.OctahedronGeometry(.18)};this.resources.push(this.assets.cube,this.assets.clue);
    this.update(state);
  }
  create(object){
      if(object.kind==='chest'){
        const material=new T.SpriteMaterial({map:this.chestPaint.closed,alphaTest:.05,depthWrite:false}),sprite=new T.Sprite(material);
        sprite.center.set(.5,0);sprite.userData.interactionId=object.id;this.root.add(sprite);this.records.set(object.id,{sprite});
      }else if(object.kind==='door'){
        const material=new T.MeshStandardMaterial({map:this.assets.wood,color:0xb5ad86,roughness:.9}),leaf=new T.Mesh(this.assets.cube,material);
        leaf.userData.interactionId=object.id;leaf.castShadow=leaf.receiveShadow=true;this.root.add(leaf);this.records.set(object.id,{leaf});
      }else if(object.kind==='clue'){
        const material=new T.MeshStandardMaterial({color:0xe0c17b,roughness:.85}),marker=new T.Mesh(this.assets.clue,material);
        marker.userData.interactionId=object.id;this.root.add(marker);this.records.set(object.id,{marker});
      }
  }
  release(id){const record=this.records.get(id),mesh=record.sprite||record.leaf||record.marker;mesh.removeFromParent();mesh.material.dispose();this.records.delete(id);}
  update(state,window=blockWindow(state,state.units?.find(unit=>unit.team==='squad')||{x:0,y:0})){
    if(this.disposed)return;
    if(this.assets){
      const resident=state.interactables.filter(object=>pointInWorldRect(object,window)),ids=new Set(resident.map(object=>object.id));
      for(const id of this.records.keys())if(!ids.has(id))this.release(id);
      for(const object of resident)if(!this.records.has(object.id))this.create(object);
      this.window=window;
    }
    for(const object of state.interactables){
      const record=this.records.get(object.id);if(!record)continue;
      const cells=object.kind==='door'?[`${Math.floor(object.x)},${Math.floor(object.y)}`,`${Math.ceil(object.x)},${Math.ceil(object.y)}`]:[`${Math.round(object.x)},${Math.round(object.y)}`];
      const known=cells.some(cell=>state.seen.has(cell)),visible=cells.some(cell=>state.visible.has(cell));
      if(record.sprite){
        record.sprite.visible=known;record.sprite.position.set(object.x,.015,object.y);record.sprite.scale.set(1.15,object.open?1.1:.9,1);
        record.sprite.material.map=object.open?this.chestPaint.open:this.chestPaint.closed;record.sprite.material.color.setScalar(visible?1:.38);
      }else if(record.leaf){
        const box=doorFootprint(object);record.leaf.visible=known;record.leaf.position.set((box.x0+box.x1)/2,box.height/2,(box.y0+box.y1)/2);record.leaf.scale.set(box.x1-box.x0,box.height,box.y1-box.y0);
      }else{
        record.marker.visible=known;record.marker.position.set(object.x,clueAnchorHeight(missionForState(state),object,.8),object.y);record.marker.material.color.setHex(state.solo.inspected?.includes(object.id)?0xaab68a:0xe0c17b);record.marker.material.color.multiplyScalar(visible?1:.38);
      }
    }
  }
  get picks(){return [...this.records.values()].map(record=>record.sprite||record.leaf||record.marker).filter(mesh=>mesh.visible);}
  dispose(){if(this.disposed)return;this.disposed=true;for(const id of this.records.keys())this.release(id);this.root.removeFromParent();for(const resource of this.resources)resource.dispose();this.root.clear();}
}
