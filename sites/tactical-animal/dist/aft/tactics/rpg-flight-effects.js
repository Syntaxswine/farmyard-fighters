import * as T from './vendor/three.module.js';
import {createRPGProjectile,sampleRPGFlight,rpgSmokeSamples,RPG_SMOKE_COUNT} from './rpg-flight.js';

// Reuses the painted blast/smoke atlases. Textures are borrowed from the owner.
// This study effect is not a fog-of-war adapter; gameplay must clip fragments
// against current visibility on their actual floor before using it there.
export function createRPGFlightEffects(scene){
 const group=new T.Group();group.name='RPG projectile and painted wake';scene.add(group);
 const projectile=createRPGProjectile();group.add(projectile.root);
 const plane=new T.PlaneGeometry(1,1),materials=[];
 function card(name,smoke){
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,toneMapped:false,
   uniforms:{map:{value:null},textured:{value:0},phase:{value:0},opacity:{value:0},smoke:{value:smoke?1:0}},
   vertexShader:'varying vec2 paintUv;void main(){paintUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
   fragmentShader:`uniform sampler2D map;uniform float textured,phase,opacity,smoke;varying vec2 paintUv;
    vec4 frame(float f){f=mod(f,4.0);return texture2D(map,(vec2(mod(f,2.0),1.0-floor(f/2.0))+clamp(paintUv,.008,.992))*.5);}
    void main(){vec4 c;if(textured>.5)c=mix(frame(floor(phase)),frame(ceil(phase)),smoothstep(0.0,1.0,fract(phase)));else{float d=length((paintUv-.5)*2.0);c=vec4(1.0,.72,.32,1.0-smoothstep(.12,1.0,d));}
     if(smoke>.5){float l=dot(c.rgb,vec3(.299,.587,.114));c.rgb=mix(vec3(.18,.19,.16),vec3(.82,.79,.66),pow(l,.7));}
     c.a*=opacity;if(c.a<.012)discard;gl_FragColor=c;
     #include <colorspace_fragment>
    }`});materials.push(material);const mesh=new T.Mesh(plane,material);mesh.name=name;group.add(mesh);return mesh;
 }
 const smoke=Array.from({length:RPG_SMOKE_COUNT},(_,i)=>card('Painted smoke wake '+i,true)),exhaust=card('Brief motor flare',false),flash=card('Launch puff',false);
 let disposed=false;const xAxis=new T.Vector3(1,0,0),matrix=new T.Matrix4();
 function trailRotation(camera,direction){
  const normal=new T.Vector3(0,0,1).applyQuaternion(camera.quaternion),right=direction.clone().addScaledVector(normal,-direction.dot(normal));
  if(right.lengthSq()<.001)right.set(1,0,0).applyQuaternion(camera.quaternion);right.normalize();
  const up=normal.clone().cross(right).normalize();return new T.Quaternion().setFromRotationMatrix(matrix.makeBasis(right,up,normal));
 }
 function hide(){group.visible=false;projectile.root.visible=flash.visible=exhaust.visible=false;for(const p of smoke)p.visible=false;}
 hide();
 return {group,projectile,smoke,flash,exhaust,
  setTextures({smoke:smokeTexture,flame}){for(const p of [...smoke,exhaust,flash]){p.material.uniforms.map.value=p===exhaust||p===flash?flame:smokeTexture;p.material.uniforms.textured.value=p.material.uniforms.map.value?1:0;}},
  hide,
  update(time,{flight,camera,smokeEnabled=true,reduced=false,visible=true}){
   hide();if(disposed)return;
   const s=sampleRPGFlight(flight,time);if(reduced||!visible)return s;
   group.visible=true;projectile.root.visible=s.flying;
   projectile.root.position.copy(s.position);projectile.root.quaternion.setFromUnitVectors(xAxis,flight.direction);
   projectile.root.rotateX(time*5);
   const rotation=trailRotation(camera,flight.direction);
   exhaust.visible=s.flying;exhaust.position.copy(s.position).addScaledVector(flight.direction,-.69);exhaust.quaternion.copy(rotation);exhaust.scale.set(.40+.08*Math.sin(time*93),.115,1);exhaust.material.uniforms.phase.value=time*17;exhaust.material.uniforms.opacity.value=.83;
   flash.visible=time>=0&&time<.07&&flight.duration>0;flash.position.copy(flight.origin).addScaledVector(flight.direction,-.35);flash.quaternion.copy(camera.quaternion);flash.scale.setScalar(.44+Math.max(0,time)*4);flash.material.uniforms.phase.value=Math.max(0,time)*35;flash.material.uniforms.opacity.value=.70*Math.max(0,1-time/.07);
   if(smokeEnabled)for(const [i,p]of rpgSmokeSamples(flight,time).entries()){
    const m=smoke[i];m.visible=true;m.position.copy(p.position);m.quaternion.copy(rotation);m.rotateZ(p.rotation);m.scale.set(p.width,p.height,1);m.material.uniforms.opacity.value=p.opacity;m.material.uniforms.phase.value=(p.id%4)+p.age*1.7;
   }
   return s;
  },
  dispose(){if(disposed)return;disposed=true;hide();group.removeFromParent();projectile.dispose();plane.dispose();materials.forEach(m=>m.dispose());}
 };
}
