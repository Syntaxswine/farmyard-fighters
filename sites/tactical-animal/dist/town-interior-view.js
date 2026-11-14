import * as T from './aft/tactics/vendor/three.module.js';
import {createFurnitureLibrary} from './aft/tactics/painted-furniture.js';
import {PAINTED_ATLAS} from './aft/tactics/painted-environment-scene.js';
import {CARGO_ATLAS} from './aft/tactics/painted-cargo.js';
import {interiorWallBox} from './town-interiors.js';
import {FLOOR_SPACING,baseHeight,floorLevel,floorKey,stairBoxes,stairCoreContains,stairHeight} from './town-levels.js';
const origin=new URL('./aft/tactics/',import.meta.url),intersects=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
const colourFor=name=>/Kitchen|Bath|laundry/.test(name)?0xb6b4a0:/Hall|hall|aisle/.test(name)?0xb69d79:/Bedroom|Study|room \d/.test(name)?0xa58b6b:0xc8ad80;
// GPU resources stay inside the normal resident window. Detailed imported roofs
// remain available; the gameplay shell replaces their sealed exterior walls.
export class TownInteriorScenery{
 constructor(world,loader,materials){
  this.world=world;this.root=new T.Group();this.root.name='Fictional Mount Dora ground floors';this.resident=new Map();this.cube=new T.BoxGeometry(1,1,1);this.textures=[];this.materials=[];this.disposed=false;
  const material=(colour,map)=>{const m=new T.MeshStandardMaterial({color:colour,...(map?{map}:{}),roughness:.91});this.materials.push(m);return m;};
  this.wallMaterials={wood:material(0xd2c7ab,materials.get('wood')?.map),brick:material(0xc49c81,materials.get('brick')?.map),concrete:material(0xd1d0bd,materials.get('concrete')?.map)};
  this.floorMaterial=material(0xffffff,materials.get('wood')?.map);this.roofMaterial=material(0x646759,materials.get('floor')?.map);this.frameMaterial=material(0x6f5d47);this.railMaterial=material(0x747b71);this.shutterMaterial=material(0x526e60);
  const load=async url=>{const t=await loader.loadAsync(new URL(url,origin).href);if(this.disposed){t.dispose();return null;}t.colorSpace=T.SRGBColorSpace;this.textures.push(t);return t;};
  this.ready=Promise.all([load(PAINTED_ATLAS),load(CARGO_ATLAS)]).then(([atlas,cargo])=>{if(!this.disposed)this.library=createFurnitureLibrary(atlas,cargo);});
 }
 batch(boxes,material){
  const mesh=new T.InstancedMesh(this.cube,material,boxes.length),m=new T.Matrix4(),p=new T.Vector3(),q=new T.Quaternion(),scale=new T.Vector3();
  mesh.userData.boxes=boxes;boxes.forEach((b,i)=>{const z0=b.z0??0;m.compose(p.set((b.x0+b.x1)/2,(z0+b.height)/2,(b.y0+b.y1)/2),q,scale.set(b.x1-b.x0,b.height-z0,b.y1-b.y0));mesh.setMatrixAt(i,m);});mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();return mesh;
 }
 buildFloor(b,floor){
  const base=floor.level*FLOOR_SPACING,root=new T.Group();root.name=b.id+':floor:'+floor.level;
  const boxes=floor.walls.map(interiorWallBox),material=this.wallMaterials[b.material]||this.wallMaterials.wood,full=this.batch(boxes,material),cut=this.batch(boxes.filter(b=>(b.z0??0)<base+.62).map(b=>({...b,height:base+.62})),material),outer=this.batch(floor.walls.filter(w=>w.exterior).map(interiorWallBox),material);
  const floorBoxes=[],floorRooms=[],plot=b.stairs?.[0];
  for(const r of floor.rooms)for(const [y,x0,x1]of r.runs){let start=null;for(let x=x0;x<=x1;x++){const hole=x===x1||floor.level>0&&plot&&stairCoreContains(plot,{x,y});if(hole){if(start!==null){floorBoxes.push({x0:start-.5,y0:y-.5,x1:x-.5,y1:y+.5,z0:base+.003,height:base+.018});floorRooms.push(r);start=null;}}else if(start===null)start=x;}}
  const floors=this.batch(floorBoxes,this.floorMaterial);floors.castShadow=false;floors.userData.noShadow=true;floors.userData.floorSurface=true;floors.userData.level=floor.level;floors.userData.building=b.id;
  const frames=[],shutters=[];
  for(const w of floor.walls){if(!w.exterior||w.z0!==base)continue;const vertical=w.a[0]===w.b[0],length=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);for(let along=1.5;along<length-1;along+=3.5){const x=w.a[0]+(w.b[0]-w.a[0])*along/length,y=w.a[1]+(w.b[1]-w.a[1])*along/length,side=this.world.interiors.roomAt(x+(vertical?.25:0),y+(vertical?0:.25),floor.level)?-1:1,cx=x+(vertical?side*.11:0),cy=y+(vertical?0:side*.11);
   frames.push({x0:cx-(vertical?.035:.54),x1:cx+(vertical?.035:.54),y0:cy-(vertical?.54:.035),y1:cy+(vertical?.54:.035),z0:base+.65,height:base+1.51});const px=cx+(vertical?side*.04:0),py=cy+(vertical?0:side*.04);for(const sign of [-1,1])shutters.push({x0:px-(vertical?.025:.235)+(vertical?0:sign*.25),x1:px+(vertical?.025:.235)+(vertical?0:sign*.25),y0:py-(vertical?.235:.025)+(vertical?sign*.25:0),y1:py+(vertical?.235:.025)+(vertical?sign*.25:0),z0:base+.72,height:base+1.44});
  }}
  const trim=this.batch(frames,this.frameMaterial),panels=this.batch(shutters,this.shutterMaterial);root.add(full,cut,outer,floors,trim,panels);const furniture=[];
  for(const f of floor.furniture){const model=this.library.build(f.form,f.skin),o=model.root;o.position.set(f.x,base+.018,f.y);o.rotation.y=-f.rotation*Math.PI/2;root.add(o);furniture.push({root:o,room:f.room});}
  return {floor,root,full,cut,outer,floors,trim,panels,floorRooms,furniture,meshes:[full,cut,outer,floors,trim,panels],visibilityKey:null};
 }
 build(b){
  const root=new T.Group();root.name=b.id;const floors=b.floors.map(f=>this.buildFloor(b,f)),roofBoxes=[];
  for(const r of b.rooms)for(const [y,x0,x1]of r.runs)roofBoxes.push({x0:x0-.5,y0:y-.5,x1:x1-.5,y1:y+.5,z0:b.stories*FLOOR_SPACING-.12,height:b.stories*FLOOR_SPACING});
  const roofs=this.batch(roofBoxes,this.roofMaterial),stairs=[];root.add(roofs);for(const f of floors)root.add(f.root);
  for(const stair of b.stairs||[]){const group=new T.Group(),boxes=stairBoxes(stair),treads=this.batch(boxes.filter(b=>b.stairTread),this.wallMaterials.wood),rails=this.batch(boxes.filter(b=>!b.stairTread),this.railMaterial);treads.userData.stairId=stair.id;group.add(treads,rails);root.add(group);stairs.push({stair,root:group,treads,rails,clip:null});}
  this.root.add(root);return {b,root,levels:floors,stairs,roofs,full:floors[0].full,cut:floors[0].cut,floors:floors[0].floors,floorRooms:floors[0].floorRooms,furniture:floors.flatMap(f=>f.furniture),meshes:[roofs,...floors.flatMap(f=>f.meshes),...stairs.flatMap(s=>[s.treads,s.rails])]};
 }
 release(r){r.root.removeFromParent();for(const m of r.meshes)m.dispose();r.root.clear();}
 clipStair(record,top){
  if(record.clip!==null&&Math.abs(record.clip-top)<.025)return;record.clip=top;
  const matrix=new T.Matrix4(),position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3();
  for(const mesh of [record.treads,record.rails]){mesh.userData.boxes.forEach((b,i)=>{const height=Math.max(b.z0,Math.min(top,b.height));matrix.compose(position.set((b.x0+b.x1)/2,(b.z0+height)/2,(b.y0+b.y1)/2),rotation,scale.set(b.x1-b.x0,Math.max(0,height-b.z0),b.y1-b.y0));mesh.setMatrixAt(i,matrix);});mesh.instanceMatrix.needsUpdate=true;}
 }
 update(window){
  if(this.disposed||!this.library)return;
  const area=[window.x-.5,window.y-.5,window.x+window.w-.5,window.y+window.h-.5],wanted=new Set();
  for(const b of this.world.interiors.buildings.values())if(intersects(area,b.bounds)){wanted.add(b.id);if(!this.resident.has(b.id))this.resident.set(b.id,this.build(b));}
  for(const [id,r]of this.resident)if(!wanted.has(id)){this.release(r);this.resident.delete(id);}
 }
 focus(landmarks){
  const originals=new Map();for(const root of landmarks?.root.children||[])if(this.world.interiors.catalogue.has(root.name))originals.set(root.name,root);
  const unit=this.world.state?.units.find(u=>u.team==='squad'),level=floorLevel(unit),visible=this.world.interiors.visibleRooms;
  for(const [id,r]of this.resident){
   const inside=r.levels.some(f=>f.floor.rooms.some(room=>visible.has(floorKey(id,room.id,f.floor.level))));r.inside=inside;
   const original=originals.get(id);let sourceRoof=false;original?.traverse(o=>{if(!o.isMesh)return;const roof=o.userData.occlusionRole==='roof';o.visible=roof&&!inside;sourceRoof||=roof;});r.roofs.visible=!inside&&!sourceRoof;
   for(const f of r.levels){const active=inside&&f.floor.level===level,lower=inside&&f.floor.level<level;f.root.visible=!inside||f.floor.level<=level;f.full.visible=!inside;f.cut.visible=active;f.outer.visible=lower;f.trim.visible=f.panels.visible=!inside||lower;f.floors.visible=!inside||active;
    const seen=this.world.exploredFloors?.get(f.floor.level),flags=f.floor.rooms.map(room=>visible.has(floorKey(id,room.id,f.floor.level))?'v':seen?.has(room.runs[0][1]+','+room.runs[0][0])?'s':'?').join('');
    if(f.visibilityKey!==flags){f.visibilityKey=flags;const colour=new T.Color();f.floorRooms.forEach((room,i)=>{const known=visible.has(floorKey(id,room.id,f.floor.level)),remembered=seen?.has(room.runs[0][1]+','+room.runs[0][0]);colour.setHex(colourFor(room.name)).multiplyScalar(known?1:remembered?.5:.13);f.floors.setColorAt(i,colour);});if(f.floors.instanceColor)f.floors.instanceColor.needsUpdate=true;}
    for(const furniture of f.furniture)furniture.root.visible=active&&visible.has(floorKey(id,furniture.room,f.floor.level));
   }
   for(const stair of r.stairs){stair.root.visible=inside&&(unit?.stairId?stair.stair.id===unit.stairId:stair.stair.level>=level-1&&stair.stair.level<=level);if(stair.root.visible)this.clipStair(stair,baseHeight(unit)+1.6);}
  }
  for(const [id,root]of originals)if(!this.resident.has(id))root.traverse(o=>{if(o.isMesh)o.visible=o.userData.occlusionRole==='roof';});
 }
 get surfacePicks(){const meshes=[];for(const r of this.resident.values()){for(const f of r.levels)if(f.root.visible&&f.floors.visible&&(r.inside||f.floor.level===0))meshes.push(f.floors);for(const s of r.stairs)if(s.root.visible)meshes.push(s.treads);}return meshes;}
 pickSurface(ray){const hit=ray.intersectObjects(this.surfacePicks,false)[0];if(!hit)return null;const stair=this.world.interiors.stairs.get(hit.object.userData.stairId);if(stair){const p={x:hit.point.x,y:hit.point.z},elevation=stairHeight(stair,p);return {...hit,level:Math.round(elevation/FLOOR_SPACING),elevation,stairId:stair.id};}return {...hit,level:hit.object.userData.level,elevation:hit.object.userData.level*FLOOR_SPACING};}
 metrics(){return {buildings:this.resident.size,floors:[...this.resident.values()].reduce((n,r)=>n+r.levels.length,0),stairs:[...this.resident.values()].reduce((n,r)=>n+r.stairs.length,0),wallPanels:[...this.resident.values()].reduce((n,r)=>n+r.levels.reduce((v,f)=>v+f.full.count,0),0),furniture:[...this.resident.values()].reduce((n,r)=>n+r.furniture.length,0)};}
 dispose(){if(this.disposed)return;this.disposed=true;for(const r of this.resident.values())this.release(r);this.resident.clear();this.library?.dispose();for(const t of this.textures)t.dispose();for(const m of this.materials)m.dispose();this.cube.dispose();this.root.removeFromParent();}
}
