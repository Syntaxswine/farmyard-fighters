import {segmentBox} from './hybrid-geometry.js';
// Pure geometry shared by the painted model and finite sight collision. No
// Three.js, texture readback or raycasts against the render scene in gameplay.
const mix=(a,b,t)=>a+(b-a)*t;
function clip(points){
 const out=[],crossings=[];
 for(let i=0;i<3;i++){
  const a=points[i],b=points[(i+1)%3];if(a.v>=0)out.push(a);
  if((a.v>=0)!==(b.v>=0)){const t=a.v/(a.v-b.v),p={x:mix(a.x,b.x,t),z:mix(a.z,b.z,t),v:0,rim:true};out.push(p);crossings.push(p);}
 }
 return {points:out,crossings};
}
const quad=(out,a,b,c,d)=>out.push([a,b,c],[a,c,d]);
export function hedgeCellSurfaces(plan,c){
 const core=[],closure=[],steps=6;
 const top=p=>[p.x,p.rim?plan.rim(p.x,p.z,c.base):plan.surface(p.x,p.z,c.base),p.z];
 const tier=(p,t)=>{const f=plan.sample(p.x,p.z,c.base);return t===2?top(p):[mix(f.cx,p.x,t===0?.6:1),c.base+f.height*(t===0?.065:.43),mix(f.cz,p.z,t===0?.6:1)];};
 const sides=(out,a,b)=>{for(let t=0;t<2;t++)quad(out,tier(a,t),tier(b,t),tier(b,t+1),tier(a,t+1));};
 for(let iz=0;iz<steps;iz++)for(let ix=0;ix<steps;ix++){
  const x=c.x-.5+ix/steps,z=c.z-.5+iz/steps,p=[[x,z],[x+1/steps,z],[x+1/steps,z+1/steps],[x,z+1/steps]].map(([x,z])=>({x,z,v:plan.sample(x,z,c.base).value}));
  for(const ids of [[0,2,1],[0,3,2]]){
   const part=clip(ids.map(i=>p[i]));
   for(let i=1;i<part.points.length-1;i++){const tri=[part.points[0],part.points[i],part.points[i+1]];core.push(tri.map(top));closure.push(tri.map(p=>tier(p,0)).reverse());}
   if(part.crossings.length===2){
    const from=core.length,[a,b]=part.crossings,fa=plan.sample(a.x,a.z,c.base),fb=plan.sample(b.x,b.z,c.base),radial=[a.x-fa.cx+b.x-fb.cx,0,a.z-fa.cz+b.z-fb.cz];sides(core,a,b);
    for(let n=from;n<core.length;n++){const [a,b,c]=core[n],u=b.map((v,i)=>v-a[i]),v=c.map((w,i)=>w-a[i]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];if(cross[0]*radial[0]+cross[2]*radial[2]<0)core[n].reverse();}
   }
   // Close individual collision cells only at shared tile boundaries. These
   // internal caps are not rendered and never extend into an omitted tile.
   for(let i=0;i<part.points.length;i++){
    const a=part.points[i],b=part.points[(i+1)%part.points.length];
    if([['x',c.x-.5],['x',c.x+.5],['z',c.z-.5],['z',c.z+.5]].some(([axis,n])=>Math.abs(a[axis]-n)<1e-8&&Math.abs(b[axis]-n)<1e-8))sides(closure,a,b);
   }
  }
 }
 return {core,closure};
}
// The artist's tapered five-sided CylinderGeometry, rotated from +Y onto a/b.
export function hedgeWoodTriangles(beam){
 const d=beam.b.map((v,i)=>v-beam.a[i]),len=Math.hypot(...d),axis=d.map(v=>v/len),q=[axis[2],0,-axis[0],1+axis[1]],ql=Math.hypot(...q);for(let i=0;i<4;i++)q[i]/=ql;
 const rotate=p=>{const [x,y,z,w]=q,[px,py,pz]=p,tx=2*(y*pz-z*py),ty=2*(z*px-x*pz),tz=2*(x*py-y*px);return [px+w*tx+y*tz-z*ty,py+w*ty+z*tx-x*tz,pz+w*tz+x*ty-y*tx];};
 const ring=(end,r)=>Array.from({length:5},(_,i)=>{const a=i/5*Math.PI*2,v=rotate([r*Math.sin(a),0,r*Math.cos(a)]);return v.map((n,k)=>n+end[k]);});
 const a=ring(beam.a,beam.radius),b=ring(beam.b,beam.radius*.72),tri=[];
 for(let i=0;i<5;i++){const j=(i+1)%5;quad(tri,a[i],a[j],b[j],b[i]);tri.push([beam.a,a[j],a[i]],[beam.b,b[i],b[j]]);}
 return tri;
}
const prepared=([a,b,c])=>[...a,...b.map((v,i)=>v-a[i]),...c.map((v,i)=>v-a[i])];
function hitTriangle(s,dx,dy,dz,t){
 const px=dy*t[8]-dz*t[7],py=dz*t[6]-dx*t[8],pz=dx*t[7]-dy*t[6],det=t[3]*px+t[4]*py+t[5]*pz;
 if(Math.abs(det)<1e-12)return null;
 const tx=s[0]-t[0],ty=s[1]-t[1],tz=s[2]-t[2],u=(tx*px+ty*py+tz*pz)/det;if(u< -1e-8||u>1+1e-8)return null;
 const qx=ty*t[5]-tz*t[4],qy=tz*t[3]-tx*t[5],qz=tx*t[4]-ty*t[3],v=(dx*qx+dy*qy+dz*qz)/det;if(v< -1e-8||u+v>1+1e-8)return null;
 const at=(t[6]*qx+t[7]*qy+t[8]*qz)/det;return at>=-1e-8&&at<=1+1e-8?Math.max(0,Math.min(1,at)):null;
}
export const triangleHit=(s,e,t)=>hitTriangle(s,e[0]-s[0],e[1]-s[1],e[2]-s[2],prepared(t));
export function compileHedgeSurface(triangles){
 const entries=triangles.map(t=>({triangle:prepared(t),min:[0,1,2].map(i=>Math.min(...t.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...t.map(p=>p[i])))}));
 const build=list=>{
  const min=[0,1,2].map(i=>Math.min(...list.map(t=>t.min[i]))),max=[0,1,2].map(i=>Math.max(...list.map(t=>t.max[i])));
  if(list.length<=8)return {min,max,triangles:list.map(e=>e.triangle)};
  const axis=[0,1,2].sort((a,b)=>(max[b]-min[b])-(max[a]-min[a]))[0];list.sort((a,b)=>(a.min[axis]+a.max[axis])-(b.min[axis]+b.max[axis]));const mid=Math.floor(list.length/2);
  return {min,max,left:build(list.slice(0,mid)),right:build(list.slice(mid))};
 };
 return build(entries);
}
function surfaceTrace(start,end,tree){
 let nearest=null;const dx=end[0]-start[0],dy=end[1]-start[1],dz=end[2]-start[2],stack=[tree];
 while(stack.length){const node=stack.pop(),entry=segmentBox(start,end,node);if(entry===null||nearest!==null&&entry>nearest)continue;
  if(node.triangles){for(const tri of node.triangles){const t=hitTriangle(start,dx,dy,dz,tri);if(t!==null&&(nearest===null||t<nearest))nearest=t;}}
  else stack.push(node.left,node.right);
 }
 return nearest;
}
export function hedgeSurfaceHit(start,end,box){
 // Both collision spaces share one immutable tree. Convert only the queried
 // ray's height, avoiding a second full copy of every hedge triangle.
 if(box.hedgeSpace){const {base,simBase,scale}=box.hedgeSpace;start=[start[0],base+(start[1]-simBase)*scale,start[2]];end=[end[0],base+(end[1]-simBase)*scale,end[2]];}
 const tree=box.hedgeTree;
 if(start.every((v,i)=>v>=tree.min[i]&&v<=tree.max[i])){
  // Each cell/wood beam has one solid vertical interval. Origin-inside rays
  // are blocked even when the whole short segment stays inside the volume.
  if(surfaceTrace(start,[start[0],tree.max[1]+1,start[2]],tree)!==null&&surfaceTrace(start,[start[0],tree.min[1]-1,start[2]],tree)!==null)return 0;
 }
 return surfaceTrace(start,end,tree);
}
