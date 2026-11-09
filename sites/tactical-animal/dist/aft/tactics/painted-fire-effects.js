import * as T from './vendor/three.module.js';
import {fireState,burnState,FIRE_TIME,clamp,smooth} from './painted-fire-state.js';
import {fireBodyZones,fireZoneCenter} from './painted-fire-zones.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
export const FIRE_ASSETS={flame:'../assets/effects/painted-fire/flame-atlas-v1.png',smoke:'../assets/effects/painted-fire/smoke-atlas-v1.png',ash:'../assets/effects/painted-fire/ash-paint-v1.png'};

// All endpoints come from gameplay. Discontinuous occlusion boundaries are
// left unbridged: a decorative triangle must not fill in a wall's shadow.
export function flameSheetData(shape,muzzle,layer=0,world=false){
 const p=[],uv=[],distance=[],index=[],o=shape.origin,segments=8;
 for(let ray=0;ray<shape.rays.length-1;ray++){
  const a=shape.rays[ray],b=shape.rays[ray+1];
  if(a.kind==='hidden'||a.kind!==b.kind||Math.abs(a.distance-b.distance)>1.05)continue;
  const start=p.length/3;
  for(let j=0;j<=segments;j++)for(const [r,k] of [[a,ray],[b,ray+1]]){
   const f=j/segments,x=r.x-(world?0:o.x),z=r.y-(world?0:o.y),w=k/(shape.rays.length-1);
   p.push(muzzle.x+(x-muzzle.x)*f,muzzle.y+(r.h-muzzle.y)*f+Math.sin(Math.PI*f)*layer*(.8+.2*Math.sin(Math.PI*w)),muzzle.z+(z-muzzle.z)*f);
   uv.push(.10+.80*w,.14+.78*f);distance.push(Math.hypot(x-muzzle.x,z-muzzle.z)*f);
  }
  for(let j=0;j<segments;j++){const n=start+j*2;index.push(n,n+1,n+2,n+1,n+3,n+2);}
 }
 return {position:p,uv,distance,index};
}
export function paintedFireMaterial(texture,{smoke=false,fan=false,plume=false,seed=0}={}){
 return new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,toneMapped:false,
  uniforms:{map:{value:texture},clock:{value:0},opacity:{value:1},seed:{value:seed},head:{value:100},tail:{value:-10},rays:{value:Array.from({length:37},()=>new T.Vector2())},wedges:{value:new Float32Array(36)},angle:{value:0},spread:{value:1},nozzle:{value:0},source:{value:new T.Vector2()}},
  vertexShader:`varying vec2 vUv;varying float vDistance;varying vec3 vWorld;${fan?'attribute float travelDistance;':''}void main(){vUv=uv;vDistance=${fan?'travelDistance':'0.0'};vWorld=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D map;uniform float clock,opacity,seed,head,tail;varying vec2 vUv;varying float vDistance;varying vec3 vWorld;
   ${plume?'uniform vec2 rays[37];uniform vec2 source;uniform float wedges[36],angle,spread,nozzle;':''}
   vec4 frame(float n,vec2 p){n=mod(n,4.0);vec2 cell=vec2(mod(n,2.0),1.0-floor(n/2.0));return texture2D(map,(cell+clamp(p,.012,.988))*.5);}
   void main(){${plume?`vec2 at=vWorld.xz-source;float bearing=atan(at.y,at.x)-angle;bearing=atan(sin(bearing),cos(bearing));if(abs(bearing)>spread||dot(at,vec2(cos(angle),sin(angle)))<nozzle)discard;int i=int(clamp(floor((bearing+spread)/spread*.5*36.0),0.0,35.0));vec2 a0=rays[i],b0=rays[i+1];if(wedges[i]<.5||(b0.x-a0.x)*(at.y-a0.y)-(b0.y-a0.y)*(at.x-a0.x)<0.0)discard;`:''}
   float phase=clock*${smoke?'2.1':'5.0'}+seed;vec2 p=vUv;p.x+=.018*sin(p.y*7.0+clock*${smoke?'1.4':'6.0'}+seed);${plume?'if(sin(seed)>.0)p.x=1.0-p.x;':''}vec4 a=frame(floor(phase),p),b=frame(floor(phase)+1.0,p);vec4 c=mix(a,b,smoothstep(.0,1.0,fract(phase)));
   ${smoke?'float l=dot(c.rgb,vec3(.299,.587,.114));c.rgb=vec3(.004+.058*pow(l,.78));c.a=1.0-pow(1.0-c.a,1.45);':''}
   c.a*=opacity;${fan?'c.a*=mix(1.0,.20,smoothstep(.3,1.5,vDistance))*smoothstep(vDistance-.24,vDistance+.12,head)*(1.0-smoothstep(vDistance-.12,vDistance+.22,tail));':''}
   if(c.a<.015)discard;gl_FragColor=c;
   #include <colorspace_fragment>
   }`
 });
}
export async function loadPaintedFireTextures(loader){
 const results=await Promise.allSettled(Object.values(FIRE_ASSETS).map(url=>loader.loadAsync(url)));
 if(results.some(r=>r.status==='rejected')){for(const r of results)if(r.status==='fulfilled')r.value.dispose();throw results.find(r=>r.status==='rejected').reason;}
 return results.map(r=>r.value);
}
export async function createPaintedFireEffects(scene,loader,worker,{textures:sharedTextures,world=false}={}){
 const textures=sharedTextures||await loadPaintedFireTextures(loader);
 for(const t of textures)t.colorSpace=T.SRGBColorSpace;
 const group=new T.Group();group.name='Painted fire effects';scene.add(group);
 const plane=new T.PlaneGeometry(1,1),materials=[],geometries=[];
 function material(map,options){const m=paintedFireMaterial(map,options);materials.push(m);return m;}
 const sheets=[-.45,0,.45].map((layer,i)=>{const g=new T.BufferGeometry();geometries.push(g);const m=new T.Mesh(g,material(textures[0],{fan:true,seed:i*1.3}));m.frustumCulled=false;group.add(m);m.userData.layer=layer;return m;});
 const plumes=Array.from({length:48},(_,i)=>{const m=new T.Mesh(plane,material(textures[0],{plume:true,seed:i*1.618}));m.userData={birth:FIRE_TIME.ignite+Math.floor(i/3)*.043+(i%3)*.010+.008*Math.sin(i*2.13),lane:((i%3)-1)*.56+.21*Math.sin(i*2.399),width:.72+.40*Math.sin(i*1.73)**2,length:.78+.47*Math.sin(i*2.17+.6)**2,tilt:.22*Math.sin(i*1.33)};group.add(m);return m;});
 const zones=fireBodyZones(worker),wraps=zones.flatMap((zone,i)=>[-1,1].map((side,j)=>{const m=new T.Mesh(plane,material(textures[0],{seed:i*.67+j*1.7}));m.scale.set(zone.width,zone.height,1);m.userData={zone,side,width:zone.width,height:zone.height};group.add(m);return m;}));
 const smokes=Array.from({length:18},(_,i)=>{const m=new T.Mesh(plane,material(textures[1],{smoke:true,seed:i*.39}));group.add(m);return m;});
 const ashMaterial=new T.MeshBasicMaterial({map:textures[2],transparent:true,depthWrite:false,side:T.DoubleSide,toneMapped:false});materials.push(ashMaterial);
 const ashGeometry=new T.PlaneGeometry(1.25,1.05,12,10);geometries.push(ashGeometry);ashGeometry.rotateX(-Math.PI/2);
 for(let i=0;i<ashGeometry.attributes.position.count;i++){const a=ashGeometry.attributes.position,x=a.getX(i),z=a.getZ(i);a.setY(i,.007+.09*Math.max(0,1-(x/.55)**2-(z/.45)**2));}ashGeometry.computeVertexNormals();
 const ash=new T.Mesh(ashGeometry,ashMaterial);group.add(ash);
 let lastShape=null,lastMuzzle=null,triangles=0;
 function updateSheets(shape,muzzle){
  if(lastShape===shape&&lastMuzzle?.distanceToSquared(muzzle)<1e-10)return;
  lastShape=shape;lastMuzzle=muzzle.clone();triangles=0;
  for(const sheet of sheets){const d=flameSheetData(shape,muzzle,sheet.userData.layer,world),g=sheet.geometry;
   if(g.attributes.position?.count!==d.position.length/3){g.dispose();g.setAttribute('position',new T.Float32BufferAttribute(d.position,3));g.setAttribute('uv',new T.Float32BufferAttribute(d.uv,2));g.setAttribute('travelDistance',new T.Float32BufferAttribute(d.distance,1));g.setIndex(d.index);}
   else for(const [name,data]of [['position',d.position],['uv',d.uv],['travelDistance',d.distance]]){g.attributes[name].array.set(data);g.attributes[name].needsUpdate=true;}
   triangles+=d.index.length/3;
  }
 }
 return {group,ash,
  update(time,{shape,muzzle,camera,route,body=true,flame=true,visible=true,terminal=true,groundPoint,suppressSmoke=false}){
   const f=fireState(time),s=burnState(time,route,{terminal});group.visible=visible;if(flame)updateSheets(shape,muzzle);
   for(const sheet of sheets){sheet.visible=flame&&time>=FIRE_TIME.ignite&&time<FIRE_TIME.cutoff+FIRE_TIME.travel;if(!sheet.visible)continue;Object.assign(sheet.material.uniforms.clock,{value:time});sheet.material.uniforms.opacity.value=.17;sheet.material.uniforms.head.value=f.head*shape.range;sheet.material.uniforms.tail.value=time<FIRE_TIME.cutoff?-10:f.tail*shape.range;}
   for(let i=0;i<plumes.length;i++){const m=plumes[i],age=time-m.userData.birth;
    m.visible=flame&&age>=0&&age<FIRE_TIME.travel;if(!m.visible)continue;const d=age/FIRE_TIME.travel*shape.range,bearing=shape.heading+m.userData.lane*shape.halfAngle;
    const forward=V(Math.cos(bearing),.10,Math.sin(bearing));m.position.copy(muzzle).addScaledVector(forward,d);m.position.y+=.04*Math.sin(i*1.7+time*5);
    const normal=camera.position.clone().sub(m.position).normalize(),up=forward.clone().addScaledVector(normal,-forward.dot(normal));if(up.lengthSq()<.02)up.set(0,1,0);up.normalize();const right=up.clone().cross(normal).normalize();up.copy(normal).cross(right).normalize();m.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,normal));
    m.rotateZ(m.userData.tilt);m.scale.set((.32+.98*clamp(d/6))*m.userData.width,(.72+1.02*clamp(d/4))*m.userData.length,1);
    const u=m.material.uniforms;u.clock.value=time;u.opacity.value=.52*smooth(age/.025)*(1-smooth((age-.38)/.18));u.angle.value=shape.heading;u.spread.value=shape.halfAngle;u.source.value.set(world?shape.origin.x:0,world?shape.origin.y:0);u.nozzle.value=(muzzle.x-u.source.value.x)*Math.cos(shape.heading)+(muzzle.z-u.source.value.y)*Math.sin(shape.heading);
    shape.rays.forEach((r,k)=>u.rays.value[k].set(r.x-shape.origin.x,r.y-shape.origin.y));for(let k=0;k<36;k++)u.wedges.value[k]=shape.rays[k].kind!=='hidden'&&shape.rays[k].kind===shape.rays[k+1].kind&&Math.abs(shape.rays[k].distance-shape.rays[k+1].distance)<=1.05?1:0;
   }
   const toward=camera.position.clone().sub(worker.root.getWorldPosition(V()));toward.y=0;toward.normalize();
   const centers=new Map(zones.map(z=>[z,fireZoneCenter(z)]));
   for(const m of wraps){m.visible=body&&s.active&&s.engulf>.001;m.position.copy(centers.get(m.userData.zone)).addScaledVector(toward,m.userData.side*m.userData.width*.35);m.position.y=s.point.y+(m.position.y-s.point.y)*(1-.65*s.fireTail);m.quaternion.copy(camera.quaternion);m.material.uniforms.clock.value=time;m.material.uniforms.opacity.value=.72*s.engulf;}
   // Overlapping painted billows retain their birth position as the victim moves.
   // Lower new emissions with the collapse, then let the existing trail rise away.
   for(let i=0;i<smokes.length;i++){
    const m=smokes[i],first=FIRE_TIME.hit+i*.16,birth=terminal?first:first+Math.max(0,Math.floor((time-first)/2.88))*2.88,age=time-birth,bs=burnState(birth,route,{terminal});
    m.visible=body&&!suppressSmoke&&age>=0&&age<2&&bs.dissolve<1;if(!m.visible)continue;
    const origin=groundPoint?groundPoint(birth,route,{terminal}):bs.point;
    m.position.set(origin.x-.18*age,origin.y+1.45-1.05*bs.collapse+age*.75,origin.z+.10*Math.sin(i*1.7)*age);
    m.quaternion.copy(camera.quaternion);m.scale.set(.82+age*.52,1.1+age*.74,1);
    m.material.uniforms.opacity.value=.88*smooth(age/.12)*(1-smooth((age-1.1)/.9));m.material.uniforms.clock.value=time;
   }
   const dest=groundPoint?groundPoint(FIRE_TIME.duration,route,{terminal}):route.points.at(-1);ash.visible=body&&s.ash>0;ash.position.set(dest.x,dest.y,dest.z);ashMaterial.opacity=s.ash;
   return {triangles:triangles+(wraps.length+plumes.length+smokes.length)*2+240,activeCards:wraps.filter(m=>m.visible).length,activePlumes:plumes.filter(m=>m.visible).length,ashOpacity:s.ash};
  },
  dispose(){group.removeFromParent();plane.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());if(!sharedTextures)textures.forEach(t=>t.dispose());}
 };
}
