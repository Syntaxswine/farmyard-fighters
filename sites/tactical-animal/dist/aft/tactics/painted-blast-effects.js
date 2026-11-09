import * as T from './vendor/three.module.js';
import {smooth,clamp} from './painted-fire-state.js';
import {paintedFireMaterial,FIRE_ASSETS} from './painted-fire-effects.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
export const PAINTED_BURST_ATLAS='../assets/effects/painted-fire/tank-burst-atlas-v1.png';
export function localFireCells(contract,{world=false,floor=0}={}){
 const seen=new Set();return contract.fires.map(p=>({x:p.x-(world?0:contract.origin.x),y:floor,z:p.y-(world?0:contract.origin.y)})).filter(p=>{const k=p.x+','+p.z;if(seen.has(k))return false;seen.add(k);return true;});
}
export function fireCellMask(cells){
 const minX=cells.length?Math.min(...cells.map(p=>p.x)):0,minZ=cells.length?Math.min(...cells.map(p=>p.z)):0;
 const width=cells.length?Math.max(...cells.map(p=>p.x))-minX+1:1,height=cells.length?Math.max(...cells.map(p=>p.z))-minZ+1:1,data=new Uint8Array(width*height*4);
 for(const p of cells){const n=((p.z-minZ)*width+p.x-minX)*4;data[n]=data[n+1]=data[n+2]=data[n+3]=255;}
 const texture=new T.DataTexture(data,width,height);texture.needsUpdate=true;texture.magFilter=texture.minFilter=T.NearestFilter;
 return {texture,bounds:new T.Vector4(minX-.5,minZ-.5,width,height)};
}
// Clip every fragment of a billboard/debris mesh at fog boundaries, not just
// its centre. Easy's revealed map is never used as a visibility permission.
function visibilityClip(material,uniforms){
 const inject=shader=>{Object.assign(shader.uniforms,uniforms);shader.vertexShader='varying vec3 tankClipWorld;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('void main(){','void main(){tankClipWorld=(modelMatrix*vec4(position,1.0)).xyz;').replace('void main() {','void main() {tankClipWorld=(modelMatrix*vec4(position,1.0)).xyz;');
  shader.fragmentShader='uniform sampler2D tankVisibility;uniform vec4 tankBounds;uniform float tankMasked;varying vec3 tankClipWorld;\n'+shader.fragmentShader;
  const clip='if(tankMasked>.5){vec2 uv=(tankClipWorld.xz-tankBounds.xy)/tankBounds.zw;if(any(lessThan(uv,vec2(0.0)))||any(greaterThanEqual(uv,vec2(1.0)))||texture2D(tankVisibility,uv).a<.5)discard;}';
  shader.fragmentShader=shader.fragmentShader.replace('void main(){','void main(){'+clip).replace('void main() {','void main() {'+clip);
 };
 if(material.isShaderMaterial)inject(material);else{
  const previous=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{previous.call(material,shader,renderer);inject(shader);};
  material.customProgramCacheKey=()=>cacheKey+'-fuel-fog-v1';
 }
}
function burstMaterial(texture){return new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,toneMapped:false,
 uniforms:{map:{value:texture},phase:{value:0},opacity:{value:1}},
 vertexShader:'varying vec2 vUv;varying vec3 world;void main(){vUv=uv;world=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
 fragmentShader:`uniform sampler2D map;uniform float phase,opacity;varying vec2 vUv;varying vec3 world;
 vec4 frame(float n){n=clamp(n,0.0,3.0);vec2 cell=vec2(mod(n,2.0),1.0-floor(n/2.0));return texture2D(map,(cell+clamp(vUv,.004,.996))*.5);}
 void main(){if(world.y<.008)discard;vec4 c=mix(frame(floor(phase)),frame(ceil(phase)),smoothstep(.0,1.0,fract(phase)));c.a*=opacity;if(c.a<.01)discard;gl_FragColor=c;
 #include <colorspace_fragment>
 }`});}

export async function loadPaintedBlastTextures(loader){
 const textures=[];
 try{for(const url of [PAINTED_BURST_ATLAS,FIRE_ASSETS.flame,FIRE_ASSETS.smoke]){const t=await loader.loadAsync(url);t.colorSpace=T.SRGBColorSpace;textures.push(t);}return textures;}
 catch(e){textures.forEach(t=>t.dispose());throw e;}
}
export async function createPaintedBlastEffects(scene,loader,origin,{textures:sharedTextures,world=false,floor=0,surfaceAt=()=>floor,fragmentCount=8,name='Painted fuel explosion'}={}){
 const textures=sharedTextures||await loadPaintedBlastTextures(loader);let group;
 let visibilityMask,visibilityKey;const visibility={tankVisibility:{value:null},tankBounds:{value:new T.Vector4(0,0,1,1)},tankMasked:{value:0}};
 group=new T.Group();group.name=name;scene.add(group);const plane=new T.PlaneGeometry(1,1),materials=[],geometries=[plane];
 function card(material,name){visibilityClip(material,visibility);materials.push(material);const m=new T.Mesh(plane,material);m.name=name;group.add(m);return m;}
 const core=card(burstMaterial(textures[0]),'Source-centred burst');
 const lobes=Array.from({length:14},(_,i)=>card(burstMaterial(textures[0]),'Outward painted lobe '+i));
 const smoke=Array.from({length:10},(_,i)=>card(paintedFireMaterial(textures[2],{smoke:true,seed:i*.71}),'Blast smoke '+i));
 const fragments=[];
 for(let i=0;i<fragmentCount;i++){
  const g=new T.CylinderGeometry(.07,.07,.14,5,1,true,0,Math.PI*.85),material=new T.MeshStandardMaterial({color:i%2?0x514b33:0x282925,roughness:1,side:T.DoubleSide,transparent:true});geometries.push(g);materials.push(material);
  visibilityClip(material,visibility);const m=new T.Mesh(g,material);m.name='Transient tank shell '+i;group.add(m);fragments.push(m);
  const angle=i*2.399,speed=1.05+.12*(i%3),up=2.15+.17*(i%4),vertices=Array.from({length:g.attributes.position.count},(_,n)=>V().fromBufferAttribute(g.attributes.position,n));
  const rotation=t=>new T.Euler(i+.8*t,i*.3+4*t,t*2.7),floorAt=t=>.006+Math.max(...vertices.map(p=>{const q=p.clone().applyEuler(rotation(t));return surfaceAt(origin.x+Math.cos(angle)*speed*t+q.x,origin.z+Math.sin(angle)*speed*t+q.z)-q.y;}));
  // Solve the first descending surface contact, then freeze translation and
  // rotation there. A centre-point clamp lets rotated shell edges sink below ground.
  let low=0,high=2;for(let t=1/60;t<=2;t+=1/60){if(origin.y+up*t-4.905*t*t<=floorAt(t)){high=t;break;}low=t;}for(let n=0;n<35;n++){const t=(low+high)/2;if(origin.y+up*t-4.905*t*t>floorAt(t))low=t;else high=t;}
  m.userData={angle,speed,up,flight:high,rotation,floorAt};
 }
 const light=new T.PointLight(0xffaa3c,0,7,2);light.position.copy(origin);group.add(light);
 let cells=[],ground=[],lastContract,mask;
 function setContract(contract){if(lastContract===contract)return;lastContract=contract;cells=localFireCells(contract,{world,floor});
  for(const m of ground){m.removeFromParent();const i=materials.indexOf(m.material);if(i>=0)materials.splice(i,1);m.material.dispose();}
  mask?.dispose();const grid=fireCellMask(cells);mask=grid.texture;
  ground=cells.map((p,i)=>{const material=paintedFireMaterial(textures[1],{seed:i*1.618});material.uniforms.groundMask={value:mask};material.uniforms.groundBounds={value:grid.bounds};material.uniforms.groundFloor={value:floor};
   material.fragmentShader='uniform sampler2D groundMask;uniform vec4 groundBounds;uniform float groundFloor;\n'+material.fragmentShader;
   material.fragmentShader=material.fragmentShader.replace('void main(){',`void main(){vec2 maskUv=(vWorld.xz-groundBounds.xy)/groundBounds.zw;if(vWorld.y<groundFloor+.008||any(lessThan(maskUv,vec2(0.0)))||any(greaterThanEqual(maskUv,vec2(1.0)))||texture2D(groundMask,maskUv).a<.5)discard;
    vec2 at=maskUv*groundBounds.zw,cell=floor(at),within=fract(at);float edgeDistance=1.0;
    for(int x=-1;x<=1;x++)for(int z=-1;z<=1;z++){vec2 n=vec2(float(x),float(z)),uv=(cell+n+.5)/groundBounds.zw;
     if(any(lessThan(uv,vec2(0.0)))||any(greaterThanEqual(uv,vec2(1.0)))||texture2D(groundMask,uv).a<.5){vec2 d=max(max(n-within,within-n-1.0),vec2(0.0));edgeDistance=min(edgeDistance,length(d));}}
    float boundaryFade=smoothstep(.025,.42,edgeDistance)*smoothstep(.008,.24,vWorld.y-groundFloor);`);
   material.fragmentShader=material.fragmentShader.replace('c.a*=opacity;','c.a*=opacity*boundaryFade;');
   const m=card(material,'Gameplay fire cell '+i);m.userData.cell=p;return m;});
 }
 return {group,core,lobes,fragments,smoke,get ground(){return ground;},get groundMask(){return mask;},
  // Only owned fragment materials: never alter the cargo library's intact drum.
  clipObject(root){root.traverse(m=>{if(m.isMesh){visibilityClip(m.material,visibility);if(m.customDepthMaterial)visibilityClip(m.customDepthMaterial,visibility);}});},
  setVisibility(cells){
   if(!cells){visibility.tankMasked.value=0;return;}
   const key=cells.map(p=>p.x+','+p.z).join(';');visibility.tankMasked.value=1;if(key===visibilityKey)return;visibilityKey=key;
   visibilityMask?.dispose();const grid=fireCellMask(cells);visibilityMask=grid.texture;visibility.tankVisibility.value=visibilityMask;visibility.tankBounds.value.copy(grid.bounds);
  },
  update(age,{camera,contract,visible=true,groundOpacity=1}){
   setContract(contract);group.visible=visible;const live=age>=0;
   core.visible=live&&age<1.05;core.position.copy(origin).add(V(0,.30*smooth(age/.6),0));core.quaternion.copy(camera.quaternion);
   const size=.28+3.05*(1-Math.exp(-Math.max(age,0)*8));core.scale.set(size,size,1);core.material.uniforms.phase.value=clamp(age/.80)*3;core.material.uniforms.opacity.value=(1-smooth((age-.30)/.75));
   for(let i=0;i<lobes.length;i++){
    const m=lobes[i],delay=.018+(i%3)*.035,a=age-delay,angle=i*2.399,reach=i%4===0?.65:i%4===1?1.35:2.35,travel=reach*(1-Math.exp(-Math.max(0,a)*(4.5+.7*Math.sin(i))));
    m.visible=live&&a>=0&&a<1.35;m.position.copy(origin).add(V(Math.cos(angle)*travel,.05+(i%4)*.19+Math.max(a,0)*.60,Math.sin(angle)*travel));m.quaternion.copy(camera.quaternion);m.rotateZ(.40*Math.sin(i*2.3));
    const size=(.65+1.65*smooth(a/.43))*(.8+.2*Math.sin(i*1.3)**2);m.scale.set(size,size*(.78+.2*Math.cos(i)),1);m.material.uniforms.phase.value=.35+2.65*smooth(a*(.8+.3*Math.sin(i)**2)/1.1);m.material.uniforms.opacity.value=.80*smooth(a/.055)*(1-smooth((a-.5)/.85));
   }
   for(let i=0;i<smoke.length;i++){
    const m=smoke[i],a=age-.42-i*.10,angle=i*2.399;m.visible=live&&a>=0&&a<3.2;
    m.position.copy(origin).add(V(Math.cos(angle)*(.25+i*.11)-a*.12,Math.max(a,0)*.68+.12,Math.sin(angle)*(.25+i*.11)));m.quaternion.copy(camera.quaternion);m.scale.set(1.1+Math.max(a,0)*.7,1.3+Math.max(a,0)*.8,1);
    m.material.uniforms.clock.value=Math.max(0,age);m.material.uniforms.opacity.value=.90*smooth(a/.18)*(1-smooth((a-1.75)/1.45));
   }
   for(let i=0;i<fragments.length;i++){
    const m=fragments[i],{angle,speed,up,flight,rotation,floorAt}=m.userData,t=clamp(age,0,flight);
    m.visible=live&&age<1.8;m.position.copy(origin).add(V(Math.cos(angle)*speed*t,up*t-4.905*t*t,Math.sin(angle)*speed*t));m.position.y=Math.max(floorAt(t),m.position.y);m.rotation.copy(rotation(t));m.material.opacity=1-smooth((age-1.1)/.7);
   }
   for(let i=0;i<ground.length;i++){
    const m=ground[i],p=cells[i],a=age-.12-Math.hypot(p.x,p.z)/11,fade=smooth(a/.14)*groundOpacity;
    const h=.85+.65*Math.sin(i*1.73+.4)**2;
    m.visible=live&&fade>.001;m.position.set(p.x+.23*Math.sin(i*2.13),p.y+h*.36,p.z+.23*Math.sin(i*1.19+.7));m.rotation.set(0,Math.atan2(camera.position.x-p.x,camera.position.z-p.z),0);m.scale.set(1.3+.65*Math.sin(i*.73)**2,h,1);m.material.uniforms.clock.value=Math.max(0,age)+i*.13;m.material.uniforms.opacity.value=.72*fade;
   }
   light.intensity=visible&&live?8*(1-smooth(age/.19)):0;
   return {fireCells:cells.length,visibleFireCells:ground.filter(m=>m.visible).length,transientFragments:fragments.filter(m=>m.visible).length,burstOrigin:origin.toArray()};
  },
  dispose(){group.removeFromParent();mask?.dispose();visibilityMask?.dispose();materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());if(!sharedTextures)textures.forEach(t=>t.dispose());}
 };
}
