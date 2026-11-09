import * as T from './aft/tactics/vendor/three.module.js';
import {Core,hero} from './solo-game.js';
import {pointInWorldRect} from './world-grid.js';

export const SEARCH_HALO_LIMIT=12;
// Read existing knowledge/contents without discovery rolls or gameplay writes.
export function searchHaloCandidates(state,window){
  const unit=hero(state);if(!unit||unit.hp<=0)return [];
  return Core.interactionObjects(state).filter(object=>
    ['chest','body'].includes(object.kind)&&object.inventory?.length>0&&
    (!window||pointInWorldRect(object,window))&&state.visible.has(Core.key(object.x,object.y))&&Core.canSee(state,unit,object)
  ).map(object=>{
    const distance=Math.hypot(object.x-unit.x,object.y-unit.y);
    return {...object,distance,strength:distance<=(object.range??1.7)?1:.55};
  }).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id)).slice(0,SEARCH_HALO_LIMIT);
}

export function searchHaloTarget(object,view){
  let root;
  if(object.kind==='body'){
    const unit=view.state.units.find(unit=>unit.id===object.unitId);
    // A dissolved body is represented by its painted ash, never by the old
    // hidden rig or the surrounding flame/smoke cards.
    root=unit?.burnedRemains?view.burnEffects?.sessions.get(object.unitId)?.effects?.ash:
      unit?.burningTurns?null:view.actors.get(object.unitId)?.worker.root;
  }else root=view.interactionArt.records.get(object.id)?.sprite;
  return {root,strength:object.strength,width:object.kind==='body'?1.75:1};
}

const vertexShader=`varying vec2 haloUv;void main(){haloUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const edgeShader=`
uniform sampler2D haloMask,maskDepth,sceneDepth;uniform vec2 screenSize;uniform float radiusScale;varying vec2 haloUv;
vec3 sampleLight(vec2 direction,float radius,float surfaceDepth){
  vec2 at=haloUv+direction*radius*radiusScale/screenSize;
  if(any(lessThan(at,vec2(0.)))||any(greaterThan(at,vec2(1.))))return vec3(0.);
  vec4 light=textureLod(haloMask,at,0.);float sourceDepth=textureLod(maskDepth,at,0.).x;
  return surfaceDepth+.00006>=sourceDepth?light.rgb*light.a:vec3(0.);
}
void main(){
  float inside=textureLod(haloMask,haloUv,0.).a;
  if(inside>.99){gl_FragColor=vec4(0.);return;}
  float surfaceDepth=textureLod(sceneDepth,haloUv,0.).x;vec3 rim=vec3(0.),spill=vec3(0.);
  for(int i=0;i<8;i++){
    float a=float(i)*.785398163;vec2 d=vec2(cos(a),sin(a));
    rim+=sampleLight(d,1.8,surfaceDepth);
    spill+=sampleLight(d,4.6,surfaceDepth)*.48+sampleLight(d,8.0,surfaceDepth)*.16;
  }
  gl_FragColor=vec4((rim*.30+spill*.25)*(1.-inside),1.);
}`;
const compositeShader=`uniform sampler2D field,halo;varying vec2 haloUv;
void main(){vec4 base=texture2D(field,haloUv);vec3 glow=texture2D(halo,haloUv).rgb;
gl_FragColor=vec4(base.rgb+glow,base.a);
#include <colorspace_fragment>
}`;
const maskColor=`
  vec2 screenUv=gl_FragCoord.xy/haloViewport;
  if(gl_FragCoord.z>texture2D(haloSceneDepth,screenUv).x+.00004)discard;
  float drift=.5+.5*sin(dot(haloWorld,vec3(2.1,1.4,1.7))-haloTime*.58);
  float eddy=.5+.5*sin(dot(haloWorld,vec3(-1.3,2.4,.7))+haloTime*.33+1.9);
  float pool=pow(drift*.68+eddy*.32,1.6);
  vec3 gold=mix(vec3(1.,.42,.065),vec3(1.,.77,.29),pool);
  gl_FragColor=vec4(gold*mix(.48,1.16,pool)*haloStrength,1.);
`;
function actuallyVisible(object){for(let at=object;at;at=at.parent)if(!at.visible)return false;return true;}

// Low-resolution silhouette/edge passes leave the painted object untouched.
// Proxies borrow source geometry, skeletons and artwork; only masks are owned.
export class SearchHalo {
  constructor({reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches}={}){
    this.reducedMotion=reducedMotion;this.disposed=false;this.proxies=new Map();this.maskScene=new T.Scene();this.size=new T.Vector2();
    const target=depth=>new T.WebGLRenderTarget(1,1,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:depth,stencilBuffer:false});
    this.field=target(true);this.field.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);this.field.texture.colorSpace=T.LinearSRGBColorSpace;
    this.mask=target(true);this.mask.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);this.light=target(false);
    this.time={value:0};this.maskSize={value:new T.Vector2(1,1)};this.logicalSize={value:new T.Vector2(1,1)};
    this.edges=new T.ShaderMaterial({vertexShader,fragmentShader:edgeShader,uniforms:{haloMask:{value:this.mask.texture},maskDepth:{value:this.mask.depthTexture},sceneDepth:{value:this.field.depthTexture},screenSize:this.logicalSize,radiusScale:{value:1}},transparent:true,blending:T.AdditiveBlending,depthTest:false,depthWrite:false,toneMapped:false});
    this.composite=new T.ShaderMaterial({vertexShader,fragmentShader:compositeShader,uniforms:{field:{value:this.field.texture},halo:{value:this.light.texture}},depthTest:false,depthWrite:false,toneMapped:false});
    this.quad=new T.Mesh(new T.PlaneGeometry(2,2),this.edges);this.quad.frustumCulled=false;this.screen=new T.Scene();this.screen.add(this.quad);this.screenCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
  }
  maskMaterial(source,sprite){
    const material=sprite?new T.SpriteMaterial():new T.MeshBasicMaterial();
    Object.assign(material,{map:source.map,alphaMap:source.alphaMap,alphaTest:Math.max(.05,source.alphaTest||0),side:source.side,transparent:false,depthWrite:true,depthTest:true,toneMapped:false,fog:false});
    if(sprite){material.rotation=source.rotation;material.sizeAttenuation=source.sizeAttenuation;}
    material.userData.strength={value:1};material.userData.anchor={value:new T.Vector3()};
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,{haloTime:this.time,haloViewport:this.maskSize,haloSceneDepth:{value:this.field.depthTexture},haloStrength:material.userData.strength,haloAnchor:material.userData.anchor});
      shader.vertexShader='varying vec3 haloWorld;uniform vec3 haloAnchor;\n'+shader.vertexShader;
      shader.vertexShader=sprite?shader.vertexShader.replace('void main() {','void main() {haloWorld=haloAnchor+vec3(uv.x*1.8,uv.y*1.2,0.);'):
        shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nhaloWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader='varying vec3 haloWorld;uniform float haloTime,haloStrength;uniform vec2 haloViewport;uniform sampler2D haloSceneDepth;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',maskColor);
    };
    material.customProgramCacheKey=()=>`search-halo-mask-${sprite?'sprite':'mesh'}-v1`;return material;
  }
  sync(targets){
    const used=new Set();
    for(const {root,strength=1,width=1}of targets){
      if(!root||!actuallyVisible(root))continue;
      root.traverseVisible(source=>{
        if(!(source.isMesh||source.isSprite)||source.isInstancedMesh)return;
        const originals=Array.isArray(source.material)?source.material:[source.material];
        if(!originals.some(material=>material?.visible!==false&&material?.opacity>0))return;
        used.add(source);let record=this.proxies.get(source);
        if(!record){
          const clone=source.clone(false),materials=originals.map(material=>this.maskMaterial(material,source.isSprite));
          clone.material=Array.isArray(source.material)?materials:materials[0];clone.matrixAutoUpdate=false;clone.castShadow=clone.receiveShadow=false;clone.frustumCulled=false;clone.onBeforeRender=()=>{};clone.onAfterRender=()=>{};
          record={clone,materials};this.proxies.set(source,record);this.maskScene.add(clone);
        }
        record.width=Number.isFinite(width)?T.MathUtils.clamp(width,1,2.5):1;
        record.materials.forEach((material,i)=>{
          const original=originals[i];if(material.map!==original.map){material.map=original.map;material.needsUpdate=true;}
          material.visible=original.visible;material.opacity=original.opacity;material.userData.strength.value=strength;material.userData.anchor.value.setFromMatrixPosition(source.matrixWorld);
          if(source.isSprite)material.rotation=original.rotation;
        });
        record.clone.matrix.copy(source.matrixWorld);if(source.morphTargetInfluences)record.clone.morphTargetInfluences=source.morphTargetInfluences;
      });
    }
    for(const [source,record]of this.proxies){if(used.has(source))continue;record.clone.removeFromParent();record.materials.forEach(material=>material.dispose());this.proxies.delete(source);}
  }
  resize(renderer){
    renderer.getSize(this.size);const ratio=renderer.getPixelRatio(),w=Math.max(1,Math.round(this.size.x*ratio)),h=Math.max(1,Math.round(this.size.y*ratio));
    if(this.field.width===w&&this.field.height===h)return;
    this.field.setSize(w,h);this.mask.setSize(Math.max(1,Math.round(this.size.x*.75)),Math.max(1,Math.round(this.size.y*.75)));this.light.setSize(this.mask.width,this.mask.height);
    this.logicalSize.value.copy(this.size);this.maskSize.value.set(this.mask.width,this.mask.height);this.field.samples=Math.min(2,renderer.capabilities.maxSamples||0);
  }
  render(renderer,scene,camera,targets,now){
    if(this.disposed)return;this.sync(targets);
    if(!this.proxies.size){renderer.render(scene,camera);return;}
    this.resize(renderer);this.time.value=this.reducedMotion()?0:now/1000;
    const previous=renderer.getRenderTarget(),clear=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha(),shadows=renderer.shadowMap.autoUpdate,autoClear=renderer.autoClear;
    try{
      renderer.setRenderTarget(this.field);renderer.render(scene,camera);
      for(const [source,record]of this.proxies){record.clone.matrix.copy(source.matrixWorld);for(const material of record.materials)material.userData.anchor.value.setFromMatrixPosition(source.matrixWorld);}
      renderer.shadowMap.autoUpdate=false;renderer.setClearColor(0,0);
      const widths=[...new Set([...this.proxies.values()].map(record=>record.width))].sort((a,b)=>a-b);
      for(const [i,width]of widths.entries()){
        for(const record of this.proxies.values())record.clone.visible=record.width===width;
        renderer.autoClear=true;renderer.setRenderTarget(this.mask);renderer.render(this.maskScene,camera);
        renderer.autoClear=i===0;renderer.setRenderTarget(this.light);this.edges.uniforms.radiusScale.value=width;this.quad.material=this.edges;renderer.render(this.screen,this.screenCamera);
      }
      renderer.autoClear=autoClear;renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);this.quad.material=this.composite;renderer.render(this.screen,this.screenCamera);
    }finally{renderer.autoClear=autoClear;renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);renderer.shadowMap.autoUpdate=shadows;}
  }
  dispose(){
    if(this.disposed)return;this.sync([]);this.disposed=true;this.field.dispose();this.mask.dispose();this.light.dispose();this.edges.dispose();this.composite.dispose();this.quad.geometry.dispose();this.screen.clear();
  }
}
