// Broad phase only. Exact wall, trunk and aperture intersections remain owned
// by the production town sight implementation. A conservative angular bucket
// avoids querying the same large diagonal rectangle for every revealed cell.
const TAU=Math.PI*2,COUNT=180,angle=(x,y)=>(Math.atan2(y,x)+TAU)%TAU;
export function sightBuckets(origin,entries){
 const buckets=Array.from({length:COUNT},()=>({walls:[],boxes:[],trunks:[]}));
 for(const {bounds,kind,value}of entries){
  const [x0,y0,x1,y1]=bounds;let start=0,span=TAU;
  if(origin.x<x0||origin.x>x1||origin.y<y0||origin.y>y1){
   const angles=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([x,y])=>angle(x-origin.x,y-origin.y)).sort((a,b)=>a-b);
   let gap=-1,index=0;for(let i=0;i<4;i++){const size=(i===3?angles[0]+TAU:angles[i+1])-angles[i];if(size>gap){gap=size;index=i;}}
   start=angles[(index+1)%4];span=TAU-gap;
  }
  const first=Math.floor(start/TAU*COUNT)-1,last=Math.ceil((start+span)/TAU*COUNT)+1,seen=new Set();
  for(let i=first;i<=last;i++){const n=(i%COUNT+COUNT)%COUNT;if(!seen.has(n)){seen.add(n);buckets[n][kind].push(value);}}
 }
 return target=>buckets[Math.min(COUNT-1,Math.floor(angle(target.x-origin.x,target.y-origin.y)/TAU*COUNT))];
}
