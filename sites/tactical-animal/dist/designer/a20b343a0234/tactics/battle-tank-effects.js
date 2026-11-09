import * as T from './vendor/three.module.js';
import {toWorld} from './hybrid-world.js';
import {personVisible} from './battle-visibility.js';
import {burnStart} from './battle-combat.js';
import {cliffSupportAt} from './cliff-support.js';
import {rampSupportAt} from './cliff-ramps.js';
import {towerForUnit,TOWERS} from './tower-geometry.js';
import {paintedOperatorSupported} from './painted-fire-state.js';
import {createTankBlastEffects,loadTankBlastTextures} from './tank-blast-effects.js';
import {barrelKey} from './explosive-barrels.js';
import {cargoFinish} from './battle-environment.js';
import {createBarrelBlastMotion,BARREL_TIME} from './barrel-blast-motion.js';

const EMPTY={origin:{x:0,y:0},fires:[]},V=(...a)=>new T.Vector3(...a);
const key=p=>p.z?`${p.x},${p.y},${p.z}`:`${p.x},${p.y}`;
export function fireFloor(state,p){return toWorld({...p,cliffSupport:rampSupportAt(state,p)||cliffSupportAt(state,p)})[1];}
export function visibleFireLayers(state,level,withheld=new Set()){
 const layers=new Map();for(const p of state.fires||[]){
  if(p.turns<=0||level!==null&&(p.z||0)!==level||!state.visible.has(key(p))||withheld.has(key(p)))continue;
  const height=fireFloor(state,p);if(!layers.has(height))layers.set(height,[]);layers.get(height).push(p);
 }return layers;
}
function debrisSurface(state,p){
 const tower=towerForUnit(state,p),height=toWorld(p)[1],heights=new Map();
 return (x,y)=>{
  if(tower){const f=TOWERS[tower.kind],w=tower.rotated?f.h:f.w,h=tower.rotated?f.w:f.h;if(x>=tower.x-.5&&x<tower.x+w-.5&&y>=tower.y-.5&&y<tower.y+h-.5)return height;}
  x=Math.round(x);y=Math.round(y);const key=`${x},${y}`;if(heights.has(key))return heights.get(key);
  for(let z=p.z||0;z>=0;z--){const t=z?state.upper?.[z-1]?.[key]:state.map?.[y]?.[x];if(t&&t!=='void'){const h=fireFloor(state,{x,y,z});heights.set(key,h);return h;}}heights.set(key,0);return 0;
 };
}
// Transient bursts consume receipts once. Persistent fire follows s.fires and
// remains visible until the rules expire it, including after loading a save.
export class BattleTankEffects {
 constructor(renderer){
  this.renderer=renderer;this.bursts=new Map();this.ground=new Map();this.sequence=0;this.disposed=false;
  this.ready=loadTankBlastTextures(renderer.loader).then(t=>{if(this.disposed)t.forEach(x=>x.dispose());else this.textures=t;}).catch(e=>renderer.diagnostics.push('Tank effects unavailable: '+e.message));
 }
 observe(state,combat,now,reduced,level=0){
  if(this.state!==state){this.clear();this.state=state;}this.now=now;this.reduced=reduced;this.level=level;
  for(const e of state.fireAnimations||[]){
   if(e.sequence<=this.sequence)continue;this.sequence=e.sequence;if(!['tank','barrel'].includes(e.kind))continue;
   const barrel=e.kind==='barrel',u=barrel?e.prop:state.units.find(u=>u.id===e.unitId);
   if(reduced||!u||(barrel?!state.visible.has(barrelKey(u)):!personVisible(state,u))||level!==null&&(u.z||0)!==level)continue;
   const p=e.route[0],origin=V(...toWorld(p));if(barrel)origin.y=fireFloor(state,p);origin.y+=barrel?.4:.8;
   this.bursts.set(e.sequence,{event:e,origin,point:p,waiting:true,start:now,worn:!barrel&&paintedOperatorSupported({...u,weapon:e.weapon})});
  }
  for(const [id,b]of this.bursts){
   const barrel=b.event.kind==='barrel',u=barrel?b.event.prop:state.units.find(u=>u.id===b.event.unitId);
   if(reduced||!u||(barrel?!state.visible.has(barrelKey(u)):!personVisible(state,u))||level!==null&&(u.z||0)!==level||now-b.start>5400&&!b.waiting){this.remove(id);continue;}
   if(b.waiting){const start=burnStart(b.event,combat,now);if(start!==null){b.start=start;b.waiting=false;}}
  }
 }
 pendingProps(){return [...this.bursts.values()].filter(b=>b.event.kind==='barrel'&&(b.waiting||this.now<b.start)).map(b=>b.event.prop);}
 setOrigin(sequence,origin){const b=this.bursts.get(sequence);if(b&&!b.originFixed){b.origin.copy(origin);b.originFixed=true;}}
 make(entry,options){
  if(entry.effects||entry.loading||!this.textures)return;entry.loading=true;
  createTankBlastEffects(this.renderer.scene,this.renderer.loader,entry.origin,{textures:this.textures,world:true,fragmentCount:entry.event?.kind==='barrel'?0:8,...options}).then(fx=>{if(entry.disposed)fx.dispose();else{entry.effects=fx;fx.group.visible=false;}}).catch(e=>this.renderer.diagnostics.push('Tank effects: '+e.message));
 }
 draw(camera){
  const state=this.state;if(!state)return;
  const visibleAt=level=>[...state.visible].map(k=>k.split(',').map(Number)).filter(p=>(p[2]||0)===level).map(p=>({x:p[0],z:p[1]}));
  for(const b of this.bursts.values()){
   if(b.waiting||this.now<b.start||b.worn&&!b.originFixed)continue;
   const barrel=b.event.kind==='barrel',floor=barrel?fireFloor(state,b.point):toWorld(b.point)[1],surfaceAt=debrisSurface(state,b.point);
   this.make(b,{floor,surfaceAt});
   if(b.effects){
    const age=(this.now-b.start)/1000;b.effects.setVisibility(visibleAt(b.point.z||0));b.effects.update(age,{camera,contract:EMPTY,groundOpacity:0});
    const library=this.renderer.paintedEnvironment?.library;
    if(barrel&&library&&!b.motion){
     const prop=b.event.prop,{skin,label}=cargoFinish(prop);
     b.motion=createBarrelBlastMotion(library,{skin,label,position:[prop.x,floor,prop.y],yaw:prop.rotated?-Math.PI/2:0,surfaceAt});
     for(const f of b.motion.fragments)b.effects.clipObject(f.root);
     this.renderer.scene.add(b.motion.root);
    }
    // The study's intact lead-in is already supplied by pendingProps().
    b.motion?.apply(BARREL_TIME.burst+age);
   }
  }
  const withheld=new Set([...this.bursts.values()].filter(b=>b.waiting||this.now<b.start).flatMap(b=>(b.event.fires||[]).map(key)));
  const layers=visibleFireLayers(state,this.level,withheld);
  for(const [height,e]of this.ground)if(!layers.has(height)){e.disposed=true;e.effects?.dispose();this.ground.delete(height);}
  for(const [height,cells]of layers){
   let e=this.ground.get(height);if(!e){e={origin:V(0,height+1,0)};this.ground.set(height,e);}
   const signature=cells.map(key).join(';');if(signature!==e.signature){e.signature=signature;e.contract={origin:{x:0,y:0},fires:cells};}
   this.make(e,{floor:height});if(e.effects)e.effects.update(this.reduced?100:100+this.now/1000,{camera,contract:e.contract});
  }
 }
 get busy(){return !this.reduced&&[...this.bursts.values()].some(b=>b.waiting||this.now-b.start<4000);}
 remove(id){const b=this.bursts.get(id);if(b){b.disposed=true;b.motion?.dispose();b.effects?.dispose();this.bursts.delete(id);}}
 clear(){for(const id of this.bursts.keys())this.remove(id);for(const e of this.ground.values()){e.disposed=true;e.effects?.dispose();}this.ground.clear();this.sequence=0;}
 dispose(){this.disposed=true;this.clear();this.textures?.forEach(t=>t.dispose());}
}
