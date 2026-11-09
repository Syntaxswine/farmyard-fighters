import * as T from './vendor/three.module.js';
// Conservative material budget for the approved scene: the Red Hat hen uses
// twelve fragment paint samplers and one vertex bone sampler. Other materials
// fit beneath this bound; richer materials can declare a larger requirement.
export const SCENE_TEXTURE_BUDGET=Object.freeze({fragment:12,vertex:1});
export function lightPasses(capabilities,lights,{fragment=12,vertex=1,baseShadows=1,shadows=true}={}){
 const available=Math.min(capabilities.maxTextures,capabilities.maxCombinedTextures-vertex)-fragment;
 if(vertex>capabilities.maxVertexTextures||available<baseShadows)throw Error('Scene material exceeds the device texture budget');
 const passes=[[]];let remaining=available-baseShadows;
 for(const light of lights){const cost=(shadows&&light.castShadow?1:0)+(light.isSpotLight&&light.map?1:0);
  if(cost>available)throw Error('Light exceeds the device texture budget');
  if(cost>remaining||passes.at(-1).length>=4){passes.push([]);remaining=available;}
  passes.at(-1).push(light);remaining-=cost;
 }return passes;
}
// Bound shader resources per pass, not the number of authored lights.
export class LightRenderer {
 constructor(){
  this.target=null;this.scratch=null;this.screen=new T.Scene();this.camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const material=new T.MeshBasicMaterial({depthTest:false,depthWrite:false,toneMapped:false,transparent:true,premultipliedAlpha:true,blending:T.NoBlending});
  // The linear target contains premultiplied color. Convert straight color to
  // sRGB, then let premultiplied_alpha_fragment restore canvas coverage. Encoding
  // the already multiplied value makes smoke and cutaway edges too bright.
  material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb = diffuseColor.a > 0.0 ? diffuseColor.rgb / diffuseColor.a : vec3(0.0);');};
  material.customProgramCacheKey=()=> 'linear-premultiplied-compositor-v1';
  this.quad=new T.Mesh(new T.PlaneGeometry(2,2),material);this.screen.add(this.quad);this.addScene=new T.Scene();this.addQuad=new T.Mesh(this.quad.geometry,new T.MeshBasicMaterial({depthTest:false,depthWrite:false,toneMapped:false,transparent:true,blending:T.CustomBlending,blendSrc:T.OneFactor,blendDst:T.OneFactor,blendSrcAlpha:T.ZeroFactor,blendDstAlpha:T.OneFactor}));this.addScene.add(this.addQuad);
 }
 render(renderer,scene,camera,lights){
  const active=lights.filter(l=>l.visible),budget={...SCENE_TEXTURE_BUDGET,baseShadows:0,shadows:renderer.shadowMap.enabled};
  scene.traverseVisible(o=>{if(o.isLight&&!active.includes(o)&&o.castShadow&&budget.shadows)budget.baseShadows++;for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){budget.fragment=Math.max(budget.fragment,m.userData.textureBudget?.fragment||0);budget.vertex=Math.max(budget.vertex,m.userData.textureBudget?.vertex||0);}});
  const passes=lightPasses(renderer.capabilities,active,budget);this.lastPassSizes=passes.map(p=>p.length);
  const size=renderer.getDrawingBufferSize(new T.Vector2());
  if(!this.target){this.target=new T.WebGLRenderTarget(size.x,size.y,{type:T.HalfFloatType});this.quad.material.map=this.target.texture;}
  else if(this.target.width!==size.x||this.target.height!==size.y)this.target.setSize(size.x,size.y);
  const previousTarget=renderer.getRenderTarget(),autoClear=renderer.autoClear,background=scene.background,environment=scene.environment,fog=scene.fog,lightState=[],materials=new Map();
  // Keep transparency in the same linear space at every light count. Blending
  // one pass directly into sRGB made overlays change color at the pass boundary.
  if(passes.length===1){try{renderer.setRenderTarget(this.target);renderer.autoClear=true;renderer.render(scene,camera);}finally{renderer.autoClear=autoClear;renderer.setRenderTarget(previousTarget);}renderer.render(this.screen,this.camera);return;}
  if(!this.scratch){this.scratch=new T.WebGLRenderTarget(size.x,size.y,{type:T.HalfFloatType});this.addQuad.material.map=this.scratch.texture;}
  else if(this.scratch.width!==size.x||this.scratch.height!==size.y)this.scratch.setSize(size.x,size.y);
  scene.traverse(o=>{
   if(o.isLight)lightState.push([o,o.visible]);
   if(!o.material)return;
   const list=Array.isArray(o.material)?o.material:[o.material];
   for(const m of list)if(!materials.has(m))materials.set(m,{...((m.isMeshStandardMaterial||m.isMeshPhongMaterial||m.isMeshLambertMaterial)?{emissiveIntensity:m.emissiveIntensity,envMap:m.envMap,lightMap:m.lightMap}:{}),onBeforeCompile:m.onBeforeCompile,customProgramCacheKey:m.customProgramCacheKey});
  });
  try{
   renderer.setRenderTarget(this.target);renderer.autoClear=true;
   active.forEach(l=>l.visible=passes[0].includes(l));renderer.render(scene,camera);
   scene.background=new T.Color(0);scene.environment=null;if(fog){scene.fog=fog.clone();scene.fog.color.set(0);}
   for(const [l]of lightState)l.visible=false;
   for(const [m,saved]of materials){
    if(m.isMeshStandardMaterial||m.isMeshPhongMaterial||m.isMeshLambertMaterial){m.emissiveIntensity=0;m.envMap=null;m.lightMap=null;}
    else if(m.blending!==T.MultiplyBlending&&m.blending!==T.SubtractiveBlending){
     // Keep nonlit depth/alpha masks, but emit no additional color. Hiding a
     // smoke/fog overlay would let extra lighting leak through its coverage.
     const key=m.customProgramCacheKey();m.customProgramCacheKey=()=>key+'-local-light-mask';
     m.onBeforeCompile=function(shader,renderer){saved.onBeforeCompile.call(this,shader,renderer);const source=shader.fragmentShader,main=/void\s+main\s*\(\s*(?:void\s*)?\)/;if(!main.test(source))throw Error('Light mask shader has no main');const output=source.match(/out\s+vec4\s+(\w+)\s*;/)?.[1]||'gl_FragColor';shader.fragmentShader=source.replace(main,'void localLightMaskMain()')+'\nvoid main(){localLightMaskMain();'+output+'.rgb=vec3(0.0);}\n';};
    }
    m.needsUpdate=true;
   }
   for(const pass of passes.slice(1)){
    // Resolve normal depth and transparency within each contribution first.
    // Adding meshes directly at equal depth can double coincident surfaces.
    active.forEach(l=>l.visible=pass.includes(l));renderer.setRenderTarget(this.scratch);renderer.autoClear=true;renderer.render(scene,camera);
    renderer.setRenderTarget(this.target);renderer.autoClear=false;renderer.render(this.addScene,this.camera);
   }
  }finally{
   for(const [m,saved]of materials){Object.assign(m,saved);m.needsUpdate=true;}
   for(const [l,visible]of lightState)l.visible=visible;
   scene.background=background;scene.environment=environment;scene.fog=fog;renderer.autoClear=autoClear;renderer.setRenderTarget(previousTarget);
  }
  // Copy RGBA without another blend or the opaque-material alpha override.
  // Cutaways and the surrounding transparent canvas must retain their coverage.
  renderer.render(this.screen,this.camera);
 }
 dispose(){this.target?.dispose();this.scratch?.dispose();this.quad.geometry.dispose();this.quad.material.dispose();this.addQuad.material.dispose();}
}
