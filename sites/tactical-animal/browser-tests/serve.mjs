import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../../../dist/',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ogg':'audio/ogg'};
const server=http.createServer((req,res)=>{
  let file;try{const url=new URL(req.url,'http://localhost');file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));}catch{res.writeHead(400).end();return;}
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end(file.slice(root.length));return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
});
let closing=false;function stop(){if(closing)return;closing=true;clearTimeout(expiry);server.close(()=>process.exit(0));server.closeAllConnections();}
const expiry=setTimeout(stop,8*60*1000);expiry.unref();process.on('SIGTERM',stop);process.on('SIGINT',stop);
server.listen(4178,'127.0.0.1',()=>console.log('Isolated test server: 127.0.0.1:4178; eight-minute expiry; owned by Playwright webServer.'));
