import * as T from './vendor/three.module.js';
import {SAND_GLSL} from './painted-sand.js';

export const PAINTED_GRASS={id:'grass-cliff-meadow',name:'Cliff meadow grass',tileSize:2,variants:4,manifest:'../assets/environment/grass-cliff-meadow/tiles.json'};
// The approved cliff-cap colour recipe, sampled at its original Y=2 on BOTH
// elevations. All four variants share their borders; only interiors change.
export const GRASS_GLSL=`
 float gh(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float gn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(gh(i),gh(i+vec3(1,0,0)),f.x),mix(gh(i+vec3(0,1,0)),gh(i+vec3(1,1,0)),f.x),f.y),mix(mix(gh(i+vec3(0,0,1)),gh(i+vec3(1,0,1)),f.x),mix(gh(i+vec3(0,1,1)),gh(i+vec3(1,1,1)),f.x),f.y),f.z);}
 vec3 meadowSource(vec2 q){vec3 p=vec3(q.x,2.,q.y);float broad=gn(p*vec3(3.,5.,3.)),chips=gn(p*24.);float fleck=step(.63,chips)-step(chips,.28);return vec3(.250158,.230740,.099899)*.95*(.72+floor(broad*5.)*.11+fleck*.10)*mix(vec3(.65,.68,.40),vec3(1.20,1.05,.77),smoothstep(.30,.66,gn(p*2.6)));}
 vec3 meadowRepeat(vec2 uv,vec2 offset){vec2 p=uv*2.+offset,w=smoothstep(vec2(.65),vec2(1.),uv);return mix(mix(meadowSource(p),meadowSource(p-vec2(2,0)),w.x),mix(meadowSource(p-vec2(0,2)),meadowSource(p-vec2(2,2)),w.x),w.y);}
 vec3 meadowPaint(vec2 world,float variantOverride){vec2 cell=floor(world/2.),uv=fract(world/2.);float variant=variantOverride<0.?mod(cell.x*7.+cell.y*11.,4.):variantOverride;float fade=pow(sin(uv.x*3.14159265)*sin(uv.y*3.14159265),2.);return mix(meadowRepeat(uv,vec2(0)),meadowRepeat(uv,vec2(2.37,3.71)*variant),fade*.85);}
`;
export function createPaintedGrass({unlit=false,variant=-1,rim=false,sand=false,tint=0xffffff}={}){
 if(!Number.isInteger(variant)||variant< -1||variant>=PAINTED_GRASS.variants)throw Error('Invalid meadow variant');
 const material=unlit?new T.MeshBasicMaterial({toneMapped:false}):new T.MeshStandardMaterial({roughness:1,flatShading:true});
 const grassTint={value:new T.Color(tint)};material.userData.grassTint=grassTint;
 material.onBeforeCompile=s=>{
  s.uniforms.meadowVariant={value:variant};s.uniforms.grassTint=grassTint;
  s.vertexShader='varying vec2 vMeadow;\n'+(rim?'attribute float cliffRim;varying float vMeadowRim;varying float vMeadowUp;\n':'')+(sand?'attribute float sandBlend;varying float vSandBlend;varying vec3 vSandWorld;varying vec3 vSandNormal;\n':'')+s.vertexShader;
  s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMeadow=(modelMatrix*vec4(position,1.)).xz;'+(rim?'vMeadowRim=cliffRim;vMeadowUp=abs(normal.y);':'')+(sand?'vSandBlend=sandBlend;vSandWorld=(modelMatrix*vec4(position,1.)).xyz;vSandNormal=normalize(mat3(modelMatrix)*normal);':''));
  s.fragmentShader='varying vec2 vMeadow;uniform float meadowVariant;uniform vec3 grassTint;\n'+(rim?'varying float vMeadowRim;varying float vMeadowUp;\n':'')+(sand?'varying float vSandBlend;varying vec3 vSandWorld;varying vec3 vSandNormal;\n'+SAND_GLSL:'')+GRASS_GLSL+s.fragmentShader;
  s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=meadowPaint(vMeadow,meadowVariant)*grassTint;'+(sand?'diffuseColor.rgb=mix(diffuseColor.rgb,sandSurface(vSandWorld,vSandNormal),sandCoverage(vMeadow,vSandBlend));':'')+(rim?'\nfloat wear=gn(vec3(vMeadow*4.,2.));float edge=1.-smoothstep(.035,.14+wear*.04,vMeadowRim/max(.08,vMeadowUp));vec3 soil=vec3(.105,.069,.034)*(.85+wear*.3);diffuseColor.rgb=mix(diffuseColor.rgb,soil,edge*.93'+(sand?'*(1.-sandCoverage(vMeadow,vSandBlend))':'')+');':''));
 };
 material.customProgramCacheKey=()=>`cliff-meadow-v3-${unlit}-${rim}-${sand}`;return material;
}
