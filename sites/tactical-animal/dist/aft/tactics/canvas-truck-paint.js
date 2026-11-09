import * as T from './vendor/three.module.js';
import {paintValidity} from './horse-model-paint.js';
export const TRUCK_PAINT='../assets/environment/painted-study/canvas-truck-paint-v1.png';
export const FRAME={size:5.4,center:[0,1.2,0],distance:9,near:.1,far:20};
export function truckPaintCameras(){return [[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[0,1,0],[0,-1,0]].map((d,i)=>{
 const c=new T.OrthographicCamera(-FRAME.size/2,FRAME.size/2,FRAME.size/2,-FRAME.size/2,FRAME.near,FRAME.far);
 if(i>=4)c.up.set(0,0,i===4?-1:1);c.position.fromArray(FRAME.center).add(new T.Vector3(...d).multiplyScalar(FRAME.distance));c.lookAt(...FRAME.center);c.updateMatrixWorld(true);return c;
});}
export function createTruckPaint(renderer,truck,texture){
 texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;
 const canvas=document.createElement('canvas');canvas.width=texture.image.width;canvas.height=texture.image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(texture.image,0,0);
 const mask=new T.DataTexture(paintValidity(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height),canvas.width,canvas.height,T.RedFormat);mask.flipY=true;mask.needsUpdate=true;
 const cameras=truckPaintCameras();
 const ranges=[[0,.3125],[.3125,.71],[.71,1],[0,.335],[.335,2/3],[2/3,1]],calibration=cameras.map((camera,i)=>{
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
 const patches={body:[832,270,42,34],canvas:[729,188,40,52],tire:[590,345,12,28],metal:[1127,794,62,12],glass:[158,210,35,21],lamps:[151,249,12,12],wood:[1120,696,80,33]};
 const debug={value:0},mats=truck.parts.map((p,i)=>new T.ShaderMaterial({toneMapped:false,uniforms:{art:{value:texture},validity:{value:mask},visibility:{value:target.texture},part:{value:i+1},swatch:{value:new T.Vector4(...patches[p.userData.material])},debug,base:{value:new T.Color({body:0x697851,canvas:0xb9a16d,tire:0x302c28,metal:0x514b3e,glass:0x52676d,lamps:0xcbb785,wood:0x775534}[p.userData.material||p.name]||0x807762)},calibration:{value:calibration},views:{value:cameras.map(c=>new T.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse))},dirs:{value:[[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[0,1,0],[0,-1,0]].map(v=>new T.Vector3(...v))}},
 vertexShader:'varying vec3 pos,norm;void main(){pos=position;norm=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`uniform sampler2D art,validity,visibility;uniform mat4 views[6];uniform vec4 calibration[6];uniform vec3 dirs[6],base;uniform vec4 swatch;uniform float part,debug;varying vec3 pos,norm;
 void main(){vec3 color=vec3(0.);float total=0.;for(int i=0;i<6;i++){vec4 clip=views[i]*vec4(pos,1.);vec3 q=clip.xyz/clip.w*.5+.5;vec2 uv=(q.xy+vec2(float(i-3*(i/3)),float(1-i/3)))/vec2(3.,2.);vec4 vis=texture2D(visibility,uv);vec2 paintUV=uv*calibration[i].xy+calibration[i].zw;float depth=(vis.g*255.*256.+vis.b*255.)/65535.;float weight=pow(max(dot(normalize(norm),dirs[i]),0.),5.);if(abs(vis.r*255.-part)<.5&&abs(depth-q.z)<.0015&&texture2D(validity,paintUV).r>.8){color+=texture2D(art,paintUV).rgb*weight;total+=weight;}}
 float direct=total; if(total<.00001){for(int i=0;i<6;i++){vec4 clip=views[i]*vec4(pos,1.);vec3 q=clip.xyz/clip.w*.5+.5;vec2 uv=(q.xy+vec2(float(i-3*(i/3)),float(1-i/3)))/vec2(3.,2.);vec2 puv=uv*calibration[i].xy+calibration[i].zw;vec4 vis=texture2D(visibility,uv);float w=pow(abs(dot(normalize(norm),dirs[i])),5.);if(abs(vis.r*255.-part)<.5&&texture2D(validity,puv).r>.8){color+=texture2D(art,puv).rgb*w;total+=w;}}} if(total<.00001){vec2 local=fract(vec2(pos.x*.39+pos.y*.13,pos.z*.55+pos.y*.25));vec2 samplePixel=swatch.xy+local*swatch.zw;vec2 sampleUV=vec2(samplePixel.x/1536.,1.-samplePixel.y/1024.);if(texture2D(validity,sampleUV).r>.8){color=texture2D(art,sampleUV).rgb;total=1.;}}color=total>.00001?color/total:base;if(debug>.5)color=direct>.00001?vec3(.12,.7,.24):(total>.00001?vec3(.08,.23,1.):vec3(1.,0.,.7));gl_FragColor=vec4(color,1.);#include <colorspace_fragment>
 }`.replace(';#include',';\n#include')
 }));
 return {materials:mats,debug,dispose(){mats.forEach(m=>m.dispose());target.dispose();mask.dispose();}};
}
