import * as THREE from './vendor/three.module.js';
// Reuse the established hand-painted red cloth swatch, not bovine markings.
export const RABBIT_CLOTH_PAINT='../assets/characters/lowpoly-proof/cow-neck-detail-v1.png';
export const RABBIT_EYE_PAINT='../assets/characters/lowpoly-proof/rabbit-eye-detail-v1.png';
export function rabbitPaintLayers(source,renderer,eyeSource){
 const texture=source.clone();texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;
 const eyeTexture=eyeSource.clone();eyeTexture.colorSpace=THREE.SRGBColorSpace;eyeTexture.needsUpdate=true;
 return {uniforms:{uRabbitCloth:{value:texture},uRabbitEye:{value:eyeTexture}},declarations:'uniform sampler2D uRabbitCloth,uRabbitEye;',application:`
 if(abs(vPaintPart-7.)<.1){
  // One local painted eye per orbit, on a diagonal tangent plane in bind space.
  // This replaces competing front/profile eyes and retains the smooth skull.
  float orbit=smoothstep(1.380,1.413,p.y)*(1.-smoothstep(1.507,1.548,p.y))*smoothstep(-.085,-.025,p.x)*smoothstep(.0,.050,abs(p.z));
  float tangent=(p.x+.043-abs(p.z))*.707;
  vec2 uv=vec2(.5+tangent/.28,.5+(p.y-1.456)/.34);
  vec3 eye=texture2D(uRabbitEye,uv).rgb;
  diffuseColor.rgb=mix(diffuseColor.rgb,eye,orbit);coverage*=1.-orbit;filled=max(filled,orbit);
  float neck=1.-smoothstep(1.315,1.354,p.y);
  vec3 fur=texture2D(uRabbitCloth,vec2(.25+.13*sin(atan(p.z,p.x+.05)),.25+.45*clamp((p.y-1.25)/.1,0.,1.))).rgb;
  diffuseColor.rgb=mix(diffuseColor.rgb,fur,neck);coverage*=1.-neck;filled=max(filled,neck);
 }
 if(abs(vPaintPart-9.)<.1){
  float a=atan(p.z/.131,(p.x+.04)/.12);
  float center=1.2902-.0328*pow(max(0.,cos(a)),3.),width=.0208+.0144*pow(sin(a),2.);
  float t=clamp(.5+(p.y-center)/width,0.,1.);
  vec2 uv=vec2(.75+.18*sin(a),.43+.23*t+.018*sin(2.*a));
  diffuseColor.rgb=texture2D(uRabbitCloth,uv).rgb*(.88+.12*max(0.,n.y));coverage=0.;filled=1.;
 }
 if(abs(vPaintPart-2.)<.1){
  // The neutral forearm hides the outer hip. Continue unobscured trouser
  // painting through it with a gradual transition, never the arm outline.
  float hip=smoothstep(.17,.22,abs(p.z))*smoothstep(.57,.64,p.y)*(1.-smoothstep(.86,.91,p.y))*smoothstep(.15,.55,abs(n.z));
  float across=sign(p.z)*(.175+clamp(p.x,-.095,.095)*.75);
  vec2 uv=vec2((.5-across/.975)/4.,.5+(.54+(p.y-.60)*.85-.875)/1.95);
  diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(uModelPaint,uv).rgb,hip);coverage*=1.-hip;filled=max(filled,hip);
 }
 if(vPaintPart>9.5){
  vec2 uv=vec2((.5-p.z/.975)/4.,.5+(p.y-.875)/1.95);
  vec3 original=texture2D(uModelPaint,uv).rgb;
  float red=step(2.1,original.r/max(.001,max(original.g,original.b)));
  vec3 edge=texture2D(uRabbitCloth,vec2(.75+clamp(p.z*2.,-.16,.16),.48+clamp((p.y-1.20)*.9,-.12,.12))).rgb;
  diffuseColor.rgb=mix(edge,original,red*smoothstep(.1,.6,n.x))*(.88+.12*max(0.,n.x));coverage=0.;filled=1.;
 }
 `,dispose(){texture.dispose();eyeTexture.dispose();}};
}
