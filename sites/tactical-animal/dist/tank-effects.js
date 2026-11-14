import * as T from './aft/tactics/vendor/three.module.js';
import {createPaintedBlastEffects,loadPaintedBlastTextures} from './designer/a20b343a0234/tactics/painted-blast-effects.js';
import {tankCentre} from './designer/a20b343a0234/tactics/tank-blast-motion.js';
import {createBarrelBlastMotion} from './designer/a20b343a0234/tactics/barrel-blast-motion.js';
import {barrelId} from './aft/tactics/explosive-barrels.js';
import {PreparedGroundFire} from './prepared-ground-fire.js';
import {baseHeight,floorLevel} from './town-levels.js';
const base=new URL('./designer/a20b343a0234/tactics/',import.meta.url),V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),key=p=>`${Math.round(p.x)},${Math.round(p.y)}`;
export class SoloTankEffects{
  constructor(scene,{loadTexture=url=>new T.TextureLoader().loadAsync(url),reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false,onError=error=>console.warn('Fuel artwork unavailable; simulation continues.',error)}={}){
    Object.assign(this,{scene,loadTexture,reducedMotion,onError,bursts:new Map(),sequence:0,disposed:false});
    // A permanent, initially dark light keeps the scene's shader light count
    // stable. Per-explosion lights otherwise recompile the whole scene at impact.
    this.flashLight=new T.PointLight(0xffaa3c,0,7,2);this.flashLight.name='Prepared explosion light';scene.add(this.flashLight);
    this.preparedBarrels=new Map();
  }
  load(){if(this.ready)return;this.ready=loadPaintedBlastTextures({loadAsync:path=>this.loadTexture(new URL(path,base).href)}).then(textures=>{if(this.disposed)textures.forEach(t=>t.dispose());else this.textures=textures;},e=>this.onError(e));}
  async buildEffects(origin,options={}){
    const fx=await createPaintedBlastEffects(this.scene,null,origin,{textures:this.textures,world:true,floor:0,...options});
    const lights=[];fx.group.traverse(o=>{if(o.isPointLight)lights.push(o);});fx.flashLight=lights[0];lights.forEach(o=>o.removeFromParent());
    fx.group.visible=false;return fx;
  }
  prepare(library,props=[],visible=[],capacity=256){
    if(this.preparing)return this.preparing;this.load();
    this.preparing=this.ready.then(async()=>{
      if(this.disposed||!this.textures)return;
      this.ground=new PreparedGroundFire(this.scene,this.textures);await this.ground.prepare(capacity);
      for(const p of props.filter(p=>p.kind==='barrel-explosive').slice(0,8)){
        if(this.disposed)break;
        const origin=V(p.x,.4,p.y),effects=await this.buildEffects(origin,{fragmentCount:0});
        if(this.disposed){effects.dispose();break;}
        const motion=library?createBarrelBlastMotion(library,{skin:'explosiveRed',label:'flammable',position:[p.x,0,p.y],yaw:p.rotated?-Math.PI/2:0}):null;
        if(motion){motion.root.visible=false;this.scene.add(motion.root);}
        effects.setVisibility(visible);effects.update(0,{camera:new T.PerspectiveCamera(),contract:{origin:{x:0,y:0},fires:[]},visible:false,groundOpacity:0});
        this.preparedBarrels.set(barrelId(p),{origin,effects,motion});
      }
    }).catch(e=>this.onError(e));return this.preparing;
  }
  observe(state,now,units,startFor=()=>now){
    this.state=state;this.now=now;this.reduced=!!this.reducedMotion();const shown=new Set(units.map(u=>u.id));
    for(const event of state.fireAnimations||[]){
      if(event.sequence<=this.sequence)continue;this.sequence=event.sequence;
      const barrel=event.kind==='barrel',point=event.route[0];
      if(!['tank','barrel'].includes(event.kind)||this.reduced||(barrel?!state.visible.has(key(point)):!shown.has(event.unitId)))continue;
      const prepared=barrel?this.preparedBarrels.get(barrelId(event.prop)):null;
      if(prepared)this.preparedBarrels.delete(barrelId(event.prop));
      this.bursts.set(event.sequence,{event,origin:V(point.x,baseHeight(point)+(barrel?.4:.8),point.y),...prepared,worn:!!event.worn,waiting:true,start:now,queued:now});
      while(this.bursts.size>8)this.remove(this.bursts.keys().next().value);
    }
    for(const [sequence,b]of this.bursts){
      if(this.reduced||(b.event.kind==='barrel'?!state.visible.has(key(b.event.route[0])):!shown.has(b.event.unitId))||now-b.queued>8000||!b.waiting&&now-b.start>=5400){this.remove(sequence);continue;}
      if(b.waiting){const start=startFor(b.event,now);if(start!==null){b.start=start;b.waiting=false;}}
    }
    if(this.bursts.size||state.fires?.length)this.load();
  }
  pendingProps(){return [...this.bursts.values()].filter(b=>b.event.kind==='barrel'&&(b.waiting||this.now<b.start)).map(b=>b.event.prop);}
  setOrigin(sequence,point){const b=this.bursts.get(sequence);if(b&&!b.originFixed){b.origin.copy(point);b.originFixed=true;}}
  captureOrigins(actors){for(const b of this.bursts.values())if(b.worn&&!b.originFixed){const actor=actors.get(b.event.unitId);if(actor?.worker.weapon?.id==='flamethrower')this.setOrigin(b.event.sequence,tankCentre(actor.worker));}}
  make(entry,ground=false){
    if(entry.effects||entry.loading||!this.textures)return;entry.loading=true;
    entry.ready=this.buildEffects(entry.origin,{floor:baseHeight(entry.event?.route?.[0]),fragmentCount:ground||entry.event?.kind==='barrel'?0:8}).then(fx=>{if(entry.disposed)fx.dispose();else entry.effects=fx;}).catch(e=>this.onError(e));
  }
  draw(camera,library){
    this.flashLight.intensity=0;
    if(!this.state)return;const visible=[...this.state.visible].map(k=>{const [x,z]=k.split(',').map(Number);return {x,z};});
    for(const b of this.bursts.values()){
      if(b.waiting||this.now<b.start||b.worn&&!b.originFixed)continue;
      if(b.event.kind==='barrel'&&library){
        if(!b.motion){const p=b.event.prop;b.motion=createBarrelBlastMotion(library,{skin:'explosiveRed',label:'flammable',position:[p.x,0,p.y],yaw:p.rotated?-Math.PI/2:0});this.scene.add(b.motion.root);}
        b.motion.root.visible=true;b.motion.apply((this.now-b.start)/1000);
      }
      this.make(b);if(b.effects){b.effects.setVisibility(visible);b.effects.update((this.now-b.start)/1000,{camera,contract:{origin:{x:0,y:0},fires:[]},groundOpacity:0});
        const light=b.effects.flashLight;if(light?.intensity>this.flashLight.intensity){this.flashLight.intensity=light.intensity;this.flashLight.position.copy(light.position);}}
    }
    // Persistent cells rebuild from saves; old cells are never withheld by a
    // new explosion. Only newly committed cells wait for that impact's cue.
    const withheld=new Set([...this.bursts.values()].filter(b=>b.waiting||this.now<b.start).flatMap(b=>(b.event.fires||[]).map(key)));
    const level=floorLevel(this.state.units.find(u=>u.team==='squad')),cells=(this.state.fires||[]).filter(p=>p.turns>0&&(p.level??p.z??0)===level&&this.state.visible.has(key(p))&&!withheld.has(key(p)));
    if(this.ground instanceof PreparedGroundFire){this.ground.draw(cells,this.now,camera,this.reduced);return;}
    if(!cells.length){if(this.ground){this.ground.disposed=true;this.ground.effects?.dispose();this.ground=null;}return;}
    this.ground??={origin:V(0,1,0)};const signature=cells.map(key).join(';');
    if(this.ground.signature!==signature){this.ground.signature=signature;this.ground.contract={origin:{x:0,y:0},fires:cells};}
    this.make(this.ground,true);if(this.ground.effects){this.ground.effects.setVisibility(visible);this.ground.effects.update(this.reduced?100:100+this.now/1000,{camera,contract:this.ground.contract});}
  }
  remove(sequence){const b=this.bursts.get(sequence);if(b){b.disposed=true;b.effects?.dispose();b.motion?.dispose();this.bursts.delete(sequence);}}
  dispose(){if(this.disposed)return;this.disposed=true;for(const sequence of this.bursts.keys())this.remove(sequence);for(const entry of this.preparedBarrels.values()){entry.motion?.dispose();entry.effects?.dispose();}this.preparedBarrels.clear();if(this.ground instanceof PreparedGroundFire)this.ground.dispose();else if(this.ground){this.ground.disposed=true;this.ground.effects?.dispose();}this.ground=null;this.flashLight.removeFromParent();this.textures?.forEach(t=>t.dispose());}
}
