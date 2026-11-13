// Production acceptance for the imported town and its coexistence with the prison.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const phoneOnly=process.argv.includes('--phone-only');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),site=path.join(root,'dist'),out=path.join(root,'artifacts/mount-dora-import',phoneOnly?'phone':'native');
fs.mkdirSync(out,{recursive:true});
const {chromium}=await import(pathToFileURL(path.join(root,'sites/tactical-animal/browser-tests/node_modules/playwright/index.mjs')));
const report={owner:'Farmyard Fighters architect',purpose:'Review imported town through production play and preserve Pinewire Prison',startedAt:new Date().toISOString(),helpers:[],checks:[],errors:[],failed:[],bad:[]};
const write=()=>fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');
const mark=(name,data={})=>{report.checks.push({name,...data});write();console.log('PASS '+name);};
function capture(target){target.setDefaultTimeout(20000);target.on('pageerror',e=>{report.errors.push(e.stack);write();});target.on('requestfailed',r=>report.failed.push({url:r.url(),error:r.failure()}));target.on('response',r=>{if(r.status()>=400)report.bad.push({url:r.url(),status:r.status()});});}
const created=pid=>process.platform==='win32'?execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CreationDate.ToUniversalTime().ToString('o')`],{encoding:'utf8',windowsHide:true}).trim():execFileSync('ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8'}).trim();
const released=port=>new Promise(resolve=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));s.setTimeout(1500,()=>{s.destroy();resolve(false);});});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.jpg':'image/jpeg','.wav':'audio/wav','.ogg':'audio/ogg'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}let file;try{file=path.resolve(site,'.'+decodeURIComponent(url.pathname));}catch{res.writeHead(400).end();return;}if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
let browserServer,browser,page,port,wsPort,cleanup;
const close=()=>cleanup??=(async()=>{const errors=[];for(const h of[browser,browserServer])try{await h?.close();}catch(e){errors.push(e.message);}server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve));const child=browserServer?.process();report.cleanup={httpReleased:!port||await released(port),wsReleased:!wsPort||await released(wsPort),browserProcessExited:!child||child.exitCode!==null||child.signalCode!==null,errors};write();})();
const deadline=setTimeout(()=>{report.failure='Eight-minute acceptance deadline reached';void close().finally(()=>process.exit(1));},480000);
const inspect=()=>page.evaluate(async()=>{const api=await import(document.querySelector('#game-entry').src);return {...api.inspectMountDora(),combat:api.inspectRealtime()};});
async function until(check,label,timeout=45000){const end=Date.now()+timeout;let last;while(Date.now()<end){last=await inspect();if(check(last))return last;if(last.combat.status==='lost')throw Error('Lost during '+label);await page.waitForTimeout(100);}throw Error(label+': '+JSON.stringify(last));}
async function hook(){await page.evaluate(async()=>{const entry=new URL(document.querySelector('#game-entry').src),{FieldView}=await import(new URL('field-view.js'+entry.search,entry)),set=FieldView.prototype.setGame;FieldView.prototype.setGame=function(...args){window.__mountDoraImportView=this;return set.apply(this,args);};});}
async function ready(){return until(s=>s.active&&s.touring&&s.ready&&s.combat.ready&&!s.paused,'town readiness',120000);}
async function clickPoint(point){
 for(let i=0;i<12;i++){
  const pixel=await page.evaluate(async point=>(await import(document.querySelector('#game-entry').src)).projectRealtimePoint({...point,h:0}),point);
  if(pixel?.visible&&await page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('#viewport'),pixel)){if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches))await page.touchscreen.tap(pixel.x,pixel.y);else await page.mouse.click(pixel.x,pixel.y);return;}
  if(!(await page.locator('#zoom-out').isEnabled()))break;await page.locator('#zoom-out').click();
 }
 throw Error('Ground point stayed outside the usable viewport: '+JSON.stringify(point));
}
async function moveTo(point,label){await clickPoint(point);return until(s=>s.combat.ready&&s.combat.queueLength===0&&Math.hypot(s.player.x-point.x,s.player.y-point.y)<.22,label,45000);}
async function visit(name){await page.locator('#menu').click();await page.getByRole('button',{name:'Visit landmark',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();return ready();}
async function shot(name){await page.screenshot({path:path.join(out,name+'.png')});}
async function resumeAt(point){
 // Declared checkpoint fixture at a reviewed source location; resume validates
 // it through the production loader. Guards, weapons and resources stay active.
 await page.locator('#menu').click();await page.reload();await page.waitForFunction(()=>document.body.dataset.gameReady==='true');
 await page.evaluate(point=>{const key='farmyard-fighters:farmyard-mount-dora-tour-v1',saved=JSON.parse(localStorage.getItem(key));Object.assign(saved.player,point);localStorage.setItem(key,JSON.stringify(saved));},point);
 await hook();await page.locator('#resume').click();return ready();
}
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));port=server.address().port;
 report.helpers.push({pid:process.pid,created:created(process.pid),executable:process.execPath,port,source:'tools/test-mount-dora-import.mjs',cwd:root,purpose:report.purpose,expiry:'Eight minutes maximum; earlier at completion',stop:'finally closes browser and HTTP server'});write();
 browserServer=await chromium.launchServer({headless:true,host:'127.0.0.1',timeout:20000,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});wsPort=Number(new URL(browserServer.wsEndpoint()).port);const child=browserServer.process();report.helpers.push({pid:child.pid,created:created(child.pid),executable:child.spawnfile,port:wsPort,purpose:report.purpose,expiry:'Current review only',stop:'browserServer.close()'});write();browser=await chromium.connect(browserServer.wsEndpoint());
 const pin=JSON.parse(fs.readFileSync(path.join(root,'sites/tactical-animal/mount-dora-import.json')));
 if(!phoneOnly){
 page=await browser.newPage({viewport:{width:1440,height:1000}});capture(page);
 await page.goto(`http://127.0.0.1:${port}/game.html?activity=pinewire-prison`);await hook();await page.locator('#animals button').filter({hasText:'Yakov'}).click();await page.locator('#utility button').filter({hasText:'Frag grenades'}).click();await page.locator('#deploy').click();
 const prison=await until(s=>s.combat.ready,'prison readiness',150000);assert.equal(prison.combat.missionId,'pinewire-prison');assert.equal(prison.combat.guards.length,8);assert.equal(prison.combat.shaderFailures,0);
 const start=prison.combat.player;await page.keyboard.down('d');try{await until(s=>Math.hypot(s.combat.player.x-start.x,s.combat.player.y-start.y)>.4,'prison keyboard movement');}finally{await page.keyboard.up('d');}
 await page.locator('#menu').click();await shot('prison-preserved');await page.getByRole('button',{name:'Choose operation, animal & loadout',exact:true}).click();
 const prisonKey='farmyard-fighters:tactical-animal-operation-v3:pinewire-prison',prisonSave=await page.evaluate(key=>localStorage.getItem(key),prisonKey);assert(prisonSave);mark('Pinewire Prison retains its eight guards, production renderer, movement and operation save');
 await page.goto(`http://127.0.0.1:${port}/game.html?activity=mount-dora`);await hook();await page.locator('#deploy').click();let town=await ready();assert.equal(town.combat.guards.length,42);assert.equal(town.memory.shaderFailures,0);assert.equal(await page.locator('#end-turn').getAttribute('aria-label'),'Fire at Will');
 assert.equal(town.artRevision,pin.content.artRevision);mark('Updated map and art load together through the full Fighters bootstrap',{revision:town.artRevision});
 const tree=await page.evaluate(()=>{const v=window.__mountDoraImportView,p=v.state.units[0];return [...v.art.world.cache.values()].flatMap(c=>c.plants.records).filter(t=>t.matureBroadleaf!==undefined).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];});assert(tree);
 await moveTo({x:tree.x+1.5,y:tree.y},'mature broadleaf approach');await page.keyboard.down('a');try{town=await until(s=>s.player.x<tree.x-1.1,'sliding past retained mature trunk',18000);}finally{await page.keyboard.up('a');}
 assert(Math.abs(town.player.y-tree.y)>.3);assert(town.player.hp>0);await shot('mature-broadleaf');mark('A retained mature broadleaf renders and real held movement slides around its trunk',{tree:{x:tree.x,y:tree.y,variant:tree.matureBroadleaf},player:town.player});
 await visit('Former depot');await moveTo({x:326,y:681},'depot sidewalk north');await moveTo({x:326,y:689},'depot sidewalk south');await shot('depot-sidewalk');mark('Reviewed depot renders while its east approach stays traversable');
 town=await resumeAt({x:146,y:641});assert.equal(town.actor.standY,.4);await moveTo({x:136,y:641},'covered pier');town=await until(s=>s.actor.visible&&s.actor.standY===.4&&s.render.landmarks.fadedPlacements.includes('md:water-roof:3'),'boathouse roof fade');await shot('covered-pier');
 await moveTo({x:136,y:646},'Rusty Anchor T branch');const before=await inspect();await clickPoint({x:139,y:645});await page.waitForTimeout(400);const after=await inspect();assert(Math.hypot(after.player.x-before.player.x,after.player.y-before.player.y)<.08);mark('Raised covered pier, roof fade and T junction work while water blocks movement');
 await resumeAt({x:319,y:716});await moveTo({x:321,y:715},'railway approach');await moveTo({x:324,y:712},'railway crossing');await shot('railway');mark('Nautilus railway artwork loads and the supported crossing stays walkable');
 await visit('Donnelly Park');for(const [x,y]of [[478,478],[481,478],[481,481],[478,481],[478,478]])await moveTo({x,y},'four-sector corner');town=await inspect();assert(town.source.stats.peakDecoded<=9&&town.source.stats.peakFetches<=2);assert(town.render.blocks<=25);mark('Continuous sector travel retains bounded source and rendering residency');
 await page.locator('#menu').click();const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('farmyard-fighters:farmyard-mount-dora-tour-v1')));await page.reload();await page.waitForFunction(()=>document.body.dataset.gameReady==='true');await hook();await page.locator('#resume').click();town=await ready();
 assert(Math.hypot(town.player.x-saved.player.x,town.player.y-saved.player.y)<1e-6);assert.deepEqual(town.player.ammo,saved.player.ammo);assert.equal(town.player.hp,saved.player.hp);assert.equal(await page.evaluate(key=>localStorage.getItem(key),prisonKey),prisonSave);await page.locator('#menu').click();await shot('town-resumed');mark('Town save/resume preserves equipment and resources without rewriting the prison operation');
 await page.context().close();
 }
 const phone=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});page=await phone.newPage();capture(page);
 await page.goto(`http://127.0.0.1:${port}/game.html?activity=mount-dora`);await hook();await page.locator('#deploy').tap();let mobile=await ready();assert.equal(mobile.artRevision,pin.content.artRevision);assert.equal(mobile.combat.guards.length,42);
 const beforeTouch=mobile.distance,stick=await page.locator('#joystick').boundingBox(),cx=stick.x+stick.width/2,cy=stick.y+stick.height/2,cdp=await phone.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+24,y:cy+5}]});try{await until(s=>s.distance>beforeTouch+.35,'actual phone thumbstick movement');}finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
 await resumeAt({x:146,y:641});await moveTo({x:136,y:641},'phone covered pier');mobile=await until(s=>s.actor.visible&&s.actor.standY===.4&&s.render.landmarks.fadedPlacements.includes('md:water-roof:3'),'phone roof fade');
 assert.equal(mobile.memory.shaderFailures,0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#menu').tap();await shot('phone-covered-pier');mark('390 by 844 touch controls and raised covered-pier rendering use the normal game');
 await phone.close();
 assert.equal(report.errors.length,0);assert.equal(report.bad.length,0);assert.equal(report.failed.filter(r=>!r.error?.errorText?.includes('ERR_ABORTED')).length,0);report.success=true;write();
}catch(error){report.failure=error.stack;try{report.state=await inspect();await shot('failure');}catch{}write();console.error(error);process.exitCode=1;}finally{await close();clearTimeout(deadline);}
