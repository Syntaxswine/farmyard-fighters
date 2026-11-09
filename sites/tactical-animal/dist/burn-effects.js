import * as T from './aft/tactics/vendor/three.module.js';
import {makeBurnRoute,burnState,FIRE_TIME,paintedBurnSupported} from './aft/tactics/painted-fire-state.js';
import {createPaintedFireEffects,FIRE_ASSETS} from './aft/tactics/painted-fire-effects.js';
import {createPaintedFireMotion} from './designer/a20b343a0234/tactics/painted-fire-motion.js';
import {dissolveBody} from './designer/a20b343a0234/tactics/painted-fire-actor.js';
import {createWorkerLocomotion} from './aft/tactics/worker-locomotion.js';
import {createTankBlastMotion,TANK_TIME} from './designer/a20b343a0234/tactics/tank-blast-motion.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const cell=p=>`${Math.round(p.x)},${Math.round(p.y)}`;
export function burnSegments(event){
  const points=event.route.map(p=>({x:p.x,y:0,z:p.y})),segments=[];let part=[points[0]],last=null;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],heading=Math.atan2(b.z-a.z,b.x-a.x);
    if(last!==null&&Math.abs(heading-last)>1e-6){segments.push(makeBurnRoute(part));part=[a];}
    part.push(b);last=heading;
  }
  segments.push(makeBurnRoute(part));if(points.length===1)segments[0].heading=(event.route[0].heading||0)*Math.PI/180;return segments;
}
export function burnPlayback(entry,now){
  let age=Math.max(0,(now-entry.start)/1000),route=entry.segments.at(-1);const terminal=['ash','tank'].includes(entry.event.kind);
  if(terminal)return {route,time:FIRE_TIME.hit+age,terminal,done:age>=2.4};
  for(const segment of entry.segments){const duration=.30+Math.max(.28,segment.length*.54)+.04;if(age<duration)return {route:segment,time:FIRE_TIME.hit+age,terminal,done:false};age-=duration;}
  const heading=burnState(FIRE_TIME.duration,route,{terminal:false}).point.heading;
  return {route:{...makeBurnRoute([route.points.at(-1)]),heading},time:FIRE_TIME.hit+.30+age%1.55,terminal,done:true};
}
// Reuses AFT's fitted roster motion, engulfing cards, dissolution and ash.
// Absolute world routes are receipts, never requests to move or damage actors.
export class SoloBurnEffects{
  constructor(scene,{loadTexture=url=>new T.TextureLoader().loadAsync(url),reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false,onError=error=>console.warn('Burn artwork unavailable; keeping selectable remains.',error)}={}){
    Object.assign(this,{scene,loadTexture,reducedMotion,onError,entries:new Map(),sessions:new Map(),failures:new Set(),sequence:0,disposed:false});
  }
  load(){
    if(this.ready)return;this.ready=Promise.allSettled(Object.values(FIRE_ASSETS).map(path=>this.loadTexture(new URL(path,new URL('./aft/tactics/',import.meta.url)).href))).then(results=>{
      if(results.some(r=>r.status==='rejected')||this.disposed){for(const r of results)if(r.status==='fulfilled')r.value.dispose();if(!this.disposed)this.onError(results.find(r=>r.status==='rejected').reason);return;}
      this.textures=results.map(r=>r.value);for(const t of this.textures)t.colorSpace=T.SRGBColorSpace;
    });
  }
  observe(state,now,visibleUnits,startFor=()=>now){
    this.now=now;this.reduced=!!this.reducedMotion();const shown=new Set(visibleUnits.map(u=>u.id));
    for(const [id]of this.sessions)if(!shown.has(id))this.remove(id);
    for(const event of state.fireAnimations||[]){
      if(event.sequence<=this.sequence)continue;this.sequence=event.sequence;
      const u=visibleUnits.find(u=>u.id===event.unitId);if(this.reduced||!u||!paintedBurnSupported(u)||event.route.some(p=>!state.visible.has(cell(p))))continue;
      try{this.entries.set(u.id,{event,segments:burnSegments(event),start:now,waiting:event.kind!=='panic'});}catch(error){this.onError(error);}
    }
    for(const [id,entry]of this.entries){const u=visibleUnits.find(u=>u.id===id);
      if(!u||!paintedBurnSupported(u)||entry.event.kind!=='tank'&&u.weapon!==entry.event.weapon||!u.burningTurns&&!u.burnedRemains){this.remove(id);continue;}
      if(entry.waiting){const start=startFor(entry.event,now);if(start!==null){entry.start=start;entry.waiting=false;}}
    }
    for(const u of visibleUnits)if(paintedBurnSupported(u)&&(u.burnedRemains||u.hp>0&&u.burningTurns)&&!this.entries.has(u.id)&&!this.failures.has(u.id)){
      const event={unitId:u.id,kind:u.burnedRemains?'ash':'ignite',weapon:u.weapon,route:[{x:u.x,y:u.y,heading:u.heading}]};
      this.entries.set(u.id,{event,segments:burnSegments(event),start:now-(u.burnedRemains?5400:1500),waiting:false});
    }
    if(this.entries.size)this.load();
  }
  session(actor,id){
    let s=this.sessions.get(id);if(s?.actor===actor)return s;if(s)this.release(id);
    actor.root.position.set(0,0,0);actor.worker.root.position.set(0,0,0);actor.root.updateMatrixWorld(true);actor.posture?.resetTail();
    const resumeWalking=!!actor.profile.unarmed;if(resumeWalking){actor.locomotion.dispose();actor.locomotion=null;}
    const value={value:0};let motion,restoreSkin;
    try{motion=createPaintedFireMotion(actor.worker,actor.profile);restoreSkin=dissolveBody(actor.worker,value);}catch(error){motion?.dispose();if(resumeWalking)actor.locomotion=createWorkerLocomotion(actor.worker,actor.profile);throw error;}
    s={actor,motion,value,restoreSkin,resumeWalking};this.sessions.set(id,s);return s;
  }
  equipmentFor(unit){const event=this.entries.get(unit.id)?.event;return event?.kind==='tank'&&event.worn?'flamethrower':unit.weapon;}
  pose(actor,unit,camera){
    const entry=this.entries.get(unit.id);if(!entry||this.failures.has(unit.id)||!paintedBurnSupported(unit)){this.release(unit.id);return false;}
    try{
      const s=this.session(actor,unit.id);actor.root.position.set(0,0,0);actor.root.updateMatrixWorld(true);
      if(s.settledEvent===entry.event){s.effects.group.visible=true;actor.pick.position.set(unit.x,.18,unit.y);actor.ring.position.set(unit.x,.018,unit.y);actor.shadow.position.set(unit.x,.01,unit.y);return true;}
      if(this.textures&&!s.effects&&!s.loading){s.loading=true;createPaintedFireEffects(this.scene,null,actor.worker,{textures:this.textures,world:true}).then(fx=>{if(s.disposed)fx.dispose();else s.effects=fx;}).catch(e=>this.onError(e));}
      if(this.reduced){entry.segments=burnSegments({route:[{x:unit.x,y:unit.y,heading:unit.heading}]});entry.start=this.now-(unit.burnedRemains?5400:1500);entry.waiting=false;}
      const p=burnPlayback(entry,this.now),waiting=entry.waiting||this.now<entry.start;
      const time=waiting?0:p.terminal&&!s.effects?Math.min(p.time,1.84):p.time;
      let result;
      if(entry.event.kind==='tank'&&entry.event.worn){
        if(s.tankEvent!==entry.event){s.blast=createTankBlastMotion({worker:actor.worker,motion:s.motion,dissolve:s.value},p.route);s.tankEvent=entry.event;this.tankEffects?.setOrigin(entry.event.sequence,s.blast.origin);}
        result=s.blast.apply(waiting?0:TANK_TIME.burst+time-FIRE_TIME.hit).body;
      }else result=s.motion.burn(time,p.route,{terminal:p.terminal});s.value.value=result.state.dissolve;
      actor.paint.setGripForearm?.(result.state.bodyVisible&&!!actor.worker.weapon?.carry?.handPoses?.support?.gripMesh);
      if(s.effects)s.effects.update(waiting?0:p.time,{camera,route:p.route,flame:false,terminal:p.terminal,groundPoint:s.motion.groundPoint,body:true});
      const point=result.state.point;actor.pick.position.set(point.x,unit.hp>0?.9:.18,point.z);actor.ring.position.set(point.x,.018,point.z);actor.shadow.position.set(point.x,.01,point.z);
      actor.root.updateMatrixWorld(true);actor.worker.skeleton.update();if(s.effects&&p.terminal&&p.time>=FIRE_TIME.duration)s.settledEvent=entry.event;return true;
    }catch(error){this.failures.add(unit.id);this.remove(unit.id);actor.root.position.set(unit.x,0,unit.y);this.onError(error);return false;}
  }
  release(id){const s=this.sessions.get(id);if(!s)return;s.disposed=true;s.motion.dispose();s.restoreSkin();s.effects?.dispose();s.actor.worker.root.position.set(0,0,0);s.actor.worker.root.rotation.set(0,0,0);if(s.resumeWalking)s.actor.locomotion=createWorkerLocomotion(s.actor.worker,s.actor.profile);s.actor.signature=null;this.sessions.delete(id);}
  remove(id){this.release(id);this.entries.delete(id);}
  dispose(){if(this.disposed)return;this.disposed=true;for(const id of this.sessions.keys())this.release(id);this.entries.clear();this.textures?.forEach(t=>t.dispose());}
}
