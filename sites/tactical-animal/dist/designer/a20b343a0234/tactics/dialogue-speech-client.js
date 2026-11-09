import {ByteCache} from './dialogue-timeline.js';
const abort=()=>new DOMException('Conversation changed','AbortError');
export class SpeechClient {
 constructor({WorkerClass=globalThis.Worker,timeout=12000}={}){this.WorkerClass=WorkerClass;this.timeout=timeout;this.nextId=0;this.pending=new Map();this.cache=new ByteCache(10*1024*1024);this.worker=null;this.closed=false;}
 prepare(text,profile,rate){if(this.closed)return Promise.reject(abort());const key=JSON.stringify([text,profile,rate]),cached=this.cache.get(key);if(cached)return Promise.resolve(cached);
  if(!this.worker){this.worker=new this.WorkerClass(new URL('./dialogue-speech-worker.js',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{const job=this.pending.get(data.id);if(!job)return;clearTimeout(job.timer);this.pending.delete(data.id);if(data.error)job.reject(Error(data.error));else {this.cache.set(job.key,data.clip,data.clip.samples.byteLength);job.resolve(data.clip);}};this.worker.onerror=()=>this.cancel(Error('Voice preparation failed.'));}
  const id=++this.nextId;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.cancel(Error('Voice preparation timed out.')),this.timeout);this.pending.set(id,{resolve,reject,key,timer});this.worker.postMessage({id,text,profile,rate});});
 }
 reserve(bytes){this.cache.budget(Math.min(10*1024*1024,16*1024*1024-bytes));}
 cancel(error=abort()){this.worker?.terminate();this.worker=null;for(const job of this.pending.values()){clearTimeout(job.timer);job.reject(error);}this.pending.clear();}
 dispose(){this.closed=true;this.cancel();this.cache.clear();}
 get resources(){return {workers:this.worker?1:0,pending:this.pending.size,cacheBytes:this.cache.bytes};}
}
