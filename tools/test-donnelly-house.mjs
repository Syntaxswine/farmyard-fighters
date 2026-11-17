// Declared player approaches only. Full production AI, resources and combat.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),site=path.join(root,'dist'),out=path.join(root,'artifacts/donnelly-house');fs.mkdirSync(out,{recursive:true});
const reviewURL=process.env.FIGHTERS_REVIEW_URL,module=process.env.FIGHTERS_PLAYWRIGHT_MODULE||path.join(root,'sites/tactical-animal/browser-tests/node_modules/playwright/index.mjs'),{chromium}=await import(pathToFileURL(module));
const id='osm-way-547799531',house=JSON.parse(fs.readFileSync(path.join(root,'maps/mount-dora/interiors/B02.json'))).buildings.find(b=>b.id===id),stair=house.stairs[0],front=house.doors.find(d=>d.exterior&&d.rooms[0]==='rG01');
const report={owner:'Farmyard Fighters architect',purpose:'Review pinned Donnelly house through production desktop and touch controls',startedAt:new Date().toISOString(),reviewURL,helpers:[],checks:[],errors:[],bad:[]},write=()=>fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
const created=pid=>process.platform==='win32'?execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CreationDate.ToUniversalTime().ToString('o')`],{encoding:'utf8',windowsHide:true}).trim():execFileSync('ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8'}).trim();
const released=port=>new Promise(resolve=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));s.setTimeout(1500,()=>{s.destroy();resolve(false);});});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.jpg':'image/jpeg','.wav':'audio/wav','.ogg':'audio/ogg'};
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/favicon.ico'){res.writeHead(204).end();return;}const file=path.resolve(site,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
let browserServer,browser,page,port,wsPort,cleanup,cdp;
const close=()=>cleanup??=(async()=>{const errors=[];try{await cdp?.detach();}catch{}for(const h of [browser,browserServer])try{await h?.close();}catch(e){errors.push(e.message);}server.closeAllConnections();if(server.listening)await new Promise(r=>server.close(r));const child=browserServer?.process();report.cleanup={httpReleased:!port||await released(port),wsReleased:!wsPort||await released(wsPort),browserProcessExited:!child||child.exitCode!==null||child.signalCode!==null,errors};write();})();
const deadline=setTimeout(()=>{report.failure='Ten-minute house review deadline reached';void close().finally(()=>process.exit(1));},600000);
const mark=(name,data={})=>{report.checks.push({name,...data});write();console.log('PASS '+name);};
async function bounded(promise,label,ms=15000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),ms);})]);}finally{clearTimeout(timer);}}
const inspect=()=>bounded(page.evaluate(async()=>{const api=await import(document.querySelector('#game-entry').src),v=window.__houseReview,roof=v?.scene.getObjectByName('Pinned Nautilus Donnelly roof');return {...api.inspectMountDora(),combat:api.inspectRealtime(),houseRoof:roof?{visible:roof.visible,...roof.userData}:null};}),'inspect house');
async function until(check,label,timeout=30000){const end=Date.now()+timeout;let s;while(Date.now()<end){s=await inspect();if(await check(s))return s;if(s.combat.status==='lost')throw Error('Lost during '+label);await page.waitForTimeout(80);}throw Error(label+': '+JSON.stringify({player:s.player,queue:s.queueLength,roof:s.houseRoof}));}
const ready=()=>until(s=>s.active&&s.touring&&s.ready&&s.combat.ready&&!s.paused,'town readiness',150000);
const tap=async selector=>{const l=page.locator(selector);if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches))await l.tap();else await l.click();};
const shot=name=>bounded(page.screenshot({path:path.join(out,name+'.png')}),'capture '+name);
async function hook(){await page.evaluate(async()=>{const entry=new URL(document.querySelector('#game-entry').src),{FieldView}=await import(new URL('field-view.js'+entry.search,entry)),set=FieldView.prototype.setGame;FieldView.prototype.setGame=function(...args){window.__houseReview=this;return set.apply(this,args);};});}
async function checkpoint(point,closeDoor=null){await tap('#menu');await page.reload();await page.waitForFunction(()=>document.body.dataset.gameReady==='true');await page.evaluate(({point,closeDoor})=>{const key='farmyard-fighters:farmyard-mount-dora-tour-v1',p=JSON.parse(localStorage.getItem(key));Object.assign(p.player,{level:0,elevation:0},point);delete p.player.stairId;if(closeDoor)p.runtime.objects=p.runtime.objects.filter(o=>o.id!==closeDoor);localStorage.setItem(key,JSON.stringify(p));},{point,closeDoor});await hook();await tap('#resume');return ready();}
async function closeDoorReview(label,phone){
 const point={x:front.x+front.swing*.34,y:front.y-.3};await checkpoint(point,front.id);
 const button=page.locator('#interaction-hand');await button.waitFor({state:'visible'});assert.equal(await page.locator('#interaction-label').textContent(),'Open door');
 const bounds=await button.boundingBox(),stick=await page.locator('#joystick').boundingBox();assert(bounds.width>=170&&bounds.height>=80);assert(bounds.y+bounds.height<stick.y,'The action target must clear the joystick');
 await framePoint({x:front.x,y:front.y,h:1.1});const after=await button.boundingBox();assert(Math.abs(bounds.x-after.x)<1&&Math.abs(bounds.y-after.y)<1,'Camera panning must not move the action button');
 await shot(label.toLowerCase()+'-door-control');const x=after.x+after.width-12,y=after.y+after.height-12;if(phone)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
 await until(()=>page.evaluate(id=>window.__houseReview.state.interactables.find(d=>d.id===id)?.open,front.id),'single edge tap opens close door');assert(!await page.locator('#overlay').isVisible());
 const inspectLeaf=()=>page.evaluate(async id=>{const v=window.__houseReview,entry=new URL(document.querySelector('#game-entry').src),{doorFootprint}=await import(new URL('interactions.js'+entry.search,entry)),{freePoint,hero}=await import(new URL('solo-game.js'+entry.search,entry)),d=v.state.interactables.find(d=>d.id===id),box=doorFootprint(d),leaf=v.interactionArt.records.get(id).leaf,u=hero(v.state);return {open:d.open,swing:d.swing,clear:freePoint(v.state,u,u.id),player:{x:u.x,y:u.y},actual:[leaf.position.x,leaf.position.y,leaf.position.z,leaf.scale.x,leaf.scale.y,leaf.scale.z],expected:[(box.x0+box.x1)/2,((box.z0??0)+box.height)/2,(box.y0+box.y1)/2,box.x1-box.x0,box.height-(box.z0??0),box.y1-box.y0]};},front.id);
 const leaf=await inspectLeaf();assert.equal(leaf.swing,-front.swing);assert(leaf.clear);assert(Math.hypot(leaf.player.x-point.x,leaf.player.y-point.y)<.02,'Opening must not relocate the player');assert.deepEqual(leaf.actual,leaf.expected);mark(label+' opens a close door away from the player with a large stationary single-tap button',{bounds,leaf});
 await tap('#menu');await page.reload();await page.waitForFunction(()=>document.body.dataset.gameReady==='true');await hook();await tap('#resume');await ready();const resumed=await inspectLeaf();assert(resumed.open&&resumed.clear);assert.equal(resumed.swing,leaf.swing);assert.deepEqual(resumed.actual,resumed.expected);await tap('#interaction-hand');await until(()=>page.evaluate(id=>!window.__houseReview.state.interactables.find(d=>d.id===id)?.open,front.id),'close resumed door');mark(label+' resumes the reverse swing and closes the same solid leaf');
}
async function holdHand(){const p=await page.locator('#interaction-hand').boundingBox();assert(p);const x=p.x+p.width/2,y=p.y+p.height/2;await page.evaluate(()=>{window.__handEvents=[];for(const name of ['pointerdown','pointerup','pointercancel','lostpointercapture','contextmenu'])document.addEventListener(name,e=>window.__handEvents.push({name,target:e.target.id,button:e.button,type:e.pointerType,x:e.clientX,y:e.clientY,time:performance.now()}),{capture:true,once:true});});if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches)){cdp??=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});try{await page.waitForFunction(()=>document.querySelector('#overlay').open,null,{timeout:10000});}finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}}else{await page.mouse.move(x,y);await page.mouse.down();try{await page.waitForFunction(()=>document.querySelector('#overlay').open,null,{timeout:10000});}finally{await page.mouse.up();}}}
async function frameRoof(){
 const phone=await page.evaluate(()=>matchMedia('(pointer:coarse)').matches);
 for(let n=0;n<(phone?8:5);n++){
  const zoom=page.locator('#zoom-out');if(await zoom.isDisabled())break;
  try{if(phone)await zoom.tap({timeout:1500});else await zoom.click({timeout:1500});}catch(error){if(await zoom.isDisabled())break;throw error;}
  await page.waitForTimeout(100);
 }
 await framePoint({x:398,y:478,h:4.24});
}
async function framePoint(point){
 const size=page.viewportSize(),phone=await page.evaluate(()=>matchMedia('(pointer:coarse)').matches);
 for(let n=0;n<8;n++){
  const p=await page.evaluate(point=>window.__houseReview.projectWorldPoint(point),point),dx=Math.max(-size.width*.2,Math.min(size.width*.2,size.width*.5-p.x)),dy=Math.max(-size.height*.16,Math.min(size.height*.16,size.height*.34-p.y));
  if(Math.hypot(dx,dy)<15)break;
  const start=await page.evaluate(size=>[[.5,.38],[.35,.38],[.65,.38],[.5,.25]].map(([x,y])=>({x:x*size.width,y:y*size.height})).find(p=>{const e=document.elementFromPoint(p.x,p.y);return e?.closest('#viewport')&&!e.closest('button');}),size);assert(start,'Need clear canvas for ordinary camera panning');const {x,y}=start;
  if(phone){cdp??=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let j=1;j<=8;j++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*j/8,y:y+dy*j/8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:12});await page.mouse.up();}
  await page.waitForTimeout(150);
 }
 await page.waitForTimeout(300);assert((await page.evaluate(point=>window.__houseReview.projectWorldPoint(point),point)).visible);
}
async function focus(name){await holdHand();const other=page.getByRole('button',{name:'Focus '+name,exact:true});if(await other.isVisible())await other.click();else assert(await page.getByRole('heading',{name,exact:true}).isVisible(),'The requested object must be focused');}
async function action(label){const button=page.getByRole('button',{name:new RegExp('^'+label+' ·')});if(await button.isVisible())await button.click();else await tap('#interaction-hand');}
async function door(d){await focus(d.name);await action('Open');await until(()=>page.evaluate(id=>window.__houseReview.state.interactables.find(d=>d.id===id)?.open,d.id),'open '+d.id);}
async function walk(point,level=0){
 const target={x:point[0],y:point[1],h:level*2.12+.02};let projected=await page.evaluate(p=>window.__houseReview.projectWorldPoint(p),target);const size=page.viewportSize();if(!projected.visible||projected.x<size.width*.12||projected.x>size.width*.88||projected.y>size.height*.57){await framePoint(target);projected=await page.evaluate(p=>window.__houseReview.projectWorldPoint(p),target);}assert(projected.visible,'Walking target is outside the camera');
 if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches))await page.touchscreen.tap(projected.x,projected.y);else await page.mouse.click(projected.x,projected.y);
 const move=page.getByRole('button',{name:'Move',exact:true});if(await move.isVisible())await move.click();
 return until(s=>Math.hypot(s.player.x-point[0],s.player.y-point[1])<.28&&s.player.level===level&&!s.queueLength,'walk to '+point,30000);
}
async function climb(up){const level=up?1:0,label=up?'Stairs up to floor 1':'Stairs down to ground floor';await focus(label);await action(up?'Upstairs':'Downstairs');return until(s=>s.player.level===level&&!s.player.stairId&&!s.queueLength&&Math.abs(s.actor.standY-level*2.12)<.035,'walk '+label,30000);}
try{
 if(!reviewURL){await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;}
 report.helpers.push({pid:process.pid,created:created(process.pid),executable:process.execPath,port,source:'tools/test-donnelly-house.mjs',cwd:root,purpose:report.purpose,expiry:'Ten minutes maximum; earlier at completion',stop:'finally closes browser and HTTP server'});write();
 browserServer=await chromium.launchServer({headless:true,host:'127.0.0.1',timeout:20000,...(process.env.FIGHTERS_REVIEW_BROWSER?{channel:process.env.FIGHTERS_REVIEW_BROWSER}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});wsPort=Number(new URL(browserServer.wsEndpoint()).port);const child=browserServer.process();report.helpers.push({pid:child.pid,created:created(child.pid),executable:child.spawnfile,port:wsPort,purpose:report.purpose,expiry:'Current review only',stop:'browserServer.close()'});write();browser=await chromium.connect(browserServer.wsEndpoint());
 for(const phone of process.argv.includes('--touch-only')?[true]:[false,true]){
  const label=phone?'Touch':'Desktop';page=await browser.newPage(phone?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}:{viewport:{width:1440,height:1000}});page.setDefaultTimeout(20000);page.on('pageerror',e=>{report.errors.push(e.stack);write();});page.on('response',r=>{if(r.status()>=400)report.bad.push({url:r.url(),status:r.status()});});
  const url=new URL('game.html',reviewURL||`http://127.0.0.1:${port}/`);url.searchParams.set('activity','mount-dora');await page.goto(url.href);await page.waitForFunction(()=>document.body.dataset.gameReady==='true');await hook();await page.locator('#animals button').filter({hasText:'Yakov'}).click();await tap('#deploy');let s=await ready();assert.equal(s.combat.guards.length,50);assert.equal(s.combat.guards.filter(g=>g.level>0).length,8);
  s=await checkpoint({x:422,y:504});assert(s.houseRoof?.visible);assert.equal(s.houseRoof.turretSides,6);await frameRoof();await shot(label.toLowerCase()+'-exterior');mark(label+' renders the pinned hipped roof and hexagonal turret',{roof:s.houseRoof});
  await checkpoint({x:front.outside[0],y:front.outside[1]});await door(front);await walk(front.inside);s=await inspect();assert(!s.houseRoof.visible);await shot(label.toLowerCase()+'-parlor');mark(label+' opens the real entrance and enters the parlor');
  const hall=house.doors.find(d=>!d.exterior&&d.rooms.includes('rhall')&&d.rooms.includes('rG01'));await walk(hall.rooms[0]==='rG01'?hall.inside:hall.outside);await door(hall);await walk([stair.x,stair.y]);s=await climb(true);assert.equal(s.player.elevation,2.12);await shot(label.toLowerCase()+'-upstairs');mark(label+' walks the production return stairs to the upper landing',{player:s.player,actor:s.actor});
  await tap('#menu');await page.reload();await page.waitForFunction(()=>document.body.dataset.gameReady==='true');await hook();await tap('#resume');s=await ready();assert.equal(s.player.level,1);assert.equal(s.player.elevation,2.12);assert(!s.houseRoof.visible);mark(label+' resumes on the proper upper floor');
  const upper=house.upperFloors[0],chamber=upper.doors.find(d=>d.rooms.includes('rhall')&&d.rooms.includes('rU01'));await walk(chamber.rooms[0]==='rhall'?chamber.inside:chamber.outside,1);await door(chamber);await walk(chamber.rooms[0]==='rU01'?chamber.inside:chamber.outside,1);
  const window=upper.windows.find(w=>w.room==='rU01');s=await walk([window.x-window.outward[0]*.5,window.y-window.outward[1]*.5],1);assert(s.actor.onScreen);assert.equal(s.memory.shaderFailures,0);await shot(label.toLowerCase()+'-window');mark(label+' reaches an upstairs chamber firing window',{player:s.player,render:s.render.interiors});
  await walk([stair.x+1,stair.y],1);await climb(false);await walk(front.outside);mark(label+' walks back downstairs and exits through the original open door');await closeDoorReview(label,phone);await cdp?.detach();cdp=null;await page.close();page=null;
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.bad,[]);mark('No browser errors, missing assets or shader failures');
}catch(error){report.failure=error.stack;try{report.handEvents=await page.evaluate(()=>window.__handEvents);report.state=await inspect();await shot('failure');}catch{}write();console.error(error);process.exitCode=1;}finally{await close();clearTimeout(deadline);}
