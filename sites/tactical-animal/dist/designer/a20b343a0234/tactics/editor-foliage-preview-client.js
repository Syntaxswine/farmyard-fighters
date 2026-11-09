// A single disposable worker; pointer motion never rebuilds the live sector.
// Keep only the newest command and cap requests to eight per second.
export class FoliagePreviewClient{
 constructor(show){this.show=show;this.id=0;this.worker=null;this.timer=null;this.last=0;}
 request(document,command){
  this.pending={document,command,id:++this.id};
  if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;this.send();},Math.max(0,125-(performance.now()-this.last)));
 }
 send(){
  if(this.inflight||!this.pending)return;
  const delay=125-(performance.now()-this.last);if(delay>0){if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;this.send();},delay);return;}
  if(!this.worker){const worker=this.worker=new Worker(new URL('./editor-foliage-preview-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{if(this.worker!==worker)return;this.inflight=false;if(data.id===this.id)this.show(data.result);this.send();};worker.onerror=e=>{if(this.worker!==worker)return;this.stop();this.show({ok:false,error:'Foliage preview unavailable: '+e.message});};}
  const {document,command,id}=this.pending;this.pending=null;
  if(this.document!==document||this.revision!==document.revision){this.document=document;this.revision=document.revision;this.worker.postMessage({map:document.editor.map,size:document.size});}
  this.last=performance.now();this.inflight=true;this.worker.postMessage({command,id});
 }
 stop(){clearTimeout(this.timer);this.timer=null;this.worker?.terminate();this.worker=null;this.pending=null;this.inflight=false;this.document=null;this.id++;}
}
