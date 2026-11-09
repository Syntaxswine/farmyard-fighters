import * as THREE from './vendor/three.module.js';
export const DOG_CLOTH_PAINT='../assets/characters/lowpoly-proof/cow-neck-detail-v1.png';
export const DOG_EYE_PAINT='../assets/characters/lowpoly-proof/dog-eye-detail-v1.png';
export function dogPaintLayers(source,renderer,eyeSource){
 const cloth=source.clone();cloth.colorSpace=THREE.SRGBColorSpace;cloth.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());cloth.needsUpdate=true;
 const eye=eyeSource.clone();eye.colorSpace=THREE.SRGBColorSpace;eye.needsUpdate=true;
 return {uniforms:{uDogCloth:{value:cloth},uDogEye:{value:eye}},declarations:`uniform sampler2D uDogCloth,uDogEye;
 vec3 dogPatch(vec2 pixel){return texture2D(uModelPaint,vec2(pixel.x/1774.,1.-pixel.y/887.)).rgb;}
 `,application:`
 // Occluded edges reuse a small footprint of their own painted material.
 // Blue in coverage mode means this local fill, never verified projection.
 float missing=1.-max(coverage,filled);
 vec2 samplePixel=vec2(170.+p.z*60.,330.+(p.y-1.10)*100.);
 if(abs(vPaintPart-2.)<.1)samplePixel=vec2(145.+p.x*100.,550.+(p.y-.65)*180.);
 if(vPaintPart>2.5&&vPaintPart<8.5){
  samplePixel=vec2(65.+p.x*80.,445.+(p.y-.8)*80.);
  if(abs(vPaintPart-7.)<.1)samplePixel=vec2(1104.+p.z*100.,175.-(p.y-1.4)*150.);
  if(abs(vPaintPart-8.)<.1)samplePixel=vec2(1112.+p.z*100.,510.-(p.y-.6)*280.);
  if(abs(vPaintPart-4.)<.1||abs(vPaintPart-6.)<.1)samplePixel=vec2(110.+p.z*20.,800.+p.x*80.);
 }
 if(vPaintPart>12.5&&vPaintPart<15.5)samplePixel=vec2(137.+p.z*30.,449.+(p.y-.86)*60.);
 diffuseColor.rgb=mix(diffuseColor.rgb,dogPatch(samplePixel)*(.85+.15*abs(n.x)),missing);filled=max(filled,missing);
 // Remove projected scarf copies from the underlying throat and lapels.
 if(abs(vPaintPart-7.)<.1){
  // One diagonal tangent mapping per eye replaces competing view projections.
  float orbit=smoothstep(1.410,1.435,p.y)*(1.-smoothstep(1.512,1.540,p.y))*smoothstep(-.065,-.005,p.x)*(1.-smoothstep(.075,.115,p.x))*smoothstep(.012,.048,abs(p.z));
  float tangent=(p.x+.040-abs(p.z))*.707;
  vec2 eyeUV=vec2(.5+tangent/.19,.55+(p.y-1.470)/.23);
  diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(uDogEye,eyeUV).rgb,orbit);coverage*=1.-orbit;filled=max(filled,orbit);
  float neck=1.-smoothstep(1.304,1.339,p.y),front=smoothstep(-.11,.035,p.x);
  vec3 tan=texture2D(uDogEye,vec2(.32+p.z*.6,.18+(p.y-1.28)*1.2)).rgb;
  vec3 dark=dogPatch(vec2(1110.+p.z*80.,215.-(p.y-1.30)*100.));
  diffuseColor.rgb=mix(diffuseColor.rgb,mix(dark,tan,front),neck);coverage*=1.-neck;filled=max(filled,neck);
 }
 if(vPaintPart<1.5||vPaintPart>15.5){
  float neck=smoothstep(1.20,1.255,p.y)*(1.-smoothstep(.14,.20,abs(p.z)))*smoothstep(1.8,2.3,diffuseColor.r/max(.001,max(diffuseColor.g,diffuseColor.b)));
  vec3 olive=dogPatch(vec2(1130.+p.z*200.,298.+p.x*180.));
  diffuseColor.rgb=mix(diffuseColor.rgb,olive,neck);coverage*=1.-neck;filled=max(filled,neck);
 }
 // Continuous red painting owns only the physical wrap, knot and ends.
 if(vPaintPart>8.5&&vPaintPart<12.5){
  float a=atan(p.z/.13,(p.x+.04)/.12);
  vec2 uv=vec2(.75+.17*sin(a),.48+clamp((p.y-1.255)*2.,-.14,.14));
  vec3 red=texture2D(uDogCloth,uv).rgb;
  float originalRed=smoothstep(2.0,2.5,diffuseColor.r/max(.001,max(diffuseColor.g,diffuseColor.b)));
  if(vPaintPart<9.5)originalRed=0.;
  diffuseColor.rgb=mix(red,diffuseColor.rgb,originalRed)*(.9+.1*max(0.,n.y));coverage=0.;filled=1.;
 }
 // Inner cuff surfaces become visible when the arms bend into carry.
 float cuff=0.;
 if(vPaintPart<1.5)cuff=smoothstep(.24,.29,abs(p.z))*(1.-smoothstep(1.040,1.070,p.y));
 if(abs(vPaintPart-3.)<.1||abs(vPaintPart-5.)<.1)cuff=smoothstep(.933,.965,p.y);
 if(cuff>0.){
  cuff*=1.-smoothstep(.12,.22,diffuseColor.b);
  float a=atan(p.x-.012,abs(p.z)-.33);
  vec3 cream=dogPatch(vec2(369.+16.*sin(a),380.-clamp((p.y-1.02)*260.,-13.,15.)));
  diffuseColor.rgb=mix(diffuseColor.rgb,cream*(.85+.15*abs(n.x)),cuff);coverage*=1.-cuff;filled=max(filled,cuff);
 }
 `,dispose(){cloth.dispose();eye.dispose();}};
}
