import * as T from './vendor/three.module.js';
import {screenSurface,SCREEN_CHUNK_SIZE} from './foliage-screen-surface.js';

// Larger overlapping leaf fans are still clipped to the unchanged per-cell
// finite sight envelope. The float map carries base, height and lobe radius.
function clippedFringe(source,plan,sharedMask){
 const data=sharedMask?.image.data||new Float32Array(plan.width*plan.depth*4);
 for(const s of plan.obstacles.screens)if(s.z===plan.level){const i=(s.y*plan.width+s.x)*4;data.set([s.base,s.height,s.lobes[2].radius[0],1],i);}
 const mask=sharedMask||new T.DataTexture(data,plan.width,plan.depth,T.RGBAFormat,T.FloatType);mask.unpackAlignment=1;mask.needsUpdate=true;
 const material=source.clone();material.onBeforeCompile=source.onBeforeCompile;material.customProgramCacheKey=source.customProgramCacheKey;const compile=material.onBeforeCompile,key=material.customProgramCacheKey();material.customProgramCacheKey=()=>key+'-finite-fringe-v1';
 material.onBeforeCompile=(s,r)=>{compile.call(material,s,r);s.uniforms.fringeEnvelope={value:mask};s.vertexShader='varying vec3 vFringeWorld;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\n vFringeWorld=(modelMatrix*vec4(transformed,1.)).xyz;`);s.fragmentShader='varying vec3 vFringeWorld;uniform sampler2D fringeEnvelope;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
 vec2 cell=floor(vFringeWorld.xz+.5),dim=vec2(${plan.width.toFixed(1)},${plan.depth.toFixed(1)});
 if(any(lessThan(cell,vec2(0.)))||any(greaterThanEqual(cell,dim)))discard;
 vec4 envelope=texture2D(fringeEnvelope,(cell+.5)/dim);if(envelope.a<.5)discard;
 vec2 offset=vFringeWorld.xz-cell;float radius=envelope.b,top=envelope.r+envelope.g-.75+.75*sqrt(max(0.,1.-dot(offset,offset)/(radius*radius)));
 if(vFringeWorld.y>top+.04)discard;
 if(vFringeWorld.y<envelope.r-.04)discard;
 `);};return {material,mask};
}

export function createFoliageScreens(plan,{plantMaterials,screenMaterials,decorate=m=>m}){
 const root=new T.Group(),instances=[],geometries=[],nearMeshes=[],farMeshes=[],distantMeshes=[],nearWood=[],farWood=[],fineStems=[],world=plan.obstacles,surface=screenSurface(plan);root.name='Painted foliage sight screens and solid deadfall';
 if(!surface.cells.length)return {root,screenCount:0,update(){},dispose(){root.removeFromParent();}};
 const fallback=plan.family==='wetlands'?plantMaterials.wet:plan.family==='jungle'?plantMaterials.jungle:plan.family==='snow'?plantMaterials.snow:plan.family==='dry'?plantMaterials.dry:plantMaterials.leaves;
 const sourceMaterial=decorate(screenMaterials?.[plan.family]||fallback),fringeClip=screenMaterials?.[plan.family+'Fringe']&&clippedFringe(decorate(screenMaterials[plan.family+'Fringe']),plan),fringe=fringeClip?.material,coreClip=fringeClip&&clippedFringe(sourceMaterial,plan,fringeClip.mask),material=coreClip?.material||sourceMaterial,rootClip=fringeClip&&clippedFringe(decorate(screenMaterials.woodFringe),plan,fringeClip.mask),bark=decorate(plantMaterials.bark),cylinder=new T.CylinderGeometry(.84,1,1,6),twig=new T.CylinderGeometry(.5,1,1,3,1,true),up=new T.Vector3(0,1,0),branchCard=new T.BufferGeometry();
 branchCard.setAttribute('position',new T.Float32BufferAttribute([-1,-.5,0,1,-.5,0,-.84,.5,0,.84,.5,0,0,-.5,-1,0,-.5,1,0,.5,-.84,0,.5,.84],3));branchCard.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1,1,1,0,0,1,0,0,1,1,1],2));branchCard.setIndex([0,1,2,2,1,3,4,6,5,5,6,7]);branchCard.computeVertexNormals();geometries.push(cylinder,twig,branchCard);
 const woodPaint=bark.clone();woodPaint.onBeforeCompile=bark.onBeforeCompile;woodPaint.customProgramCacheKey=bark.customProgramCacheKey;woodPaint.vertexColors=true;
 if(plan.family==='snow'){
  const compile=woodPaint.onBeforeCompile,key=woodPaint.customProgramCacheKey();woodPaint.customProgramCacheKey=()=>key+'-snow-deadfall-v1';
  woodPaint.onBeforeCompile=(s,r)=>{
   compile.call(woodPaint,s,r);
   s.vertexShader='varying vec3 vDeadfallWorld;varying float vDeadfallUp;\n'+s.vertexShader;
   s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    mat4 deadfallWorld=modelMatrix;
    #ifdef USE_INSTANCING
     deadfallWorld*=instanceMatrix;
    #endif
    mat3 deadfallBasis=mat3(deadfallWorld);vec3 deadfallNormal=normal/vec3(dot(deadfallBasis[0],deadfallBasis[0]),dot(deadfallBasis[1],deadfallBasis[1]),dot(deadfallBasis[2],deadfallBasis[2]));
    vDeadfallUp=normalize(deadfallBasis*deadfallNormal).y;vDeadfallWorld=(deadfallWorld*vec4(transformed,1.)).xyz;
   `);
   s.fragmentShader='varying vec3 vDeadfallWorld;varying float vDeadfallUp;\n'+s.fragmentShader;
   // Paint settles on upward-facing surfaces. The dark sides and ends still
   // communicate solid wood, including on the double-sided distant cards.
   s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float deadfallSnow=smoothstep(.12,.75,gl_FrontFacing?vDeadfallUp:-vDeadfallUp),snowGrain=.85+.15*sin(vDeadfallWorld.x*4.7+sin(vDeadfallWorld.z*3.1));
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.40,.45,.42)*snowGrain,deadfallSnow*.90);
   `);
  };
 }
 // Weathered ends should recede into the root tangle, not read as pale sawn
 // timber. This paint adjustment does not move or enlarge any cover branch.
 for(const g of [cylinder,branchCard]){const colors=[];for(let i=0;i<g.attributes.position.count;i++){const value=Math.abs(g.attributes.normal.getY(i))>.9?.48:1;colors.push(value,value,value);}g.setAttribute('color',new T.Float32BufferAttribute(colors,3));}
 const woodTone=new T.Color(...({wetlands:[.29,.34,.28],jungle:[.32,.36,.28],temperate:[.38,.38,.31],dry:[.44,.40,.32],snow:[.42,.43,.40]}[plan.family]||[.38,.38,.31]));
 // Both solid plant lobes and cutout boughs share the exact finite tile mask.
 // Fog is chained through decorate, and each 24x24 chunk can be culled.
 for(const g of surface.chunks){
  if(g.index.length){const geometry=new T.BufferGeometry();for(const [name,array,size]of [['position',g.position,3],['normal',g.normal,3],['uv',g.uv,2],['color',g.color,3]])geometry.setAttribute(name,new T.Float32BufferAttribute(array,size));geometry.setIndex(g.index);geometry.computeBoundingBox();geometry.computeBoundingSphere();geometries.push(geometry);
  const mesh=new T.Mesh(geometry,material);mesh.name=(plan.family==='snow'?'Snow bed ':'Rooted shrub leaves ')+g.key;mesh.receiveShadow=true;mesh.userData.screenShadow=true;root.add(mesh);}
  for(const [data,paint,list]of [[g.fringe,fringe,nearMeshes],[g.far,fringe,farMeshes],[g.distant,fringe,distantMeshes]])if(paint&&data.index.length){const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(data.position,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));geometry.setIndex(data.index);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();geometries.push(geometry);const mesh=new T.Mesh(geometry,paint);mesh.receiveShadow=true;mesh.visible=list===nearMeshes;list.push(mesh);root.add(mesh);}
  if(rootClip&&g.roots?.index.length){const data=g.roots,geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(data.position,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));geometry.setIndex(data.index);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();geometries.push(geometry);const mesh=new T.Mesh(geometry,rootClip.material);mesh.receiveShadow=true;mesh.name='Fine rooted twigs '+g.key;root.add(mesh);}
 }
 const wood=new Map(),supports=new Map(),branches=new Map();
 for(const w of world.wood)if(w.source.z===plan.level&&w.family===plan.family){
  const s={x:w.source.x,y:w.source.y,base:plan.heightAt(w.source.x,w.source.y)};
  const key=`${Math.floor(s.x/SCREEN_CHUNK_SIZE)},${Math.floor(s.y/SCREEN_CHUNK_SIZE)}`;if(!wood.has(key))wood.set(key,[]);
  const {a,b,radius}=w.beam,v=new T.Vector3(...b).sub(new T.Vector3(...a));wood.get(key).push(new T.Matrix4().compose(new T.Vector3(...a).add(new T.Vector3(...b)).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(up,v.clone().normalize()),new T.Vector3(radius,v.length(),radius)));
  const id=s.x+','+s.y;if(!branches.has(id))branches.set(id,{s,key,beams:[]});branches.get(id).beams.push(w.beam);
 }
 for(const {s,key,beams}of branches.values()){
  if(!supports.has(key))supports.set(key,[]);
  // One asymmetric, crooked fine-stem network roots the two existing boughs.
  // Maximum diameter .06 is deliberately below substantial wood cover.
  const centers=beams.map(b=>new T.Vector3(...b.a).add(new T.Vector3(...b.b)).multiplyScalar(.5)).sort((a,b)=>a.y-b.y),angle=Math.atan2(beams[0].b[2]-beams[0].a[2],beams[0].b[0]-beams[0].a[0]);
  const foot=new T.Vector3(s.x+Math.sin(angle)*.22,s.base+.015,s.y-Math.cos(angle)*.22),joint=centers[0].clone().lerp(centers[1],.55).add(new T.Vector3(Math.sin(angle)*.13,0,-Math.cos(angle)*.13));
  const points=[foot,centers[0],joint,centers[1]];
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],delta=b.clone().sub(a);supports.get(key).push(new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(up,delta.clone().normalize()),new T.Vector3(.03,delta.length(),.03)));}
 }
 for(const matrices of wood.values())for(const [geometry,list,name]of [[cylinder,nearWood,'Solid cover boughs'],[branchCard,farWood,'Distant cover boughs']]){const mesh=new T.InstancedMesh(geometry,woodPaint,matrices.length);matrices.forEach((m,i)=>{mesh.setMatrixAt(i,m);mesh.setColorAt(i,woodTone);});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.receiveShadow=true;mesh.name=name;mesh.visible=list===nearWood;root.add(mesh);instances.push(mesh);list.push(mesh);}
 for(const matrices of supports.values()){const mesh=new T.InstancedMesh(twig,bark,matrices.length);matrices.forEach((m,i)=>{mesh.setMatrixAt(i,m);mesh.setColorAt(i,woodTone);});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.receiveShadow=true;mesh.name='Rooted fine branch supports';root.add(mesh);instances.push(mesh);fineStems.push(mesh);}
 for(const m of [...nearWood,...farWood])m.userData.screenShadow=true;
 const meshes=[];root.traverse(o=>{if(o.isMesh){o.userData.screenKnown=true;o.userData.shadowKnown=true;meshes.push(o);}});
 const bounds=m=>m.isInstancedMesh?m.boundingBox:m.geometry.boundingBox,near=(m,focus,range)=>!focus||bounds(m).distanceToPoint(focus)<range;
 root.userData.ownedTextureBytes=fringeClip?plan.width*plan.depth*16:0;
 return {root,screenCount:surface.cells.length,setVisibility(anyKnown,allKnown=anyKnown){for(const m of meshes){m.userData.screenKnown=anyKnown(bounds(m));m.userData.shadowKnown=allKnown(bounds(m));if(!m.userData.screenKnown)m.visible=false;}},update(ppu,focus,{shadowDetail='proxy'}={}){
  for(const m of meshes)m.visible=m.userData.screenKnown;
  const detail=m=>ppu>=18&&near(m,focus,36)?0:ppu>=9&&near(m,focus,84)?1:2;
  for(const [list,lod]of [[nearMeshes,0],[farMeshes,1],[distantMeshes,2]])for(const m of list)m.visible=m.userData.screenKnown&&detail(m)===lod;
  for(const m of nearWood)m.visible=m.userData.screenKnown&&ppu>=18&&near(m,focus,18);
  for(const m of farWood)m.visible=m.userData.screenKnown&&!(ppu>=18&&near(m,focus,18));
  for(const m of fineStems)m.visible=m.userData.screenKnown&&ppu>=18&&near(m,focus,18);
  // The existing solid leaf lobes and substantial boughs own nearby shadows.
  // Fine overlapping cards and twigs remain in color, without multiplying the
  // same thicket across all six faces of every local-light shadow map.
  for(const m of meshes){m.castShadow=m.visible&&m.userData.shadowKnown&&(shadowDetail==='full'||ppu>12&&near(m,focus,28)&&!!m.userData.screenShadow);m.userData.noShadow=!m.castShadow;}
 },dispose(){root.removeFromParent();for(const m of instances)m.dispose();for(const g of geometries)g.dispose();fringeClip?.material.dispose();coreClip?.material.dispose();rootClip?.material.dispose();woodPaint.dispose();fringeClip?.mask.dispose();}};
}
