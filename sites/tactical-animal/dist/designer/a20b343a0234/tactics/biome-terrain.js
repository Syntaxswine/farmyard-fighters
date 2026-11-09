import * as T from './vendor/three.module.js';
import {BIOME_FAMILIES} from './biome-foliage-data.js';
import {biomeTreeModels,selectBiomeTree} from './biome-tree-mix.js';
import {BIOME_OBSTACLES,CELL_EDGES} from './biome-obstacle-data.js';
import {random,field,createTerrainFill} from './biome-terrain-fill.js';
import {createConnectedGroundSkin} from './biome-connected-ground.js';

export const BIOME_CHUNK_SIZE=24;
const quad=(a,b,c,d,out)=>out.push(...a,...c,...b,...a,...d,...c);
const triangles=o=>(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);
// Exposed edges stay inside the authoritative mask. Bank offsets vary along the
// region, rather than repeating three identical scallops on every tile.
export function terrainCellOutline(plan,x,z){
 const h=plan.heightAt(x,z),outside=CELL_EDGES.map(e=>!plan.blockedAt(x+e.dx,z+e.dz)||plan.heightAt(x+e.dx,z+e.dz)!==h),corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]],points=[];
 for(let i=0;i<4;i++){
  const p=corners[i],before=corners[(i+3)%4],next=corners[(i+1)%4],clip=outside[i]&&outside[(i+3)%4],adjacentClip=outside[(i+2)%4]||outside[(i+1)%4],cut=adjacentClip?.38+.07*field(x+p[0],z+p[1],3.1,56):.90+.09*field(x+p[0],z+p[1],3.1,56);
  if(clip){points.push([x+p[0]+(before[0]-p[0])*cut,z+p[1]+(before[1]-p[1])*cut]);points.push([x+p[0]+(next[0]-p[0])*cut,z+p[1]+(next[1]-p[1])*cut]);}else {
   // Shared shoreline vertices use the same global four-cell neighborhood.
   // A straight shore gets a broad bend, never a notch in every tile.
   const u=x+p[0],v=z+p[1],occupied=[];for(const dz of [-.5,.5])for(const dx of [-.5,.5])if(plan.blockedAt(u+dx,v+dz)&&plan.heightAt(u+dx,v+dz)===h)occupied.push([dx,dz]);
   const sx=occupied.reduce((n,a)=>n+a[0],0),sz=occupied.reduce((n,a)=>n+a[1],0),amount=.035+.17*field(u,v,3.8,94);
   points.push(occupied.length===2?[u+sx*amount,v+sz*amount]:[u,v]);
  }
 }
 return {points,outside};
}
function geometry(positions,colors,normals){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));if(colors)g.setAttribute('color',new T.Float32BufferAttribute(colors,3));if(normals)g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));else g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;}

export function createBiomeTerrain(plan,family,{ground,cliff,surfaceMaterial,plantMaterials,obstacleMaterials,plantFactory,grey=false,groundSprites=true,paintSeed,onPaintReady,edgeBlend=true,fill:providedFill,groundSkinOptions={},decorateMaterial=m=>m}){
 if(!BIOME_OBSTACLES[family])throw Error('Unknown terrain biome');
 const root=new T.Group(),owned=new Set(),instances=[],treeInstances=[],chunks=[],denseMeshes=[],groundMeshes=[],trees=[],fill=providedFill||createTerrainFill(plan,family,{softEdge:edgeBlend}),bog=family==='wetlands',snow=family==='snow';root.name='Spatial biome terrain';
 const own=g=>(owned.add(g),g),crown=own(new T.SphereGeometry(.5,8,4)),proxyCrown=own(new T.IcosahedronGeometry(.5,0)),trunk=own(new T.CylinderGeometry(.5,.5,1,5)),cone=own(new T.ConeGeometry(.5,1,6)),rimMaterial=new T.LineBasicMaterial({color:0x5f513c});
 const original=grey?plantMaterials.grey:snow?plantMaterials.snow:obstacleMaterials[BIOME_OBSTACLES[family].paint],fillMaterial=(surfaceMaterial||original).clone();fillMaterial.onBeforeCompile=(surfaceMaterial||original).onBeforeCompile;fillMaterial.customProgramCacheKey=(surfaceMaterial||original).customProgramCacheKey;fillMaterial.vertexColors=true;
 const groundSkin=createConnectedGroundSkin(plan,family,{seed:paintSeed,onChange:onPaintReady,underlay:ground,edgeBlend,...groundSkinOptions,...(grey?{canvasFactory:()=>null}:{})}),fillMaterials=[];groundSkin.setEnabled(groundSprites);
 const leaf=family==='jungle'?'jungle':family==='temperate'?'leaves':snow?'snow':'dry',paint=id=>grey?plantMaterials.grey:(plantMaterials[id]||obstacleMaterials[id]),object=new T.Object3D();
 // Detailed crowns stay in the color pass. Shadows use the existing bounded
 // crown/trunk silhouettes; no movement, cover or sight geometry is replaced.
 const shadowMaterial=new T.MeshBasicMaterial({colorWrite:false,depthWrite:false,depthTest:false,side:T.DoubleSide});
 const cols=Math.ceil(plan.width/BIOME_CHUNK_SIZE);
 for(let z=0;z<plan.depth;z+=BIOME_CHUNK_SIZE)for(let x=0;x<plan.width;x+=BIOME_CHUNK_SIZE){
  const group=new T.Group(),near=new T.Group(),far=new T.Group(),shadows=new T.Group();group.name=`Biome block ${x},${z}`;near.name='Detailed trees';far.name='Distant tree silhouettes';shadows.name='Tree shadow silhouettes';group.add(near,far,shadows);root.add(group);
  chunks.push({x,z,index:chunks.length,group,near,far,shadows,baseBatches:new Map(),nearBatches:new Map(),farBatches:new Map(),meshes:[],dense:null,nearActive:false});near.visible=false;
 }
 const chunkAt=(x,z)=>chunks[Math.floor(z/BIOME_CHUNK_SIZE)*cols+Math.floor(x/BIOME_CHUNK_SIZE)];
 function mesh(positions,material,name,chunk,colors,normals){if(!positions.length)return null;const m=new T.Mesh(own(geometry(positions,colors,normals)),material);m.name=name;m.receiveShadow=true;m.userData.chunk=chunk.index;chunk.group.add(m);chunk.meshes.push(m);return m;}
 function batch(chunk,level,g,m,matrix){const map=chunk[level+'Batches'],key=g.uuid+':'+m.uuid;if(!map.has(key))map.set(key,{g,m,matrices:[]});map.get(key).matrices.push(matrix.clone());}
 function part(chunk,level,g,m,x,y,z,sx,sy,sz,yaw=0){object.position.set(x,y,z);object.rotation.set(0,yaw,0);object.scale.set(sx,sy,sz);object.updateMatrix();batch(chunk,level,g,m,object.matrix);}
 function safe(cx,cz,rx,rz,h){for(let z=Math.floor(cz-rz+.5);z<=Math.floor(cz+rz+.5);z++)for(let x=Math.floor(cx-rx+.5);x<=Math.floor(cx+rx+.5);x++)if(!plan.blockedAt(x,z)||plan.heightAt(x,z)!==h)return false;return true;}
 // Per-chunk ground, cliff and continuous fill. Surface normals are sampled in
 // world coordinates so snow remains smooth across both tiles and render blocks.
 for(const chunk of chunks){
  const groundPositions=[],walls=[],wallColors=[],dense=[],normals=[],colors=[],edges=[];
  function surface(points,h){for(const [u,v]of points){dense.push(u,h+fill.height(u,v),v);normals.push(...fill.normal(u,v));colors.push(...(grey?[1,1,1]:fill.color(u,v)));}}
  for(let z=chunk.z;z<Math.min(chunk.z+BIOME_CHUNK_SIZE,plan.depth);z++)for(let x=chunk.x;x<Math.min(chunk.x+BIOME_CHUNK_SIZE,plan.width);x++){
   if(plan.includeAt&&!plan.includeAt(x,z))continue;
   const h=plan.heightAt(x,z),corners=[[x-.5,z-.5],[x+.5,z-.5],[x+.5,z+.5],[x-.5,z+.5]];quad(...corners.map(([u,v])=>[u,h,v]),groundPositions);
   if(cliff)for(let i=0;i<4;i++){const e=CELL_EDGES[i],nh=plan.heightAt(x+e.dx,z+e.dz),a=corners[i],b=corners[(i+1)%4];if(nh!==null&&nh<h){quad([a[0],nh,a[1]],[b[0],nh,b[1]],[b[0],h,b[1]],[a[0],h,a[1]],walls);for(let j=0;j<6;j++)wallColors.push(.63,.58,.46);edges.push(a[0],h+.012,a[1],b[0],h+.012,b[1]);}}
   if(groundSkin.edgeField?.fringe[z*plan.width+x])chunk.fringe=true;
   if(!plan.blockedAt(x,z))continue;const outline=terrainCellOutline(plan,x,z),p=outline.points;
   if(!outline.outside.some(Boolean)){surface([p[0],p[2],p[1],p[0],p[3],p[2]],h);}else{
    for(let i=0;i<p.length;i++)surface([[x,z],p[(i+1)%p.length],p[i]],h);
    // Only exposed edges need skirts; shared seams must not acquire vertical walls.
    for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],exposed=!((a[0]===b[0]&&((a[0]===x-.5&&!outline.outside[3])||(a[0]===x+.5&&!outline.outside[1])))||(a[1]===b[1]&&((a[1]===z-.5&&!outline.outside[0])||(a[1]===z+.5&&!outline.outside[2]))));if(!exposed)continue;
     const side=[];quad([a[0],h,a[1]],[b[0],h,b[1]],[b[0],h+fill.height(...b),b[1]],[a[0],h+fill.height(...a),a[1]],side);dense.push(...side);const nx=b[1]-a[1],nz=a[0]-b[0],len=Math.hypot(nx,nz);for(let j=0;j<6;j++){
      // The tapered toe shares the surface's paint and lighting. A separate
      // vertical normal here would draw a dark, manufactured-looking trim.
      const point=[side[j*3],side[j*3+2]];normals.push(...(edgeBlend?fill.normal(...point):[nx/len,0,nz/len]));colors.push(...(grey?[1,1,1]:fill.color(...(edgeBlend?point:mid))));
     }
    }
   }
  }
  const pathMaterial=ground.clone();pathMaterial.onBeforeCompile=ground.onBeforeCompile;pathMaterial.customProgramCacheKey=ground.customProgramCacheKey;fillMaterials.push(pathMaterial);groundSkin.attach(pathMaterial,chunk,{layer:'path'});decorateMaterial(pathMaterial,'ground');
  groundMeshes.push(mesh(groundPositions,pathMaterial,'Saved tutorial terrain',chunk));mesh(walls,cliff,'Two plateau tiers',chunk,wallColors);
  if(dense.length){const m=fillMaterial.clone();m.onBeforeCompile=fillMaterial.onBeforeCompile;m.customProgramCacheKey=fillMaterial.customProgramCacheKey;fillMaterials.push(m);groundSkin.attach(m,chunk);decorateMaterial(m,'cover');chunk.dense=mesh(dense,m,'Continuous impassable ground',chunk,colors,normals);denseMeshes.push(chunk.dense);}
  if(edges.length){const g=own(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(edges,3)));g.computeBoundingSphere();const rims=new T.LineSegments(g,rimMaterial);rims.userData.chunk=chunk.index;chunk.group.add(rims);}
 }
 let clusters=0,logs=0,reeds=0;const lowPlants=BIOME_FAMILIES[family].low.map(id=>plantFactory.create(id,{grey}));
 // Sparse multi-tile canopy islands. Fallen wood now lives in the base paint;
 // broad continuous drifts do all of the snow's volume work.
 const step=bog?2.7:snow?5.7:3.7;
 for(let z=1;z<plan.depth-1;z+=step)for(let x=1;x<plan.width-1;x+=step){
  const n=Math.round(x*191+z*631)+(plan.seed||0)+(plan.origin?.[0]||0)*191+(plan.origin?.[1]||0)*631,cx=x+(random(n)-.5)*step,cz=z+(random(n+1)-.5)*step,ix=Math.floor(cx+.5),iz=Math.floor(cz+.5),h=plan.heightAt(ix,iz);if(!plan.blockedAt(ix,iz))continue;
  if(plan.includeAt&&!plan.includeAt(ix,iz)||plan.densityAt&&random(n+57)>plan.densityAt(ix,iz))continue;
  const chunk=chunkAt(ix,iz),d=fill.distance(cx,cz),patch=field(cx,cz,9,306),peatIsland=bog&&groundSkin.landAt(cx,cz)>.78;
  if(!snow&&random(n+120)<.43){const plant=lowPlants[Math.floor(random(n+123)*lowPlants.length)],pb=plant.userData.bounds,scale=1.35;
   if(safe(cx,cz,Math.max(Math.abs(pb.min[0]),pb.max[0])*scale,Math.max(Math.abs(pb.min[2]),pb.max[2])*scale,h)&&(!bog||d<2||peatIsland)){
    plant.updateMatrixWorld(true);const transform=new T.Matrix4().makeTranslation(cx,h+fill.height(cx,cz)-.025,cz).scale(new T.Vector3(scale,scale,scale));plant.traverse(m=>{if(m.isMesh)batch(chunk,'base',m.geometry,m.material,new T.Matrix4().multiplyMatrices(transform,m.matrixWorld));});
   }
  }
  if(bog){
   // Sparse reeds mark saturated banks and soft islands among the open water.
   if((d>1.5&&!peatIsland)||patch<.53||!safe(cx,cz,.42,.42,h))continue;
   part(chunk,'base',crown,paint('peat'),cx,h+.035,cz,.80,.10,.72);
   for(let j=0;j<5+Math.floor(random(n+9)*8);j++){const u=cx+(random(n+j*9)-.5)*.58,v=cz+(random(n+j*11)-.5)*.58,height=.40+random(n+j*17)*.8;part(chunk,'base',trunk,paint(j%3?'moss':'straw'),u,h+height/2,v,.027,height,.027);reeds++;}clusters++;continue;
  }
  if(!snow&&patch>.26){
   const sx=1.9+random(n+19)*3.4,sz=1.1+random(n+30)*2.2,yaw=random(n+37)*Math.PI,rx=(Math.abs(Math.cos(yaw))*sx+Math.abs(Math.sin(yaw))*sz)/2,rz=(Math.abs(Math.sin(yaw))*sx+Math.abs(Math.cos(yaw))*sz)/2;
   if(safe(cx,cz,rx,rz,h)){const sy=(family==='jungle'?1.2:.75)+random(n+50)*.9,material=paint(patch>.44?leaf:BIOME_OBSTACLES[family].paint);part(chunk,'base',crown,material,cx,h+fill.height(cx,cz)+sy*.13,cz,sx,sy,sz,yaw);clusters++;}
  }
 }
 // Crown-safe placement is unchanged: complete projected bounds lie inside
 // blocked cells at one height. A cheap second representation serves overview.
 const prototypes=[],world=new T.Matrix4(),translation=new T.Matrix4();
 for(const id of biomeTreeModels(family))for(let variant=0;variant<3;variant++)prototypes.push(plantFactory.create(id,{variant,mature:true,grey}));
 const treeStep=bog?10:family==='dry'?5:3.6,treeCandidates=[];
 if(plan.trees){for(const t of plan.trees)if(t.dense)treeCandidates.push({cx:t.x,cz:t.y,h:t.base,p:prototypes.find(p=>p.userData.id===t.id&&p.userData.variant===t.variant)});}
 else for(let z=3;z<plan.depth-3;z+=treeStep)for(let x=3;x<plan.width-3;x+=treeStep){
  const n=Math.round(z*plan.width+x)+(plan.seed||0)+(plan.origin?.[0]||0)+(plan.origin?.[1]||0)*plan.width,spec=selectBiomeTree(family,Math.round(x)+(plan.origin?.[0]||0),Math.round(z)+(plan.origin?.[1]||0),plan.seed||0),p=prototypes.find(p=>p.userData.id===spec.id&&p.userData.variant===spec.variant),bounds=p.userData.bounds,cx=x+(random(n+3)-.5)*2.2,cz=z+(random(n+7)-.5)*2.2,h=plan.heightAt(Math.floor(cx+.5),Math.floor(cz+.5));
  if(plan.includeAt&&!plan.includeAt(Math.floor(cx+.5),Math.floor(cz+.5))||plan.densityAt&&random(n+57)>plan.densityAt(Math.floor(cx+.5),Math.floor(cz+.5)))continue;
  if(random(n+17)<(bog?.40:family==='dry'?.28:.08))continue;
  if(!safe(cx+(bounds.min[0]+bounds.max[0])/2,cz+(bounds.min[2]+bounds.max[2])/2,(bounds.max[0]-bounds.min[0])/2,(bounds.max[2]-bounds.min[2])/2,h))continue;
  treeCandidates.push({cx,cz,h,p});
 }
 for(const {cx,cz,h,p} of treeCandidates){
  const bounds=p.userData.bounds,min=[cx+bounds.min[0],h,cz+bounds.min[2]],max=[cx+bounds.max[0],h+bounds.max[1],cz+bounds.max[2]];
  trees.push({id:p.userData.id,x:cx,y:h,z:cz,bounds:{min,max}});const chunk=chunkAt(Math.floor(cx+.5),Math.floor(cz+.5));p.updateMatrixWorld(true);translation.makeTranslation(cx,h,cz);
  p.traverse(m=>{if(!m.isMesh)return;world.multiplyMatrices(translation,m.matrixWorld);batch(chunk,'near',m.geometry,m.material,world);});
  const width=max[0]-min[0],depth=max[2]-min[2],height=max[1]-min[1],px=(min[0]+max[0])/2,pz=(min[2]+max[2])/2,pine=/pine|spruce|cypress/.test(p.userData.id),flat=/acacia|palm/.test(p.userData.id);
  chunk.treeHeight=Math.max(chunk.treeHeight||0,height);
  part(chunk,'far',trunk,paint('bark'),cx,h+height*.33,cz,.16,height*.66,.16);
  const treePaint=p.userData.materials.find(id=>id!=='bark'&&id!=='moss')||leaf;
  if(pine){for(let i=0;i<3;i++){const s=1-i*.25;part(chunk,'far',cone,paint(treePaint),px,h+height*(.36+i*.20),pz,width*s,height*.47,depth*s);}}
  else {part(chunk,'far',proxyCrown,paint(treePaint),px,h+height*(flat?.82:.65),pz,width,height*(flat?.30:.69),depth);part(chunk,'far',proxyCrown,paint(treePaint),px-width*.16,h+height*(flat?.82:.80),pz,width*.61,height*(flat?.27:.37),depth*.68);}
 }
 for(const chunk of chunks){
  for(const level of ['base','near','far'])for(const spec of chunk[level+'Batches'].values()){
   const m=new T.InstancedMesh(spec.g,spec.m,spec.matrices.length);spec.matrices.forEach((matrix,i)=>m.setMatrixAt(i,matrix));m.instanceMatrix.needsUpdate=true;m.computeBoundingBox();m.computeBoundingSphere();m.name=level==='base'?'Grouped ground cover':level==='near'?'Trees':'Distant trees';m.receiveShadow=true;m.userData.chunk=chunk.index;(level==='base'?chunk.group:chunk[level]).add(m);instances.push(m);if(level!=='base')treeInstances.push(m);chunk.meshes.push(m);
   if(level==='far'){
    const shadow=new T.InstancedMesh(spec.g,shadowMaterial,spec.matrices.length);spec.matrices.forEach((matrix,i)=>shadow.setMatrixAt(i,matrix));shadow.instanceMatrix.needsUpdate=true;shadow.computeBoundingBox();shadow.computeBoundingSphere();shadow.name='Tree shadow proxy';shadow.userData.shadowProxy=true;shadow.userData.chunk=chunk.index;chunk.shadows.add(shadow);instances.push(shadow);treeInstances.push(shadow);chunk.meshes.push(shadow);
   }
  }
  // Include crown height/overhang in bounds; culling a ground square alone can
  // incorrectly hide a visible treetop at a screen edge.
  chunk.bounds=new T.Box3().setFromObject(chunk.group);chunk.baseBatches.clear();chunk.nearBatches.clear();chunk.farBatches.clear();
 }
 let fullTriangles=0,baseTriangles=0;root.traverse(o=>{if(o.isMesh){fullTriangles+=triangles(o);if(!o.isInstancedMesh)baseTriangles+=triangles(o);}});
 const stats={terrainCells:plan.width*plan.depth,blockedCells:plan.cells.length,trees:trees.length,clusters,logs,reeds,groundSprites:groundSkin?.stats??null,baseTriangles,storedTriangles:fullTriangles,batches:instances.length,chunks:chunks.length,chunkSize:BIOME_CHUNK_SIZE};
 const frustum=new T.Frustum(),projection=new T.Matrix4(),worldBounds=new T.Box3();let disposed=false;
 function update(camera,{focus,ppu=1,trees:showTrees=true,shadowDetail='proxy'}={}){
  if(disposed)return;camera.updateMatrixWorld();frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));let visible=0,detailed=0,shadowed=0;
  root.updateMatrixWorld(true);const localFocus=root.worldToLocal(focus?.clone()??new T.Vector3()),fx=localFocus.x,fz=localFocus.z;
  for(const c of chunks){
   const dx=Math.max(c.x-.5-fx,0,fx-(c.x+BIOME_CHUNK_SIZE-.5)),dz=Math.max(c.z-.5-fz,0,fz-(c.z+BIOME_CHUNK_SIZE-.5)),distance=Math.hypot(dx,dz);
   const inView=frustum.intersectsBox(worldBounds.copy(c.bounds).applyMatrix4(root.matrixWorld));c.inView=inView;c.distance=distance;
   // Orthographic distance does not shrink a visible tree. Keep every visible
   // block detailed at close scale, including the far edge of a low-angle view.
   const treePixels=ppu*(c.treeHeight||0);
   c.nearActive=treePixels>(c.nearActive?22:26)&&(inView||distance<(c.nearActive?52:44));const shadows=ppu>12&&distance<28;
   c.group.visible=inView||shadows;c.near.visible=showTrees&&c.nearActive;c.far.visible=showTrees&&!c.nearActive;
   c.shadows.visible=showTrees&&shadows&&c.shadowKnown!==false&&shadowDetail==='proxy';
   for(const m of c.meshes){const allowed=shadowDetail==='full'?!m.userData.shadowProxy&&m.name!=='Distant trees':m.userData.shadowProxy||!m.isInstancedMesh;m.castShadow=shadows&&c.shadowKnown!==false&&allowed&&m.name!=='Saved tutorial terrain';m.userData.noShadow=!m.castShadow;}
   if(inView){visible++;if(c.near.visible)detailed++;}if(shadows)shadowed++;
  }
  groundSkin.update(chunks,localFocus,ppu);stats.groundSprites=groundSkin.stats;
  root.updateMatrixWorld(true);let visibleTriangles=0,visibleBatches=0;root.traverseVisible(o=>{if(o.isMesh&&!o.userData.shadowProxy&&frustum.intersectsObject(o)){visibleTriangles+=triangles(o);visibleBatches++;}});
  Object.assign(stats,{visibleChunks:visible,detailedChunks:detailed,shadowChunks:shadowed,visibleTriangles,visibleBatches});return stats;
 }
 return {root,chunks,denseMeshes,groundMeshes,trees,treeInstances,fill,groundSkin,stats,update,coversGround:(x,z)=>(!plan.includeAt||plan.includeAt(x,z))&&plan.heightAt(x,z)===0,dispose(){if(disposed)return;disposed=true;root.removeFromParent();instances.forEach(m=>m.dispose());owned.forEach(g=>g.dispose());fillMaterials.forEach(m=>m.dispose());fillMaterial.dispose();shadowMaterial.dispose();groundSkin?.dispose();rimMaterial.dispose();}};
}
