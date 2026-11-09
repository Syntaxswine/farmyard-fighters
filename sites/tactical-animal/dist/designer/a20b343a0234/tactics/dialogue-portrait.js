import * as THREE from './vendor/three.module.js';
import {ANIMAL_MOTION_CATALOG} from './animal-motion-catalog.js';
import {prepareModelPaintProjection} from './horse-model-paint.js';
import {createAnimalPaint} from './animal-motion-paint.js';
import {createRedHatCap} from './red-hat-model.js';
import {withSpeakingHead,rigSpeakingHead,speakingHeadFile,speechOpen} from './speaking-head.js';
import {PORTRAIT_FRAMES,portraitSpecies} from './dialogue-presentation-manifest.js';

// One owned renderer per participant; never borrows the battle rig or textures.
// Only the speaking participant animates. The listener keeps its neutral frame.
export class DialoguePortrait {
 constructor(host,{onStatus=()=>{}}={}){
  const started=performance.now();this.timings={};this.drawTimes=[];this.drawCosts=[];
  this.host=host;this.onStatus=onStatus;this.generation=0;this.closed=false;this.model=null;this.draws=0;this.lastDraw=0;
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.setClearColor(0x000000,0);host.append(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-hidden','true');
  this.scene=new THREE.Scene();this.scene.add(new THREE.HemisphereLight(0xfff9ec,0x737775,2));const key=new THREE.DirectionalLight(0xfff2dc,2.3);key.position.set(3,5,4);this.scene.add(key);const fill=new THREE.DirectionalLight(0xffffff,.7);fill.position.set(-2,2,-3);this.scene.add(fill);this.camera=new THREE.OrthographicCamera();
  this.resize=new ResizeObserver(()=>this.draw(0,true));this.resize.observe(host);
  this.timings.context=performance.now()-started;
 }
 async setCharacter(npc){
  const identity=JSON.stringify([portraitSpecies(npc),npc.outfit]);if(identity===this.identity)return;this.identity=identity;const mine=++this.generation;this.abort?.abort();const abort=this.abort=new AbortController();this.release();this.onStatus('loading');
  const began=performance.now();const timer=setTimeout(()=>abort.abort(),10000);let candidate={},prepWorker;
  const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0)),pending=new Map();let jobId=0;
  function cancelPrep(){prepWorker?.terminate();for(const job of pending.values())job.reject(Error('Portrait load cancelled'));pending.clear();}
  abort.signal.addEventListener('abort',cancelPrep,{once:true});
  const prepare=payload=>{if(abort.signal.aborted)return Promise.reject(Error('Portrait load cancelled'));if(!prepWorker){prepWorker=new Worker(new URL('./dialogue-portrait-worker.js',import.meta.url),{type:'module'});prepWorker.onmessage=({data})=>{const job=pending.get(data.id);if(!job)return;pending.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data.data);};prepWorker.onerror=cancelPrep;}
   const id=++jobId;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});prepWorker.postMessage({id,...payload});});};
  const mask=url=>prepare({url:new URL(url,import.meta.url).href});
  try{
   const species=portraitSpecies(npc),profile=ANIMAL_MOTION_CATALOG.find(p=>p.id===species);if(!profile)throw Error('No portrait model');
   const json=async path=>{const r=await fetch(new URL(path,import.meta.url),{signal:abort.signal});if(!r.ok)throw Error('Portrait asset unavailable');return r.json();};
   const [data,head]=await Promise.all([json(profile.file),json(speakingHeadFile(species)).catch(e=>{if(abort.signal.aborted)throw e;return null;})]);
   if(abort.signal.aborted)throw Error('Portrait load cancelled');
   const preparedParts=species==='hen'?null:await prepare({rig:{species,data,head}});if(abort.signal.aborted)throw Error('Portrait load cancelled');
   await yieldUI();let at=performance.now();candidate.worker=profile.create(preparedParts?{...data,preparedParts}:head?withSpeakingHead(data,head):data);this.timings.mesh=performance.now()-at;candidate.head=head;candidate.frame=PORTRAIT_FRAMES[species]||PORTRAIT_FRAMES.horse;
   await yieldUI();at=performance.now();if(head)candidate.speech=rigSpeakingHead(candidate.worker,head);this.timings.rig=performance.now()-at;
   const loader=new THREE.TextureLoader(),ownedLoader={loadAsync:url=>new Promise((resolve,reject)=>{const cancelled=()=>reject(Error('Portrait load cancelled'));abort.signal.addEventListener('abort',cancelled,{once:true});loader.load(url,t=>{abort.signal.removeEventListener('abort',cancelled);if(abort.signal.aborted){t.dispose();reject(Error('Portrait load cancelled'));}else resolve(t);},undefined,e=>{abort.signal.removeEventListener('abort',cancelled);reject(e);});})};
   const preparedLoader={prepareProjection:async(worker,frame)=>{const at=performance.now(),result=await prepareModelPaintProjection(this.renderer,worker,frame,abort.signal);this.timings.projection=performance.now()-at;return result;},loadAsync:async url=>{const texture=await ownedLoader.loadAsync(url);try{texture.userData.paintValidity=await mask(url);if(abort.signal.aborted)throw Error('Portrait load cancelled');return texture;}catch(e){texture.dispose();throw e;}}};
   await yieldUI();candidate.paint=await createAnimalPaint(this.renderer,candidate.worker,profile,preparedLoader,npc.outfit,true);
   // Upload owned paint textures separately instead of stalling the first visible frame.
   this.timings.uploadMax=0;for(const texture of new Set(candidate.paint.textures)){await yieldUI();if(abort.signal.aborted)throw Error('Portrait load cancelled');at=performance.now();this.renderer.initTexture(texture);this.timings.uploadMax=Math.max(this.timings.uploadMax,performance.now()-at);}
   for(const part of candidate.worker.parts)part.material=candidate.paint.material;
   candidate.speech?.applyPaint(candidate.paint);
   if(npc.outfit==='red-hats')candidate.cap=await createRedHatCap(this.renderer,candidate.worker,profile,ownedLoader,true);
   if(this.closed||mine!==this.generation||abort.signal.aborted){releaseModel(candidate);return;}
   // Keep the rig private until shaders finish. Speech frames must not render it
   // early and turn compileAsync back into a synchronous driver stall.
   const stagedScene=this.scene.clone();stagedScene.add(candidate.worker.root);candidate.worker.pose('neutral',0);
   await yieldUI();at=performance.now();await this.renderer.compileAsync(stagedScene,this.camera);this.timings.compile=performance.now()-at;
   if(this.closed||mine!==this.generation||abort.signal.aborted){releaseModel(candidate);return;}
   this.model=candidate;candidate=null;this.scene.add(this.model.worker.root);
   this.onStatus(head?'ready':'static');this.draw(0,true);this.timings.ready=performance.now()-began;
  }catch(error){releaseModel(candidate);if(!this.closed&&mine===this.generation){this.release();this.onStatus('fallback',error.message);}}
  finally{clearTimeout(timer);cancelPrep();abort.signal.removeEventListener('abort',cancelPrep);}
 }
 draw(open=0,force=false){if(this.closed||!this.model||!this.host.isConnected||document.hidden)return;const now=performance.now();if(open===0&&this.lastOpen>0)force=true;if(!force&&(now-this.lastDraw<1000/30||Math.abs(open-(this.lastOpen||0))<.001))return;this.lastDraw=now;this.lastOpen=open;
  const {worker,head,speech,frame}=this.model;speech?.setJaw(Math.max(0,Math.min(1,open))*(head?speechOpen(head):0));worker.root.updateMatrixWorld(true);
  const rect={width:this.host.clientWidth,height:this.host.clientHeight},w=Math.max(1,Math.min(512,Math.round(rect.width*devicePixelRatio))),h=Math.max(1,Math.min(512,Math.round(rect.height*devicePixelRatio)));
  if(this.renderer.domElement.width!==w||this.renderer.domElement.height!==h)this.renderer.setSize(w,h,false);
  const ratio=Math.max(.3,rect.width/Math.max(1,rect.height)),height=frame.height;this.camera.left=-height*ratio/2;this.camera.right=height*ratio/2;this.camera.top=height/2;this.camera.bottom=-height/2;this.camera.near=.05;this.camera.far=20;
  const center=worker.root.localToWorld(new THREE.Vector3(...frame.center));this.camera.position.copy(center).add(new THREE.Vector3(4,.12,2.4));this.camera.lookAt(center);this.camera.updateProjectionMatrix();this.renderer.render(this.scene,this.camera);this.draws++;this.drawTimes.push(now);this.drawTimes=this.drawTimes.slice(-250);this.drawCosts.push(performance.now()-now);this.drawCosts=this.drawCosts.slice(-250);
 }
 release(){if(this.model){this.scene.remove(this.model.worker.root);releaseModel(this.model);this.model=null;}}
 dispose(){this.closed=true;this.generation++;this.abort?.abort();this.resize.disconnect();this.release();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();}
 get resources(){return {renderer:this.closed?0:1,draws:this.draws,drawP95Ms:this.drawCosts.length?[...this.drawCosts].sort((a,b)=>a-b)[Math.floor((this.drawCosts.length-1)*.95)]:0,preparationMs:this.timings,...this.renderer.info.memory,triangles:this.renderer.info.render.triangles,calls:this.renderer.info.render.calls,width:this.renderer.domElement.width,height:this.renderer.domElement.height};}
}
function releaseModel(c){if(!c)return;const skeletons=new Set();c.worker?.root.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});c.cap?.dispose();c.speech?.dispose();c.paint?.dispose();c.worker?.dispose();for(const s of skeletons)s.dispose();}
