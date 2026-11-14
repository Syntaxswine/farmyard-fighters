// Production browser acceptance; fixtures only relocate saved player checkpoints.
// Guards, combat, equipment, renderer, controls and streaming stay enabled.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),site=path.join(root,'dist'),out=path.join(root,'artifacts/town-interiors');fs.mkdirSync(out,{recursive:true});
const reviewURL=process.env.FIGHTERS_REVIEW_URL;
const gameURL=activity=>{const u=new URL('game.html',reviewURL||`http://127.0.0.1:${port}/`);u.searchParams.set('activity',activity);return u.href;};
const module=process.env.FIGHTERS_PLAYWRIGHT_MODULE||path.join(root,'sites/tactical-animal/browser-tests/node_modules/playwright/index.mjs'),{chromium}=await import(pathToFileURL(module));
const report={owner:'Farmyard Fighters architect',purpose:'Production review of fictional town interiors',startedAt:new Date().toISOString(),helpers:[],checks:[],errors:[],bad:[]},write=()=>fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
const mark=(name,data={})=>{report.checks.push({name,...data});write();console.log('PASS '+name);};
const created=pid=>process.platform==='win32'?execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CreationDate.ToUniversalTime().ToString('o')`],{encoding:'utf8',windowsHide:true}).trim():execFileSync('ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8'}).trim();
const released=port=>new Promise(resolve=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));s.setTimeout(1500,()=>{s.destroy();resolve(false);});});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.jpg':'image/jpeg','.wav':'audio/wav','.ogg':'audio/ogg'};
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/favicon.ico'){res.writeHead(204).end();return;}const file=path.resolve(site,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
let browserServer,browser,page,port,wsPort,cleanup;
const close=()=>cleanup??=(async()=>{const errors=[];for(const h of[browser,browserServer])try{await h?.close();}catch(e){errors.push(e.message);}server.closeAllConnections();if(server.listening)await new Promise(r=>server.close(r));const child=browserServer?.process();report.cleanup={httpReleased:!port||await released(port),wsReleased:!wsPort||await released(wsPort),browserProcessExited:!child||child.exitCode!==null||child.signalCode!==null,errors};write();})();
const deadline=setTimeout(()=>{report.failure='Eight-minute deadline reached';void close().finally(()=>process.exit(1));},480000);
const inspect=()=>page.evaluate(async()=>{const api=await import(document.querySelector('#game-entry').src),v=window.__interiorReview;return {...api.inspectMountDora(),combat:api.inspectRealtime(),doors:v?.state.interactables.filter(d=>d.fictionalInterior).map(({id,x,y,open,exterior,inside,outside,rooms,building})=>({id,x,y,open,exterior,inside,outside,rooms,building}))};});
async function until(check,label,timeout=45000){const end=Date.now()+timeout;let last;while(Date.now()<end){last=await inspect();if(check(last))return last;if(last.combat.status==='lost')throw Error('Lost during '+label);await page.waitForTimeout(120);}throw Error(label+': '+JSON.stringify(last));}
async function hook(){await page.evaluate(async()=>{const entry=new URL(document.querySelector('#game-entry').src),{FieldView}=await import(new URL('field-view.js'+entry.search,entry)),set=FieldView.prototype.setGame;FieldView.prototype.setGame=function(...args){window.__interiorReview=this;return set.apply(this,args);};});}
const ready=()=>until(s=>s.active&&s.touring&&s.ready&&s.combat.ready&&!s.paused,'town readiness',150000);
async function clickPoint(point){const p=await page.evaluate(async p=>(await import(document.querySelector('#game-entry').src)).projectRealtimePoint({...p,h:0}),point);assert(p?.visible);if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches))await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);}
async function moveTo(point){const s=await inspect();if(Math.hypot(s.player.x-point.x,s.player.y-point.y)<.24)return s;await clickPoint(point);return until(s=>Math.hypot(s.player.x-point.x,s.player.y-point.y)<.24,'walking to '+JSON.stringify(point),18000);}
async function shot(name){await page.screenshot({path:path.join(out,name+'.png')});}
async function checkpoint(point){await page.locator('#menu').click();await page.reload();await page.waitForFunction(()=>document.body.dataset.gameReady==='true');await page.evaluate(point=>{const key='farmyard-fighters:farmyard-mount-dora-tour-v1',p=JSON.parse(localStorage.getItem(key));Object.assign(p.player,point);localStorage.setItem(key,JSON.stringify(p));},point);await hook();await page.locator('#resume').click();return ready();}
async function enter(d,label){
 await moveTo({x:d.outside[0],y:d.outside[1]});await page.locator('#interaction-hand').filter({hasText:'Open'}).click();await until(s=>s.doors.find(o=>o.id===d.id)?.open,'opening '+label);
 await moveTo({x:d.inside[0],y:d.inside[1]});const s=await until(s=>s.room?.building===d.building&&s.interiors.visibleRooms>0,'inside '+label);assert.equal(s.memory.shaderFailures,0);assert(s.player.hp>0);assert.equal(s.combat.guards.length,42);await shot(label);mark(label,{building:d.building,door:d.id,room:s.room,renderer:s.render.interiors,memory:s.memory,player:s.player});return s;
}
try{
 if(!reviewURL){await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;}report.helpers.push({pid:process.pid,created:created(process.pid),executable:process.execPath,port,source:'tools/test-town-interiors.mjs',cwd:root,reviewURL,purpose:report.purpose,expiry:'Eight minutes maximum; earlier at completion',stop:'finally closes browser and HTTP server'});write();
 browserServer=await chromium.launchServer({headless:true,host:'127.0.0.1',timeout:20000,...(process.env.FIGHTERS_REVIEW_BROWSER?{channel:process.env.FIGHTERS_REVIEW_BROWSER}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});wsPort=Number(new URL(browserServer.wsEndpoint()).port);const child=browserServer.process();report.helpers.push({pid:child.pid,created:created(child.pid),executable:child.spawnfile,port:wsPort,purpose:report.purpose,expiry:'Current review only',stop:'browserServer.close()'});write();browser=await chromium.connect(browserServer.wsEndpoint());
 for(const phone of [false,true]){
  page=await browser.newPage(phone?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}:{viewport:{width:1440,height:1000}});page.setDefaultTimeout(20000);page.on('pageerror',e=>{report.errors.push(e.stack);write();});page.on('response',r=>{if(r.status()>=400)report.bad.push({url:r.url(),status:r.status()});});
  await page.goto(gameURL('mount-dora'));await page.waitForFunction(()=>document.body.dataset.gameReady==='true');await hook();await page.locator('#animals button').filter({hasText:'Yakov'}).click();await page.locator('#deploy').click();let s=await ready();await shot(phone?'phone-outside':'desktop-outside');
  const d=s.doors.filter(d=>d.exterior).sort((a,b)=>Math.hypot(a.x-s.player.x,a.y-s.player.y)-Math.hypot(b.x-s.player.x,b.y-s.player.y))[0];assert(d);s=await enter(d,phone?'phone-enter-house':'desktop-enter-house');
  await page.locator('#menu').click();await page.reload();await page.waitForFunction(()=>document.body.dataset.gameReady==='true');await hook();await page.locator('#resume').click();let resumed=await ready();assert.equal(resumed.player.x,s.player.x);assert.equal(resumed.player.y,s.player.y);assert(resumed.doors.find(o=>o.id===d.id)?.open);mark(phone?'Phone resume inside':'Desktop resume inside');
  if(!phone){
   const authored=JSON.parse(fs.readFileSync(path.join(root,'maps/mount-dora/authored-buildings.json'))).records,packets=fs.readdirSync(path.join(root,'maps/mount-dora/interiors')).flatMap(f=>JSON.parse(fs.readFileSync(path.join(root,'maps/mount-dora/interiors',f))).buildings),byId=new Map(packets.map(b=>[b.id,b]));
   for(const [name,condition]of [['rectangle',b=>b.geometry.coordinates[0].length===1&&b.geometry.coordinates[0][0].length===5&&b.metrics.authoredAreaM2<180],['courtyard',b=>b.geometry.coordinates[0].length>1]]){
    const candidates=authored.filter(condition).flatMap(b=>byId.get(b.id).doors.filter(d=>d.exterior).map(d=>({...d,building:b.id}))).sort((a,b)=>Math.hypot(a.x-459,a.y-500)-Math.hypot(b.x-459,b.y-500));const d=candidates[0];assert(d);await checkpoint({x:d.outside[0],y:d.outside[1]});await enter(d,'desktop-'+name);
   }
   await page.goto(gameURL('pinewire-prison'));await page.waitForFunction(()=>document.body.dataset.gameReady==='true');await hook();await page.locator('#deploy').click();const prison=await until(s=>s.combat.ready,'prison readiness',150000);assert.equal(prison.combat.guards.length,8);assert.equal(prison.combat.shaderFailures,0);await shot('prison-preserved');mark('Pinewire Prison retains production loading and eight guards');
  }
  await page.close();page=null;
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.bad,[]);mark('No browser errors, failed assets or shader failures');
}catch(error){report.failure=error.stack;try{report.state=await inspect();await shot('failure');}catch{}write();console.error(error);process.exitCode=1;}finally{await close();clearTimeout(deadline);}
