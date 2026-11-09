import * as THREE from './vendor/three.module.js';

export const MODEL_PAINT='../assets/characters/lowpoly-proof/horse-worker-model-paint-v1.png';
// These are the exact neutral-reference cameras, independent of the viewing camera.
export const PAINT_FRAME={width:.925,height:1.85,centerY:.825,distance:4,near:.1,far:10};
export function paintCoordinates(p,view,frame=PAINT_FRAME){
 const across=[-p[2],p[0],p[2],-p[0]][view],toward=[p[0],p[2],-p[0],-p[2]][view];
 return {uv:[(view+across/frame.width+.5)/4,(p[1]-frame.centerY)/frame.height+.5],depth:(frame.distance-toward-frame.near)/(frame.far-frame.near)};
}

// Connected-background segmentation is a validity mask, not a change to the artwork.
// Interior grey paint stays valid; only neutral background connected to the image border
// is removed, with a two-pixel guard against painted silhouette drift/antialiasing.
export function paintValidity(rgba,width,height){
 const size=width*height,background=new Uint8Array(size),queue=new Int32Array(size);let head=0,tail=0;
 const neutral=i=>{const k=i*4,a=rgba[k],b=rgba[k+1],c=rgba[k+2];return Math.max(a,b,c)-Math.min(a,b,c)<24&&Math.min(a,b,c)>90&&Math.max(a,b,c)<180;};
 function add(i){if(!background[i]&&neutral(i)){background[i]=1;queue[tail++]=i;}}
 for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}for(let y=0;y<height;y++){add(y*width);add(y*width+width-1);}
 while(head<tail){const i=queue[head++],x=i%width;if(x>0)add(i-1);if(x<width-1)add(i+1);if(i>=width)add(i-width);if(i<size-width)add(i+width);}
 const valid=new Uint8Array(size);valid.fill(255);
 for(let i=0;i<size;i++)if(background[i]){const x=i%width,y=Math.floor(i/width);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<width&&yy>=0&&yy<height)valid[yy*width+xx]=0;}}
 return valid;
}

// Portraits may prepare this exact segmentation in a worker. Battle callers
// keep the original synchronous path; neither path changes the artwork.
export function textureValidity(texture){
 if(texture.userData.paintValidity)return texture.userData.paintValidity;
 const image=texture.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
 return paintValidity(context.getImageData(0,0,image.width,image.height).data,image.width,image.height);
}

// Portrait-only asynchronous preparation yields between identical atlas views.
// The synchronous path below remains the default for battle model callers.
function paintProjection(horse,frame){
 const scene=new THREE.Scene(),idMaterials=[];
 // Static copies use bind positions, so generating visibility never changes the rig's pose.
 for(let i=0;i<horse.parts.length;i++){
  const source=horse.parts[i],id=i+1,material=new THREE.ShaderMaterial({uniforms:{partId:{value:id}},vertexShader:'attribute vec3 paintPosition;void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(paintPosition,1.0);}',fragmentShader:'uniform float partId;void main(){float d=floor(gl_FragCoord.z*65535.0+.5);gl_FragColor=vec4(partId/255.0,floor(d/256.0)/255.0,mod(d,256.0)/255.0,1.0);}',toneMapped:false});
  const mesh=new THREE.Mesh(source.geometry,material);scene.add(mesh);idMaterials.push(material);
  source.geometry.setAttribute('paintPart',new THREE.Float32BufferAttribute(new Float32Array(source.geometry.attributes.position.count).fill(id),1));
 }
 const target=new THREE.WebGLRenderTarget(2048,1024,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthTexture:new THREE.DepthTexture(2048,1024,THREE.UnsignedIntType)});
 const camera=new THREE.OrthographicCamera(-frame.width/2,frame.width/2,frame.height/2,-frame.height/2,frame.near,frame.far);
 function draw(renderer,i){
 const oldTarget=renderer.getRenderTarget(),oldColor=renderer.getClearColor(new THREE.Color()),oldAlpha=renderer.getClearAlpha(),oldTone=renderer.toneMapping,oldSpace=renderer.outputColorSpace;
 const oldViewport=renderer.getViewport(new THREE.Vector4()),oldScissor=renderer.getScissor(new THREE.Vector4()),oldScissorTest=renderer.getScissorTest();
 const ratio=renderer.getPixelRatio();
 renderer.setRenderTarget(target);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(0,0);renderer.setScissorTest(false);if(i===0)renderer.clear();renderer.setScissorTest(true);
 // These setters use logical pixels even for a fixed-size render target.
 // Keep the visibility atlas at its actual texel dimensions on high-DPI screens.
 const angle=i*Math.PI/2;camera.position.set(frame.distance*Math.cos(angle),frame.centerY,frame.distance*Math.sin(angle));camera.lookAt(0,frame.centerY,0);camera.updateProjectionMatrix();renderer.setViewport(i*512/ratio,0,512/ratio,1024/ratio);renderer.setScissor(i*512/ratio,0,512/ratio,1024/ratio);renderer.render(scene,camera);
 renderer.setRenderTarget(oldTarget);renderer.outputColorSpace=oldSpace;renderer.toneMapping=oldTone;renderer.setClearColor(oldColor,oldAlpha);renderer.setViewport(oldViewport);renderer.setScissor(oldScissor);renderer.setScissorTest(oldScissorTest);
 }
 return {scene,camera,target,draw,disposeMaterials:()=>idMaterials.forEach(m=>m.dispose())};
}
export async function prepareModelPaintProjection(renderer,horse,frame=PAINT_FRAME,signal){
 const projection=paintProjection(horse,frame),space=renderer.outputColorSpace,tone=renderer.toneMapping;
 try{
  renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
  await renderer.compileAsync(projection.scene,projection.camera);
  for(let i=0;i<4;i++){await new Promise(resolve=>setTimeout(resolve,0));if(signal?.aborted)throw Error('Portrait load cancelled');projection.draw(renderer,i);}
  return projection.target;
 }catch(error){projection.target.dispose();throw error;}
 finally{renderer.outputColorSpace=space;renderer.toneMapping=tone;projection.disposeMaterials();}
}

export function createModelPaint(renderer,horse,texture,{species='horse',frame=PAINT_FRAME,tailTexture=null,earTexture=null,paintLayers=null,sceneLighting=false,preparedProjection=null}={}){
 const bovine=species==='bull'||species==='cow';
 if(earTexture){earTexture.colorSpace=THREE.SRGBColorSpace;earTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
 if(tailTexture){tailTexture.colorSpace=THREE.SRGBColorSpace;tailTexture.wrapS=THREE.RepeatWrapping;tailTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
 texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
 texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 const image=texture.image;
 const mask=new THREE.DataTexture(textureValidity(texture),image.width,image.height,THREE.RedFormat);
 mask.flipY=true;mask.minFilter=mask.magFilter=THREE.LinearFilter;mask.needsUpdate=true;
 const projection=preparedProjection?null:paintProjection(horse,frame);
 const target=preparedProjection||projection.target;
 if(projection){for(let i=0;i<4;i++)projection.draw(renderer,i);projection.disposeMaterials();}
 const debug={value:0},gripForearm={value:0};
 const material=sceneLighting?new THREE.MeshStandardMaterial({roughness:1}):new THREE.MeshBasicMaterial({toneMapped:false});
 material.userData.textureBudget={fragment:4+Number(!!earTexture)+Number(!!tailTexture)+Object.values(paintLayers?.uniforms||{}).filter(u=>u.value?.isTexture).length,vertex:1};
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{uModelPaint:{value:texture},uPaintDepth:{value:target.depthTexture},uPaintParts:{value:target.texture},uPaintMask:{value:mask},uPaintDebug:debug,uGripForearm:gripForearm});
  if(paintLayers)Object.assign(shader.uniforms,paintLayers.uniforms);
  if(earTexture){shader.uniforms.uEarPaint={value:earTexture};shader.fragmentShader='uniform sampler2D uEarPaint;\n'+shader.fragmentShader;}
  if(tailTexture){shader.uniforms.uTailPaint={value:tailTexture};shader.vertexShader='attribute vec3 paintTail; varying vec3 vTail;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTail=paintTail;');shader.fragmentShader='uniform sampler2D uTailPaint; varying vec3 vTail;\n'+shader.fragmentShader;}
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 paintPosition,paintNormal; attribute float paintPart; varying float vPaintPart; varying vec3 vPaintPosition; varying vec3 vPaintNormal;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPaintPosition=paintPosition;vPaintNormal=paintNormal;vPaintPart=paintPart;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   uniform sampler2D uModelPaint,uPaintDepth,uPaintParts,uPaintMask; uniform float uPaintDebug,uGripForearm;
   varying vec3 vPaintPosition,vPaintNormal; varying float vPaintPart;
   vec3 fallbackPaint(float part){
    ${species==='dog'?`if(part<1.5||part>15.5)return vec3(.18,.20,.055);if(part<2.5)return vec3(.22,.12,.055);if(part<8.5)return vec3(.47,.24,.07);if(part<12.5)return vec3(.52,.025,.015);return vec3(.14,.065,.03);`:''}
    ${species==='rabbit'?`if(part<1.5)return vec3(.72,.65,.49);if(part<2.5)return vec3(.16,.20,.07);if(part<8.5)return vec3(.34,.24,.15);return vec3(.52,.025,.015);`:''}
    ${species==='donkey'?`if(part<1.5)return vec3(.16,.19,.075);
    if(part<2.5)return vec3(.24,.13,.055);
    if(abs(part-3.)<.1||abs(part-5.)<.1)return vPaintPosition.y>.775?vec3(.34,.27,.19):vec3(.055,.039,.026);
    if(abs(part-4.)<.1||abs(part-6.)<.1)return vec3(.055,.039,.026);
    if(part<7.5)return vPaintPosition.x>.14?vec3(.67,.59,.44):vec3(.34,.27,.19);
    if(part<9.5)return vec3(.055,.039,.026);return vec3(.87,.47,.025);`:''}
    ${species==='sheep'?`if(part<1.5)return vec3(.72,.65,.49);
    if(part<2.5)return vec3(.30,.17,.075);
    if(abs(part-3.)<.1||abs(part-5.)<.1)return vPaintPosition.y>.775?vec3(.76,.66,.45):vec3(.075,.065,.050);
    if(abs(part-4.)<.1||abs(part-6.)<.1)return vPaintPosition.y>.112?vec3(.76,.66,.45):vec3(.075,.065,.050);
    if(part<7.5)return vPaintPosition.x>.0&&vPaintPosition.y<1.57?vec3(.23,.21,.17):vec3(.76,.66,.45);
    if(part<8.5)return vec3(.76,.66,.45);return vec3(.15,.18,.045);`:''}
    ${species==='hen'?`if(abs(part-3.)<.1||abs(part-5.)<.1)return vec3(.50,.035,.014);
    if(abs(part-4.)<.1||abs(part-11.)<.1||abs(part-12.)<.1)return vec3(.72,.35,.035);
    if(abs(part-6.)<.1)return vec3(.16,.18,.055);
    if(abs(part-7.)<.1||abs(part-13.)<.1)return vec3(.77,.67,.46);
    return vec3(.39,.125,.033);`:''}
    ${species==='pig-director'?`if(part<1.5)return abs(vPaintPosition.z)>.32?vec3(.67,.61,.43):vec3(.24,.040,.025);
    if(part<2.5)return vec3(.08,.065,.048);
    if(abs(part-3.)<.1||abs(part-5.)<.1)return vPaintPosition.y>.918?vec3(.67,.61,.43):(vPaintPosition.y<.775?vec3(.028,.023,.017):vec3(.72,.32,.23));
    if(part<6.5)return vec3(.028,.023,.017);
    return vec3(.72,.32,.23);`:''}
    ${species==='pig-foreman'?`if(part<1.5)return vec3(.18,.18,.065);
    if(part<2.5)return vec3(.13,.070,.032);
    if(abs(part-3.)<.1||abs(part-5.)<.1)return vPaintPosition.y>.918?vec3(.18,.18,.065):(vPaintPosition.y<.775?vec3(.028,.023,.017):vec3(.66,.29,.19));
    if(part<6.5)return vec3(.028,.023,.017);
    if(part<8.5)return vec3(.66,.29,.19);
    return vPaintPosition.y<1.555?vec3(.025,.020,.012):vec3(.28,.045,.015);
    `:''}
    ${species==='skunk'?`if(part<1.5)return vec3(.62,.33,.035);
    if(part<2.5)return vec3(.13,.17,.058);
    if(abs(part-3.0)<.1||abs(part-5.0)<.1)return vPaintPosition.y>.918?vec3(.62,.33,.035):vec3(.035,.028,.023);
    if(part<6.5)return vec3(.17,.085,.032);
    return vec3(.035,.028,.023);`:''}
    ${bovine?`if(part>8.5)return vec3(.55,.018,.012);if(part<1.5)return vec3(.67,.61,.43);
    if(part<2.5)return vec3(.09,.14,.10);
    if(abs(part-3.0)<.1||abs(part-5.0)<.1)return vPaintPosition.y>.918?vec3(.67,.61,.43):(vPaintPosition.y<.775?vec3(.065,.040,.025):vec3(.44,.18,.07));
    if(part<6.5)return vec3(.075,.050,.029);
    if(part<7.5)return vPaintPosition.y>1.54?vec3(.44,.28,.10):vec3(.44,.18,.07);
    return vPaintPosition.y<.415?vec3(.66,.49,.23):vec3(.38,.13,.038);`:''}
    ${species==='goat'?`if(part<1.5)return vec3(.52,.28,.055);
    if(part<2.5)return vec3(.13,.17,.058);
    if(abs(part-3.0)<.1||abs(part-5.0)<.1)return vPaintPosition.y>.918?vec3(.52,.28,.055):vec3(.60,.49,.30);
    if(part<6.5)return vec3(.10,.065,.035);
    if(part<7.5)return vPaintPosition.y>1.52?vec3(.25,.16,.078):vec3(.60,.49,.30);
    return vec3(.67,.56,.37);`:''}
    if(part<1.5)return vec3(.67,.61,.43);
    if(part<2.5)return vec3(.13,.17,.058);
    if(abs(part-3.0)<.1||abs(part-5.0)<.1)return vPaintPosition.y>.918?vec3(.67,.61,.43):(vPaintPosition.y<.775?vec3(.045,.033,.022):vec3(.38,.13,.038));
    if(part<6.5)return vec3(.075,.050,.029);
    if(part<7.5)return vec3(.38,.13,.038);
    return vec3(.060,.025,.009);
   }
   ${paintLayers?paintLayers.declarations:''}
   ${species==='cow'&&!paintLayers?`vec3 cowThroat(vec3 p){
    float a=atan(p.z,p.x+.055);
    vec2 uv=vec2((205.+7.*sin(a))/1774.,1.-clamp(210.-(p.y-1.28)*170.,190.,215.)/887.);
    return texture2D(uModelPaint,uv).rgb;
   }`:''}
   vec4 paintView(vec3 p,vec3 n,float view,bool direct){
    float across=view<.5?-p.z:(view<1.5?p.x:(view<2.5?p.z:-p.x));
    float toward=view<.5?p.x:(view<1.5?p.z:(view<2.5?-p.x:-p.z));
    float facing=view<.5?n.x:(view<1.5?n.z:(view<2.5?-n.x:-n.z));
    // The frontal painting owns the blaze; side paintings own cheeks/eyes.
    // This prevents two separately painted ridge edges from becoming two stripes.
    float blazeOwner=${species==='dog'||species==='rabbit'||species==='donkey'||species==='sheep'||species==='hen'||species==='goat'||species==='pig-foreman'||species==='pig-director'?'0.0':bovine?'(1.0-smoothstep(.024,.065,abs(p.z)))*smoothstep(1.435,1.455,p.y)*smoothstep(.0,.04,p.x)*step(6.5,vPaintPart)*step(vPaintPart,7.5)':'(1.0-smoothstep(.024,.065,abs(p.z)))*smoothstep(1.375,1.415,p.y)*smoothstep(.0,.04,p.x)*step(6.5,vPaintPart)*step(vPaintPart,7.5)'};
    facing=view<.5?mix(facing,1.0,blazeOwner):facing*(1.0-blazeOwner);
    ${species==='donkey'?`// Each orbital surface has one profile owner, including the frontal turn.
    float eyeOwner=(1.-smoothstep(.75,1.2,length((p.xy-vec2(.027,1.397))/vec2(.065,.038))))*smoothstep(.036,.059,abs(p.z))*step(6.5,vPaintPart)*step(vPaintPart,7.5);
    float sideView=p.z>0.?1.:3.;
    facing=abs(view-sideView)<.1?mix(facing,1.,eyeOwner):facing*(1.-eyeOwner);`:''}
    ${species==='hen'?`// One angular mapping around each orbit prevents front/profile
    // projections from painting two irises on the same curved cheek.
    float eyeOwner=smoothstep(.020,.040,abs(p.z))*smoothstep(1.37,1.395,p.y)*(1.-smoothstep(1.495,1.515,p.y))*smoothstep(-.03,0.,p.x)*step(1.5,vPaintPart)*step(vPaintPart,2.5);
    float sideView=p.z>0.?1.:3.;
    facing=abs(view-sideView)<.1?mix(facing,1.,eyeOwner):facing*(1.-eyeOwner);`:''}
    ${species==='pig-director'?`// Each profile owns its eye, preserving one registered iris per orbit.
    float eyeOwner=(1.-smoothstep(.75,1.15,length((p.xy-vec2(.093,1.530))/vec2(.042,.026))))*smoothstep(.08,.11,abs(p.z))*step(6.5,vPaintPart)*step(vPaintPart,7.5);
    float sideView=p.z>0.?1.:3.;
    facing=abs(view-sideView)<.1?mix(facing,1.,eyeOwner):facing*(1.-eyeOwner);`:''}
    ${species==='pig-foreman'?`// Profile paint owns each eye and the visor's top. The front badge
    // shares a height with the visor but must remain on the vertical cap band.
    float eyeOwner=(1.-smoothstep(.75,1.15,length((p.xy-vec2(.083,1.467))/vec2(.042,.028))))*smoothstep(.075,.108,abs(p.z))*step(6.5,vPaintPart)*step(vPaintPart,7.5);
    float visor=smoothstep(.12,.17,p.x)*(1.-smoothstep(1.59,1.61,p.y))*max(smoothstep(.3,.65,n.y),smoothstep(.17,.20,p.x))*step(8.5,vPaintPart);
    float badge=(1.-smoothstep(.026,.043,abs(p.z)))*smoothstep(.065,.10,p.x)*smoothstep(1.567,1.580,p.y)*(1.-smoothstep(1.632,1.649,p.y))*step(8.5,vPaintPart)*(1.-visor);
    facing=view<.5?mix(facing,1.,badge):facing*(1.-badge);
    float owner=max(eyeOwner,visor),sideView=p.z>0.?1.:3.;
    facing=abs(view-sideView)<.1?mix(facing,1.,owner):facing*(1.-owner);`:''}
    ${species==='skunk'?`float eyeOwner=(1.0-smoothstep(.75,1.15,length((p.xy-vec2(.050,1.474))/vec2(.045,.033))))*smoothstep(.060,.084,abs(p.z))*step(6.5,vPaintPart)*step(vPaintPart,7.5);
    float sideView=p.z>0.0?1.0:3.0;
    facing=abs(view-sideView)<.1?mix(facing,1.0,eyeOwner):facing*(1.0-eyeOwner);`:''}
    ${bovine?`// Register each eye from its own profile without competing front contours.
    float eyeOwner=(1.0-smoothstep(.75,1.15,length((p.xy-vec2(.050,1.447))/vec2(.050,.035))))*smoothstep(.070,.100,abs(p.z))*step(6.5,vPaintPart)*step(vPaintPart,7.5);
    float sideView=p.z>0.0?1.0:3.0;
    facing=abs(view-sideView)<.1?mix(facing,1.0,eyeOwner):facing*(1.0-eyeOwner);`:''}
    ${species==='sheep'?`float eyeOwner=(1.-smoothstep(.70,1.15,length((p.xy-vec2(.075,1.505))/vec2(.090,.055))))*smoothstep(.058,.086,abs(p.z))*step(6.5,vPaintPart)*step(vPaintPart,7.5);
    float sideView=p.z>0.?1.:3.;facing=abs(view-sideView)<.1?mix(facing,1.,eyeOwner):facing*(1.-eyeOwner);`:''}
    ${species==='goat'?`// Side paintings own the eye and horn markings; frontal projection otherwise
    // smears their separately painted contours across the oblique surface.
    float eyeOwner=(1.0-smoothstep(.75,1.15,length((p.xy-vec2(.048,1.485))/vec2(.055,.040))))*smoothstep(.047,.065,abs(p.z));
    float hornOwner=smoothstep(1.54,1.57,p.y)*(1.0-smoothstep(-.055,-.025,p.x));
    // (and the throat behind the beard: the front painting reaches its sides edge-on beside the
    // beard and laid the beard's light painted outline along them: the user, "right where the
    // green line is you can still see a lighter colored line")
    float throatOwner=smoothstep(-.01,.01,p.x)*(1.0-smoothstep(.06,.075,p.x))*smoothstep(1.265,1.28,p.y)*(1.0-smoothstep(1.335,1.35,p.y))*(1.0-smoothstep(.045,.06,abs(p.z)));
    float owner=max(max(eyeOwner,hornOwner),throatOwner)*step(6.5,vPaintPart)*step(vPaintPart,7.5);
    float sideView=p.z>0.0?1.0:3.0;
    facing=abs(view-sideView)<.1?mix(facing,1.0,owner):facing*(1.0-owner);`:''}
    vec2 local=vec2(across/${frame.width.toFixed(6)}+.5,(p.y-${frame.centerY.toFixed(6)})/${frame.height.toFixed(6)}+.5),uv=vec2((view+local.x)/4.0,local.y);
    float depth=(${frame.distance.toFixed(6)}-toward-${frame.near.toFixed(6)})/${(frame.far-frame.near).toFixed(6)},visible=1.0-smoothstep(.002/${(frame.far-frame.near).toFixed(6)},.009/${(frame.far-frame.near).toFixed(6)},depth-texture2D(uPaintDepth,uv).r);
    float sourcePart=texture2D(uPaintParts,uv).r*255.0;
    float samePart=1.0-step(.4,abs(sourcePart-vPaintPart));
    // A sleeve underlap may borrow shirt paint, but never skin or overall paint.
    ${species!=='hen'?`if(!direct&&p.y>.925&&(abs(vPaintPart-3.0)<.1||abs(vPaintPart-5.0)<.1))samePart=max(samePart,1.0-step(.4,abs(sourcePart-1.0)));`:''}
    vec2 colorUV=uv;
    ${species==='donkey'?`if(abs(view-sideView)<.1){float eyeX=.027+.08*(atan(p.x+.015,abs(p.z))-.48);colorUV.x+=(view<2.?1.:-1.)*(eyeX-p.x)/(${frame.width.toFixed(6)}*4.)*eyeOwner;}`:''}
    ${species==='sheep'?`
    // Wrap each profile iris around its orbital surface, with one owner per eye.
    if(abs(view-sideView)<.1){float eyeX=.052+.10*(atan(p.x+.012,abs(p.z))-.96);colorUV.x+=(view<2.?1.:-1.)*(eyeX-p.x)/(${frame.width.toFixed(6)}*4.)*eyeOwner;}
    `:''}
    ${species==='hen'?`// The narrow painted waistband sits slightly above the grey strip.
    if(abs(vPaintPart-13.)<.1)colorUV.y+=(p.x<-.24&&abs(p.z)<.13)?-.024:.006;
    if(abs(view-sideView)<.1){float eyeX=.063+.10*(atan(p.x-.005,abs(p.z))-.65);colorUV.x+=(view<2.?1.:-1.)*(eyeX-p.x)/(${frame.width.toFixed(6)}*4.)*eyeOwner;colorUV.y+=.012*eyeOwner;}
    `:''}
    ${species==='pig-foreman'?`// The painted soles end about six pixels above the registered grey soles.
    if(abs(vPaintPart-4.)<.1||abs(vPaintPart-6.)<.1)colorUV.y+=6./887.;
    // Lift the badge onto the cap front so the physical visor does not occlude it.
    if(view<.5)colorUV.y-=.018/${frame.height.toFixed(6)}*badge;`:''}
    ${species==='skunk'?`// ImageGen preserved scale but translated the painted figures 33 pixels
    // upward in the 887px sheet. Register color/mask only; depth stays geometric.
    colorUV.y+=33.0/887.0;`:''}
    ${species==='goat'?`// Register the painted iris onto the visible orbital shelf, rather than
    // letting it fall entirely into the recessed lower surface at game elevation.
    if(abs(view-sideView)<.1){colorUV.x+=(view<2.0?-.006:.006)/(${frame.width.toFixed(6)}*4.0)*eyeOwner;colorUV.y-=.014/${frame.height.toFixed(6)}*eyeOwner;}`:''}
    vec3 color=texture2D(uModelPaint,colorUV).rgb;
    float valid=texture2D(uPaintMask,colorUV).r;
    // (borrowed paint comes only from the paintings that face the surface: the goat's throat, in no
    // painting, took the back painting's scarf, as if seen through the neck: the user, "why does it
    // have a hard outline and look like you can see through it to a scarf underneath it?")
    float weight=(direct?pow(max(0.0,facing),4.0)*visible:pow(max(.4,facing),2.0)${species==='goat'?'*step(-.05,facing)':''})*samePart*valid;
    ${species==='pig-foreman'?`// Hidden rear belt surfaces may reuse rear/side leather, never the
    // frontal buckle. Restrict the converse too to preserve the front artwork.
    if(!direct&&abs(vPaintPart-2.)<.1){
     if(view<.5)weight*=smoothstep(-.10,-.04,p.x);
     if(abs(view-2.)<.1)weight*=1.-smoothstep(.04,.10,p.x);
    }
    if(!direct&&visor>.01&&abs(view-sideView)>.1)weight*=1.-visor;`:''}
    ${species==='skunk'?`// The ears and crown share one connected mesh. Profile ear interiors
    // must not be reused across the hidden crown between the ears.
    float crown=smoothstep(1.54,1.565,p.y)*(1.-smoothstep(.045,.070,abs(p.z)))*step(6.5,vPaintPart)*step(vPaintPart,7.5);
    if(abs(view-1.)<.1||abs(view-3.)<.1)weight*=1.-crown;`:''}
    weight*=step(0.0,local.x)*step(local.x,1.0)*step(0.0,local.y)*step(local.y,1.0);
    return vec4(color*weight,weight);
   }
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 p=vPaintPosition,n=normalize(vPaintNormal);
   vec4 paint=paintView(p,n,0.0,true)+paintView(p,n,1.0,true)+paintView(p,n,2.0,true)+paintView(p,n,3.0,true);
   float coverage=smoothstep(.002,.025,paint.a);
   // Hidden inner surfaces reuse their own garment's front/back paint. This is
   // deliberately separate from visibility-verified projection and shown blue.
   vec3 fillPosition=p;
   ${species!=='hen'?`if(vPaintPart<2.5&&vPaintPart>1.5&&p.y<.86){float center=.12+clamp(.8-p.y,0.0,.67)*.17;fillPosition.z=mix(p.z,sign(p.z)*center,.16);}
   if(abs(vPaintPart-4.0)<.1||abs(vPaintPart-6.0)<.1)fillPosition.z=mix(p.z,sign(p.z)*.232,.18);`:''}
   ${species==='goat'?`// The throat's front is in no painting: the beard hides it from the front, the profiles see
   // it edge-on (on its crest their silhouette), the collar hides its base from them. It takes
   // the profiles' throat fur 4 mm inside its crest, and above the collar.
   if(abs(vPaintPart-7.)<.1&&p.x>0.&&abs(p.z)<.05)fillPosition=vec3(p.x-.004,max(p.y,1.292),p.z);`:''}
   vec4 fill=paintView(fillPosition,n,0.0,false)+paintView(fillPosition,n,2.0,false);
   ${species==='dog'||species==='rabbit'||species==='donkey'||species==='sheep'||species==='hen'||species==='goat'||bovine||species==='skunk'||species==='pig-foreman'||species==='pig-director'?`fill+=paintView(fillPosition,n,1.0,false)+paintView(fillPosition,n,3.0,false);`:''}
   float filled=smoothstep(.002,.025,fill.a);
   vec3 base=mix(fallbackPaint(vPaintPart),fill.rgb/max(.00001,fill.a),filled);
   diffuseColor.rgb=mix(base,paint.rgb/max(.00001,paint.a),coverage);
   ${species==='cow'?`
   // The wrap and straps have their own surfaces. Clear their projected copies
   // from the shirt and throat underneath, using unoccluded cloth/fur paint.
   if(vPaintPart<1.5){
    float shoulder=smoothstep(1.12,1.18,p.y)*smoothstep(.045,.065,abs(p.z))*(1.-smoothstep(.32,.37,abs(p.z)));
    vec2 shoulderUV=vec2((125.+p.x*80.+(abs(p.z)-.20)*50.)/1774.,1.-(255.+(1.26-p.y)*180.)/887.);
    vec3 cloth=texture2D(uModelPaint,shoulderUV).rgb;
    diffuseColor.rgb=mix(diffuseColor.rgb,cloth,shoulder);coverage*=1.-shoulder;filled=max(filled,shoulder);
    float chest=smoothstep(.03,.07,p.x)*(1.-smoothstep(.08,.12,abs(p.z)))*smoothstep(1.12,1.17,p.y);
    vec4 shirt=paintView(vec3(-.15,1.16+(p.y-1.22)*.25,.025+p.z*.25),vec3(-1.,0.,0.),2.,false);
    if(shirt.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,shirt.rgb/shirt.a,chest);coverage*=1.-chest;filled=max(filled,chest);}
    // The small upper collar overlaps the throat inside the wrap. Register
    // their shared exposed edge continuously, rather than painting a pale
    // triangular cutout across the otherwise continuous cream throat.
    float collar=smoothstep(1.23,1.26,p.y)*(1.-smoothstep(.075,.12,abs(p.z)))*smoothstep(-.03,.015,p.x);
    diffuseColor.rgb=mix(diffuseColor.rgb,cowThroat(p),collar);coverage*=1.-collar;filled=max(filled,collar);
   }
   if(abs(vPaintPart-7.)<.1){
    float neck=(1.-smoothstep(1.32,1.385,p.y))*smoothstep(-.10,-.02,p.x);
    diffuseColor.rgb=mix(diffuseColor.rgb,cowThroat(p),neck);coverage*=1.-neck;filled=max(filled,neck);
   }
   if(abs(vPaintPart-2.)<.1){
    float hip=smoothstep(.18,.23,abs(p.z))*(1.-smoothstep(.09,.17,abs(p.x)))*smoothstep(.61,.68,p.y)*(1.-smoothstep(.88,.93,p.y));
    vec4 cloth=paintView(vec3(.20,p.y,sign(p.z)*(.15+p.x*.45)),vec3(1.,0.,0.),0.,false);
    if(cloth.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,cloth.rgb/cloth.a,hip);coverage*=1.-hip;filled=max(filled,hip);}
   }
   // The four level paintings cannot see the upper scarf folds. Keep their
   // red cloth continuous across the wrap, using an interior painted patch.
   if(abs(vPaintPart-9.)<.1){
    float a=atan(p.z/.12,(p.x+.03)/.11),t=clamp((p.y-1.25)/.08,0.,1.);
    vec2 uv=vec2((600.+5.*sin(a*2.))/1774.,1.-(230.+2.*cos(t*6.28+a))/887.);
    diffuseColor.rgb=texture2D(uModelPaint,uv).rgb*(.83+.17*max(0.,n.y));coverage=0.;filled=1.;
   }
   if(vPaintPart>9.5){
    vec2 uv=vec2((.5-p.z/.925)/4.,.5+(p.y-.825)/1.85);
    vec3 color=texture2D(uModelPaint,uv).rgb;
    float red=smoothstep(1.7,2.1,color.r/max(.001,max(color.g,color.b)));
    vec3 inset=texture2D(uModelPaint,vec2((vPaintPart<10.5?222.:p.z>0.?207.:240.)/1774.,1.-(vPaintPart<10.5?239.:264.)/887.)).rgb;
    diffuseColor.rgb=mix(inset,color,red)*(.82+.18*max(0.,n.x));coverage=0.;filled=1.;
   }
   `:''}
   ${species==='donkey'?`
   // Lifting the head reveals the jacket's previously occluded shoulder tops.
   if(vPaintPart<1.5){
    float shoulder=smoothstep(1.18,1.23,p.y)*(1.-coverage);
    vec4 cloth=paintView(vec3(-.15,1.16,p.z*.4),vec3(-1.,0.,0.),2.,false);
    if(cloth.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,cloth.rgb/cloth.a,shoulder);filled=max(filled,shoulder);}
    // Slimmer forearms reveal the underside of the rolled jacket cuffs.
    float cuff=(1.-smoothstep(1.025,1.065,p.y))*smoothstep(.25,.29,abs(p.z))*(1.-coverage);
    vec4 sleeve=paintView(vec3(.13,1.045,sign(p.z)*.31),vec3(1.,0.,0.),0.,false);
    if(sleeve.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,sleeve.rgb/sleeve.a*(.80+.20*max(n.y,0.)),cuff);filled=max(filled,cuff);}
   }
   // The lengthened throat was hidden by the old scarf. Reuse an unoccluded
   // cheek-fur patch, with a soft transition into the existing jaw painting.
   if(abs(vPaintPart-7.)<.1){
    float neck=(1.-smoothstep(1.325,1.365,p.y))*(1.-smoothstep(.08,.15,p.x)),a=atan(p.z,p.x+.055);
    neck=max(neck,(1.-coverage)*(1.-filled)*(1.-smoothstep(1.33,1.36,p.y)));
    vec2 furUV=vec2((630.+14.*sin(a*2.))/1774.,1.-(199.-(p.y-1.20)*140.)/887.);
    vec3 fur=texture2D(uModelPaint,furUV).rgb*(.82+.18*max(n.x,0.));
    diffuseColor.rgb=mix(diffuseColor.rgb,fur,neck);coverage*=1.-neck;filled=max(filled,neck);
   }
   // Folded scarf edges reuse gold cloth, rather than projecting competing
   // front/profile outlines across the thin wrap and knot.
   if(vPaintPart>9.5){
    vec2 uv=vec2((.5-p.z/.925)/4.,.5+(p.y-.825)/1.85);
    vec3 scarf=texture2D(uModelPaint,uv).rgb;
    float gold=smoothstep(1.35,1.8,scarf.g/max(.001,scarf.b))*smoothstep(1.05,1.2,scarf.r/max(.001,scarf.g));
    float a=atan(p.z/.11,(p.x+.04)/.10),t=clamp((p.y-1.265)/.06,0.,1.);
    vec3 inset=texture2D(uModelPaint,vec2((620.+12.*sin(a*2.))/1774.,1.-(221.+5.*cos(t*6.28+a))/887.)).rgb;
    float front=vPaintPart>10.5?gold:0.;
    diffuseColor.rgb=mix(inset,scarf,front)*(.82+.18*max(n.x,0.));coverage=0.;filled=1.;
   }`:''}
   ${species==='sheep'?`
   float shoulder=step(vPaintPart,1.5)*smoothstep(.055,.080,abs(p.z))*(1.-smoothstep(.26,.32,abs(p.z)))*smoothstep(1.10,1.17,p.y);
   vec4 shirtPaint=paintView(vec3(.12,p.y-.02,sign(p.z)*(.24+(1.26-p.y)*.55+p.x*.25)),vec3(1.,0.,0.),0.,false);
   if(shirtPaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,shirtPaint.rgb/shirtPaint.a,shoulder);coverage*=1.-shoulder;filled=max(filled,shoulder);}
   float collar=step(vPaintPart,1.5)*smoothstep(1.20,1.25,p.y);
   vec4 collarPaint=paintView(vec3(.12,1.13+(p.y-1.27)*.5,.30+p.z*.3),vec3(1.,0.,0.),0.,false);
   if(collarPaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,collarPaint.rgb/collarPaint.a,collar);coverage*=1.-collar;filled=max(filled,collar);}
   float neck=(1.-coverage)*(1.-filled)*(1.-smoothstep(1.29,1.33,p.y))*step(6.5,vPaintPart)*step(vPaintPart,7.5);
   vec4 neckPaint=paintView(vec3(p.x,p.y+.045,p.z),n,2.,false);
   if(neckPaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,neckPaint.rgb/neckPaint.a,neck);filled=max(filled,neck);}
   float crown=(1.-coverage)*(1.-filled)*smoothstep(1.55,1.60,p.y)*step(6.5,vPaintPart)*step(vPaintPart,7.5);
   vec4 woolPaint=paintView(vec3(-.10,1.57,p.z*.55),vec3(-1.,0.,0.),2.,false);
   if(woolPaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,woolPaint.rgb/woolPaint.a,crown);filled=max(filled,crown);}
   // Ear interior paint belongs on the flap, not the wool behind its root.
   float earGhost=(1.-smoothstep(-.07,.005,p.x))*smoothstep(1.43,1.47,p.y)*(1.-smoothstep(1.55,1.58,p.y))*(1.-smoothstep(.11,.16,abs(p.z)))*step(6.5,vPaintPart)*step(vPaintPart,7.5);
   vec4 rearWool=paintView(vec3(-.15,p.y,atan(p.z,max(.06,-p.x))*.105),vec3(-1.,0.,0.),2.,false);
   if(rearWool.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,rearWool.rgb/rearWool.a,earGhost);coverage*=1.-earGhost;filled=max(filled,earGhost);}
   `:''}
   ${species==='hen'?`
   // Keep the painted red wattles on their own geometry, not the neck behind.
   float wattleGhost=step(1.5,vPaintPart)*step(vPaintPart,2.5)*smoothstep(.04,.09,p.x)*(1.-smoothstep(1.335,1.37,p.y))*smoothstep(1.20,1.24,p.y);
   vec4 neckFeathers=paintView(vec3(-.14,p.y,clamp(p.z,-.10,.10)),vec3(-1.,0.,0.),2.,false);
   if(neckFeathers.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,neckFeathers.rgb/neckFeathers.a,wattleGhost);coverage*=1.-wattleGhost;filled=max(filled,wattleGhost);}
   float combGhost=step(1.5,vPaintPart)*step(vPaintPart,2.5)*smoothstep(1.475,1.51,p.y)*smoothstep(.005,.06,p.x);
   vec4 crownFeathers=paintView(vec3(-.1,clamp(p.y,1.35,1.47),p.z*.6),vec3(-1.,0.,0.),2.,false);
   if(crownFeathers.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,crownFeathers.rgb/crownFeathers.a,combGhost);coverage*=1.-combGhost;filled=max(filled,combGhost);}
   `:''}
   ${species==='pig-foreman'?`// The wider carry exposes inner sleeve surfaces hidden in the old
   // neutral painting. Reuse unoccluded rear shirt cloth there.
   float innerSleeve=(1.-coverage)*(1.-filled)*step(vPaintPart,1.5);
   vec4 sleeveFill=paintView(vec3(-.25,1.02+(p.y-.95),clamp(p.x*.65,-.13,.13)),vec3(-1.,0.,0.),2.,false);
   if(sleeveFill.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,sleeveFill.rgb/sleeveFill.a*.86,innerSleeve);filled=max(filled,innerSleeve);}
   float beltFill=(1.-coverage)*(1.-filled)*smoothstep(.87,.90,p.y)*(1.-smoothstep(.94,.96,p.y))*(1.-step(.1,abs(vPaintPart-2.)));
   vec4 leatherFill=paintView(vec3(.28,.914,sign(p.z)*.22+p.x*.10),vec3(1.,0.,0.),0.,false);
   if(leatherFill.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,leatherFill.rgb/leatherFill.a,beltFill);filled=max(filled,beltFill);}`:''}
   ${species==='pig-director'?`
   // Reuse central rear skull paint where profile ears overlap the bald head.
   float skullBack=(1.-smoothstep(-.07,-.015,p.x))*(1.-smoothstep(.12,.175,abs(p.z)))*smoothstep(1.35,1.40,p.y)*step(6.5,vPaintPart)*step(vPaintPart,7.5);
   vec4 scalpPaint=paintView(vec3(-.20,p.y,p.z*.5),vec3(-1.,0.,0.),2.,false);
   if(scalpPaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,scalpPaint.rgb/scalpPaint.a,skullBack);coverage*=1.-skullBack;filled=max(filled,skullBack);}
   // One frontal painting owns the chain; profile artwork places it differently.
   float chainZone=smoothstep(.08,.15,p.x)*smoothstep(.89,.93,p.y)*(1.-smoothstep(1.12,1.16,p.y))*smoothstep(-.01,.03,p.z)*step(vPaintPart,1.5);
   vec4 frontCloth=paintView(vec3(p.x,p.y,min(p.z,.255)),vec3(1.,0.,0.),0.,false);
   if(frontCloth.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,frontCloth.rgb/frontCloth.a,chainZone);coverage*=1.-chainZone;filled=max(filled,chainZone);}
   // The neutral arm obscures the side of the waistcoat. Reuse unoccluded
   // burgundy cloth, rather than projecting the painted arm's outline onto it.
   float sleeveT=clamp(dot(vec3(p.x+.045,p.y-1.217,abs(p.z)-.285),vec3(.056,-.201,.144))/.064225,0.,1.);
   float sleeveShape=1.-smoothstep(.108,.146,length(vec3(p.x+.035,p.y-1.217,abs(p.z)-.285)-sleeveT*vec3(.056,-.201,.144)));
   float sideCoat=smoothstep(.20,.28,abs(p.z))*smoothstep(.80,.85,p.y)*(1.-smoothstep(1.21,1.28,p.y))*step(vPaintPart,1.5)*(1.-sleeveShape);
   vec4 coatPaint=paintView(vec3(.25,.99+(p.y-.90)*.7,-.19+p.x*.18),vec3(1.,0.,0.),0.,false);
   if(coatPaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,coatPaint.rgb/coatPaint.a,sideCoat);coverage*=1.-sideCoat;filled=max(filled,sideCoat);}
   float sleeve=max(sleeveShape*smoothstep(.22,.28,abs(p.z)),smoothstep(1.25,1.29,p.y)*smoothstep(.22,.27,abs(p.z)))*step(vPaintPart,1.5)*(1.-smoothstep(.20,.36,diffuseColor.g));
   vec4 sleevePaint=paintView(vec3(clamp(p.x*.65,-.055,.060),min(p.y,1.235+(p.y-1.235)*.15),sign(p.z)*.43),vec3(0.,0.,sign(p.z)),p.z>0.?1.:3.,false);
   if(sleevePaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,sleevePaint.rgb/sleevePaint.a,sleeve);coverage*=1.-sleeve;filled=max(filled,sleeve);}
   float tailGhost=(1.-smoothstep(-.19,-.13,p.x))*(1.-smoothstep(.065,.115,abs(p.z)))*smoothstep(.76,.79,p.y)*(1.-smoothstep(.90,.93,p.y))*(1.-step(.1,abs(vPaintPart-2.)));
   vec4 seatPaint=paintView(vec3(-.24,p.y,.15),vec3(-1.,0.,0.),2.,false);
   if(seatPaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,seatPaint.rgb/seatPaint.a,tailGhost);coverage*=1.-tailGhost;filled=max(filled,tailGhost);}
   float hip=smoothstep(.23,.29,abs(p.z))*(1.-smoothstep(.10,.17,abs(p.x)))*smoothstep(.61,.68,p.y)*(1.-smoothstep(.86,.92,p.y))*(1.-step(.1,abs(vPaintPart-2.)));
   vec4 hipPaint=paintView(vec3(.18,p.y*.7+.1,sign(p.z)*(.13+p.x*.3)),vec3(1.,0.,0.),0.,false);
   if(hipPaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,hipPaint.rgb/hipPaint.a,hip);coverage*=1.-hip;filled=max(filled,hip);}
   `:''}
   ${species==='pig-foreman'?`
   // Neutral sleeves hide the lateral shirt and belt. The compact carry exposes
   // them: keep armband/brace artwork on those parts, reuse plain cloth beneath.
   float underarm=smoothstep(.21,.255,abs(p.z))*(1.-smoothstep(.325,.36,abs(p.z)))*(1.-smoothstep(.11,.18,abs(p.x)))*smoothstep(.86,.90,p.y)*(1.-smoothstep(1.015,1.07,p.y))*step(vPaintPart,1.5);
   vec4 sideShirt=paintView(vec3(-.25,1.02+(p.y-.95),clamp(p.x*.65,-.13,.13)),vec3(-1.,0.,0.),2.,false);
   if(sideShirt.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,sideShirt.rgb/sideShirt.a*.86,underarm);coverage*=1.-underarm;filled=max(filled,underarm);}
   float sideBelt=smoothstep(.205,.24,abs(p.z))*smoothstep(.883,.898,p.y)*(1.-smoothstep(.933,.95,p.y))*(1.-step(.1,abs(vPaintPart-2.)));
   vec4 sideLeather=paintView(vec3(-.24,.914,sign(p.z)*(.10+p.x*.08)),vec3(-1.,0.,0.),2.,false);
   if(sideLeather.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,sideLeather.rgb/sideLeather.a,sideBelt);coverage*=1.-sideBelt;filled=max(filled,sideBelt);}
   // Paint expanded the tail root slightly beyond its mesh silhouette. Keep that
   // pink edge on the tail rather than projecting a second curl onto trousers.
   float tailGhost=(1.-smoothstep(-.18,-.14,p.x))*(1.-smoothstep(.055,.09,abs(p.z)))*smoothstep(.78,.80,p.y)*(1.-smoothstep(.88,.90,p.y))*(1.-step(.1,abs(vPaintPart-2.)));
   tailGhost*=smoothstep(.30,.48,diffuseColor.r);
   vec4 seatPaint=paintView(vec3(-.24,p.y,.12),vec3(-1.,0.,0.),2.,false);
   if(seatPaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,seatPaint.rgb/seatPaint.a,tailGhost);coverage*=1.-tailGhost;filled=mix(filled,1.,tailGhost);}
   // Neutral forearms obscure the lateral hips in the profile paintings.
   // Reuse unoccluded front trouser cloth instead of their painted shadow edge.
   float hip=smoothstep(.22,.26,abs(p.z))*(1.-smoothstep(.10,.16,abs(p.x)))*smoothstep(.64,.69,p.y)*(1.-smoothstep(.89,.925,p.y))*(1.-step(.1,abs(vPaintPart-2.)));
   vec4 hipPaint=paintView(vec3(.18,p.y,sign(p.z)*(.11+p.x*.3)),vec3(1.,0.,0.),0.,false);
   if(hipPaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,hipPaint.rgb/hipPaint.a,hip);coverage*=1.-hip;filled=mix(filled,1.,hip);}
   if(vPaintPart>8.5){
    float visor=smoothstep(.12,.17,p.x)*(1.-smoothstep(1.59,1.61,p.y))*max(smoothstep(.3,.65,n.y),smoothstep(.17,.20,p.x));
    vec4 leather=paintView(vec3(.13,1.544,p.z*.5),vec3(1.,0.,0.),0.,false);
    if(leather.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,leather.rgb/leather.a,visor);coverage*=1.-visor;filled=mix(filled,1.,visor);}
    float crown=smoothstep(1.59,1.61,p.y)*(1.-coverage);
    vec4 cloth=paintView(vec3(-.07,1.60+.025*clamp((p.x+.18)/.36,0.,1.),p.z*.75),vec3(-1.,0.,0.),2.,false);
    if(cloth.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,cloth.rgb/cloth.a,crown);filled=mix(filled,1.,crown);}
   }`:''}
   ${earTexture?`// Broad ear artwork comes from the approved turnaround, locally registered
   // to the revised solid flap. Other head and garment paint stays unchanged.
   float innerEar=.133+.050*(1.-smoothstep(1.39,1.48,p.y));
   float earMask=smoothstep(innerEar-.004,innerEar+.014,abs(p.z))*(1.-smoothstep(.005,.035,p.x))*smoothstep(1.37,1.395,p.y)*(1.-smoothstep(1.525,1.550,p.y))*(1.-step(.1,abs(vPaintPart-7.)));
   // The previous projected profile included a narrow ear on the skull beneath
   // the revised flap. Reuse adjacent pink cheek/neck paint on that buried patch.
   float oldEar=smoothstep(.025,.070,abs(p.z))*(1.-smoothstep(-.015,.025,p.x))*smoothstep(1.365,1.395,p.y)*(1.-smoothstep(1.49,1.525,p.y))*(1.-step(.1,abs(vPaintPart-7.)))*(1.-earMask);
   vec4 headPaint=paintView(vec3(-.04,1.365+(p.y-1.42)*.3,sign(p.z)*.13),vec3(0.,0.,sign(p.z)),p.z>0.?1.:3.,false);
   if(headPaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,headPaint.rgb/headPaint.a,oldEar);coverage*=1.-oldEar;filled=mix(filled,1.,oldEar);}
   vec2 earPixel=vec2(243.-p.z*500.,132.+(1.535-p.y)*452.);
   vec2 earCenter=vec2(p.z>0.?149.:333.,166.);
   vec3 earColor=vec3(0.);float earWeight=0.;
   for(int i=0;i<5;i++){vec2 at=mix(earPixel,earCenter,.16+float(i)*.16);vec3 sampleColor=texture2D(uEarPaint,vec2(at.x/1774.,1.-at.y/887.)).rgb;float chroma=max(max(sampleColor.r,sampleColor.g),sampleColor.b)-min(min(sampleColor.r,sampleColor.g),sampleColor.b);float weight=smoothstep(.035,.08,chroma)*pow(.6,float(i));earColor+=sampleColor*weight;earWeight+=weight;}
   float earValid=smoothstep(.01,.1,earWeight);earColor/=max(.001,earWeight);
   // Painted root fold and turned lower rim: surface color only, no ear cavity.
   float fold=exp(-pow((abs(p.z)-innerEar-.016)/.012,2.))*smoothstep(1.40,1.44,p.y)*(1.-smoothstep(1.515,1.54,p.y));
   float rimY=1.389+.036*pow((abs(p.z)-.205)/.047,2.);
   float rim=(1.-smoothstep(.004,.012,abs(p.y-rimY)))*(1.-smoothstep(1.444,1.46,p.y));
   float turn=exp(-pow((p.y-rimY-.015)/.009,2.))*(1.-smoothstep(1.444,1.46,p.y));
   earColor*=1.-.48*fold-.22*turn;earColor=mix(earColor,vec3(.90,.56,.40),rim*.55);
   diffuseColor.rgb=mix(diffuseColor.rgb,earColor*(.90+.10*abs(n.x)),earMask*earValid);coverage*=1.-earMask;filled=mix(filled,earValid,earMask);
   `:''}
   ${paintLayers?paintLayers.application:''}
   // A +.25 UV phase turns the painted stripes clockwise viewed from tip toward root.
   ${tailTexture?`if(vPaintPart>7.5){vec2 tailUV=vec2(.50+atan(vTail.y,vTail.x)/6.28318530718,vTail.z);vec3 dx=dFdx(vTail),dy=dFdy(vTail);float radius2=max(dot(vTail.xy,vTail.xy),.000001);vec2 uvDx=vec2((vTail.x*dx.y-vTail.y*dx.x)/radius2/6.28318530718,dx.z),uvDy=vec2((vTail.x*dy.y-vTail.y*dy.x)/radius2/6.28318530718,dy.z);diffuseColor.rgb=textureGrad(uTailPaint,tailUV,uvDx,uvDy).rgb*(.83+.17*max(n.y,0.));coverage=1.;filled=1.;}`:''}
   ${species==='skunk'?`float strap=smoothstep(1.185,1.225,p.y)*(1.0-smoothstep(.035,.055,abs(abs(p.z)-.136)))*(1.0-step(.4,abs(vPaintPart-2.0)));
   vec4 strapPaint=paintView(vec3(.16,1.18,sign(p.z)*.136),vec3(1.,0.,0.),0.,false);
   if(strapPaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,strapPaint.rgb/strapPaint.a*(.86+.14*max(n.y,0.)),strap);coverage*=1.-strap;filled=mix(filled,1.,strap);}`:''}
   ${bovine?`// The edited profiles provide plain pink shading. Reuse the frontal nasal
   // painting around the rounded pad with a broad feather into that compatible color.
   float nose=smoothstep(.155,.215,p.x)*(1.0-smoothstep(1.416,1.438,p.y))*smoothstep(1.348,1.37,p.y)*step(6.5,vPaintPart)*step(vPaintPart,7.5);
   vec4 nosePaint=paintView(vec3(.23,p.y,atan(p.z,max(.025,p.x-.15))*.058),vec3(1.,0.,0.),0.,false);
   if(nosePaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,nosePaint.rgb/nosePaint.a,nose);coverage*=1.-nose;filled=mix(filled,1.,nose);}`:''}
   ${bovine?`// Reuse the same broad strap's front painting across its hidden upper turn.
   float strap=smoothstep(1.185,1.225,p.y)*(1.0-smoothstep(.035,.055,abs(abs(p.z)-.143)))*(1.0-step(.4,abs(vPaintPart-2.0)));
   vec4 strapPaint=paintView(vec3(.17,1.18,sign(p.z)*.143),vec3(1.,0.,0.),0.,false);
   if(strapPaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,strapPaint.rgb/strapPaint.a*(.86+.14*max(n.y,0.)),strap);coverage*=1.-strap;filled=mix(filled,1.,strap);}`:''}
   ${species==='goat'?`// The top of a strap is hidden in all four level reference views. Reuse
   // the same strap's front paint continuously; keep this blue in coverage mode.
   float strap=smoothstep(1.185,1.225,p.y)*(1.0-smoothstep(.035,.055,abs(abs(p.z)-.13)))*(1.0-step(.4,abs(vPaintPart-2.0)));
   vec4 strapPaint=paintView(vec3(.16,1.18,sign(p.z)*.13),vec3(1.,0.,0.),0.,false);
   if(strapPaint.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,strapPaint.rgb/strapPaint.a*(.86+.14*max(n.y,0.)),strap);coverage*=1.-strap;filled=mix(filled,1.,strap);}`:''}
   // The overhand pose exposes the inner forearm, absent from the four neutral views.
   // Reuse the painted outer forearm at the same height, with broad form shading.
   if(uGripForearm>.5&&abs(vPaintPart-3.0)<.1){
    vec4 armPaint=paintView(vec3(.15,p.y,-.355),vec3(1.,0.,0.),0.,true);
    float armMask=smoothstep(.765,.785,p.y)*(1.-smoothstep(.903,.918,p.y));
    if(armPaint.a>.001)diffuseColor.rgb=mix(diffuseColor.rgb,armPaint.rgb/armPaint.a*(.80+.20*abs(n.x)),armMask);
   }
   ${species==='sheep'?`
   // Real scarf forms own the red paint; clear the previous chest copies.
   float chest=smoothstep(.01,.05,p.x)*(1.-smoothstep(.105,.14,abs(p.z)))*smoothstep(1.09,1.125,p.y)*(1.-smoothstep(1.32,1.34,p.y));
   if(vPaintPart<1.5){
    vec3 cream=texture2D(uModelPaint,vec2((344.+p.z*200.)/1774.,1.-(299.+(1.25-p.y)*550.)/887.)).rgb;
    diffuseColor.rgb=mix(diffuseColor.rgb,cream,chest);coverage*=1.-chest;filled=max(filled,chest);
   }
   if(abs(vPaintPart-9.)<.1){
    vec4 cloth=sheepCloth(vec3(-.18,1.17+(p.y-1.20)*.25,p.z*.5),vec3(-1.,0.,0.),2.);
    if(cloth.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,cloth.rgb/cloth.a,chest);coverage*=1.-chest;filled=max(filled,chest);}
   }
   if(abs(vPaintPart-10.)<.1){
    float a=atan(p.z/.16,(p.x+.03)/.145),front=pow(max(0.,cos(a)),3.),t=clamp(.5+(p.y-1.304+.041*front)/(.026+.018*pow(sin(a),2.)),0.,1.);
    // One continuous all-red cloth footprint; no color-key boundary on folds.
    vec2 scarfUV=vec2((608.+10.*sin(a*2.)*sin(t*3.14159))/1774.,1.-(212.-10.*t-2.*cos(a*3.)*sin(t*3.14159))/887.);
    diffuseColor.rgb=texture2D(uModelPaint,scarfUV).rgb*(.82+.18*max(0.,n.y));coverage=0.;filled=1.;
   }
   if(abs(vPaintPart-7.)<.1&&p.y<1.35){
    float ghost=smoothstep(1.7,2.1,diffuseColor.r/max(.001,max(diffuseColor.g,diffuseColor.b)));
    vec3 wool=texture2D(uModelPaint,vec2((221.+p.z*300.)/1774.,1.-(199.+(1.33-p.y)*180.)/887.)).rgb;
    diffuseColor.rgb=mix(diffuseColor.rgb,wool,ghost);coverage*=1.-ghost;filled=max(filled,ghost);
   }
   if(vPaintPart>10.5){
    vec2 tieUV=vec2((.5-p.z/.925)/4.,.5+(p.y-.825)/1.85);
    vec3 color=texture2D(uModelPaint,tieUV).rgb;
    // Turned edges reuse their red cloth interior, never the cream background.
    float red=smoothstep(1.7,2.1,color.r/max(.001,max(color.g,color.b)));
    vec3 inset=texture2D(uModelPaint,vec2((vPaintPart<11.5?222.:p.z>0.?202.:244.)/1774.,1.-(vPaintPart<11.5?238.:269.)/887.)).rgb;
    diffuseColor.rgb=mix(inset,color,red)*(.80+.20*max(0.,n.x));coverage=0.;filled=1.;
   }`:''}
   if(uPaintDebug>.5)diffuseColor.rgb=mix(mix(vec3(.8,.0,.55),vec3(.03,.18,.95),filled),vec3(.04,.8,.12),coverage);
  `);
 };
 material.customProgramCacheKey=()=> 'worker-model-projection-v4-'+species+'-'+JSON.stringify(frame)+'-'+Boolean(tailTexture)+'-'+Boolean(earTexture)+'-'+Boolean(paintLayers);
 let visibilityPixels;
 function visibility(p,part,view){
  if(!visibilityPixels){visibilityPixels=new Uint8Array(2048*1024*4);renderer.readRenderTargetPixels(target,0,0,2048,1024,visibilityPixels);}
  const {uv,depth}=paintCoordinates(p,view,frame),x=Math.floor(uv[0]*2048),y=Math.floor(uv[1]*1024);
  if(x<view*512||x>=(view+1)*512||y<0||y>=1024)return {visible:false,reason:'outside'};
  const k=(y*2048+x)*4,surfacePart=visibilityPixels[k],surfaceDepth=(visibilityPixels[k+1]*256+visibilityPixels[k+2])/65535;
  return {visible:surfacePart===part&&depth-surfaceDepth<.009/(frame.far-frame.near),surfacePart,depthErrorWorld:(depth-surfaceDepth)*(frame.far-frame.near)};
 }
 return {setGripForearm(value){gripForearm.value=value?1:0;},material,target,textures:[texture,mask,...Object.values(paintLayers?.uniforms||{}).map(u=>u.value).filter(t=>t?.isTexture)],visibility,setDebug(value){debug.value=value?1:0;},dispose(){material.dispose();target.dispose();texture.dispose();mask.dispose();paintLayers?.dispose();}};
}
