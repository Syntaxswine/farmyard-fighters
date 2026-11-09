import * as T from './vendor/three.module.js';

export const XRAY_DIAMETER_TILES=5;
export const XRAY_FEATHER_RADIUS=2/3;
export const xrayWall=box=>box.kind==='wall'||box.kind==='roof'&&!!box.id?.includes(':parapet:');
export const surfaceLevel=box=>box.source.z??Number(box.source.edge?.split(':')[3]||0);
// Walls on the selected floor open; its supporting floor stays solid. Slabs,
// roofs and fog above it open too, without revealing undiscovered contents.
export function xrayThroughLevel(box){
 const z=surfaceLevel(box);
 return xrayWall(box)?z:['floor','roof'].includes(box.kind)&&z>0?z-1:null;
}
// Screen-space circle, measured in projected world units, so it follows the
// pointer even when it is over a tall wall rather than the ground plane.
export const xrayRadius=zoom=>XRAY_DIAMETER_TILES*.5*28*Math.sqrt(2)*zoom;
export const xrayOuterRadius=zoom=>xrayRadius(zoom)*(1+XRAY_FEATHER_RADIUS);
const declarations='uniform vec2 xrayCenter;\nuniform float xrayRadius;\nuniform float xrayOuterRadius;\nuniform bool xrayActive;\nuniform float xraySelectedLevel;\nfloat xraySurfaceOpacity(){return smoothstep(xrayRadius,xrayOuterRadius,distance(gl_FragCoord.xy,xrayCenter));}\n';

export class WallXray {
 constructor(){
  this.uniforms={xrayCenter:{value:new T.Vector2()},xrayRadius:{value:0},xrayOuterRadius:{value:0},xrayActive:{value:false},xraySelectedLevel:{value:0}};
  this.materials=new Map();this.overlays=new Map();this.pointer=null;
  this.wireMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
   uniforms:this.uniforms,
   vertexShader:'attribute mat4 wallMatrix; attribute vec3 wallColor; attribute float wallLevel; varying vec3 wireColor; varying float wireLevel; void main(){wireColor=wallColor;wireLevel=wallLevel;gl_Position=projectionMatrix*modelViewMatrix*wallMatrix*vec4(position,1.);}',
   fragmentShader:declarations+'varying vec3 wireColor; varying float wireLevel; void main(){if(!xrayActive||xraySelectedLevel>wireLevel)discard;float reveal=1.-xraySurfaceOpacity();if(reveal<=0.)discard;gl_FragColor=vec4(wireColor,.34*reveal);}'});
 }
 setPointer(x,y){this.pointer=Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;}
 update(width,height,zoom,pixelRatio=1,level=0){
  const p=this.pointer;this.uniforms.xrayActive.value=!!p&&p.x>=0&&p.y>=0&&p.x<width&&p.y<height;
  this.uniforms.xrayCenter.value.set((p?.x||0)*pixelRatio,(height-(p?.y||0))*pixelRatio);
  this.uniforms.xrayRadius.value=xrayRadius(zoom)*pixelRatio;
  this.uniforms.xrayOuterRadius.value=xrayOuterRadius(zoom)*pixelRatio;
  this.uniforms.xraySelectedLevel.value=level;
  for(const [mesh,wire]of this.overlays)wire.visible=this.uniforms.xrayActive.value&&mesh.userData.boxes.some(b=>surfaceLevel(b)>=level);
 }
 material(source,throughLevel=3){
  if(!this.materials.has(source))this.materials.set(source,new Map());
  const variants=this.materials.get(source);if(variants.has(throughLevel))return variants.get(throughLevel);
  const material=source.clone(),compile=source.onBeforeCompile,key=source.customProgramCacheKey();
  // Retain depth writes for solid walls outside the feather and below the
  // selected level. The original clear centre still discards depth entirely.
  material.transparent=true;
  material.onBeforeCompile=(shader,renderer)=>{compile.call(material,shader,renderer);Object.assign(shader.uniforms,this.uniforms,{xrayThroughLevel:{value:throughLevel}});shader.fragmentShader=declarations+'uniform float xrayThroughLevel;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat cursorXrayOpacity=xrayActive&&xraySelectedLevel<=xrayThroughLevel?xraySurfaceOpacity():1.;\nif(cursorXrayOpacity<=0.)discard;').replace('#include <opaque_fragment>','#include <opaque_fragment>\ngl_FragColor.a*=cursorXrayOpacity;');};
  material.customProgramCacheKey=()=>key+'-cursor-level-xray-v3';variants.set(throughLevel,material);return material;
 }
 sync(chunks){
  const keep=new Set(chunks.values());
  for(const [mesh,wire]of this.overlays)if(!keep.has(mesh)){wire.removeFromParent();wire.geometry.dispose();this.overlays.delete(mesh);}
  for(const mesh of keep){
   if(!mesh.userData.boxes?.every(xrayWall)||this.overlays.has(mesh))continue;
   const edges=new T.EdgesGeometry(mesh.geometry),geometry=new T.InstancedBufferGeometry();geometry.setAttribute('position',edges.getAttribute('position').clone());edges.dispose();
   geometry.setAttribute('wallMatrix',new T.InstancedBufferAttribute(mesh.instanceMatrix.array.slice(),16));geometry.instanceCount=mesh.count;
   geometry.setAttribute('wallColor',new T.InstancedBufferAttribute(new Float32Array(mesh.userData.boxes.flatMap(b=>b.id.includes(':door')?[1,.76,.36]:[.79,.86,.76])),3));
   geometry.setAttribute('wallLevel',new T.InstancedBufferAttribute(new Float32Array(mesh.userData.boxes.map(surfaceLevel)),1));
   geometry.boundingSphere=mesh.boundingSphere.clone();
   const wire=new T.LineSegments(geometry,this.wireMaterial);wire.name='cursor-wall-wire';wire.userData.noShadow=true;wire.raycast=()=>{};
   mesh.add(wire);this.overlays.set(mesh,wire);
  }
 }
 dispose(){for(const wire of this.overlays.values()){wire.removeFromParent();wire.geometry.dispose();}this.overlays.clear();for(const variants of this.materials.values())for(const m of variants.values())m.dispose();this.materials.clear();this.wireMaterial.dispose();}
}

// Rendering discards only pixels; original instance geometry remains pickable.
export function pickWallDoor(ray,chunks,level){
 const doors=[...chunks.values()].filter(mesh=>mesh.userData.boxes?.[0]?.kind==='wall'&&mesh.userData.boxes.some(b=>b.id.includes(':door')));
 for(const hit of ray.intersectObjects(doors,false)){
  const box=hit.object.userData.boxes?.[hit.instanceId],edge=box?.source.edge;
  if(edge&&box.id.includes(':door')&&Number(edge.split(':')[3]||0)===level)return edge;
 }
 return null;
}
