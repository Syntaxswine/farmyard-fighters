import * as T from './vendor/three.module.js';

export const PAINTED_SAND={id:'sand-cliff',name:'Cliff sand',tileSize:2,manifest:'../assets/environment/sand-cliff/tiles.json'};
// Warm chipped paint from the crag, authored independently of the grass below it.
export const SAND_GLSL=`
 float sh(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float sn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(sh(i),sh(i+vec3(1,0,0)),f.x),mix(sh(i+vec3(0,1,0)),sh(i+vec3(1,1,0)),f.x),f.y),mix(mix(sh(i+vec3(0,0,1)),sh(i+vec3(1,0,1)),f.x),mix(sh(i+vec3(0,1,1)),sh(i+vec3(1,1,1)),f.x),f.y),f.z);}
 vec3 sandSource(vec2 q){vec3 p=vec3(q.x,2.,q.y);float broad=sn(p*vec3(3,5,3)),chips=sn(p*24.);float fleck=step(.63,chips)-step(chips,.28);return vec3(.376262,.318547,.208637)*.95*(.72+floor(broad*5.)*.11+fleck*.10);}
 vec3 sandPaint(vec2 world){vec2 uv=fract(world/2.),p=uv*2.,w=smoothstep(vec2(.65),vec2(1),uv);return mix(mix(sandSource(p),sandSource(p-vec2(2,0)),w.x),mix(sandSource(p-vec2(0,2)),sandSource(p-vec2(2,2)),w.x),w.y);}
 vec3 sandSurface(vec3 p,vec3 normal){vec3 w=pow(abs(normal),vec3(4));w/=max(.0001,w.x+w.y+w.z);return sandPaint(p.zy)*w.x+sandPaint(p.xz)*w.y+sandPaint(p.xy)*w.z;}
 float sandCoverage(vec2 world,float mask){float noise=sn(vec3(world*13.,3.));return smoothstep(.12+noise*.13,.82+noise*.13,mask);}
 float sandPatch(vec2 uv){float edge=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));return clamp(edge*4.,0.,1.);}
`;
export function createPaintedSand({unlit=false,feather=false}={}){
 const options={transparent:feather,depthWrite:!feather},material=unlit?new T.MeshBasicMaterial({...options,toneMapped:false}):new T.MeshStandardMaterial({...options,roughness:1,flatShading:true});
 material.onBeforeCompile=s=>{s.vertexShader='varying vec2 vSand;varying vec2 vSandUv;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSand=(modelMatrix*vec4(position,1.)).xz;vSandUv=uv;');s.fragmentShader='varying vec2 vSand;varying vec2 vSandUv;\n'+SAND_GLSL+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=sandPaint(vSand);'+(feather?'diffuseColor.a*=sandCoverage(vSand,sandPatch(vSandUv));':''));};
 material.customProgramCacheKey=()=>`cliff-sand-v1-${unlit}-${feather}`;return material;
}
