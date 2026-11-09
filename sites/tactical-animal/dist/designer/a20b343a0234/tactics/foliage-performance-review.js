import {moveGroup,navigationPath,attackGround,endTurn,WEAPONS} from './core/engine.js';
import {traceFoliage,foliageObstacles} from './foliage-obstacles.js';
import {projectBattlePoint} from './isometric-camera.js';

const KEY='aft-tree-cover-performance-v2',families=['jungle','temperate','snow','dry','wetlands'],mixes=['brush-v1','mixed-v1','trees-v1'];
const quantiles=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return {samples:a.length,median:a[Math.floor(a.length*.5)]??null,p95:a[Math.floor(a.length*.95)]??null,p99:a[Math.floor(a.length*.99)]??null};};
function memory(renderer){
 const textures=new Set(),geometries=new Set();let geometryBytes=0;
 renderer.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.instanceMatrix)geometryBytes+=o.instanceMatrix.array.byteLength;for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])for(const t of Object.values(m))if(t?.isTexture)textures.add(t);});
 for(const g of geometries){for(const a of Object.values(g.attributes))geometryBytes+=a.array?.byteLength||0;geometryBytes+=g.index?.array.byteLength||0;}
 for(const t of Object.values(renderer.biomes.textures))textures.add(t);for(const l of renderer.biomes.layers.values())textures.add(l.texture);
 for(const {groundSkin:s}of renderer.biomes.terrains)for(const t of [s.overview,s.edgeMap,s.edgeBarriers,s.bogMap,...[...s.pages.values()].map(p=>p.texture)])if(t?.isTexture)textures.add(t);
 let textureBytes=0,finiteMaskBytes=0,shadowBytes=0;for(const t of textures)textureBytes+=(t.image?.width||0)*(t.image?.height||0)*(t.format===1028?1:4)*(t.generateMipmaps?4/3:1);
 renderer.scene.traverse(o=>{finiteMaskBytes+=o.userData.ownedTextureBytes||0;if(o.shadow?.map)shadowBytes+=o.shadow.map.width*o.shadow.map.height*4;});textureBytes+=finiteMaskBytes;
 const paint=renderer.biomes.stats().paint;
 return {geometryBytes,estimatedTextureBytes:Math.round(textureBytes),groundPaintTextureBytes:paint.reduce((n,p)=>n+p.textureBytes,0),finiteMaskBytes,estimatedShadowColorBytes:shadowBytes,groundPaintCPUBytes:paint.reduce((n,p)=>n+p.canvasBytes+p.workerBaseBytes,0),geometries:renderer.renderer.info.memory.geometries,textures:renderer.renderer.info.memory.textures,note:'Deduplicated texture pixels including ground uniforms and finite masks. Geometry is CPU buffers. Shadow color targets and CPU paint buffers are separate estimates; driver allocations, depth buffers and temporary uploads are excluded.'};
}
export function installFoliagePerformanceReview(api){
 const q=new URLSearchParams(location.search),family=q.get('family')||'jungle',mix=q.get('mix')||'trees-v1',layout=q.get('layout')||'fill';
 const panel=document.createElement('aside');panel.style.cssText='position:fixed;right:12px;top:90px;z-index:100;background:#192f27ed;color:#f9e7bc;padding:10px;width:270px;font:12px system-ui';
 panel.innerHTML='<strong>Tree-cover performance review</strong><p id="foliage-review-status">Ready · '+family+' / '+mix+' / '+layout+'</p><button id="profile-one">Measure 60 seconds</button> <button id="profile-all">Measure all 30 scenarios</button> <button id="profile-export">Download report</button> <button id="profile-memory">Inspect memory</button> <button id="profile-record">Record 8-second camera pass</button><label><input id="profile-cutaways" type="checkbox" checked>Vegetation cutaways</label><pre id="foliage-review-result" style="max-height:160px;overflow:auto"></pre>';document.body.append(panel);
 const status=panel.querySelector('p'),out=panel.querySelector('pre'),download=(data,name)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const detailLabel=document.createElement('label'),detail=document.createElement('input');detail.type='checkbox';detailLabel.append(detail,document.createTextNode(' Full-detail foliage shadows'));panel.append(detailLabel);
 detail.onchange=()=>{api.renderer.biomes.shadowDetail=detail.checked?'full':'proxy';};
 const dense=document.createElement('button');dense.textContent='Measure five dense biomes';panel.append(dense);dense.onclick=()=>{location.search=new URLSearchParams({study:'tree-cover',profile:'families',family:families[0],mix:'trees-v1',layout:'sector'});};
 const inspect=document.createElement('button');inspect.textContent='Inspect shadow submissions';panel.append(inspect);inspect.onclick=()=>{
  if(running)return;const r=api.renderer,draw=r.draw,info=r.renderer.info,auto=info.autoReset;
  r.draw=function(...args){
   const callbacks=[],counts=new Map(),weapons=new Set(),actors=new Set(),lights=new Map();
   for(const model of r.models.values()){model.root.traverse(o=>actors.add(o));for(const root of [model.equipment?.root,model.offhand.gun?.root])root?.traverse(o=>weapons.add(o));}
   r.scene.traverse(o=>{if(o.shadow)lights.set(o.shadow.camera.uuid,o.type+': '+(o.parent?.name||o.name||'unnamed'));});
   r.scene.traverse(o=>{if(!o.isMesh)return;const saved=o.onBeforeShadow;callbacks.push([o,saved]);o.onBeforeShadow=function(...a){
    const path=[];for(let p=o;p&&p!==r.scene;p=p.parent)if(p.name)path.unshift(p.name);
    const key=JSON.stringify([weapons.has(o)?'weapon':actors.has(o)?'character':'scene',path.join(' / ')||o.type,lights.get(a[3].uuid)||a[3].type]);
    counts.set(key,(counts.get(key)||0)+1);return saved.apply(this,a);
   };});
   try{info.autoReset=false;info.reset();const result=draw.apply(this,args);out.textContent=JSON.stringify({note:'One instrumented frame, not a timing benchmark.',calls:info.render.calls,triangles:info.render.triangles,casters:[...counts].map(([key,calls])=>({key:JSON.parse(key),calls})).sort((a,b)=>b.calls-a.calls)},null,2);return result;}
   finally{for(const [o,saved]of callbacks)o.onBeforeShadow=saved;info.autoReset=auto;r.draw=draw;}
  };
 };
 const prior=JSON.parse(localStorage.getItem(KEY)||'[]').at(-1);if(prior)out.textContent=JSON.stringify({previous:{family:prior.family,mix:prior.mix,layout:prior.layout,cpuDrawMs:prior.cpuDrawMs,displayCadenceMs:prior.displayCadenceMs}},null,2);
 let running=false,stopped=false;addEventListener('pagehide',()=>stopped=true,{once:true});
 const tasks=['fill','sector'].flatMap(layout=>families.flatMap(family=>mixes.map(mix=>({layout,family,mix}))));
 async function measure(all=false){
  if(running)return;running=true;for(const b of panel.querySelectorAll('button'))b.disabled=b.id!=='profile-export';
  const r=api.renderer,s=api.state,original=r.draw,info=r.renderer.info,autoReset=info.autoReset,view={...api.view},clock=s.clock.minutes,shadowRender=r.renderer.shadowMap.render;
  const workload={moveOrders:0,acceptedMoveOrders:0,shotOrders:0,acceptedShots:0,endTurns:0},phaseWork=Array.from({length:6},()=>({moveOrders:0,acceptedMoveOrders:0,shotOrders:0,acceptedShots:0,endTurns:0,completedMovementSteps:0})),steps=()=>s.units.reduce((n,u)=>n+(u.steps||0),0),startingSteps=steps();let lastSteps=startingSteps;
  let shadowCpu=0,shadowCalls=0,shadowTriangles=0;
  const samples=[],cadence=[],queries=[],gpu=[],ext=r.renderer.getContext().getExtension('EXT_disjoint_timer_query_webgl2'),gl=r.renderer.getContext();let begun=0,last,frame=0,moveAt=0,shotAt=0,phase=-1,hiddenFrames=0;
  try{
   status.textContent='Settling ground paint and warming shaders…';await Promise.all(r.biomes.terrains.map(t=>t.groundSkin.whenReady()));
   const sources=Object.fromEntries(await Promise.all(['foliage-cutaway.js','foliage-obstacles.js','biome-scene.js','biome-terrain.js','foliage-screen-scene.js','foliage-performance-review.js','foliage-review-fixture.js','hybrid-renderer.js','battle-renderer.js','offhand-equipment.js','lighting-scene.js','static-model-batches.js','light-renderer.js','daylight-rig.js'].map(async name=>{const bytes=await (await fetch(new URL(name,import.meta.url))).arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);return [name,[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('')];})));
   const gpuInfo=gl.getExtension('WEBGL_debug_renderer_info');
   info.autoReset=false;
   r.renderer.shadowMap.render=function(...args){const at=performance.now(),calls=info.render.calls,triangles=info.render.triangles;try{return shadowRender.apply(this,args);}finally{shadowCpu+=performance.now()-at;shadowCalls+=info.render.calls-calls;shadowTriangles+=info.render.triangles-triangles;}};
   const sampleQueries=()=>{while(queries.length&&gl.getQueryParameter(queries[0],gl.QUERY_RESULT_AVAILABLE)){const query=queries.shift();if(!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);gl.deleteQuery(query);}};
   r.draw=function(...args){
    const now=performance.now();begun||=now;const elapsed=now-begun,warm=elapsed<5000,stage=Math.min(5,Math.floor(Math.max(0,elapsed-5000)/10000)),work=phaseWork[stage],moved=steps();work.completedMovementSteps+=moved-lastSteps;lastSteps=moved;
    // One route covers day/night, both camera sides, close/wide framing,
    // continuous cursor motion, local lights and four moving squad models.
    if(stage!==phase){phase=stage;s.clock.minutes=stage<3?720:1320;api.view.turn=stage%2?2:0;api.view.zoom=stage%3===2?.28:.85;}
    const width=r.width||960,height=r.height||640,center=projectBattlePoint({x:120+Math.sin(elapsed/5500)*5,y:127}, {...api.view,x:0,y:0});api.view.x=width*.5-center.x;api.view.y=height*.5-center.y;
    r.wallXray.setPointer(width*(.45+.15*Math.sin(elapsed/1000)),height*(.5+.12*Math.cos(elapsed/1200)));
    if(!s.queue.length&&!r.busy){
     if(s.phase==='player'&&s.units.some(u=>u.team==='squad'&&u.hp>0&&u.ap<(u===s.units[0]?WEAPONS[u.weapon].cost+2:1))){if(endTurn(s)){workload.endTurns++;work.endTurns++;}}
     else if(now-shotAt>9000){shotAt=now;workload.shotOrders++;work.shotOrders++;if(attackGround(s,s.units[0],{x:125,y:119,z:0})){workload.acceptedShots++;work.acceptedShots++;}r.captureCombat(s);}
     else if(now-moveAt>4500){moveAt=now;const mercs=s.units.filter(u=>u.team==='squad'&&u.hp>0);workload.moveOrders++;work.moveOrders++;if(moveGroup(s,mercs.map(u=>u.id),mercs[0],stage%2?123:119,stage%2?124:127,0)){workload.acceptedMoveOrders++;work.acceptedMoveOrders++;}}
    }
    info.reset();let query;if(ext&&frame++%12===0&&queries.length<4){query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);}
    shadowCpu=shadowCalls=shadowTriangles=0;const start=performance.now(),result=original.apply(this,args),cpu=performance.now()-start;if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);queries.push(query);}if(ext)sampleQueries();
    if(!warm){samples.push({cpu,calls:info.render.calls,triangles:info.render.triangles,shadowCpu,shadowCalls,shadowTriangles,stage});if(last)cadence.push(now-last);if(document.hidden)hiddenFrames++;}last=now;
    status.textContent=(warm?'Warming':Math.min(60,Math.floor((elapsed-5000)/1000))+' / 60 seconds')+' · '+family+' / '+mix+' / '+layout;
    return result;
   };
   while(!stopped&&(!begun||performance.now()-begun<65000))await new Promise(requestAnimationFrame);
   if(stopped)return;
   const queriesCost={};for(const [name,fn]of [['sight',()=>traceFoliage(foliageObstacles(s),[120,1.5,127],[144,1.5,102],'sight')],['path',()=>navigationPath(s,s.units[0],120,124,0)]]){const values=[];for(let i=0;i<50;i++){const at=performance.now();fn();values.push(performance.now()-at);}queriesCost[name]=quantiles(values);}
   const result={family,mix,layout,durationSeconds:60,visibility:document.visibilityState,hiddenFrames,resolution:[r.width,r.height],dpr:r.renderer.getPixelRatio(),browser:navigator.userAgent,gpu:gpuInfo?gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),sources,difficulty:s.difficulty,seed:s.seed,cameraRoute:'6 ten-second phases: close/reverse/wide by day, then by night; fixed gameplay elevation; continuous hover; squad orders every 4.5s and firearm effects every 9s when idle; lit furnished room, interior fog and fire',cpuDrawMs:quantiles(samples.map(v=>v.cpu)),displayCadenceMs:quantiles(cadence),gpuMs:ext?quantiles(gpu):'Timer queries unavailable',drawCalls:quantiles(samples.map(v=>v.calls)),submittedTrianglesIncludingShadowAndLightPasses:quantiles(samples.map(v=>v.triangles)),queriesCost,memory:memory(r),chunks:r.biomes.terrains.map(t=>({detail:t.stats.detailedChunks,shadows:t.stats.shadowChunks})),trees:r.biomes.stats().trees,diagnostics:r.diagnostics,coldLoadMs:performance.getEntriesByType('navigation')[0]?.duration,measuredAt:new Date().toISOString()};
   Object.assign(result,{foliageShadows:detail.checked?'full':'proxy',shadowCpuMs:quantiles(samples.map(v=>v.shadowCpu)),shadowDrawCalls:quantiles(samples.map(v=>v.shadowCalls)),shadowTriangles:quantiles(samples.map(v=>v.shadowTriangles)),workload:{...workload,completedMovementSteps:s.units.reduce((n,u)=>n+(u.steps||0),0)-startingSteps},phases:Array.from({length:6},(_,stage)=>{const a=samples.filter(v=>v.stage===stage);return {stage,workload:phaseWork[stage],cpuDrawMs:quantiles(a.map(v=>v.cpu)),shadowCpuMs:quantiles(a.map(v=>v.shadowCpu)),drawCalls:quantiles(a.map(v=>v.calls))};}),localLightPassSizes:r.lights?.passes.lastPassSizes});
   const report=JSON.parse(localStorage.getItem(KEY)||'[]');report.push(result);localStorage.setItem(KEY,JSON.stringify(report));out.textContent=JSON.stringify(result,null,2);status.textContent='Complete · '+family+' / '+mix+' / '+layout;
   if(all){const sequence=all==='families'?families.map(family=>({family,mix:'trees-v1',layout:'sector'})):tasks,index=sequence.findIndex(t=>t.family===family&&t.mix===mix&&t.layout===layout),next=sequence[index+1];if(next){const params=new URLSearchParams({study:'tree-cover',profile:all==='families'?'families':'all',...next});location.search=params;}else status.textContent=all==='families'?'All five dense biomes complete. Download the report.':'All 30 scenarios complete. Download the report.';}
  }catch(e){status.textContent='Profile failed: '+e.message;console.error(e);}
  finally{r.draw=original;r.renderer.shadowMap.render=shadowRender;info.autoReset=autoReset;for(const query of queries)gl.deleteQuery(query);Object.assign(api.view,view);s.clock.minutes=clock;r.wallXray.setPointer(null,null);running=false;for(const b of panel.querySelectorAll('button'))b.disabled=false;}
 }
 panel.querySelector('#profile-one').onclick=()=>measure();panel.querySelector('#profile-all').onclick=()=>{const first=tasks[0];location.search=new URLSearchParams({study:'tree-cover',profile:'all',...first});};panel.querySelector('#profile-export').onclick=()=>download(JSON.parse(localStorage.getItem(KEY)||'[]'),'tree-cover-performance.json');
 panel.querySelector('#profile-cutaways').onchange=e=>{api.renderer.biomes.cutaway.enabled=e.target.checked;};
 panel.querySelector('#profile-memory').onclick=()=>{out.textContent=JSON.stringify(memory(api.renderer),null,2);};
 panel.querySelector('#profile-record').onclick=async()=>{
  const canvas=document.querySelector('#battle'),stream=canvas.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),saved={...api.view};
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  try{recorder.start();const started=performance.now();status.textContent='Recording camera and cutaway movement…';while(!stopped&&performance.now()-started<8000){const t=(performance.now()-started)/8000;api.view.x=saved.x+Math.sin(t*Math.PI*2)*80;api.renderer.wallXray.setPointer(canvas.clientWidth*(.4+t*.2),canvas.clientHeight*.5);await new Promise(requestAnimationFrame);}await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});const blob=new Blob(chunks,{type:'video/webm'}),reader=new FileReader(),data=await new Promise(resolve=>{reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});let video=panel.querySelector('#foliage-recording');if(!video){video=document.createElement('video');video.id='foliage-recording';video.controls=true;video.style.width='100%';panel.append(video);}video.src=data;status.textContent='Recording complete.';}
  finally{if(recorder.state!=='inactive')recorder.stop();stream.getTracks().forEach(t=>t.stop());Object.assign(api.view,saved);api.renderer.wallXray.setPointer(null,null);}
 };
 if(['all','families'].includes(q.get('profile')))measure(q.get('profile'));
}
