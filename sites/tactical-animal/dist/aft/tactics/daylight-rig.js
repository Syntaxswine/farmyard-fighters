import * as T from './vendor/three.module.js';
import {daylightAt} from './daylight.js';
export class DaylightRig {
 constructor(scene,renderer){
  this.scene=scene;this.renderer=renderer;
  for(const light of [...scene.children])if(light.isLight)scene.remove(light);
  this.ambient=new T.HemisphereLight(0xddeaff,0x283347,.24);
  this.sun=new T.DirectionalLight(0xffeed6,2.2);this.sun.castShadow=true;
  this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.bias=-.00015;this.sun.shadow.normalBias=.045;
  this.sun.shadow.camera.near=.1;this.sun.shadow.camera.far=1600;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  scene.add(this.ambient,this.sun,this.sun.target);this.minutes=480;
 }
 update(minutes,camera,now=0,instant=false){
  // Interpolate round boundaries using paused presentation time, never wall time.
  const dt=this.lastNow===undefined?0:Math.max(0,now-this.lastNow);this.lastNow=now;
  if(instant||this.shown===undefined||Math.abs(minutes-this.shown)>5)this.shown=minutes;
  else this.shown+=(minutes-this.shown)*(1-Math.exp(-dt/180));
  this.minutes=minutes;const sample=this.sample=daylightAt(this.shown);
  this.sun.intensity=sample.sunIntensity;this.sun.visible=sample.strength>0;
  this.sun.color.set(0xfff3de).lerp(new T.Color(0xffb875),sample.warmth*.65);
  this.ambient.intensity=sample.ambientIntensity;
  this.ambient.color.set(0xb6c7e2).lerp(new T.Color(0xfff3df),sample.strength);
  this.ambient.groundColor.set(0x465269).lerp(new T.Color(0x65715a),sample.strength);
  const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(0,0),camera);
  const center=ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),0),new T.Vector3())||new T.Vector3();
  center.x=Math.round(center.x*10)/10;center.z=Math.round(center.z*10)/10;
  const radius=Math.max(24,Math.hypot(camera.right-camera.left,camera.top-camera.bottom)*1.15);
  this.sun.target.position.copy(center);
  this.sun.position.copy(center).add(new T.Vector3(...sample.direction).normalize().multiplyScalar(600));
  const shadow=this.sun.shadow.camera;shadow.left=shadow.bottom=-radius;shadow.right=shadow.top=radius;shadow.updateProjectionMatrix();
  // Async character, cargo and scenery loads all join the same lighting setup.
  // Unlit editor markers and combat effects must never cast geometry shadows.
  this.scene.traverse(object=>{if(!object.isMesh)return;const materials=Array.isArray(object.material)?object.material:[object.material];
   if(materials.some(m=>m?.isMeshStandardMaterial||m?.isMeshPhongMaterial||m?.isMeshLambertMaterial)){object.castShadow=!object.userData.noShadow;object.receiveShadow=true;
    for(const material of materials)if(!material.userData.daylightPrepared){
     material.userData.daylightPrepared=true;const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
     material.onBeforeCompile=(shader,renderer)=>{compile.call(material,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('outgoingLight=max(outgoingLight,diffuseColor.rgb*.75);','');
      const lights=T.ShaderChunk.lights_pars_begin.replace('float distanceFalloff =', 'if (decayExponent == 0.0 && cutoffDistance == 30.0) { if(lightDistance > 30.0) return 0.0; return pow(0.5,max(0.0,ceil(lightDistance / 5.0)-1.0)); }\n float distanceFalloff =');
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_pars_begin>',lights);};
     material.customProgramCacheKey=()=>key+'-daylight';material.needsUpdate=true;
    }}
  });
 }
 dispose(){this.sun.shadow.dispose();this.scene.remove(this.sun,this.sun.target,this.ambient);}
}
