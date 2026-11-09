import {importLadderRoutes} from './ladder-motion.js';
const pending=new Map();let worker;
function fail(error){worker?.terminate();worker=null;for(const request of pending.values()){clearTimeout(request.timer);request.reject(error);}pending.clear();}
// One worker serializes expensive preparation, while the page remains responsive.
// Resolved routes persist across encounters; a failed request can be retried.
export function prepareLadderRoute(profile,kind){
 if(profile.id==='hen')return Promise.resolve();
 const key=profile.id+':'+kind;if(pending.has(key))return pending.get(key).promise;
 if(!worker){try{worker=new Worker(new URL('./ladder-preparation-worker.js',import.meta.url),{type:'module'});}catch(error){return Promise.reject(error);}
  worker.onerror=e=>fail(Error(e.message||'Ladder preparation worker failed'));
  worker.onmessage=({data})=>{const request=pending.get(data.key);if(!request)return;if(data.started){request.timer=setTimeout(()=>fail(Error('Ladder preparation timed out')),180000);return;}clearTimeout(request.timer);if(data.error){pending.delete(data.key);request.reject(Error(data.error));}else{try{importLadderRoutes(data.routes);request.resolve();}catch(error){pending.delete(data.key);request.reject(error);}}};
 }
 let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}),timer=null;pending.set(key,{promise,resolve,reject,timer});worker.postMessage({key,species:profile.id,kind});return promise;
}
