import * as T from './vendor/three.module.js';
import {atlasRect} from './biome-foliage-paint.js';
import {OBSTACLE_PAINT} from './biome-obstacle-data.js';
import {panelAverage} from './biome-atlas-lod.js';

// These materials own no textures. One caller-owned atlas serves every panel.
// World-space projection remains continuous across independently batched cells.
export function createBiomeObstacleMaterials(atlas){
 if(!atlas?.isTexture)throw Error('Obstacle atlas texture is required');
 return Object.fromEntries(Object.entries(OBSTACLE_PAINT).map(([name,panel])=>{
  const water=name==='bogWater',m=new T.MeshStandardMaterial({map:atlas,roughness:water?.32:1,metalness:water?.20:0,color:water?0x91ada8:0xffffff,side:T.DoubleSide}),r=atlasRect(panel);m.name='biome-obstacle:'+name;m.customProgramCacheKey=()=>m.name+'-v2';
  const average=panelAverage(atlas,panel);
  m.onBeforeCompile=s=>{
   s.uniforms.obstacleFarPaint={value:average};
   s.vertexShader='varying vec3 vObstacleWorld,vObstacleNormal;\n'+s.vertexShader;
   s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    mat4 ob=modelMatrix;
    #ifdef USE_INSTANCING
     ob*=instanceMatrix;
    #endif
    mat3 basis=mat3(ob);vObstacleWorld=(ob*vec4(transformed,1.)).xyz;vObstacleNormal=normalize(basis*(normal/vec3(dot(basis[0],basis[0]),dot(basis[1],basis[1]),dot(basis[2],basis[2]))));
   `);
   s.fragmentShader='varying vec3 vObstacleWorld,vObstacleNormal;\n'+s.fragmentShader;
   s.fragmentShader=s.fragmentShader.replace('#include <map_pars_fragment>',`#include <map_pars_fragment>
    uniform vec3 obstacleFarPaint;
    vec3 obstaclePaint(vec2 p){vec2 span=vec2(${r.size.join(',')}),pixels=vec2(textureSize(map,0));float footprint=log2(max(.0001,max(length(dFdx(p)*span*pixels),length(dFdy(p)*span*pixels)))),lod=clamp(footprint,0.,4.);vec2 uv=1.-abs(mod(p,2.)-1.);return mix(textureLod(map,vec2(${r.origin.join(',')})+uv*span,lod).rgb,obstacleFarPaint,smoothstep(3.5,5.5,footprint));}
   `);
   s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`vec3 weights=pow(abs(normalize(vObstacleNormal)),vec3(4.));weights/=max(.001,weights.x+weights.y+weights.z);vec3 p=vObstacleWorld*${water?'.19':'.73'};diffuseColor.rgb*=obstaclePaint(p.zy)*weights.x+obstaclePaint(p.xz)*weights.y+obstaclePaint(p.xy)*weights.z;`);
  };return [name,m];
 }));
}
