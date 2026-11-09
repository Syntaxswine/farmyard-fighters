// Small, dependency-free triangle queries shared by the scenery bake and game.
export function boundsHit(o,d,b,reach){
 let near=0,far=reach;
 for(let k=0;k<3;k++){
  if(Math.abs(d[k])<1e-10){if(o[k]<b[k]||o[k]>b[k+3])return false;}
  else {const a=(b[k]-o[k])/d[k],c=(b[k+3]-o[k])/d[k];near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));if(near>far)return false;}
 }
 return far>1e-7;
}
export function triangleHit(o,d,t,i,reach){
 const ax=t[i],ay=t[i+1],az=t[i+2],ux=t[i+3]-ax,uy=t[i+4]-ay,uz=t[i+5]-az,vx=t[i+6]-ax,vy=t[i+7]-ay,vz=t[i+8]-az;
 const px=d[1]*vz-d[2]*vy,py=d[2]*vx-d[0]*vz,pz=d[0]*vy-d[1]*vx,det=ux*px+uy*py+uz*pz;if(Math.abs(det)<1e-10)return null;
 const sx=o[0]-ax,sy=o[1]-ay,sz=o[2]-az,u=(sx*px+sy*py+sz*pz)/det;if(u<0||u>1)return null;
 const qx=sy*uz-sz*uy,qy=sz*ux-sx*uz,qz=sx*uy-sy*ux,v=(d[0]*qx+d[1]*qy+d[2]*qz)/det;if(v<0||u+v>1)return null;
 const distance=(vx*qx+vy*qy+vz*qz)/det;return distance>1e-7&&distance<=reach?distance:null;
}
export function geometryHit(data,o,d,reach){
 let nearest=null,limit=reach;const stack=[0];
 while(stack.length){const b=data.nodes[stack.pop()];if(!boundsHit(o,d,b,limit))continue;if(b[6]>=0){stack.push(b[6],b[7]);continue;}for(let j=-b[6]-1,end=j+b[7];j<end;j++){const hit=triangleHit(o,d,data.triangles,j*9,limit);if(hit!==null)nearest=limit=hit;}}
 return nearest;
}
export function geometryBoxHit(data,min,max){
 const overlaps=b=>min.every((v,k)=>max[k]>=b[k]&&v<=b[k+3]),center=min.map((v,k)=>(v+max[k])/2),half=min.map((v,k)=>(max[k]-v)/2);
 const triangleOverlaps=(t,i)=>{
  const p=[0,3,6].map(j=>center.map((v,k)=>t[i+j+k]-v)),edges=[0,1,2].map(j=>p[(j+1)%3].map((v,k)=>v-p[j][k]));
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],axes=[[1,0,0],[0,1,0],[0,0,1]],all=[...axes,cross(edges[0],edges[1]),...edges.flatMap(e=>axes.map(a=>cross(e,a)))];
  return all.every(a=>{const projections=p.map(v=>v.reduce((n,x,k)=>n+x*a[k],0)),radius=half.reduce((n,x,k)=>n+x*Math.abs(a[k]),0);return Math.min(...projections)<=radius+1e-8&&Math.max(...projections)>=-radius-1e-8;});
 };
 const stack=[0];while(stack.length){const b=data.nodes[stack.pop()];if(!overlaps(b))continue;if(b[6]>=0){stack.push(b[6],b[7]);continue;}for(let j=-b[6]-1,end=j+b[7];j<end;j++)if(triangleOverlaps(data.triangles,j*9))return true;}return false;
}
