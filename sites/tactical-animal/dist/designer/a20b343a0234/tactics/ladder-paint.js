import * as T from './vendor/three.module.js';

// The dog's stationary side jacket was hidden by the neutral sleeve in its
// source projection. Reuse its own olive painting there, keeping the real cuff
// cream. This temporary layer follows actual torso skin ownership.
export function createLadderPaintCorrection(worker,profile){
 if(profile.id!=='dog')return {set(){},dispose(){}};
 const strength={value:0},material=worker.parts[0].material,hook=material.onBeforeCompile,key=material.customProgramCacheKey,saved=[];
 for(const part of worker.parts){const a=part.geometry.attributes,values=new Float32Array(a.position.count);if(part.name.includes('shirt'))for(let i=0;i<values.length;i++){let arms=0;for(let j=0;j<4;j++)if(/upperArm|forearm/.test(worker.bones[a.skinIndex.getComponent(i,j)]?.name||''))arms+=a.skinWeight.getComponent(i,j);values[i]=1-arms;}saved.push([part,part.geometry.getAttribute('ladderTorso')]);part.geometry.setAttribute('ladderTorso',new T.BufferAttribute(values,1));}
 function patch(shader,renderer){hook.call(material,shader,renderer);shader.uniforms.ladderPaintStrength=strength;if(!shader.fragmentShader.includes('vec3 dogPatch('))return;if(!shader.fragmentShader.includes('#include <alphamap_fragment>'))throw new Error('Ladder paint requires the post-color alpha-map shader chunk');
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float ladderTorso; varying float vLadderTorso;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLadderTorso=ladderTorso;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vLadderTorso; uniform float ladderPaintStrength;').replace('#include <alphamap_fragment>',`
   if(vPaintPart<1.5){
    float sidePanel=vLadderTorso*smoothstep(.90,.94,p.y)*(1.-smoothstep(1.08,1.15,p.y))*smoothstep(.14,.20,abs(p.z))*(1.-smoothstep(.25,.29,abs(p.z)))*(1.-smoothstep(.03,.09,p.x));
    diffuseColor.rgb=mix(diffuseColor.rgb,dogPatch(vec2(1130.+p.z*200.,298.+p.x*180.))*(.9+.1*abs(n.z)),sidePanel*ladderPaintStrength);
   }
   #include <alphamap_fragment>`);
 }
 let active=false;
 return {set(value){strength.value=Number(value);value=!!value;if(active===value)return;active=value;material.onBeforeCompile=value?patch:hook;material.customProgramCacheKey=value?()=>key.call(material)+'-ladder-side-panel-v1':key;material.needsUpdate=true;},dispose(){material.onBeforeCompile=hook;material.customProgramCacheKey=key;material.needsUpdate=true;for(const [part,attribute]of saved)if(attribute)part.geometry.setAttribute('ladderTorso',attribute);else part.geometry.deleteAttribute('ladderTorso');}};
}
