import {parseMap} from './core/maps.js';
export function receivePlaytest(token,{host=window,timeout=15000}={}){
 return new Promise((resolve,reject)=>{
  if(!host.opener){reject(Error('Open this playtest from the Map Editor.'));return;}
  const cleanup=()=>{clearTimeout(timer);host.removeEventListener('message',receive);};
  const receive=event=>{if(event.source!==host.opener||event.origin!==host.location.origin||event.data?.type!=='aft-editor-map'||event.data.token!==token)return;cleanup();try{resolve(parseMap(event.data.json));}catch(e){reject(Error('Playtest map rejected: '+e.message));}};
  const timer=setTimeout(()=>{cleanup();reject(Error('Editor handoff timed out. Return to the editor and launch Playtest again.'));},timeout);
  host.addEventListener('message',receive);host.opener.postMessage({type:'aft-editor-ready',token},host.location.origin);
 });
}
export function launchPlaytest(json){
 // Full canonical validation happens before opening any test window.
 parseMap(json);const token=crypto.randomUUID(),url=new URL('./battle-3d.html',location.href);url.searchParams.set('editorPlaytest',token);
 const child=window.open(url.href,'aft-playtest-'+token);if(!child)throw Error('Allow pop-ups for this site to launch Playtest.');
 const receive=event=>{if(event.source!==child||event.origin!==location.origin||event.data?.type!=='aft-editor-ready'||event.data.token!==token)return;child.postMessage({type:'aft-editor-map',token,json},location.origin);cleanup();};
 const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);};const timer=setTimeout(cleanup,30000);window.addEventListener('message',receive);return child;
}
