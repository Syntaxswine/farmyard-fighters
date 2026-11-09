import * as T from './vendor/three.module.js';
import {DIMENSIONS as D} from './hybrid-world.js';
import {interiorCells,concealedInteriorCells,knownInteriorRooms} from './interior-fog.js';

export class InteriorFogScene {
 constructor(scene,wallXray=null){
  this.scene=scene;this.wallXray=wallXray;this.hidden=new Set();this.shown=new Set();this.cells=[];this.meshes=new Map();
  this.geometry=new T.BoxGeometry(1,D.wall-.04,1);
  this.material=new T.MeshBasicMaterial({color:0x000000,toneMapped:false});
 }
 update(state,world){
  if(this.world!==world){this.world=world;this.cells=interiorCells(state);}
  const hidden=concealedInteriorCells(this.cells,state),known=knownInteriorRooms(this.cells,state),cells=hidden.filter(p=>known.has(p.room));
  if(hidden.length===this.hidden.size&&hidden.every(p=>this.hidden.has(p.key))&&cells.length===this.shown.size&&cells.every(p=>this.shown.has(p.key)))return;
  this.hidden.clear();for(const p of hidden)this.hidden.add(p.key);
  this.shown.clear();for(const p of cells)this.shown.add(p.key);
  this.clear();
  // Each floor retains its own black mask. Only masks strictly above the
  // selected floor are cut away; its undiscovered rooms remain opaque.
  for(const z of new Set(cells.map(p=>p.z))){
   const layer=cells.filter(p=>p.z===z),material=z>0&&this.wallXray?this.wallXray.material(this.material,z-1):this.material;
   const mesh=new T.InstancedMesh(this.geometry,material,layer.length),matrix=new T.Matrix4();
   layer.forEach((p,i)=>{matrix.makeTranslation(p.x,z*D.floorSpacing+(D.wall-.04)/2,p.y);mesh.setMatrixAt(i,matrix);});
   mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.name='unexplored-room-interiors';
   mesh.userData.noShadow=true;mesh.raycast=()=>{};this.scene.add(mesh);this.meshes.set(z,mesh);
  }
 }
 clear(){for(const mesh of this.meshes.values()){mesh.removeFromParent();mesh.dispose();}this.meshes.clear();}
 dispose(){this.clear();this.geometry.dispose();this.material.dispose();this.hidden.clear();this.shown.clear();this.cells=[];this.world=null;}
}
