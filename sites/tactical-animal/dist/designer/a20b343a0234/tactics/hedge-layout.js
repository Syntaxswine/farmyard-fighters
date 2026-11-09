import {groundHash,groundNoise} from './biome-ground-composition.js';

// World units, one unit per tile. These are art contracts, not map prop IDs.
export const HEDGE_FORMS=Object.freeze({
 short:Object.freeze({name:'Clipped cover hedge',height:.90,radius:.355,variation:.035}),
 tall:Object.freeze({name:'Country hedgerow',height:2.12,radius:.405,variation:.32})
});
export const HEDGE_CHUNK_SIZE=16;
const key=(x,z)=>`${x},${z}`,clamp=v=>Math.max(0,Math.min(1,v)),mix=(a,b,t)=>a+(b-a)*t;
export {groundHash as hedgeHash};

export function createHedgePlan(input,{seed=173}={}){
 if(!Array.isArray(input)||!Number.isSafeInteger(seed))throw Error('Invalid hedge plan');
 const cells=input.map(c=>({x:c.x,z:c.z,base:c.base??0,kind:c.kind??'short',...(c.seed===undefined?{}:{seed:c.seed})}));
 const lookup=new Map();
 for(const c of cells){
  if(!Number.isSafeInteger(c.x)||!Number.isSafeInteger(c.z)||!Number.isFinite(c.base)||(c.seed!==undefined&&!Number.isSafeInteger(c.seed))||!Object.hasOwn(HEDGE_FORMS,c.kind))throw Error('Invalid hedge cell');
  if(lookup.has(key(c.x,c.z)))throw Error('Duplicate hedge cell');
  lookup.set(key(c.x,c.z),c);
 }
 cells.sort((a,b)=>a.z-b.z||a.x-b.x);
 const edges=[],byCell=new Map(cells.map(c=>[key(c.x,c.z),[]]));
 for(const c of cells){
  // Isolated end points also close the round caps of connected runs.
  const point={a:c,b:c};edges.push(point);byCell.get(key(c.x,c.z)).push(point);
  for(const [dx,dz]of [[1,0],[0,1]]){
   const b=lookup.get(key(c.x+dx,c.z+dz));if(!b||b.base!==c.base)continue;
   const edge={a:c,b};edges.push(edge);byCell.get(key(c.x,c.z)).push(edge);byCell.get(key(b.x,b.z)).push(edge);
  }
 }
 function sample(x,z,base=0){
  let best=null;
  const ix=Math.round(x),iz=Math.round(z),candidates=new Set();
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const e of byCell.get(key(ix+dx,iz+dz))||[])candidates.add(e);
  for(const {a,b}of candidates){
   if(a.base!==base)continue;
   const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1));
   const cx=mix(a.x,b.x,t),cz=mix(a.z,b.z,t),fa=HEDGE_FORMS[a.kind],fb=HEDGE_FORMS[b.kind];
   const tall=mix(a.kind==='tall'?1:0,b.kind==='tall'?1:0,t);
   const radius=mix(fa.radius,fb.radius,t)+(mix(groundNoise(cx,cz,2.3,(a.seed??seed)+7),groundNoise(cx,cz,2.3,(b.seed??seed)+7),t)-.5)*mix(.045,.11,tall);
   const distance=Math.hypot(x-cx,z-cz),value=radius-distance;
   if(!best||value>best.value)best={value,distance,radius,cx,cz,tall,height:mix(fa.height,fb.height,t)+(mix(groundNoise(cx,cz,2.7,(a.seed??seed)+11),groundNoise(cx,cz,2.7,(b.seed??seed)+11),t)-.5)*2*mix(fa.variation,fb.variation,t)};
  }
  return best||{value:-1,distance:1,radius:.3,cx:x,cz:z,height:0};
 }
 function surface(x,z,base=0){
  const f=sample(x,z,base),t=f.tall||0,u=clamp((f.distance/f.radius-mix(.58,.20,t))/mix(.42,.80,t));
  // A quarter-ellipse meets the tall side vertically; a clipped crown retains
  // its flatter shoulder. Blend profiles along short-to-tall connections.
  const shoulder=mix(u*u*(3-2*u),1-Math.sqrt(Math.max(0,1-u*u)),t);
  return base+f.height*(1-mix(.16,.30,t)*shoulder);
 }
 function rim(x,z,base=0){const f=sample(x,z,base);return base+f.height*(1-mix(.16,.30,f.tall||0));}
 function contains(x,z,base=0,margin=0){
  const c=lookup.get(key(Math.round(x),Math.round(z)));
  return !!c&&c.base===base&&Math.abs(x-c.x)<=.5-margin&&Math.abs(z-c.z)<=.5-margin;
 }
 // All solid cover is represented by these same visible wooden cylinders.
 const wood=[];
 for(const c of cells){
  const connected=byCell.get(key(c.x,c.z)).find(e=>e.a!==e.b);
  const alongX=!connected||connected.a.x!==connected.b.x;
  for(let i=0;i<2;i++){
   const r=groundHash(c.x*3+i,c.z,(c.seed??seed)+23),u=(i?1:-1)*(.22+r*.035),v=(r-.5)*.20;
   const at=(p,q,y)=>[c.x+(alongX?p:q),c.base+y,c.z+(alongX?q:p)];
   const height=c.kind==='tall'?.72+r*.32:.38+r*.13;
   wood.push({cell:[c.x,c.z],a:at(u,v,.025),b:at(u*.65,v*.8,height),radius:.065+r*.015});
   wood.push({cell:[c.x,c.z],a:at(u*.8,v,height*.55),b:at(-u*.85,-v,height*.85),radius:.045+r*.012});
  }
 }
 return {cells,edges,seed,sample,surface,rim,contains,wood,chunkSize:HEDGE_CHUNK_SIZE};
}

export function hedgeFixture(layout='pair',kind='tall'){
 const cells=[],add=(x,z,k=kind)=>{if(!cells.some(c=>c.x===x&&c.z===z))cells.push({x,z,kind:k});};
 if(layout==='pair'){for(let x=-3;x<=3;x++){add(x,2,'short');add(x,-2,'tall');}}
 else if(layout==='gate'){for(let x=-5;x<=5;x++)if(x!==0)add(x,0);for(let z=1;z<=3;z++){add(-5,z);add(5,z);}}
 else if(layout==='joins'){
  for(let x=-5;x<=-2;x++)add(x,-2);for(let z=-1;z<=2;z++)add(-5,z);
  for(let x=0;x<=4;x++)add(x,-2);for(let z=-1;z<=2;z++)add(2,z);
  for(let x=0;x<=4;x++)add(x,5);for(let z=3;z<=7;z++)add(2,z);
  add(-4,5);
 }else if(layout==='mixed'){for(let x=-5;x<=5;x++)add(x,0,x<0?'short':'tall');}
 else if(layout==='long'){for(let x=-15;x<=16;x++)add(x,0);}
 else throw Error('Unknown hedge fixture');
 return cells;
}
