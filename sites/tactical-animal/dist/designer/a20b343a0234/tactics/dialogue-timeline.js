// Pure presentation helpers; no access to gameplay RNG, time, inventory or saves.
export function phrases(text,max=140){
 const out=[];let start=0;
 while(start<text.length){let end=Math.min(text.length,start+max);if(end<text.length){const chunk=text.slice(start,end),breaks=[...chunk.matchAll(/[.!?;,](?:[”"']?)(?=\s)/g)];const last=breaks.at(-1);if(last&&last.index>max/3)end=start+last.index+last[0].length;else {const space=chunk.lastIndexOf(' ');if(space>0)end=start+space;}}
  out.push({text:text.slice(start,end),c0:start,c1:end});start=end;while(/\s/.test(text[start]||'')&&start<text.length)start++;
 }return out;
}
export function wordState(plan,time){let revealed=0,active=-1;for(let i=0;i<plan.words.length;i++){const w=plan.words[i];if(time>=w.t0)revealed=w.c1;if(time>=w.t0&&time<w.t1)active=i;}return {revealed,active};}
export class ByteCache {
 constructor(limit=16*1024*1024){this.limit=limit;this.bytes=0;this.entries=new Map();}
 get(key){const e=this.entries.get(key);if(!e)return null;this.entries.delete(key);this.entries.set(key,e);return e.value;}
 set(key,value,bytes){this.delete(key);if(bytes>this.limit)return;this.entries.set(key,{value,bytes});this.bytes+=bytes;this.trim();}
 delete(key){const e=this.entries.get(key);if(e){this.bytes-=e.bytes;this.entries.delete(key);}}
 budget(limit){this.limit=Math.max(0,limit);this.trim();}
 trim(){while(this.bytes>this.limit)this.delete(this.entries.keys().next().value);}
 clear(){this.entries.clear();this.bytes=0;}
}
