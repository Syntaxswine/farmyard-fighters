import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import {audit,argumentsOf,root,writeJSON,hash,sourceChanges,addedPaths} from './review-mount-dora-workshop.mjs';
import {reviewServer} from './serve-mount-dora-workshop.mjs';
const options=argumentsOf(process.argv.slice(2)),review=await audit(options);
assert(fs.existsSync(path.join(review.source,'dist/index.html')),'Build the pinned source first.');
const {chromium}=await import(pathToFileURL(path.join(root,'sites/tactical-animal/browser-tests/node_modules/playwright/index.mjs')).href);
let browser,context,server,page,frame;const errors=[],evidence={nautilusCommit:review.report.nautilusCommit,sourceMode:review.report.sourceMode,projectId:review.report.projectId,projectSha256:review.report.projectSha256,sourceDigest:review.report.sourceDigest,scenarios:[],errors};
const nativeOut=path.join(review.out,'native');fs.mkdirSync(nativeOut,{recursive:true});
const project=JSON.parse(fs.readFileSync(review.project)),byId=new Map(project.sectors.map(s=>[s.id,s]));
const ready=review.report.sectors.filter(s=>s.nativeReady);
const samples=review.report.sourceMode==='fixtures'?['fixture-downtown','fixture-shoreline','fixture-boundary']:
  [...new Set([ready.find(r=>r.id==='C03')?.id||ready.find(r=>JSON.stringify(byId.get(r.id)).toLowerCase().includes('downtown'))?.id,
    ready.find(r=>r.id==='C05')?.id||[...ready].sort((a,b)=>{const water=r=>JSON.parse(fs.readFileSync(path.join(path.dirname(review.project),r.file))).terrain.flat().filter(t=>t==='water').length;return water(b)-water(a);})[0]?.id,
    ready.find(r=>r.id==='A01')?.id||ready.find(r=>{const s=byId.get(r.id);return s.row===0||s.column===0||s.row===project.rows-1||s.column===project.columns-1;})?.id,
    ...ready.map(r=>r.id)])].filter(Boolean).slice(0,3);
assert.equal(samples.length,3,'Need three native-import-ready representative sectors');
let deadline;
try{
  server=await reviewServer(review);
  browser=await chromium.launch({headless:true,...(process.env.WORKSHOP_BROWSER_CHANNEL?{channel:process.env.WORKSHOP_BROWSER_CHANNEL}:{}),
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  evidence.browser={version:browser.version(),channel:process.env.WORKSHOP_BROWSER_CHANNEL||'locked-playwright-chromium',headless:true,softwareWebGL:true};
  deadline=setTimeout(()=>{browser.close().catch(()=>{});process.exitCode=1;},14*60*1000);deadline.unref();
  context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true,...(process.env.CI?{recordVideo:{dir:path.join(nativeOut,'video')}}:{})});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  await page.goto(server.url+'/maps/mount-dora/workshop/');
  await page.waitForFunction(()=>document.querySelectorAll('#grid button').length>0);
  frame=await (await page.locator('#workshop').elementHandle()).contentFrame();
  await frame.waitForURL('**/nautilus/',{timeout:30000});
  console.log('Workshop frame attached');
  await frame.waitForFunction(()=>window.nautilus?.document&&!window.editor3d.loading&&!document.getElementById('nautilus-buildings').disabled,null,{timeout:90000});
  await page.locator('#grid button').first().click();await page.waitForFunction(()=>!document.getElementById('download').disabled);
  await page.screenshot({path:path.join(nativeOut,'atlas-desktop.png'),fullPage:true});
  for(const id of samples){
    const receipt=review.report.sectors.find(s=>s.id===id),file=path.join(path.dirname(review.project),receipt.file),raw=fs.readFileSync(file,'utf8'),input=JSON.parse(raw);
    console.log('Opening '+id);
    await page.locator('#grid button').filter({hasText:byId.get(id).name||id}).click();await page.waitForFunction(()=>!document.getElementById('open').disabled);
    await page.locator('#open').click();await frame.waitForFunction(name=>window.nautilus.document.map.name===name&&!window.editor3d.loading,input.name);
    assert.deepEqual(sourceChanges(input,JSON.parse(await frame.evaluate(()=>window.nautilus.export()))),[],'Atlas bridge changed source values');
    // Native file input exercises the workshop import handler, independently of the atlas bridge.
    await frame.evaluate(()=>{window.__mountDoraBeforeImport=window.nautilus.document;});
    await frame.locator('#import').setInputFiles(file);await frame.waitForFunction(name=>window.nautilus.document!==window.__mountDoraBeforeImport&&window.nautilus.document.map.name===name&&!window.editor3d.loading,input.name);
    const normalized=await frame.evaluate(()=>window.nautilus.export());assert.deepEqual(sourceChanges(input,JSON.parse(normalized)),[],'Native import changed source values');
    const nativeAddedPaths=addedPaths(input,JSON.parse(normalized));console.log('Native imported '+id);
    await frame.evaluate(async()=>{const e=window.editor3d;Object.assign(e.view,{x:120,y:120,span:320,preset:'0'});e.scene.changed();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    await frame.locator('#scene').screenshot({path:path.join(nativeOut,id+'-overview.png')});
    const command=receipt.editCommand,p=command.start;
    await frame.evaluate(async point=>{const e=window.editor3d;Object.assign(e.view,{x:point.x,y:point.y,span:22,preset:'0'});e.scene.changed();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},p);
    // Native terrain control and trusted canvas gesture; no document or controller mutation in this edit.
    await frame.locator('[data-group="terrain"]').click();
    await frame.locator('#tool-mode').selectOption(command.tool);
    if(command.tool==='texture')await frame.locator('#ground-kind').selectOption(command.options.groundKind);
    const coordinates=await frame.evaluate(point=>{const c=document.getElementById('scene');return window.editor3d.scene.projectTile(point,c.clientWidth,c.clientHeight);},p);
    await frame.locator('#scene').click({position:{x:coordinates.x,y:coordinates.y}});
    await frame.waitForFunction(point=>window.editor3d.document.map.terrain[point.y][point.x]===point.tool&&!window.editor3d.loading,{...p,tool:command.tool==='texture'?command.options.groundKind:command.tool});
    const edited=await frame.evaluate(()=>window.nautilus.export()),expected=review.N.openDocument(normalized);assert(expected.apply(command).ok);
    assert.equal(edited,expected.export(),'Native terrain gesture changed unexpected source fields');
    await frame.locator('#undo').click();await frame.waitForFunction(value=>window.nautilus.export()===value&&!window.editor3d.loading,normalized);
    await frame.locator('#redo').click();await frame.waitForFunction(value=>window.nautilus.export()===value&&!window.editor3d.loading,edited);
    const other=project.sectors.find(s=>s.id!==id&&review.report.sectors.find(r=>r.id===s.id)?.nativeReady);
    await page.locator('#grid button').filter({hasText:other.name||other.id}).click();await page.waitForFunction(()=>!document.getElementById('open').disabled);
    assert.equal(await frame.evaluate(()=>window.nautilus.export()),edited,'Selecting a neighbor discarded current edits');
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#open').click();
    assert.equal(await frame.evaluate(()=>window.nautilus.export()),edited,'Dismissing replacement discarded current edits');
    if(!await frame.locator('#export').isVisible())await frame.locator('#settings-button').click();
    const [download]=await Promise.all([page.waitForEvent('download'),frame.locator('#export').click()]);
    const exported=path.join(nativeOut,id+'-edited.json');await download.saveAs(exported);assert.equal(fs.readFileSync(exported,'utf8'),edited);
    page.once('dialog',dialog=>dialog.accept());await frame.locator('#import').setInputFiles(exported);
    await frame.waitForFunction(value=>window.nautilus.export()===value&&!window.editor3d.loading,edited);
    assert.equal(sourceChanges(JSON.parse(expected.export()),JSON.parse(await frame.evaluate(()=>window.nautilus.export()))).length,0);
    if(await frame.locator('#editor-settings').evaluate(e=>e.open))await frame.locator('#close-settings').click();
    await page.screenshot({path:path.join(nativeOut,id+'.png'),fullPage:true});
    const rendering=await frame.evaluate(()=>{const e=window.editor3d,r=e.scene.renderer,c=document.getElementById('scene'),prior=r.info.autoReset;r.info.autoReset=false;r.info.reset();try{e.scene.draw(e.view,c.clientWidth,c.clientHeight);return {scope:'one explicit native draw, accumulated across render passes',calls:r.info.render.calls,triangles:r.info.render.triangles,geometries:r.info.memory.geometries,textures:r.info.memory.textures,programs:r.info.programs.length,failedPrograms:r.info.programs.filter(p=>p.diagnostics?.runnable===false).length};}finally{r.info.autoReset=prior;}});
    assert.equal(rendering.failedPrograms,0);evidence.scenarios.push({id,sourceSha256:receipt.sha256,exportSha256:hash(edited),nativeImport:true,nativeTerrainGesture:true,nativeUndoRedo:true,nativeExportReopen:true,selectionPreservesEdits:true,sourceValuesPreserved:true,features:receipt.features,nativeAddedPaths,rendering});
    console.log('PASS native workflow '+id);
  }
  const water=review.report.sectors.find(s=>!s.nativeReady);
  if(water){const sector=byId.get(water.id);await page.locator('#grid button').filter({hasText:sector.name||sector.id}).click();await page.waitForFunction(()=>document.getElementById('readiness').textContent==='Native import blocked');
    assert(await page.locator('#open').isDisabled());assert(await page.locator('#download').isEnabled());evidence.blockedSector={id:water.id,downloadAvailable:true,openDisabled:true,errors:water.errors};}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(nativeOut,'atlas-phone.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Atlas overflows phone width');
  assert.deepEqual(errors,[],'Browser errors');evidence.passed=true;
} catch(error){evidence.passed=false;evidence.failure=error.stack;
  if(frame){try{evidence.failureState=await Promise.race([frame.evaluate(()=>({status:document.getElementById('status')?.textContent,loading:window.editor3d?.loading,name:window.nautilus?.document?.map?.name})),new Promise(resolve=>setTimeout(resolve,3000,{unresponsive:true}))]);}catch{}}
  if(page)await page.screenshot({path:path.join(nativeOut,'failure.png'),fullPage:true,timeout:5000}).catch(()=>{});
  throw error;}
finally{
  clearTimeout(deadline);if(context)await context.close();if(browser)await browser.close();if(server){await server.close();evidence.portReleased=await new Promise(resolve=>{const s=net.connect(server.port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});}
  evidence.helpersClosed=true;writeJSON(path.join(nativeOut,'summary.json'),evidence);
}
