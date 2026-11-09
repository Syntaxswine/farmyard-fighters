import * as T from './vendor/three.module.js';
import {createLightHorse} from './horse-light-model.js';
import {createModelPaint} from './horse-model-paint.js';
export const RED_HAT_UNIFORM_PAINT='../assets/characters/lowpoly-proof/red-hat-uniform-paint-v1.png';

// Preserve each animal's face/fur and detail layers. Only authored garment
// surfaces receive the shared, registered four-view faction painting.
export async function applyRedHatUniform(renderer,material,texture,profile){
 if(profile.id==='pig-foreman')return;
 const response=await fetch('./horse-10k-data.json');if(!response.ok)throw Error('Uniform registration mesh failed to load');
 const donor=createLightHorse(await response.json()),registration=createModelPaint(renderer,donor,texture);
 texture.colorSpace=T.SRGBColorSpace;
 const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey;
 material.customProgramCacheKey=()=>previousKey.call(material)+'-red-hats-v1';
 material.onBeforeCompile=shader=>{
  previous(shader);shader.uniforms.uRedHatUniform={value:texture};shader.uniforms.uRedHatOwners={value:registration.target.texture};
  shader.fragmentShader='uniform sampler2D uRedHatUniform,uRedHatOwners;\n'+shader.fragmentShader;
  const declarations=`
   vec4 redHatCloth(vec3 q,vec3 n,float view){
    float across=view<.5?-q.z:(view<1.5?q.x:(view<2.5?q.z:-q.x));
    float facing=view<.5?n.x:(view<1.5?n.z:(view<2.5?-n.x:-n.z));
    vec2 uv=vec2((view+.5+across/.925)/4.,.5+(q.y-.825)/1.85);
    vec3 color=texture2D(uRedHatUniform,uv).rgb;
    float owner=texture2D(uRedHatOwners,uv).r*255.;
    float garment=step(.5,owner)*(1.-step(2.5,owner));
    float chroma=max(max(color.r,color.g),color.b)-min(min(color.r,color.g),color.b);
    float weight=pow(max(.22,facing),3.)*smoothstep(.025,.065,chroma)*garment;
    return vec4(color*weight,weight);
   }
  `;
  shader.fragmentShader=shader.fragmentShader.replace('void main() {',declarations+'\nvoid main() {');
  const bird=profile.id==='hen',director=profile.id==='pig-director';
  const garment=bird?'abs(vPaintPart-6.)<.1||abs(vPaintPart-7.)<.1||abs(vPaintPart-13.)<.1':'vPaintPart<2.5'+(profile.id==='sheep'?'||abs(vPaintPart-9.)<.1':'')+(profile.id==='dog'?'||vPaintPart>15.5':'');
  shader.fragmentShader=shader.fragmentShader.replace('if(uPaintDebug>.5)',`
   if(${garment}){
    vec3 q=p;${director?'q.x*=.78;q.z*=.74;q.y-=.025;':''}${bird?'q.x*=.72;q.z*=.62;':''}
    vec4 uniformPaint=redHatCloth(q,n,0.)+redHatCloth(q,n,1.)+redHatCloth(q,n,2.)+redHatCloth(q,n,3.);
    vec3 safeShirt=texture2D(uRedHatUniform,vec2((1108.+q.x*60.+q.z*40.)/1774.,1.-(310.-(q.y-1.1)*160.)/887.)).rgb;
    vec3 safeTrousers=texture2D(uRedHatUniform,vec2((1180.+q.x*85.)/1774.,1.-(525.-(q.y-.65)*100.)/887.)).rgb;
    vec3 fallback=abs(vPaintPart-2.)<.1&&q.y<.90?safeTrousers:safeShirt;
    vec3 uniformColor=mix(fallback,uniformPaint.rgb/max(.00001,uniformPaint.a),smoothstep(.002,.04,uniformPaint.a));
    // The neutral arms conceal flank cloth. Use a clean back-panel footprint.
    float flank=smoothstep(.11,.17,abs(q.z))*(1.-smoothstep(.09,.17,abs(q.x)))*smoothstep(.73,.80,q.y)*(1.-smoothstep(1.02,1.10,q.y));
    vec3 panel=texture2D(uRedHatUniform,vec2((2.5+(.10+q.x*.4)/.925)/4.,.5+(.78+(q.y-.83)*.3-.825)/1.85)).rgb;
    panel=mix(panel,safeShirt,smoothstep(.88,.93,q.y));
    uniformColor=mix(uniformColor,panel,flank);
    // A sleeve armband must not be projected onto the torso behind that arm.
    float red=smoothstep(2.4,3.5,uniformColor.r/max(.001,uniformColor.g))*smoothstep(.95,1.0,q.y);
    float bandOwner=(1.-step(1.5,vPaintPart))*smoothstep(.20,.26,abs(q.z));
    float scarfOwner=smoothstep(1.13,1.20,q.y)*(1.-smoothstep(.06,.10,abs(q.z)))*smoothstep(.02,.08,q.x);
    uniformColor=mix(uniformColor,safeShirt,red*(1.-max(bandOwner,scarfOwner)));
    if(vPaintPart<1.5){float underarm=smoothstep(.12,.17,abs(q.z))*(1.-smoothstep(.22,.27,abs(q.z)))*(1.-smoothstep(.11,.16,abs(q.x)))*smoothstep(.87,.92,q.y)*(1.-smoothstep(1.10,1.16,q.y));uniformColor=mix(uniformColor,safeShirt,underarm);}
    ${bird?'':`if(vPaintPart<1.5){float roll=smoothstep(.22,.29,abs(p.z))*(1.-smoothstep(1.065,1.105,p.y));vec3 cloth=texture2D(uRedHatUniform,vec2((70.+p.x*80.)/1774.,1.-clamp(363.+(p.y-1.02)*120.,356.,373.)/887.)).rgb;uniformColor=mix(uniformColor,cloth,roll);}`}
    ${bird?`if(abs(vPaintPart-7.)<.1){float skirt=1.-smoothstep(.81,.86,p.y);vec3 cloth=texture2D(uRedHatUniform,vec2((.5+(.16+p.z*.28)/.925)/4.,.5+(.56+(p.y-.60)*.6-.825)/1.85)).rgb;uniformColor=mix(uniformColor,cloth,skirt);}if(abs(vPaintPart-6.)<.1){float red=smoothstep(1.15,1.5,uniformColor.r/max(.001,uniformColor.g));uniformColor=mix(uniformColor,safeShirt,red);}`:''}
    diffuseColor.rgb=uniformColor;coverage=0.;filled=1.;
   }
   ${bird?'':`if(abs(vPaintPart-3.)<.1||abs(vPaintPart-5.)<.1){float cuff=smoothstep(.935,.99,p.y);vec3 cloth=texture2D(uRedHatUniform,vec2((75.+p.x*80.)/1774.,1.-(363.+(p.y-1.02)*120.)/887.)).rgb;diffuseColor.rgb=mix(diffuseColor.rgb,cloth,cuff);coverage*=1.-cuff;filled=max(filled,cuff);}`}
   ${profile.id==='horse'?`if(abs(vPaintPart-7.)<.1){float collar=(1.-smoothstep(1.24,1.265,p.y))*(1.-smoothstep(-.12,-.07,p.x));vec3 cloth=texture2D(uRedHatUniform,vec2((1100.+p.z*200.)/1774.,1.-(270.+(1.24-p.y)*180.)/887.)).rgb;diffuseColor.rgb=mix(diffuseColor.rgb,cloth,collar);coverage*=1.-collar;filled=max(filled,collar);}`:''}
   ${bird?`if(abs(vPaintPart-8.)<.1||abs(vPaintPart-9.)<.1){
    float sleeve=smoothstep(.94,.965,p.y),band=smoothstep(1.005,1.025,p.y)*(1.-smoothstep(1.09,1.11,p.y));
    vec3 olive=texture2D(uRedHatUniform,vec2((1070.+p.x*180.)/1774.,1.-(310.-(p.y-1.1)*180.)/887.)).rgb;
    vec3 red=texture2D(uRedHatUniform,vec2((60.+p.x*70.)/1774.,1.-(319.+p.z*12.)/887.)).rgb;
    diffuseColor.rgb=mix(diffuseColor.rgb,mix(olive,red,band),sleeve);coverage*=1.-sleeve;filled=max(filled,sleeve);
   }`:''}
   if(uPaintDebug>.5)`);
 };
 material.needsUpdate=true;
 return ()=>{registration.dispose();donor.dispose();};
}
