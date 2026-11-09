// Global, low-frequency fields keep landforms continuous across 24-tile chunks.
// The mask still decides every playable cell; these functions only dress it.
export const random=n=>{const p=Math.sin(n*173.71+19.3)*44758.12;return p-Math.floor(p);};
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function field(x,z,scale=6,seed=0){
 x=x/scale+19.7;z=z/scale+31.3;const ix=Math.floor(x),iz=Math.floor(z),u=smooth(x-ix),v=smooth(z-iz),n=ix*137+iz*317+seed;
 const a=random(n),b=random(n+137),c=random(n+317),d=random(n+454);return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}
export function createTerrainFill(plan,family,{softEdge=true}={}){
 // Distance from the *global* forest edge, never the edge of a render chunk.
 const {width,depth}=plan,dist=new Float32Array(width*depth),queue=[];
 for(let z=0;z<depth;z++)for(let x=0;x<width;x++){
  const i=z*width+x,h=plan.heightAt(x,z);dist[i]=99;
  if(!plan.blockedAt(x,z)||[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>!plan.blockedAt(x+dx,z+dz)||plan.heightAt(x+dx,z+dz)!==h)){dist[i]=0;queue.push([x,z]);}
 }
 for(let i=0;i<queue.length;i++){const [x,z]=queue[i],d=dist[z*width+x]+1;for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const u=x+dx,v=z+dz;if(u>=0&&v>=0&&u<width&&v<depth&&dist[v*width+u]>d){dist[v*width+u]=d;queue.push([u,v]);}}}
 function distance(x,z){const ix=Math.floor(x),iz=Math.floor(z),u=x-ix,v=z-iz,get=(a,b)=>a<0||b<0||a>=width||b>=depth?-.5:plan.blockedAt(a,b)?dist[b*width+a]+.5:-.5;return (get(ix,iz)*(1-u)+get(ix+1,iz)*u)*(1-v)+(get(ix,iz+1)*(1-u)+get(ix+1,iz+1)*u)*v;}
 function margin(x,z){
  const cx=Math.floor(x+.5),cz=Math.floor(z+.5),h=plan.heightAt(cx,cz);if(!plan.blockedAt(cx,cz))return 0;
  let d=1;for(let v=cz-1;v<=cz+1;v++)for(let u=cx-1;u<=cx+1;u++)if(!plan.blockedAt(u,v)||plan.heightAt(u,v)!==h)d=Math.min(d,Math.hypot(Math.max(Math.abs(x-u)-.5,0),Math.max(Math.abs(z-v)-.5,0)));
  return d;
 }
 function height(x,z){
  const d=Math.max(0,distance(x,z)),foot=softEdge?smooth(margin(x,z)/.45):1;
  if(family==='wetlands')return .003+.019*foot;
  const edge=smooth(d/2),broad=field(x,z,8,19),fine=field(x,z,3.3,72);
  if(family==='snow')return .003+foot*(.022+edge*(.18+1.1*broad*broad+.16*fine));
  const mass=family==='jungle'?1.30:family==='temperate'?.95:.65;
  return .003+foot*(.042+edge*mass*(.24+.9*broad+.30*fine));
 }
 function normal(x,z){const e=.08,dx=(height(x+e,z)-height(x-e,z))/(2*e),dz=(height(x,z+e)-height(x,z-e))/(2*e),n=Math.hypot(dx,1,dz);return [-dx/n,1/n,-dz/n];}
 function color(x,z){
  const broad=field(x,z,7,48),patch=field(x,z,3.7,121);
  if(family==='wetlands'){const edge=1-smooth(distance(x,z)/2.6),s=.95+1.25*broad;return [s*(.69+edge*.45),s*(.94+patch*.25),s*(1.12-edge*.37)];}
  if(family==='snow'){const s=.82+.17*broad;return [s,s*.99,s*(1.01+.03*patch)];}
  const s=.68+.45*broad+.10*patch;return family==='dry'?[s*1.07,s,s*.87]:[s*(.89+.13*patch),s,s*.85];
 }
 return {height,normal,color,distance};
}
