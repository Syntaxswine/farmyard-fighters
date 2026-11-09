import {projectBattlePoint} from './isometric-camera.js';
import {sceneryRayHit,sceneryMoveAllowed} from './scenery-rules.js';
import {pathTo} from './core/engine.js';
import {grenadeWorld,sweepGrenade} from './grenade-geometry.js';

const quantiles=values=>{const a=[...values].sort((a,b)=>a-b);return {samples:a.length,median:a[Math.floor(a.length*.5)]??null,p95:a[Math.floor(a.length*.95)]??null};};
export function installFactoryMachineReview(api){
 const panel=document.createElement('details');panel.id='machine-review';panel.style.cssText='position:fixed;right:12px;top:110px;z-index:40;background:#1c302beF;color:#f5e4bc;border:1px solid #c6ad72;padding:10px;max-height:70vh;overflow:auto;width:290px;font:12px system-ui';
 panel.innerHTML='<summary>Factory machine review</summary><p>Same camera, four mercs and ground. Compare empty / 3 / 30 machines.</p><nav><a href="?study=factory-machines&layout=baseline">Empty</a> · <a href="?study=factory-machines&layout=small">3 machines</a> · <a href="?study=factory-machines&layout=stress">30 machines</a></nav><p><a href="editor-3d.html?editing=1&study=factory-machines">Open editor fixture</a></p><button id="measure-machines">Measure machines (10 seconds)</button><p id="machine-profile-status" role="status">Ready</p><pre id="machine-profile-result" style="white-space:pre-wrap"></pre>';
 document.body.append(panel);let running=false,stopped=false;addEventListener('pagehide',()=>stopped=true,{once:true});
 panel.querySelector('button').onclick=async()=>{
  if(running)return;running=true;const r=api.renderer,s=api.state,original=r.draw,view={...api.view},info=r.renderer.info,autoReset=info.autoReset,samples=[],cadence=[],status=panel.querySelector('#machine-profile-status'),out=panel.querySelector('pre');let began=0,last=0;
  try{
   status.textContent='Warming the fixed review camera…';await Promise.all(r.sceneryAssets.pending.values());info.autoReset=false;
   r.draw=function(...args){
    const [, ,v,width,height]=args;v.zoom=.66;v.turn=0;const center=projectBattlePoint({x:25,y:25},{...v,x:0,y:0});v.x=width*.5-center.x;v.y=height*.5-center.y;
    const now=performance.now();began||=now;info.reset();const started=performance.now(),result=original.apply(this,args),cpu=performance.now()-started;
    if(now-began>1500){samples.push({cpu,calls:info.render.calls,triangles:info.render.triangles});if(last)cadence.push(now-last);}last=now;status.textContent=`${Math.min(10,Math.floor((now-began)/1000))} / 10 seconds`;return result;
   };
   while(!stopped&&(!began||performance.now()-began<10000))await new Promise(requestAnimationFrame);if(stopped)return;
   const world=grenadeWorld(s),queries={},time=(name,fn,n=200)=>{const values=[];for(let i=0;i<n;i++){const start=performance.now();fn();values.push(performance.now()-start);}queries[name]=quantiles(values);};
   time('finiteRayMs',()=>sceneryRayHit(s.props,{x:8,y:19,h:.8},{x:1,y:0,h:0},35));time('movementLinkMs',()=>sceneryMoveAllowed(s,{x:11,y:13,z:0},{x:12,y:13,z:0}));time('grenadeSweepMs',()=>sweepGrenade(world,{x:8,y:19,h:.8},{x:43,y:19,h:.8},.045));time('pathMs',()=>pathTo(s,s.units[0],9,38,0),30);
   const gl=r.renderer.getContext(),gpu=gl.getExtension('WEBGL_debug_renderer_info'),families=r.sceneryAssets.stats(),result={layout:new URLSearchParams(location.search).get('layout')||'review',cpuDrawMs:quantiles(samples.map(v=>v.cpu)),displayCadenceMs:quantiles(cadence),drawCalls:quantiles(samples.map(v=>v.calls)),submittedTrianglesIncludingShadowPass:quantiles(samples.map(v=>v.triangles)),queries,families,geometryBytes:families.reduce((n,f)=>n+f.geometryBytes,0),estimatedMachineTextureBytes:families.reduce((n,f)=>n+f.estimatedTextureBytes,0),rendererMemory:info.memory,resolution:[r.width,r.height],dpr:r.renderer.getPixelRatio(),gpu:gpu?gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),visibility:document.visibilityState,diagnostics:r.diagnostics,notes:'Texture estimate includes paint mipmaps, validity mask, projection color/depth target, shared once per family. CPU draw excludes HUD/engine. Display cadence also includes browser scheduling; this is not an isolated GPU timer. Cold preparation excludes network; loadAndPreparation includes network.'};
   out.textContent=JSON.stringify(result,null,2);status.textContent='Complete';
  }catch(e){status.textContent='Measurement failed: '+e.message;console.error(e);}
  finally{r.draw=original;info.autoReset=autoReset;Object.assign(api.view,view);running=false;}
 };
}
