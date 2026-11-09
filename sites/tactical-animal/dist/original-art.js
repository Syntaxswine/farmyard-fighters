import * as T from './aft/tactics/vendor/three.module.js';
import {PAINTED_PROP_FORMS,cargoFinish} from './aft/tactics/battle-environment.js';
import {createCargoLibrary,CARGO_ATLAS} from './aft/tactics/painted-cargo.js';
import {PAINTED_ATLAS} from './aft/tactics/painted-environment-scene.js';
import {WALL_DIMENSIONS} from './world-dimensions.js';
import {blockForPoint,blockWindow,worldBounds} from './world-grid.js';
import {windowChanges} from './render-residency.js';
import {windowSystem} from './window-catalogue.js';
import {legacyWallSpan} from './window-system.js';
export {weaponArtwork} from './weapon-artwork.js';

const origin=new URL('./aft/tactics/',import.meta.url);
const key=(x,y)=>`${Math.round(x)},${Math.round(y)}`;
const surfaces={
  brick:{file:'hybrid-surfaces/brick-factory-v1.png',period:2,tint:0xd7c4ad},
  concrete:{file:'ground-concrete.png',period:2,tint:0xd4cfbe},
  gravel:{file:'ground-gravel.png',period:2,tint:0xd4cfbe},
  grass:{file:'ground-grass.png',period:1.5,tint:0xd4cfbe},
  asphalt:{file:'ground-asphalt.png',period:2,tint:0xd4cfbe},
};

export function groundSurface(state,x,y){
  const tile=state.map[y][x];
  if(tile==='floor'||tile==='ground-concrete')return 'concrete';
  if(tile==='ground-asphalt')return 'asphalt';
  if(tile==='ground-grass')return 'grass';
  if(tile==='ground-gravel')return 'gravel';
  if(state.groundPalette==='aft-sector')return 'grass';
  return x<3||x>36||y<3||y>26?'grass':'gravel';
}
export function wallKnown(state,wall){
  return state.seen.has(key(wall.x,wall.y))||state.seen.has(key(wall.x+(wall.axis==='e'?1:0),wall.y+(wall.axis==='s'?1:0)));
}
export function foregroundWall(wall,unit){
  if(!unit)return false;
  const dx=wall.x+(wall.axis==='e'?.5:0)-unit.x,dy=wall.y+(wall.axis==='s'?.5:0)-unit.y,depth=dx*.64+dy*.77;
  return depth>0&&depth<4.5&&Math.abs(dx*.77-dy*.64)<2;
}

// Chunk meshes own instance buffers. Painted textures, cargo prototypes,
// materials and geometry belong to the environment for the whole operation.
export class OriginalEnvironment {
  constructor(renderer,state,{onLoading=()=>{},onError=()=>{},loader}={}){
    this.root=new T.Group();this.root.name='Animal Factory Tactics original art';
    Object.assign(this,{state,disposed:false,materials:[],textures:[],chunks:new Map(),index:new Map(),prototypes:new Map(),materialCache:new Map(),texturesByKind:{},stats:{created:0,disposed:0},replaced:new Set()});
    const manager=new T.LoadingManager();
    manager.onStart=()=>{if(!this.disposed)onLoading(true);};
    manager.onLoad=()=>{if(!this.disposed)onLoading(false);};
    manager.onError=url=>{if(!this.disposed)onError('Original artwork could not load: '+url.split('/').at(-1));};
    this.loader=loader||new T.TextureLoader(manager).setPath(origin.href);
    this.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    this.cube=new T.BoxGeometry(1,1,1);
    const bucket=point=>{const b=blockForPoint(point),id=`${b.x},${b.y}`;if(!this.index.has(id))this.index.set(id,{walls:[],cargo:[],sandbags:[]});return this.index.get(id);};
    const doors=new Set((state.interactables||[]).filter(object=>object.kind==='door').map(object=>object.edge));
    const covered=new Set(windowSystem.compile(state).flatMap(r=>r.edges));
    for(const [edge,kind]of Object.entries(state.edges)){
      const span=legacyWallSpan(edge,covered,WALL_DIMENSIONS.length);if(kind==='door'||doors.has(edge)||!span)continue;
      const [axis,x,y]=edge.split(':'),wall={axis,x:+x,y:+y,span};bucket(wall).walls.push(wall);
    }
    const occupied=new Set();
    for(const p of state.props||[]){
      if(PAINTED_PROP_FORMS[p.kind]){bucket(p).cargo.push({...p,form:PAINTED_PROP_FORMS[p.kind]});occupied.add(key(p.x,p.y));}
      else if(p.kind==='sandbags')bucket(p).sandbags.push(p);
    }
    const used=new Set(['brick','concrete']),bounds=worldBounds(state);
    for(let y=bounds.y;y<bounds.y+bounds.h;y++)for(let x=bounds.x;x<bounds.x+bounds.w;x++){
      used.add(groundSurface(state,x,y));
      if(state.map[y][x]==='crate'&&!occupied.has(key(x,y)))bucket({x,y}).cargo.push({x,y,form:'crate-square'});
    }
    for(const kind of used)this.material(kind);
    this.material('brick',true);this.material('concrete',true);
    if([...this.index.values()].some(group=>group.sandbags.length)){
      this.sandbagPaint=this.load('../assets/environment/sandbags.png');this.sandbagPaint.colorSpace=T.SRGBColorSpace;
      // Alpha bounds of the unmodified 1254px source painting, with 2px bleed.
      this.sandbagPaint.offset.set(22/1254,(1254-1093)/1254);this.sandbagPaint.repeat.set(1211/1254,815/1254);
    }
    this.update(state,state.units?.find(u=>u.team==='squad'));
    this.ready=Promise.all([PAINTED_ATLAS,CARGO_ATLAS].map(file=>this.loader.loadAsync(file).then(texture=>{
      if(this.disposed){texture.dispose();return null;}this.textures.push(texture);texture.colorSpace=T.SRGBColorSpace;return texture;
    }))).then(textures=>{
      if(this.disposed)return;
      this.library=createCargoLibrary(...textures);
      for(const chunk of this.chunks.values())this.buildCargo(chunk);
      this.update(this.state,this.unit,this.window);
    }).catch(error=>{if(!this.disposed)onError(error.message||'Cargo artwork could not load.');});
  }
  load(file){const texture=this.loader.load(file);this.textures.push(texture);return texture;}
  // Crate tiles whose cargo accepted mission art now draws. The field calls this
  // only once that art is in the scene, so a late or failed kit leaves the
  // inherited cargo standing instead of an invisible collider.
  replace(tiles){for(const tile of tiles)this.replaced.add(tile);if(this.window)this.update(this.state,this.unit,this.window);}
  material(kind,faded=false){
    const id=`${kind}:${faded}`;if(this.materialCache.has(id))return this.materialCache.get(id);
    const surface=surfaces[kind];let texture=this.texturesByKind[kind];
    if(!texture){texture=this.load('../assets/environment/'+surface.file);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=this.anisotropy;this.texturesByKind[kind]=texture;}
    const material=new T.MeshStandardMaterial({map:texture,color:surface.tint,roughness:.95,transparent:faded,opacity:faded?.24:1,depthWrite:!faded});
    material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      #ifdef USE_MAP
      vec3 surfaceWorld=(instanceMatrix*vec4(position,1.0)).xyz;
      vMapUv=(abs(normal.y)>.5?surfaceWorld.xz:abs(normal.x)>.5?surfaceWorld.zy:surfaceWorld.xy)/${surface.period.toFixed(2)};
      #endif`);};
    material.customProgramCacheKey=()=>`aft-mobile-surface-${kind}-${faded}`;
    this.materials.push(material);this.materialCache.set(id,material);return material;
  }
  buildChunk(rect){
    const group=new T.Group();group.name='Resident block '+rect.id;
    const chunk={rect,group,grounds:[],walls:[],cargo:[],sandbags:[],source:this.index.get(rect.id)||{walls:[],cargo:[],sandbags:[]}};
    const bounds=worldBounds(this.state),groups=new Map(),matrix=new T.Matrix4(),rotation=new T.Quaternion(),position=new T.Vector3(),scale=new T.Vector3();
    for(let y=Math.max(rect.y,bounds.y);y<Math.min(rect.y+rect.h,bounds.y+bounds.h);y++)for(let x=Math.max(rect.x,bounds.x);x<Math.min(rect.x+rect.w,bounds.x+bounds.w);x++){
      const kind=groundSurface(this.state,x,y);if(!groups.has(kind))groups.set(kind,[]);groups.get(kind).push({x,y});
    }
    for(const [kind,records]of groups){
      const mesh=new T.InstancedMesh(this.cube,this.material(kind),records.length);
      records.forEach((p,i)=>{matrix.compose(position.set(p.x,-.06,p.y),rotation,scale.set(1.006,.1,1.006));mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,new T.Color(0));});
      mesh.receiveShadow=true;mesh.userData.noShadow=true;mesh.computeBoundingSphere();group.add(mesh);chunk.grounds.push({mesh,records});
    }
    for(const axis of ['e','s'])for(const faded of [false,true]){
      const edges=chunk.source.walls.filter(wall=>wall.axis===axis);if(!edges.length)continue;
      const brick=this.material('brick',faded),cap=this.material('concrete',faded),faces=axis==='e'?[brick,brick,cap,cap,cap,cap]:[cap,cap,cap,cap,brick,brick];
      const mesh=new T.InstancedMesh(this.cube,faces,edges.length);mesh.setColorAt(0,new T.Color(1,1,1));mesh.count=0;
      mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);chunk.walls.push({mesh,edges,axis,faded});
    }
    for(const p of chunk.source.sandbags){
      const box=(this.state.obstacles||[]).find(box=>box.sourceKind==='sandbags'&&p.x>=box.x0&&p.x<=box.x1&&p.y>=box.y0&&p.y<=box.y1);
      const material=new T.SpriteMaterial({map:this.sandbagPaint,alphaTest:.05,depthWrite:false}),sprite=new T.Sprite(material);
      sprite.center.set(.5,0);sprite.position.set(p.x,.015,p.y);sprite.scale.set(box?box.x1-box.x0:.96,box?.height??.92,1);sprite.userData.sourceKind='sandbags';group.add(sprite);chunk.sandbags.push({sprite,p});
    }
    this.root.add(group);this.stats.created++;if(this.library)this.buildCargo(chunk);return chunk;
  }
  buildCargo(chunk){
    const groups=new Map(),rotation=new T.Quaternion(),translation=new T.Vector3(),matrix=new T.Matrix4(),scale=new T.Vector3(1,1,1);
    for(const p of chunk.source.cargo){
      const {id,skin,label}=cargoFinish(p);
      if(!this.prototypes.has(id))this.prototypes.set(id,this.library.build(p.form,skin,label));
      const prototype=this.prototypes.get(id),box=(this.state.obstacles||[]).find(box=>box.sourceKind===p.kind&&p.x>=box.x0&&p.x<=box.x1&&p.y>=box.y0&&p.y<=box.y1);
      scale.set(1,box?box.height/prototype.bounds.getSize(new T.Vector3()).y:1,1);
      rotation.setFromAxisAngle(new T.Vector3(0,1,0),p.rotated?-Math.PI/2:0);translation.set(p.x,0,p.y);matrix.compose(translation,rotation,scale);
      prototype.root.traverse(part=>{
        if(!part.isMesh)return;const id=part.geometry.uuid+':'+part.material.uuid;
        if(!groups.has(id))groups.set(id,{geometry:part.geometry,material:part.material,records:[]});
        groups.get(id).records.push({p,matrix:new T.Matrix4().multiplyMatrices(matrix,part.matrixWorld)});
      });
    }
    for(const {geometry,material,records}of groups.values()){
      const mesh=new T.InstancedMesh(geometry,material,records.length);mesh.setColorAt(0,new T.Color(1,1,1));mesh.count=0;chunk.group.add(mesh);chunk.cargo.push({mesh,records});
    }
  }
  releaseChunk(chunk){
    chunk.group.removeFromParent();
    for(const {mesh}of [...chunk.grounds,...chunk.walls,...chunk.cargo])mesh.dispose();
    for(const {sprite}of chunk.sandbags)sprite.material.dispose();
    chunk.group.clear();this.stats.disposed++;
  }
  update(state,unit,window=blockWindow(state,unit||{x:0,y:0})){
    if(this.disposed)return;this.state=state;this.unit=unit;
    if(this.window?.key!==window.key){
      const delta=windowChanges(this.window,window);
      for(const rect of delta.disposed){this.releaseChunk(this.chunks.get(rect.id));this.chunks.delete(rect.id);}
      for(const rect of delta.created)this.chunks.set(rect.id,this.buildChunk(rect));
      this.window=window;
    }
    const color=new T.Color(),matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion();
    for(const chunk of this.chunks.values()){
      for(const {mesh,records}of chunk.grounds){
        records.forEach((p,i)=>{const known=state.seen.has(key(p.x,p.y)),lit=state.visible.has(key(p.x,p.y));mesh.setColorAt(i,color.setScalar(known?(lit?1:.38):state.groundPalette==='aft-sector'?0:.018));});mesh.instanceColor.needsUpdate=true;
      }
      for(const {mesh,edges,axis,faded}of chunk.walls){
        let count=0;
        for(const wall of edges){
          if(!wallKnown(state,wall)||foregroundWall(wall,unit)!==faded)continue;
          const middle=(wall.span.min+wall.span.max)/2,length=wall.span.max-wall.span.min;
          matrix.compose(position.set(axis==='e'?wall.x+.5:middle,WALL_DIMENSIONS.height/2,axis==='s'?wall.y+.5:middle),rotation,scale.set(axis==='e'?WALL_DIMENSIONS.thickness:length,WALL_DIMENSIONS.height,axis==='e'?length:WALL_DIMENSIONS.thickness));
          mesh.setMatrixAt(count,matrix);const lit=state.visible.has(key(wall.x,wall.y))||state.visible.has(key(wall.x+(axis==='e'?1:0),wall.y+(axis==='s'?1:0)));mesh.setColorAt(count++,color.setScalar(lit?1:.5));
        }
        mesh.count=count;mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();
      }
      for(const {mesh,records}of chunk.cargo){
        let count=0;
        for(const {p,matrix}of records){if(!state.seen.has(key(p.x,p.y))||this.replaced.has(key(p.x,p.y)))continue;mesh.setMatrixAt(count,matrix);mesh.setColorAt(count++,color.setScalar(state.groundPalette!=='aft-sector'||state.visible.has(key(p.x,p.y))?1:.38));}
        mesh.count=count;mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();
      }
      for(const {sprite,p}of chunk.sandbags){sprite.visible=state.seen.has(key(p.x,p.y));sprite.material.color.setScalar(state.visible.has(key(p.x,p.y))?1:.38);}
    }
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;
    for(const chunk of this.chunks.values())this.releaseChunk(chunk);this.chunks.clear();
    this.root.removeFromParent();this.root.clear();this.library?.dispose();this.prototypes.clear();this.cube.dispose();
    for(const material of this.materials)material.dispose();for(const texture of this.textures)texture.dispose();
  }
}
