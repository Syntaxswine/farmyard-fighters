import * as T from './vendor/three.module.js';
import {createModelPaint} from './horse-model-paint.js';

// These two silhouettes need their own registered garment paintings. Retain the
// original species painting on every exposed skin, feather and facial surface.
export async function applyTailoredRedHat(renderer,material,texture,profile){
 const response=await fetch('./'+profile.file);if(!response.ok)throw Error('Tailored uniform registration failed');
 const donor=profile.create(await response.json()),registration=createModelPaint(renderer,donor,texture,{species:profile.id,frame:profile.frame});
 const bird=profile.id==='hen',f=profile.frame,previous=material.onBeforeCompile,key=material.customProgramCacheKey;
 texture.colorSpace=T.SRGBColorSpace;
 material.userData.textureBudget={fragment:(material.userData.textureBudget?.fragment||0)+2,vertex:material.userData.textureBudget?.vertex||0};
 material.customProgramCacheKey=()=>key.call(material)+'-tailored-red-hat-v1';
 material.onBeforeCompile=shader=>{
  previous(shader);Object.assign(shader.uniforms,{uFactionPaint:{value:texture},uFactionOwner:{value:registration.target.texture}});
  shader.fragmentShader='uniform sampler2D uFactionPaint,uFactionOwner;\n'+shader.fragmentShader;
  const code=`
   vec3 factionSwatch(vec2 pixel){return texture2D(uFactionPaint,vec2(pixel.x/1774.,1.-pixel.y/887.)).rgb;}
   vec4 factionProjection(vec3 q,vec3 n,float part,float view){
    float across=view<.5?-q.z:(view<1.5?q.x:(view<2.5?q.z:-q.x));
    float facing=view<.5?n.x:(view<1.5?n.z:(view<2.5?-n.x:-n.z));
    vec2 uv=vec2((view+.5+across/${f.width})/4.,.5+(q.y-${f.centerY})/${f.height});
    vec3 color=texture2D(uFactionPaint,uv).rgb;
    vec4 owner=texture2D(uFactionOwner,uv);float id=owner.r*255.;
    float same=1.-step(.25,abs(id-part));
    float weight=pow(max(.18,facing),4.)*same;
    return vec4(color*weight,weight);
   }
  `;
  shader.fragmentShader=shader.fragmentShader.replace('void main() {',code+'\nvoid main() {');
  shader.fragmentShader=shader.fragmentShader.replace('if(uPaintDebug>.5)',`
   if(${bird?'abs(vPaintPart-6.)<.1||abs(vPaintPart-7.)<.1||abs(vPaintPart-13.)<.1||((abs(vPaintPart-8.)<.1||abs(vPaintPart-9.)<.1)&&p.y>.96)':'vPaintPart<2.5'}){
    vec4 cloth=factionProjection(p,n,vPaintPart,0.)+factionProjection(p,n,vPaintPart,1.)+factionProjection(p,n,vPaintPart,2.)+factionProjection(p,n,vPaintPart,3.);
    vec3 olive=factionSwatch(vec2(${bird?'180.+clamp(p.x*50.,-6.,6.),335.+clamp(p.y*8.,-6.,6.)':'1107.+clamp(p.x*200.+p.z*20.,-35.,35.),320.+clamp((1.05-p.y)*220.,-35.,35.)'}));
    vec3 brown=factionSwatch(vec2(${bird?'218.':'1160.'}+clamp(p.x*80.+p.z*100.,-20.,20.),${bird?'512.':'530.'}+clamp((.65-p.y)*95.,-25.,25.)));
    vec3 fallback=${bird?'abs(vPaintPart-7.)<.1||abs(vPaintPart-13.)<.1':'abs(vPaintPart-2.)<.1'}?brown:olive;
    vec3 color=mix(fallback,cloth.rgb/max(.00001,cloth.a),smoothstep(.002,.02,cloth.a));
    ${bird?`if(abs(vPaintPart-13.)<.1)color=brown*(.55+.75*dot(diffuseColor.rgb,vec3(.30,.59,.11)));
    if(abs(vPaintPart-7.)<.1){float pale=1.-smoothstep(1.4,1.7,color.r/max(.001,color.g));color=mix(color,brown,pale);}`:`if(vPaintPart<1.5){float flank=smoothstep(.16,.22,abs(p.z))*(1.-smoothstep(.18,.25,abs(p.x)))*smoothstep(.88,.91,p.y)*(1.-smoothstep(1.04,1.11,p.y));color=mix(color,olive,flank);color=mix(brown,color,smoothstep(.885,.925,p.y));}
    if(abs(vPaintPart-2.)<.1){float hip=smoothstep(.22,.27,abs(p.z))*(1.-smoothstep(.14,.20,abs(p.x)))*smoothstep(.60,.65,p.y)*(1.-smoothstep(.88,.93,p.y));vec3 trousers=factionSwatch(vec2(165.+clamp(p.x*200.,-20.,20.),580.+clamp((.80-p.y)*250.,-25.,40.)));color=mix(color,trousers,hip);}
    float rearBuckle=(1.-smoothstep(-.17,-.12,p.x))*(1.-smoothstep(.045,.07,abs(p.z)))*smoothstep(.875,.895,p.y)*(1.-smoothstep(.955,.975,p.y));vec3 belt=factionSwatch(vec2(1060.+p.z*100.,411.+(p.y-.92)*50.));color=mix(color,belt,rearBuckle);`}
    diffuseColor.rgb=color;coverage=0.;filled=1.;
   }
   ${bird?`if(vPaintPart<1.5){float tieGhost=(1.-smoothstep(-.22,-.17,p.x))*(1.-smoothstep(.09,.12,abs(p.z)))*smoothstep(.65,.68,p.y)*(1.-smoothstep(.81,.85,p.y));float pale=(1.-smoothstep(1.4,1.7,diffuseColor.r/max(.001,diffuseColor.g)))*smoothstep(.3,.45,diffuseColor.g);vec3 feather=texture2D(uModelPaint,vec2((1170.+p.z*120.)/1774.,1.-(570.+(p.y-.72)*300.)/887.)).rgb;float sideGhost=smoothstep(.235,.26,abs(p.z))*(1.-smoothstep(.31,.34,abs(p.z)))*(1.-smoothstep(.10,.15,abs(p.x)))*smoothstep(.62,.68,p.y)*(1.-smoothstep(.81,.86,p.y))*pale;diffuseColor.rgb=mix(diffuseColor.rgb,feather,max(tieGhost,sideGhost));float edge=smoothstep(.12,.19,abs(p.z))*smoothstep(.82,.87,p.y)*(1.-smoothstep(1.20,1.24,p.y))*smoothstep(.20,.35,diffuseColor.g)*(1.-smoothstep(1.5,1.8,diffuseColor.r/max(.001,diffuseColor.g)));vec3 cloth=factionSwatch(vec2(180.+p.x*12.,335.+p.z*12.));diffuseColor.rgb=mix(diffuseColor.rgb,cloth,edge);}`:`if(abs(vPaintPart-7.)<.1){float collar=(1.-smoothstep(1.395,1.415,p.y))*smoothstep(1.255,1.28,p.y)*(1.-smoothstep(-.015,.03,p.x));vec3 cloth=factionSwatch(vec2(1100.+p.z*180.,210.+clamp((1.34-p.y)*100.,-10.,10.)));diffuseColor.rgb=mix(diffuseColor.rgb,cloth,collar);coverage*=1.-collar;filled=max(filled,collar);}
   if(abs(vPaintPart-3.)<.1||abs(vPaintPart-5.)<.1){float cuff=smoothstep(.935,.99,p.y);vec3 cloth=factionSwatch(vec2(55.+p.x*75.,370.+(p.y-1.02)*60.));diffuseColor.rgb=mix(diffuseColor.rgb,cloth,cuff);coverage*=1.-cuff;filled=max(filled,cuff);}`}
   if(uPaintDebug>.5)`);
 };
 material.needsUpdate=true;return ()=>{registration.dispose();donor.skeleton.dispose();donor.dispose();};
}
