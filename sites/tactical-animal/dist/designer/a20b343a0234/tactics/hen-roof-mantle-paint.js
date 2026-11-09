// The mantle exposes feather and cloth panels hidden by the neutral wings.
// Register those panels to complete painted regions, retaining the painted
// front buttons, armbands and face. No procedural flat-color replacement.
export function createHenRoofMantlePaint(worker){
 const material=worker.parts[0].material;if(!worker.parts[0].geometry.hasAttribute('paintPart'))return {set(){},dispose(){}};
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey,strength={value:0};let disposed=false;
 material.onBeforeCompile=function(shader,renderer){
  previous.call(material,shader,renderer);if(!shader.uniforms.uHenUnderlay)return;
  const faction=!!shader.uniforms.uFactionPaint;
  shader.uniforms.uHenMantlePaint=strength;shader.fragmentShader='uniform float uHenMantlePaint;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`
   if(vPaintPart<1.5){
    // The source apron/tie was projected onto the hidden feathered body.
    // A rear body painting owns that newly exposed surface continuously.
    float side=atan(p.z,max(.08,-p.x));
    vec2 featherUV=vec2((1108.+clamp(side*65.,-75.,75.))/1774.,1.-clamp(525.+(.82-p.y)*185.,515.,620.)/887.);
    vec3 feather=texture2D(uHenUnderlay,featherUV).rgb;
    float ghost=1.-smoothstep(1.35,1.8,diffuseColor.r/max(.001,diffuseColor.g));diffuseColor.rgb=mix(diffuseColor.rgb,feather,ghost*uHenMantlePaint);
   }
   if(abs(vPaintPart-6.)<.1){
    float flank=max(1.-smoothstep(.06,.16,p.x),smoothstep(.13,.22,abs(p.z)));
    ${faction?`vec2 clothUV=vec2((185.+clamp(p.z*22.+p.x*20.,-7.,7.))/1774.,1.-clamp(317.+(1.15-p.y)*75.,315.,341.)/887.);vec3 cloth=texture2D(uFactionPaint,clothUV).rgb;`:`vec2 clothUV=vec2((1107.+clamp(p.z*160.,-75.,75.))/1774.,1.-clamp(323.+(1.15-p.y)*240.,305.,399.)/887.);vec3 cloth=texture2D(uHenUnderlay,clothUV).rgb;`}
    diffuseColor.rgb=mix(diffuseColor.rgb,cloth,flank*uHenMantlePaint);
   }
   if(abs(vPaintPart-7.)<.1){
    // Keep the gathered apron one textile panel when the wing uncovers it.
    vec2 apronUV=vec2((222.+clamp(p.z*210.,-88.,88.))/1774.,1.-clamp(458.+(.80-p.y)*245.,450.,568.)/887.);
    vec3 apron=texture2D(${faction?'uFactionPaint':'uHenUnderlay'},apronUV).rgb;
    diffuseColor.rgb=mix(diffuseColor.rgb,apron,uHenMantlePaint);
   }
   #include <alphamap_fragment>`);
 };
 material.customProgramCacheKey=()=>key.call(material)+'-hen-roof-mantle-paint-v1';material.needsUpdate=true;
 return{set(value){if(!disposed)strength.value=value;},dispose(){if(disposed)return;material.onBeforeCompile=previous;material.customProgramCacheKey=key;material.needsUpdate=true;disposed=true;}};
}
