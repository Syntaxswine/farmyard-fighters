// One small mesh/volume contract for both presentation and physical queries.
// Coordinates are tile centres (x, depth, height), in render-floor units.
export const ARCH_FLOOR=2.12;
export const STONE_ARCH_SPECS=Object.freeze({
 'stone-arch-large':Object.freeze({w:12,h:3,rise:3,opening:8,pier:2,name:'Natural stone arch · layer 4 top / road'}),
 'stone-arch-small':Object.freeze({w:6,h:3,rise:1,opening:4,pier:1,name:'Natural stone arch · one level / footpath'})
});
const cache=new Map();
export function stoneArchData(kind){
 if(cache.has(kind))return cache.get(kind);
 const spec=STONE_ARCH_SPECS[kind];if(!spec)return null;
 const {w,h,rise,pier}=spec,top=rise*ARCH_FLOOR,left=pier-.5,right=w-pier-.5;
 // Even the low shoulders clear a standing merc. The smaller span has a
 // flatter soffit so its crown still meets the ordinary first-floor datum.
 const shoulder=rise>1?top-2.06:1.90,crown=rise>1?top-.84:1.95;
 const profile=[[-.5,0],[left,0],[left,shoulder]];
 for(let i=1;i<8;i++){const t=i/8;profile.push([left+(right-left)*t,shoulder+(crown-shoulder)*Math.sin(Math.PI*t)**.65]);}
 profile.push([right,shoulder],[right,0],[w-.5,0]);
 const triangles=[],surfaces=[];
 const quad=(a,b,c,d,face)=>{for(const tri of [[a,b,c],[a,c,d]]){const area=Math.hypot(...tri[1].map((v,k)=>v-tri[0][k]))*Math.hypot(...tri[2].map((v,k)=>v-tri[0][k]));if(area>1e-9){triangles.push(...tri.flat());surfaces.push(face);}}};
 for(let i=1;i<profile.length;i++){
  const [a,ha]=profile[i-1],[b,hb]=profile[i];
  if(b>a){quad([a,-.5,ha],[b,-.5,hb],[b,-.5,top],[a,-.5,top],'face');quad([b,h-.5,hb],[a,h-.5,ha],[a,h-.5,top],[b,h-.5,top],'face');quad([a,-.5,top],[b,-.5,top],[b,h-.5,top],[a,h-.5,top],'top');}
  quad([b,-.5,hb],[a,-.5,ha],[a,h-.5,ha],[b,h-.5,hb],'underside');
 }
 quad([-.5,-.5,0],[-.5,-.5,top],[-.5,h-.5,top],[-.5,h-.5,0],'end');
 quad([w-.5,h-.5,0],[w-.5,h-.5,top],[w-.5,-.5,top],[w-.5,-.5,0],'end');
 const underside=x=>{
  if(x<left||x>right)return 0;
  for(let i=3;i<profile.length-2;i++){const [a,ha]=profile[i-1],[b,hb]=profile[i];if(x<=b)return ha+(hb-ha)*(x-a)/(b-a);}
  return shoulder;
 };
 const intersects=(min,max)=>{
  if(max[0]<-.5||min[0]>w-.5||max[1]<-.5||min[1]>h-.5||max[2]<0||min[2]>top)return false;
  const a=Math.max(-.5,min[0]),b=Math.min(w-.5,max[0]),samples=[a,b,...profile.map(p=>p[0]).filter(x=>x>a&&x<b)];
  return samples.some(x=>max[2]>=underside(x)-1e-8);
 };
 const clear=(x,y,z)=>!intersects([x-.28,y-.28,z*ARCH_FLOOR+.08],[x+.28,y+.28,z*ARCH_FLOOR+1.83]);
 const clearance=Array.from({length:rise+1},(_,z)=>{
  const rows=Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>clear(x,y,z)?'.':'#').join('')),links=[];
  for(let y=-2;y<=h+1;y++)for(let x=-2;x<=w+1;x++)for(const [dx,dy]of [[1,0],[0,1],[1,1],[1,-1]]){
   const a=[Math.min(x,x+dx)-.28,Math.min(y,y+dy)-.28,z*ARCH_FLOOR+.08],b=[Math.max(x,x+dx)+.28,Math.max(y,y+dy)+.28,z*ARCH_FLOOR+1.83];
   if(!intersects(a,b))links.push([x,y,x+dx,y+dy]);
  }
  return {rows,links};
 });
 const bounds=[-.5,-.5,0,w-.5,h-.5,top],data={...spec,top,profile,triangles,surfaces,bounds,nodes:[[...bounds,-1,triangles.length/9]],clearance,intersects};cache.set(kind,data);return data;
}
