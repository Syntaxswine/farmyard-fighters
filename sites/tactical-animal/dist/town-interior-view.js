import * as T from './aft/tactics/vendor/three.module.js';
import {createFurnitureLibrary} from './aft/tactics/painted-furniture.js';
import {PAINTED_ATLAS} from './aft/tactics/painted-environment-scene.js';
import {CARGO_ATLAS} from './aft/tactics/painted-cargo.js';
import {interiorWallBox} from './town-interiors.js';
const origin=new URL('./aft/tactics/',import.meta.url),intersects=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
const colourFor=name=>/Kitchen|Bath|laundry/.test(name)?0xb6b4a0:/Hall|hall|aisle/.test(name)?0xb69d79:/Bedroom|Study|room \d/.test(name)?0xa58b6b:0xc8ad80;
// GPU resources stay inside the normal resident window. Detailed imported roofs
// remain available; the gameplay shell replaces their sealed exterior walls.
export class TownInteriorScenery{
 constructor(world,loader,materials){
  this.world=world;this.root=new T.Group();this.root.name='Fictional Mount Dora ground floors';this.resident=new Map();this.cube=new T.BoxGeometry(1,1,1);this.textures=[];this.materials=[];this.disposed=false;
  const material=(colour,map)=>{const m=new T.MeshStandardMaterial({color:colour,...(map?{map}:{}),roughness:.91});this.materials.push(m);return m;};
  this.wallMaterials={wood:material(0xd2c7ab,materials.get('wood')?.map),brick:material(0xc49c81,materials.get('brick')?.map),concrete:material(0xd1d0bd,materials.get('concrete')?.map)};
  this.floorMaterial=material(0xffffff,materials.get('wood')?.map);this.roofMaterial=material(0x646759,materials.get('floor')?.map);this.frameMaterial=material(0x6f5d47);this.shutterMaterial=material(0x526e60);
  const load=async url=>{const t=await loader.loadAsync(new URL(url,origin).href);if(this.disposed){t.dispose();return null;}t.colorSpace=T.SRGBColorSpace;this.textures.push(t);return t;};
  this.ready=Promise.all([load(PAINTED_ATLAS),load(CARGO_ATLAS)]).then(([atlas,cargo])=>{if(!this.disposed)this.library=createFurnitureLibrary(atlas,cargo);});
 }
 batch(boxes,material){
  const mesh=new T.InstancedMesh(this.cube,material,boxes.length),m=new T.Matrix4(),p=new T.Vector3(),q=new T.Quaternion(),scale=new T.Vector3();
  boxes.forEach((b,i)=>{const z0=b.z0??0;m.compose(p.set((b.x0+b.x1)/2,(z0+b.height)/2,(b.y0+b.y1)/2),q,scale.set(b.x1-b.x0,b.height-z0,b.y1-b.y0));mesh.setMatrixAt(i,m);});mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();return mesh;
 }
 build(b){
  const root=new T.Group();root.name=b.id;const boxes=b.walls.map(interiorWallBox),material=this.wallMaterials[b.material]||this.wallMaterials.wood,full=this.batch(boxes,material),cut=this.batch(boxes.filter(b=>(b.z0??0)<.62).map(b=>({...b,height:.62})),material);
  const floorBoxes=[],floorRooms=[];for(const r of b.rooms)for(const [y,x0,x1]of r.runs){floorBoxes.push({x0:x0-.5,y0:y-.5,x1:x1-.5,y1:y+.5,z0:.003,height:.018});floorRooms.push(r);}
  const floors=this.batch(floorBoxes,this.floorMaterial),roofs=this.batch(floorBoxes.map(bx=>({...bx,z0:b.stories*2.12-.12,height:b.stories*2.12})),this.roofMaterial);floors.castShadow=false;floors.userData.noShadow=true;
  // Closed shutters keep the simplified houses readable as homes. They sit on
  // solid walls, never over a doorway, and make no promise of an open window.
  const frames=[],shutters=[];
  for(const w of b.walls){if(!w.exterior||w.z0!==0)continue;const vertical=w.a[0]===w.b[0],length=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);for(let along=1.5;along<length-1;along+=3.5){const x=w.a[0]+(w.b[0]-w.a[0])*along/length,y=w.a[1]+(w.b[1]-w.a[1])*along/length,side=this.world.interiors.roomAt(x+(vertical?.25:0),y+(vertical?0:.25))?-1:1,cx=x+(vertical?side*.11:0),cy=y+(vertical?0:side*.11);
   for(let level=0;level<b.stories;level++){const z=level*2.12;frames.push({x0:cx-(vertical?.035:.54),x1:cx+(vertical?.035:.54),y0:cy-(vertical?.54:.035),y1:cy+(vertical?.54:.035),z0:z+.65,height:z+1.51});const px=cx+(vertical?side*.04:0),py=cy+(vertical?0:side*.04);for(const sign of [-1,1])shutters.push({x0:px-(vertical?.025:.235)+(vertical?0:sign*.25),x1:px+(vertical?.025:.235)+(vertical?0:sign*.25),y0:py-(vertical?.235:.025)+(vertical?sign*.25:0),y1:py+(vertical?.235:.025)+(vertical?sign*.25:0),z0:z+.72,height:z+1.44});}
  }}
  const trim=this.batch(frames,this.frameMaterial),panels=this.batch(shutters,this.shutterMaterial);root.add(full,cut,floors,roofs,trim,panels);const furniture=[];
  for(const f of b.furniture){const model=this.library.build(f.form,f.skin),o=model.root;o.position.set(f.x,.018,f.y);o.rotation.y=-f.rotation*Math.PI/2;root.add(o);furniture.push({root:o,room:f.room});}
  this.root.add(root);return {b,root,full,cut,floors,roofs,trim,panels,floorRooms,furniture,meshes:[full,cut,floors,roofs,trim,panels],visibilityKey:null};
 }
 release(r){r.root.removeFromParent();for(const m of r.meshes)m.dispose();r.root.clear();}
 update(window){
  if(this.disposed||!this.library)return;
  const area=[window.x-.5,window.y-.5,window.x+window.w-.5,window.y+window.h-.5],wanted=new Set();
  for(const b of this.world.interiors.buildings.values())if(intersects(area,b.bounds)){wanted.add(b.id);if(!this.resident.has(b.id))this.resident.set(b.id,this.build(b));}
  for(const [id,r]of this.resident)if(!wanted.has(id)){this.release(r);this.resident.delete(id);}
 }
 focus(landmarks){
  const originals=new Map();for(const root of landmarks?.root.children||[])if(this.world.interiors.catalogue.has(root.name))originals.set(root.name,root);
  for(const [id,r]of this.resident){
   const visible=this.world.interiors.visibleRooms,inside=r.b.rooms.some(room=>visible.has(id+':'+room.id));r.full.visible=r.trim.visible=r.panels.visible=!inside;r.cut.visible=inside;
   const original=originals.get(id);let sourceRoof=false;
   original?.traverse(o=>{if(!o.isMesh)return;const roof=o.userData.occlusionRole==='roof';o.visible=roof&&!inside;sourceRoof||=roof;});
   r.roofs.visible=!inside&&!sourceRoof;
   const flags=r.b.rooms.map(room=>visible.has(id+':'+room.id)?'v':this.world.state?.seen.has(room.runs[0][1]+','+room.runs[0][0])?'s':'?').join('');
   if(r.visibilityKey!==flags){r.visibilityKey=flags;const colour=new T.Color();r.floorRooms.forEach((room,i)=>{const known=visible.has(id+':'+room.id),seen=this.world.state?.seen.has(room.runs[0][1]+','+room.runs[0][0]);colour.setHex(colourFor(room.name)).multiplyScalar(known?1:seen?.5:.13);r.floors.setColorAt(i,colour);});if(r.floors.instanceColor)r.floors.instanceColor.needsUpdate=true;}
   for(const f of r.furniture)f.root.visible=visible.has(id+':'+f.room);
  }
  // Source residents can extend beyond the window; they must never leave a
  // sealed duplicate shell behind the operational gameplay entrances.
  for(const [id,root]of originals)if(!this.resident.has(id))root.traverse(o=>{if(o.isMesh)o.visible=o.userData.occlusionRole==='roof';});
 }
 metrics(){return {buildings:this.resident.size,wallPanels:[...this.resident.values()].reduce((n,r)=>n+r.full.count,0),furniture:[...this.resident.values()].reduce((n,r)=>n+r.furniture.length,0)};}
 dispose(){if(this.disposed)return;this.disposed=true;for(const r of this.resident.values())this.release(r);this.resident.clear();this.library?.dispose();for(const t of this.textures)t.dispose();for(const m of this.materials)m.dispose();this.cube.dispose();this.root.removeFromParent();}
}
