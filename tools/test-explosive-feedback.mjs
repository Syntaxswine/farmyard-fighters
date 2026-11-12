import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {windowReviewSource} from '../sites/tactical-animal/dist/window-review-map.js';

const root=process.cwd(),site=path.join(root,'dist'),out=path.join(root,'artifacts/explosions/native');
fs.mkdirSync(out,{recursive:true});
const {chromium}=await import(pathToFileURL(process.env.FIGHTERS_PLAYWRIGHT_MODULE||path.join(root,'sites/tactical-animal/browser-tests/node_modules/playwright/index.mjs')).href);
const report={owner:'farmyard-fighters/explosive-feedback',purpose:'Production barrel picking, explosive impacts, camera shake and reduced motion',startedAt:new Date().toISOString(),helpers:[],cases:[],errors:[],badResponses:[]};
const save=()=>fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');
const identity=pid=>({pid,created:process.platform==='win32'?execFileSync('powershell.exe',['-NoLogo','-NoProfile','-Command',`(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CreationDate.ToUniversalTime().ToString('o')`],{encoding:'utf8',windowsHide:true}).trim():execFileSync('ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8'}).trim()});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.wav':'audio/wav','.webp':'image/webp','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
  let file;try{file=path.resolve(site,'.'+decodeURIComponent(url.pathname));}catch{res.writeHead(400).end();return;}
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
const released=port=>new Promise(resolve=>{const socket=net.connect(port,'127.0.0.1');socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',()=>resolve(true));socket.setTimeout(1500,()=>{socket.destroy();resolve(false);});});
let browser,browserServer,port,wsPort,deadline,page;
const read=page=>page.evaluate(async()=>{const api=await import(document.querySelector('script[src*="window-yard.js"]').src);return {...api.inspectWindowYard(),...api.inspectExplosionFeedback()};});
async function until(page,predicate,label,timeout=30000){let state;const end=Date.now()+timeout;while(Date.now()<end){state=await read(page);if(predicate(state))return state;await page.waitForTimeout(50);}throw Error(label+': '+JSON.stringify(state));}
async function tap(page,selector,phone){const item=page.locator(selector);if(phone){const box=await item.boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);}else await item.click();}
async function groundTap(page,point,phone){
  const pixel=await page.evaluate(async point=>{const api=await import(document.querySelector('script[src*="window-yard.js"]').src);return api.projectWindowYard(point);},point);
  assert.ok(pixel.visible,JSON.stringify(pixel));if(phone)await page.touchscreen.tap(pixel.x,pixel.y);else await page.mouse.click(pixel.x,pixel.y);
}
async function zoomOutWithPinch(page){
  const bounds=await page.locator('#viewport').boundingBox(),x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
  const cdp=await page.context().newCDPSession(page);
  try{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-70,y},{x:x+70,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-48,y},{x:x+48,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  }finally{await cdp.detach();}
}
// Declared synthetic data, loaded through the existing editor Playtest import.
// It retains normal AI, ammunition, damage, fire, doors, reload and save rules.
const source=windowReviewSource();source.edges={};source.farmyardWindows.instances=[];
source.starts[0]={x:20,y:25,z:0,heading:0};
source.props=[{kind:'barrel-explosive',x:28,y:25,z:0},{kind:'barrel-explosive',x:31,y:25,z:0}];
source.guards=[{name:'Distant sentry',species:'pig-foreman',weapon:'pistol',x:60,y:25,heading:0}];
async function exercise(kind,phone,reduced=false){
  const name=(phone?'phone':'desktop')+'-'+kind+(reduced?'-reduced':''),context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1100,height:850},isMobile:phone,hasTouch:phone,reducedMotion:reduced?'reduce':'no-preference'});
  // Seed the editor's actual namespaced key before fork-storage installs its proxy.
  await context.addInitScript(source=>localStorage.setItem('farmyard-fighters:tools:farmyard-window-authored-map',JSON.stringify(source)),source);
  page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>report.errors.push({name,message:error.stack||String(error)}));
  page.on('response',response=>{if(response.status()>=400)report.badResponses.push({name,status:response.status(),url:response.url()});});
  try{
    await page.goto(`http://127.0.0.1:${port}/window-yard.html?authored=1`);
    await page.locator('#loading').waitFor({state:'hidden'});
    if(kind==='rpg'){await page.locator('#weapon').selectOption('rpg');await page.locator('#loading').waitFor({state:'hidden'});}
    else await page.locator('#fire-mode').selectOption('single');
    await until(page,s=>s.assets&&s.props.length===2,'imported barrels ready');
    if(phone)await zoomOutWithPinch(page);
    const before=await read(page);
    if(kind==='grenade')await tap(page,'#grenade',phone);
    await groundTap(page,kind==='grenade'?{x:27,y:25,h:0}:{x:28,y:25,h:.4},phone);
    if(kind!=='grenade')assert.match(await page.locator('#message').textContent(),/Explosive barrel targeted/);
    assert.equal(await page.locator('#fire').isEnabled(),true);
    await tap(page,'#fire',phone);
    let state=await until(page,s=>s.props.length===0&&s.fireAnimations.filter(e=>e.kind==='barrel').length===2,'production detonation');
    state=await until(page,s=>reduced?s.fires.length>0:s.blastShake.byKind.barrel===2&&s.blastShake.peak>0,'impact shake');
    assert.equal(state.shaderFailures,0);assert.equal(state.units[0].hp,before.units[0].hp);
    if(reduced){assert.equal(state.blastShake.count,0);assert.equal(state.blastShake.peak,0);}
    else{
      if(kind!=='barrel')assert.equal(state.blastShake.byKind[kind],1);
      if(kind==='grenade')assert.ok(state.blastShake.last.at>=state.lastDischarge.impactAt,'No shake before the grenade lands');
      assert.ok(state.blastShake.peak>=4&&state.blastShake.peak<=12.000001,'A visible, bounded shake for nearby explosions');
    }
    const impact=structuredClone(state.blastShake);
    state=await until(page,s=>s.blastShake.pixels?.at>(impact.last?.at||0)+650&&s.blastShake.pixels.x===0&&s.blastShake.pixels.y===0,'camera settled');
    assert.deepEqual(state.camera,before.camera,'No permanent camera drift or zoom change');
    if(kind==='barrel'){
      await tap(page,'#save',phone);await tap(page,'#restore',phone);
      await page.locator('#loading').waitFor({state:'hidden'});state=await read(page);
      assert.equal(state.props.length,0);assert.equal(state.blastShake.count,0);
    }
    await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
    report.cases.push({name,shake:impact,propsRemaining:state.props.length,shaderFailures:state.shaderFailures});save();
    console.log('PASS '+name+' native targeting, detonation, shake timing, settling and camera stability');
  }catch(error){try{report.failureState=await read(page);await page.screenshot({path:path.join(out,name+'-failure.png'),fullPage:true});save();}catch{}throw error;}
  finally{await context.close();}
}
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});port=server.address().port;
  report.helpers.push({...identity(process.pid),executable:process.execPath,project:root,purpose:'Production explosion acceptance and temporary static server',port,source:'tools/test-explosive-feedback.mjs',cwd:root,expiry:'Six minutes maximum; sooner on completion',stop:'finally closes server and browser'});save();
  deadline=setTimeout(()=>{report.failure='Explosion acceptance deadline expired';save();void browserServer?.close().finally(()=>{server.closeAllConnections();server.close();process.exitCode=1;});},360000);
  browserServer=await chromium.launchServer({host:'127.0.0.1',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  wsPort=Number(new URL(browserServer.wsEndpoint()).port);
  report.helpers.push({...identity(browserServer.process().pid),executable:browserServer.process().spawnfile,project:root,purpose:'Disposable native explosion browser',port:wsPort,expiry:'Current acceptance only',stop:'browserServer.close()'});save();
  browser=await chromium.connect(browserServer.wsEndpoint());
  for(const phone of [false,true])for(const kind of ['barrel','rpg','grenade'])await exercise(kind,phone);
  await exercise('barrel',true,true);
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.badResponses,[]);report.success=true;
}catch(error){report.failure=error.stack||String(error);console.error(report.failure);process.exitCode=1;}
finally{
  clearTimeout(deadline);const errors=[];
  for(const helper of [browser,browserServer])try{await helper?.close();}catch(error){errors.push(error.message);}
  server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve));
  const child=browserServer?.process();report.cleanup={httpPort:port,httpReleased:!port||await released(port),wsPort,wsReleased:!wsPort||await released(wsPort),browserExited:!child||child.exitCode!==null||child.signalCode!==null,errors};
  save();if(!report.cleanup.httpReleased||!report.cleanup.wsReleased||!report.cleanup.browserExited||errors.length)process.exitCode=1;
  console.log(JSON.stringify({success:report.success,cases:report.cases.length,cleanup:report.cleanup},null,2));
}
