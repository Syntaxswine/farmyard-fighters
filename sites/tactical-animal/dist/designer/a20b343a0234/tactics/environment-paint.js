import * as T from './vendor/three.module.js';
import {diagonalRoad} from './diagonal-roads.js';
import {localEnvironmentMix,environmentColor,localEnvironmentErrors} from './environment-regions.js';

export function environmentPixels(profile,kind,size=65){
 const data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const color=environmentColor(localEnvironmentMix(profile,x/(size-1)*240,y/(size-1)*240),kind),i=(y*size+x)*4;
  data.set([...color,255],i);
 }
 return {data,width:size,height:size};
}
// Shared uniforms keep cached chunks and dimmed/X-ray materials in sync when
// opening a different sector. Texture edges sample the exact shared world edge.
export class EnvironmentPaint{
 constructor(){this.enabled={value:0};this.ground={value:null};this.foliage={value:null};this.signature='';}
 setMap(map){
  const profile=map.environment,signature=JSON.stringify(profile)||'';if(signature===this.signature)return;
  const errors=localEnvironmentErrors(map);if(errors.length)throw Error(errors[0]);
  this.signature=signature;this.dispose();this.enabled.value=profile?1:0;
  if(!profile)return;
  for(const kind of ['ground','foliage']){
   const p=environmentPixels(profile,kind),texture=new T.DataTexture(p.data,p.width,p.height);
   texture.colorSpace=T.SRGBColorSpace;texture.magFilter=texture.minFilter=T.LinearFilter;texture.needsUpdate=true;this[kind].value=texture;
  }
 }
 attach(material,kind,{cliff=false}={}){
  const road=diagonalRoad(kind),ground=['grass','cover-grass','grass-blade'].includes(kind)||road&&['grass','cover-grass'].includes(road.grass);
  if(!ground&&!['foliage','leaf-light','leaf-dry','leaf-sage','leaf-olive','pine'].includes(kind))return material;
  const compile=material.onBeforeCompile,cache=material.customProgramCacheKey();
  material.customProgramCacheKey=()=>cache+'-environment-1';
  material.onBeforeCompile=(shader,renderer)=>{
   compile(shader,renderer);shader.uniforms.environmentEnabled=this.enabled;shader.uniforms.environmentPalette=ground?this.ground:this.foliage;
   shader.fragmentShader='uniform float environmentEnabled;uniform sampler2D environmentPalette;\n'+shader.fragmentShader;
   let eligible='1.';
   if(road){const e={nw:'1.-uv.x-uv.y',ne:'uv.x-uv.y',se:'uv.x+uv.y-1.',sw:'uv.y-uv.x'}[road.corner];eligible=`((${e.replaceAll('uv.','envTile.')})<${road.border?'-.064':'0.'}?1.:0.)`;}
   if(cliff)eligible='(1.-sandWeight)*(1.-soilEdge*.65)';
   // Existing paint contributes texture/highlights; the environment supplies
   // its colors. Roads, concrete, rock faces and authored floors are untouched.
   const paint=`
    if(environmentEnabled>.5){
     vec2 envTile=fract(vNaturePosition.xz+.5);
     vec2 envUV=((vNaturePosition.xz+.5)/240.*64.+.5)/65.;
     vec3 envColor=texture2D(environmentPalette,envUV).rgb;
     float envDetail=clamp(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))/${ground?'.15':'.045'},.20,1.65);
     diffuseColor.rgb=mix(diffuseColor.rgb,envColor*envDetail,${eligible});
    }
   `;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',paint+'\n#include <color_fragment>');
  };
  material.needsUpdate=true;return material;
 }
 dispose(){for(const kind of ['ground','foliage']){this[kind].value?.dispose();this[kind].value=null;}}
}
