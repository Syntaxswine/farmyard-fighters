import * as T from './vendor/three.module.js';
const ease=t=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};

// Temporary mantle-only clothing support. The waistcoat and trouser waistband
// share the pelvis so deep hip flexion cannot pull the trousers through the vest.
// The hidden crotch/lining paint borrows the same outfit's rear trouser cloth.
export function createPigMantleSurface(worker,profile){
 if(!['pig-foreman','pig-director'].includes(profile.id))return {set(){},dispose(){}};
 const trousers=worker.parts[1],g=trousers.geometry,originalIndices=g.attributes.skinIndex,originalWeights=g.attributes.skinWeight;
 const indices=originalIndices.clone(),weights=originalWeights.clone(),hip=worker.bones.findIndex(b=>b.name==='hips');
 for(let i=0;i<indices.count;i++){
  const t=ease((g.attributes.position.getY(i)-.63)/.17);if(!t)continue;
  const entries=new Map([[hip,t]]);
  for(let j=0;j<4;j++){const id=indices.getComponent(i,j);entries.set(id,(entries.get(id)||0)+weights.getComponent(i,j)*(1-t));}
  const ordered=[...entries].sort((a,b)=>b[1]-a[1]).slice(0,4);while(ordered.length<4)ordered.push([0,0]);
  const sum=ordered.reduce((n,v)=>n+v[1],0);indices.setXYZW(i,...ordered.map(v=>v[0]));weights.setXYZW(i,...ordered.map(v=>v[1]/sum));
 }
 const material=worker.parts[0].material,hook=material.onBeforeCompile,key=material.customProgramCacheKey,strength={value:0};let active=false,disposed=false;
 function patch(shader,renderer){
  hook.call(material,shader,renderer);if(!shader.uniforms.uModelPaint)return;
  const sampler=shader.uniforms.uFactionPaint?'uFactionPaint':shader.uniforms.uRedHatUniform?'uRedHatUniform':'uModelPaint';
  const frame=profile.frame||{width:.925,height:1.85,centerY:.825};
  shader.uniforms.uPigMantleCloth=strength;
  shader.fragmentShader='uniform float uPigMantleCloth;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`
   if(abs(vPaintPart-2.)<.1){
    float underside=(1.-smoothstep(.055,.11,abs(p.z)))*smoothstep(.43,.50,p.y)*(1.-smoothstep(.70,.76,p.y))*(1.-smoothstep(-.18,.18,n.y));
    vec2 clothUV=vec2((2.5+(.14+p.x*.12)/${frame.width})/4.,.5+(.57+(p.y-.60)*.25-${frame.centerY})/${frame.height});
    vec3 cloth=texture2D(${sampler},clothUV).rgb*(.83+.12*abs(n.z));
    diffuseColor.rgb=mix(diffuseColor.rgb,cloth,underside*uPigMantleCloth);
   }
   ${profile.id==='pig-director'?`if(abs(vPaintPart-1.)<.1){
    float lining=(1.-smoothstep(.84,.90,p.y))*(1.-smoothstep(-.2,.1,n.y));
    vec2 uv=vec2((2.5+(.14+p.x*.1)/${frame.width})/4.,.5+(.58+(p.y-.8)*.2-${frame.centerY})/${frame.height});
    vec3 cloth=texture2D(${sampler},uv).rgb*.78;
    diffuseColor.rgb=mix(diffuseColor.rgb,cloth,lining*uPigMantleCloth);
   }`:''}
   #include <alphamap_fragment>`);
 }
 return {set(value){
  if(disposed)return;strength.value=value;const enabled=value>0;
  g.setAttribute('skinIndex',enabled?indices:originalIndices);g.setAttribute('skinWeight',enabled?weights:originalWeights);
  if(enabled===active)return;active=enabled;material.onBeforeCompile=enabled?patch:hook;material.customProgramCacheKey=enabled?()=>key.call(material)+'-pig-mantle-cloth-v1':key;material.needsUpdate=true;
 },dispose(){if(disposed)return;this.set(0);disposed=true;}};
}
