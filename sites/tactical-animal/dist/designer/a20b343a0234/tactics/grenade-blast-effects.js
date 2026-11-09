import * as T from './vendor/three.module.js';
import {BLAST_RAYS,blastPointVisible} from './grenade-blast-field.js';
export const GRENADE_BLAST_DURATION=.8;
export const GRENADE_BLAST_TEXTURES=['../assets/effects/painted-fire/tank-burst-atlas-v1.png','../assets/effects/painted-fire/smoke-atlas-v1.png'];
const clamp=t=>Math.max(0,Math.min(1,t)),smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
export async function loadGrenadeBlastTextures(loader){
 const result=await Promise.allSettled(GRENADE_BLAST_TEXTURES.map(p=>loader.loadAsync(p)));
 if(result.some(r=>r.status==='rejected')){for(const r of result)if(r.status==='fulfilled')r.value.dispose();throw result.find(r=>r.status==='rejected').reason;}
 return result.map(r=>{r.value.colorSpace=T.SRGBColorSpace;return r.value;});
}
export function createGrenadeBlastEffects(scene){
 const group=new T.Group();group.name='Painted fragmentation blast';scene.add(group);group.visible=false;
 const plane=new T.PlaneGeometry(1,1),materials=[],origin=new T.Vector3(),reach=new Float32Array(BLAST_RAYS),bounds=new T.Vector4();let mask,ceilingMap,field,disposed=false;
 const shared={blastOrigin:{value:origin},blastRadius:{value:1},floorHeight:{value:0},ceilingHeight:{value:5},ceilingMap:{value:null},reach:{value:reach},visibilityMap:{value:null},visibilityBounds:{value:bounds}};
 function card(name,dust){const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,toneMapped:false,
  uniforms:{...shared,map:{value:null},textured:{value:0},phase:{value:0},opacity:{value:0},dust:{value:dust?1:0}},
  vertexShader:'varying vec2 uvPaint;varying vec3 atWorld;void main(){uvPaint=uv;atWorld=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`uniform sampler2D map,visibilityMap,ceilingMap;uniform float textured,phase,opacity,dust,blastRadius,floorHeight,ceilingHeight,reach[${BLAST_RAYS}];uniform vec3 blastOrigin;uniform vec4 visibilityBounds;varying vec2 uvPaint;varying vec3 atWorld;
   vec4 paint(float f){f=mod(f,4.0);return texture2D(map,(vec2(mod(f,2.0),1.0-floor(f/2.0))+clamp(uvPaint,.008,.992))*.5);}
   void main(){vec2 delta=atWorld.xz-blastOrigin.xz;float r=length(delta);float a=mod(atan(delta.y,delta.x)+6.2831853,6.2831853)/6.2831853*${BLAST_RAYS}.0;int i=int(floor(a));int j=i+1;if(j==${BLAST_RAYS})j=0;float limit=min(reach[i],reach[j]);
    if(atWorld.y<floorHeight+.004||atWorld.y>ceilingHeight-.004||r>limit||length(atWorld-blastOrigin)>blastRadius)discard;
    vec2 fog=(atWorld.xz-visibilityBounds.xy)/visibilityBounds.zw;if(any(lessThan(fog,vec2(0.0)))||any(greaterThanEqual(fog,vec2(1.0)))||texture2D(visibilityMap,fog).a<.5||atWorld.y>texture2D(ceilingMap,fog).r-.004)discard;
    vec4 c;if(textured>.5)c=mix(paint(floor(phase)),paint(ceil(phase)),smoothstep(0.0,1.0,fract(phase)));else{float d=length((uvPaint-.5)*2.0);c=vec4(vec3(.78,.63,.40),(1.0-smoothstep(.2,1.0,d))*.65);}
    if(dust>.5){float l=dot(c.rgb,vec3(.299,.587,.114));c.rgb=vec3(.11,.085,.055)+vec3(.29,.245,.175)*l;}
    c.a*=opacity*smoothstep(floorHeight+.004,floorHeight+.15,atWorld.y)*(1.0-smoothstep(max(0.0,limit-.12),limit,r));if(c.a<.012)discard;gl_FragColor=c;
    #include <colorspace_fragment>
   }`});materials.push(material);const mesh=new T.Mesh(plane,material);mesh.name=name;group.add(mesh);return mesh;}
 const core=card('Brief painted detonation',false),puffs=Array.from({length:48},(_,i)=>card('Outward fragmentation dust '+i,true));
 function setField(next){if(next===field)return;field=next;origin.set(next.origin.x,next.origin.h,next.origin.y);shared.blastRadius.value=next.radius;shared.floorHeight.value=next.floor;shared.ceilingHeight.value=next.ceiling;reach.set(next.rays);
  const {x,y,size:n,ceilings}=next.columns;bounds.set(x-.5,y-.5,n,n);mask?.dispose();mask=new T.DataTexture(new Uint8Array(n*n*4),n,n);mask.magFilter=mask.minFilter=T.NearestFilter;shared.visibilityMap.value=mask;
  ceilingMap?.dispose();ceilingMap=new T.DataTexture(ceilings,n,n,T.RedFormat,T.FloatType);ceilingMap.magFilter=ceilingMap.minFilter=T.NearestFilter;ceilingMap.needsUpdate=true;shared.ceilingMap.value=ceilingMap;
 }
 function updateVisibility(state){let changed=false;const data=mask.image.data,n=mask.image.width;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const value=blastPointVisible(field,state,bounds.x+.5+x,bounds.y+.5+y)?255:0,i=(y*n+x)*4;if(data[i+3]!==value){data[i]=data[i+1]=data[i+2]=data[i+3]=value;changed=true;}}
  if(changed||!mask.version)mask.needsUpdate=true;
 }
 return {group,core,puffs,get field(){return field;},get visibilityMask(){return mask;},
  setTextures(textures){for(const m of [core,...puffs]){m.material.uniforms.map.value=textures[m===core?0:1];m.material.uniforms.textured.value=1;}},
  hide(){group.visible=false;},
  update(age,{field:next,state,camera,reduced=false}){
   if(disposed)return;setField(next);updateVisibility(state);const active=Number.isFinite(age)&&age>=0&&age<(reduced?.18:GRENADE_BLAST_DURATION);group.visible=active;if(!active)return;
   const radius=next.radius;core.position.copy(origin).add(new T.Vector3(0,radius*.15,0));core.quaternion.copy(camera.quaternion);
   core.visible=age<(reduced?.18:.44);core.scale.setScalar(reduced?radius*.52:radius*(.40+.43*smooth(age/.10)));core.material.uniforms.phase.value=reduced?3:Math.min(3,age/.40*3);core.material.uniforms.opacity.value=reduced?.35:1-smooth((age-.12)/.32);
   for(let i=0;i<puffs.length;i++){const p=puffs[i],outer=i<22,middle=i<38,angle=i*2.39996323,variation=(1+Math.sin(i*1.73))*.5,delay=.007*(i%5),t=Math.max(0,(reduced?.30:age)-delay),travel=outer?.80+.14*variation:middle?.36+.30*variation:.10+.25*variation,w=radius*(outer?.38:.48)*(1+.18*Math.sin(i*1.73));
    p.visible=reduced||age>=delay;const r=radius*travel*(1-Math.exp(-t*(outer?11:8)));
    p.position.set(origin.x+Math.cos(angle)*r,Math.max(next.floor+.16,origin.y+.13)+t*(outer?.65:1.7),origin.z+Math.sin(angle)*r);
    p.quaternion.copy(camera.quaternion);p.rotateZ(.14*Math.sin(i*1.17));p.scale.set(w,w*(outer?.57:.83),1);
    p.material.uniforms.phase.value=(i%4)+t*1.8;p.material.uniforms.opacity.value=reduced?.28:(outer?.92:.87)*smooth(t/.04)*(1-smooth((age-.40)/.4));
   }
  },
  dispose(){if(disposed)return;disposed=true;group.removeFromParent();plane.dispose();materials.forEach(m=>m.dispose());mask?.dispose();ceilingMap?.dispose();}
 };
}
