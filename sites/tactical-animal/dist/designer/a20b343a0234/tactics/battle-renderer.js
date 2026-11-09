import {SceneryScene} from './scenery-scene.js';
import {StrategicSiteScene} from './strategic-site-scene.js';
import {strategicTarget} from './strategic-site-damage.js';
import {WallXray,pickWallDoor} from './wall-xray.js';
import {InteriorFogScene} from './interior-fog-scene.js';
import {prepareLadderRoute} from './ladder-preparation.js';
import {CliffMapScene} from './cliff-map-scene.js';
import {BattleLoot} from './battle-loot.js';
import {createEquipmentDraw,DRAW_DURATION_MS} from './equipment-draw.js';
import {BattleTraversal} from './battle-traversal.js';
import {LightingScene} from './lighting-scene.js';
import {DaylightRig} from './daylight-rig.js';
import * as T from './vendor/three.module.js';
import {HybridRenderer} from './hybrid-renderer.js';
import {toWorld} from './hybrid-world.js';
import {ANIMAL_MOTION_CATALOG} from './animal-motion-catalog.js';
import {createRedHatCap} from './red-hat-model.js';
import {createAnimalPaint} from './animal-motion-paint.js';
import {createWeaponModel} from './weapon-models.js';
import {StaticModelBatches} from './static-model-batches.js';
import {personVisible} from './battle-visibility.js';
import {BattleEnvironment,PAINTED_PROP_FORMS} from './battle-environment.js';
import {createBattlePosture} from './battle-posture.js';
import {BattleMotion} from './battle-motion.js';
import {createWorkerLocomotion} from './worker-locomotion.js';
import {BattleCombat} from './battle-combat.js';
import {BattleGrenades} from './battle-grenades.js';
import {createRifleFiring} from './rifle-firing.js';
import {BattleShotEffects,shotPoint} from './battle-shot-effects.js';
import {BattleFlameEffects} from './battle-flame-effects.js';
import {BattleFire} from './battle-fire.js';
import {BattleTankEffects} from './battle-tank-effects.js';
import {motionPreference,readSettings} from './settings-3d.js';
import {BattleBlood} from './battle-blood.js';
import {ensureFatalHead,presentFatalHead} from './battle-fatal-head.js';
import {BattleWeaponDrops} from './battle-weapon-drops.js';
import {BattleAudio} from './battle-audio.js';
import {prepareBloodProjection} from './painted-blood-stain.js';
import {barrelTarget,presentBarrel} from './explosive-barrels.js';
import {CharacterBatches,CHARACTER_PICK_LAYER} from './character-batches.js';
import {createOffhandEquipment} from './offhand-equipment.js';
import {handWeapons,pairedInHand} from './one-handed.js';
import {GunshotImpactDebug} from './gunshot-impact-debug.js';

// These weapons use ordinary material/UV coordinates. Their exact rigid parts
// can share draws, while named meshes and grip/muzzle anchors remain in the rig.
// Object-space-painted weapons and the deforming fuel hose retain their draws.
export function createBattleEquipment(id){
 const asset=createWeaponModel(id);if(!['pistol','rifle','shotgun','knife'].includes(asset.id))return asset;
 const batches=new StaticModelBatches(asset.root),dispose=asset.dispose;let disposed=false;
 asset.dispose=()=>{if(disposed)return;disposed=true;batches.dispose();dispose.call(asset);};return asset;
}

// Reuse only the environment/camera presentation. No hybrid combat mode.
export class BattleRenderer extends HybridRenderer {
 constructor(onReady=()=>{}){
  super(onReady);this.wallXray=new WallXray();this.daylight=new DaylightRig(this.scene,this.renderer);this.models=new Map();this.meshData=new Map();this.pending=new Set();this.generation=0;
  this.sceneryAssets=new SceneryScene(this.scene,this.loader,()=>{this.world=null;onReady();},e=>this.diagnostics.push('Scenery: '+e.message),this.renderer);this.sites=new StrategicSiteScene(this.scene,this.loader,()=>{this.world=null;onReady();},e=>this.diagnostics.push('Strategic sites: '+e.message));this.cliffs=new CliffMapScene(this.scene);this.interiorFog=new InteriorFogScene(this.scene,this.wallXray);this.lights=new LightingScene(this.scene,this.loader,onReady,e=>this.diagnostics.push('Lighting: '+e.message));
  this.loot=new BattleLoot(this.scene);this.motion=new BattleMotion();this.reducedMotion=motionPreference();
  this.traversal=new BattleTraversal(prepareLadderRoute);this.combat=new BattleCombat();this.shotEffects=new BattleShotEffects(this.scene);
  this.impactDebug=new GunshotImpactDebug(this.scene,{enabled:new URLSearchParams(globalThis.location?.search||'').get('impactDebug')==='1'||new URLSearchParams(globalThis.location?.search||'').get('study')==='gunshot-impacts'});
  this.blood=new BattleBlood(this.scene,{loader:this.optionalLoader,loading:this.loading,mode:readSettings().blood,onReady,onError:message=>{if(!this.diagnostics.includes(message))this.diagnostics.push(message);}});
  this.weaponDrops=new BattleWeaponDrops(this.scene,{onError:message=>{if(!this.diagnostics.includes(message))this.diagnostics.push(message);}});
  this.audio=new BattleAudio({volume:readSettings().effectsVolume,onError:message=>{if(!this.diagnostics.includes(message))this.diagnostics.push(message);}});
  this.flameEffects=new BattleFlameEffects(this.scene);
  this.grenades=new BattleGrenades(this.scene,{loader:this.loader,onError:message=>this.diagnostics.push(message)});
  this.fire=new BattleFire(this);
  this.tankEffects=new BattleTankEffects(this);
  this.paintedEnvironment=new BattleEnvironment(this.scene,this.loader,()=>{this.world=null;onReady();},error=>{this.diagnostics.push('Painted environment failed: '+error.message);onReady();});
 }
 rebuild(world,seen,level,map){
  this.interiorFog.update(map,world);
  map={...map,concealedInteriors:this.interiorFog.hidden};
  const scenery={...world,boxes:world.boxes.filter(b=>!(b.kind==='cover'&&b.material==='crate-wood'))};
  super.rebuild(scenery,map.difficulty==='easy'?null:seen,level,{...map,coverOccupiedProps:map.props,props:map.props.filter(p=>!PAINTED_PROP_FORMS[p.kind])});
  this.sceneryAssets.rebuild(map,level);this.sites.rebuild(map,level);this.paintedEnvironment.rebuild(map,level);this.cliffs.rebuild(map,level,{grassTexture:this.material('grass').map,environmentPaint:this.environmentPaint});
 }
 async loadModel(unit){
  this.loading.start();
  this.pending.add(unit.id);const generation=this.generation;
  const profile=ANIMAL_MOTION_CATALOG.find(p=>p.id===unit.species);
  let worker,paint,cap;
  try{
   for(const kind of new Set((this.state?.props||[]).filter(p=>['iron-searchlight-ladder-tower','wooden-spotlight-tower'].includes(p.kind)).map(p=>p.kind)))if(profile&&unit.team==='squad')prepareLadderRoute(profile,kind).catch(()=>{});
   if(!profile)throw Error('Missing character model: '+unit.species);
   if(!this.meshData.has(profile.file))this.meshData.set(profile.file,fetch(new URL(profile.file,import.meta.url)).then(r=>{if(!r.ok)throw Error('Cannot load '+profile.file);return r.json();}));
   worker=profile.create(await this.meshData.get(profile.file));
   paint=await createAnimalPaint(this.renderer,worker,profile,this.loader,unit.outfit,true);
   if(unit.outfit==='red-hats')cap=await createRedHatCap(this.renderer,worker,profile,this.loader,true);
   if(generation!==this.generation){cap?.dispose();paint.dispose();worker.dispose();return;}
   for(const part of worker.parts)part.material=paint.material;
   prepareBloodProjection(worker.parts);
   const root=new T.Group();root.add(worker.root);
   const posture=createBattlePosture(worker,profile),locomotion=createWorkerLocomotion(worker,profile);
   await this.blood.ready;
   if(generation!==this.generation){locomotion.dispose();cap?.dispose();paint.dispose();worker.dispose();return;}
   const model={worker,paint,root,profile,locomotion,posture,cap,offhand:createOffhandEquipment(worker,{createWeapon:createBattleEquipment}),batches:new CharacterBatches(worker,root)};ensureFatalHead(model,this.blood.textures[2]);
   this.models.set(unit.id,model);this.actors.set(unit.id,root);this.scene.add(root);
  }catch(error){cap?.dispose();paint?.dispose();worker?.dispose();this.loading.fail(error);this.diagnostics.push(error.message);if(this.traversal?.active?.event.unitId===unit.id)this.traversal.finish();}
  finally{this.loading.end();if(generation===this.generation)this.onReady();}
 }
 actor(unit){
  const model=this.models.get(unit.id);if(!model)return BattleRenderer.prototype.poseActor.call(this,unit);
  ensureFatalHead(model,this.blood?.textures?.[2]);
  const now=this.presentationNow??performance.now();this.weaponDrops?.beforeActor(unit,model,this.state,now);
  const result=presentFatalHead(model,unit,this.blood?.mode,()=>BattleRenderer.prototype.poseActor.call(this,unit),this.blood?.stains);
  this.weaponDrops?.afterActor(unit,model);return result;
 }
 poseActor(unit){
  const model=this.models.get(unit.id);
  if(!model){if(!this.pending.has(unit.id))this.loadModel(unit);return null;}
  this.blood?.warm(this.renderer,this.camera,model);
  if(this.blood?.capture(unit.id,model,this.world)){model.signature=null;model.placement=null;}
  if(this.traversal?.active?.event.unitId===unit.id){
   model.offhand.hide();
   if(this.grenades.session?.model===model)this.grenades.finish();
   this.fire.remove(unit.id);
   model.draw?.dispose();model.draw=null;model.drawRequested=false;
   if(!model.profile.unarmed&&model.weapon!==unit.weapon){const old=model.equipment;model.equipment=createBattleEquipment(unit.weapon);model.worker.equipWeapon(model.equipment);old?.dispose();model.weapon=unit.weapon;}
   try{if(this.traversal.pose(model,unit,this.presentationNow??performance.now()))return model.root;}catch(error){this.diagnostics.push('Traversal animation: '+error.message);this.traversal.finish();}
  }
  const {worker,root,profile}=model,shot=this.combat.active?.event.shooter===unit.id?this.combat.active:null,fallen=shot?.phase.discharged&&shot.event.falls?.some(f=>f.id===unit.id);
  const sample=this.traversal?.preparing&&this.traversal.active?.event.unitId===unit.id?{...this.motion.sample(unit),...this.traversal.display(unit),blend:0,pose:{}}:shot&&!fallen?{...this.motion.sample(unit),x:shot.event.ax,y:shot.event.ay,z:shot.event.az||0,blend:0}:this.motion.sample(unit);
  const now=this.presentationNow??performance.now();
  this.grenades.prepareActor(model,unit,shot);
  if(this.fire.pose(model,unit,shot,now,this.state,this.camera)){model.offhand.hide();return model.root;}
  if(this.grenades.pose(model,unit,shot,now)){model.offhand.sync(unit,{primary:model.equipment});return model.root;}
  if(unit.hp<=0||this.reducedMotion?.matches)model.drawRequested=false;
  if(model.draw&&(unit.hp<=0||model.weapon!==unit.weapon||this.reducedMotion?.matches)){model.draw.dispose();model.draw=null;model.drawRequested=false;}
  const signature=`${handWeapons(unit).join(',')}:${model.drawRequested||model.draw?now:''}:${JSON.stringify(sample.pose)}:${unit.casualty}:${unit.weapon}:${sample.heading}:${unit.hp>0}:${sample.blend}:${sample.blend?sample.distance:0}:${shot?.start}:${shot?.phase.aim}:${shot?.phase.recoil}`;
  const poseChanged=model.signature!==signature;
  if(poseChanged){
   // Authoring rigs solve carry grips in model space. Position only after posing.
   root.position.set(0,0,0);root.updateMatrixWorld(true);
   model.signature=signature;
   if(!profile.unarmed&&model.weapon!==unit.weapon){
    const old=model.equipment;model.drawRequested=!!old&&!pairedInHand(unit,model.weapon)&&model.drawSkipWeapon!==unit.weapon&&unit.weapon!=='hands'&&!this.reducedMotion?.matches;model.equipment=createBattleEquipment(unit.weapon);worker.equipWeapon(model.equipment);old?.dispose();model.weapon=unit.weapon;
   }
   worker.root.position.set(0,0,0);worker.root.rotation.set(0,0,0);
   if(unit.hp>0&&!(sample.pose?.down>0)&&shot?.rifle&&!profile.unarmed){
    model.firing??=createRifleFiring(worker,profile,model.posture);
    const target=shotPoint(shot.event.trajectories[0],this.state).sub(new T.Vector3(...toWorld(sample)));
    if(shot.phase.discharged&&!shot.dischargeChecked){
     const launch=model.firing.apply({...shot.phase,recoil:0,target,sample});shot.dischargeChecked=true;shot.presentationUnsupported=!launch.supported;shot.presentationReason=launch.reason;
     shot.traceOrigin=launch.supported?launch.origin.clone().add(new T.Vector3(...toWorld(sample))):null;
    }
    const result=model.firing.apply({...shot.phase,target,sample});
    if(!result.supported){shot.traceOrigin=null;if(shot.phase.discharged){shot.presentationUnsupported=true;shot.presentationReason=result.reason;}}
    this.firingDiagnostic(model,shot.presentationUnsupported?{supported:false,reason:shot.presentationReason}:result,unit);
   }
   else if(unit.hp>0&&!(sample.pose?.down>0)&&sample.pose?.prone>0&&!profile.unarmed&&['rifle','assault','smg','shotgun','sniper','hmg','rpg'].includes(unit.weapon)){
    model.firing??=createRifleFiring(worker,profile,model.posture);const h=sample.heading*Math.PI/180;const result=model.firing.apply({aim:0,target:new T.Vector3(12*Math.cos(h),.48,12*Math.sin(h)),sample});this.firingDiagnostic(model,result,unit);
   }
   else {this.firingDiagnostic(model,null,unit);model.locomotion.apply({...sample,blend:sample.pose?.prone||sample.pose?.down?0:sample.blend});model.posture.apply(sample);if(Object.values(sample.pose||{}).some(v=>v>0))model.posture.ground();}
   if(model.drawRequested&&!model.draw&&unit.hp>0&&!(sample.pose?.down>0)&&!shot&&!profile.unarmed){model.draw=createEquipmentDraw(worker,profile);model.drawStart=now;model.drawRequested=false;}
   if(model.draw){const progress=(now-model.drawStart)/DRAW_DURATION_MS;if(progress>=1){model.draw.dispose();model.draw=null;model.signature=null;}else model.draw.apply(progress);}
   model.paint.setGripForearm?.(!!model.equipment?.root.visible&&!!model.equipment?.carry?.handPoses?.support?.gripMesh);

  }
  root.position.fromArray(toWorld(sample));
  const placement=`${signature}:${sample.x}:${sample.y}:${sample.z||0}`;
  if(model.placement!==placement){
   model.placement=placement;root.updateMatrixWorld(true);worker.skeleton.update();
   for(const part of worker.parts){part.computeBoundingBox?.();part.computeBoundingSphere?.();}
  }
  model.offhand.sync(unit,{primary:model.equipment,aim:shot?.event.dual?shotPoint(shot.event.trajectories[0],this.state):null,hidden:unit.hp<=0||!!model.draw,prone:poseChanged?sample.pose?.prone||0:0});
  if(shot){
   const gun=shot.event.dual&&shot.event.weapon!==unit.weapon?model.offhand.gun:model.equipment,anchor=gun?.anchors?.muzzle;
   const muzzle=shot.rifle?(!shot.presentationUnsupported&&model.firing?model.firing.muzzle():null):anchor&&gun.root.visible?{origin:anchor.getWorldPosition(new T.Vector3()),direction:new T.Vector3(1,0,0).transformDirection((gun.barrel||gun.root).matrixWorld)}:null;
   if(shot.event.flame)this.flameEffects.update(shot,this.state,muzzle);else if(!shot.event.grenade)shot.frameMuzzle=muzzle;
  }
  this.grenades.afterActor(model,unit,shot);
  return root;
 }
 firingDiagnostic(model,result,unit){
  if(model.aimWarning){const i=this.diagnostics.indexOf(model.aimWarning);if(i>=0)this.diagnostics.splice(i,1);model.aimWarning=null;}
  if(result&&!result.supported){model.aimWarning=`${unit.name||unit.species}: firing animation unavailable (${result.reason}); shot outcome unchanged.`;this.diagnostics.push(model.aimWarning);}
 }
 prune(){const shot=this.combat.active;if(shot&&!shot.event.flame&&!shot.event.grenade)this.shotEffects.update(shot,this.state,shot.frameMuzzle);this.weaponDrops?.update(this.state,this.presentationNow??performance.now());this.blood?.update(this.presentationNow??performance.now(),this.camera);this.impactDebug.update(shot,this.state,this.blood,this.audio);this.sceneryAssets.update((this.presentationNow??performance.now())/1000,this.camera,{reducedMotion:!!this.reducedMotion?.matches});this.grenades.update(shot,this.state,this.camera);this.tankEffects.draw(this.camera);for(const model of this.models.values())if(model.root.visible)model.batches.sync();} // Runs after posing, before rendering, even when the shooter has no visible model.
 pick(x,y,width,height,level=this.presentationLevel??this.level,{selectBody=false}={}){
  const ray=new T.Raycaster();ray.layers.enable(CHARACTER_PICK_LAYER);ray.setFromCamera(new T.Vector2(x/width*2-1,1-y/height*2),this.camera);
  const barrel=[this.paintedEnvironment.barrelHit(ray,level),this.sites.hit(ray,level)].filter(Boolean).sort((a,b)=>a.distance-b.distance)[0],onLevel=id=>(this.state.units.find(u=>u.id===id)?.z||0)===level;
  const roots=[...this.actors.entries()].filter(([id,root])=>root.visible&&onLevel(id));
  for(const hit of ray.intersectObjects(roots.map(([,root])=>root),true)){
   if(barrel&&hit.distance>=barrel.distance)break;
   let object=hit.object,visible=true;
   while(object){if(!object.visible)visible=false;const entry=roots.find(([,root])=>root===object);if(entry&&visible){const id=entry[0],unit=this.state.units.find(u=>u.id===id);if(!selectBody||unit?.team!=='squad'||this.models.get(id)?.worker.parts.includes(hit.object))return id;}object=object.parent;}
  }
  return barrel?null:this.fire.pick(ray,onLevel);
 }
 pickDoor(x,y,width,height,level){const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(x/width*2-1,1-y/height*2),this.camera);return pickWallDoor(ray,this.chunks||new Map(),level);}
 pickScenery(x,y,width,height,level){
  const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(x/width*2-1,1-y/height*2),this.camera);
  const barrel=this.paintedEnvironment.barrelHit(ray,level),site=this.sites.hit(ray,level);
  if(site&&(!barrel||site.distance<barrel.distance))return site.prop.kind.endsWith('-destroyed')?null:strategicTarget(site.prop);
  return barrel&&presentBarrel(this.state,barrelTarget(barrel.prop))?barrelTarget(barrel.prop):null;
 }
 pickLoot(x,y,width,height,level=this.presentationLevel??this.level){const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(x/width*2-1,1-y/height*2),this.camera);return this.loot.pick(ray,level);}
 draw(ctx,state,...args){
  this.loot.sync(state,null);
  this.state=state;this.presentationLevel=args[3];this.captureCombat(state);this.shotEffects.hide();this.flameEffects.hide();
  this.blood?.begin(this.combat.active,state,this.presentationNow??performance.now(),{reducedMotion:!!this.reducedMotion?.matches,busy:this.combat.busy});
  if(this.combat.active)this.combat.active.frameMuzzle=null;
  const units=state.units.filter(u=>personVisible(state,u)||this.combat.falling.has(u.id)).map(u=>this.traversal.active?.event.unitId===u.id?{...u,presentationLevel:args[3]}:this.fire.display(this.combat.display(u)));
  this.motion.update(units,(this.presentationNow??performance.now()),!!this.reducedMotion?.matches);
  // Visibility was resolved from committed units before animation changed HP
  // or position. Do not hide a visible casualty during its pre-impact pose.
  const scenery=this.grenades.scenery(state,this.combat);
  return super.draw(ctx,{...scenery,terrain:scenery.map,concealedInteriors:this.interiorFog?.hidden,units,props:[...scenery.props,...this.tankEffects.pendingProps()]},...args.slice(0,4),{...args[4],visibilityFiltered:true,showAllLevels:true});
 }
 captureCombat(state,{paused}={}){
  // A command can close its planner between frames. Resume before consuming
  // an immediate discharge; genuine pauses and muted/missed cues stay dropped.
  if(paused!==undefined)this.audio?.setPaused(paused);
  const now=this.presentationNow??performance.now(),reduced=!!this.reducedMotion?.matches;
  this.combat.observe(state,now,reduced);this.traversal.observe(state,now,reduced);
  this.audio?.setCamera(this.camera);this.audio?.observe(state,this.combat,now);
  this.tankEffects.observe(state,this.combat,now,reduced,null);
  this.fire.observe(state,this.combat,now,reduced);
  for(const u of state.units){const m=this.models.get(u.id);if(!m)continue;
   const visible=personVisible(state,u),available=u.hp>0&&visible&&!reduced;
   if(m.draw&&(!available||now-m.drawStart>=DRAW_DURATION_MS)){m.draw.dispose();m.draw=null;m.drawRequested=false;m.signature=null;}
   if(!available){m.drawRequested=false;if(m.weapon!==u.weapon)m.drawSkipWeapon=u.weapon;}
   if(m.weapon&&m.weapon!==u.weapon&&available&&!m.profile.unarmed&&u.weapon!=='hands'&&this.traversal.active?.event.unitId!==u.id)m.drawRequested=true;
  }
 }
 settleEquipmentDraws(state){
  // Inventory may pause an in-flight draw. Finish only that cosmetic pose;
  // combat, traversals, fire, simulation time and orders must not be skipped.
  if(this.combat.busy||this.traversal.busy||this.fire.busy||this.tankEffects.busy)return false;
  for(const u of state.units){const m=this.models.get(u.id);if(!m||!(m.draw||m.drawRequested))continue;
   m.draw?.dispose();m.draw=null;m.drawRequested=false;m.signature=null;
   const previous=m.drawSkipWeapon;m.drawSkipWeapon=u.weapon;
   try{this.actor(u);}finally{m.drawSkipWeapon=previous;}
  }
  return true;
 }
 get busy(){return this.combat.busy||this.traversal.busy||this.fire.busy||this.tankEffects.busy||[...this.models.values()].some(m=>m.draw||m.drawRequested);}
 equipmentState(id){return this.fire.sessions.get(id)?.stow?.state==='stowed'?'stowed':this.traversal.active?.event.unitId===id?(this.traversal.active.motion?.climb.equipmentState||'carried'):this.models.get(id)?.draw||this.models.get(id)?.drawRequested?'drawing':'carried';}
 displayUnit(unit){if(this.traversal?.active?.event.unitId===unit.id)return this.traversal.display(unit);if(this.fire.entries.has(unit.id))return this.fire.display(unit);const shot=this.combat.active;if(shot?.event.shooter===unit.id&&!(shot.phase.discharged&&shot.event.falls?.some(f=>f.id===unit.id)))return {...unit,x:shot.event.ax,y:shot.event.ay,z:shot.event.az||0};return this.motion.sample(this.combat.display(unit));}
 dispose(){
  this.generation++;this.wallXray.dispose();
  this.audio?.dispose();
  this.sceneryAssets.dispose();this.sites.dispose();this.loot.dispose();this.cliffs.dispose();this.interiorFog.dispose();this.lights.dispose();this.daylight.dispose();
  this.motion.clear();
  this.grenades.dispose();this.traversal.clear();this.combat.clear();this.weaponDrops?.dispose();this.shotEffects.dispose();this.impactDebug.dispose();this.flameEffects.dispose();this.fire.dispose();this.tankEffects.dispose();
  this.paintedEnvironment.dispose();
  for(const {worker,paint,root,equipment,locomotion,cap,draw,batches,offhand,fatalMask}of this.models.values()){batches.dispose();fatalMask?.dispose();this.scene.remove(root);root.position.set(0,0,0);root.updateMatrixWorld(true);draw?.dispose();offhand?.dispose();locomotion.dispose();cap?.dispose();equipment?.dispose();paint.dispose();worker.dispose();}
  this.blood?.dispose();
  this.models.clear();this.actors.clear();this.meshData.clear();this.pending.clear();super.dispose();
 }
}
