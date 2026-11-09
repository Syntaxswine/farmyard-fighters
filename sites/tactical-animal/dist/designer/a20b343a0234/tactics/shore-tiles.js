// Land corner bits: NW=1, NE=2, SE=4, SW=8.
export const SHORE_VARIANTS=3;
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>x*x*(3-2*x);
export function shoreField(mask,u,v,variant=0){
 if(mask===0)return -1;
 if(mask===15)return 1;
 const a=mask&1?1:-1,b=mask&2?1:-1,c=mask&4?1:-1,d=mask&8?1:-1;
 const x=smooth(u),y=smooth(v);
 const base=(a*(1-x)+b*x)*(1-y)+(d*(1-x)+c*x)*y;
 const fade=(Math.sin(Math.PI*u)*Math.sin(Math.PI*v))**2,phase=variant*2.1;
 return base+fade*(.34*Math.sin(8*u+phase)*Math.cos(7*v-phase)+.22*Math.sin(13*v+4*u+phase)+[0,.36,-.36][variant]);
}
export function makeShoreOverlay(mask,variant,grass,size){
 const out=new Uint8ClampedArray(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4,gi=((y%(size-1))*size+x%(size-1))*4;
  const f=shoreField(mask,x/(size-1),y/(size-1),variant);
  const mud=1-clamp((f-.035)/.24),wet=1-clamp((f+.025)/.12);
  for(let c=0;c<3;c++){
   const soil=grass[gi+c]*[.83,.69,.53][c]+[15,9,5][c];
   out[i+c]=(grass[gi+c]*(1-mud)+soil*mud)*(1-.18*wet);
  }
  out[i+3]=Math.round(clamp((f+.025)/.05)*255);
 }
 return out;
}
export function shoreMask(isLand,x,y){
 return (isLand(x,y)?1:0)|(isLand(x+1,y)?2:0)|(isLand(x+1,y+1)?4:0)|(isLand(x,y+1)?8:0);
}
