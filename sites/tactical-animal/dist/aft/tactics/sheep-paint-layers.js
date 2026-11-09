import * as THREE from './vendor/three.module.js';
import {textureValidity} from './horse-model-paint.js';

// Registered garment painting exposes the cloth beneath the neutral arms.
// Full-size source footprints preserve folds across the hips and vest sides.
export function sheepPaintLayers(renderer,sheep,textures,frame){
 const targets=[],masks=[];
 const old={target:renderer.getRenderTarget(),color:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),tone:renderer.toneMapping,space:renderer.outputColorSpace,viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),test:renderer.getScissorTest()};
 for(let layer=0;layer<1;layer++){
  const texture=textures[layer];texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const im=texture.image;
  const mask=new THREE.DataTexture(textureValidity(texture),im.width,im.height,THREE.RedFormat);mask.flipY=true;mask.minFilter=mask.magFilter=THREE.LinearFilter;mask.needsUpdate=true;masks.push(mask);
  const scene=new THREE.Scene(),materials=[];
  sheep.parts.forEach((p,i)=>{if(![1,8].includes(i))return;const m=new THREE.ShaderMaterial({uniforms:{id:{value:i+1}},vertexShader:'attribute vec3 paintPosition;void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(paintPosition,1.);}',fragmentShader:'uniform float id;void main(){gl_FragColor=vec4(id/255.,0.,0.,1.);}',toneMapped:false});materials.push(m);scene.add(new THREE.Mesh(p.geometry,m));});
  const target=new THREE.WebGLRenderTarget(2048,1024,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});targets.push(target);
  const camera=new THREE.OrthographicCamera(-frame.width/2,frame.width/2,frame.height/2,-frame.height/2,frame.near,frame.far);
  renderer.setRenderTarget(target);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(0,0);renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);
  for(let i=0;i<4;i++){const a=i*Math.PI/2;camera.position.set(frame.distance*Math.cos(a),frame.centerY,frame.distance*Math.sin(a));camera.lookAt(0,frame.centerY,0);camera.updateProjectionMatrix();renderer.setViewport(i*512,0,512,1024);renderer.setScissor(i*512,0,512,1024);renderer.render(scene,camera);}materials.forEach(m=>m.dispose());
 }
 renderer.setRenderTarget(old.target);renderer.outputColorSpace=old.space;renderer.toneMapping=old.tone;renderer.setClearColor(old.color,old.alpha);renderer.setViewport(old.viewport);renderer.setScissor(old.scissor);renderer.setScissorTest(old.test);
 return {uniforms:{uSheepCloth:{value:textures[0]},uSheepClothMask:{value:masks[0]},uSheepClothParts:{value:targets[0].texture}},declarations:`
 uniform sampler2D uSheepCloth,uSheepClothMask,uSheepClothParts;
 vec4 sheepCloth(vec3 p,vec3 n,float view){
  float across=view<.5?-p.z:(view<1.5?p.x:(view<2.5?p.z:-p.x));
  float facing=view<.5?n.x:(view<1.5?n.z:(view<2.5?-n.x:-n.z));
  vec2 uv=vec2((view+.5+across/${frame.width})/4.,.5+(p.y-${frame.centerY})/${frame.height});
  float part=texture2D(uSheepClothParts,uv).r*255.;
  vec2 colorUV=uv;
  // The corrected shoulder bridge sits above the original painting boundary.
  // Continue the adjacent olive cloth over this narrow turned edge.
  if(vPaintPart>8.5&&p.y>1.245)colorUV.y=.5+(1.245+(p.y-1.245)*.2-${frame.centerY})/${frame.height};
  float valid=texture2D(uSheepClothMask,colorUV).r;
  float weight=pow(max(.2,facing),4.)*(1.-step(.4,abs(part-vPaintPart)))*valid;
  return vec4(texture2D(uSheepCloth,colorUV).rgb*weight,weight);
 }
 `,application:`
 if(abs(vPaintPart-2.)<.1||abs(vPaintPart-9.)<.1){
  vec4 layer=sheepCloth(p,n,0.)+sheepCloth(p,n,1.)+sheepCloth(p,n,2.)+sheepCloth(p,n,3.);
  float amount=smoothstep(.00001,.002,layer.a);
  // Retain the original front scarf, pockets and buttons; continuous side/back
  // cloth comes from the unobscured garment painting, not neutral limb paint.
  amount*=max(1.-smoothstep(.055,.12,p.x),smoothstep(.15,.22,abs(p.z)));
  diffuseColor.rgb=mix(diffuseColor.rgb,layer.rgb/max(.000001,layer.a),amount);
  coverage*=1.-amount;filled=max(filled,amount);
  if(vPaintPart>8.5){float bridge=smoothstep(1.235,1.27,p.y);vec4 cloth=sheepCloth(vec3(-.18,1.20+(p.y-1.24)*.5,p.z*.6+p.x*.2),vec3(-1.,0.,0.),2.);if(cloth.a>.001){diffuseColor.rgb=mix(diffuseColor.rgb,cloth.rgb/cloth.a,bridge);coverage*=1.-bridge;filled=max(filled,bridge);}}
 }
 `,dispose(){targets.forEach(t=>t.dispose());masks.forEach(m=>m.dispose());}};
}
