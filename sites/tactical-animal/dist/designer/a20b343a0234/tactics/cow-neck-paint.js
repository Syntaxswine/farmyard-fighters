import * as THREE from './vendor/three.module.js';

export const COW_NECK_PAINT='../assets/characters/lowpoly-proof/cow-neck-detail-v1.png';

// Dedicated painted fur and red cloth. These local surface coordinates stay in
// bind space, so the paint follows the existing rig without camera dependence.
export function cowNeckPaint(source,renderer){
 const texture=source.clone();texture.colorSpace=THREE.SRGBColorSpace;
 texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 texture.needsUpdate=true;
 return {uniforms:{uCowNeckPaint:{value:texture}},declarations:`
 uniform sampler2D uCowNeckPaint;
 vec3 cowThroat(vec3 p){
  float a=atan(p.z,p.x+.055);
  vec2 uv=vec2(.25+.15*sin(a),.20+.60*clamp((p.y-1.245)/.14,0.,1.));
  return texture2D(uCowNeckPaint,uv).rgb*(.90+.10*max(0.,cos(a)));
 }
 `,application:`
 if(abs(vPaintPart-7.)<.1){
  // The original rear painting includes its own scarf. Remove that second
  // red band from the nape above the physical wrap, retaining the fur marking.
  float nape=(1.-smoothstep(1.355,1.395,p.y))*(1.-smoothstep(-.10,-.02,p.x));
  vec3 fur=cowThroat(p);
  diffuseColor.rgb=mix(diffuseColor.rgb,fur,nape);coverage*=1.-nape;filled=max(filled,nape);
  // The reference neck extends under the shirt collar. Below the physical
  // wrap's lower edge that overlap belongs to the shirt, not exposed fur.
  float a=atan(p.z/.131,(p.x+.04)/.12),bottom=1.2798-.0072*pow(sin(a),2.);
  float underlap=(1.-smoothstep(bottom-.008,bottom-.002,p.y))*(1.-smoothstep(-.10,-.03,p.x));
  vec2 shirtUV=vec2((1108.+p.z*250.)/1774.,1.-(285.-(p.y-1.22)*50.)/887.);
  diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(uModelPaint,shirtUV).rgb,underlap);coverage*=1.-underlap;filled=max(filled,underlap);
 }
 if(vPaintPart<1.5){
  float collar=smoothstep(1.18,1.24,p.y)*(1.-smoothstep(.10,.16,abs(p.z)))*(1.-smoothstep(-.08,-.03,p.x));
  vec2 uv=vec2((1108.+p.z*250.)/1774.,1.-(285.-(p.y-1.22)*50.)/887.);
  diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(uModelPaint,uv).rgb,collar);coverage*=1.-collar;filled=max(filled,collar);
 }
 if(abs(vPaintPart-9.)<.1){
  float a=atan(p.z/.131,(p.x+.04)/.12),front=pow(max(0.,cos(a)),3.);
  float center=1.2902-.0328*front,width=.0208+.0144*pow(sin(a),2.);
  float t=clamp(.5+(p.y-center)/width,0.,1.);
  // Continuous periodic sampling around the wrap; no atlas seam at the nape.
  vec2 uv=vec2(.75+.18*sin(a),.48+.085*t+.018*sin(2.*a));
  vec3 cloth=texture2D(uCowNeckPaint,uv).rgb;
  diffuseColor.rgb=cloth*(.85+.15*max(0.,n.y));coverage=0.;filled=1.;
 }
 if(vPaintPart>9.5){
  // Retain the original knot/tail painting on their fronts. Their turned edges
  // receive red fold detail instead of a single stretched source pixel.
  vec2 uv=vec2((.5-p.z/.925)/4.,.5+(p.y-.825)/1.85);
  vec3 original=texture2D(uModelPaint,uv).rgb;
  float red=step(2.1,original.r/max(.001,max(original.g,original.b)));
  vec2 local=vec2(.75+clamp(p.z*2.,-.16,.16),.48+clamp((p.y-1.20)*.9,-.12,.12));
  vec3 edge=texture2D(uCowNeckPaint,local).rgb;
  diffuseColor.rgb=mix(edge,original,red*smoothstep(.10,.60,n.x))*(.86+.14*max(0.,n.x));
  coverage=0.;filled=1.;
 }
 `,dispose(){texture.dispose();}};
}
