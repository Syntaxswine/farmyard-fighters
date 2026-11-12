import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {installNativeProbe,inspectWebGL} from '../sites/tactical-animal/browser-tests/native-probe.mjs';
import {measureMovementFrames,startMovementFrameTape} from '../sites/tactical-animal/browser-tests/movement-measurement.mjs';
const shelterReview=false;
// Fighters keeps the tour save under app.js's real-time storage namespace,
// isolated from the bare key inherited from Farmyard Commando.
const TOUR_SAVE='farmyard-fighters:farmyard-mount-dora-tour-v1';
// The two-core software-rendering runner uses a normal 800x600 desktop window.
// Keep the complete route/assertions and 390x844 touch coverage; video is opt-in.
const desktopViewport={width:800,height:600},recordVideo=process.env.WALKTHROUGH_VIDEO==='1';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),site=path.join(root,'dist'),out=path.join(root,'artifacts/mount-dora-travel-speed',shelterReview?'native-shelter':'native');
fs.mkdirSync(out,{recursive:true});
const {chromium}=await import(pathToFileURL(path.join(root,'sites/tactical-animal/browser-tests/node_modules/playwright/index.mjs')).href);
const hash=data=>createHash('sha256').update(data).digest('hex');
const project=JSON.parse(fs.readFileSync(path.join(site,'maps/mount-dora/project.json'))),features=JSON.parse(fs.readFileSync(path.join(site,'maps/mount-dora/features.json'))).features;
const report={reviewMode:shelterReview?'shelter-review':'full',viewports:{desktop:shelterReview?null:desktopViewport,phone:{width:390,height:844}},videoRequested:recordVideo,testedSha:process.env.TESTED_SHA||execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim(),workingTreeDirty:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8',windowsHide:true}).trim(),productionRoute:'/game.html',builtAppSha256:hash(fs.readFileSync(path.join(site,'app.js'))),projectSha256:hash(fs.readFileSync(path.join(site,'maps/mount-dora/project.json'))),sourceDigest:project.generation.sourceDigest,physicalPhoneBenchmark:false,checks:[],pages:[]};
const write=()=>fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');
const mark=(name,data={})=>{report.checks.push({name,...data});write();console.log('PASS '+name);};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ogg':'audio/ogg'};
function identity(pid,executable){
  const created=process.platform==='win32'?execFileSync('powershell.exe',['-NoLogo','-NoProfile','-Command',"(Get-CimInstance Win32_Process -Filter 'ProcessId = "+pid+"').CreationDate.ToUniversalTime().ToString('o')"],{encoding:'utf8',windowsHide:true}).trim():execFileSync('ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8'}).trim();
  return {pid,created,creationSource:process.platform==='win32'?'Win32_Process.CreationDate':'ps lstart',executable};
}
async function released(port){return new Promise(resolve=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));s.setTimeout(2000,()=>{s.destroy();resolve(false);});});}
const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;if(p==='/favicon.ico'){res.writeHead(204);return res.end();}
  let file;try{file=path.resolve(site,'.'+decodeURIComponent(p==='/'?'/index.html':p));}catch{res.writeHead(400);return res.end();}
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found');}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
let browserServer,browser,context,phone,port,wsPort,deadline,closing=false;
async function close(){
  if(closing)return;closing=true;clearTimeout(deadline);
  const errors=[];for(const [name,fn]of [['phone',()=>phone?.close()],['context',()=>context?.close()],['browser',()=>browser?.close()],['browserServer',()=>browserServer?.close()]])try{await fn();}catch(e){errors.push({name,error:e.message});}
  server.closeAllConnections();if(server.listening)await new Promise(r=>server.close(r));
  report.cleanup={httpPort:port,httpReleased:port?await released(port):true,wsPort,wsReleased:wsPort?await released(wsPort):true,browserProcessExited:!browserServer||browserServer.process().exitCode!==null||browserServer.process().signalCode!==null,errors};
  fs.writeFileSync(path.join(out,'helper-cleanup.json'),JSON.stringify(report.cleanup,null,2)+'\n');write();
}
function capture(page,name){
  const log={name,errors:[],console:[],requests:[],expectedFailures:[]};report.pages.push(log);
  page.on('pageerror',e=>log.errors.push(e.stack||e.message));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))log.console.push({type:m.type(),text:m.text()});});
  page.on('requestfailed',r=>log.requests.push({url:r.url(),failure:r.failure()?.errorText}));
  page.on('response',r=>{if(r.status()>=400)log.requests.push({url:r.url(),status:r.status()});});return log;
}
const snapshot=page=>page.evaluate(async()=>{const url=document.querySelector('script[src*="app.js"]').src;return (await import(url)).inspectMountDora();});
const projectPoint=(page,town)=>page.evaluate(async town=>{const url=document.querySelector('script[src*="app.js"]').src;return (await import(url)).projectMountDoraTownPoint(town);},town);
async function waitInfo(page,predicate,message,timeout=60000,progress=null){
  const end=Date.now()+timeout;let last,progressValue,progressAt=Date.now();while(Date.now()<end){last=await snapshot(page);if(predicate(last))return last;if(progress){const value=progress(last);if(progressValue===undefined||Math.abs(value-progressValue)>.03){progressValue=value;progressAt=Date.now();}else if(Date.now()-progressAt>30000)throw Error(message+' (no observed movement for 30s): '+JSON.stringify(last));}if(!last.touring){const failure=await page.locator('#tour-launch-status').textContent();if(failure?.startsWith('Could not enter'))throw Error(failure);}await page.waitForTimeout(120);}throw Error(message+': '+JSON.stringify(last));
}
async function shot(page,name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
async function menu(page,label){await page.locator('#menu').click();await page.getByRole('button',{name:label,exact:true}).click();}
async function visit(page,label){await menu(page,'Visit landmark');await page.getByRole('button',{name:label,exact:true}).click();}
const onViewport=(page,p)=>page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('#viewport'),p);
// bindPressHold (mobile-controls.js) turns a press held for 450 ms into a hold that
// opens a picker. A Playwright click sends its up only after the down is acknowledged,
// so one slow SwiftShader frame can make it a hold; send both at once, as the touch
// taps below do.
async function tapButton(page,selector){
  await page.waitForFunction(selector=>{const b=document.querySelector(selector);return !!b&&!b.disabled&&b.getClientRects().length>0;},selector,{timeout:30000}).catch(error=>{throw Error(selector+' never became tappable: '+error.message);});
  const box=await page.locator(selector).boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  assert(await page.evaluate(({selector,x,y})=>!!document.elementFromPoint(x,y)?.closest(selector),{selector,x,y}),selector+' is covered');
  const cdp=await page.context().newCDPSession(page);
  try{await Promise.all([cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1}),cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1})]);}finally{await cdp.detach();}
}
async function panTo(page,town){
  const box=await page.locator('#viewport').boundingBox();
  for(let n=0;n<10;n++){
    const p=await projectPoint(page,town),cx=box.x+box.width*.5,cy=box.y+box.height*.48;
    // Fighters' real-time switches sit over the viewport; tap only where the viewport receives it.
    if(p.visible&&p.x>box.x+90&&p.x<box.x+box.width-90&&p.y>box.y+130&&p.y<box.y+box.height-200&&await onViewport(page,p))return p;
    const dx=Math.max(-box.width*.32,Math.min(box.width*.32,cx-p.x)),dy=Math.max(-box.height*.30,Math.min(box.height*.30,cy-p.y));
    await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+dx,cy+dy,{steps:7});await page.mouse.up();await page.waitForTimeout(120);
  }throw Error('Could not bring actual ground point into the viewport: '+town);
}
// As in the walkthrough: tap the settled projection, and only where the viewport receives it.
async function groundPoint(page,town){
  for(let n=0;n<4;n++){
    await panTo(page,town);
    const settled=await page.evaluate(async town=>{
      const app=await import(document.querySelector('script[src*="app.js"]').src);let previous,stable=0;const start=performance.now();
      while(performance.now()-start<10000){
        await new Promise(requestAnimationFrame);const p=app.projectMountDoraTownPoint(town);
        stable=previous&&Math.hypot(p.x-previous.x,p.y-previous.y)<.12?stable+1:0;
        if(stable>=2)return p;previous=p;
      }
      throw Error('Native camera did not settle before a world-point tap.');
    },town);
    if(await onViewport(page,settled))return settled;
  }
  throw Error('Settled ground point stayed under the real-time HUD: '+town);
}
async function walkTo(page,town,{timeout=process.env.CI?180000:60000,tolerance=.14}={}){
  const p=await groundPoint(page,town);await page.mouse.click(p.x,p.y);
  return waitInfo(page,s=>Math.hypot(s.player.x+.5-town[0],s.player.y+.5-town[1])<tolerance,'Walk did not arrive at '+town,timeout,s=>s.distance);
}
async function ready(page){return waitInfo(page,s=>s.active&&s.touring&&s.ready&&!s.paused,'Production tour did not become ready',90000);}
async function keyboardWalk(page,before){await page.keyboard.down('d');try{await waitInfo(page,s=>s.distance>before.distance+.45,'Actual keyboard movement was not observed',20000);}finally{await page.keyboard.up('d');}return snapshot(page);}
async function assertGL(page){
  const gl=await page.evaluate(inspectWebGL,'#viewport canvas');assert(gl.available&&!gl.contextLost);
  const probe=await page.evaluate(()=>window.__windowNativeProbe?.snapshot()||null);assert(probe&&probe.shaders.length&&probe.shaders.every(s=>s.ok)&&probe.links.every(s=>s.ok),'Native shader evidence missing or failed');return {gl,probe};
}
function routeTo(points,distanceLimit){
  const out=[points[0]];let distance=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),take=Math.min(length,distanceLimit-distance),n=Math.max(1,Math.ceil(take/6));
    for(let j=1;j<=n;j++)out.push([a[0]+(b[0]-a[0])*(take*j/n)/length,a[1]+(b[1]-a[1])*(take*j/n)/length]);distance+=take;if(distance>=distanceLimit-1e-6)break;
  }
  return out.filter((p,i,a)=>i===0||i===a.length-1||Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1])>.55);
}
function observeInputs(){window.__movementInputEvents=[];window.__movementLifecycle=[];for(const type of ['freeze','resume','visibilitychange'])document.addEventListener(type,e=>window.__movementLifecycle.push({type,trusted:e.isTrusted,at:e.timeStamp,visibility:document.visibilityState,elapsed:window.__movementInspect?.().elapsed}),true);for(const type of ['pointerdown','pointermove','pointerup','pointercancel','click'])document.addEventListener(type,e=>{const id=e.target.closest?.('button')?.id||(e.target.closest?.('#joystick')?'joystick':null);if(id)window.__movementInputEvents.push({type,id,pointerId:e.pointerId,pointerType:e.pointerType,isPrimary:e.isPrimary,trusted:e.isTrusted,at:e.timeStamp,tapeIndex:window.__movementFrameTape?.samples.length});},true);}
async function sample(page){return page.evaluate(async()=>{const m=await import(document.querySelector('script[src*="app.js"]').src);return {wall:performance.now(),info:m.inspectMountDora()};});}
async function deploy(page,resume=false){await page.waitForFunction(()=>typeof document.getElementById('deploy')?.onclick==='function');await page.locator(resume?'#resume':'#deploy').click();return ready(page);}
async function zoomCheck(page,name){const initial=await snapshot(page),p=[initial.player.x+.5,initial.player.y+.5],a=await projectPoint(page,p),b=await projectPoint(page,[p[0]+10,p[1]]),before=Math.hypot(a.x-b.x,a.y-b.y),spans=[initial.camera.span];for(let n=0;n<7;n++){await page.locator('#zoom-out').click();await page.waitForTimeout(100);spans.push((await snapshot(page)).camera.span);}const c=await projectPoint(page,p),d=await projectPoint(page,[p[0]+10,p[1]]),after=Math.hypot(c.x-d.x,c.y-d.y),info=await snapshot(page);for(let n=1;n<spans.length;n++)assert(spans[n]>spans[n-1]+.05);assert(after<before*.35);assert(info.camera.span>40);assert(info.render.blocks<=25&&info.source.stats.peakDecoded<=9&&info.source.stats.peakFetches<=2);await shot(page,name+'-zoom');mark(name+' actual projected zoom extent grows with bounded residency',{spans,projectedPixelsBefore:before,projectedPixelsAfter:after,blocks:info.render.blocks});}
// The town camera looks due north (grenade-controls.js TOWN_CAMERA x=0), so the
// stick's screen axes are the town axes: push it straight along the entrance.
const entrance=features.find(f=>f.id==='osm-way-548471563').geometry.coordinates,dx=entrance[1][0]-entrance[0][0],dy=entrance[1][1]-entrance[0][1],length=Math.hypot(dx,dy),direction={x:dx/length,y:dy/length},input=direction;
// Fighters paces are Run (default) and Sneak at half pace; there is no Walk. Every
// stroke starts from the Sneak fixture with the SNEAK switch lit; a held-stick tap
// on it returns to Run. Under SwiftShader the denser Fighters town drops to 1-12
// frames a second once the actor moves, so the tape is armed before the touch and
// the measurement starts at the first frame that moves in the requested mode:
// recording after the tap's round trips let Run spend most of the straight
// boardwalk before the first frame.
async function stroke(page,ctx,mode,label,throttle=1){
  const cdp=await ctx.newCDPSession(page),running=mode==='run',sneak=page.locator('#movement-cycle');let touched=false,recorded=false;
  try{
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:throttle});
    const settling=(await snapshot(page)).frames;await waitInfo(page,s=>s.frames>=settling+3,'Native shader/input settling frames',30000);
    const atRest=await snapshot(page);assert(atRest.player.sneaking&&!atRest.player.running);assert.equal(await sneak.getAttribute('aria-pressed'),'true');
    const stick=await page.locator('#joystick').boundingBox(),centre={x:stick.x+stick.width/2,y:stick.y+stick.height/2},point={id:1,x:centre.x+stick.width*.3*input.x,y:centre.y+stick.width*.3*input.y},button=running?await sneak.boundingBox():null;
    await page.evaluate(startMovementFrameTape);
    touched=true;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...centre}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]});
    assert((await snapshot(page)).input.stickHeld);
    if(running){
      // CDP sends remain ordered; do not turn a quick tap into a hold while waiting for a slow down acknowledgement.
      const tap={id:2,x:button.x+button.width/2,y:button.y+button.height/2};await Promise.all([cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point,tap]}),cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[tap]})]);
      await waitInfo(page,s=>s.player.running&&!s.player.sneaking&&s.input.stickHeld,'Run tap cancelled the held joystick',20000);assert.equal(await sneak.getAttribute('aria-pressed'),'false');
    }
    const pointerEvents=await page.evaluate(()=>window.__movementInputEvents);if(running)assert(pointerEvents.some(e=>e.id==='movement-cycle'&&e.type==='pointerup'&&e.pointerType==='touch'&&e.isPrimary===false&&e.trusted));
    // The first frame that moved, joystick held, in the requested mode; then at least
    // two more frames and 850 ms. Every sliced frame must keep that mode (measureMovementFrames).
    await page.waitForFunction(running=>{
      const s=window.__movementFrameTape.samples,first=s.findIndex((f,i)=>i>0&&f.stickHeld&&f.running===running&&f.distance>s[i-1].distance);
      return first>=0&&s.length>=first+3&&s.at(-1).rafAt-s[first].rafAt>=850;
    },running,{timeout:30000});
    const {before,after,samples}=await page.evaluate(()=>window.__movementFrameTape.stop());
    // A stall cannot be sliced away. The touch starts at the stick's centre (no
    // deflection, no movement); the first joystick pointermove records the tape index
    // it arrived before, and the actor must move on that frame or the next. A Run tap
    // must likewise take effect on the frame its flag appears or the next.
    const deflection=pointerEvents.find(e=>e.type==='pointermove'&&e.id==='joystick'&&e.pointerType==='touch'&&e.trusted&&Number.isInteger(e.tapeIndex));
    const moved=deflection?samples.findIndex((f,i)=>i>0&&i>=deflection.tapeIndex&&f.stickHeld&&f.distance>samples[i-1].distance):-1;
    const entry=samples.findIndex((f,i)=>i>0&&i>=Math.max(moved,0)&&f.stickHeld&&f.running===running),first=samples.findIndex((f,i)=>i>0&&f.stickHeld&&f.running===running&&f.distance>samples[i-1].distance),last=samples.findIndex((f,i)=>i>=first+2&&f.rafAt-samples[first].rafAt>=850);
    const observed=samples.slice(first,last+1),expected=running?14.4:7.2,wallSeconds=(observed.at(-1).rafAt-observed[0].rafAt)/1000,straight=p=>length-((p.x+.5-entrance[0][0])*direction.x+(p.y+.5-entrance[0][1])*direction.y);
    // Persist the raw tape before assertions so failed CI retains every frame gap.
    const measurement={label,expected,throttle,before,after,wallSeconds,remainingStraightMetres:straight(observed[0].player),remainingStraightMetresAtEnd:straight(observed.at(-1).player),deflectionFrame:deflection?.tapeIndex??null,firstMovingFrame:moved,modeFrame:entry,firstMeasuredFrame:first,tape:samples,observed};(report.measurements||=[]).push(measurement);recorded=true;write();
    assert(deflection,'No trusted joystick pointermove reached the page');
    assert(moved>=0&&moved-deflection.tapeIndex<=1,`Actor did not move within one frame of the stick deflection: frames ${deflection.tapeIndex} to ${moved}`);
    assert(first-entry<=1,`Actor did not move within one frame of entering ${mode}: frames ${entry} to ${first}`);
    assert(measurement.remainingStraightMetresAtEnd>0,'Measurement ran past the straight boardwalk');
    Object.assign(measurement,measureMovementFrames(observed,expected));write();
    mark(label+' native frame budget and actor frustum',{...measurement,before:undefined,after:undefined,tape:undefined,pointerEvents,wallSpeed:measurement.travel/wallSeconds});return after.info;
  }catch(error){
    // Keep the frames of a stroke that failed before its measurement was recorded.
    if(!recorded){const tape=await page.evaluate(()=>window.__movementFrameTape?.stop()??null).catch(()=>null);(report.measurements||=[]).push({label,failed:true,error:error.message,tape});write();}
    throw Object.assign(Error(label+': '+error.message),{cause:error});
  }finally{await page.evaluate(()=>window.__movementFrameTape?.stop());if(touched)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();}
}
async function resetSaved(page){await page.reload();return deploy(page,true);}
// The injected save must be the one that resumes: its exact position, the lit Sneak
// switch and zero stamina. Stamina is off game-wide (movement-runtime.md) and only the
// turn-based tick refills it, so the zero survives a real-time resume; revisit this
// when stamina returns.
function assertFixture(info,saved){
  assert(Math.hypot(info.player.x-saved.x,info.player.y-saved.y)<1e-6,'Fixture position was not restored');
  assert(info.player.sneaking&&!info.player.running,'Sneak fixture was not restored');
  assert.equal(info.player.stamina,0,'Exhausted fixture was not restored');return info;
}
async function timingReview(page,ctx){let info=await snapshot(page);await page.locator('#menu').click();let paused=await snapshot(page);await page.waitForTimeout(1400);let after=await snapshot(page);assert.equal(after.elapsed,paused.elapsed);assert.equal(after.distance,paused.distance);await page.getByRole('button',{name:'Continue operation',exact:true}).click();after=await waitInfo(page,s=>!s.paused&&s.frames>paused.frames,'Pause resume did not render');assert(after.elapsed-paused.elapsed<1);const cdp=await ctx.newCDPSession(page);await page.evaluate(async()=>{window.__movementInspect=(await import(document.querySelector('script[src*="app.js"]').src)).inspectMountDora;});const background=await sample(page);await cdp.send('Page.setWebLifecycleState',{state:'frozen'});await new Promise(r=>setTimeout(r,1400));await cdp.send('Page.setWebLifecycleState',{state:'active'});const resumed=await sample(page),lifecycle=await page.evaluate(()=>window.__movementLifecycle),freeze=lifecycle.find(e=>e.type==='freeze'&&e.at>=background.wall),resume=lifecycle.find(e=>e.type==='resume'&&freeze&&e.at>=freeze.at);assert.equal(resumed.info.distance,background.info.distance);if(freeze&&resume){assert.equal(resume.elapsed,freeze.elapsed,'Simulation cannot advance between lifecycle boundary events');const active=Math.max(0,freeze.at-background.info.renderedAt)/1000+Math.max(0,resumed.info.renderedAt-resume.at)/1000;assert(resumed.info.elapsed-background.info.elapsed<=active+.08,'Frozen wall time must not be simulated');report.nativeBackground={verified:true,freeze,resume,active,elapsed:resumed.info.elapsed-background.info.elapsed};}else report.nativeBackground={verified:false,reason:'This headless lifecycle command did not emit document freeze/resume events; real dialog pause is verified, hidden/blur/loading/freeze handlers are covered by controlled clock regressions.',lifecycle};await cdp.detach();info=resumed.info;mark('real dialog pause excludes suspended wall time',{pausedSeconds:1.4,backgroundSeconds:1.4,position:info.player});}
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});port=server.address().port;
  browserServer=await chromium.launchServer({host:'127.0.0.1',headless:true,...(process.env.WALKTHROUGH_BROWSER_CHANNEL?{channel:process.env.WALKTHROUGH_BROWSER_CHANNEL}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  browser=await chromium.connect(browserServer.wsEndpoint());wsPort=Number(new URL(browserServer.wsEndpoint()).port);report.browser=browser.version();
  const child=browserServer.process(),record={owner:process.env.CODEX_THREAD_ID||'farmyard/mount-dora-walkthrough',purpose:'Measured movement, Run, zoom and pause acceptance',project:root,runner:identity(process.pid,process.execPath),browser:identity(child.pid,child.spawnfile),ports:[port,wsPort],startedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+15*60*1000).toISOString(),stopMethod:'Owning browser/server APIs in finally; fifteen-minute automatic retirement',restart:{executable:process.execPath,args:['tools/test-movement-runtime.mjs',...process.argv.slice(2)],script:'tools/test-movement-runtime.mjs',cwd:root,environment:{CI:process.env.CI?'true':undefined,WALKTHROUGH_BROWSER_CHANNEL:process.env.WALKTHROUGH_BROWSER_CHANNEL||undefined,WALKTHROUGH_VIDEO:recordVideo?'1':'0'},runtime:'Node >=24; locked Playwright1.64.1; Chromium or WALKTHROUGH_BROWSER_CHANNEL',inputs:['dist/','locked sites/tactical-animal/browser-tests package'],outputs:out}};
  fs.writeFileSync(path.join(out,'helper.json'),JSON.stringify(record,null,2)+'\n');
  deadline=setTimeout(()=>{report.timeout=true;process.exitCode=1;void close();},15*60*1000);deadline.unref();
  const origin='http://127.0.0.1:'+port;
  fs.writeFileSync(path.join(out,'server-url.json'),JSON.stringify({origin,expiresAt:record.expiresAt,owner:record.owner,route:'/game.html?activity=mount-dora'})+'\n');
  console.log('NATIVE_REVIEW_URL '+origin+'/game.html?activity=mount-dora');
  context=await browser.newContext({viewport:{width:800,height:600},hasTouch:true,deviceScaleFactor:1});await context.addInitScript(installNativeProbe);await context.addInitScript(observeInputs);const page=await context.newPage(),log=capture(page,'desktop');await page.goto(origin+'/game.html?activity=mount-dora');await deploy(page);await walkTo(page,[460.5,508.5]);mark('real ground route reaches the independently clear street approach');
  await tapButton(page,'#movement-cycle');await page.waitForFunction(()=>document.getElementById('movement-cycle').getAttribute('aria-pressed')==='true'||document.getElementById('control-picker').open);assert.equal(await page.evaluate(()=>document.getElementById('control-picker').open),false,'SNEAK tap became a hold');
  await waitInfo(page,s=>s.player.sneaking&&!s.player.running&&s.player.speed===7.2,'SNEAK switch did not halve the standing Run pace',20000);await visit(page,'Palm Island entrance');await waitInfo(page,s=>!s.paused&&Math.hypot(s.player.x-(entrance[0][0]-.5),s.player.y-(entrance[0][1]-.5))<.05,'Boardwalk approach');await page.waitForFunction(([key,p])=>{const text=localStorage.getItem(key);if(!text)return false;const s=JSON.parse(text);return s.player.sneaking===true&&Math.hypot(s.player.x-p[0],s.player.y-p[1])<.05;},[TOUR_SAVE,[entrance[0][0]-.5,entrance[0][1]-.5]],{timeout:10000});const fixture=await page.evaluate(key=>{const p=JSON.parse(localStorage.getItem(key));p.player.stamina=0;return JSON.stringify(p);},TOUR_SAVE),fixturePlayer=JSON.parse(fixture).player;report.exhaustedFixture={position:fixturePlayer,source:'Reached through production ground/landmark controls with the production SNEAK switch on; only saved stamina set to zero.'};await context.addInitScript(([key,save])=>localStorage.setItem(key,save),[TOUR_SAVE,fixture]);
  for(const [mode,label,throttle]of [['sneak','desktop-sneak',1],['run','desktop-run-held-tap',1],['run','desktop-low-fps-run',2]]){assertFixture(await resetSaved(page),fixturePlayer);await stroke(page,context,mode,label,throttle);await shot(page,label);}
  await zoomCheck(page,'desktop');await timingReview(page,context);report.desktopWebGL=await assertGL(page);await context.close();context=null;
  phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});await phone.addInitScript(installNativeProbe);await phone.addInitScript(observeInputs);await phone.addInitScript(([key,save])=>localStorage.setItem(key,save),[TOUR_SAVE,fixture]);const mobile=await phone.newPage();capture(mobile,'phone');await mobile.goto(origin+'/game.html?activity=mount-dora');assertFixture(await deploy(mobile,true),fixturePlayer);await stroke(mobile,phone,'run','phone-run-held-tap');await shot(mobile,'phone-run');await zoomCheck(mobile,'phone');report.phoneWebGL=await assertGL(mobile);
  for(const l of report.pages){assert.deepEqual(l.errors,[]);assert.deepEqual(l.requests,[]);assert.deepEqual(l.console.filter(x=>x.type==='error'),[]);}report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;for(const [i,c]of (browser?.contexts()||[]).entries())for(const [j,p]of c.pages().entries())try{await p.screenshot({path:path.join(out,'failure-'+i+'-'+j+'.png')});report.failureUI=await p.evaluate(()=>({toast:document.getElementById('toast')?.textContent,loading:document.getElementById('loading')?.textContent,status:document.getElementById('tour-launch-status')?.textContent}));}catch{}write();throw error;}
finally{await close();if(!report.cleanup.httpReleased||!report.cleanup.wsReleased||!report.cleanup.browserProcessExited||report.cleanup.errors.length)process.exitCode=1;}
