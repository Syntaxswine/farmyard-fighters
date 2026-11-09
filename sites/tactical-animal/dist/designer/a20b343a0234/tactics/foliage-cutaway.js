import * as T from './vendor/three.module.js';

export const FOLIAGE_FOCUS_LIMIT=12;
// Visual-only inputs. Callers supply friendly actors and already known ground.
// Depth is measured toward the viewing camera, including in shadow passes.
export function foliageRevealAt(world,focus,towardCamera,level){
 if(level!==focus.level)return 0;
 const d=world.map((v,i)=>v-focus.position[i]),along=d.reduce((n,v,i)=>n+v*towardCamera[i],0);
 if(along<=.03)return 0;
 const r=Math.hypot(...d.map((v,i)=>v-along*towardCamera[i])),radius=focus.radius||1.3,t=Math.max(0,Math.min(1,(r-radius*.55)/(radius*.45)));
 return (1-t*t*(3-2*t))*(focus.weight??1);
}
export class FoliageCutaway{
 constructor(){
  this.entries=new Map();this.depthMaterials=new Map();this.time=0;this.active=false;
  this.uniforms={foliageEye:{value:new T.Vector3()},foliageFocusCount:{value:0},foliageFocus:{value:Array.from({length:FOLIAGE_FOCUS_LIMIT},()=>new T.Vector4())},foliageShape:{value:Array.from({length:FOLIAGE_FOCUS_LIMIT},()=>new T.Vector3())}};
 }
 update(camera,targets=[],now=performance.now()){
  if(this.enabled===false)targets=[];
  const dt=Math.min(.05,Math.max(.001,(now-this.time)/1000));this.time=now;const keep=new Set();let moving=false;
  for(const [i,p]of targets.slice(0,FOLIAGE_FOCUS_LIMIT).entries()){
   if(!p||!p.position.every(Number.isFinite)||p.known===false)continue;
   const id=p.id??i;keep.add(id);const old=this.entries.get(id);if(old&&p.position.some((v,j)=>Math.abs(v-old.position[j])>.01))moving=true;
   // Ease the aperture rather than rebuilding or hiding whole forest chunks.
   this.entries.set(id,{...p,position:p.position.map((v,j)=>old?old.position[j]+(v-old.position[j])*(1-Math.exp(-dt*25)):v),weight:Math.min(1,(old?.weight||0)+dt*7)});
  }
  for(const [id,p]of this.entries)if(!keep.has(id)){p.weight-=dt*6;if(p.weight<=0)this.entries.delete(id);}
  const entries=[...this.entries].sort(([a],[b])=>Number(keep.has(b))-Number(keep.has(a))).slice(0,FOLIAGE_FOCUS_LIMIT).map(([,p])=>p);
  camera.getWorldDirection(this.uniforms.foliageEye.value).negate();
  this.uniforms.foliageFocusCount.value=entries.length;
  entries.forEach((p,i)=>{this.uniforms.foliageFocus.value[i].set(...p.position,p.weight);this.uniforms.foliageShape.value[i].set(p.radius||1.3,p.level||0,p.woodOpacity??.12);});
  this.active=moving||entries.some(p=>p.weight<1)||[...this.entries.keys()].some(k=>!keep.has(k));
 }
 decorate(material,level,wood=false){
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.customProgramCacheKey=()=>key+'-foliage-aperture-v1-'+level+'-'+wood;
  material.onBeforeCompile=(s,r)=>{compile.call(material,s,r);Object.assign(s.uniforms,this.uniforms);
   s.vertexShader='varying vec3 foliageWorld;\n'+s.vertexShader;
   s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    mat4 foliageMatrix=modelMatrix;
    #ifdef USE_INSTANCING
     foliageMatrix*=instanceMatrix;
    #endif
    foliageWorld=(foliageMatrix*vec4(position,1.)).xyz;
   `);
   s.fragmentShader=`varying vec3 foliageWorld;uniform vec3 foliageEye;uniform int foliageFocusCount;
    uniform vec4 foliageFocus[${FOLIAGE_FOCUS_LIMIT}];uniform vec3 foliageShape[${FOLIAGE_FOCUS_LIMIT}];
    float foliageAperture(){float reveal=0.;for(int i=0;i<${FOLIAGE_FOCUS_LIMIT};i++){
     if(i>=foliageFocusCount)break;if(abs(foliageShape[i].y-${Number(level).toFixed(1)})>.1)continue;
     vec3 delta=foliageWorld-foliageFocus[i].xyz;float along=dot(delta,foliageEye);if(along<=.03)continue;
     float radius=foliageShape[i].x;float mask=(1.-smoothstep(radius*.55,radius,length(delta-foliageEye*along)))*foliageFocus[i].w;
     reveal=max(reveal,mask${wood?'*(1.-foliageShape[i].z)':''});
    }return reveal;}
   `+s.fragmentShader;
   s.fragmentShader=s.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    float foliageReveal=foliageAperture();
    if(foliageReveal>0.){vec3 grain=floor(foliageWorld*48.);float noise=fract(sin(dot(grain,vec3(12.9898,78.233,37.719)))*43758.5453);if(noise<foliageReveal)discard;}
   `);
  };return material;
 }
 attachShadow(mesh,level){
  const source=mesh.material,key=source.uuid+':'+level;
  if(!this.depthMaterials.has(key)){
   const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,map:source.map,alphaMap:source.alphaMap,alphaTest:source.alphaTest,side:source.side});
   const distance=new T.MeshDistanceMaterial({map:source.map,alphaMap:source.alphaMap,alphaTest:source.alphaTest,side:source.side});
   this.depthMaterials.set(key,{depth:this.decorate(depth,level),distance:this.decorate(distance,level)});
  }
  const {depth,distance}=this.depthMaterials.get(key);mesh.customDepthMaterial=depth;mesh.customDistanceMaterial=distance;
 }
 clear(){for(const {depth,distance}of this.depthMaterials.values()){depth.dispose();distance.dispose();}this.depthMaterials.clear();}
 dispose(){this.clear();this.entries.clear();}
}
