import {MAP_LEVELS} from './map-layers.js';
import {battleFoliageTargets} from './battle-foliage-focus.js';
import {EnvironmentPaint} from './environment-paint.js';
import {BiomeScene} from './biome-scene.js';
import {battleFloorPoint} from './isometric-camera.js';
import {environmentGeometries,environmentGeometry} from './environment-geometry.js';
import {setBattleCamera} from './isometric-camera.js';
export {FLOOR_PIXELS} from './isometric-camera.js';
import {surfaceLevel,xrayThroughLevel,xrayWall} from './wall-xray.js';
import {environmentVisuals} from './environment-visuals.js';
import {FOLIAGE_ATLAS,FOLIAGE_MATERIALS,paintFoliageMaterial} from './foliage-materials.js';
import * as THREE from './vendor/three.module.js';
import {LoadingTracker,trackLoadingManager} from './loading-tracker.js';
import {buildWorld,GAME_CAMERA,toWorld} from './hybrid-world.js';
import {MapGeometryCache} from './map-geometry-cache.js';
import {hybridWorld} from './hybrid-combat.js';
import {surfacePixels,materialKind} from './hybrid-materials.js';
import {spriteVertex,alphaBounds,weaponLandmarks} from './hybrid-sprites.js';
import {unitArt} from './red-hats-art.js';
import {bodyArt} from './body-art.js';
import {FLAME_NOZZLES} from './flame-nozzles.js';
import {drawFlamethrower} from './flamethrower-art.js';
import {weaponExpansionArt} from './weapon-expansion-art.js';
// Bound retained poses across turns, map transitions, and editor imports.
export const TEXTURE_LIMIT=64;
export function hybridArtwork(unit){
 const art=unitArt(unit);
 if(!['hands','knife','pistol','rifle','assault','wireCutters'].includes(unit.weapon)&&!weaponExpansionArt(unit.species,unit.weapon,unit.stance||'standing',unit.outfit==='red-hats'?'red-hats':'normal'))return {...art,overlay:art.overlay||'firearm'};
 return art;
}
function overlayLandmarks(unit,art){
 const y=unit.stance==='prone'?-15:unit.stance==='kneeling'?-28:-42;
 let muzzle=art.overlay==='flamethrower'?[27,y+(unit.stance==='standing'?3:2)]:art.overlay==='firearm'?[20,y+3]:[4+Math.cos(-.18)*(unit.weapon==='rpg'?39:31)-Math.sin(-.18)*3,y+Math.sin(-.18)*(unit.weapon==='rpg'?39:31)+Math.cos(-.18)*3];
 return {muzzle:[art.anchor[0]+muzzle[0]*4,art.anchor[1]+muzzle[1]*4],grip:[art.anchor[0],art.anchor[1]+(y+8)*4]};
}
function drawOverlay(context,unit,art){
 context.save();context.translate(...art.anchor);
 if(art.overlay==='firearm'){const y=unit.stance==='prone'?-15:unit.stance==='kneeling'?-28:-42;context.scale(4,4);context.fillStyle='#333b36';context.fillRect(-4,y,24,6);context.fillStyle='#87603e';context.fillRect(-8,y+2,10,8);context.fillRect(3,y+5,4,7);if(unit.weapon==='sniper'){context.fillStyle='#202921';context.fillRect(0,y-4,10,3);}}
 else drawFlamethrower(context,unit,4);context.restore();
}
export function calibratedLandmarks(unit,art,pixels,width,height,bounds){
 if(['hands','knife','grenade','wireCutters'].includes(unit.weapon)||unit.hp<=0)return null;
 if(art.overlay)return overlayLandmarks(unit,art);
 if(unit.weapon==='flamethrower'){
  const nozzle=FLAME_NOZZLES[art.src];if(!nozzle)throw Error('Missing authored flamethrower nozzle: '+art.src);
  const [x,y,angle]=nozzle;return {muzzle:[x,y],grip:[art.anchor[0],y-Math.tan(angle*Math.PI/180)*(x-art.anchor[0])]};
 }
 if(!['pistol','rifle','assault','shotgun','sniper','smg','hmg','launcher','rpg'].includes(unit.weapon))throw Error('Unsupported weapon calibration: '+unit.weapon);
 return weaponLandmarks(pixels,width,height,bounds,art.anchor[0]);
}
const key=(x,y,z)=>z?`${x},${y},${z}`:`${x},${y}`;
function known(box,seen){if(!seen)return true;const p=box.source;if(p.edge){const [axis,x,y,z=0]=p.edge.split(':');return seen.has(key(+x,+y,+z))||seen.has(key(+x+(axis==='e'?1:0),+y+(axis==='s'?1:0),+z));}return seen.has(key(p.x,p.y,p.z||0));}
export const baseGroundFloor=box=>box.kind==='floor'&&(box.source.z||0)===0;
export class HybridRenderer{
 constructor(onReady=()=>{}){
  this.mapGeometry=new MapGeometryCache(buildWorld);
  this.renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,preserveDrawingBuffer:true});this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera();this.scene.add(new THREE.HemisphereLight(0xfff3d8,0x52634d,2));const sun=new THREE.DirectionalLight(0xffe2ac,2);sun.position.set(-4,9,5);this.scene.add(sun);
  this.loading=new LoadingTracker();
  // Optional cosmetics share progress, but own a separate manager so their
  // network errors cannot poison mandatory terrain/actor preparation.
  this.optionalLoader=new THREE.TextureLoader(trackLoadingManager(new THREE.LoadingManager(),this.loading,{required:false}));
  this.environmentPaint=new EnvironmentPaint();this.structures=new THREE.Group();this.scene.add(this.structures);this.materials=new Map();this.textures=new Map();this.actors=new Map();this.loader=new THREE.TextureLoader(trackLoadingManager(new THREE.LoadingManager(),this.loading));this.onReady=onReady;this.geometries=environmentGeometries();this.boxGeometry=this.geometries.box;this.diagnostics=[];
  this.biomes=new BiomeScene(this.scene,this.loader,()=>{this.world=null;this.onReady();},e=>{this.diagnostics.push(e.message);this.onReady();});
 }
 material(kind){if(this.materials.has(kind))return this.materials.get(kind);const p=surfacePixels(kind),t=new THREE.DataTexture(p.data,p.width,p.height);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;const material=new THREE.MeshStandardMaterial({map:t,roughness:1,vertexColors:kind.startsWith('breach-')});
  const paintKind=kind.replace(/^breach-/,'');
  if(FOLIAGE_MATERIALS.has(paintKind)){
   if(!this.foliageTexture){this.foliageTexture=this.loader.load(FOLIAGE_ATLAS,texture=>{if(this.disposed){texture.dispose();return;}this.foliageReady=true;this.onReady();},undefined,()=>{this.diagnostics.push('Failed asset: '+FOLIAGE_ATLAS);this.onReady();});this.foliageTexture.colorSpace=THREE.SRGBColorSpace;this.foliageTexture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());}
   paintFoliageMaterial(material,paintKind,this.foliageTexture);this.environmentPaint.attach(material,paintKind);this.materials.set(kind,material);return material;
  }
  material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\n vec3 surfaceWorld=(instanceMatrix*vec4(position,1.0)).xyz; vMapUv=abs(normal.y)>.5?surfaceWorld.xz:abs(normal.x)>.5?surfaceWorld.zy:surfaceWorld.xy;\n#endif');};if(kind==='water'){material.roughness=.28;material.metalness=.2;const surfaceCompile=material.onBeforeCompile;material.onBeforeCompile=shader=>{surfaceCompile(shader);shader.uniforms.environmentTime={value:0};material.userData.waterTime=shader.uniforms.environmentTime;shader.fragmentShader='uniform float environmentTime;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n float ripple=sin(vMapUv.x*15.0+vMapUv.y*9.0+environmentTime)*.055+sin(vMapUv.y*18.0-environmentTime*.7)*.025; normal=normalize(normal+vec3(ripple,0.0,ripple*.6));');};}this.materials.set(kind,material);return material;
 }
 rebuild(world,seen,level,map){
  this.environmentPaint.setMap(map);const biomes=this.biomes.rebuild(map,seen,level);
  const previous=this.chunks||new Map(),next=new Map();
  const groups=new Map();
  for(const box of environmentVisuals(world,map,{biomes})){if(biomes&&baseGroundFloor(box)&&this.biomes.coversGround(box.source.x,box.source.y))continue;const z=surfaceLevel(box);if(z>level||!known(box,seen)||!['wall','roof'].includes(box.kind)&&map.concealedInteriors?.has(key(box.source.x,box.source.y,z)))continue;const material=materialKind(box),cutaway=this.wallXray?xrayThroughLevel(box):null,groupKey=`${baseGroundFloor(box)?"ground:":""}${cutaway===null?'':`xray:${xrayWall(box)?'wall':'slab'}:${cutaway}:`}${material}:${box.shape||'box'}:${Math.floor(box.center[0]/16)},${Math.floor(box.center[2]/16)}`;if(!groups.has(groupKey))groups.set(groupKey,{material,cutaway,shape:box.shape||'box',boxes:[]});groups.get(groupKey).boxes.push(box);}
  const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),parentRotation=new THREE.Quaternion(),euler=new THREE.Euler(),position=new THREE.Vector3(),scale=new THREE.Vector3();
  for(const [key,{material,cutaway,shape,boxes}]of groups){const old=previous.get(key),same=old&&old.userData.boxes.length===boxes.length&&boxes.every((b,i)=>{const a=old.userData.boxes[i];return a.id===b.id&&a.center.every((n,j)=>n===b.center[j])&&a.size.every((n,j)=>n===b.size[j])&&JSON.stringify([a.rotation,a.yaw])===JSON.stringify([b.rotation,b.yaw]);});if(same){next.set(key,old);previous.delete(key);continue;}
   const mesh=new THREE.InstancedMesh(environmentGeometry(this.geometries,shape),cutaway===null?this.material(material):this.wallXray.material(this.material(material),cutaway),boxes.length);for(const [i,b]of boxes.entries()){position.fromArray(b.center);scale.fromArray(b.size);rotation.setFromEuler(euler.set(...(b.rotation||[0,0,0])));parentRotation.setFromAxisAngle(new THREE.Vector3(0,1,0),b.yaw||0);rotation.premultiply(parentRotation);matrix.compose(position,rotation,scale);mesh.setMatrixAt(i,matrix);}mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.userData.boxes=boxes;mesh.userData.noShadow=boxes.every(baseGroundFloor);this.structures.add(mesh);next.set(key,mesh);}
  for(const mesh of previous.values()){this.structures.remove(mesh);mesh.dispose();}this.chunks=next;this.wallXray?.sync(next);
 }
 texture(unit,art){const textureKey=art.src+(art.overlay?'#'+unit.weapon:'');let t=this.textures.get(textureKey);if(t){this.textures.delete(textureKey);this.textures.set(textureKey,t);return t;}t=this.loader.load(art.src,texture=>{if(!this.textures.has(textureKey)){texture.dispose();return;}const canvas=document.createElement('canvas');canvas.width=texture.image.width;canvas.height=texture.image.height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(texture.image,0,0);if(art.overlay){drawOverlay(context,unit,art);texture.image=canvas;texture.needsUpdate=true;}const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;texture.userData.bounds=alphaBounds(pixels,canvas.width,canvas.height);texture.userData.weaponLandmarks=calibratedLandmarks(unit,art,pixels,canvas.width,canvas.height,texture.userData.bounds);this.onReady();},undefined,()=>{this.diagnostics.push('Failed asset: '+art.src);this.onReady();});t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;this.textures.set(textureKey,t);return t;}
 prune(){
  const active=new Set();for(const [id,mesh]of this.actors){if(mesh.visible)active.add(mesh.material.map);else{this.scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();this.actors.delete(id);}}
  for(const [src,t]of this.textures){if(this.textures.size<=TEXTURE_LIMIT)break;if(!active.has(t)){t.dispose();this.textures.delete(src);}}
 }
 actor(unit){const art=unit.hp<=0?bodyArt(unit):hybridArtwork(unit);if(!art)return null;let mesh=this.actors.get(unit.id);if(!mesh){mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1,32,32),new THREE.MeshBasicMaterial({alphaTest:.4,side:THREE.DoubleSide}));this.actors.set(unit.id,mesh);this.scene.add(mesh);}
  const texture=this.texture(unit,art),pose={...unit,stance:unit.hp<=0?'prone':unit.stance||'standing'},bounds=texture.userData.bounds||{left:0,right:art.width,top:art.height-(art.contentHeight||96),bottom:art.height};if(mesh.material.map!==texture){mesh.material.map=texture;mesh.material.needsUpdate=true;}mesh.position.fromArray(toWorld(unit));mesh.quaternion.copy(this.camera.quaternion);
  const signature=JSON.stringify([art.src,bounds,pose.stance,pose.heading,pose.hp<=0,texture.userData.weaponLandmarks]);
  if(signature!==mesh.userData.signature){mesh.userData.signature=signature;const frame={...art,weaponLandmarks:texture.userData.weaponLandmarks},p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;
   // Restore regular UVs before adding this weapon's measured muzzle vertex.
   for(let y=0;y<=32;y++)for(let x=0;x<=32;x++)uv.setXY(y*33+x,x/32,1-y/32);
   if(frame.weaponLandmarks){const [mx,my]=frame.weaponLandmarks.muzzle,ux=mx/art.width,uy=1-my/art.height,column=Math.max(1,Math.min(31,Math.round(ux*32))),row=Math.max(1,Math.min(31,Math.round((1-uy)*32)));for(let j=0;j<=32;j++){uv.setX(j*33+column,ux);uv.setY(row*33+j,uy);}}
   for(let i=0;i<p.count;i++)p.setXYZ(i,...spriteVertex(pose,frame,bounds,uv.getX(i)*art.width,(1-uv.getY(i))*art.height,GAME_CAMERA));p.needsUpdate=true;uv.needsUpdate=true;mesh.geometry.computeBoundingSphere();
  }
  return mesh;
 }
 draw(ctx,state,view,width,height,level,{editor=false,visibilityFiltered=false,showAllLevels=false}={}){
  const drawStart=performance.now();
  const camera=this.camera;
  if(this.width!==width||this.height!==height){this.renderer.setSize(width,height,false);this.width=width;this.height=height;}
  setBattleCamera(camera,view,width,height,editor?0:level);
  const world=state.geometryMode==='hybrid'?hybridWorld(state):this.mapGeometry.get(state);
  const renderLevel=showAllLevels?MAP_LEVELS-1:level,seen=editor?null:state.seen,wallDefinition=state.definition?.edges,floorDefinition=state.definition?.upper,breaches=state.breaches??state.definition?.breaches,rebuild=this.world!==world||this.seenCount!==seen?.size||this.renderLevel!==renderLevel||this.wallDefinition!==wallDefinition||this.floorDefinition!==floorDefinition||this.breaches!==breaches;if(rebuild){this.rebuild(world,seen,renderLevel,state);this.world=world;this.seenCount=seen?.size;this.renderLevel=renderLevel;this.wallDefinition=wallDefinition;this.floorDefinition=floorDefinition;this.breaches=breaches;}this.level=level;
  const focus=battleFloorPoint(view,width/2,height/2,level);const cursor=this.wallXray?.pointer,hover=cursor?{...battleFloorPoint(view,cursor.x,cursor.y,level),z:level}:null;this.biomes.cutawayTargets=editor?[]:battleFoliageTargets(state,state.units.map(u=>this.displayUnit?{...this.displayUnit(this.state?.units.find(v=>v.id===u.id)||u),presentationLevel:u.presentationLevel}:u),this.foliageSelectedIds||new Set([state.selected]),hover,this.foliageRoutes,level);this.biomes.update(camera,new THREE.Vector3(focus.x,0,focus.y),28*Math.sqrt(2)*view.zoom);
  const units=editor?[...state.starts.map((p,i)=>({...p,id:i,species:['horse','goat','donkey','sheep'][i],weapon:'rifle',hp:100,team:'squad'})),...state.guards.map((p,i)=>({...p,id:i+4,hp:100,team:'guard'}))]:state.units;
  for(const mesh of this.actors.values())mesh.visible=false;const picking=[];
  for(const u of units){if(u.away||u.casualty==='captured'||!showAllLevels&&(u.presentationLevel??u.z??0)!==level||!editor&&!visibilityFiltered&&u.team!=='squad'&&!state.detected.has(u.id)&&!(u.hp<=0&&state.seen.has(key(u.x,u.y,u.z||0))))continue;
   // Only initialize artwork near the viewport; large maps do not preload every pose.
   const center=new THREE.Vector3(...toWorld(u)).project(camera),px=(center.x+1)*width/2,py=(1-center.y)*height/2;if(px< -200||px>width+200||py< -200||py>height+200)continue;
   const mesh=this.actor(u);if(!mesh)continue;mesh.visible=true;const box=new THREE.Box3().setFromObject(mesh),points=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z).project(camera));const xs=points.map(p=>(p.x+1)*width/2),ys=points.map(p=>(1-p.y)*height/2);picking.push({id:u.id,x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys),px,py});
  }
  this.wallXray?.update(width,height,view.zoom,this.renderer.getPixelRatio(),level);this.prune();this.animateMaterials(performance.now()/1000);this.lights?.update(state,renderLevel,this.state?.clock?.minutes??480,this.reducedMotion?.matches?null:(this.presentationNow??0)/1000);this.daylight?.update(this.state?.clock?.minutes??480,camera,this.presentationNow??0);if(this.lights)this.lights.render(this.renderer,camera);else this.renderer.render(this.scene,camera);ctx.drawImage(this.renderer.domElement,0,0,width,height);this.drawTimes??=[];this.drawTimes.push(performance.now()-drawStart);if(this.drawTimes.length>120)this.drawTimes.shift();return picking;
 }
 animateMaterials(time){for(const m of this.materials.values())if(m.userData.waterTime)m.userData.waterTime.value=time;}
 stats(){return {biomes:this.biomes.stats(),meshes:this.structures.children.length,actors:this.actors.size,cachedPoses:this.textures.size,textures:this.renderer.info.memory.textures,geometries:this.renderer.info.memory.geometries,calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,drawTimes:[...this.drawTimes||[]],diagnostics:[...this.diagnostics],unsupported:this.world?.diagnostics||[]};}
 dispose(){this.biomes.dispose();this.environmentPaint.dispose();this.disposed=true;for(const mesh of this.structures.children)mesh.dispose();for(const mesh of this.actors.values()){mesh.geometry.dispose();mesh.material.dispose();}for(const t of this.textures.values())t.dispose();this.textures.clear();this.actors.clear();for(const m of this.materials.values()){if(m.map!==this.foliageTexture)m.map.dispose();m.dispose();}this.foliageTexture?.dispose();this.materials.clear();this.chunks?.clear();this.world=null;this.mapGeometry.clear();this.scene.clear();for(const geometry of Object.values(this.geometries))geometry.dispose();this.renderer.dispose();}
}
