import * as T from './vendor/three.module.js';
import {atlasRect} from './biome-foliage-paint.js';
import {panelAverage} from './biome-atlas-lod.js';

export const SCREEN_ATLAS='../assets/environment/foliage-screens/screen-atlas-v1.png';
export const FRINGE_ATLAS='../assets/environment/foliage-screens/fringe-atlas-v1.png';
export const SCREEN_PANELS={temperate:[0,0,3,2],jungle:[1,0,3,2],snow:[2,0,3,2],dry:[0,1,3,2],wetlands:[1,1,3,2],wood:[2,1,3,2]};
const FIELD_GLSL=`
 float screenHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float screenField(vec2 p){vec2 cell=floor(p),t=fract(p);t=t*t*(3.-2.*t);return mix(mix(screenHash(cell),screenHash(cell+vec2(1.,0.)),t.x),mix(screenHash(cell+vec2(0.,1.)),screenHash(cell+1.),t.x),t.y);}
 float screenGroupAt(vec2 p){return .72*screenField(p*.18)+.28*screenField(p*.41+7.);}
 vec3 temperateGroupPaint(vec2 p){float group=smoothstep(.24,.76,screenField(p*.095+vec2(11.,37.)));return mix(vec3(1.08,.97,.84),vec3(.77,1.07,.86),group)*mix(.89,1.08,group);}
`;

// Dedicated paint: changing a thicket must not repaint the spaced woodland trees.
// Continuous world projection crosses tile/chunk boundaries. The two warped
// scales remove the old per-sphere rosette without transparent overdraw.
export function createScreenMaterials(texture,fringeTexture){
 const materials={};
 for(const [family,panel]of Object.entries(SCREEN_PANELS)){
  const rect=atlasRect(panel),wood=atlasRect(SCREEN_PANELS.wood);
  const material=new T.MeshStandardMaterial({map:texture,roughness:1,side:T.DoubleSide,vertexColors:true});
  material.name='thicket:'+family;material.customProgramCacheKey=()=>`foliage-screen-paint-v3-${family}`;
  const average=panelAverage(texture,panel);
  material.onBeforeCompile=s=>{
   s.uniforms.screenFarPaint={value:average};
   s.vertexShader='varying vec3 vScreenWorld,vScreenNormal;varying float vScreenHeight;\n'+s.vertexShader;
   s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    mat4 screenWorld=modelMatrix;
    #ifdef USE_INSTANCING
     screenWorld*=instanceMatrix;
    #endif
    vScreenWorld=(screenWorld*vec4(transformed,1.)).xyz;
    mat3 screenBasis=mat3(screenWorld);vec3 screenCorrected=normal/vec3(dot(screenBasis[0],screenBasis[0]),dot(screenBasis[1],screenBasis[1]),dot(screenBasis[2],screenBasis[2]));
    vScreenNormal=normalize(screenBasis*screenCorrected);vScreenHeight=uv.y;
   `);
   s.fragmentShader='varying vec3 vScreenWorld,vScreenNormal;varying float vScreenHeight;uniform vec3 screenFarPaint;\n'+s.fragmentShader;
   s.fragmentShader=s.fragmentShader.replace('#include <map_pars_fragment>',`#include <map_pars_fragment>
    vec2 screenMirror(vec2 p){return 1.-abs(mod(p,2.)-1.);}
    float screenNoise(vec2 p){return sin(p.x*.73+sin(p.y*.57))*cos(p.y*.61+sin(p.x*.31));}
    ${FIELD_GLSL}
    vec3 screenSample(vec2 p){
     vec2 span=vec2(${rect.size}),pixels=vec2(textureSize(map,0));
     float footprint=log2(max(.0001,max(length(dFdx(p)*span*pixels),length(dFdy(p)*span*pixels)))),lod=clamp(footprint,0.,4.);
     vec2 warp=vec2(screenNoise(p*.7),screenNoise(p.yx*.63+4.))*.28;
     vec3 a=textureLod(map,vec2(${rect.origin})+screenMirror(p+warp)*span,lod).rgb;
     vec3 b=textureLod(map,vec2(${rect.origin})+screenMirror(p*.71+vec2(.37,.83)-warp)*span,lod).rgb;
     return mix(mix(a,b,.08+.07*screenNoise(p*.43)),screenFarPaint,smoothstep(5.5,7.5,footprint));
    }
   `);
   s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`
    vec3 screenWeights=pow(abs(normalize(vScreenNormal)),vec3(4.));screenWeights/=max(.001,dot(screenWeights,vec3(1.)));
    vec3 p=vScreenWorld*${family==='snow'?'.22':family==='jungle'?'.31':'.38'};
    vec3 screenColor=screenSample(p.zy)*screenWeights.x+screenSample(p.xz)*screenWeights.y+screenSample(p.xy)*screenWeights.z;
    float screenGroup=screenGroupAt(vScreenWorld.xz);
    screenColor=mix(screenFarPaint,screenColor,${family==='snow'?'.64':'.70'}+.24*screenGroup);
    ${family==='temperate'?'screenColor*=temperateGroupPaint(vScreenWorld.xz);':''}
    ${family==='snow'?`float snowBed=smoothstep(.26,.70,screenGroup),snowTop=max(screenWeights.y,smoothstep(1.25,1.9,vScreenHeight)*.38);
    vec3 snowBody=mix(vec3(.36,.405,.38),vec3(.68,.71,.66),.45+.55*screenField(vScreenWorld.xz*.27+19.))+(screenColor-screenFarPaint)*.20;
    screenColor=mix(screenColor,snowBody,snowBed*snowTop*.50);`:''}
    ${family==='wetlands'?`vec3 roots=textureLod(map,vec2(${wood.origin})+screenMirror(vec2(vScreenWorld.x+vScreenWorld.z,vScreenHeight)*.6)*vec2(${wood.size}),0.).rgb;screenColor=mix(roots,screenColor,smoothstep(.12,.75,vScreenHeight));`:''}
    diffuseColor.rgb*=screenColor;
    ${family==='wetlands'?'diffuseColor.rgb*=vec3(.96,1.12,.92);':''}
   `);
  };materials[family]=material;
 }
 if(fringeTexture)for(const [family,panel]of Object.entries(SCREEN_PANELS)){
  const {origin,size:span}=atlasRect(panel);
  const m=new T.MeshStandardMaterial({map:fringeTexture,roughness:1,side:T.DoubleSide,alphaTest:.28,alphaToCoverage:true});m.name='thicket-fringe:'+family;m.customProgramCacheKey=()=>`foliage-fringe-v3-${family}`;
  m.onBeforeCompile=s=>{
   if(family==='snow'||family==='temperate'){
    s.vertexShader='varying vec3 vBoughWorld;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vBoughWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    s.fragmentShader='varying vec3 vBoughWorld;\n'+FIELD_GLSL+s.fragmentShader;
   }
   s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`vec2 fringeUV=vec2(${origin})+clamp(vMapUv,0.,1.)*vec2(${span});vec2 fringePixels=vec2(textureSize(map,0));float fringeLOD=clamp(log2(max(.0001,max(length(dFdx(fringeUV)*fringePixels),length(dFdy(fringeUV)*fringePixels)))),0.,4.);vec4 fringePaint=textureLod(map,fringeUV,fringeLOD);
    ${family==='temperate'?'fringePaint.rgb*=temperateGroupPaint(vBoughWorld.xz);':''}
    ${family==='snow'?`fringePaint.rgb=mix(vec3(.28,.33,.30),fringePaint.rgb,.82);
    vec3 boughSnow=mix(vec3(.36,.405,.38),vec3(.68,.71,.66),.45+.55*screenField(vBoughWorld.xz*.27+19.));
    fringePaint.rgb=mix(fringePaint.rgb,boughSnow,smoothstep(.26,.70,screenGroupAt(vBoughWorld.xz))*.45*(1.-smoothstep(.1,.95,vMapUv.y)));`:''}
    diffuseColor*=fringePaint;`).replace('#include <opaque_fragment>',`outgoingLight=mix(outgoingLight,diffuseColor.rgb*${family==='snow'?'.98':'1.2'},${family==='snow'?'.50':'.65'});\n#include <opaque_fragment>`);
  };materials[family+'Fringe']=m;
 }
 return materials;
}
