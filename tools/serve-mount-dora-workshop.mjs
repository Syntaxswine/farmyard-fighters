import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {root,confined,writeJSON,audit,argumentsOf} from './review-mount-dora-workshop.mjs';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.bin':'application/octet-stream'};
export async function reviewServer(review){
  const sourceMode=review.report.sourceMode,host={kind:'mount-dora-workshop-review-v1',nautilusCommit:review.report.nautilusCommit,
    sourceMode,project:'/maps/mount-dora/project.json',audit:'/maps/mount-dora/workshop/audit.json',workshop:'/nautilus/'};
  const server=http.createServer((req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
      const reply=value=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
      if(pathname==='/maps/mount-dora/workshop/host.json')return reply(host);
      if(pathname==='/maps/mount-dora/workshop/audit.json')return reply(review.report);
      const mounts=[['/maps/mount-dora/workshop/',path.join(root,'maps/mount-dora/workshop')],['/maps/mount-dora/',path.dirname(review.project)],['/nautilus/',path.join(review.source,'dist')]];
      const mount=mounts.find(([prefix])=>pathname.startsWith(prefix));if(!mount){res.writeHead(404);return res.end();}
      const [prefix,base]=mount,relative=pathname.slice(prefix.length)||'index.html',file=confined(base,relative);
      if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
    }catch(error){res.writeHead(400);res.end(error.message);}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port,start=new Date().toISOString(),expires=new Date(Date.now()+15*60*1000).toISOString();
  let processStartedAt=new Date(Date.now()-process.uptime()*1000).toISOString(),creationTimeSource='Node uptime approximation';
  if(process.platform==='win32'){processStartedAt=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-Command',"(Get-CimInstance Win32_Process -Filter 'ProcessId = "+process.pid+"').CreationDate.ToUniversalTime().ToString('o')"],{encoding:'utf8',windowsHide:true}).trim();creationTimeSource='Win32_Process.CreationDate';}
  const record={owner:process.env.CODEX_THREAD_ID||'farmyard-graphics/mount-dora-workshop',project:root,purpose:'Isolated fixed-workshop native acceptance',
    pid:process.pid,processStartedAt,creationTimeSource,executable:process.execPath,port,start,expires,
    stopMethod:'Await browser.close and server.close in the owning review script; process exit also releases the in-process server.',
    restart:{script:'tools/test-mount-dora-workshop.mjs',arguments:process.argv.slice(2),cwd:root,dependencies:'Node 24; locked sites/tactical-animal/browser-tests package; Playwright browser or WORKSHOP_BROWSER_CHANNEL',state:'No authoritative edits; fixtures and exported outputs are durable in artifacts.'}};
  writeJSON(path.join(review.out,'helper.json'),record);
  let closing;const close=(reason='completed')=>{if(closing)return closing;clearTimeout(expiry);server.closeAllConnections();closing=new Promise(resolve=>server.close(resolve)).then(()=>writeJSON(path.join(review.out,'helper-cleanup.json'),{pid:process.pid,processStartedAt,port,closed:true,reason,at:new Date().toISOString()}));return closing;};
  const expiry=setTimeout(()=>close('15-minute expiry').catch(error=>{console.error(error);process.exitCode=1;}),15*60*1000);expiry.unref();
  return {url:'http://127.0.0.1:'+port,port,close};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const review=await audit(argumentsOf(process.argv.slice(2))),server=await reviewServer(review);
  console.log('Workshop atlas: '+server.url+'/maps/mount-dora/workshop/ (automatic shutdown in 15 minutes)');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close().catch(error=>{console.error(error);process.exitCode=1;}));
}
