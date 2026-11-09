import * as T from './vendor/three.module.js';
import {createCargoLibrary,CARGO_ATLAS} from './painted-cargo.js';
import {PAINTED_ATLAS} from './painted-environment-scene.js';
import {toWorld} from './hybrid-world.js';
import {cliffSupportAt} from './cliff-support.js';
import {rampSupportAt} from './cliff-ramps.js';
import {terrainKnown} from './battle-visibility.js';
import {EXPLOSIVE_BARREL,isExplosiveBarrel} from './explosive-barrels.js';

// Preserve the saved one-tile footprints. Larger gallery arrangements require
// separately authored map placements; they must not overhang movement lanes.
export const PAINTED_PROP_FORMS=Object.freeze({'crate-wood':'crate-square','wooden-crate-closed':'crate-square','crate-stack':'crate-stack','barrel-single':'barrel-single','barrels-cluster':'barrel-single',[EXPLOSIVE_BARREL]:'barrel-single'});
export function cargoFinish(p){
 if(isExplosiveBarrel(p))return {skin:'explosiveRed',label:'flammable',id:p.form+':explosiveRed:flammable'};
 const skins=p.form.startsWith('barrel')?['blue','oxide','ochre','creamSteel']:['timber','weathered','creamWood','oliveWood'],skin=skins[((p.x*17+p.y*31+(p.z||0)*7)>>>0)%skins.length];
 return {skin,label:'none',id:p.form+':'+skin};
}
export function cargoPlacements(map){
 const entries=map.props.filter(p=>PAINTED_PROP_FORMS[p.kind]).map(p=>({...p,form:PAINTED_PROP_FORMS[p.kind],...(isExplosiveBarrel(p)?{cliffSupport:rampSupportAt(map,p)||cliffSupportAt(map,p)}:{})}));
 const occupied=new Set(entries.map(p=>`${p.x},${p.y},${p.z||0}`));
 const add=(x,y,z,t)=>{if(t==='crate'&&!occupied.has(`${x},${y},${z}`))entries.push({x,y,z,form:'crate-square'});};
 (map.map||map.terrain).forEach((row,y)=>row.forEach((t,x)=>add(x,y,0,t)));
 (map.upper||[]).forEach((layer,i)=>{for(const [key,t]of Object.entries(layer)){const [x,y]=key.split(',').map(Number);add(x,y,i+1,t);}});
 return entries;
}
export class BattleEnvironment {
 constructor(scene,loader,onReady,onError){
  this.scene=scene;this.group=new T.Group();scene.add(this.group);this.prototypes=new Map();this.disposed=false;this.count=0;
  this.ready=Promise.all([loader.loadAsync(PAINTED_ATLAS),loader.loadAsync(CARGO_ATLAS)]).then(textures=>{
   if(this.disposed){textures.forEach(t=>t.dispose());return;}
   this.textures=textures;for(const t of textures)t.colorSpace=T.SRGBColorSpace;
   this.library=createCargoLibrary(...textures);onReady();
  }).catch(error=>{if(!this.disposed)onError(error);});
 }
 rebuild(map,level){
  if(!this.library)return;
  const entries=cargoPlacements(map).filter(p=>{const z=p.z||0;return z<=level&&terrainKnown(map,z?`${p.x},${p.y},${z}`:`${p.x},${p.y}`);});
  const signature=JSON.stringify(entries);if(signature===this.signature)return;this.signature=signature;
  this.clear();const groups=new Map(),rotation=new T.Quaternion(),translation=new T.Vector3(),scale=new T.Vector3(1,1,1),matrix=new T.Matrix4();
  this.count=0;
  for(const p of entries){
   const z=p.z||0,key=z?`${p.x},${p.y},${z}`:`${p.x},${p.y}`;
   if(z>level||!terrainKnown(map,key))continue;
   const {skin,label,id}=cargoFinish(p);
   if(!this.prototypes.has(id))this.prototypes.set(id,this.library.build(p.form,skin,label));
   const prototype=this.prototypes.get(id);rotation.setFromAxisAngle(new T.Vector3(0,1,0),p.rotated?-Math.PI/2:0);translation.fromArray(toWorld(p));matrix.compose(translation,rotation,scale);
   prototype.root.traverse(part=>{
    if(!part.isMesh)return;
    const key=`${Math.floor(p.x/16)},${Math.floor(p.y/16)}:${part.geometry.uuid}:${part.material.uuid}`;
    if(!groups.has(key))groups.set(key,{geometry:part.geometry,material:part.material,matrices:[],placements:[]});
    groups.get(key).matrices.push(new T.Matrix4().multiplyMatrices(matrix,part.matrixWorld));
    groups.get(key).placements.push(p);
   });this.count++;
  }
  for(const {geometry,material,matrices,placements}of groups.values()){
   const mesh=new T.InstancedMesh(geometry,material,matrices.length);matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();this.group.add(mesh);
   mesh.userData.placements=placements;
  }
 }
 barrelHit(ray,level){
  for(const hit of ray.intersectObject(this.group,true)){const p=hit.object.userData.placements?.[hit.instanceId];if(p&&(p.z||0)===level)return isExplosiveBarrel(p)?{prop:p,distance:hit.distance}:null;}return null;
 }
 pickBarrel(ray,level){return this.barrelHit(ray,level)?.prop||null;}
 clear(){for(const mesh of this.group.children)mesh.dispose();this.group.clear();}
 dispose(){this.disposed=true;this.clear();this.group.removeFromParent();this.library?.dispose();this.textures?.forEach(t=>t.dispose());this.prototypes.clear();}
}
