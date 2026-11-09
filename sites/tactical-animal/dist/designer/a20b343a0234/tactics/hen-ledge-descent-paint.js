import {createHenRoofMantlePaint} from './hen-roof-mantle-paint.js';
// The short wing sleeve exposes its formerly hidden inner surface during the
// one-wing hold. Register that surface to the complete painted sleeve, and
// continue the authored belt across the coat hem and apron tie.
export function createHenLedgeDescentPaint(worker){
 const paint=createHenRoofMantlePaint(worker),material=worker.parts[0].material;
 if(!worker.parts[0].geometry.hasAttribute('paintPart'))return paint;
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey,strength={value:0};
 material.onBeforeCompile=function(shader,renderer){
  previous.call(material,shader,renderer);if(!shader.uniforms.uFactionPaint)return;
  shader.uniforms.uHenDescentCloth=strength;
  shader.fragmentShader='uniform float uHenDescentCloth;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`
   if(abs(vPaintPart-8.)<.1||abs(vPaintPart-9.)<.1){
    vec2 sleeveUV=vec2(clamp(640.+(p.x+.09)*180.,604.,676.)/1774.,1.-clamp(319.+(1.196-p.y)*300.,319.,394.)/887.);
    vec3 sleeve=texture2D(uFactionPaint,sleeveUV).rgb;
    float coverage=smoothstep(.95,.975,p.y)*uHenDescentCloth;
    diffuseColor.rgb=mix(diffuseColor.rgb,sleeve,coverage);
   }
   if(abs(vPaintPart-6.)<.1){
    float flank=max(1.-smoothstep(.06,.16,p.x),smoothstep(.13,.22,abs(p.z)));
    vec2 panelUV=vec2((642.+clamp(p.x*75.+p.z*35.,-22.,22.))/1774.,1.-clamp(325.+(1.10-p.y)*60.,315.,341.)/887.);
    diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(uFactionPaint,panelUV).rgb,flank*uHenDescentCloth);
   }
   if(abs(vPaintPart-13.)<.1||abs(vPaintPart-6.)<.1){
    float belt=abs(vPaintPart-13.)<.1?1.:1.-smoothstep(.885,.915,p.y);
    vec2 beltUV=vec2((1110.+clamp(atan(p.z,p.x)*20.,-60.,60.))/1774.,1.-clamp(425.+(.90-p.y)*100.,420.,442.)/887.);
    diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(uFactionPaint,beltUV).rgb,belt*uHenDescentCloth);
   }
   #include <alphamap_fragment>`);
 };
 material.customProgramCacheKey=()=>key.call(material)+'-hen-descent-cloth-v1';material.needsUpdate=true;
 return{set(value){strength.value=value;paint.set(value);},dispose(){paint.dispose();}};
}
