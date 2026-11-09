import * as T from './vendor/three.module.js';
import {paintValidity} from './horse-model-paint.js';
export const machinePaintPath=kind=>'../assets/environment/factory-machines/'+kind+'-paint-v'+(kind==='press'?2:1)+'.png';
export const FRAME={size:3.5,center:[0,1.25,0],distance:9,near:.1,far:20};
export function machinePaintCameras(){return [[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[0,1,0],[0,-1,0]].map((d,i)=>{
 const c=new T.OrthographicCamera(-FRAME.size/2,FRAME.size/2,FRAME.size/2,-FRAME.size/2,FRAME.near,FRAME.far);
 if(i>=4)c.up.set(0,0,i===4?-1:1);c.position.fromArray(FRAME.center).add(new T.Vector3(...d).multiplyScalar(FRAME.distance));c.lookAt(...FRAME.center);c.updateMatrixWorld(true);return c;
});}
export function createMachinePaint(renderer,truck,texture,{lit=false}={}){
 texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;
 const canvas=document.createElement('canvas');canvas.width=texture.image.width;canvas.height=texture.image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(texture.image,0,0);
 const mask=new T.DataTexture(paintValidity(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height),canvas.width,canvas.height,T.RedFormat);mask.flipY=true;mask.needsUpdate=true;
 const cameras=machinePaintCameras();
 const ranges=[[0,1/3],[1/3,2/3],[2/3,1],[0,1/3],[1/3,2/3],[2/3,1]],calibration=cameras.map((camera,i)=>{
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  const pixels=mask.image.data,w=canvas.width,h=canvas.height;
  for(let y=Math.floor(i/3)*h/2;y<(Math.floor(i/3)+1)*h/2;y++)for(let x=Math.ceil(ranges[i][0]*w);x<ranges[i][1]*w;x++)if(pixels[y*w+x]>0){xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
  const artMin=new T.Vector2(xmin/w,1-ymax/h),artMax=new T.Vector2(xmax/w,1-ymin/h),lo=new T.Vector2(Infinity,Infinity),hi=new T.Vector2(-Infinity,-Infinity),v=new T.Vector3();
  truck.parts.forEach(p=>{const a=p.geometry.attributes.position;for(let k=0;k<a.count;k++){v.fromBufferAttribute(a,k).project(camera);const uv=new T.Vector2((v.x*.5+.5+i%3)/3,(v.y*.5+.5+1-Math.floor(i/3))/2);lo.min(uv);hi.max(uv);}});
  const scale=artMax.sub(artMin).divide(hi.sub(lo));return new T.Vector4(scale.x,scale.y,artMin.x-lo.x*scale.x,artMin.y-lo.y*scale.y);
 });
 const scene=new T.Scene(),temp=[];
 truck.parts.forEach((p,i)=>{const m=new T.ShaderMaterial({uniforms:{id:{value:(i+1)/255}},vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform float id;void main(){float d=floor(gl_FragCoord.z*65535.+.5);gl_FragColor=vec4(id,floor(d/256.)/255.,mod(d,256.)/255.,1.);}',toneMapped:false});temp.push(m);scene.add(new T.Mesh(p.geometry,m));});
 const target=new T.WebGLRenderTarget(1536,1024,{minFilter:T.NearestFilter,magFilter:T.NearestFilter}),ratio=renderer.getPixelRatio(),state={target:renderer.getRenderTarget(),color:renderer.getClearColor(new T.Color()),alpha:renderer.getClearAlpha(),viewport:renderer.getViewport(new T.Vector4()),scissor:renderer.getScissor(new T.Vector4()),test:renderer.getScissorTest(),tone:renderer.toneMapping,space:renderer.outputColorSpace};
 renderer.setRenderTarget(target);renderer.toneMapping=T.NoToneMapping;renderer.outputColorSpace=T.LinearSRGBColorSpace;renderer.setClearColor(0,0);renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);
 cameras.forEach((c,i)=>{const x=i%3*512/ratio,y=(1-Math.floor(i/3))*512/ratio;renderer.setViewport(x,y,512/ratio,512/ratio);renderer.setScissor(x,y,512/ratio,512/ratio);renderer.render(scene,c);});
 renderer.setRenderTarget(state.target);renderer.setClearColor(state.color,state.alpha);renderer.setViewport(state.viewport);renderer.setScissor(state.scissor);renderer.setScissorTest(state.test);renderer.toneMapping=state.tone;renderer.outputColorSpace=state.space;temp.forEach(m=>m.dispose());
 // Explicit same-material paint swatches cover surfaces absent from all six views.
 // These are reused artwork, never reported as visibility-verified projection.
 // Derive a same-part fallback patch from the actual visibility render.
 // Broad, inspected steel patches from the painted underside views supply hidden working surfaces.
 // Keep these visibly reported as reused paint, rather than pretending they are registered views.
 const steel={lathe:[1230,760,70,110],mill:[1240,775,75,100],press:[1170,770,48,130]}[truck.root.name];
 const patches={body:({lathe:[376,225,40,48],mill:[344,177,40,64],press:[252,156,40,64]})[truck.root.name],metal:steel,dark:steel,brass:[steel[0],steel[1],24,24],lamps:steel};
 const details={lathe:{dial:[237,302,19,19],rim:[357,185,8,7],centers:[[.471,1.297,-1,.0861],[.625,.817,.29,.0451]]},mill:{dial:[789,144,12,12],rim:[716,91,8,6],centers:[[.459,1.827,-.41,.0779],[.379,2.057,.53,.0533]]},press:{dial:[1255,175,15,15],rim:[1273,194,4,8],centers:[[.835,1.677,-.15,.0902],[.835,1.677,-.15,.0902]]}}[truck.root.name];
 const debug={value:0};let mats=truck.parts.map((p,i)=>new T.ShaderMaterial({toneMapped:false,uniforms:{art:{value:texture},validity:{value:mask},visibility:{value:target.texture},part:{value:i+1},detailMode:{value:p.userData.material==='brass'?2:p.userData.material==='lamps'?1:0},isPress:{value:truck.root.name==='press'?1:0},dial:{value:new T.Vector4(...details.dial)},rim:{value:new T.Vector4(...details.rim)},gaugeCenters:{value:details.centers.map(a=>new T.Vector4(...a))},steelOnly:{value:p.userData.material==='metal'?1:0},swatch:{value:new T.Vector4(...patches[p.userData.material])},debug,base:{value:new T.Color({body:0x697851,canvas:0xb9a16d,tire:0x302c28,metal:0x514b3e,glass:0x52676d,brass:0xad9064,dark:0x282a28,lamps:0xcbb785,wood:0x775534}[p.userData.material||p.name]||0x807762)},calibration:{value:calibration},views:{value:cameras.map(c=>new T.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse))},dirs:{value:[[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[0,1,0],[0,-1,0]].map(v=>new T.Vector3(...v))}},
 vertexShader:'varying vec3 pos,norm;void main(){pos=position;norm=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`uniform sampler2D art,validity,visibility;uniform mat4 views[6];uniform vec4 calibration[6];uniform vec3 dirs[6],base;uniform vec4 swatch;uniform float part,debug,steelOnly,detailMode,isPress;uniform vec4 dial,rim,gaugeCenters[2];varying vec3 pos,norm;
 bool materialMatch(vec3 c){return steelOnly<.5 || max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b))<.13;}
 void main(){vec3 color=vec3(0.);float total=0.;for(int i=0;i<6;i++){vec4 clip=views[i]*vec4(pos,1.);vec3 q=clip.xyz/clip.w*.5+.5;vec2 uv=(q.xy+vec2(float(i-3*(i/3)),float(1-i/3)))/vec2(3.,2.);vec4 vis=texture2D(visibility,uv);vec2 paintUV=uv*calibration[i].xy+calibration[i].zw;float depth=(vis.g*255.*256.+vis.b*255.)/65535.;float weight=pow(max(dot(normalize(norm),dirs[i]),0.),5.);if(abs(vis.r*255.-part)<.5&&abs(depth-q.z)<.0015&&texture2D(validity,paintUV).r>.8&&materialMatch(texture2D(art,paintUV).rgb)){color+=texture2D(art,paintUV).rgb*weight;total+=weight;}}
 float direct=total; if(total<.00001&&steelOnly<.5){for(int i=0;i<6;i++){vec4 clip=views[i]*vec4(pos,1.);vec3 q=clip.xyz/clip.w*.5+.5;vec2 uv=(q.xy+vec2(float(i-3*(i/3)),float(1-i/3)))/vec2(3.,2.);vec2 puv=uv*calibration[i].xy+calibration[i].zw;vec4 vis=texture2D(visibility,uv);float w=pow(abs(dot(normalize(norm),dirs[i])),5.);if(abs(vis.r*255.-part)<.5&&texture2D(validity,puv).r>.8&&materialMatch(texture2D(art,puv).rgb)){color+=texture2D(art,puv).rgb*w;total+=w;}}} if(total<.00001){vec2 local=fract(vec2(pos.x*1.7+pos.y*.8,pos.z*1.7+pos.y*.8));vec2 samplePixel=swatch.xy+local*swatch.zw;vec2 sampleUV=vec2(samplePixel.x/1536.,1.-samplePixel.y/1024.);if(texture2D(validity,sampleUV).r>.8){color=texture2D(art,sampleUV).rgb;total=1.;}}color=total>.00001?color/total:base;
 if(detailMode>1.5){vec2 px=rim.xy+fract(vec2(pos.y*3.,pos.z*3.))*rim.zw;color=texture2D(art,vec2(px.x/1536.,1.-px.y/1024.)).rgb;direct=0.;total=1.;}
 else if(detailMode>.5&&(isPress<.5||pos.x>.80)){vec4 c=gaugeCenters[0];if(distance(pos,gaugeCenters[1].xyz)<distance(pos,c.xyz))c=gaugeCenters[1];vec2 local=clamp(vec2(-(pos.z-c.z),pos.y-c.y)/c.w,vec2(-1.),vec2(1.));vec2 px=dial.xy+vec2(local.x,-local.y)*dial.zw;color=texture2D(art,vec2(px.x/1536.,1.-px.y/1024.)).rgb;direct=0.;total=1.;}
 if(debug>.5)color=direct>.00001?vec3(.12,.7,.24):(total>.00001?vec3(.08,.23,1.):vec3(1.,0.,.7));gl_FragColor=vec4(color,1.);#include <colorspace_fragment>
 }`.replace(';#include',';\n#include')
 }));
 if(lit)mats=mats.map(painted=>{
  // The gallery projection supplies albedo to the normal game lighting path.
  // Standard materials retain sunlight, local-light passes, shadows and fog.
  const material=new T.MeshStandardMaterial({color:0xffffff,roughness:.88,metalness:.05}),source=painted.fragmentShader.replace('void main(){','vec3 machinePigment(){').replace('gl_FragColor=vec4(color,1.);','return color;').replace('#include <colorspace_fragment>','');
  material.onBeforeCompile=shader=>{Object.assign(shader.uniforms,painted.uniforms);shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 pos,norm;').replace('#include <begin_vertex>','#include <begin_vertex>\npos=position;norm=normal;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+source).replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb *= machinePigment();');};
  material.customProgramCacheKey=()=>'factory-machine-painted-lit-v1';material.userData.textureBudget={fragment:3,vertex:0};painted.dispose();return material;
 });
 return {materials:mats,debug,dispose(){mats.forEach(m=>m.dispose());target.dispose();mask.dispose();}};
}
