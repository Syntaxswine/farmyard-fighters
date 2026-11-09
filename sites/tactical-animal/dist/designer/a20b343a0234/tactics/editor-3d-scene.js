import {MAP_LEVELS} from './map-layers.js';
import {passable} from './core/maps.js';
import {EnvironmentPaint} from './environment-paint.js';
import {BiomeScene} from './biome-scene.js';
import {SceneryScene} from './scenery-scene.js';
import {StrategicSiteScene} from './strategic-site-scene.js';
import {siteSupportAt} from './strategic-site-rules.js';
import {CliffMapScene} from './cliff-map-scene.js';
import {unitBaseHeight} from './tower-geometry.js';
import {motionPreference} from './settings-3d.js';
import {LightingScene} from './lighting-scene.js';
import {LIGHT_FORMS} from './light-sources.js';
import {DaylightRig} from './daylight-rig.js';
import {mapStartMinutes} from './game-clock.js';
import {FOLIAGE_ATLAS,FOLIAGE_MATERIALS,paintFoliageMaterial} from './foliage-materials.js';
import * as T from './vendor/three.module.js';
import {buildWorld,DIMENSIONS as D} from './hybrid-world.js';
import {environmentVisuals} from './environment-visuals.js';
import {environmentGeometries,environmentGeometry} from './environment-geometry.js';
import {surfacePixels,materialKind} from './hybrid-materials.js';
import {BattleEnvironment,PAINTED_PROP_FORMS,cargoPlacements,cargoFinish} from './battle-environment.js';
import {toWorld} from './hybrid-world.js';
import {ANIMAL_MOTION_CATALOG} from './animal-motion-catalog.js';
import {createRedHatCap} from './red-hat-model.js';
import {createAnimalPaint} from './animal-motion-paint.js';
import {createWeaponModel} from './weapon-models.js';
import {setInspectionCamera,floorPoint} from './editor-3d-camera.js';

// Blueprint scene only: no createGame, engine step or battle renderer.
export class InspectionScene {
 constructor(canvas,changed=()=>{}){
  this.reducedMotion=motionPreference();this.changed=changed;this.renderer=new T.WebGLRenderer({canvas,antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.outputColorSpace=T.SRGBColorSpace;
  this.scene=new T.Scene();this.scene.background=new T.Color('#172c29');this.camera=new T.OrthographicCamera();
  this.daylight=new DaylightRig(this.scene,this.renderer);
  this.environmentPaint=new EnvironmentPaint();this.geometry=environmentGeometries();this.materials=new Map();this.dimMaterials=new Map();this.loader=new T.TextureLoader();this.models=[];this.data=new Map();this.generation=0;this.diagnostics=[];
  this.biomes=new BiomeScene(this.scene,this.loader,()=>{if(this.document)this.rebuild();this.changed();},e=>{this.diagnostics.push(e.message);this.changed();});
  this.scenery=new T.Group();this.markers=new T.Group();this.scene.add(this.scenery,this.markers);
  this.highlight=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:0xffe5a5,depthTest:false}));this.highlight.renderOrder=20;this.scene.add(this.highlight);
  this.markerGeo=new T.RingGeometry(.27,.39,20);this.guardMat=new T.MeshBasicMaterial({color:0xef9e75,side:T.DoubleSide});this.startMat=new T.MeshBasicMaterial({color:0x96dbce,side:T.DoubleSide});this.accessMat=new T.MeshBasicMaterial({color:0xf7d17d,side:T.DoubleSide});
  this.cargo=new BattleEnvironment(this.scene,this.loader,()=>{if(this.document)this.rebuild();},error=>{this.diagnostics.push(error.message);changed();});
  this.sceneryAssets=new SceneryScene(this.scene,this.loader,()=>{if(this.document)this.rebuild();changed();},e=>{this.diagnostics.push('Scenery: '+e.message);changed();},this.renderer);this.sites=new StrategicSiteScene(this.scene,this.loader,()=>{if(this.document)this.rebuild();changed();},e=>{this.diagnostics.push('Strategic sites: '+e.message);changed();});this.cliffs=new CliffMapScene(this.scene);this.lights=new LightingScene(this.scene,this.loader,changed,e=>{this.diagnostics.push('Lighting: '+e.message);changed();});
  this.options={level:0,showAllLevels:true,roofs:true,walls:true};
 }
 material(kind){
  if(!this.materials.has(kind)){
   const p=surfacePixels(kind),map=new T.DataTexture(p.data,p.width,p.height);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.needsUpdate=true;
   const material=new T.MeshStandardMaterial({map,roughness:1,vertexColors:kind.startsWith('breach-')});
   material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\n vec3 surfaceWorld=(instanceMatrix*vec4(position,1.0)).xyz; vMapUv=abs(normal.y)>.5?surfaceWorld.xz:abs(normal.x)>.5?surfaceWorld.zy:surfaceWorld.xy;\n#endif');};
   const paintKind=kind.replace(/^breach-/,'');
   if(FOLIAGE_MATERIALS.has(paintKind)){
    if(!this.foliageTexture){this.foliageTexture=this.loader.load(FOLIAGE_ATLAS,texture=>{if(this.disposed){texture.dispose();return;}this.foliageReady=true;this.changed();},undefined,()=>{this.diagnostics.push('Failed asset: '+FOLIAGE_ATLAS);this.changed();});this.foliageTexture.colorSpace=T.SRGBColorSpace;this.foliageTexture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());}
    paintFoliageMaterial(material,paintKind,this.foliageTexture);this.environmentPaint.attach(material,paintKind);
   }
   this.materials.set(kind,material);
  }return this.materials.get(kind);
 }
 get visibleLevel(){return this.options.showAllLevels?MAP_LEVELS-1:this.options.level;}
 dim(material,z){if(this.options.showAllLevels||z===this.options.level)return material;if(!this.dimMaterials.has(material)){const m=material.clone();m.onBeforeCompile=(shader,renderer)=>{material.onBeforeCompile(shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight *= .38;\n#include <opaque_fragment>');};m.customProgramCacheKey=()=>material.customProgramCacheKey()+'-inspection-dim';this.dimMaterials.set(material,m);}return this.dimMaterials.get(material);}
 clearScenery(){for(const mesh of this.scenery.children)mesh.dispose();this.scenery.clear();}
 async open(document){
  const generation=++this.generation,start=performance.now();this.clearModels();this.document=document;this.diagnostics=[];
  this.world=buildWorld(document.map);this.diagnostics.push(...this.world.diagnostics.map(d=>d.message+': '+d.kind));this.rebuild();
  // Limit simultaneous model/texture preparation on large maps.
  const pending=[...document.units];
  await Promise.all(Array.from({length:4},async()=>{while(pending.length&&generation===this.generation)await this.loadUnit(pending.shift(),generation);}));
  if(generation===this.generation){this.loadMs=performance.now()-start;this.changed();}
 }
 async loadUnit(unit,generation){
  const profile=ANIMAL_MOTION_CATALOG.find(p=>p.id===unit.species);if(!profile){this.diagnostics.push('Missing character: '+unit.species);return;}
  let worker,paint,equipment,cap;
  try{
   if(!this.data.has(profile.file))this.data.set(profile.file,fetch(new URL(profile.file,import.meta.url)).then(r=>{if(!r.ok)throw Error('Missing '+profile.file);return r.json();}));
   worker=profile.create(await this.data.get(profile.file));paint=await createAnimalPaint(this.renderer,worker,profile,this.loader,unit.outfit,true);
   if(unit.outfit==='red-hats')cap=await createRedHatCap(this.renderer,worker,profile,this.loader,true);
   if(generation!==this.generation){cap?.dispose();paint.dispose();worker.skeleton.dispose();worker.dispose();return;}
   for(const part of worker.parts)part.material=paint.material;
   if(!profile.unarmed){equipment=createWeaponModel(unit.weapon);worker.equipWeapon(equipment);}
   worker.pose(profile.unarmed?'neutral':'carry',-(unit.heading||0));paint.setGripForearm?.(!!equipment?.carry?.handPoses?.support?.gripMesh);
   const root=new T.Group();root.add(worker.root);root.position.set(unit.x,unitBaseHeight({...unit,cliffSupport:siteSupportAt(this.document.map,unit)||unit.cliffSupport},D.floorSpacing),unit.y);root.updateMatrixWorld(true);worker.skeleton.update();for(const part of worker.parts){part.computeBoundingBox?.();part.computeBoundingSphere?.();}
   this.scene.add(root);const model={root,worker,paint,equipment,cap,capMaterial:cap?.mesh.material,unit};this.models.push(model);this.showModel(model);this.changed();
  }catch(error){cap?.dispose();equipment?.dispose();paint?.dispose();worker?.skeleton.dispose();worker?.dispose();if(generation===this.generation){this.diagnostics.push(unit.role+': '+error.message);this.changed();}}
 }
 showModel(model){const z=model.unit.z||0;model.root.visible=z<=this.visibleLevel;for(const part of model.worker.parts)part.material=this.dim(model.paint.material,z);if(model.cap)model.cap.mesh.material=this.dim(model.capMaterial,z);}
 async update(document){
  this.document=document;this.world=buildWorld(document.map);
  const wanted=new Map(document.units.map(u=>[u.id,u]));
  this.models=this.models.filter(m=>{const next=wanted.get(m.unit.id);if(next&&JSON.stringify(next)===JSON.stringify(m.unit)){wanted.delete(m.unit.id);return true;}m.root.removeFromParent();this.dimMaterials.get(m.capMaterial)?.dispose();this.dimMaterials.delete(m.capMaterial);m.cap?.dispose();m.equipment?.dispose();const dim=this.dimMaterials.get(m.paint.material);dim?.dispose();this.dimMaterials.delete(m.paint.material);m.paint.dispose();m.worker.skeleton.dispose();m.worker.dispose();return false;});
  this.rebuild();for(const unit of wanted.values())await this.loadUnit(unit,this.generation);this.changed();
 }
 rebuild(){
  if(!this.document)return;const started=performance.now(),{roofs,walls}=this.options,level=this.visibleLevel,source=this.document.map;this.environmentPaint.setMap(source);
  const biomes=this.biomes.rebuild(source,null,level,{editor:true,selectedLevel:this.options.level,dim:!this.options.showAllLevels});
  this.sceneryAssets.rebuild({...source,difficulty:'easy'},this.visibleLevel);this.sites.rebuild({...source,difficulty:'easy'},this.visibleLevel);this.cliffs.rebuild(source,level,{editor:true,dim:!this.options.showAllLevels,grassTexture:this.material('grass').map,environmentPaint:this.environmentPaint});
  const map={...source,canopies:roofs?source.canopies:[],coverOccupiedProps:source.props,props:source.props.filter(p=>!PAINTED_PROP_FORMS[p.kind]&&(roofs||!p.kind.startsWith('roof-')))};
  const world={...this.world,boxes:this.world.boxes.filter(b=>!(b.kind==='cover'&&b.material==='crate-wood')&&(walls||!b.source.edge)&&(roofs||b.kind!=='roof'))};
  const groups=new Map(),matrix=new T.Matrix4(),q=new T.Quaternion(),yaw=new T.Quaternion(),euler=new T.Euler(),position=new T.Vector3(),scale=new T.Vector3();
  const add=(geometry,material,m,z,x,y)=>{const mat=this.dim(material,z),key=`${Math.floor(x/16)},${Math.floor(y/16)}:${geometry.uuid}:${mat.uuid}`;if(!groups.has(key))groups.set(key,{geometry,material:mat,matrices:[]});groups.get(key).matrices.push(m.clone());};
  for(const b of environmentVisuals(world,map,{biomes})){
   const z=b.source.z??Number(b.source.edge?.split(':')[3]||0);if(z>level)continue;
   q.setFromEuler(euler.set(...(b.rotation||[0,0,0])));yaw.setFromAxisAngle(new T.Vector3(0,1,0),b.yaw||0);q.premultiply(yaw);matrix.compose(position.fromArray(b.center),q,scale.fromArray(b.size));
   add(environmentGeometry(this.geometry,b.shape||'box'),this.material(materialKind(b)),matrix,z,b.center[0],b.center[2]);
  }
  if(this.cargo.library)for(const p of cargoPlacements(source)){
   const z=p.z||0;if(z>level)continue;const {skin,label,id:key}=cargoFinish(p);
   if(!this.cargo.prototypes.has(key))this.cargo.prototypes.set(key,this.cargo.library.build(p.form,skin,label));
   matrix.compose(position.fromArray(toWorld(p)),q.setFromAxisAngle(new T.Vector3(0,1,0),p.rotated?-Math.PI/2:0),scale.set(1,1,1));
   this.cargo.prototypes.get(key).root.traverse(part=>{if(part.isMesh)add(part.geometry,part.material,new T.Matrix4().multiplyMatrices(matrix,part.matrixWorld),z,p.x,p.y);});
  }
  const prior=new Map(this.scenery.children.map(m=>[m.userData.chunk,m]));
  for(const [key,{geometry,material,matrices}]of groups){const old=prior.get(key);prior.delete(key);if(old&&old.count===matrices.length&&matrices.every((m,i)=>m.elements.every((n,j)=>Math.abs(n-old.instanceMatrix.array[i*16+j])<1e-5)))continue;
   if(old){old.removeFromParent();old.dispose();}const mesh=new T.InstancedMesh(geometry,material,matrices.length);mesh.userData.chunk=key;matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();this.scenery.add(mesh);}
  for(const mesh of prior.values()){mesh.removeFromParent();mesh.dispose();}
  this.clearMarkers();
  const addMarker=(p,material,heading)=>{if((p.z||0)>level)return;const ring=new T.Mesh(this.markerGeo,material);ring.rotation.x=-Math.PI/2;ring.position.set(p.x,unitBaseHeight(p,D.floorSpacing)+.035,p.y);this.markers.add(ring);if(heading!==undefined){const angle=heading*Math.PI/180,arrow=new T.ArrowHelper(new T.Vector3(Math.cos(angle),0,Math.sin(angle)),ring.position,.85,material.color.getHex(),.2,.12);this.markers.add(arrow);}};
  for(const u of this.document.units)addMarker(u,u.id.startsWith('guard')?this.guardMat:this.startMat,u.heading||0);
  for(const p of [...source.exits,...(source.climbs||[])])addMarker(p,this.accessMat);
  for(const model of this.models)this.showModel(model);this.rebuildMs=performance.now()-started;this.changed();
 }
 setOptions(options){Object.assign(this.options,options);this.rebuild();}
 select(selection){
  this.foliageSelection=selection?.cells;
  const points=[],h=this.options.level*D.floorSpacing+.045;
  if(selection?.type==='edge'){for(const edge of selection.edges||[selection.edge]){const [axis,x,y]=edge.split(':'),a=+x,b=+y;points.push(...(axis==='e'?[new T.Vector3(a+.5,h,b-.5),new T.Vector3(a+.5,h,b+.5)]:[new T.Vector3(a-.5,h,b+.5),new T.Vector3(a+.5,h,b+.5)]));}}
  else for(const p of selection?.cells||[]){const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]];for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4];points.push(new T.Vector3(p.x+a[0],h,p.y+a[1]),new T.Vector3(p.x+b[0],h,p.y+b[1]));}}
  this.highlight.geometry.dispose();this.highlight.geometry=new T.BufferGeometry().setFromPoints(points);this.changed();
 }
 draw(view,width,height){this.renderer.setSize(width,height,false);setInspectionCamera(this.camera,{...view,level:this.options.level},width,height);this.updateFoliageFocus();this.biomes.update(this.camera,new T.Vector3(view.x,0,view.y),height/(view.span||24));this.lights.update(this.document?.map,this.visibleLevel,this.previewMinutes??mapStartMinutes(this.document?.map),this.reducedMotion?.matches?null:performance.now()/1000,true);this.daylight.update(this.previewMinutes??mapStartMinutes(this.document?.map),this.camera,0,true);this.sceneryAssets.update(performance.now()/1000,this.camera,{reducedMotion:!!this.reducedMotion?.matches});this.lights.render(this.renderer,this.camera);}
 pick(x,y,width,height){return floorPoint(this.camera,x,y,width,height,this.options.level);}
 projectTile(p,width,height){const v=new T.Vector3(p.x,(p.z||0)*D.floorSpacing+.08,p.y).project(this.camera);return {x:(v.x+1)*width/2,y:(1-v.y)*height/2,visible:v.z>=-1&&v.z<=1};}
 pickCharacter(x,y,width,height){
  const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(x/width*2-1,1-y/height*2),this.camera);
  const models=this.models.filter(m=>m.root.visible&&(m.unit.z||0)===this.options.level);
  const hit=ray.intersectObjects(models.map(m=>m.root),true)[0];if(!hit)return null;
  let root=hit.object;while(root){const model=models.find(m=>m.root===root);if(model)return model.unit;root=root.parent;}return null;
 }
 pickSpotlight(x,y,width,height){
  const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(x/width*2-1,1-y/height*2),this.camera);
  const models=this.lights.models.filter(m=>m.root.visible&&LIGHT_FORMS[m.prop.kind]?.spot&&(m.prop.z||0)===this.options.level);
  const hit=ray.intersectObjects(models.map(m=>m.root),true)[0];if(!hit)return null;
  let root=hit.object;while(root){const model=models.find(m=>m.root===root);if(model)return model.prop;root=root.parent;}return null;
 }
 pickCliff(x,y,width,height){
  const raycaster=new T.Raycaster();raycaster.setFromCamera(new T.Vector2(x/width*2-1,1-y/height*2),this.camera);
  let nearest=null,distance=Infinity;
  for(const p of this.document?.map.props||[]){if(p.kind!=='cliff-ledge'||(p.cliffMask??15)!==15||(p.z||0)!==this.options.level)continue;const h=(p.z||0)*D.floorSpacing,hit=raycaster.ray.intersectBox(new T.Box3(new T.Vector3(p.x-.5,h,p.y-.5),new T.Vector3(p.x+.5,h+2,p.y+.5)),new T.Vector3());if(!hit)continue;const d=hit.distanceTo(raycaster.ray.origin);if(d<distance){distance=d;nearest={x:p.x+Math.max(-.49,Math.min(.49,hit.x-p.x)),y:p.y+Math.max(-.49,Math.min(.49,hit.z-p.y)),z:p.z||0};}}
  return nearest;
 }
 updateFoliageFocus(){
  const cells=this.foliageSelection||[],targets=[];
  if(cells.length){const xs=cells.map(p=>p.x),ys=cells.map(p=>p.y),x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2;targets.push({id:'selection',position:[x,this.options.level*D.floorSpacing+.3,y],level:this.options.level,radius:Math.min(6,Math.max(1.5,Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*.55+1))});}
  if(this.foliageHover)targets.push({id:'hover',position:[this.foliageHover.x,this.options.level*D.floorSpacing+.25,this.foliageHover.y],level:this.options.level,radius:1.6});
  this.biomes.cutawayTargets=targets;
 }
 preview(result){
  this.sceneryAssets.preview(result?.sceneryPreview);
  if(!this.disposed&&this.document&&(result?.hedgePreview||this.hedgePreview)){
   this.hedgePreview=!!(result?.ok&&result?.hedgePreview);this.biomes.hedges.rebuild(this.hedgePreview?result.map:this.document.map,null,this.visibleLevel,{editor:true,selectedLevel:this.options.level,dim:!this.options.showAllLevels});this.changed();
  }
  if(this.previewTrees){this.previewTrees.traverse(m=>{if(m.isInstancedMesh)m.dispose();});this.previewTrees.removeFromParent();for(const g of this.previewTreeGeometry)g.dispose();for(const m of this.previewTreeMaterials)m.dispose();this.previewTrees=null;this.previewTreeGeometry=[];this.previewTreeMaterials=[];}
  if(this.previewArrow){this.previewArrow.removeFromParent();this.previewArrow.line.material.dispose();this.previewArrow.cone.material.dispose();this.previewArrow=null;}
  if(this.previewMesh){this.previewMesh.removeFromParent();this.previewMesh.geometry.dispose();this.previewMesh.material.dispose();this.previewMesh.dispose();this.previewMesh=null;}
  if(!result){this.select(null);return;}
  const cells=result.cells||[],z=this.options.level;
  if(result.trees?.length){
   this.previewTrees=new T.Group();this.previewTreeGeometry=[];this.previewTreeMaterials=[];this.scene.add(this.previewTrees);
   const ring=new T.RingGeometry(.43,.54,16),materials={};this.previewTreeGeometry.push(ring);
   for(const [kind,color]of Object.entries({added:0x56ef96,retained:0xffd67d,removed:0xff5a4a})){materials[kind]=new T.MeshBasicMaterial({color,depthTest:false,side:T.DoubleSide});this.previewTreeMaterials.push(materials[kind]);}
   for(const t of result.trees){const mark=new T.Mesh(ring,materials[t.change]);mark.rotation.x=-Math.PI/2;mark.position.set(t.x,t.base+.09,t.y);mark.renderOrder=25;this.previewTrees.add(mark);
    if(t.change==='added'&&this.biomes.factory){const tree=this.biomes.factory.create(t.id,{variant:t.variant,mature:t.dense});tree.position.set(t.x,t.base,t.y);tree.traverse(m=>{if(m.isMesh){m.castShadow=false;m.raycast=()=>{};}});this.previewTrees.add(tree);}
   }
  }
  const geometry=new T.PlaneGeometry(.98,.98),material=new T.MeshBasicMaterial({color:result.ok?0x91ddba:0xff6655,transparent:true,opacity:.4,depthTest:false,side:T.DoubleSide});
  const mesh=new T.InstancedMesh(geometry,material,cells.length),matrix=new T.Matrix4();cells.forEach((p,i)=>{matrix.makeRotationX(-Math.PI/2);matrix.setPosition(p.x,(p.z??z)*D.floorSpacing+.06,p.y);mesh.setMatrixAt(i,matrix);});mesh.renderOrder=19;mesh.frustumCulled=false;this.scene.add(mesh);this.previewMesh=mesh;
  if(result.sceneryPreview){const p=result.sceneryPreview,reserved=new Set(cells.map(c=>c.x+','+c.y)),near=[];for(const c of cells)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=c.x+dx,y=c.y+dy,k=x+','+y;if(!reserved.has(k)&&!near.some(q=>q.x===x&&q.y===y)&&passable(this.document.map,{x,y,z:p.z||0}))near.push({x,y});}const g=new T.PlaneGeometry(.9,.9),mat=new T.MeshBasicMaterial({color:0x56ef96,wireframe:true,depthTest:false}),marks=new T.InstancedMesh(g,mat,near.length);this.previewTrees||=new T.Group();this.previewTreeGeometry||=[];this.previewTreeMaterials||=[];this.scene.add(this.previewTrees);this.previewTreeGeometry.push(g);this.previewTreeMaterials.push(mat);near.forEach((q,i)=>{matrix.makeRotationX(-Math.PI/2);matrix.setPosition(q.x,(p.z||0)*D.floorSpacing+.07,q.y);marks.setMatrixAt(i,matrix);});marks.renderOrder=24;this.previewTrees.add(marks);}
  if(result.protectedCells?.length){const g=new T.PlaneGeometry(.86,.86),mat=new T.MeshBasicMaterial({color:0xe68a5b,wireframe:true,depthTest:false}),marks=new T.InstancedMesh(g,mat,result.protectedCells.length);this.previewTrees||=new T.Group();this.previewTreeGeometry||=[];this.previewTreeMaterials||=[];this.scene.add(this.previewTrees);this.previewTreeGeometry.push(g);this.previewTreeMaterials.push(mat);result.protectedCells.forEach((p,i)=>{matrix.makeRotationX(-Math.PI/2);matrix.setPosition(p.x,z*D.floorSpacing+.07,p.y);marks.setMatrixAt(i,matrix);});marks.renderOrder=24;this.previewTrees.add(marks);}
  if(result.orientation&&cells.length){const x=cells.reduce((n,p)=>n+p.x,0)/cells.length,y=cells.reduce((n,p)=>n+p.y,0)/cells.length;this.previewArrow=new T.ArrowHelper(new T.Vector3(result.orientation[0],0,result.orientation[1]),new T.Vector3(x,z*D.floorSpacing+.12,y),1.6,0xffe5a5,.4,.25);for(const part of [this.previewArrow.line,this.previewArrow.cone]){part.material.depthTest=false;part.renderOrder=21;}this.scene.add(this.previewArrow);}
  this.highlight.material.color.setHex(result.ok?0xffe5a5:0xff6655);this.select(result.edges?.length?{type:'edge',edges:result.edges}:{cells});
 }
 clearMarkers(){for(const object of this.markers.children)if(object.isArrowHelper||object.type==='ArrowHelper'){object.line.material.dispose();object.cone.material.dispose();}this.markers.clear();}
 clearModels(){for(const m of this.models){m.root.removeFromParent();m.root.position.set(0,0,0);m.root.updateMatrixWorld(true);m.cap?.dispose();m.equipment?.dispose();m.paint.dispose();m.worker.skeleton.dispose();m.worker.dispose();}this.models=[];for(const m of this.dimMaterials.values())m.dispose();this.dimMaterials.clear();}
 dispose(){this.biomes.dispose();this.environmentPaint.dispose();this.sceneryAssets.dispose();this.sites.dispose();this.cliffs.dispose();this.lights.dispose();this.daylight.dispose();this.disposed=true;this.preview(null);this.generation++;this.clearModels();this.clearScenery();this.clearMarkers();this.cargo.dispose();for(const g of Object.values(this.geometry))g.dispose();for(const m of this.materials.values()){if(m.map!==this.foliageTexture)m.map.dispose();m.dispose();}this.foliageTexture?.dispose();this.highlight.geometry.dispose();this.highlight.material.dispose();this.markerGeo.dispose();this.guardMat.dispose();this.startMat.dispose();this.accessMat.dispose();this.renderer.dispose();}
}
