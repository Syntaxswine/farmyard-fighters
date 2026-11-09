import * as T from './vendor/three.module.js';
import {toWorld} from './hybrid-world.js';
import {personVisible} from './battle-visibility.js';
import {shotPoint,visibleShotPath} from './battle-shot-effects.js';
import {firePoint} from './fire-events.js';
import {makeBurnRoute,burnState,FIRE_TIME,paintedBurnSupported} from './painted-fire-state.js';
import {createPaintedFireMotion} from './painted-fire-motion.js';
import {createPaintedFireEffects,loadPaintedFireTextures} from './painted-fire-effects.js';
import {dissolveBody} from './painted-fire-actor.js';
import {createWorkerLocomotion} from './worker-locomotion.js';
import {createWeaponModel} from './weapon-models.js';
import {createTankBlastMotion,TANK_TIME} from './tank-blast-motion.js';
import {burnStart} from './battle-combat.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const renderPoint=p=>{const [x,y,z]=toWorld(p);return {x,y,z};};
// Stop with both feet planted at each change of heading. Each straight segment
// uses only accepted neighbor steps; never tween a shortcut across a corner.
export function fireSegments(event){
 const points=event.route.map(renderPoint),segments=[];let part=[points[0]],last=null;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],h=Math.atan2(b.z-a.z,b.x-a.x);
  if(last!==null&&Math.abs(h-last)>1e-6){segments.push(makeBurnRoute(part));part=[a];}
  part.push(b);last=h;
 }
 segments.push(makeBurnRoute(part));
 if(points.length===1)segments[0].heading=(event.route[0].heading||0)*Math.PI/180;
 return segments;
}
export function firePlayback(entry,now){
 let elapsed=Math.max(0,(now-entry.start)/1000),route=entry.segments.at(-1),time=0;
 const terminal=['ash','tank'].includes(entry.event.kind);
 if(terminal)return {route,time:FIRE_TIME.hit+elapsed,terminal,done:elapsed>=2.4};
 for(const segment of entry.segments){
  const duration=.30+Math.max(.28,segment.length*.54)+.04;
  if(elapsed<duration){route=segment;time=FIRE_TIME.hit+elapsed;return {route,time,terminal,done:false};}
  elapsed-=duration;
 }
 const heading=burnState(FIRE_TIME.duration,route,{terminal:false}).point.heading;
 route={...makeBurnRoute([route.points.at(-1)]),heading};
 return {route,time:FIRE_TIME.hit+.30+elapsed%1.55,terminal,done:true};
}
export function visibleFlameShape(event,state,muzzle){
 const shape=event.flame;
 return {...shape,rays:shape.rays.map(ray=>{
  const endpoint=shotPoint({...ray,unitId:event.shooter},state),path=visibleShotPath(state,[muzzle,endpoint]),p=path.at(-1)||muzzle;
  return {...ray,x:p.x,y:p.z,h:p.y,distance:Math.hypot(p.x-shape.origin.x,p.z-shape.origin.y),kind:path.length<2?'hidden':p.distanceToSquared(endpoint)>1e-8?'fog':ray.kind};
 })};
}
export class BattleFire {
 constructor(renderer){
  this.renderer=renderer;this.entries=new Map();this.sessions=new Map();this.failures=new Set();this.sequence=0;this.state=null;this.now=0;this.disposed=false;
  this.ready=loadPaintedFireTextures(renderer.loader).then(textures=>{if(this.disposed)textures.forEach(t=>t.dispose());else this.textures=textures;}).catch(error=>renderer.diagnostics.push('Painted fire unavailable; using fallback: '+error.message));
 }
 observe(state,combat,now,reduced,level){
  if(this.state!==state){this.clear();this.state=state;}
  this.now=now;this.reduced=reduced;
  const shown=u=>u&&personVisible(state,u)&&(level===undefined||(u.z||0)===level);
  for(const session of this.sessions.values())if(session.effects)session.effects.group.visible=false;
  for(const event of state.fireAnimations||[]){
   if(event.sequence<=this.sequence)continue;this.sequence=event.sequence;
   const u=state.units.find(u=>u.id===event.unitId);
   if(reduced||!shown(u)||!paintedBurnSupported(u)||event.kind!=='tank'&&u.weapon!==event.weapon)continue;
   if(u.team!=='squad'&&event.route.some(p=>!state.visible.has((p.z||0)?`${p.x},${p.y},${p.z}`:`${p.x},${p.y}`)))continue;
   try{this.entries.set(u.id,{event,segments:fireSegments(event),start:now,waiting:event.kind!=='panic'});}catch{/* Elevation-changing routes keep the existing presentation. */}
  }
  for(const [id,entry]of this.entries){
   const u=state.units.find(u=>u.id===id),terminal=['ash','tank'].includes(entry.event.kind),tank=entry.event.kind==='tank';
   if(!shown(u)||!paintedBurnSupported(u)||!tank&&u.weapon!==entry.event.weapon||tank&&(!u.tanksExploded||u.hp>0)||u.hp<=0&&!u.burnedRemains||!terminal&&!u.burningTurns&&(entry.event.kind!=='panic'||firePlayback(entry,now).done)||this.renderer.traversal.active?.event.unitId===id){this.remove(id);continue;}
   if(entry.waiting){
    const start=burnStart(entry.event,combat,now);if(start===null)continue;
    entry.start=start;entry.waiting=false;
   }
   if(reduced){if(terminal)entry.start=now-5400;else this.remove(id);}
  }
  // Loaded saves keep final ash and ongoing burns, without replaying attacks or
  // movement. Reappearing guards start at their current visible position.
  for(const u of state.units)if(shown(u)&&paintedBurnSupported(u)&&!this.entries.has(u.id)&&!this.failures.has(u.id)&&this.renderer.traversal.active?.event.unitId!==u.id&&(u.burnedRemains||u.hp>0&&u.burningTurns&&!reduced)){
   const event={unitId:u.id,kind:u.burnedRemains?'ash':'ignite',weapon:u.weapon,route:[firePoint(u)]};
   this.entries.set(u.id,{event,segments:fireSegments(event),start:now-(u.burnedRemains?5400:1500),waiting:false});
  }
 }
 session(model,id){
  let s=this.sessions.get(id);if(s)return s;
  model.draw?.dispose();model.draw=null;model.drawRequested=false;
  model.root.position.set(0,0,0);model.worker.root.position.set(0,0,0);model.root.updateMatrixWorld(true);
  // The hen's walking and fire controllers each own a temporary leg skeleton.
  // Retire one before installing the other; never stack their skin bindings.
  const resumeWalking=!!model.profile.unarmed&&!!model.locomotion;
  model.posture?.resetTail();
  if(resumeWalking){model.locomotion.dispose();model.locomotion=null;}
  let motion;
  try{motion=createPaintedFireMotion(model.worker,model.profile);const value={value:0};
   s={model,motion,skin:{value,dispose:dissolveBody(model.worker,value)},resumeWalking,extraVisibility:new Map()};
  }catch(error){motion?.dispose();if(resumeWalking)model.locomotion=createWorkerLocomotion(model.worker,model.profile);throw error;}
  // Hats and attachment meshes are separate from the painted body.
  model.worker.root.traverse(o=>{if(o.isMesh&&!model.worker.parts.includes(o))s.extraVisibility.set(o,o.visible);});
  this.sessions.set(id,s);return s;
 }
 effects(s){
  if(!s.effects&&!s.loading&&this.textures){s.loading=true;createPaintedFireEffects(this.renderer.scene,this.renderer.loader,s.model.worker,{textures:this.textures,world:true}).then(fx=>{if(s.disposed)fx.dispose();else{s.effects=fx;fx.group.visible=false;}}).catch(error=>this.renderer.diagnostics.push('Fire effects: '+error.message));}
  return s.effects;
 }
 pose(model,unit,shot,now,state,camera){
  const entry=this.entries.get(unit.id),burn=entry&&!entry.waiting&&now>=entry.start;
  const tank=entry?.event.kind==='tank'&&entry.event.weapon==='flamethrower'&&!model.profile.unarmed&&unit.outfit!=='blue-hawaiian';
  const firing=shot?.paintedFire&&!this.reduced&&unit.hp>0&&!unit.burningTurns;
  if(!paintedBurnSupported(unit)||!tank&&!model.profile.unarmed&&model.weapon!==unit.weapon||this.failures.has(unit.id)||!burn&&!firing&&!tank){this.release(unit.id);return false;}
  try{
   // A committed death has already removed the real inventory. Retain only the
   // presentation equipment until rupture; late model loads use the receipt.
   if(tank&&model.weapon!=='flamethrower'){
    this.release(unit.id);const old=model.equipment;model.equipment=createWeaponModel('flamethrower');model.worker.equipWeapon(model.equipment);old?.dispose();model.weapon='flamethrower';
   }
   const settled=this.sessions.get(unit.id);if(burn&&settled?.settledEvent===entry.event){settled.effects.group.visible=true;return true;}
   const s=this.session(model,unit.id),{worker,root}=model;root.position.set(0,0,0);root.updateMatrixWorld(true);
   const fx=this.effects(s);let playback,result;
   if(burn||tank){
    playback=firePlayback(entry,now);
    // Keep a visible, lootable body if the ash texture is still loading or failed.
    const poseTime=playback.terminal&&!fx?Math.min(playback.time,1.84):playback.time;
    if(tank){
     if(s.tankEvent!==entry.event){s.blast=createTankBlastMotion({worker,motion:s.motion,dissolve:s.skin.value},playback.route);s.tankEvent=entry.event;this.renderer.tankEffects?.setOrigin(entry.event.sequence,s.blast.origin);}
     const time=entry.waiting||now<entry.start?0:TANK_TIME.burst+poseTime-FIRE_TIME.hit;
     result=s.blast.apply(time).body;
    }else result=s.motion.burn(poseTime,playback.route,{terminal:playback.terminal});
    s.skin.value.value=result.state.dissolve;
    if(!result.state.bodyVisible)for(const [o]of s.extraVisibility)o.visible=false;
    model.paint.setGripForearm?.(result.state.bodyVisible&&!!worker.weapon?.carry?.handPoses?.support?.gripMesh);
    if(fx)fx.update(tank&&(!burn)?0:playback.time,{camera,route:playback.route,flame:false,terminal:playback.terminal,groundPoint:s.motion.groundPoint,suppressSmoke:tank&&playback.time<FIRE_TIME.hit+.45});
    if(fx&&playback.terminal&&playback.time>=FIRE_TIME.duration)s.settledEvent=entry.event;
    s.playback=playback;
   }else{
    result=s.motion.fire((now-shot.start)/1000,{position:V(...toWorld(shot.shooter)),heading:shot.event.flame.heading});s.skin.value.value=0;
    const muzzle=worker.weapon.anchors.muzzle.getWorldPosition(V());
    if(fx){
     if(!shot.paintedShape||shot.paintedRevision!==state.revision||shot.paintedVisible!==state.visible){shot.paintedShape=visibleFlameShape(shot.event,state,muzzle);shot.paintedRevision=state.revision;shot.paintedVisible=state.visible;}
     fx.update((now-shot.start)/1000,{shape:shot.paintedShape,muzzle,camera,route:makeBurnRoute([renderPoint(shot.shooter)]),body:false});
    }
    else this.renderer.flameEffects.update({...shot,phase:{...shot.phase,elapsed:shot.phase.elapsed/2100*1100}},state,{origin:muzzle});
   }
   root.updateMatrixWorld(true);worker.skeleton.update();for(const part of worker.parts){part.computeBoundingBox?.();part.computeBoundingSphere?.();}
   model.signature=null;model.placement=null;return true;
  }catch(error){this.failures.add(unit.id);this.remove(unit.id);this.renderer.diagnostics.push('Fire animation fallback ('+unit.species+'): '+error.message);return false;}
 }
 display(unit){
  const e=this.entries.get(unit.id);if(!e||e.waiting||this.now<e.start)return unit;
  const p=firePlayback(e,this.now),point=burnState(p.time,p.route,{terminal:p.terminal}).point;
  return {...unit,x:point.x,y:point.z,heading:p.route.length?point.heading*180/Math.PI:unit.heading};
 }
 get busy(){return [...this.entries.values()].some(e=>!this.reduced&&(e.waiting||this.now<e.start||!firePlayback(e,this.now).done));}
 pick(ray,include=()=>true){
  const hits=[];for(const [id,s]of this.sessions)if(include(id)&&s.effects?.group.visible&&s.effects.ash.visible)for(const h of ray.intersectObject(s.effects.ash))hits.push({id,distance:h.distance});
  return hits.sort((a,b)=>a.distance-b.distance)[0]?.id??null;
 }
 release(id){
  const s=this.sessions.get(id);if(!s)return;s.disposed=true;s.motion.dispose();s.skin.dispose();s.effects?.dispose();
  for(const [o,visible]of s.extraVisibility)o.visible=visible;
  s.model.worker.root.position.set(0,0,0);s.model.worker.root.rotation.set(0,0,0);
  if(s.resumeWalking)s.model.locomotion=createWorkerLocomotion(s.model.worker,s.model.profile);
  s.model.signature=null;s.model.placement=null;this.sessions.delete(id);
 }
 remove(id){this.release(id);this.entries.delete(id);this.renderer.motion.tracks.delete(id);this.renderer.motion.samples.delete(id);}
 clear(){for(const id of this.sessions.keys())this.release(id);this.entries.clear();this.failures.clear();this.sequence=0;}
 dispose(){this.disposed=true;this.clear();this.textures?.forEach(t=>t.dispose());}
}
