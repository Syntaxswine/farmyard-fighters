// Quiet Shift, normal loadout and controls. Observe the actual rig, jet buffers,
// movement, fuel and live guards; never change simulation state or its clock.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),site=path.join(root,'dist'),out=path.join(root,'artifacts/moving-flamethrower');fs.mkdirSync(out,{recursive:true});
const reviewURL=process.env.FIGHTERS_REVIEW_URL,module=process.env.FIGHTERS_PLAYWRIGHT_MODULE||path.join(root,'sites/tactical-animal/browser-tests/node_modules/playwright/index.mjs'),{chromium}=await import(pathToFileURL(module));
const report={owner:'Farmyard Fighters architect',purpose:'Verify a nozzle-attached flamethrower while moving in production Quiet Shift',startedAt:new Date().toISOString(),reviewURL,helpers:[],checks:[],errors:[],bad:[]},write=()=>fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
const created=pid=>process.platform==='win32'?execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CreationDate.ToUniversalTime().ToString('o')`],{encoding:'utf8',windowsHide:true}).trim():execFileSync('ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8'}).trim();
const released=port=>new Promise(resolve=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));s.setTimeout(1500,()=>{s.destroy();resolve(false);});});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.jpg':'image/jpeg','.wav':'audio/wav','.ogg':'audio/ogg'};
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/favicon.ico'){res.writeHead(204).end();return;}const file=path.resolve(site,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
let browserServer,browser,page,port,wsPort,cleanup,cdp,joystickPoint;
const close=()=>cleanup??=(async()=>{const errors=[];try{await cdp?.detach();}catch{}for(const h of [browser,browserServer])try{await h?.close();}catch(e){errors.push(e.message);}server.closeAllConnections();if(server.listening)await new Promise(r=>server.close(r));const child=browserServer?.process();report.cleanup={httpReleased:!port||await released(port),wsReleased:!wsPort||await released(wsPort),browserProcessExited:!child||child.exitCode!==null||child.signalCode!==null,errors};write();})();
const deadline=setTimeout(()=>{report.failure='Eight-minute moving-flame review deadline';write();void close().finally(()=>process.exit(1));},480000);
const mark=(name,data={})=>{report.checks.push({name,...data});write();console.log('PASS '+name);};
const inspect=()=>page.evaluate(async()=>{const api=await import(document.querySelector('#game-entry').src);return api.inspectRealtime();});
const tap=async(selector,phone)=>{const l=page.locator(selector);if(phone)await l.tap();else await l.click();};
async function hook(){await page.evaluate(async()=>{
 const url=new URL(document.querySelector('#game-entry').src),{FieldView}=await import(new URL('field-view.js'+url.search,url)),sync=FieldView.prototype.sync;window.__movingFlameRows=[];window.__movingFlameImage=null;
 FieldView.prototype.sync=function(...args){const result=sync.apply(this,args);window.__movingFlameView=this;const s=this.state,u=s?.units.find(u=>u.team==='squad'),entry=this.flameEffects?.queue.find(e=>e.event.shooter===u?.id),a=u&&this.actors.get(u.id),tip=a?.equipment.anchors?.muzzle;if(entry?.slot&&tip&&entry.muzzle){const actual=tip.getWorldPosition(entry.muzzle.clone()),sheet=entry.slot.sheets[0],p=sheet.geometry.getAttribute('position'),mesh=p.count?actual.clone().set(p.getX(0),p.getY(0),p.getZ(0)):null;
   const visible=entry.slot.group.visible&&entry.slot.sheets.some(s=>s.visible);window.__movingFlameRows.push({at:args[1],elapsed:entry.elapsed,x:u.x,y:u.y,moving:!!u.isMoving,visible,attached:entry.attached,actual:actual.toArray(),muzzle:entry.muzzle.toArray(),nozzleError:entry.muzzle.distanceTo(actual),sheetError:mesh?.distanceTo(actual),sourceError:Math.hypot(entry.shape.origin.x-u.x,entry.shape.origin.y-u.y),recordedOrigin:[entry.event.flame.origin.x,entry.event.flame.origin.y]});if(window.__movingFlameRows.length>400)window.__movingFlameRows.shift();
   if(!window.__movingFlameImage&&visible&&u.isMoving&&entry.elapsed>=.55&&entry.elapsed<1.3){try{window.__movingFlameImage=this.renderer.domElement.toDataURL('image/png');}catch(e){window.__movingFlameCaptureError=e.message;}}}
 return result;};
 });}
async function move(phone,held){
 if(!phone){if(held)await page.keyboard.down('s');else await page.keyboard.up('s');return;}
 if(!held){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});return;}
 const {x,y}=joystickPoint;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+50}]});
}
try{
 if(!reviewURL){await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;}
 report.helpers.push({pid:process.pid,created:created(process.pid),executable:process.execPath,port,source:'tools/test-moving-flame.mjs',cwd:root,purpose:report.purpose,expiry:'Eight minutes maximum; earlier at completion',stop:'finally closes browser and HTTP server'});write();
 browserServer=await chromium.launchServer({headless:true,host:'127.0.0.1',timeout:30000,...(process.env.FIGHTERS_REVIEW_BROWSER?{channel:process.env.FIGHTERS_REVIEW_BROWSER}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});wsPort=Number(new URL(browserServer.wsEndpoint()).port);const child=browserServer.process();report.helpers.push({pid:child.pid,created:created(child.pid),executable:child.spawnfile,port:wsPort,purpose:report.purpose,expiry:'Current review only',stop:'browserServer.close()'});write();browser=await chromium.connect(browserServer.wsEndpoint());
 for(const phone of [false,true]){
  const label=phone?'Phone':'Desktop';page=await browser.newPage(phone?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}:{viewport:{width:1280,height:900}});page.setDefaultTimeout(30000);page.on('pageerror',e=>{report.errors.push({label,error:e.stack});write();});page.on('response',r=>{if(r.status()>=400){report.bad.push({label,url:r.url(),status:r.status()});write();}});
  const url=new URL('game.html',reviewURL||`http://127.0.0.1:${port}/`);url.searchParams.set('activity','quiet-shift');await page.goto(url.href);await page.waitForFunction(()=>document.body.dataset.gameReady==='true');await hook();await page.locator('#animals button').filter({hasText:'Yakov'}).click();await page.getByRole('button',{name:'Backpack flamethrower',exact:true}).click();await tap('#deploy',phone);
  await page.waitForFunction(async()=>{const api=await import(document.querySelector('#game-entry').src),s=api.inspectRealtime();return s.active&&s.ready&&!s.paused;},null,{timeout:150000});const before=await inspect();assert.equal(before.missionId,'quiet-shift');assert.equal(before.guards.filter(g=>g.hp>0).length,2);assert.equal(before.player.ammo.flamethrower,4);
  if(phone){cdp=await page.context().newCDPSession(page);const b=await page.locator('#joystick').boundingBox();joystickPoint={x:b.x+b.width/2,y:b.y+b.height/2};}
  await tap('#grenade',phone);await page.waitForFunction(()=>document.querySelector('#grenade').dataset.ready==='true');await tap('#grenade',phone);
  try{await move(phone,true);await page.waitForFunction(()=>{const r=window.__movingFlameRows.filter(r=>r.visible&&r.moving&&r.elapsed>=.32&&r.elapsed<1.58);return r.length>=2&&Math.hypot(r.at(-1).x-r[0].x,r.at(-1).y-r[0].y)>.4||window.__movingFlameRows.length>0&&window.__movingFlameView.flameEffects.queue.length===0;},null,{timeout:12000});}finally{await move(phone,false);}
  const rows=await page.evaluate(()=>window.__movingFlameRows),moving=rows.filter(r=>r.visible&&r.moving&&r.elapsed>=.32&&r.elapsed<1.58);fs.writeFileSync(path.join(out,label.toLowerCase()+'-frames.json'),JSON.stringify(rows,null,2)+'\n');assert(moving.length>=2);assert(moving.every(r=>r.attached&&r.nozzleError<1e-7&&r.sheetError<1e-4&&r.sourceError<1e-7));assert(moving.some(r=>Math.hypot(r.x-r.recordedOrigin[0],r.y-r.recordedOrigin[1])>.5));
  const after=await inspect();assert.equal(after.player.ammo.flamethrower,3);assert.equal(after.guards.filter(g=>g.hp>0).length,2);assert(after.player.hp>0);assert.equal(after.shaderFailures,0);const pixels=await page.evaluate(()=>window.__movingFlameImage);assert(pixels?.startsWith('data:image/png;base64,'),'Capture a real rendered moving flame frame');fs.writeFileSync(path.join(out,label.toLowerCase()+'-moving-flame.png'),Buffer.from(pixels.split(',')[1],'base64'));mark(label+' moves with the painted jet attached to the actual nozzle',{frames:moving.length,travel:Math.hypot(moving.at(-1).x-moving[0].x,moving.at(-1).y-moving[0].y),maxNozzleError:Math.max(...moving.map(r=>r.nozzleError)),maxSheetError:Math.max(...moving.map(r=>r.sheetError)),fuel:after.player.ammo.flamethrower,guards:after.guards.filter(g=>g.hp>0).length});
  await page.waitForFunction(()=>window.__movingFlameView.flameEffects.queue.length===0);mark(label+' finishes the burst without consuming extra fuel or retaining an emitter');await cdp?.detach();cdp=null;await page.close();page=null;
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.bad,[]);mark('No browser, asset or shader failures');
}catch(error){report.failure=error.stack;try{report.state=await inspect();report.frames=await page.evaluate(()=>window.__movingFlameRows);await page.screenshot({path:path.join(out,'failure.png')});}catch{}write();console.error(error);process.exitCode=1;}finally{await close();clearTimeout(deadline);}
