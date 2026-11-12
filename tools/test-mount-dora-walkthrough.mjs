import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {installNativeProbe,inspectWebGL} from '../sites/tactical-animal/browser-tests/native-probe.mjs';
import {assertMapLocation} from '../sites/tactical-animal/browser-tests/map-location.mjs';
const shelterReview=process.argv.includes('--shelter-review');
// Fighters keeps operation and tour saves under app.js's real-time storage
// namespace, isolated from the bare keys inherited from Farmyard Commando.
const SAVE_NAMESPACE='farmyard-fighters:',COMMANDO_SAVES=['tactical-animal-operation-v2','farmyard-mount-dora-tour-v1'],[OPERATION_SAVE,TOUR_SAVE]=COMMANDO_SAVES.map(key=>SAVE_NAMESPACE+key);
const readSaves=(page,keys)=>page.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),keys);
// The two-core software-rendering runner uses a normal 800x600 desktop window.
// Keep the complete route/assertions and 390x844 touch coverage; video is opt-in.
const desktopViewport=process.env.CI?{width:800,height:600}:{width:1440,height:1000},recordVideo=process.env.WALKTHROUGH_VIDEO==='1';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),site=path.join(root,'dist'),out=path.join(root,'artifacts/mount-dora-walkthrough',shelterReview?'native-shelter':'native');
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
async function walkTo(page,town,{timeout=process.env.CI?180000:60000,tolerance=.14}={}){
  // Follow-camera easing continues after the previous route arrives. Project
  // against settled native frames so a stale screen point cannot miss a narrow
  // boardwalk target. This observes the real camera; it never sets its state.
  // Easing can carry a checked point under a HUD switch, so check it settled.
  let p=null;
  for(let n=0;n<4&&!p;n++){
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
    if(await onViewport(page,settled))p=settled;
  }
  if(!p)throw Error('Settled ground point stayed under the real-time HUD: '+town);
  await page.mouse.click(p.x,p.y);
  return waitInfo(page,s=>Math.hypot(s.player.x+.5-town[0],s.player.y+.5-town[1])<tolerance,'Walk did not arrive at '+town,timeout,s=>s.distance);
}
async function ready(page){return waitInfo(page,s=>s.active&&s.touring&&s.ready&&!s.paused,'Production tour did not become ready',90000);}
async function keyboardWalk(page,before){await page.keyboard.down('d');try{await waitInfo(page,s=>s.distance>before.distance+.45,'Actual keyboard movement was not observed',20000);}finally{await page.keyboard.up('d');}return snapshot(page);}
async function assertGL(page){
  const gl=await page.evaluate(inspectWebGL,'#viewport canvas');assert(gl.available&&!gl.contextLost);
  const probe=await page.evaluate(()=>window.__nativeProbe||null);return {gl,probe};
}
function routeTo(points,distanceLimit){
  const out=[points[0]];let distance=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),take=Math.min(length,distanceLimit-distance),n=Math.max(1,Math.ceil(take/6));
    for(let j=1;j<=n;j++)out.push([a[0]+(b[0]-a[0])*(take*j/n)/length,a[1]+(b[1]-a[1])*(take*j/n)/length]);distance+=take;if(distance>=distanceLimit-1e-6)break;
  }
  return out.filter((p,i,a)=>i===0||i===a.length-1||Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1])>.55);
}
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});port=server.address().port;
  browserServer=await chromium.launchServer({host:'127.0.0.1',headless:true,...(process.env.WALKTHROUGH_BROWSER_CHANNEL?{channel:process.env.WALKTHROUGH_BROWSER_CHANNEL}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  browser=await chromium.connect(browserServer.wsEndpoint());wsPort=Number(new URL(browserServer.wsEndpoint()).port);report.browser=browser.version();
  const child=browserServer.process(),record={owner:process.env.CODEX_THREAD_ID||'farmyard/mount-dora-walkthrough',purpose:'Actual production tour browser acceptance',project:root,runner:identity(process.pid,process.execPath),browser:identity(child.pid,child.spawnfile),ports:[port,wsPort],startedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+15*60*1000).toISOString(),stopMethod:'Owning browser/server APIs in finally; fifteen-minute automatic retirement',restart:{executable:process.execPath,args:['tools/test-mount-dora-walkthrough.mjs',...process.argv.slice(2)],script:'tools/test-mount-dora-walkthrough.mjs',cwd:root,environment:{CI:process.env.CI?'true':undefined,WALKTHROUGH_BROWSER_CHANNEL:process.env.WALKTHROUGH_BROWSER_CHANNEL||undefined,WALKTHROUGH_VIDEO:recordVideo?'1':'0'},runtime:'Node >=24; locked Playwright1.64.1; Chromium or WALKTHROUGH_BROWSER_CHANNEL',inputs:['dist/','locked sites/tactical-animal/browser-tests package'],outputs:out}};
  fs.writeFileSync(path.join(out,'helper.json'),JSON.stringify(record,null,2)+'\n');
  deadline=setTimeout(()=>{report.timeout=true;process.exitCode=1;void close();},15*60*1000);deadline.unref();
  const origin='http://127.0.0.1:'+port;
  fs.writeFileSync(path.join(out,'server-url.json'),JSON.stringify({origin,expiresAt:record.expiresAt,owner:record.owner,route:'/game.html?activity=mount-dora'})+'\n');
  console.log('NATIVE_REVIEW_URL '+origin+'/game.html?activity=mount-dora');
  if(!shelterReview){
  context=await browser.newContext({viewport:desktopViewport,acceptDownloads:true,...(recordVideo?{recordVideo:{dir:path.join(out,'video')}}:{})});
  await context.addInitScript(installNativeProbe);
  const page=await context.newPage(),log=capture(page,'desktop');
  await page.goto(origin+'/');await page.locator('#play-game').click();await page.waitForFunction(()=>typeof document.getElementById('deploy')?.onclick==='function'&&document.getElementById('animals').children.length>0);await page.locator('#deploy').click();
  await page.waitForFunction(()=>!document.getElementById('battle').hidden||document.getElementById('toast').textContent.includes('Cannot start'));if(await page.locator('#battle').isHidden())throw Error(await page.locator('#toast').textContent());
  await page.locator('#loading').waitFor({state:'hidden',timeout:90000});
  await menu(page,'Choose operation, animal & loadout');
  const [operationBefore]=await readSaves(page,[OPERATION_SAVE]);assert(operationBefore);assert.deepEqual(await readSaves(page,COMMANDO_SAVES),[null,null]);
  mark('existing mission deploys through the production title/game route');
  await page.locator('#operation-select').selectOption('mount-dora');await page.locator('#animals button').filter({hasText:'goat'}).first().click();await page.getByRole('button',{name:'Mosin-Nagant',exact:true}).click();await page.getByRole('button',{name:/Frag grenades/}).click();await page.locator('#deploy').click();
  let info=await ready(page);assert.equal(info.player.species,'goat');assert.equal(info.player.weapon,'rifle');assert.equal(info.phase,'explore');assert(info.actor.visible&&info.actor.meshes>0&&info.actor.vertices>0);assert.equal(info.render.blocks,9);assert(info.memory.programs>0);assert.equal(info.memory.shaderFailures,0);
  report.desktopHudLocation=await assertMapLocation(page,info.player);await page.locator('#minimap-button').click();report.desktopExpandedLocation=await assertMapLocation(page,info.player,{expanded:true});await shot(page,'desktop-town-map');await page.getByRole('button',{name:'Continue walking',exact:true}).click();
  await shot(page,'desktop-donnelly');mark('regular animal/loadout starts a free, physically clear Donnelly tour',{snapshot:info});
  const moved=await keyboardWalk(page,info);assert(moved.distance>info.distance+.2);
  assert(await page.locator('#grenade').isEnabled());
  // Fighters fights in real time: the point panel's timed FIRE trigger queues one
  // shot that lands after the aim time, and play never leaves exploration for a turn.
  await menu(page,'Aim firearm at a point');const aimPoint=await projectPoint(page,[moved.player.x+.5-5,moved.player.y+.5]);await page.mouse.click(aimPoint.x,aimPoint.y);await page.getByRole('button',{name:/^FIRE · \d+\.\d\d s$/}).click();
  const fired=await waitInfo(page,s=>s.player.ammo.rifle===moved.player.ammo.rifle-1,'Production firearm did not fire');assert.equal(fired.phase,'explore');
  // The former End Turn switch is the real-time Hold Fire / Fire at Will toggle.
  const fireControl=()=>page.evaluate(()=>({label:document.getElementById('end-turn').getAttribute('aria-label'),pressed:document.getElementById('end-turn').getAttribute('aria-pressed'),target:document.getElementById('realtime-target').textContent}));
  assert.deepEqual(await fireControl(),{label:'Fire at Will',pressed:'false',target:'HOLD FIRE'});const fireAtWillContacts=(await page.evaluate(async()=>(await import(document.querySelector('script[src*="app.js"]').src)).inspectRealtime())).contacts;
  await page.locator('#end-turn').click();await page.waitForFunction(()=>document.getElementById('end-turn').getAttribute('aria-pressed')==='true');assert.notEqual((await fireControl()).target,'HOLD FIRE');
  await page.locator('#end-turn').click();await page.waitForFunction(()=>document.getElementById('end-turn').getAttribute('aria-pressed')==='false');assert.deepEqual(await fireControl(),{label:'Fire at Will',pressed:'false',target:'HOLD FIRE'});
  const held=await snapshot(page);assert.equal(held.phase,'explore');assert.deepEqual(held.player.ammo,fired.player.ammo);
  await page.keyboard.press('g');await page.locator('#grenade-aim').waitFor({state:'visible'});await page.keyboard.down('a');await page.waitForTimeout(1000);await page.keyboard.up('a');
  await page.waitForFunction(()=>document.getElementById('grenade').dataset.ready==='true');await page.locator('#grenade').click();
  const thrown=await waitInfo(page,s=>s.player.ammo.grenade===fired.player.ammo.grenade-1,'Production grenade did not throw');assert.equal(thrown.phase,'explore');assert(thrown.player.hp>0);
  mark('real firearm, grenade, ammunition and Hold Fire / Fire at Will controls operate through production gameplay',{fireAtWillContacts});
  for(let i=0;i<4;i++)await page.locator('#zoom-out').click();
  await walkTo(page,[478.5,478.5]);
  const cornerBefore=await snapshot(page);for(const p of [[481.5,478.5],[481.5,481.5],[478.5,481.5],[478.5,478.5]])await walkTo(page,p,{timeout:process.env.CI?60000:15000});
  info=await snapshot(page);assert(info.distance>=cornerBefore.distance+11.5);assert.equal(info.phase,'explore');await shot(page,'desktop-four-sector-corner');mark('continuous production navigation crosses both axes and four-sector corner',{snapshot:info});
  await walkTo(page,[480.5,508.5]);const beforeWall=await snapshot(page),blocked=await panTo(page,[480.5,500.5]);await page.mouse.click(blocked.x,blocked.y);
  await page.waitForTimeout(1200);const wall=await snapshot(page);assert(Math.hypot(wall.player.x-beforeWall.player.x,wall.player.y-beforeWall.player.y)<.15);mark('boundary-spanning building wall does not admit the animal');
  let failed=false;await page.route('**/maps/mount-dora/sectors/C05.map.json*',route=>{if(!failed){failed=true;log.expectedFailures.push({url:route.request().url(),status:503});return route.fulfill({status:503,body:'Controlled offline source'});}return route.continue();});
  const beforeFailure=await snapshot(page);await visit(page,'Grantham Point lighthouse');
  await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('Could not load that landmark approach'),null,{timeout:30000});
  const afterFailure=await snapshot(page);assert(Math.hypot(afterFailure.player.x-beforeFailure.player.x,afterFailure.player.y-beforeFailure.player.y)<1e-6);
  await visit(page,'Grantham Point lighthouse');info=await waitInfo(page,s=>s.ready&&!s.paused&&Math.hypot(s.player.x-504,s.player.y-1168)<.1&&s.render?.landmarks?.residentIds.includes('md:lighthouse'),'Retry did not safely visit lighthouse');
  await shot(page,'desktop-lighthouse');assert(info.render.landmarks.residentIds.includes('md:lighthouse'));mark('failed source leaves position unchanged; explicit retry loads a real landmark',{snapshot:info});
  await page.unroute('**/maps/mount-dora/sectors/C05.map.json*');
  await visit(page,'Palm Island entrance');await waitInfo(page,s=>s.ready&&!s.paused&&Math.hypot(s.player.x-665.469,s.player.y-1296.0786)<.15,'Boardwalk entrance not ready');
  const entrance=features.find(f=>f.id==='osm-way-548471563').geometry.coordinates,bridge=features.find(f=>f.id==='osm-way-688219167').geometry.coordinates;
  const points=[...routeTo(entrance,Infinity),...routeTo(bridge,120).slice(1)],boardwalkBefore=await snapshot(page);
  for(let i=1;i<points.length;i++){await walkTo(page,points[i],{timeout:process.env.CI?60000:25000,tolerance:.16});if(i%8===0)console.log('Walking actual boardwalk '+i+'/'+points.length);}
  const overWater=await snapshot(page);assert.equal(overWater.player.ground,'bridge');await shot(page,'desktop-palm-boardwalk');
  for(let i=points.length-2;i>=0;i--){await walkTo(page,points[i],{timeout:process.env.CI?60000:25000,tolerance:.16});if(i%8===0)console.log('Returning actual boardwalk '+i+'/'+points.length);}
  const returned=await snapshot(page);assert(returned.distance>boardwalkBefore.distance+300);mark('actual entrance, mapped join, supported over-water walk and continuous return',{snapshot:returned});
  await page.waitForTimeout(2700);const saved=JSON.parse((await readSaves(page,[TOUR_SAVE]))[0]);assert(saved);assert(!Object.hasOwn(saved,'map'));assert(JSON.stringify(saved).length<600000);
  assert.equal((await readSaves(page,[OPERATION_SAVE]))[0],operationBefore);assert.deepEqual(await readSaves(page,COMMANDO_SAVES),[null,null]);
  await page.reload();await page.locator('#resume').click();info=await ready(page);
  assert(Math.hypot(info.player.x-saved.player.x,info.player.y-saved.player.y)<1e-6);assert.deepEqual(info.player.ammo,saved.player.ammo);assert.equal(info.player.species,saved.player.species);report.restoredHudLocation=await assertMapLocation(page,info.player);mark('tour reload restores global position/resources and preserves the operation save',{snapshot:info,saveBytes:JSON.stringify(saved).length});
  assert(info.source.stats.peakDecoded<=9&&info.source.stats.peakFetches<=2&&info.render.blocks<=9);
  report.desktopWebGL=await assertGL(page);await menu(page,'Choose operation, animal & loadout');info=await snapshot(page);assert.equal(info.source.decoded,0);assert.equal(info.source.inFlight,0);assert.equal(info.source.queued,0);mark('tour exit releases decoded sources and renderer residency');
  }
  // A new, actual touch context uses its own regular preparation and production route.
  phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,...(recordVideo?{recordVideo:{dir:path.join(out,'video')}}:{})});
  await phone.addInitScript(installNativeProbe);const mobile=await phone.newPage(),mobileLog=capture(mobile,'phone');
  await mobile.goto(origin+'/game.html?activity=mount-dora');await mobile.waitForFunction(()=>typeof document.getElementById('deploy')?.onclick==='function');assert.equal(await mobile.locator('#operation-select').inputValue(),'mount-dora');assert(await mobile.locator('#prep').isVisible());assert(await mobile.locator('#battle').isHidden());assert.deepEqual(await readSaves(mobile,[OPERATION_SAVE]),[null]);await mobile.locator('#deploy').click();const mobileBefore=await ready(mobile);
  const stick=await mobile.locator('#joystick').boundingBox(),cdp=await phone.newCDPSession(mobile),x=stick.x+stick.width/2,y=stick.y+stick.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:x+stick.width*.24,y:y+stick.height*.12}]});try{await waitInfo(mobile,s=>s.distance>mobileBefore.distance+.45,'Actual touch joystick movement was not observed',20000);}finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  const mobileMoved=await snapshot(mobile);assert(mobileMoved.distance>mobileBefore.distance+.2);assert(mobileMoved.actor.visible);const mobileKeyboard=await keyboardWalk(mobile,mobileMoved);assert(mobileKeyboard.distance>mobileMoved.distance+.2);await shot(mobile,'phone-donnelly');
  await visit(mobile,'Grantham Point lighthouse');await waitInfo(mobile,s=>s.ready&&!s.paused&&Math.hypot(s.player.x-504,s.player.y-1168)<.1&&s.render?.landmarks?.residentIds.includes('md:lighthouse'),'Phone landmark visit failed');report.phoneHudLocation=await assertMapLocation(mobile,(await snapshot(mobile)).player);await mobile.locator('#minimap-button').click();report.phoneExpandedLocation=await assertMapLocation(mobile,(await snapshot(mobile)).player,{expanded:true});await shot(mobile,'phone-town-map');await mobile.getByRole('button',{name:'Continue walking',exact:true}).click();await shot(mobile,'phone-lighthouse');
  await visit(mobile,'Gilbert Park');const shelter=await waitInfo(mobile,s=>s.ready&&!s.paused&&Math.hypot(s.player.x+.5-737.2963,s.player.y+.5-1181.367)<.1&&s.render?.landmarks?.fadedPlacements.includes('md:shelter:557154684'),'Open-shelter visit did not expose actor and roof focus');assert(shelter.actor.visible&&shelter.actor.meshes>0);assert(shelter.render.landmarks.occlusionMaterials>0);assert(shelter.source.stats.peakDecoded<=9&&shelter.source.stats.peakFetches<=2);await shot(mobile,'phone-gilbert-open-shelter');mark('open-shelter visit immediately shows the actor with roof focus',{snapshot:shelter});
  assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));report.phoneWebGL=await assertGL(mobile);mark('390x844 production touch joystick, character, landmark and layout');
  for(const l of report.pages){assert.deepEqual(l.errors,[],'Page errors in '+l.name);const unexpected=l.requests.filter(r=>!l.expectedFailures.some(e=>e.url===r.url&&e.status===r.status));assert.deepEqual(unexpected,[],'Unexpected failed assets in '+l.name);const severe=l.console.filter(x=>x.type==='error'&&!/503/.test(x.text));assert.deepEqual(severe,[],'Console errors in '+l.name);}
  report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;for(const [i,c]of (browser?.contexts()||[]).entries())for(const [j,p]of c.pages().entries())try{await p.screenshot({path:path.join(out,'failure-'+i+'-'+j+'.png')});report.failureUI=await p.evaluate(()=>({toast:document.getElementById('toast')?.textContent,loading:document.getElementById('loading')?.textContent,status:document.getElementById('tour-launch-status')?.textContent}));}catch{}write();throw error;}
finally{await close();if(!report.cleanup.httpReleased||!report.cleanup.wsReleased||!report.cleanup.browserProcessExited||report.cleanup.errors.length)process.exitCode=1;}
