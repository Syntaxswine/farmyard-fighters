// Production acceptance. Checkpoint fixtures supply declared indoor starts;
// the full town, guards, equipment, simulation and renderer stay enabled.
import assert from 'node:assert/strict';
import {windowFixture} from '../sites/tactical-animal/tests/helpers/town-window-fixture.mjs';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),site=path.join(root,'dist'),out=path.join(root,'artifacts/town-windows');fs.mkdirSync(out,{recursive:true});
const reviewURL=process.env.FIGHTERS_REVIEW_URL,module=process.env.FIGHTERS_PLAYWRIGHT_MODULE||path.join(root,'sites/tactical-animal/browser-tests/node_modules/playwright/index.mjs'),{chromium}=await import(pathToFileURL(module));
const report={owner:'Farmyard Fighters architect',purpose:'Review upstairs window combat through production Chrome controls',startedAt:new Date().toISOString(),reviewURL,helpers:[],checks:[],errors:[],bad:[]},write=()=>fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
const created=pid=>process.platform==='win32'?execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CreationDate.ToUniversalTime().ToString('o')`],{encoding:'utf8',windowsHide:true}).trim():execFileSync('ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8'}).trim();
const released=port=>new Promise(resolve=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));s.setTimeout(1500,()=>{s.destroy();resolve(false);});});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.jpg':'image/jpeg','.wav':'audio/wav','.ogg':'audio/ogg'};
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/favicon.ico'){res.writeHead(204).end();return;}const file=path.resolve(site,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
let browserServer,browser,page,port,wsPort,cleanup,cdp;
const gameURL=id=>{const u=new URL('game.html',reviewURL||`http://127.0.0.1:${port}/`);u.searchParams.set('activity',id);return u.href;};
const close=()=>cleanup??=(async()=>{const errors=[];try{await cdp?.detach();}catch{}for(const h of [browser,browserServer])try{await h?.close();}catch(e){errors.push(e.message);}server.closeAllConnections();if(server.listening)await new Promise(r=>server.close(r));const child=browserServer?.process();report.cleanup={httpReleased:!port||await released(port),wsReleased:!wsPort||await released(wsPort),browserProcessExited:!child||child.exitCode!==null||child.signalCode!==null,errors};write();})();
const deadline=setTimeout(()=>{report.failure='Ten-minute acceptance deadline reached';void close().finally(()=>process.exit(1));},600000);
const mark=(name,data={})=>{report.checks.push({name,...data});write();console.log('PASS '+name);};
async function bounded(promise,label,ms=15000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),ms);})]);}finally{clearTimeout(timer);}}
const inspect=()=>bounded(page.evaluate(async()=>{const api=await import(document.querySelector('#game-entry').src);return {...api.inspectMountDora(),combat:api.inspectRealtime()};}),'production inspection');
async function until(check,label,timeout=45000){const end=Date.now()+timeout;let s;while(Date.now()<end){s=await inspect();if(check(s))return s;if(s.combat.status==='lost')throw Error('Lost during '+label);await page.waitForTimeout(80);}throw Error(label+': '+JSON.stringify({player:s.player,queue:s.queueLength,debug:s.debug}));}
const ready=()=>until(s=>s.active&&s.touring&&s.ready&&s.combat.ready&&!s.paused,'town readiness',150000);
async function shot(name){await bounded(page.screenshot({path:path.join(out,name+'.png')}),'capture '+name);}

const setups=[];for(const level of [1,4]){const f=await windowFixture({level});try{setups.push(f.setup);}finally{f.world.dispose();}}
async function tap(selector,phone){const l=page.locator(selector);if(phone){const b=await l.boundingBox();assert(b);await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}else await l.click();}
async function moveTo(point,phone){
 const p=await bounded(page.evaluate(async point=>{const api=await import(document.querySelector('#game-entry').src);let last,stable=0,p;const end=performance.now()+8000;while(performance.now()<end){await new Promise(requestAnimationFrame);p=api.projectRealtimePoint({...point,h:point.elevation});if(last&&Math.hypot(p.x-last.x,p.y-last.y)<.15)stable++;else stable=0;if(stable>=2)return p;last=p;}return p;},point),'project movement point');assert(p?.visible);assert(await page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('#viewport'),p));
 if(phone)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
 return until(s=>Math.hypot(s.player.x-point.x,s.player.y-point.y)<.12&&!s.queueLength,'walk behind the window pier',10000);
}
async function checkpoint(baseline,setup){await page.evaluate(({baseline,setup})=>{const p=JSON.parse(baseline);Object.assign(p.player,setup.player,{stance:'standing',sneaking:false,running:false});delete p.player.stairId;const g=p.runtime.guards.find(g=>g.id===setup.guard.id);Object.assign(g,setup.guard,{alert:false,lastKnown:null,isMoving:false});localStorage.setItem('farmyard-fighters:farmyard-mount-dora-tour-v1',JSON.stringify(p));},{baseline,setup});await page.locator('#resume').click();return ready();}
try{
 if(!reviewURL){await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;}report.helpers.push({pid:process.pid,created:created(process.pid),executable:process.execPath,port,source:'tools/test-town-windows.mjs',cwd:root,purpose:report.purpose,expiry:'Ten minutes maximum; earlier at completion',stop:'finally closes browser and HTTP server'});write();
 browserServer=await chromium.launchServer({headless:true,host:'127.0.0.1',timeout:20000,...(process.env.FIGHTERS_REVIEW_BROWSER?{channel:process.env.FIGHTERS_REVIEW_BROWSER}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});wsPort=Number(new URL(browserServer.wsEndpoint()).port);const child=browserServer.process();report.helpers.push({pid:child.pid,created:created(child.pid),executable:child.spawnfile,port:wsPort,purpose:report.purpose,expiry:'Current review only',stop:'browserServer.close()'});write();browser=await chromium.connect(browserServer.wsEndpoint());

 for(const phone of [false,true]){
  page=await browser.newPage(phone?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}:{viewport:{width:1440,height:1000}});page.setDefaultTimeout(20000);page.on('pageerror',e=>{report.errors.push(e.stack);write();});page.on('response',r=>{if(r.status()>=400)report.bad.push({url:r.url(),status:r.status()});});
  await page.goto(gameURL('mount-dora'));await page.waitForFunction(()=>document.body.dataset.gameReady==='true');await page.locator('#utility button').filter({hasText:'Frag grenades'}).click();await page.locator('#deploy').click();await ready();await tap('#menu',phone);await page.reload();await page.waitForFunction(()=>document.body.dataset.gameReady==='true');const baseline=await page.evaluate(()=>localStorage.getItem('farmyard-fighters:farmyard-mount-dora-tour-v1'));
  for(const setup of phone?[setups[0]]:setups){
   const label=(phone?'Touch':'Desktop')+' floor '+setup.player.level,gid=setup.guard.id;let s=await checkpoint(baseline,setup);assert.equal(s.combat.guards.length,50);assert.equal(s.player.level,setup.player.level);assert(s.combat.contacts.some(g=>g.id===gid));assert(s.combat.guards.find(g=>g.id===gid).projection.visible);assert(s.render.interiors.windows>0);await shot((phone?'phone':'desktop')+'-window-floor-'+setup.player.level);mark(label+' sees an outdoor guard through the opening',{setup,camera:s.camera,windows:s.render.interiors.windows});
   // Both first-floor layouts exercise cover and reacquisition. The distant
   // fifth-storey post retains its initial firing heading for the long shot.
   if(setup.player.level===1){s=await moveTo(setup.cover,phone);assert(!s.combat.contacts.some(g=>g.id===gid));assert(s.combat.guards.find(g=>g.id===gid).hp>0);mark(label+' breaks contact by walking behind the solid pier');await moveTo(setup.player,phone);await until(s=>s.combat.contacts.some(g=>g.id===gid),'reacquire the guard through the window',10000);}
   await tap('#end-turn',phone);
   s=await until(s=>s.combat.guards.find(g=>g.id===gid).hp===0&&s.renderedActors.includes(gid),'Fire at Will hits and defeats the outdoor guard',25000);assert(s.combat.kills>=1);assert(s.player.ammo.assault<30);assert.equal(s.memory.shaderFailures,0);await tap('#end-turn',phone);await shot((phone?'phone':'desktop')+'-window-combat-floor-'+setup.player.level);mark(label+' fires through the window and retains the fallen guard below',{player:s.player,guard:s.combat.guards.find(g=>g.id===gid),kills:s.combat.kills});
   await tap('#menu',phone);await page.reload();await page.waitForFunction(()=>document.body.dataset.gameReady==='true');await page.locator('#resume').click();s=await ready();assert.equal(s.player.level,setup.player.level);assert.equal(s.combat.guards.find(g=>g.id===gid).hp,0);assert(s.renderedActors.includes(gid));mark(label+' resumes upstairs with the outdoor casualty intact');
   if(!phone&&setup!==setups.at(-1)){await tap('#menu',phone);await page.reload();await page.waitForFunction(()=>document.body.dataset.gameReady==='true');}
  }
  await page.close();page=null;
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.bad,[]);mark('No browser errors, missing assets or shader failures');
}catch(error){report.failure=error.stack;try{const s=await inspect();report.state={player:s.player,combat:s.combat,render:s.render,camera:s.camera};await shot('failure');}catch{}write();console.error(error);process.exitCode=1;}finally{await close();clearTimeout(deadline);}
