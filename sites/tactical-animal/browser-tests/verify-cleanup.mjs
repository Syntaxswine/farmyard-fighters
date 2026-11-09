import net from 'node:net';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
// The fresh runner's only 4178 listener belongs to Playwright webServer.
const result=await new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port:4178});socket.setTimeout(2000);socket.once('connect',()=>{socket.destroy();resolve({released:false,reason:'Temporary server still accepts connections'});});socket.once('error',error=>resolve({released:error.code==='ECONNREFUSED',reason:error.code}));socket.once('timeout',()=>{socket.destroy();resolve({released:false,reason:'Connection check timed out'});});});
const output=fileURLToPath(new URL('../../../artifacts/window-browser/evidence/',import.meta.url));await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'server-cleanup.json',JSON.stringify({port:4178,checked:new Date().toISOString(),...result},null,2));console.log(JSON.stringify(result));if(!result.released)process.exitCode=1;
