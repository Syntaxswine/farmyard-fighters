import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.env.PREVIEW_BUILD==='1'?'dist':'sites/tactical-animal/dist');
const port=Number(process.env.PORT||4495);
const marker=path.resolve('artifacts/preview/STOP');
const deadline=Date.now()+30*60*1000;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  let file;try{file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));}catch{res.writeHead(400).end();return;}
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
});
let closing=false;
function stop(reason){if(closing)return;closing=true;clearInterval(retire);server.close(()=>{console.log(JSON.stringify({status:'stopped',reason,pid:process.pid}));process.exit(0);});server.closeAllConnections();}
const retire=setInterval(()=>{if(fs.existsSync(marker)||Date.now()>=deadline)stop(fs.existsSync(marker)?'task_complete':'30_minute_expiry');},500);
process.on('SIGINT',()=>stop('SIGINT'));process.on('SIGTERM',()=>stop('SIGTERM'));
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${port}`,pid:process.pid,root,expiresAt:new Date(deadline).toISOString(),stop:marker})));
