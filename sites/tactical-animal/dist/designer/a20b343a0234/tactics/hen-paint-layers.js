import * as THREE from './vendor/three.module.js';
import {textureValidity} from './horse-model-paint.js';

// Separate registered paintings expose the body beneath wings and the complete
// tail fan. Full-size source footprints retain feather and cloth structure.
export function henPaintLayers(renderer,hen,textures,frame){
 const targets=[],masks=[];
 const old={target:renderer.getRenderTarget(),color:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),tone:renderer.toneMapping,space:renderer.outputColorSpace,viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),test:renderer.getScissorTest()};
 for(let layer=0;layer<2;layer++){
  const texture=textures[layer];texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const im=texture.image;
  const mask=new THREE.DataTexture(textureValidity(texture),im.width,im.height,THREE.RedFormat);mask.flipY=true;mask.minFilter=mask.magFilter=THREE.LinearFilter;mask.needsUpdate=true;masks.push(mask);
  const scene=new THREE.Scene(),materials=[];
  hen.parts.forEach((p,i)=>{if(layer===1?i!==9:[7,8,9].includes(i))return;const m=new THREE.ShaderMaterial({uniforms:{id:{value:i+1}},vertexShader:'attribute vec3 paintPosition;void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(paintPosition,1.);}',fragmentShader:'uniform float id;void main(){gl_FragColor=vec4(id/255.,0.,0.,1.);}',toneMapped:false});materials.push(m);scene.add(new THREE.Mesh(p.geometry,m));});
  const target=new THREE.WebGLRenderTarget(2048,1024,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});targets.push(target);
  const camera=new THREE.OrthographicCamera(-frame.width/2,frame.width/2,frame.height/2,-frame.height/2,frame.near,frame.far);
  renderer.setRenderTarget(target);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(0,0);renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);
  for(let i=0;i<4;i++){const a=i*Math.PI/2;camera.position.set(frame.distance*Math.cos(a),frame.centerY,frame.distance*Math.sin(a));camera.lookAt(0,frame.centerY,0);camera.updateProjectionMatrix();renderer.setViewport(i*512,0,512,1024);renderer.setScissor(i*512,0,512,1024);renderer.render(scene,camera);}materials.forEach(m=>m.dispose());
 }
 renderer.setRenderTarget(old.target);renderer.outputColorSpace=old.space;renderer.toneMapping=old.tone;renderer.setClearColor(old.color,old.alpha);renderer.setViewport(old.viewport);renderer.setScissor(old.scissor);renderer.setScissorTest(old.test);
 return {uniforms:{uHenUnderlay:{value:textures[0]},uHenFan:{value:textures[1]},uHenUnderlayMask:{value:masks[0]},uHenFanMask:{value:masks[1]},uHenUnderlayParts:{value:targets[0].texture},uHenFanParts:{value:targets[1].texture}},declarations:`
 uniform sampler2D uHenUnderlay,uHenFan,uHenUnderlayMask,uHenFanMask,uHenUnderlayParts,uHenFanParts;
 vec4 henLayerView(vec3 p,vec3 n,float view,bool fan){
  float across=view<.5?-p.z:(view<1.5?p.x:(view<2.5?p.z:-p.x));
  float facing=view<.5?n.x:(view<1.5?n.z:(view<2.5?-n.x:-n.z));
  vec2 uv=vec2((view+.5+across/${frame.width})/4.,.5+(p.y-${frame.centerY})/${frame.height});
  vec2 colorUV=uv;
  // The isolated fan painting slightly expands each silhouette, with its root
  // about 20 pixels lower. Register that full footprint rather than clamp it.
  if(fan)colorUV.y=.5+(p.y-${frame.centerY}-.028)/${frame.height};
  if(vPaintPart>12.5&&p.x<-.20){colorUV.y-=max(0.,.89-p.y)*.22/2.32;colorUV.x+=-(view<.5?-1.:view<2.5?1.:-1.)*p.z*.12/4.64;}
  float part=(fan?texture2D(uHenFanParts,uv):texture2D(uHenUnderlayParts,uv)).r*255.;
  float valid=(fan?texture2D(uHenFanMask,colorUV):texture2D(uHenUnderlayMask,colorUV)).r;
  float weight=pow(max(.25,facing),4.)*(1.-step(.4,abs(part-vPaintPart)))*valid;
  vec3 color=(fan?texture2D(uHenFan,colorUV):texture2D(uHenUnderlay,colorUV)).rgb;
  return vec4(color*weight,weight);
 }
 `,application:`
 if(vPaintPart<1.5||abs(vPaintPart-6.)<.1||abs(vPaintPart-7.)<.1||vPaintPart>12.5||abs(vPaintPart-10.)<.1){
  bool fan=abs(vPaintPart-10.)<.1;
  vec3 q=p,qn=n;
  // Side views of the underlay illustration invented wing feathers. The coat's
  // clean rear painting owns its back and sides, with angular registration.
  bool rearCoat=abs(vPaintPart-6.)<.1;
  if(rearCoat){q.z=clamp(atan(p.z,max(.06,-p.x))*.13,-.17,.17);q.x=-.23;qn=vec3(-1.,0.,0.);}
  if(abs(vPaintPart-6.)<.1)q.y=clamp(q.y,.935,rearCoat?1.15:1.10);
  if(vPaintPart>12.5&&p.x<-.20)qn=vec3(-1.,0.,0.);
  vec4 layer=henLayerView(q,qn,0.,fan)+henLayerView(q,qn,1.,fan)+henLayerView(q,qn,2.,fan)+henLayerView(q,qn,3.,fan);
  if(abs(vPaintPart-6.)<.1){
   float owner=rearCoat?2.:0.;q.x=rearCoat?-.23:.23;q.z=clamp(q.z,-.235,.235);qn=vec3(rearCoat?-1.:1.,0.,0.);
   layer=henLayerView(q,qn,owner,false);
  }
  if(vPaintPart>12.5&&p.x<-.20)layer=henLayerView(q,vec3(-1.,0.,0.),2.,false);
  float amount=smoothstep(.00001,.002,layer.a);
  if(abs(vPaintPart-6.)<.1)amount*=max(1.-smoothstep(.12,.19,p.x),smoothstep(.14,.21,abs(p.z)));
  diffuseColor.rgb=mix(diffuseColor.rgb,layer.rgb/max(.000001,layer.a),amount);
  coverage*=1.-amount;filled=max(filled,amount);
 }
 `,dispose(){targets.forEach(t=>t.dispose());masks.forEach(m=>m.dispose());}};
}
