import * as T from './vendor/three.module.js';
import {ANIMAL_MOTION_CATALOG} from './animal-motion-catalog.js';
import {createAnimalPaint} from './animal-motion-paint.js';
import {createRedHatCap} from './red-hat-model.js';
import {createWeaponModel,WEAPON_MODELS} from './weapon-models.js';
import {createPaintedFireMotion} from './painted-fire-motion.js';

export const FIRE_CHARACTERS=ANIMAL_MOTION_CATALOG;
export function fireSelection(animal='horse',outfit='normal',weapon='rifle',operator=false){
 const profile=FIRE_CHARACTERS.find(p=>p.id===animal);
 if(!profile||operator&&profile.unarmed)throw Error('Unsupported fire character: '+animal);
 if(!['normal','red-hats',...(animal==='donkey'&&!operator?['blue-hawaiian']:[])].includes(outfit))throw Error('Unsupported outfit for '+animal);
 const unarmed=profile.unarmed||outfit==='blue-hawaiian';
 if(!WEAPON_MODELS[weapon])throw Error('Unsupported equipment: '+weapon);
 return {profile,animal,outfit,weapon:operator?'flamethrower':unarmed?'hands':weapon,unarmed};
}
const meshes=new Map();
async function meshData(file){if(!meshes.has(file))meshes.set(file,fetch('./'+file).then(r=>{if(!r.ok)throw Error('Character mesh failed: '+file);return r.json();}).catch(e=>{meshes.delete(file);throw e;}));return meshes.get(file);}

// Caps, guide hats and corrective grip meshes must break up with the body.
// Equipment is deliberately excluded and remains a separately grounded prop.
export function dissolveBody(worker,uniform){
 const equipment=[worker.weapon?.root,worker.weapon?.mount,worker.weapon?.hose].filter(Boolean),materials=new Set(),saved=[],depthAssignments=[];
 const breakup='float breakup=fract(sin(dot(floor(fireBind*29.0),vec3(12.9898,78.233,31.41)))*43758.5453);if(breakup<fireDissolve)discard;';
 function inject(shader){shader.uniforms.fireDissolve=uniform;shader.vertexShader='varying vec3 fireBind;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfireBind=position;');shader.fragmentShader='uniform float fireDissolve;varying vec3 fireBind;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\n'+breakup);}
 // The same bind-space discard must affect sunlight shadows, including caps.
 // Reuse one depth material for this actor and restore existing assignments.
 const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});depth.onBeforeCompile=inject;depth.customProgramCacheKey=()=> 'roster-fire-depth-dissolve-v1';
 worker.root.traverse(o=>{if(!o.isMesh)return;for(let a=o;a;a=a.parent)if(equipment.includes(a))return;for(const m of [o.material].flat())materials.add(m);depthAssignments.push([o,o.customDepthMaterial]);o.customDepthMaterial=depth;});
 for(const material of materials){const compile=material.onBeforeCompile,key=material.customProgramCacheKey;saved.push({material,compile,key});
  material.onBeforeCompile=function(shader){compile.call(this,shader);inject(shader);shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.07,.059,.046),smoothstep(.0,.35,fireDissolve));\n#include <tonemapping_fragment>');};
  material.customProgramCacheKey=()=>key.call(material)+'-roster-fire-dissolve-v1';material.needsUpdate=true;
 }
 return ()=>{for(const {material,compile,key}of saved){material.onBeforeCompile=compile;material.customProgramCacheKey=key;material.needsUpdate=true;}for(const [mesh,old]of depthAssignments)mesh.customDepthMaterial=old;depth.dispose();};
}

export async function createFireActor(renderer,loader,atlas,selection){
 const {profile,outfit,weapon:weaponId}=selection;let worker,paint,cap,weapon,motion,restorePaint;const dissolve={value:0},textures=new Set(),ownedLoader={loadAsync:async(...args)=>{const t=await loader.loadAsync(...args);textures.add(t);return t;}};let disposed=false;
 function dispose(){if(disposed)return;disposed=true;worker?.root.removeFromParent();motion?.dispose();restorePaint?.();cap?.dispose();paint?.dispose();if(weapon&&weapon!==worker?.rifle)weapon.dispose();worker?.skeleton.dispose();worker?.dispose();for(const t of textures)t.dispose();}
 try{
  worker=profile.create(await meshData(profile.file),atlas);
  paint=await createAnimalPaint(renderer,worker,profile,ownedLoader,outfit);for(const p of worker.parts)p.material=paint.material;
  if(outfit==='red-hats')cap=await createRedHatCap(renderer,worker,profile,ownedLoader);
  if(!profile.unarmed){weapon=weaponId==='rifle'?worker.rifle:createWeaponModel(weaponId,atlas);worker.equipWeapon(weapon);}
  motion=createPaintedFireMotion(worker,profile);restorePaint=dissolveBody(worker,dissolve);
  return {worker,paint,cap,weapon,motion,dissolve,selection,dispose};
 }catch(e){dispose();throw e;}
}
