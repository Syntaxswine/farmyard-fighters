import * as T from './vendor/three.module.js';
import {BLOOD_ATLAS} from './painted-blood-spray-data.js';
import {STAIN_ATLAS} from './painted-blood-followup-data.js';
import {BloodSprayPool,BLOOD_EMITTER_LIMIT,BLOOD_PARTICLE_LIMIT} from './blood-spray-pool.js';
import {FATAL_HEAD_ATLAS,FATAL_HEAD_CELLS} from './fatal-head-data.js';
import {createFatalHeadMotion,FATAL_HEAD_DURATION} from './fatal-head-motion.js';
import {BloodStainBatches} from './blood-stain-batches.js';
import {gunshotSprayFrame,poseGunshotVictim} from './gunshot-spray-frame.js';
import {canPresentBodyImpact,shotVisible} from './shot-coordinates.js';
import {personVisible} from './battle-visibility.js';
import {traceWorld} from './hybrid-world.js';

export function bloodClipPlanes(world,placement){
 if(!world?.index)return [];
 const origin=placement.contact.toArray(),x=placement.outgoing,y=new T.Vector3().setFromMatrixColumn(placement.matrix,1),z=new T.Vector3().setFromMatrixColumn(placement.matrix,2),planes=[];
 for(const [up,side]of [[0,0],[.3,.25],[.3,-.25],[-.3,.25],[-.3,-.25]]){
  const end=placement.contact.clone().addScaledVector(x,.72).addScaledVector(y,up).addScaledVector(z,side).toArray(),hit=traceWorld(world,origin,end);
  if(!hit||hit.distance<.01||hit.normal.every(v=>v===0))continue;
  const normal=new T.Vector3(...hit.normal);planes.push({normal,constant:normal.dot(new T.Vector3(...hit.point))});
 }
 return planes;
}

// Owns cosmetics for one encounter. Receipts and simulation state are read-only;
// no callbacks roll combat, assign HP or keep the firing queue open.
export class BattleBlood {
 constructor(scene,{loader,loading,onReady=()=>{},onError=()=>{},mode='full',textures}={}){
  this.scene=scene;this.mode=mode;this.seen=new Set();this.pending=new Map();this.disposed=false;this.textures=[];this.state=null;
  const install=images=>{if(this.disposed){for(const t of new Set(images))t.dispose();return;}this.textures=images;this.pool=new BloodSprayPool(scene,images[0]);this.stains=new BloodStainBatches(images[1]);if(images[2])this.fatalPool=new BloodSprayPool(scene,images[2],{cardCount:48,slotCount:4,duration:FATAL_HEAD_DURATION,motion:createFatalHeadMotion,cells:FATAL_HEAD_CELLS});onReady();};
  this.load=()=>{
   if(this.disposed||this.loading||this.pool)return this.ready;
   this.loading=true;loading?.start();this.ready=Promise.allSettled([BLOOD_ATLAS,STAIN_ATLAS,FATAL_HEAD_ATLAS].map(url=>{try{return loader.loadAsync(url);}catch(error){return Promise.reject(error);}})).then(results=>{
    const images=results.filter(r=>r.status==='fulfilled').map(r=>r.value),failure=results.find(r=>r.status==='rejected');
    if(failure){for(const t of new Set(images))t.dispose();if(!this.disposed)onError('Blood effects unavailable: '+(failure.reason?.message||'atlas could not load'));}
    else install(images);
   }).finally(()=>{this.loading=false;loading?.end();if(!this.disposed)onReady();});return this.ready;
  };
  this.ready=Promise.resolve();if(textures)install(textures);else if(mode!=='off')this.load();
 }
 setMode(mode){
  if(!['full','reduced','off'].includes(mode))mode='full';if(mode===this.mode)return;this.mode=mode;
  this.pool?.clear();this.fatalPool?.clear();this.pending.clear();if(mode==='off')this.stains?.clear();else if(mode==='reduced')this.stains?.reduce();
  if(mode!=='off'&&!this.pool)this.load();
 }
 begin(active,state,now,{reducedMotion=false,busy=false}={}){
  this.state=state;this.now=now;this.reducedMotion=reducedMotion;this.pending.clear();this.stampsRemaining=2;
  if(this.definition&&this.definition!==state.definition)this.clear();this.definition=state.definition;
  if(['won','lost'].includes(state.phase)&&!busy)this.stains?.clear();
  if(!active?.phase.discharged)return;
  active.paintedBodyImpact=this.mode!=='off'&&!!this.pool;
  active.bodyVisualContacts??=new Map();
  active.bodyVisualPlacements??=new Map();
  for(const receipt of active.event.bodyImpacts||[]){
   if(this.seen.has(receipt.id))continue;this.seen.add(receipt.id);if(this.seen.size>2048)this.seen.delete(this.seen.values().next().value);
   const victim=state.units.find(u=>u.id===receipt.victimId);
   if(this.mode==='off'||!this.pool||!victim||!personVisible(state,victim)||!canPresentBodyImpact(receipt,active,state))continue;
   if(!this.pending.has(receipt.victimId))this.pending.set(receipt.victimId,[]);this.pending.get(receipt.victimId).push(receipt);
  }
  this.active=active;
 }
 capture(id,model,world){
  const receipts=this.pending.get(id);if(!receipts?.length)return false;this.pending.delete(id);
  poseGunshotVictim(model,receipts[0]);
  const cache=new Map(),stampedRegions=new Set();
  for(const receipt of receipts){
   const key=JSON.stringify([receipt.zone,receipt.contact,receipt.incoming]),placement=cache.get(key)||gunshotSprayFrame(receipt,{model:{victimId:id,parts:model.worker.parts}});cache.set(key,placement);
   if(!placement.surfaceSource)continue; // No floating spray or empty-air stain.
   this.active.bodyVisualPlacements.set(receipt.projectileId,{placement:placement.placement,correction:placement.correction});
   const visualContact=placement.contact.clone();visualContact.shotLevel=placement.contact.shotLevel;this.active.bodyVisualContacts.set(receipt.projectileId,visualContact);
   const fatal=receipt.fatalHead&&this.mode==='full'&&!!this.fatalPool&&model.fatalMask?.supported!==false,pool=fatal?this.fatalPool:this.pool;
   this.pool.expire(this.now);this.fatalPool?.expire(this.now);
   const emitters=this.pool.active+(this.fatalPool?.active||0),cards=this.pool.active*18+(this.fatalPool?.active||0)*48;
   if(emitters<BLOOD_EMITTER_LIMIT&&cards+pool.cardCount<=BLOOD_PARTICLE_LIMIT)pool.spawn(placement,this.now,{seed:receipt.visualSeed,strength:Math.max(.7,Math.min(1.2,.7+.5*receipt.injuryDamage/receipt.maxHp)),reduced:this.mode==='reduced',still:this.reducedMotion,planes:bloodClipPlanes(world,placement)});
   if(!fatal&&this.stampsRemaining>0&&!stampedRegions.has(receipt.zone)){
    if(this.stains.stamp(id,model.worker,{...placement,zone:receipt.zone,visualSeed:receipt.visualSeed},this.now,{reduced:this.mode==='reduced'}))this.stampsRemaining--;
    stampedRegions.add(receipt.zone);
   }
  }
  return true;
 }
 update(now,camera){
  this.pending.clear();this.stains?.sync();
  if(this.reducedMotion)for(const pool of [this.pool,this.fatalPool])if(pool)for(const slot of pool.slots)slot.still=true;
  const visible=p=>this.mode!=='off'&&shotVisible(this.state,p),ordinary=this.pool?.update(now,camera,visible),fatal=this.fatalPool?.update(now,camera,visible);
  this.lastStats=ordinary&&{liveCards:ordinary.liveCards+(fatal?.liveCards||0),capacity:BLOOD_PARTICLE_LIMIT,drawCalls:ordinary.drawCalls+(fatal?.drawCalls||0)};return this.lastStats;
 }
 warm(renderer,camera,model){
  if(this.warmed||!this.pool||!model||!renderer.compile)return;
  this.warmed=true;const spray=this.pool.effect.mesh,slot=this.stains.slots[0],mesh=slot.mesh,parent=mesh.parent,visible=mesh.visible,rootVisible=model.root.visible;
  const fatal=this.fatalPool?.effect.mesh,masked=model.fatalMask?.destroyed;
  spray.visible=true;if(fatal)fatal.visible=true;model.fatalMask?.setDestroyed(true);mesh.skeleton=model.worker.skeleton;mesh.bindMatrix.copy(model.worker.parts[0].bindMatrix);mesh.bindMatrixInverse.copy(model.worker.parts[0].bindMatrixInverse);model.worker.root.add(mesh);mesh.visible=true;
  model.root.visible=true;try{renderer.compile(this.scene,camera);}finally{model.root.visible=rootVisible;model.fatalMask?.setDestroyed(masked);spray.visible=false;if(fatal)fatal.visible=false;mesh.visible=visible;mesh.removeFromParent();if(parent)parent.add(mesh);}
 }
 clear(){this.pool?.clear();this.fatalPool?.clear();this.stains?.clear();this.pending.clear();this.seen.clear();this.active=null;}
 dispose(){if(this.disposed)return;this.disposed=true;this.clear();this.pool?.dispose();this.fatalPool?.dispose();this.stains?.dispose();for(const t of new Set(this.textures))t.dispose();this.textures=[];}
}
