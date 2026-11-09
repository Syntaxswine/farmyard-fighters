// A bounded, map-local distance field for surface paint only. Opposite terrain
// on another elevation never creates a litter fringe across a cliff.
export const GROUND_EDGE={pixelsPerTile:4,range:2,outside:.28,inside:.85};
export function createGroundEdgeField(plan){
 const {width,depth}=plan,ppt=GROUND_EDGE.pixelsPerTile,range=GROUND_EDGE.range,flags=new Uint8Array(width*depth),levels=new Float64Array(flags.length),fringe=new Uint8Array(flags.length),barriers=new Uint8Array(flags.length);
 for(let z=0;z<depth;z++)for(let x=0;x<width;x++){const i=z*width+x;flags[i]=plan.blockedAt(x,z)?1:0;levels[i]=plan.heightAt(x,z);}
 const candidates=(x,z)=>{
  const i=z*width+x,list=[];
  for(let v=Math.max(0,z-2);v<=Math.min(depth-1,z+2);v++)for(let u=Math.max(0,x-2);u<=Math.min(width-1,x+2);u++){
   const n=v*width+u;if(flags[n]!==flags[i]&&levels[n]===levels[i])list.push([u,v]);
  }return list;
 };
 function nearest(x,z,list){let d=range;for(const [u,v]of list)d=Math.min(d,Math.hypot(Math.max(Math.abs(x-u)-.5,0),Math.max(Math.abs(z-v)-.5,0)));return d;}
 const pixelWidth=width*ppt,pixelDepth=depth*ppt,data=new Uint8Array(pixelWidth*pixelDepth);
 for(let z=0;z<depth;z++)for(let x=0;x<width;x++){
  const list=candidates(x,z),sign=flags[z*width+x]?1:-1;
  for(const [dx,dz,bit]of [[-1,0,1],[1,0,2],[0,-1,4],[0,1,8],[-1,-1,16],[1,-1,32],[-1,1,64],[1,1,128]]){const u=x+dx,v=z+dz;if(u>=0&&v>=0&&u<width&&v<depth&&levels[v*width+u]!==levels[z*width+x])barriers[z*width+x]|=bit;}
  if(sign<0&&list.some(([u,v])=>Math.abs(u-x)<=1&&Math.abs(v-z)<=1))fringe[z*width+x]=1;
  for(let v=0;v<ppt;v++)for(let u=0;u<ppt;u++){
   const d=nearest(x-.5+(u+.5)/ppt,z-.5+(v+.5)/ppt,list)*sign;
   data[(z*ppt+v)*pixelWidth+x*ppt+u]=Math.round((d/range+1)*127.5);
  }
 }
 return {data,width:pixelWidth,depth:pixelDepth,fringe,barriers,
  // Mirrors the linearly filtered R8 texture, useful for collision-boundary
  // regression checks without creating a renderer or allocating GPU resources.
  sample(x,z){const cx=Math.max(0,Math.min(width-1,Math.floor(x+.5))),cz=Math.max(0,Math.min(depth-1,Math.floor(z+.5))),bits=barriers[cz*width+cx],limit=.5-.5/ppt;if(bits&1)x=Math.max(x,cx-limit);if(bits&2)x=Math.min(x,cx+limit);if(bits&4)z=Math.max(z,cz-limit);if(bits&8)z=Math.min(z,cz+limit);
   for(const [dx,dz,bit]of [[-1,-1,16],[1,-1,32],[-1,1,64],[1,1,128]])if(bits&bit&&(x-cx)*dx>limit&&(z-cz)*dz>limit){x=cx+dx*limit;z=cz+dz*limit;}
   const px=(x+.5)*ppt-.5,pz=(z+.5)*ppt-.5,ix=Math.floor(px),iz=Math.floor(pz),u=px-ix,v=pz-iz,get=(a,b)=>data[Math.max(0,Math.min(pixelDepth-1,b))*pixelWidth+Math.max(0,Math.min(pixelWidth-1,a))]/255*range*2-range;return (get(ix,iz)*(1-u)+get(ix+1,iz)*u)*(1-v)+(get(ix,iz+1)*(1-u)+get(ix+1,iz+1)*u)*v;}
 };
}

// This blend has an exact outer bound. Even a one-tile-wide route keeps an
// untouched centre; only colour and tiny flat flecks can reach its margins.
export function groundEdgeWeight(distance){const t=Math.max(0,Math.min(1,(distance+GROUND_EDGE.outside)/(GROUND_EDGE.inside+GROUND_EDGE.outside)));return t*t*(3-2*t);}
