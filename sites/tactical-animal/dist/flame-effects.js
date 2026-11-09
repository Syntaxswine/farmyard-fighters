import * as T from './aft/tactics/vendor/three.module.js';
import {FIRE_ASSETS,flameSheetData,paintedFireMaterial} from './aft/tactics/painted-fire-effects.js';
import {FIRE_TIME,fireState,smooth} from './aft/tactics/painted-fire-state.js';
import {advanceFlameClock,flameMuzzleInReach} from './flame-event.js';
import {createFlameMask,updateFlameMask} from './flame-mask-view.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
export const FLAME_LIMITS=Object.freeze({active:2,queued:6,plumes:24});
const atlas=new URL(FIRE_ASSETS.flame,new URL('./aft/tactics/',import.meta.url)).href;

// Extra fragment clipping is required for both the inherited fan sheets and
// their wide painted billboards. Geometry alone cannot mask small fog holes.
function clippedMaterial(texture,shared,{fan=false,seed=0}={}){
  const material=paintedFireMaterial(texture,{fan,seed});
  Object.assign(material.uniforms,shared);
  material.fragmentShader=material.fragmentShader.replace('void main(){',`
    uniform sampler2D soloFog;
    uniform vec2 rays[37],source,fogOrigin,fogSize;
    uniform float wedges[36],angle,spread,nozzle;
    void main(){
      vec2 field=vWorld.xz,uv=(floor(field+vec2(.5))-fogOrigin+vec2(.5))/fogSize;
      if(any(lessThan(uv,vec2(0.)))||any(greaterThanEqual(uv,vec2(1.)))||texture2D(soloFog,uv).r<.5)discard;
      vec2 at=field-source;float bearing=atan(at.y,at.x)-angle;bearing=atan(sin(bearing),cos(bearing));
      if(abs(bearing)>spread||dot(at,vec2(cos(angle),sin(angle)))<nozzle-.005)discard;
      int k=int(clamp(floor((bearing+spread)/spread*.5*36.),0.,35.));vec2 edgeA=rays[k],edgeB=rays[k+1];
      if(wedges[k]<.5||(edgeB.x-edgeA.x)*(at.y-edgeA.y)-(edgeB.y-edgeA.y)*(at.x-edgeA.x)<0.)discard;
  `);
  return material;
}

function makeSlot(scene,texture){
  const group=new T.Group();group.name='Solo painted flame jet';group.visible=false;scene.add(group);
  const mask=createFlameMask();
  const shared={soloFog:{value:mask.fog},fogOrigin:{value:new T.Vector2()},fogSize:{value:new T.Vector2(1,1)},rays:{value:Array.from({length:37},()=>new T.Vector2())},wedges:{value:new Float32Array(36)},source:{value:new T.Vector2()},angle:{value:0},spread:{value:1},nozzle:{value:0}};
  const sheets=[-.45,0,.45].map((layer,i)=>{
    const geometry=new T.BufferGeometry();
    for(const [name,size] of [['position',3],['uv',2],['travelDistance',1]])geometry.setAttribute(name,new T.BufferAttribute(new Float32Array(648*size),size).setUsage(T.DynamicDrawUsage));
    geometry.setIndex(new T.BufferAttribute(new Uint16Array(1728),1).setUsage(T.DynamicDrawUsage));geometry.setDrawRange(0,0);
    const mesh=new T.Mesh(geometry,clippedMaterial(texture,shared,{fan:true,seed:i*1.3}));mesh.frustumCulled=false;mesh.userData.layer=layer;group.add(mesh);return mesh;
  });
  const plane=new T.PlaneGeometry(1,1),plumes=Array.from({length:FLAME_LIMITS.plumes},(_,i)=>{
    const mesh=new T.Mesh(plane,clippedMaterial(texture,shared,{seed:i*1.618}));mesh.frustumCulled=false;
    mesh.userData={birth:.32+Math.floor(i/2)*.06+(i%2)*.012,lane:(i%2?-.46:.46)+.10*Math.sin(i*2.399),width:.72+.4*Math.sin(i*1.73)**2,length:.78+.47*Math.sin(i*2.17+.6)**2};group.add(mesh);return mesh;
  });
  return {group,sheets,plumes,...mask,shared,owner:null,revision:null,muzzle:null,geometryShape:null,dispose(){group.removeFromParent();for(const sheet of sheets){sheet.geometry.dispose();sheet.material.dispose();}for(const plume of plumes)plume.material.dispose();plane.dispose();this.fog.dispose();group.clear();}};
}

// Only the operator's painted discharge is adapted. There are no victim rigs,
// burn routes, damage callbacks, lights, smoke trails, ash, or body relocation.
export class SoloFlameEffects {
  constructor(scene,{loadTexture=url=>new T.TextureLoader().loadAsync(url),reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches,onError=error=>console.warn('Flamethrower artwork unavailable; combat continues.',error)}={}){
    Object.assign(this,{scene,loadTexture,reducedMotion,onError,queue:[],slots:[],texture:null,status:'idle',generation:0,disposed:false,now:0});
  }
  enqueue(event,now,{recordedMuzzle=false}={}){
    if(this.disposed||!event.flame?.sourceVisible||this.status==='failed'||this.queue.length>=FLAME_LIMITS.queued)return false;
    const shape=event.flame,{x,y,h}=shape.origin;
    // A real-time operator may already be moving when the renderer receives
    // the shot. Start at the recorded cone and prefer its fitted live muzzle.
    const reach=Math.min(.42,shape.rays[18].distance*.5);
    const muzzle=recordedMuzzle?V(x+Math.cos(shape.heading)*reach,h,y+Math.sin(shape.heading)*reach):null;
    this.queue.push({event,shape,queuedAt:now,elapsed:0,last:null,shown:false,tailShown:false,muzzle,recordedMuzzle,slot:null});
    if(this.status==='idle'){this.loadAt=now;this.load();}return true;
  }
  load(){
    const generation=this.generation;this.status='loading';
    this.pending=Promise.resolve().then(()=>this.loadTexture(atlas)).then(texture=>{
      if(this.disposed||generation!==this.generation){texture.dispose();return;}
      texture.colorSpace=T.SRGBColorSpace;this.texture=texture;this.status='ready';this.pending=null;
    },error=>{if(!this.disposed&&generation===this.generation){this.status='failed';this.pending=null;this.queue=[];this.onError(error);}});
  }
  beginFrame(now,state){
    this.now=now;const reduced=!!this.reducedMotion();
    if(this.status==='loading'&&now-this.loadAt>15000){this.generation++;this.pending=null;this.status='failed';this.queue=[];this.onError(new Error('Flame atlas load timed out.'));}
    for(const entry of [...this.queue]){
      // A disappeared operator/model cannot retain an unstarted presentation
      // forever. Real texture failures are handled independently above.
      if(!entry.muzzle&&now-entry.queuedAt>5000){this.release(entry);continue;}
      if(this.status!=='ready'||now<entry.queuedAt)continue;
      if(!entry.slot){
        let slot=this.slots.find(slot=>!slot.owner);
        if(!slot&&this.slots.length<FLAME_LIMITS.active){slot=makeSlot(this.scene,this.texture);this.slots.push(slot);}
        if(!slot)continue;entry.slot=slot;slot.owner=entry;slot.revision=null;slot.geometryShape=null;slot.muzzle=null;
      }
      if(entry.muzzle){advanceFlameClock(entry,now,reduced);if(entry.elapsed>=(reduced?.18:FIRE_TIME.recover))this.release(entry);}
    }
    this.state=state;
  }
  poseFor(unit,{moving=false}={}){
    if(unit.hp<=0||unit.weapon!=='flamethrower'||unit.isMoving&&!moving)return null;
    const entry=this.queue.find(entry=>{
      const source=entry.shape.source;
      return source.id===unit.id&&source.stance===unit.stance&&source.species===unit.species&&
        (moving&&unit.isMoving||Math.hypot(unit.x-source.x,unit.y-source.y)<.04&&Math.abs(((unit.heading-source.heading+540)%360)-180)<.1);
    });
    return entry?{entry,seconds:entry.elapsed,reduced:!!this.reducedMotion()}:null;
  }
  captureMuzzle(fire,result){
    if(!result?.origin||!result.origin.toArray().every(Number.isFinite))return;
    const source=fire.entry.shape.source;if(!this.queue.includes(fire.entry))return;
    for(const entry of this.queue){const other=entry.shape.source;
      if(other.id===source.id&&other.stance===source.stance&&other.heading===source.heading&&other.x===source.x&&other.y===source.y&&(!entry.muzzle||entry.elapsed<FIRE_TIME.ignite)&&(!entry.recordedMuzzle||flameMuzzleInReach(entry.shape,{x:result.origin.x,y:result.origin.z})))entry.muzzle=result.origin.clone();
    }
  }
  release(entry){
    if(entry.slot){entry.slot.group.visible=false;entry.slot.owner=null;entry.slot=null;}
    this.queue=this.queue.filter(record=>record!==entry);
  }
  draw(state,camera){
    const reduced=!!this.reducedMotion();
    for(const entry of this.queue){
      const slot=entry.slot,muzzle=entry.muzzle,shape=entry.shape;if(!slot||!muzzle)continue;
      if(entry.last===null)advanceFlameClock(entry,this.now,reduced);
      slot.group.visible=flameMuzzleInReach(shape,{x:muzzle.x,y:muzzle.z});if(!slot.group.visible)continue;
      if(slot.revision!==state.revision){updateFlameMask(slot,shape,state.visible);slot.shared.soloFog.value=slot.fog;slot.shared.fogOrigin.value.set(slot.rect.origin.x,slot.rect.origin.y);slot.shared.fogSize.value.set(slot.rect.width,slot.rect.height);slot.revision=state.revision;}
      const u=slot.shared;u.source.value.set(shape.origin.x,shape.origin.y);u.angle.value=shape.heading;u.spread.value=shape.halfAngle;u.nozzle.value=(muzzle.x-shape.origin.x)*Math.cos(shape.heading)+(muzzle.z-shape.origin.y)*Math.sin(shape.heading);
      shape.rays.forEach((ray,i)=>u.rays.value[i].set(ray.x-shape.origin.x,ray.y-shape.origin.y));
      for(let i=0;i<36;i++){const a=shape.rays[i],b=shape.rays[i+1];u.wedges.value[i]=a.kind!=='hidden'&&a.kind===b.kind&&Math.abs(a.distance-b.distance)<=1.05?1:0;}
      if(slot.geometryShape!==shape||!slot.muzzle||slot.muzzle.distanceToSquared(muzzle)>1e-8){
        const adapted={...shape,rays:shape.rays.map(ray=>({...ray,h:muzzle.y+.015*ray.distance}))};
        for(const sheet of slot.sheets){const data=flameSheetData(adapted,muzzle,sheet.userData.layer,true),g=sheet.geometry;
          for(const [name,array,size] of [['position',data.position,3],['uv',data.uv,2],['travelDistance',data.distance,1]]){
            g.getAttribute(name).array.set(array);g.getAttribute(name).needsUpdate=true;
          }
          g.index.array.set(data.index);g.index.needsUpdate=true;g.setDrawRange(0,data.index.length);
        }
        slot.geometryShape=shape;slot.muzzle=muzzle.clone();
      }
      const time=entry.elapsed,phase=fireState(time),flame=reduced||time>=FIRE_TIME.ignite&&time<FIRE_TIME.cutoff+FIRE_TIME.travel;
      for(const sheet of slot.sheets){sheet.visible=flame;const uniforms=sheet.material.uniforms;uniforms.clock.value=reduced?.5:time;uniforms.opacity.value=reduced?.08:.17;uniforms.head.value=reduced?shape.range*.6:phase.head*shape.range;uniforms.tail.value=reduced||time<FIRE_TIME.cutoff?-10:phase.tail*shape.range;}
      for(const plume of slot.plumes){
        const age=time-plume.userData.birth;plume.visible=!reduced&&age>=0&&age<FIRE_TIME.travel;if(!plume.visible)continue;
        const d=age/FIRE_TIME.travel*shape.range,bearing=shape.heading+plume.userData.lane*shape.halfAngle,forward=V(Math.cos(bearing),.10,Math.sin(bearing));plume.position.copy(muzzle).addScaledVector(forward,d);
        const normal=camera.position.clone().sub(plume.position).normalize(),up=forward.clone().addScaledVector(normal,-forward.dot(normal));if(up.lengthSq()<.02)up.set(0,1,0);up.normalize();const right=up.clone().cross(normal).normalize();up.copy(normal).cross(right).normalize();plume.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,normal));
        plume.scale.set((.32+.98*Math.min(1,d/6))*plume.userData.width,(.72+1.02*Math.min(1,d/4))*plume.userData.length,1);
        plume.material.uniforms.clock.value=time;plume.material.uniforms.opacity.value=.52*smooth(age/.025)*(1-smooth((age-.38)/.18));
      }
    }
  }
  reset(){
    this.generation++;this.queue=[];for(const slot of this.slots)slot.dispose();this.slots=[];this.texture?.dispose();this.texture=null;this.pending=null;this.status='idle';this.state=null;
  }
  dispose(){this.reset();this.disposed=true;}
}
