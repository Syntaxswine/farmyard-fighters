import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {installNativeProbe,inspectWebGL} from '../sites/tactical-animal/browser-tests/native-probe.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),site=path.join(root,'dist'),out=path.join(root,'artifacts/realtime/native');
fs.mkdirSync(out,{recursive:true});
const {chromium}=await import(pathToFileURL(path.join(root,'sites/tactical-animal/browser-tests/node_modules/playwright/index.mjs')).href);
const report={owner:'farmyard-fighters/first-encounter',startedAt:new Date().toISOString(),checks:[],pages:[],helpers:[]};
const save=()=>fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');
const mark=(name,data={})=>{report.checks.push({name,...data});save();console.log('PASS '+name);};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.ogg':'audio/ogg','.wav':'audio/wav'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),name=url.pathname==='/'?'/index.html':url.pathname;
 let file;try{file=path.resolve(site,'.'+decodeURIComponent(name));}catch{res.writeHead(400);return res.end();}
 if(name==='/favicon.ico'){res.writeHead(204);return res.end();}
 if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found');}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
const released=port=>new Promise(resolve=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));s.setTimeout(1500,()=>{s.destroy();resolve(false);});});
const identity=(pid,executable)=>({pid,executable,created:process.platform==='win32'?execFileSync('powershell.exe',['-NoLogo','-NoProfile','-Command',`(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CreationDate.ToUniversalTime().ToString('o')`],{encoding:'utf8',windowsHide:true}).trim():execFileSync('ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8'}).trim()});
let browserServer,browser,port,wsPort,deadline,closing=false,activePage;
async function close(){
 if(closing)return;closing=true;clearTimeout(deadline);const errors=[];
 for(const [name,fn]of [['browser',()=>browser?.close()],['browserServer',()=>browserServer?.close()]])try{await fn();}catch(e){errors.push({name,message:e.message});}
 server.closeAllConnections();if(server.listening)await new Promise(r=>server.close(r));
 report.cleanup={httpPort:port,httpReleased:!port||await released(port),wsPort,wsReleased:!wsPort||await released(wsPort),browserProcessExited:!browserServer||browserServer.process().exitCode!==null||browserServer.process().signalCode!==null,errors};
 fs.writeFileSync(path.join(out,'helper-cleanup.json'),JSON.stringify(report.cleanup,null,2)+'\n');save();
}
const snapshot=page=>page.evaluate(async()=>{const url=document.querySelector('script[src*="app.js"]').src;return (await import(url)).inspectRealtime();});
const townSnapshot=page=>page.evaluate(async()=>{const url=document.querySelector('script[src*="app.js"]').src;return (await import(url)).inspectMountDora();});
const project=(page,point)=>page.evaluate(async point=>{const url=document.querySelector('script[src*="app.js"]').src;return (await import(url)).projectRealtimePoint(point);},point);
async function wait(page,predicate,label,timeout=20000,read=snapshot){const end=Date.now()+timeout;let last;while(Date.now()<end){last=await read(page);if(predicate(last))return last;if(last.status==='lost')throw Error('Encounter lost while '+label+': '+JSON.stringify(last));await page.waitForTimeout(100);}throw Error(label+': '+JSON.stringify(last));}
const audioBytes=id=>fs.statSync(path.join(site,'assets/audio/weapon-sfx',id+'.wav')).size;
async function waitForShotAudio(page,id){
  await page.waitForFunction(bytes=>window.__windowNativeProbe.snapshot().audio.some(context=>
    context.decoded.some(clip=>clip.bytes===bytes&&clip.rms>0&&context.starts.some(voice=>
      voice.duration===clip.duration&&voice.state==='running'&&voice.userGestureSeen))
  ),audioBytes(id),{timeout:10000});
}
async function tap(page,selector,phone){if(phone){const b=await page.locator(selector).boundingBox();await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}else await page.locator(selector).click();}
async function pointClick(page,point){
 // Wait for the real follow/zoom camera and never click a HUD switch that
 // happens to cover the requested ground point's screen projection.
 for(let i=0;i<11;i++){
  const p=await page.evaluate(async point=>{
   const app=await import(document.querySelector('script[src*="app.js"]').src);let previous,stable=0,p;
   const end=performance.now()+10000;
   while(performance.now()<end){await new Promise(requestAnimationFrame);p=app.projectRealtimePoint(point);if(p&&previous&&Math.hypot(p.x-previous.x,p.y-previous.y)<.12)stable++;else stable=0;if(stable>=2)return p;previous=p;}return p;
  },point);
  const clear=p?.visible&&await page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('#viewport'),p);
  if(clear){await page.mouse.click(p.x,p.y);return;}
  await page.locator('#zoom-out').click();
 }
 throw Error('Requested ground point has no unobstructed screen projection: '+JSON.stringify(point));
}
async function moveTo(page,point){await pointClick(page,{...point,h:0});return wait(page,s=>Math.hypot(s.player.x-point.x,s.player.y-point.y)<.4,'walk to '+JSON.stringify(point),25000);}
async function screenshot(page,name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
async function resumeTownAt(page,point){
  await page.locator('#menu').click();await page.reload();
  await page.evaluate(point=>{
    const key='farmyard-fighters:farmyard-mount-dora-tour-v1',save=JSON.parse(localStorage.getItem(key));
    Object.assign(save.player,point);localStorage.setItem(key,JSON.stringify(save));
  },point);
  await page.locator('#resume').click();
}
function capture(page,name){const log={name,errors:[],requests:[]};report.pages.push(log);page.on('pageerror',e=>log.errors.push(e.stack||String(e)));page.on('response',r=>{if(r.status()>=400)log.requests.push({url:r.url(),status:r.status()});});return log;}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;
 report.helpers.push({...identity(process.pid,process.execPath),purpose:'Temporary production static server and acceptance driver',port,source:'tools/test-realtime.mjs',cwd:root,expiry:'10 minutes maximum; earlier on test completion',stop:'finally closes browser and HTTP server'});save();
 deadline=setTimeout(()=>{report.failure='Acceptance deadline expired';void close().finally(()=>process.exit(1));},600000);
 browserServer=await chromium.launchServer({host:'127.0.0.1',headless:true,...process.env.REALTIME_BROWSER_CHANNEL?{channel:process.env.REALTIME_BROWSER_CHANNEL}:{},args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 wsPort=Number(new URL(browserServer.wsEndpoint()).port);report.helpers.push({...identity(browserServer.process().pid,'Chromium'),purpose:'Disposable headless native browser',port:wsPort,expiry:'Current acceptance only',stop:'browserServer.close()'});save();browser=await chromium.connect(browserServer.wsEndpoint());
 {
  const context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage(),log=capture(page,'mount-dora');activePage=page;
  await context.addInitScript(installNativeProbe);await page.goto(`http://127.0.0.1:${port}/game.html?activity=mount-dora`);
  assert.equal(await page.locator('#operation-select').inputValue(),'mount-dora');await page.locator('#deploy').click();
  const start=await wait(page,s=>s.ready,'Mount Dora renderer',90000);
  assert.equal(start.guards.length,42);assert.equal(start.contacts.length,0);assert.equal(start.guardSight.length,0);
  assert.deepEqual(new Set(start.guards.map(g=>g.weapon)),new Set(['pistol','smg','rifle','shotgun']));
  assert(start.guards.every(g=>g.maxHp===Math.round(start.player.hp/2)&&g.firearms===Math.round(start.player.stats.firearms/2)));
  assert(start.guards.some(g=>g.patrolPoints===2)&&start.guards.some(g=>g.patrolPoints>2));
  const zoomOut=page.getByRole('button',{name:'Zoom out',exact:true}),zoomIn=page.getByRole('button',{name:'Zoom in',exact:true});
  const [outBox,inBox]=await Promise.all([zoomOut.boundingBox(),zoomIn.boundingBox()]);
  assert(outBox&&inBox&&outBox.y<inBox.y);
  const defaultSpan=(await townSnapshot(page)).camera.span;
  assert(Math.abs(defaultSpan-18.72)<.001);
  await zoomOut.click();
  const widerSpan=(await townSnapshot(page)).camera.span;
  assert(Math.abs(widerSpan-22.464)<.001);
  await zoomIn.click();
  assert(Math.abs((await townSnapshot(page)).camera.span-widerSpan*.83)<.001);
  mark('Mount Dora starts two steps wider with Zoom Out above Zoom In');
  const sneak=page.getByRole('button',{name:'Sneak',exact:true});
  assert.equal(await sneak.getAttribute('aria-pressed'),'false');
  assert.equal(await sneak.getAttribute('data-stealth'),'clear');
  const layout=await page.evaluate(async()=>{
    const app=await import(document.querySelector('script[src*="app.js"]').src),town=app.inspectMountDora(),p=town.player;
    const center=app.projectRealtimePoint(p),east=app.projectRealtimePoint({...p,x:p.x+3}),north=app.projectRealtimePoint({...p,y:p.y-3});
    return {plants:town.render.plantModels,center,east,north};
  });
  assert(layout.plants>0);assert(layout.east.x>layout.center.x&&Math.abs(layout.east.y-layout.center.y)<.001);
  assert(layout.north.y<layout.center.y&&Math.abs(layout.north.x-layout.center.x)<.001);
  mark('Mount Dora loads AFT plants, mixed half-strength sentries and a north-up field camera',{plants:layout.plants,guards:start.guards.length});
  await page.locator('#menu').click();
  await page.getByRole('button',{name:'Visit landmark',exact:true}).click();
  await page.getByRole('button',{name:'Palm Island boardwalk',exact:true}).click();
  const forest=await wait(page,t=>t.ready&&!t.paused&&t.player.ground==='bridge'&&t.render?.plantModels>100,'Mount Dora woodland brush and boardwalk',90000,townSnapshot);
  assert(forest.render.plantBatches>0&&forest.render.plantBatches<forest.render.plantModels);
  assert(forest.actor.visible);assert.equal(forest.memory.shaderFailures,0);
  await screenshot(page,'mount-dora-woods');mark('Mount Dora streams dense batched forest around the real boardwalk',{plants:forest.render.plantModels,batches:forest.render.plantBatches});

  // A clear brush approach northeast of the B06 patrol and directly in line with
  // an authored trunk. Resume with the normal save and use real controls.
  const woodlandGuard=s=>s.guards.find(g=>g.id===32);
  await resumeTownAt(page,{x:431.5,y:1381,stance:'prone',sneaking:false,running:true});
  const inBrush=await wait(page,s=>s.ready&&!s.paused&&woodlandGuard(s).moving,'Mount Dora woodland patrol',90000);
  assert.equal(inBrush.player.stance,'prone');assert(!woodlandGuard(inBrush).alert);
  let slid;
  await page.keyboard.down('a');
  try{
    slid=await wait(page,s=>s.player.x<429.75,'Mount Dora crawls past a head-on tree',20000);
  }finally{await page.keyboard.up('a');}
  assert(Math.abs(slid.player.y-1381)>.44,'The player must actually move sideways around the trunk');
  assert(!woodlandGuard(slid).alert,JSON.stringify({player:slid.player,guard:woodlandGuard(slid)}));
  await page.locator('#stance-cycle').click();
  const crouched=await wait(page,s=>s.elapsed>slid.elapsed+1&&s.player.stance==='kneeling','Mount Dora crouches in brush');
  assert(!woodlandGuard(crouched).alert);assert.equal(crouched.player.hp,inBrush.player.hp);
  assert.equal(await sneak.getAttribute('data-stealth'),'brush');
  assert.equal(await page.locator('#sneak-indicator').textContent(),'BRUSH');
  assert.equal(await page.locator('#sneak-status').textContent(),'Brush concealment.');
  await sneak.screenshot({path:path.join(out,'sneak-brush.png')});
  await page.locator('#stance-cycle').click();
  await page.locator('#movement-cycle[data-stealth="spotted"]').waitFor({timeout:45000});
  const exposed=await snapshot(page);
  assert.equal(exposed.player.stance,'standing');assert(woodlandGuard(exposed).alert);
  assert.equal(await page.locator('#sneak-indicator').textContent(),'SEEN');
  mark('Mount Dora Sneak reports brush cover and direct sight while held movement slides around trunks');

  // Normal checkpoints supply clear approaches to the authored street patrol
  // and B03 post. The game loads and advances the actual map and roster.
  const patrol=start.guards.find(g=>g.id===2);
  await resumeTownAt(page,{x:305,y:126});
  await wait(page,s=>s.ready&&s.guards.some(g=>g.id===patrol.id&&!g.alert&&Math.hypot(g.x-patrol.x,g.y-patrol.y)>2),'Mount Dora sentry walks its sidewalk patrol',30000);
  mark('Mount Dora runs the authored sidewalk patrol in the browser');
  const sentry=start.guards.find(g=>g.id===14);
  await resumeTownAt(page,{x:356,y:605});
  await wait(page,s=>s.ready&&s.guardSight.includes(sentry.id)&&s.guards.find(g=>g.id===sentry.id).ammo.pistol<sentry.ammo.pistol,'Mount Dora sentry returns fire with a visible sight outline',30000);
  await screenshot(page,'mount-dora-guard-sight');
  await page.locator('#end-turn').click();
  const won=await wait(page,s=>s.kills===1&&s.objects.some(o=>o.id==='body:'+sentry.id),'Mount Dora Fire at Will defeats the sentry',25000);
  assert(!won.guardSight.includes(sentry.id));assert(won.ammo<start.ammo);await screenshot(page,'mount-dora-sentry');
  mark('Mount Dora draws the detected sentry sight outline until the sentry falls');
  await page.locator('#menu').click();await page.reload();await page.locator('#resume').click();
  const resumed=await wait(page,s=>s.ready,'Mount Dora combat checkpoint',90000);
  assert.equal(resumed.kills,1);assert.equal(resumed.guards.find(g=>g.id===sentry.id).hp,0);
  assert(resumed.objects.some(o=>o.id==='body:'+sentry.id));assert.equal(resumed.ammo,won.ammo);
  mark('Mount Dora uses production return fire, Fire at Will, body registration and casualty persistence');
  assert.equal(log.errors.length,0,JSON.stringify(log.errors));assert.equal(log.requests.length,0,JSON.stringify(log.requests));await context.close();
 }
 for(const phone of [false,true]){
  const name=phone?'phone':'desktop',context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:800,height:600},isMobile:phone,hasTouch:phone,deviceScaleFactor:1});
  await context.addInitScript(installNativeProbe);const page=await context.newPage(),log=capture(page,name);activePage=page;
  await page.goto(`http://127.0.0.1:${port}/game.html`);assert.equal(await page.locator('#operation-select').inputValue(),'quiet-shift');assert.equal(await page.locator('#operation-select option').count(),6);
  const loadoutMode=page.locator('#loadout-fire-mode');assert.equal(await loadoutMode.inputValue(),'auto');
  if(phone)await loadoutMode.selectOption('single');
  await page.locator('#animals button').filter({hasText:'Yakov'}).click();await page.locator('#utility button').filter({hasText:'Frag grenades'}).click();await page.locator('#deploy').click();
  let s=await wait(page,s=>s.ready,'initial renderer');
  assert.equal(s.fireMode,phone?'single':'auto');assert.equal(s.autoFire,false);assert.equal(s.phase,'explore');assert.equal(s.shaderFailures,0);await screenshot(page,name+'-start');
  const gl=await page.evaluate(inspectWebGL,'#viewport canvas');assert(gl.available&&!gl.contextLost);mark(name+' full production bootstrap',{gl,operations:6,guards:s.guards.filter(g=>g.hp>0).length});
  await tap(page,'#realtime-aim',phone);assert.equal((await snapshot(page)).aim,'aimed');await tap(page,'#realtime-aim',phone);assert.equal((await snapshot(page)).aim,'full');await tap(page,'#realtime-aim',phone);
  await tap(page,'#end-turn',phone);assert((await snapshot(page)).autoFire);await tap(page,'#end-turn',phone);assert(!(await snapshot(page)).autoFire);mark(name+' persistent aim and fire-at-will controls');
  await tap(page,'#menu',phone);const paused=await snapshot(page);await page.waitForTimeout(250);assert.equal((await snapshot(page)).elapsed,paused.elapsed);await page.getByRole('button',{name:'Continue operation',exact:true}).click();mark(name+' inventory/options pause the actual simulation');
  await tap(page,'#menu',phone);await page.getByRole('button',{name:'Fire control: mode, aim & target priority',exact:true}).click();await page.getByRole('button',{name:'Target: Weakest',exact:true}).click();
  await page.getByRole('button',{name:'Return to operation',exact:true}).click();
  assert.equal((await snapshot(page)).priority,'weakest');
  const weapons=await page.locator('#weapons').boundingBox(),aim=await page.locator('#realtime-aim').boundingBox(),stickBox=await page.locator('#joystick').boundingBox();
  assert(weapons&&aim&&stickBox&&weapons.x>=aim.x+aim.width&&weapons.y+weapons.height<=stickBox.y);
  if(phone)assert(weapons.height>=44);
  await tap(page,'#weapons',phone);
  assert(await page.getByRole('heading',{name:'Weapons.',exact:true}).isVisible());
  const modePaused=(await snapshot(page)).elapsed;
  await page.getByRole('button',{name:'3-round burst',exact:true}).click();
  s=await snapshot(page);assert.equal(s.elapsed,modePaused);assert.equal(s.fireMode,'burst');assert(s.paused);
  if(phone)await screenshot(page,'phone-weapons');
  await page.getByRole('button',{name:'Return to operation',exact:true}).click();
  mark(name+' loadout fire mode and independent Weapons button');
  if(!phone){
    // Automatic defence must already be armed when the deliberate point shot
    // alerts the guards, including while a slow renderer handles later controls.
    await page.locator('#end-turn').click();assert((await snapshot(page)).autoFire);
    // Real point-fire controls create a reload opportunity without injecting state.
    await page.locator('#weapons').click();await page.getByRole('button',{name:'Aim firearm at a point',exact:true}).click();await pointClick(page,{x:5,y:20,h:1.1});
    assert.equal(await page.locator('[data-control="burst"]').getAttribute('aria-pressed'),'true');
    assert(await page.locator('[data-control="single"]').isVisible());
    await page.locator('[data-control="auto"]').click();
    const fire=page.locator('[data-control="fire"]'),box=await fire.boundingBox();
    assert(await fire.isEnabled());await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    try{s=await wait(page,s=>s.triggerHeld&&s.ammo<=27&&s.lastDischarge?.weapon==='assault','held full-auto point fire');}
    finally{await page.mouse.up();}
    assert(!(await snapshot(page)).triggerHeld);assert.equal(s.fireMode,'auto');
    assert(s.lastDischarge.tracerVertices>0&&s.lastDischarge.fromMuzzle&&s.lastDischarge.flash&&s.lastDischarge.pose,JSON.stringify(s.lastDischarge));
    await waitForShotAudio(page,'ak47-shot');
    mark('the held full-auto trigger spends several rounds with native sound and tracer feedback',s.lastDischarge);
    await page.locator('#weapons').click();s=await snapshot(page);const reserveBefore=s.reserve,automaticReload=s.reloading;
    // A slow native runner can spend the whole magazine before opening Weapons.
    // Resume its automatic reload; the dialog pauses that same timed operation.
    if(automaticReload)await page.getByRole('button',{name:'Return to operation',exact:true}).click();
    else await page.getByRole('button',{name:/^Reload AK-47/}).click();
    s=await wait(page,s=>s.reloading,'timed reload');assert(s.ammo<30);const before=s.player;
    await page.keyboard.down('a');try{s=await wait(page,s=>Math.hypot(s.player.x-before.x,s.player.y-before.y)>.1,'held movement during reload',8000);}finally{await page.keyboard.up('a');}await screenshot(page,'desktop-reload-moving');await wait(page,s=>!s.reloading&&s.reserve<reserveBefore,'completed reload');mark('desktop real shot, timed reload, reserve consumption and movement',{automaticReload});
    // The point shot already alerted the guards. Hold the covered arrival area
    // and let them approach; pause immediately after the automatic engagement.
    s=await wait(page,s=>s.kills>0||s.ammo<30,'automatic engagement',25000);assert(s.autoFire);assert.notEqual(s.phase,'enemy');await page.locator('#menu').click();await screenshot(page,'desktop-fire-at-will');mark('desktop fire at will in authored encounter',{ammo:s.ammo,kills:s.kills,phase:s.phase});
    await page.getByRole('button',{name:'Choose operation, animal & loadout',exact:true}).click();assert.equal(await page.locator('#resume').isVisible(),true);await page.locator('#resume').click();s=await wait(page,s=>s.ready,'saved encounter');assert(s.autoFire);assert.equal(s.fireMode,'auto');assert(!s.triggerHeld);mark('desktop real operation save/resume');
  }else{
    const original=await snapshot(page),sneak=page.getByRole('button',{name:'Sneak',exact:true});
    await tap(page,'#movement-cycle',true);assert((await snapshot(page)).player.sneaking);assert.equal(await sneak.getAttribute('aria-pressed'),'true');
    await tap(page,'#movement-cycle',true);assert(!(await snapshot(page)).player.sneaking);assert.equal(await sneak.getAttribute('aria-pressed'),'false');
    const stick=await page.locator('#joystick').boundingBox(),cx=stick.x+stick.width/2,cy=stick.y+stick.height/2,cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-25,y:cy+8}]});try{s=await wait(page,s=>Math.hypot(s.player.x-original.player.x,s.player.y-original.player.y)>.1,'held phone movement',8000);}finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}mark('phone actual touch movement and sneak');
    // Aim north in world space, using the same native stick controls as a player.
    await tap(page,'#grenade',true);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+49,y:cy-59}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const button=page.locator('#grenade');assert.equal(await button.isDisabled(),false);await tap(page,'#grenade',true);s=await wait(page,s=>s.player.ammo.grenade===2,'real touch grenade throw');await waitForShotAudio(page,'explosion-large');await screenshot(page,'phone-grenade');mark('phone real grenade aim, release and confirmation');await cdp.detach();
  }
  assert.equal(log.errors.length,0,JSON.stringify(log.errors));assert.equal(log.requests.length,0,JSON.stringify(log.requests));await context.close();
 }
 // A separate real loadout must auto-fire flame without entering manual cone aim.
 {
  const context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage(),log=capture(page,'flamethrower');activePage=page;
  await context.addInitScript(installNativeProbe);await page.goto(`http://127.0.0.1:${port}/game.html`);
  await page.locator('#animals button').filter({hasText:'Yakov'}).click();await page.getByRole('button',{name:'Backpack flamethrower',exact:true}).click();assert(await page.locator('#loadout-fire-mode').isHidden());await page.locator('#deploy').click();
  let s=await wait(page,s=>s.ready,'flamethrower renderer');assert(s.automatic);assert.equal(await page.locator('#realtime-aim').isDisabled(),true);assert.equal(await page.locator('#realtime-aim-label').textContent(),'AREA FIRE');assert.equal(await page.locator('#end-turn').isDisabled(),false);await page.locator('#end-turn').click();assert((await snapshot(page)).autoFire);
  await page.evaluate(()=>{
    const loading=document.getElementById('loading');window.quietShiftLoadingReturned=false;
    const observer=new MutationObserver(records=>{
      if(!loading.hidden||records.some(record=>record.oldValue===null))window.quietShiftLoadingReturned=true;
    });
    observer.observe(loading,{attributes:true,attributeFilter:['hidden'],attributeOldValue:true});
  });
  await moveTo(page,{x:19,y:23});await moveTo(page,{x:19,y:13.5});s=await wait(page,s=>s.player.ammo.flamethrower<4&&s.kills>0,'automatic flame burst',25000);
  assert.equal(await page.evaluate(()=>window.quietShiftLoadingReturned),false,'Quiet Shift must keep playing through first contact');
  assert(s.autoFire);assert.equal(await page.locator('#flame-aim').isHidden(),true);assert.equal(s.shaderFailures,0);await waitForShotAudio(page,'flame-ignite');await screenshot(page,'flamethrower-fire-at-will');mark('flamethrower Fire at Will uses the production cone and fuel',{fuel:s.player.ammo.flamethrower,kills:s.kills});
  assert.equal(log.errors.length,0,JSON.stringify(log.errors));assert.equal(log.requests.length,0,JSON.stringify(log.requests));await context.close();
 }
 // The editor's proving yard uses the same mode and held-trigger rules.
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage(),log=capture(page,'window-yard');
 await page.goto(`http://127.0.0.1:${port}/window-yard.html`);
 await page.waitForFunction(()=>document.querySelector('#loading').hidden);assert.match(await page.locator('#status').textContent(),/Real time/);
 await page.locator('#fire-mode').selectOption('auto');
 const yardRounds=page=>page.evaluate(async()=>{
   const entry=await import(document.querySelector('script[src*="window-yard.js"]').src);
   const {units:[player],elapsed,phase}=entry.inspectWindowYard();
   return {total:player.ammo.assault+player.ammoPouch.assault,elapsed,status:phase};
 });
 const before=await yardRounds(page);
 const pane=await page.evaluate(async()=>{
   const entry=await import(document.querySelector('script[src*="window-yard.js"]').src);
   return entry.projectWindowYard({x:20,y:21.5,h:1.05});
 });
 assert(pane.visible);await page.touchscreen.tap(pane.x,pane.y);
 const trigger=page.locator('#fire'),touch=await trigger.boundingBox(),cdp=await context.newCDPSession(page);
 assert(await trigger.isEnabled(),await page.locator('#message').textContent());
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x+touch.width/2,y:touch.y+touch.height/2}]});
 // Await the async snapshot before testing the predicate. Use total rounds
 // and simulation time so a reload or a slow browser frame cannot skew it.
 try{await wait(page,s=>s.total<=before.total-3,'three held editor shots',15000,yardRounds);}
 finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 await page.waitForFunction(()=>document.querySelector('#fire').disabled);
 const released=await yardRounds(page);
 const later=await wait(page,s=>s.elapsed>=released.elapsed+.55,'time after editor touch release',15000,yardRounds);
 assert.equal(later.total,released.total,JSON.stringify({before,released,later}));
 await screenshot(page,'real-time-proving-yard');assert.equal(log.errors.length,0,JSON.stringify(log.errors));assert.equal(log.requests.length,0,JSON.stringify(log.requests));
 mark('editor proving yard uses production full auto and stops on touch release',{spent:before.total-released.total});await cdp.detach();await context.close();report.success=true;
}catch(error){report.failure=error.stack||String(error);if(activePage&&!activePage.isClosed()){try{report.failureSnapshot=await snapshot(activePage);await screenshot(activePage,'failure');}catch{}}process.exitCode=1;console.error(error.stack||error);}
finally{await close();}
if(report.success)console.log('Real-time native acceptance passed; disposable helpers stopped.');
