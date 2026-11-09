import {GROUND_SPRITE_FAMILIES,spriteRandom} from './biome-ground-sprite-layout.js';

// Like the overmap's settlements and reciprocal routes, plan a connected field
// first. Render tiles are crops of that field, never independently chosen stamps.
const COLORS={
 temperate:[[90,94,49],[113,106,61],[68,84,43],[120,96,62]],
 jungle:[[48,76,43],[77,93,46],[40,59,35],[100,88,51]],
 snow:[[194,204,196],[216,219,205],[158,180,178],[118,136,130]],
 dry:[[163,142,89],[191,163,105],[137,128,75],[145,109,72]],
 wetlands:[[58,76,56],[86,100,67],[40,63,58],[110,103,66]]
};
const smooth=v=>v*v*(3-2*v),mix=(a,b,t)=>a+(b-a)*t;
export function groundHash(x,z,seed){let n=Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(seed,1442695041);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;}
export function groundNoise(x,z,scale,seed){x/=scale;z/=scale;const ix=Math.floor(x),iz=Math.floor(z),u=smooth(x-ix),v=smooth(z-iz);return mix(mix(groundHash(ix,iz,seed),groundHash(ix+1,iz,seed),u),mix(groundHash(ix,iz+1,seed),groundHash(ix+1,iz+1,seed),u),v);}
// Soft peat mats share one world field across tiles, chunks and sector edges.
// This is visual land coverage only: every cell of the bog remains unsafe.
export function bogLandAt(x,z,seed=173){
 const u=x+(groundNoise(x,z,7,seed+71)-.5)*2.2,v=z+(groundNoise(x,z,7,seed+73)-.5)*2.2;
 const n=.72*groundNoise(u,v,3.8,seed+79)+.28*groundNoise(x,z,1.15,seed+83);
 return smooth(Math.max(0,Math.min(1,(n-.47)/.13)));
}
export function createBogLandField(plan,seed=173){
 const width=plan.width*2+2,depth=plan.depth*2+2,data=new Uint8Array(width*depth),[ox,oz]=plan.origin||[0,0];
 // A half-tile pixel plus one-pixel halo keeps neighboring samples continuous.
 for(let z=0;z<depth;z++)for(let x=0;x<width;x++)data[z*width+x]=Math.round(bogLandAt(x/2-.75+ox,z/2-.75+oz,seed)*255);
 return {width,depth,data};
}
export function createGroundComposition(plan,family,seed=173){
 if(!COLORS[family])throw Error('Unknown ground family');
 if(!Number.isSafeInteger(seed)||seed<0||seed>2147483647)throw Error('Invalid ground seed');
 const r=spriteRandom(seed+GROUND_SPRITE_FAMILIES.indexOf(family)*7919),spacing=3,cols=Math.ceil(plan.width/spacing)+1,rows=Math.ceil(plan.depth/spacing)+1;
 const regions=new Int32Array(cols*rows).fill(-1),types=[],frontier=[];
 // Multi-source frontier growth yields connected, irregular material beds.
 // Each bed shares a palette and direction across many neighboring tiles.
 for(let i=0;i<Math.max(12,Math.ceil(cols*rows/64));i++){
  const x=Math.floor(r()*cols),z=Math.floor(r()*rows),cell=z*cols+x;if(regions[cell]>=0)continue;
  regions[cell]=types.length;types.push(Math.floor(r()*4));frontier.push(cell);
 }
 while(frontier.length){
  const pick=Math.floor(r()*frontier.length),cell=frontier[pick],x=cell%cols,z=Math.floor(cell/cols);frontier[pick]=frontier.at(-1);frontier.pop();
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=cols||nz>=rows)continue;const n=nz*cols+nx;if(regions[n]>=0)continue;regions[n]=regions[cell];frontier.push(n);}
 }
 const palette=COLORS[family];
 function colorAt(x,z){
  const warpX=(groundNoise(x,z,13,seed+1)-.5)*4,warpZ=(groundNoise(x,z,13,seed+2)-.5)*4;
  const gx=Math.max(0,Math.min(cols-1.00001,(x+warpX)/spacing)),gz=Math.max(0,Math.min(rows-1.00001,(z+warpZ)/spacing)),ix=Math.floor(gx),iz=Math.floor(gz),u=smooth(gx-ix),v=smooth(gz-iz);
  const ids=[iz*cols+ix,iz*cols+ix+1,(iz+1)*cols+ix,(iz+1)*cols+ix+1];
  const fine=(groundNoise(x,z,.7,seed+17)-.5)*9+(groundNoise(x,z,4.3,seed+23)-.5)*18;
  return [0,1,2].map(c=>Math.max(0,Math.min(255,mix(mix(palette[types[regions[ids[0]]]][c],palette[types[regions[ids[1]]]][c],u),mix(palette[types[regions[ids[2]]]][c],palette[types[regions[ids[3]]]][c],u),v)+fine)));
 }
 const features=[];
 function safe(x,z,size){const min=[x-size*.46,z-size*.46],max=[x+size*.46,z+size*.46],h=plan.heightAt(Math.floor(x+.5),Math.floor(z+.5));if(h===null)return null;
  for(let v=Math.floor(min[1]+.5);v<=Math.floor(max[1]+.5);v++)for(let u=Math.floor(min[0]+.5);u<=Math.floor(max[0]+.5);u++)if(!plan.blockedAt(u,v)||plan.heightAt(u,v)!==h)return null;
  return {min,max,height:h};
 }
 for(let attempt=0;attempt<Math.ceil(plan.width*plan.depth/3);attempt++){
  const x=r()*(plan.width-1),z=r()*(plan.depth-1),large=r()<.15,size=large?6+r()*7:1.7+r()*3.3;
  // Density is also a connected field: litter collects in beds with open gaps.
  if(r()> .16+.8*groundNoise(x,z,9,seed+41))continue;
  const bounds=safe(x,z,size);if(!bounds)continue;
  const kind=large?(r()<.8?'deadfall':'branches'):'litter',index=features.length,length=.49+r()*.29;
  features.push({id:index,x,z,size,...bounds,kind,length:length*size,recipe:{index,kind,family,inkSeed:(seed+index*2654435761)>>>0,center:[.5+(r()-.5)*.08,.5+(r()-.5)*.08],length,width:.023+r()*.046,angle:r()*Math.PI*2}});
 }
 // Stable draw order: leaf beds underneath fallen wood, identical for every crop.
 features.sort((a,b)=>(a.kind!=='litter')-(b.kind!=='litter')||a.id-b.id);
 const beds=[];
 if(['temperate','jungle','dry'].includes(family))for(let i=0;i<plan.width*plan.depth/7;i++){
  const x=r()*plan.width,z=r()*plan.depth;if(!plan.blockedAt(Math.floor(x+.5),Math.floor(z+.5)))continue;
  const size=5+r()*6;beds.push({id:beds.length,x,z,size,min:[x-size/2,z-size/2],max:[x+size/2,z+size/2],inkSeed:(seed+Math.imul(i,179424673))>>>0});
 }
 function indexedQuery(items){const bins=new Map();for(const f of items)for(let z=Math.floor(f.min[1]/24);z<=Math.floor(f.max[1]/24);z++)for(let x=Math.floor(f.min[0]/24);x<=Math.floor(f.max[0]/24);x++){const key=x+','+z;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(f);}const order=new Map(items.map((f,i)=>[f,i]));
  return (x,z,width,depth)=>{const found=new Set();for(let v=Math.floor(z/24);v<=Math.floor((z+depth)/24);v++)for(let u=Math.floor(x/24);u<=Math.floor((x+width)/24);u++)for(const f of bins.get(u+','+v)||[])if(f.max[0]>x&&f.min[0]<x+width&&f.max[1]>z&&f.min[1]<z+depth)found.add(f);return [...found].sort((a,b)=>order.get(a)-order.get(b));};
 }
 return {family,seed,width:plan.width,depth:plan.depth,features,beds,regions,regionTypes:types,regionColumns:cols,regionRows:rows,colorAt,query:indexedQuery(features),queryBeds:indexedQuery(beds),stats:{regions:types.length,brushBeds:beds.length,large:features.filter(f=>f.kind!=='litter').length,litter:features.filter(f=>f.kind==='litter').length,paintedLogs:features.filter(f=>f.kind==='deadfall').length,addedTriangles:0}};
}
