// Production acceptance. Checkpoint fixtures supply declared outdoor approaches;
// the full town, guards, equipment, simulation and renderer stay enabled.
import assert from 'node:assert/strict';
import {UPPER_GUARD_POSTS} from '../sites/tactical-animal/dist/mount-dora-upper-guards.js';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),site=path.join(root,'dist'),out=path.join(root,'artifacts/mount-dora-upper-guards');fs.mkdirSync(out,{recursive:true});
const reviewURL=process.env.FIGHTERS_REVIEW_URL,module=process.env.FIGHTERS_PLAYWRIGHT_MODULE||path.join(root,'sites/tactical-animal/browser-tests/node_modules/playwright/index.mjs'),{chromium}=await import(pathToFileURL(module));
const report={owner:'Farmyard Fighters architect',purpose:'Review published upstairs sentries through production Chrome controls',startedAt:new Date().toISOString(),reviewURL,helpers:[],checks:[],errors:[],bad:[]},write=()=>fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
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


const postAt=id=>UPPER_GUARD_POSTS.find(p=>p.id===id);
async function tap(selector,phone){const l=page.locator(selector);if(phone){const b=await l.boundingBox();assert(b);await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}else await l.click();}
async function checkpoint(baseline,post){await page.evaluate(({baseline,post})=>{const p=JSON.parse(baseline);Object.assign(p.player,post.reviewApproach,{stance:'standing',sneaking:false,running:false,heading:Math.atan2(post.y-post.reviewApproach.y,post.x-post.reviewApproach.x)*180/Math.PI});delete p.player.stairId;localStorage.setItem('farmyard-fighters:farmyard-mount-dora-tour-v1',JSON.stringify(p));},{baseline,post});await page.locator('#resume').click();return ready();}
try{
 if(!reviewURL){await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;}report.helpers.push({pid:process.pid,created:created(process.pid),executable:process.execPath,port,source:'tools/test-mount-dora-upper-guards.mjs',cwd:root,purpose:report.purpose,expiry:'Ten minutes maximum; earlier at completion',stop:'finally closes browser and HTTP server'});write();
 browserServer=await chromium.launchServer({headless:true,host:'127.0.0.1',timeout:20000,...(process.env.FIGHTERS_REVIEW_BROWSER?{channel:process.env.FIGHTERS_REVIEW_BROWSER}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});wsPort=Number(new URL(browserServer.wsEndpoint()).port);const child=browserServer.process();report.helpers.push({pid:child.pid,created:created(child.pid),executable:child.spawnfile,port:wsPort,purpose:report.purpose,expiry:'Current review only',stop:'browserServer.close()'});write();browser=await chromium.connect(browserServer.wsEndpoint());


 for(const phone of [false,true]){
  page=await browser.newPage(phone?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}:{viewport:{width:1440,height:1000}});page.setDefaultTimeout(20000);page.on('pageerror',e=>{report.errors.push(e.stack);write();});page.on('response',r=>{if(r.status()>=400)report.bad.push({url:r.url(),status:r.status()});});
  await page.goto(gameURL('mount-dora'));await page.waitForFunction(()=>document.body.dataset.gameReady==='true');await page.locator('#animals button').filter({hasText:'Yakov'}).click();await page.locator('#deploy').click();let first=await ready();assert.equal(first.combat.guards.length,50);assert.equal(first.combat.guards.filter(g=>g.level>0).length,8);assert.equal(first.combat.contacts.length,0);await tap('#menu',phone);await page.reload();await page.waitForFunction(()=>document.body.dataset.gameReady==='true');const baseline=await page.evaluate(()=>localStorage.getItem('farmyard-fighters:farmyard-mount-dora-tour-v1'));
  for(const post of phone?[postAt(46)]:[postAt(46),postAt(52)]){
   const label=(phone?'Touch':'Desktop')+' '+post.name;let s=await checkpoint(baseline,post);s=await until(s=>s.renderedActors.includes(post.id)&&s.render.interiors.contactFloors.some(f=>f.building===post.building&&f.level===post.level),'show the detected guard on its actual storey',15000);let g=s.combat.guards.find(g=>g.id===post.id);assert.equal(g.x,post.x);assert.equal(g.y,post.y);assert.equal(g.elevation,post.elevation);assert(g.projection.visible);assert.equal(s.player.elevation,0);assert(s.actor.onScreen);mark(label+' appears through the cutaway at its published window',{post,guard:g,camera:s.camera});
   s=await until(s=>s.combat.guards.find(g=>g.id===post.id).ammo[post.weapon]<5&&s.combat.guardSight.includes(post.id),'the upstairs guard fires at the street',20000);await shot((phone?'phone':'desktop')+'-incoming-'+post.id);mark(label+' shoots down at the player with a confirmed sight line',{guard:s.combat.guards.find(g=>g.id===post.id),player:s.player});
   const target=(await inspect()).combat.guards.find(g=>g.id===post.id).projection;assert(await page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('#viewport'),target));if(phone)await page.touchscreen.tap(target.x,target.y);else await page.mouse.click(target.x,target.y);await page.locator('[data-control="exit"]').waitFor({state:'visible'});await tap('[data-control="exit"]',phone);await tap('#end-turn',phone);
   s=await until(s=>s.combat.guards.find(g=>g.id===post.id).hp===0,'return fire defeats the upstairs guard',30000);assert(s.player.hp>0);assert(s.combat.kills>=1);assert(s.player.ammo.assault<30);await tap('#end-turn',phone);await shot((phone?'phone':'desktop')+'-defeated-'+post.id);mark(label+' can be selected and defeated with normal return fire',{player:s.player,kills:s.combat.kills});
   await tap('#menu',phone);await page.reload();await page.waitForFunction(()=>document.body.dataset.gameReady==='true');await page.locator('#resume').click();s=await ready();g=s.combat.guards.find(g=>g.id===post.id);assert.equal(g.hp,0);assert.equal(g.level,post.level);assert.equal(g.elevation,post.elevation);mark(label+' retains its upstairs casualty on resume');
   if(!phone&&post.id!==52){await tap('#menu',phone);await page.reload();await page.waitForFunction(()=>document.body.dataset.gameReady==='true');}
  }
  await page.close();page=null;
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.bad,[]);mark('No browser errors, missing assets or shader failures');
}catch(error){report.failure=error.stack;try{const s=await inspect();report.state={player:s.player,combat:s.combat,render:s.render,camera:s.camera};await shot('failure');}catch{}write();console.error(error);process.exitCode=1;}finally{await close();clearTimeout(deadline);}
