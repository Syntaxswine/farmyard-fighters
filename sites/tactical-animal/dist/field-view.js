import {crawlTravel,movementPresentation} from './locomotion-sample.js';
import {drawPlayerMapMarker} from './map-player-marker.js';
import {boundedElapsed} from './frame-timing.js';
import {getTourWorld} from './mount-dora-activity.js';
import * as T from './aft/tactics/vendor/three.module.js';
import {ANIMAL_MOTION_CATALOG} from './aft/tactics/animal-motion-catalog.js';
import {createAnimalPaint} from './aft/tactics/animal-motion-paint.js';
import {createWeaponModel} from './aft/tactics/weapon-models.js';
import {createWorkerLocomotion} from './aft/tactics/worker-locomotion.js';
import {createBattlePosture} from './aft/tactics/battle-posture.js';
import {createCrawlPose} from './crawl-pose.js';
import {createGrenadeModel} from './aft/tactics/grenade-model.js';
import {DaylightRig} from './aft/tactics/daylight-rig.js';
import {OriginalEnvironment} from './original-art.js';
import {hero, Core, missionForState, objectiveSecured,realtimeWeaponAim} from './solo-game.js';
import {fieldCameraFor,grenadeCameraFrame} from './grenade-controls.js';
import {InteractionScenery} from './interaction-view.js';
import {clueAnchorHeight,missionHasArt,SCENERY_DIGEST} from './mission-scenery.js';
import {SoloFlameEffects} from './flame-effects.js';
import {FIRE_TIME,fireState} from './aft/tactics/painted-fire-state.js';
import {SoloBurnEffects} from './burn-effects.js';
import {BodyImpactEffects} from './body-impact-effects.js';
import {SoloTankEffects} from './tank-effects.js';
import {createFlameOperator} from './flame-pose.js';
import {FlameConePreview} from './flame-aim-view.js';
import {GuardSightView} from './guard-sight-view.js';
import {blockWindow,gridDimensions,pointInWorldRect,worldBounds,WORLD_BLOCK_SIZE} from './world-grid.js';
import {clampCameraPoint,contactCameraFrame,residentCameraSpan,residentWindowForCamera,MAX_CAMERA_SPAN} from './render-residency.js';
import {SearchHalo,searchHaloCandidates,searchHaloTarget} from './search-halo.js';
import {WindowScenery,WindowEffects} from './window-view.js';
import {ballistic,createWeaponAudio,GRENADE_IMPACT_MS,muzzleFlash,playWeaponSound,setTracer,surfaceImpactFlash,traceEnd,traceStart,tracerMesh} from './weapon-feedback.js';
import {shotVisible} from './aft/tactics/shot-coordinates.js';
import {actionDuration,createWeaponPose,weaponAction} from './weapon-pose.js';
import {createGrenadePose,grenadeAction} from './grenade-pose.js';
import {ExplosionShake} from './explosion-shake.js';
import {barrelId} from './aft/tactics/explosive-barrels.js';

const V = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
// Hits pulse at the burst cadence. Misses linger so diverging paths can be read together.
const BURST_SHOT_INTERVAL=140,BURST_TRACER_DURATION=90,MISS_TRACER_DURATION=340,FLASH_DURATION=72;
const MUZZLE_SOURCE_TOLERANCE=.04;
const MAX_PARKED_ACTORS=8;
// Two standard Zoom Out steps from the previous 13 m view.
const DEFAULT_CAMERA_SPAN=13*1.2**2;
function disposeEffectMesh(mesh){
  if(!mesh)return;
  mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();
}
function disposeWeaponEffect(effect){
  for(const mesh of [effect.line,effect.flash,effect.exhaust,effect.impact])disposeEffectMesh(mesh);
  effect.projectile?.root.removeFromParent();
  effect.projectile?.dispose();
}
export class FieldView {
  constructor(container, {onPick, onLoading, onError, getAimViewport, aimAtWall}) {
    this.container=container;this.onPick=onPick;this.onLoading=onLoading;this.onError=onError;this.getAimViewport=getAimViewport;this.aimAtWall=aimAtWall;
    this.renderer=new T.WebGLRenderer({antialias:true,alpha:false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.setClearColor(0x17241e);
    container.append(this.renderer.domElement);
    this.scene=new T.Scene();this.scene.fog=new T.Fog(0x17241e,38,75);
    this.daylight=new DaylightRig(this.scene,this.renderer);this.daylight.sun.shadow.mapSize.set(1024,1024);
    this.camera=new T.OrthographicCamera();this.target=V(5,0,24);this.span=this.requestedSpan=DEFAULT_CAMERA_SPAN;this.follow=true;
    this.ray=new T.Raycaster();this.plane=new T.Plane(V(0,1,0),0);
    this.environment=new T.Group();this.scene.add(this.environment);
    this.actors=new Map();this.parkedActors=new Map();this.data=new Map();this.pending=new Map();this.failed=new Set();this.generation=0;this.samples=new Map();this.effects=[];this.explosionShake=new ExplosionShake();
    this.loader=new T.TextureLoader();this.loader.setPath(new URL('./aft/tactics/',import.meta.url).href);this.pointers=new Map();this.disposables=[];
    this.marker=new T.Mesh(new T.RingGeometry(.32,.4,32),new T.MeshBasicMaterial({color:0xf2c56a,side:T.DoubleSide}));this.marker.rotation.x=-Math.PI/2;this.marker.position.y=.025;this.marker.visible=false;this.scene.add(this.marker);
    const blast=Core.WEAPONS.grenade.blast;this.blastMarker=new T.Mesh(new T.RingGeometry(blast-.04,blast,64),new T.MeshBasicMaterial({color:0xf4a568,side:T.DoubleSide,transparent:true,opacity:.85,depthWrite:false}));this.blastMarker.rotation.x=-Math.PI/2;this.blastMarker.visible=false;this.scene.add(this.blastMarker);
    this.blastArea=new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial({color:0xf4a568,side:T.DoubleSide,transparent:true,opacity:.17,depthWrite:false}));this.blastArea.visible=false;this.scene.add(this.blastArea);
    this.pathLine=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:0xe6b464,transparent:true,opacity:.85}));this.scene.add(this.pathLine);
    this.pointerDown=e=>this.down(e);this.pointerMove=e=>this.drag(e);this.pointerUp=e=>this.up(e);
    container.addEventListener('pointerdown',this.pointerDown);container.addEventListener('pointermove',this.pointerMove);container.addEventListener('pointerup',this.pointerUp);container.addEventListener('pointercancel',this.pointerUp);
    this.wheel=e=>{e.preventDefault();this.zoom(Math.exp(e.deltaY*.001));};container.addEventListener('wheel',this.wheel,{passive:false});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.updateCamera();}
  updateCamera(){
    const w=this.container?.clientWidth,h=this.container?.clientHeight;
    const requested=this.grenadeCamera||this.returnSpan!=null?this.span:this.contactSpan??this.requestedSpan??this.span,viewport={width:w,height:h};
    if(this.state){const point=clampCameraPoint(this.state,{x:this.target.x,y:this.target.z});this.target.set(point.x,0,point.y);this.residentWindow=residentWindowForCamera(this.state,point,viewport,requested);}
    if(w&&h){
      this.span=this.state?residentCameraSpan(this.state,{x:this.target.x,y:this.target.z},viewport,requested,this.residentWindow):requested;
      this.camera.left=-this.span*w/h/2;this.camera.right=this.span*w/h/2;this.camera.top=this.span/2;this.camera.bottom=-this.span/2;this.camera.near=.1;this.camera.far=120;this.camera.updateProjectionMatrix();
    }
    const {x,y,z}=fieldCameraFor(this.state);
    this.camera.position.copy(this.target).add(V(x,y,z));this.camera.lookAt(this.target);this.camera.updateMatrixWorld();
  }
  projectWorldPoint(point){const r=this.container.getBoundingClientRect(),p=V(point.x,point.h||0,point.y).project(this.camera);return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2,visible:p.x>=-1&&p.x<=1&&p.y>=-1&&p.y<=1&&p.z>=-1&&p.z<=1};}
  zoomLimit(){return this.state?residentCameraSpan(this.state,{x:this.target.x,y:this.target.z},{width:this.container.clientWidth,height:this.container.clientHeight},MAX_CAMERA_SPAN):MAX_CAMERA_SPAN;}
  canZoom(factor){const span=this.grenadeCamera?.baseSpan??this.requestedSpan??this.span,max=this.grenadeCamera?MAX_CAMERA_SPAN:this.zoomLimit();return factor>1?span<max-.01:span>6.01;}
  zoom(factor){if(this.grenadeCamera){this.grenadeCamera.baseSpan=T.MathUtils.clamp(this.grenadeCamera.baseSpan*factor,6,MAX_CAMERA_SPAN);return;}this.returnSpan=null;this.requestedSpan=T.MathUtils.clamp((this.requestedSpan??this.span)*factor,6,this.zoomLimit());this.resize();}

  center(){if(this.grenadeCamera)this.endGrenadeAim();this.focusedId=null;this.follow=true;if(this.state&&this.contactSpan==null){const u=hero(this.state);this.target.set(u.x,0,u.y);this.updateCamera();}}
  focusOpponent(id){const u=this.state?.units.find(v=>v.id===id&&v.team==='guard'&&Core.alive(v)&&this.state.detected.has(v.id));if(!u)return false;if(this.grenadeCamera)this.endGrenadeAim();this.focusedId=id;this.follow=false;this.contactSpan=null;this.target.set(u.x,0,u.y);this.updateCamera();return true;}
  ground(clientX,clientY){const r=this.container.getBoundingClientRect();this.ray.setFromCamera(new T.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),this.camera);return this.ray.ray.intersectPlane(this.plane,V());}
  interactionAnchor(object){const height=clueAnchorHeight(missionForState(this.state),object,object.kind==='door'?2.15:object.kind==='chest'?1.15:.7),point=V(object.x,height,object.y).project(this.camera);return {x:(point.x+1)*this.container.clientWidth/2,y:(1-point.y)*this.container.clientHeight/2,visible:Math.abs(point.x)<.95&&Math.abs(point.y)<.95&&Math.abs(point.z)<1};}
  down(e){if(e.button!==0||this.grenadeCamera)return;this.unlockSound();this.container.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.pointers.size===1)this.gesture={x:e.clientX,y:e.clientY,target:this.target.clone(),moved:false,at:performance.now()};if(this.pointers.size===2){const [a,b]=[...this.pointers.values()];this.pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),span:this.span};this.gesture.moved=true;}}
  drag(e){const point=this.pointers.get(e.pointerId);if(!point)return;point.x=e.clientX;point.y=e.clientY;
    if(this.pointers.size===2&&this.pinch){const [a,b]=[...this.pointers.values()];this.returnSpan=null;this.requestedSpan=T.MathUtils.clamp(this.pinch.span*this.pinch.distance/Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),6,this.zoomLimit());this.resize();return;}
    if(!this.gesture)return;const dx=e.clientX-this.gesture.x,dy=e.clientY-this.gesture.y;if(Math.hypot(dx,dy)<8&&!this.gesture.moved)return;this.gesture.moved=true;this.follow=false;this.focusedId=null;
    if(this.contactSpan!=null){this.requestedSpan=this.span;this.contactSpan=null;}
    // Map screen displacement to the ground plane using the current camera basis.
    const right=V().setFromMatrixColumn(this.camera.matrixWorld,0),up=V().setFromMatrixColumn(this.camera.matrixWorld,1);up.y=0;up.normalize();
    this.target.copy(this.gesture.target).addScaledVector(right,-dx*this.span/this.container.clientHeight).addScaledVector(up,dy*this.span/this.container.clientHeight*1.65);this.updateCamera();
  }
  up(e){if(!this.pointers.has(e.pointerId))return;this.pointers.delete(e.pointerId);if(this.pointers.size){this.gesture.moved=true;return;}
    const g=this.gesture;this.gesture=null;this.pinch=null;if(!g||g.moved||e.type==='pointercancel')return;
    const point=this.ground(e.clientX,e.clientY);if(!point)return;
    const picks=[...this.actors.values()].filter(a=>a.root.visible&&a.pick.visible).map(a=>a.pick).concat(this.interactionArt?.picks||[],this.windowArt?.picks||[]);
    const hits=this.ray.intersectObjects(picks,false),hit=hits[0]?.object.userData.windowPaneId?hits.find(h=>h.object.userData.unitId!==undefined)||hits[0]:hits[0];
    const barrel=this.art?.pickBarrel?.(this.ray);
    const wall=barrel||this.state?.realtime&&this.aimAtWall?.()?this.art?.pickWall?.(this.ray):null;
    if(barrel&&(!hit||barrel.distance<hit.distance)&&(!wall||barrel.distance<wall.distance)){
      this.onPick({x:barrel.prop.x,y:barrel.prop.y,h:.4,ground:true,barrelId:barrelId(barrel.prop),targetName:'Explosive barrel'});return;
    }
    if(wall&&(!hit||wall.distance<hit.distance)){
      const p=wall.point.addScaledVector(this.ray.ray.direction,.004);
      this.onPick({x:p.x,y:p.z,h:Math.max(0,p.y),ground:true,wallEdge:wall.object.userData.wallEdges[wall.instanceId],targetName:'Wall'});return;
    }
    this.onPick(hit?hit.object.userData.windowId?{windowId:hit.object.userData.windowId,paneId:hit.object.userData.windowPaneId,ground:true,x:hit.point.x,y:hit.point.z,h:hit.point.y}:hit.object.userData.interactionId?{interactionId:hit.object.userData.interactionId}:{unitId:hit.object.userData.unitId}:{x:point.x,y:point.z});
  }
  unlockSound(){
    this.windowEffects?.unlock();
    if(this.windowEffects?.muted||!(globalThis.AudioContext||globalThis.webkitAudioContext))return;
    this.weaponAudio??=createWeaponAudio();
    if(this.weaponAudio.context?.state!=='running')void this.weaponAudio.unlock();
  }
  pauseWeaponSound(paused){
    if(paused&&!this.weaponAudio?.paused)this.weaponAudio?.stopAll();
    this.weaponAudio?.setPaused(paused);
  }
  clearEffects(){
    this.explosionShake?.clear();this.lastShake=null;this.shakePeak=0;this.pendingExplosions=[];
    this.windowEffects?.dispose();this.windowEffects=null;
    this.weaponAudio?.dispose();this.weaponAudio=null;this.lastDischarge=null;this.playerWeaponPose=null;
    this.shotVisuals?.clear();this.discharges?.clear();
    this.tankEffects?.dispose();this.tankEffects=null;this.burnEffects?.dispose();this.burnEffects=null;
    this.bodyImpacts?.dispose();this.bodyImpacts=null;
    for(const effect of this.effects)disposeWeaponEffect(effect);
    this.effects=[];this.flameEffects?.dispose();this.flameEffects=null;this.flameCone?.dispose();this.flameCone=null;this.flameAim=null;this.lastEffect=null;
  }
  clearGestures(){for(const id of this.pointers.keys())if(this.container.hasPointerCapture(id))this.container.releasePointerCapture(id);this.pointers.clear();this.gesture=null;this.pinch=null;this.grenadeCamera=null;this.flameAim=null;this.flameCone?.hide();this.returnSpan=null;this.contactSpan=null;this.focusedId=null;}
  setGame(s){
    this.generation++;this.clearGestures();this.clearEffects();this.span=this.requestedSpan=DEFAULT_CAMERA_SPAN;
    this.state=s;this.residentWindow=null;this.lastWindowKey=null;this.prepareGraphics=false;this.samples.clear();this.failed.clear();
    for(const a of [...this.actors.values(),...(this.parkedActors?.values()||[])])this.disposeActor(a);
    this.actors.clear();this.parkedActors?.clear();this.pending.clear();this.clearEnvironment();
    this.buildEnvironment(s);this.center();this.resize();this.lastRevision=-1;this.lastLightAt=undefined;
    this.lastFrameAt=undefined;this.lastEffect=s.effect||null;this.route([]);
    if(s.realtime&&this.searchHalo&&s.units.length<=MAX_PARKED_ACTORS+1){
      const {width,height}=gridDimensions(s),residentSize=3*WORLD_BLOCK_SIZE;
      // Prepare the whole roster when the field fits in one resident window.
      // Undetected actors stay detached until the normal visibility pass.
      if(width<=residentSize&&height<=residentSize){
        this.prepareGraphics=true;
        for(const unit of s.units)void this.actor(unit,{preload:unit.team==='guard'});
      }
    }
  }
  loadingAssets(){
    return this.artBusy||this.propBusy||this.missionArtBusy||this.missionPaperBusy||this.pending.size>0||this.failed.size>0;
  }
  reportLoading(){this.onLoading(this.prepareGraphics||this.loadingAssets());}
  warmFieldGraphics(now){
    const {renderer,scene,camera,searchHalo}=this;
    const target=renderer.getRenderTarget(),scissor=renderer.getScissor(new T.Vector4());
    const scissorTest=renderer.getScissorTest(),shadows=renderer.shadowMap.autoUpdate;
    const parked=[...this.parkedActors.values()],objects=[];
    const outline=new T.LineLoop(new T.BufferGeometry().setFromPoints([V(),V(1),V(0,0,1)]),this.guardSight.material);
    try{
      for(const {root} of parked){root.visible=true;scene.add(root);}
      scene.add(outline);
      this.daylight.update(480,camera,now,true);
      scene.traverse(object=>{
        const draws=object.isMesh||object.isSprite||object.isLine;
        if(!draws&&(object.visible||object.isLight))return;
        objects.push({object,visible:object.visible,culled:object.frustumCulled,count:object.count});
        object.visible=true;object.frustumCulled=false;
        if(object.isInstancedMesh&&!object.count)object.count=1;
      });
      // A real draw also initializes GPU resources that shader compilation alone misses.
      // Only a pixel is drawn, and the normal frame below replaces it before presentation.
      searchHalo.resize(renderer);
      for(const output of [null,searchHalo.field]){
        renderer.setRenderTarget(output);renderer.setScissor(0,0,1,1);renderer.setScissorTest(true);
        renderer.render(scene,camera);
        renderer.shadowMap.autoUpdate=false;
      }
    }finally{
      for(const {object,visible,culled,count} of objects){
        object.visible=visible;object.frustumCulled=culled;
        if(object.isInstancedMesh)object.count=count;
      }
      outline.removeFromParent();outline.geometry.dispose();
      for(const {root} of parked){root.visible=false;root.removeFromParent();}
      renderer.shadowMap.autoUpdate=shadows;
      renderer.setRenderTarget(target);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
    }
  }
  // Mission art owns its geometry; detach it before the generic traversal below.
  clearEnvironment(){this.guardSight?.dispose();this.guardSight=null;this.windowArt?.dispose();this.windowArt=null;this.windowEffects?.dispose();this.windowEffects=null;this.searchHalo?.dispose();this.searchHalo=null;this.missionArt?.dispose();this.missionArt=null;this.missionArtBusy=this.missionPaperBusy=false;this.interactionArt?.dispose();this.interactionArt=null;this.art?.dispose();this.art=null;this.environment.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.environment.clear();for(const t of this.disposables)t.dispose();this.disposables=[];}
  buildEnvironment(s){
    if(s.realtime){this.guardSight=new GuardSightView(this.environment);this.bodyImpacts=new BodyImpactEffects(this.scene);}
    this.windowArt=new WindowScenery(s);this.environment.add(this.windowArt.root);this.windowEffects=new WindowEffects(this.scene,s);
    const tour=getTourWorld(s);if(tour){
      const generation=this.generation;this.artBusy=true;this.propBusy=this.missionArtBusy=this.missionPaperBusy=false;this.searchHalo=null;this.objectivePin=this.extractionPin=null;
      this.art=tour.createEnvironment(this.renderer,s,{onLoading:busy=>{if(generation===this.generation){this.artBusy=busy;this.reportLoading();}},onError:message=>{if(generation===this.generation){this.failed.add('town-art');this.onError(message);}}});this.environment.add(this.art.root);this.buildInteractionScenery(s,generation);this.missionArtReady=Promise.resolve(null);return;
    }
    const generation=this.generation,mission=missionForState(s);this.artBusy=true;this.missionArtBusy=this.missionPaperBusy=false;this.searchHalo=new SearchHalo();
    this.art=new OriginalEnvironment(this.renderer,s,{
      onLoading:busy=>{if(generation===this.generation){this.artBusy=busy;this.reportLoading();}},
      onError:message=>{if(generation===this.generation){this.failed.add('environment');this.onError(message);}},
    });this.environment.add(this.art.root);
    this.missionArtReady=missionHasArt(mission)?this.loadMissionArt(s,generation):Promise.resolve(null);
    this.buildInteractionScenery(s,generation);
    this.objectivePin=this.makePin(mission.objective,0xe16b3d);this.extractionPin=this.makePin(mission.extraction,0xc4d29a);
    // Rail lines and loading-yard markings are scenery; the engine owns all collision.
    if(!s.groundPalette)for(let x=3;x<37;x+=3){const mark=new T.Mesh(new T.PlaneGeometry(1.2,.06),new T.MeshBasicMaterial({color:0xb0a475,transparent:true,opacity:.16}));mark.rotation.x=-Math.PI/2;mark.position.set(x,.003,26.8);this.environment.add(mark);}
  }
  buildInteractionScenery(s,generation){
    this.propBusy=true;this.interactionArt=new InteractionScenery(s,{
      onLoading:busy=>{if(generation===this.generation){this.propBusy=busy;this.reportLoading();}},
      onError:message=>{if(generation===this.generation){this.failed.add('interaction-art');this.onError(message);}},
    });this.environment.add(this.interactionArt.root);
  }
  // The art kit and its inherited model modules load only for a mission with art.
  // Inherited cargo keeps drawing a replaced crate until the kit's model is in the
  // scene, so a slow, failed or refused kit never leaves an invisible collider.
  loadMissionArt(s,generation){
    this.missionArtBusy=true;this.reportLoading();
    const fail=message=>{if(generation===this.generation){this.failed.add('mission-art');this.onError(message);}};
    const load=this.importMissionArt??(()=>import('./mission-art-view.js'));
    return load().then(({createMissionArt})=>{
      if(generation!==this.generation)return null;
      const art=createMissionArt(s,{expectDigest:SCENERY_DIGEST,onError:fail,onLoading:busy=>{if(generation===this.generation){this.missionPaperBusy=busy;this.reportLoading();}}});
      if(!art)return null;
      this.missionArt=art;this.environment.add(art.root);
      art.update(this.state,this.residentWindow||blockWindow(this.state,hero(this.state)));
      this.art.replace(art.replacedCells);
      return art;
    }).catch(error=>{fail('Mission art could not load: '+error.message);return null;})
      .finally(()=>{if(generation===this.generation){this.missionArtBusy=false;this.reportLoading();}});
  }
  makePin(point,color){const group=new T.Group();group.position.set(point.x,0,point.y);const mat=new T.MeshBasicMaterial({color,transparent:true,opacity:.8,side:T.DoubleSide});const ring=new T.Mesh(new T.RingGeometry(.36,.45,32),mat);ring.rotation.x=-Math.PI/2;ring.position.y=.035;group.add(ring);const shaft=new T.Mesh(new T.CylinderGeometry(.017,.017,1.6,6),mat.clone());shaft.position.y=.8;group.add(shaft);const flag=new T.Mesh(new T.OctahedronGeometry(.14),mat.clone());flag.position.y=1.65;group.add(flag);this.environment.add(group);return group;}
  route(path=[]){this.flameCone?.hide();this.flamePreviewKey='';this.blastMarker.visible=false;this.blastArea.visible=false;this.grenadePreviewKey='';this.marker.material.color.setHex(0xf2c56a);this.pathLine.material.color.setHex(0xe6b464);this.pathLine.geometry.dispose();this.pathLine.geometry=new T.BufferGeometry().setFromPoints(path.map(p=>V(p.x,.06,p.y)));const end=path.at(-1);this.marker.visible=!!end;if(end)this.marker.position.set(end.x,.035,end.y);}
  beginGrenadeAim(){
    const baseSpan=this.grenadeCamera?.baseSpan??this.returnSpan??this.requestedSpan??this.span;
    for(const id of this.pointers.keys())if(this.container.hasPointerCapture(id))this.container.releasePointerCapture(id);
    this.pointers.clear();this.gesture=null;this.pinch=null;this.focusedId=null;this.follow=false;this.returnSpan=null;this.contactSpan=null;
    this.grenadeCamera={baseSpan,point:null,until:null,poseAt:performance.now()};this.route([]);
  }
  endGrenadeAim({linger=0}={}){
    this.route([]);
    if(!this.grenadeCamera)return;
    if(linger){this.grenadeCamera.until=performance.now()+linger;return;}
    this.returnSpan=this.requestedSpan=this.grenadeCamera.baseSpan;this.grenadeCamera=null;this.focusedId=null;this.follow=true;
  }
  beginFlameAim(){this.beginGrenadeAim();this.grenadeCamera.kind='flame';this.flameCone ||= new FlameConePreview(this.scene);}
  previewFlame(heading,preview){
    this.flameAim={heading};if(this.grenadeCamera)this.grenadeCamera.shape=preview.shape;
    const signature=[heading,this.state.revision,preview.ok].join(':');if(signature===this.flamePreviewKey)return;
    this.flamePreviewKey=signature;this.flameCone.update(preview,this.state.visible);
  }
  endFlameAim(options){this.flameAim=null;this.endGrenadeAim(options);}
  previewGrenade(point,preview){
    if(this.grenadeCamera)this.grenadeCamera.point={...point};
    const signature=[point.x,point.y,this.state.revision,preview.ok,preview.selfDanger].join(':');
    if(signature===this.grenadePreviewKey)return;this.grenadePreviewKey=signature;
    const color=!preview.ok||preview.selfDanger?0xf08068:0xf4c77a;
    this.pathLine.material.color.setHex(color);this.pathLine.geometry.dispose();
    this.pathLine.geometry=new T.BufferGeometry().setFromPoints(Core.grenadeTrajectory(hero(this.state),point).map(p=>V(p.x,p.z,p.y)));
    this.marker.visible=true;this.marker.position.set(point.x,.035,point.y);this.marker.material.color.setHex(color);
    this.blastMarker.position.set(point.x,.05,point.y);this.blastMarker.material.color.setHex(color);this.blastMarker.visible=true;
    const edge=Core.grenadeBlastFootprint(this.state,point),vertices=[];
    for(let i=1;i<edge.length;i++)vertices.push(point.x,.045,point.y,edge[i-1].x,.045,edge[i-1].y,edge[i].x,.045,edge[i].y);
    this.blastArea.geometry.dispose();this.blastArea.geometry=new T.BufferGeometry();this.blastArea.geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));this.blastArea.material.color.setHex(color);this.blastArea.visible=vertices.length>0;
  }
  trackGrenadeCamera(now,elapsed=1/60){
    const aim=this.grenadeCamera;if(!aim)return;
    if(aim.until&&now>=aim.until&&!(aim.kind==='flame'&&this.flameEffects?.queue.length)){this.endGrenadeAim();return;}
    const u=hero(this.state),points=aim.kind==='flame'?(aim.shape?.rays||[]).flatMap(ray=>[{x:ray.x,y:ray.y,z:0},{x:ray.x,y:ray.y,z:1.5}]):aim.point?Core.grenadeTrajectory(u,aim.point):[{x:u.x,y:u.y,z:1.8}];
    points.push({x:u.x,y:u.y,z:0},{x:u.x,y:u.y,z:1.8});
    if(aim.point)for(let i=0;i<16;i++){const a=i/16*Math.PI*2;points.push({x:aim.point.x+Math.cos(a)*Core.WEAPONS.grenade.blast,y:aim.point.y+Math.sin(a)*Core.WEAPONS.grenade.blast,z:0});}
    const frame=grenadeCameraFrame(points,{width:this.container.clientWidth,height:this.container.clientHeight,...this.getAimViewport?.()},aim.baseSpan,fieldCameraFor(this.state));
    const blend=T.MathUtils.damp(0,1,-60*Math.log(.86),elapsed);this.target.lerp(V(frame.target.x,0,frame.target.y),blend);this.span+=(frame.span-this.span)*blend;this.resize();
  }
  async actor(u,{preload=false}={}){
    if(this.actors.has(u.id)||this.parkedActors.has(u.id)||this.pending.has(u.id)||this.failed.has(u.id))return;
    const generation=this.generation,ticket={preload},profile=ANIMAL_MOTION_CATALOG.find(p=>p.id===u.species);this.pending.set(u.id,ticket);this.onLoading(true);
    let worker,paint,posture,locomotion,root,pick,ring;
    try{
      if(!profile)throw Error('Unknown animal: '+u.species);
      if(!this.data.has(profile.file))this.data.set(profile.file,fetch(new URL('./aft/tactics/'+profile.file,import.meta.url)).then(r=>{if(!r.ok)throw Error('Cannot load '+profile.file);return r.json();}));
      worker=profile.create(await this.data.get(profile.file));paint=await createAnimalPaint(this.renderer,worker,profile,this.loader,'normal',true);
      if(generation!==this.generation||this.pending.get(u.id)!==ticket){paint.dispose();worker.dispose();return;}
      for(const part of worker.parts){part.material=paint.material;part.frustumCulled=false;}
      worker.equipWeapon(createWeaponModel(u.weapon));locomotion=createWorkerLocomotion(worker,profile);posture=createBattlePosture(worker,profile);root=new T.Group();root.add(worker.root);
      ring=new T.Mesh(new T.RingGeometry(.28,.34,32),new T.MeshBasicMaterial({color:u.team==='squad'?0xd8dfb1:0xe2633c,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.018;root.add(ring);
      const shadow=new T.Mesh(new T.CircleGeometry(.3,20),new T.MeshBasicMaterial({color:0x131b12,transparent:true,opacity:.22,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.scale.x=1.3;shadow.position.y=.01;root.add(shadow);
      pick=new T.Mesh(new T.BoxGeometry(.8,1.8,.8),new T.MeshBasicMaterial({visible:false}));pick.position.y=.9;pick.userData.unitId=u.id;root.add(pick);
      const weaponPose=createWeaponPose(worker,profile);
      const throwPose=u.team==='squad'||u.weapon==='grenade'?createGrenadePose(worker,profile):null;
      const a={worker,paint,profile,locomotion,posture,root,pick,ring,shadow,weapon:u.weapon,equipment:worker.weapon,
        flameOperator:createFlameOperator(worker,profile),weaponPose,throwPose};
      if(u.team==='squad')a.crawl=createCrawlPose(worker,profile,posture,u.weapon);
      if(preload){root.visible=false;this.parkedActors.set(u.id,a);}
      else{this.actors.set(u.id,a);this.scene.add(root);}
    }catch(error){paint?.dispose();worker?.weapon?.dispose();worker?.dispose();if(generation===this.generation&&this.pending.get(u.id)===ticket){this.failed.add(u.id);console.error('Animal model failed',error);this.onError(error.message||'An animal texture could not load.');}}
    finally{if(this.pending.get(u.id)===ticket)this.pending.delete(u.id);if(generation===this.generation)this.reportLoading();}
  }
  reconcileActors(units){
    this.parkedActors ||= new Map();const desired=new Set(units.map(unit=>unit.id));
    for(const [id,ticket] of this.pending)if(!ticket.preload&&!desired.has(id))this.pending.delete(id);
    for(const [id,actor]of this.actors){
      if(desired.has(id))continue;actor.root.visible=false;actor.root.removeFromParent();this.actors.delete(id);this.parkedActors.set(id,actor);
    }
    for(const id of desired){const actor=this.parkedActors.get(id);if(!actor)continue;this.parkedActors.delete(id);this.actors.set(id,actor);this.scene.add(actor.root);const previous=this.samples?.get(id),unit=units.find(u=>u.id===id);if(previous)this.samples.set(id,{...previous,travelled:unit.travelled});}
    // A small LRU keeps recently crossed actors warm without retaining a sector
    // full of GPU rigs. All simulation units remain untouched in state.units.
    while(this.parkedActors.size>MAX_PARKED_ACTORS){const [id,actor]=this.parkedActors.entries().next().value;this.parkedActors.delete(id);this.samples.delete(id);this.disposeActor(actor);}
  }
  disposeActor(a){for(const [id,session]of this.burnEffects?.sessions||[])if(session.actor===a)this.burnEffects.remove(id);this.scene.remove(a.root);a.crawl?.dispose();a.throwPose?.dispose();a.flameOperator?.dispose();a.locomotion?.dispose();a.paint.dispose();a.equipment.dispose();a.worker.dispose();for(const o of [a.pick,a.ring,a.shadow]){o.geometry.dispose();o.material.dispose();}}
  queueEffects(effect,now){
    this.effectAt=now;const previousRounds=new Map();
    for(const event of effect.sequence||[effect]){
      const delay=event.catchupDelayMs||0;
      for(const blast of event.explosions||[])if(blast.kind==='barrel'||blast.kind==='tank')
        (this.pendingExplosions??=[]).push({event,blast,at:now+delay+(event.shots>1?event.shot*BURST_SHOT_INTERVAL:0)});
      if(event.weapon==='flamethrower'||event.incendiary){
        if(event.flame){
          this.flameEffects ||= new SoloFlameEffects(this.scene);
          this.flameEffects.enqueue(event,now+delay,{recordedMuzzle:!!this.state?.realtime});
          this.weaponSound(event,delay/1000);
        }
        continue;
      }
      const thrown=event.weapon==='grenade',burst=event.shots>1,tracer=ballistic(event.weapon);
      const realtime=!!this.state?.realtime,miss=realtime&&!!event.traceEnd;
      const at=now+delay+(burst?event.shot*BURST_SHOT_INTERVAL:0);
      let line=null,points=null,projectile=null;
      if(thrown){
        points=Core.grenadeTrajectory({x:event.ax,y:event.ay},{x:event.bx,y:event.by}).map(p=>V(p.x,p.z,p.y));
        line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0xf6d68c,transparent:true}));
        projectile=createGrenadeModel();
        for(const part of projectile.parts)if(part.name==='pull ring'||part.name==='curved safety lever')part.visible=false;
        projectile.root.visible=false;this.scene.add(projectile.root);
      }else if(tracer)line=tracerMesh(event.weapon,realtime&&event.shooter!==hero(this.state).id);
      const visual={event,line,tracer,points,projectile,at,ttl:thrown?700:miss?MISS_TRACER_DURATION:burst||event.fullAuto?BURST_TRACER_DURATION:240,started:!burst&&at<=now,
        previous:burst&&event.shot>0?previousRounds.get(event.shooter):null};
      (this.shotVisuals??=new Map()).set(event,visual);
      if(line){line.visible=at<=now;this.scene.add(line);}
      this.effects.push(visual);
      if(burst)previousRounds.set(event.shooter,visual);
      if(thrown){
        const ring=new T.Mesh(new T.RingGeometry(event.blast-.07,event.blast,64),new T.MeshBasicMaterial({color:0xf4a568,side:T.DoubleSide,transparent:true,depthWrite:false}));
        ring.rotation.x=-Math.PI/2;ring.position.set(event.bx,.07,event.by);ring.visible=false;
        this.scene.add(ring);this.effects.push({line:ring,at,ttl:700,delay:GRENADE_IMPACT_MS,follow:visual});
      }
    }
  }
  advanceExplosionCues(now){
    this.pendingExplosions=(this.pendingExplosions||[]).filter(cue=>{
      const flame=this.flameEffects?.queue.find(e=>e.event===cue.event);
      if(flame&&(!flame.muzzle||flame.last===null||flame.elapsed<FIRE_TIME.hit))return true;
      const visual=this.shotVisuals?.get(cue.event);
      if(visual?.started===false)return true;
      const at=(visual?.at??cue.at)+(cue.event.weapon==='grenade'?GRENADE_IMPACT_MS:0);
      if(!flame&&now<at)return true;
      (this.explosionShake??=new ExplosionShake()).blast(cue.blast.kind,cue.blast,hero(this.state),now);
      if(cue.blast.kind==='barrel'&&!this.windowEffects?.muted){
        this.weaponAudio?.setCamera(this.camera);
        this.weaponAudio?.play('explosion-deep',cue.blast,this.state,{priority:2,range:64});
      }
      return false;
    });
  }
  weaponSound(event,delay=0){
    if(this.windowEffects?.muted)return;
    this.weaponAudio?.setCamera(this.camera);
    playWeaponSound(this.weaponAudio,event,this.state,delay);
  }
  animateEffects(now){
    for(const [id,shot] of this.discharges||[])if(now-shot.at>=actionDuration(shot.event.weapon))this.discharges.delete(id);
    this.effects=this.effects.filter(effect=>{
      // Rebase burst pulses on the last real start from this shooter only.
      if(effect.previous){
        if(!effect.previous.started){effect.line.visible=false;return true;}
        effect.at=Math.max(effect.at,effect.previous.at+BURST_SHOT_INTERVAL);
      }
      if(effect.started===false&&now>=effect.at){effect.at=now;effect.started=true;}
      if(effect.follow){
        if(!effect.follow.started)return true;
        effect.at=effect.follow.at;
      }
      const delay=effect.delay||0,age=now-effect.at;
      if(age>=delay&&age<effect.ttl&&effect.event&&!effect.presented){
        effect.presented=true;
        if(effect.event.sourceVisible!==false)(this.discharges??=new Map()).set(effect.event.shooter,effect);
        this.weaponSound(effect.event);
      }
      const blastDelay=effect.event?.weapon==='grenade'?GRENADE_IMPACT_MS:0;
      if(effect.presented&&!effect.shaken&&['grenade','rpg','launcher'].includes(effect.event?.weapon)&&age>=blastDelay){
        effect.shaken=true;(this.explosionShake??=new ExplosionShake()).blast(effect.event.weapon,{x:effect.event.bx,y:effect.event.by},hero(this.state),now);
      }
      if(age<delay){if(effect.line)effect.line.visible=false;return true;}
      if(age<effect.ttl){
        if(effect.line){effect.line.visible=effect.hasTrace!==false;effect.line.material.opacity=1-(age-delay)/(effect.ttl-delay);}
        return true;
      }
      this.shotVisuals?.delete(effect.event);disposeWeaponEffect(effect);return false;
    });
  }
  drawGrenadeFlights(s,now){
    for(const shot of this.effects){
      if(!shot.projectile||!shot.presented)continue;
      const {event,projectile,points}=shot,age=now-shot.at;
      if(!shot.flightStarted){
        shot.flightStarted=true;
        if(shot.releaseOrigin){
          const delta=shot.releaseOrigin.clone().sub(points[0]);
          for(const [i,point] of points.entries())point.addScaledVector(delta,(1-T.MathUtils.smoothstep(i,0,8)));
          shot.line.geometry.setFromPoints(points);
          shot.line.geometry.computeBoundingSphere();
        }
        if(event.shooter===hero(s).id)this.lastDischarge={weapon:'grenade',at:shot.at,pose:shot.pose??null,
          fromHand:!!shot.releaseOrigin,origin:points[0].toArray(),impactAt:shot.at+GRENADE_IMPACT_MS};
      }
      const t=T.MathUtils.clamp(age/GRENADE_IMPACT_MS,0,1)*(points.length-1),i=Math.min(Math.floor(t),points.length-2);
      projectile.root.position.copy(points[i]).lerp(points[i+1],t-i);
      projectile.root.rotation.set(t*.17,t*.10,t*.24);
      projectile.root.visible=age<GRENADE_IMPACT_MS&&s.visible.has(Core.key(projectile.root.position.x,projectile.root.position.z));
    }
  }
  drawShotTraces(s,now){
    for(const shot of this.effects){
      if(!shot.tracer||!shot.started)continue;
      const {event,line}=shot,age=now-shot.at;
      if(shot.hasTrace===undefined){
        const actor=this.actors.get(event.shooter),end=traceEnd(event);
        const position=actor?.root.position;
        // A delayed visual round can play after the shooter has moved. Its
        // muzzle belongs to the event only while the firing position matches.
        const atSource=position&&Math.hypot(position.x-event.ax,position.z-event.ay)<=MUZZLE_SOURCE_TOLERANCE;
        const muzzle=atSource&&event.sourceVisible!==false&&actor.root.visible&&actor.weapon===event.weapon&&shot.fitted!==false
          ?actor.equipment.anchors.muzzle?.getWorldPosition(V()):null;
        const origin=traceStart(event,muzzle,end,s);
        shot.hasTrace=setTracer(line,origin,end,s,event.weapon);line.visible=shot.hasTrace;
        this.bodyImpacts?.present(event,s,now);
        if(event.missImpact&&shotVisible(s,end)){
          shot.impact=surfaceImpactFlash(end);this.scene.add(shot.impact);
        }
        if(muzzle===origin&&s.visible.has(Core.key(origin.x,origin.z))){
          shot.flash=muzzleFlash(origin,end,event.weapon);this.scene.add(shot.flash);
          if(event.weapon==='rpg'){
            const rear=actor.equipment.root.localToWorld(V(-.48,.025,0));
            shot.exhaust=muzzleFlash(rear,rear.clone().sub(end.clone().sub(origin)),'backblast');
            this.scene.add(shot.exhaust);
          }
        }
        if(event.shooter===hero(s).id)this.lastDischarge={weapon:event.weapon,at:shot.at,round:event.shot,hit:event.hit,
          tracerVertices:line.geometry.attributes.position.count,fromMuzzle:muzzle===origin,flash:!!shot.flash,pose:shot.pose??null,
          reason:shot.reason??null,angularError:shot.angularError??null};
      }
      if(shot.flash){shot.flash.visible=age<FLASH_DURATION;shot.flash.material.opacity=Math.max(0,1-age/FLASH_DURATION);}
      if(shot.exhaust){shot.exhaust.visible=age<110;shot.exhaust.material.opacity=Math.max(0,1-age/110);}
      if(shot.impact){
        const progress=age/shot.ttl;
        shot.impact.visible=shotVisible(s,shot.impact.position);
        shot.impact.scale.setScalar(1+progress);
        shot.impact.material.opacity=.8*(1-progress);
      }
    }
  }
  poseActor(a,s,v,sample,now,elapsed,displayedWeapon,operator){
    const player=v.id===hero(s).id,alive=v.hp>0&&!v.burningTurns;
    const aim=alive&&displayedWeapon===v.weapon?realtimeWeaponAim(s,v):null;
    const flamePreview=player?this.flameAim:null;
    const fire=flamePreview?null:this.flameEffects?.poseFor(operator,{realtime:!!s.realtime});
    const flameReady=!fire&&alive&&displayedWeapon==='flamethrower'&&(flamePreview||aim);
    if(fire||flameReady)sample.heading=fire?.entry.shape.source.heading??flamePreview?.heading??Core.headingTo(v,aim);
    const discharge=this.discharges?.get(v.id);
    const shot=!fire&&alive&&(discharge?.event.weapon===displayedWeapon||discharge?.event.weapon==='grenade')?discharge:null;
    const throwing=shot?.event.weapon==='grenade'?shot:null;
    const preview=player&&alive&&this.grenadeCamera?.kind!=='flame'&&!this.grenadeCamera?.until?this.grenadeCamera:null;
    const throwAction=grenadeAction(sample,preview,throwing,now);
    const action=alive&&!throwAction&&!fire&&!flameReady&&displayedWeapon!=='flamethrower'
      ?weaponAction(a.action,displayedWeapon,aim,shot,now,elapsed):null;
    const posing=!!(throwAction||action),flaming=!!(fire||flameReady);
    const crawling=alive&&sample.stance==='prone'&&sample.pose.prone>=.98&&!posing&&!flaming;
    const signature=[displayedWeapon,sample.heading,sample.blend,sample.distance,sample.crawlDistance,crawling,JSON.stringify(sample.pose)].join(':');
    let result=a.crawlResult;
    if(a.signature!==signature||posing||a.posing||flaming||a.hadFlame){
      a.signature=signature;
      a.root.position.set(0,0,0);
      if(a.weapon!==displayedWeapon){
        this.burnEffects?.release(v.id);const old=a.equipment;
        a.crawl?.dispose();a.crawl=null;
        a.equipment=createWeaponModel(displayedWeapon);a.worker.equipWeapon(a.equipment);old.dispose();a.weapon=displayedWeapon;
        if(player&&alive){a.root.updateMatrixWorld(true);a.crawl=createCrawlPose(a.worker,a.profile,a.posture,displayedWeapon);}
      }
      if(crawling){
        a.root.updateMatrixWorld(true);
        a.crawl ||= createCrawlPose(a.worker,a.profile,a.posture,displayedWeapon);
        a.throwPose?.clear();
        result=a.crawl.apply(sample);
      }else{
        a.crawl?.suspend();
        result=undefined;
        a.locomotion.apply({...sample,blend:sample.pose.prone||sample.pose.down?0:sample.blend});
        a.posture.apply(sample);
        if(alive)a.weaponPose?.crawl(sample);
        if(sample.pose.prone||sample.pose.kneel||sample.pose.down)a.posture.ground();
        if(throwAction){
          result=a.throwPose?.apply(sample,throwAction);
          if(throwing&&result&&!throwing.flightStarted)throwing.releaseOrigin=result.origin.clone().add(V(sample.x,0,sample.y));
        }else{
          a.throwPose?.clear();
          if(!fire&&!flameReady&&alive)result=a.weaponPose?.apply(sample,action);
        }
      }
      a.crawlResult=crawling?result:undefined;
    }
    a.action=action;a.posing=posing;a.hadFlame=flaming;
    a.root.position.set(sample.x,0,sample.y);a.root.updateMatrixWorld(true);a.worker.skeleton.update();
    if(displayedWeapon==='rpg')for(const part of a.equipment.parts)
      if(['shaped RPG warhead','warhead shoulder seam','nose fuse'].includes(part.name))part.visible=(v.ammo.rpg||0)>0;
    if(fire||flameReady){
      const readyWeight=flamePreview?1:.55*(aim?.progress??0);
      const previous=a.lanceAmount??0;
      const brace=fire?fireState(fire.seconds).brace:0;
      let amount=T.MathUtils.damp(previous,Math.max(readyWeight,brace),18,elapsed);
      if(fire?.reduced)amount=1;
      else if(fire&&fire.seconds<FIRE_TIME.ignite)amount=Math.max(previous,amount);
      a.lanceAmount=amount;
      const fitted=a.flameOperator.apply({...sample,hp:operator.hp},fire?.seconds??.30,fire?.reduced??false,amount);
      result={pose:'lance brace',reason:fitted?.fallback?'lance reach':null,...fitted};
      if(fire){
        this.flameEffects.captureMuzzle(fire,fitted);
        if(player&&!fire.entry.poseReported&&fire.entry.muzzle){
          fire.entry.poseReported=true;
          this.lastDischarge={weapon:'flamethrower',at:fire.entry.queuedAt,pose:result.pose,
            fromMuzzle:fitted?.origin?.distanceTo(fire.entry.muzzle)<.005,reason:result.reason};
        }
      }
    }else a.lanceAmount=0;
    if(shot){
      shot.pose=result?.pose??null;
      shot.fitted=result?.supported;
      shot.reason=result?.reason;
      shot.angularError=result?.angularError;
      if(player&&shot.presented&&!shot.tracer&&!throwing&&!shot.poseReported){
        shot.poseReported=true;
        this.lastDischarge={weapon:shot.event.weapon,at:shot.at,pose:shot.pose,hit:shot.event.hit};
      }
    }
    if(player)this.playerWeaponPose=result?{weapon:throwAction?'grenade':displayedWeapon,
      phase:throwAction?(throwAction.released?(throwAction.time>2.14?'recover':'release'):'ready'):
        fire?(fire.seconds>=FIRE_TIME.cutoff+FIRE_TIME.travel?'recover':fire.seconds<FIRE_TIME.ignite?'ready':'discharge'):flameReady?'ready':action?.phase??(result.crawl?'crawl':'carry'),
      pose:result.pose,stance:sample.stance,moving:!!sample.blend,reason:result.reason??null,...(result.crawl&&{crawl:result.crawl})}:null;
    this.burnEffects?.pose(a,v,this.camera);
  }
  updateFollowCamera(s,now){this.state=s;const u=hero(s),elapsed=this.lastFrameAt===undefined?1/60:boundedElapsed((now-this.lastFrameAt)/1000),followBlend=T.MathUtils.damp(0,1,-60*Math.log(.82),elapsed),zoomBlend=T.MathUtils.damp(0,1,-60*Math.log(.86),elapsed);this.lastFrameAt=now;
    if(this.grenadeCamera)this.trackGrenadeCamera(now,elapsed);
    if(this.returnSpan!=null){const goal=residentCameraSpan(s,{x:this.target.x,y:this.target.z},{width:this.container.clientWidth,height:this.container.clientHeight},this.returnSpan);this.span+=(goal-this.span)*zoomBlend;if(Math.abs(goal-this.span)<.01){this.span=goal;this.returnSpan=null;}this.resize();}
    if(this.focusedId!=null){const contact=s.units.find(v=>v.id===this.focusedId&&Core.alive(v)&&s.detected.has(v.id));if(contact){this.target.lerp(V(contact.x,0,contact.y),followBlend);this.updateCamera();}else this.center();}
    if(this.follow){
      const viewport={width:this.container.clientWidth,height:this.container.clientHeight};
      const baseSpan=this.requestedSpan??this.span;
      const frame=this.returnSpan==null?contactCameraFrame(s,u,viewport,baseSpan):null;
      const settling=this.contactSpan!=null&&!frame;
      const settleBlend=T.MathUtils.damp(0,1,4,elapsed);
      const point=frame?.target??u;
      this.target.lerp(V(point.x,0,point.y),settling?settleBlend:followBlend);
      if(frame||settling){
        const goal=frame?.span??baseSpan;
        const span=this.span+(goal-this.span)*(goal>this.span?zoomBlend:settleBlend);
        this.contactSpan=settling&&Math.abs(span-baseSpan)<.01?null:span;
      }
      this.updateCamera();
    }
    return elapsed;
  }
  sync(s,now){this.frameCount=(this.frameCount||0)+1;this.state=s;const u=hero(s),elapsed=this.updateFollowCamera(s,now),motionBlend=T.MathUtils.damp(0,1,-60*Math.log(.8),elapsed),poseBlend=T.MathUtils.damp(0,1,-60*Math.log(.85),elapsed);
    const window=this.residentWindow||blockWindow(s,u),visible=s.units.filter(v=>pointInWorldRect(v,window)&&(v.team==='squad'||(v.hp>0?s.detected.has(v.id):s.visible.has(Core.key(v.x,v.y)))));
    this.reconcileActors(visible);
    if(s.effect&&s.effect!==this.lastEffect){this.lastEffect=s.effect;this.queueEffects(s.effect,now);}
    this.animateEffects(now);
    this.flameEffects?.beginFrame(now,s);
    if(s.fireAnimations?.length||s.units.some(u=>u.burnedRemains||u.burningTurns))this.burnEffects ||= new SoloBurnEffects(this.scene);
    const burnStart=event=>{const entry=this.flameEffects?.queue.find(e=>e.event.fireSequences?.includes(event.sequence));if(entry)return entry.muzzle&&entry.last!==null?now+Math.max(0,FIRE_TIME.hit-entry.elapsed)*1000:null;const shot=s.effect?.sequence?.find(e=>e.fireSequences?.includes(event.sequence)),visual=shot&&this.shotVisuals?.get(shot);return shot?(visual?.at??this.effectAt??now)+(shot.shot||0)*BURST_SHOT_INTERVAL+(shot.weapon==='grenade'?GRENADE_IMPACT_MS:0):now;};
    if(s.fires?.length||s.fireAnimations?.some(e=>e.kind==='tank'||e.kind==='barrel'))this.tankEffects ||= new SoloTankEffects(this.scene);
    this.tankEffects?.observe(s,now,visible,burnStart);this.tankEffects?.captureOrigins(this.actors);
    this.burnEffects?.observe(s,now,visible,burnStart);if(this.burnEffects)this.burnEffects.tankEffects=this.tankEffects;
    for(const [id,a] of this.actors)a.root.visible=visible.some(v=>v.id===id);
    for(const v of visible){
      const a=this.actors.get(v.id);if(!a){this.actor(v);continue;}
      const previous=this.samples.get(v.id),motion=movementPresentation(v,previous);
      const old=previous||{blend:0,pose:{kneel:0,prone:0,down:v.hp<=0?1:0,dead:v.hp<=0?1:0}};
      const blend=old.blend+((motion.moving?1:0)-old.blend)*motionBlend;
      const goal={kneel:v.stance==='kneeling'?1:0,prone:v.stance==='prone'?1:0,down:v.hp<=0?1:0,dead:v.hp<=0?1:0};
      const pose=Object.fromEntries(Object.entries(goal).map(([k,value])=>[k,Math.abs(value-old.pose[k])<.005?value:old.pose[k]+(value-old.pose[k])*poseBlend]));
      const sample={...v,distance:motion.distance,crawlDistance:crawlTravel(v,previous),blend:blend<.001?0:blend,pose};
      this.samples.set(v.id,sample);a.root.visible=true;a.pick.visible=true;a.ring.visible=v.hp>0;a.pick.scale.set(v.hp>0?1:1.6,v.hp>0?1:.2,v.hp>0?1:1.6);a.pick.position.set(0,v.hp>0?.9:.18,0);a.ring.position.set(0,.018,0);a.shadow.position.set(0,.01,0);a.pick.userData.interactionId=v.hp<=0?'body:'+v.id:null;
      // An emitted spray may kill its own operator through a fuel blast. Fit
      // the recorded pre-impact discharge without reviving simulation state.
      const operator=v.hp<=0&&v.burnedRemains?{...v,hp:1}:v;
      const displayedWeapon=this.burnEffects?.equipmentFor(v)??v.weapon;
      this.poseActor(a,s,v,sample,now,elapsed,displayedWeapon,operator);
    }
    const pendingBarrels=this.tankEffects?.pendingProps()||[],barrelPhase=pendingBarrels.map(barrelId).join('|');
    this.art.pendingBarrels=pendingBarrels;
    if(s.revision!==this.lastRevision||window.key!==this.lastWindowKey||barrelPhase!==this.lastBarrelPhase){this.lastRevision=s.revision;this.lastWindowKey=window.key;this.lastBarrelPhase=barrelPhase;this.art.update(s,u,window);this.interactionArt?.update(s,window);this.missionArt?.update(s,window);
      const mission=missionForState(s);if(this.objectivePin)this.objectivePin.visible=!objectiveSecured(s)&&pointInWorldRect(mission.objective,window);if(this.extractionPin)this.extractionPin.visible=pointInWorldRect(mission.extraction,window);
    }
    this.art?.setFocus?.(u,this.camera);
    this.guardSight?.update(s,u,s.solo.status==='active'?visible:[],window,now);
    this.drawShotTraces(s,now);
    this.bodyImpacts?.draw(s,this.camera,now);
    this.drawGrenadeFlights(s,now);
    const windowStart=event=>{const shot=s.effect?.sequence?.find(e=>e.windowSequences?.includes(event.sequence));if(!shot)return now;const flame=this.flameEffects?.queue.find(e=>e.event===shot);if(flame)return flame.muzzle&&flame.last!==null?now+Math.max(0,.64-flame.elapsed)*1000:null;const visual=this.shotVisuals?.get(shot);if(visual?.started===false)return null;return (visual?.at??this.effectAt??now)+(shot.weapon==='grenade'?GRENADE_IMPACT_MS:0);};
    this.windowEffects?.observe(s,now,window,windowStart);this.windowArt?.update(s,window,(id,pane)=>this.windowEffects?.holds(id,pane));
    this.flameEffects?.draw(s,this.camera);this.tankEffects?.draw(this.camera,this.art?.library);
    this.advanceExplosionCues(now);
    if(this.lastLightAt===undefined||now-this.lastLightAt>=200){this.daylight.update(480,this.camera,now,true);this.lastLightAt=now;}
    this.marker.rotation.z=now*.0005;
    const graphicsReady=this.prepareGraphics&&!this.loadingAssets();
    if(graphicsReady){
      this.prepareGraphics=false;
      try{this.warmFieldGraphics(now);}catch(error){console.warn('Could not prepare field graphics',error);}
    }
    if(this.searchHalo){
      const targets=this.artBusy||this.propBusy?[]:searchHaloCandidates(s,window).map(object=>searchHaloTarget(object,this)).filter(target=>target.root);
      this.renderWithShake(now,()=>this.searchHalo.render(this.renderer,this.scene,this.camera,targets,now));
    }else this.renderWithShake(now,()=>this.renderer.render(this.scene,this.camera));
    if(graphicsReady)this.reportLoading();
  }
  renderWithShake(now,render){
    const offset=this.explosionShake?.sample(now)||{x:0,y:0};this.lastShake={...offset,at:now};
    this.shakePeak=Math.max(this.shakePeak||0,Math.hypot(offset.x,offset.y));
    if(!offset.x&&!offset.y){render();return;}
    const position=this.camera.position.clone(),scale=this.span/Math.max(1,this.container.clientHeight);
    this.camera.position.addScaledVector(V().setFromMatrixColumn(this.camera.matrixWorld,0),offset.x*scale)
      .addScaledVector(V().setFromMatrixColumn(this.camera.matrixWorld,1),offset.y*scale);
    this.camera.updateMatrixWorld();
    try{render();}finally{this.camera.position.copy(position);this.camera.updateMatrixWorld();}
  }
  dispose(){this.generation++;this.clearGestures();this.clearEffects();this.pending.clear();this.resizeObserver.disconnect();this.container.removeEventListener('pointerdown',this.pointerDown);this.container.removeEventListener('pointermove',this.pointerMove);this.container.removeEventListener('pointerup',this.pointerUp);this.container.removeEventListener('pointercancel',this.pointerUp);this.container.removeEventListener('wheel',this.wheel);for(const a of [...this.actors.values(),...this.parkedActors.values()])this.disposeActor(a);this.actors.clear();this.parkedActors.clear();this.clearEnvironment();this.daylight.dispose();this.marker.geometry.dispose();this.marker.material.dispose();this.blastMarker.geometry.dispose();this.blastMarker.material.dispose();this.blastArea.geometry.dispose();this.blastArea.material.dispose();this.pathLine.geometry.dispose();this.pathLine.material.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}

export function drawMinimap(canvas,s,options={}){const tour=getTourWorld(s);if(tour)return tour.drawMinimap(canvas,s,options);const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,bounds=worldBounds(s);ctx.fillStyle='#1b2219';ctx.fillRect(0,0,w,h);const scale=Math.min((w-12)/bounds.w,(h-12)/bounds.h),ox=(w-bounds.w*scale)/2,oy=(h-bounds.h*scale)/2;
  for(const cell of s.seen){const [x,y]=cell.split(',').map(Number);if(x<bounds.x||x>=bounds.x+bounds.w||y<bounds.y||y>=bounds.y+bounds.h)continue;const tile=s.map[y]?.[x];if(!tile)continue;ctx.fillStyle=tile==='crate'?'#746b4e':tile==='floor'||tile==='ground-concrete'?'#686d51':tile==='ground-asphalt'?'#575954':'#3e4b31';ctx.fillRect(ox+(x-bounds.x)*scale,oy+(y-bounds.y)*scale,scale+.2,scale+.2);}
  ctx.strokeStyle='#acaa88';ctx.lineWidth=Math.max(1,scale*.14);ctx.beginPath();for(const [edge,kind] of Object.entries(s.edges)){if(kind==='door')continue;const [axis,xs,ys]=edge.split(':'),x=+xs,y=+ys;if(!s.seen.has(Core.key(x,y)))continue;if(axis==='e'){ctx.moveTo(ox+(x-bounds.x+.5)*scale,oy+(y-bounds.y-.5)*scale);ctx.lineTo(ox+(x-bounds.x+.5)*scale,oy+(y-bounds.y+.5)*scale);}else{ctx.moveTo(ox+(x-bounds.x-.5)*scale,oy+(y-bounds.y+.5)*scale);ctx.lineTo(ox+(x-bounds.x+.5)*scale,oy+(y-bounds.y+.5)*scale);}}ctx.stroke();
  const dot=(p,color,r)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(ox+(p.x-bounds.x)*scale,oy+(p.y-bounds.y)*scale,r,0,Math.PI*2);ctx.fill();};
  const mission=missionForState(s);if(!objectiveSecured(s))dot(mission.objective,'#df613f',Math.max(2,scale*.45));dot(mission.extraction,'#c4d29a',Math.max(2,scale*.45));for(const id of s.detected){const g=s.units.find(u=>u.id===id);if(g?.hp>0)dot(g,'#e16a47',Math.max(2,scale*.32));}
  const u=hero(s);drawPlayerMapMarker(canvas,ctx,{x:ox+(u.x-bounds.x)*scale,y:oy+(u.y-bounds.y)*scale,heading:u.heading},options);
}
