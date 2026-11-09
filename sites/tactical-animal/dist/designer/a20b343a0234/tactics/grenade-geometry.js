import {sceneryData} from './scenery-rules.js';
import {sceneryRule,sceneryId,sceneryPoint,sceneryLocal,sceneryDirection,sceneryRotation} from './scenery-catalog.js';
import {boundsHit} from './scenery-collision.js';
import * as T from './vendor/three.module.js';
import {buildWorld,DIMENSIONS} from './hybrid-world.js';
import {cliffGeometry} from './cliff-map-geometry.js';
import {bankInfo,bankTriangles,BANK_YAW} from './ramp-banks.js';
import {isRamp,rampInfo} from './cliff-ramps.js';
import {TOWERS,towerShellParts,unitBaseHeight} from './tower-geometry.js';
import {siteData,siteId} from './strategic-site-rules.js';
import {isExplosiveBarrel,barrelId} from './explosive-barrels.js';

// Grenades use native scene metres throughout. No mixing 3-unit tactical floors
// with 2.12-unit rendered floors, especially on rooftops and tower platforms.
export const GRENADE_FLOOR=DIMENSIONS.floorSpacing;
export const grenadeBase=u=>unitBaseHeight(u,GRENADE_FLOOR);
const V=a=>new T.Vector3(...a), cache=new WeakMap(),CHUNK=4;
const point=p=>[p.x,p.h,p.y];
function bounds(points){return {min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))};}
function oriented(part,source){const q=new T.Quaternion().setFromEuler(new T.Euler(...(part.rotation||[0,0,0]))),center=V(part.center),corners=[];
 for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])corners.push(V(part.size.map((v,i)=>v*[x,y,z][i]/2)).applyQuaternion(q).add(center).toArray());
 return {...bounds(corners),center,q,inverse:q.clone().invert(),half:part.size.map(v=>v/2),source};
}
export function grenadeWorld(s){
 const key=s.map||s.terrain,signature=JSON.stringify([key,s.upper,s.edges,s.props,s.stairs,s.canopies]);let old=cache.get(key);if(old?.signature===signature)return old;
 const index=new Map(),items=[];
 const add=item=>{items.push(item);for(let x=Math.floor(item.min[0]/CHUNK);x<=Math.floor(item.max[0]/CHUNK);x++)for(let y=Math.floor(item.min[2]/CHUNK);y<=Math.floor(item.max[2]/CHUNK);y++){const k=x+','+y;if(!index.has(k))index.set(k,[]);index.get(k).push(item);}};
 const tri=(a,b,c,source)=>{if(V(b).sub(V(a)).cross(V(c).sub(V(a))).lengthSq()<1e-16)return;add({...bounds([a,b,c]),triangle:new T.Triangle(V(a),V(b),V(c)),source});};
 const world=buildWorld(s);
 for(const b of world.boxes){
  // Detailed towers replace the generic cargo proxy. Non-solid visual slivers
  // (fence bars, cut fences) are physical too; foliage is not a solid wall.
  if(b.source?.prop&&s.props?.some(p=>TOWERS[p.kind]&&b.source.prop===`prop:${p.x},${p.y},${p.z||0}:${p.kind}`))continue;
  if(b.blocksShot===false&&b.kind!=='fence')continue;
  const barrel=b.source?.prop&&(s.props||[]).find(p=>isExplosiveBarrel(p)&&b.source.prop===`prop:${p.x},${p.y},${p.z||0}:${p.kind}`);
  add(oriented(b.trellisPart||b,{kind:b.kind,...b.source,...barrel&&{propId:barrelId(barrel)}}));
 }
 for(let y=0;y<key.length;y++)for(let x=0;x<key[y].length;x++)if(key[y][x]==='wall')add(oriented({center:[x,1,y],size:[1,2,1]},{kind:'wall',x,y,z:0}));
 for(const [level,layer]of (s.upper||[]).entries())for(const [key,kind]of Object.entries(layer))if(kind==='wall'){const [x,y]=key.split(',').map(Number),z=level+1;add(oriented({center:[x,z*GRENADE_FLOOR+1,y],size:[1,2,1]},{kind:'wall',x,y,z}));}
 // Terrain triangles are welded by the same builder that renders cliffs.
 const cliffs=new Set([...cliffGeometry(s.props||[]).index.values()].flat());
 for(const t of cliffs){const ps=t.points.map(p=>[p.x,p.y+t.level*(GRENADE_FLOOR-3),p.z]);tri(...ps,{kind:'cliff'});}
 for(const p of s.props||[]){
  if(TOWERS[p.kind])for(const part of towerShellParts(p))add(oriented(part,{kind:'tower'}));
  const bank=bankInfo(p);
  if(bank){const yaw=BANK_YAW[bank.direction],q=new T.Quaternion().setFromAxisAngle(V([0,1,0]),yaw),ps=bankTriangles(bank.step,bank.side).map(v=>V(v).applyQuaternion(q).add(V([p.x,(p.z||0)*GRENADE_FLOOR,p.y])).toArray());for(let i=0;i<ps.length;i+=3)tri(...ps.slice(i,i+3),{kind:'bank'});}
  if(isRamp(p)&&!rampInfo(p).surface.startsWith('wood')){
   const r=rampInfo(p),c=[r.low.x-r.dx*.5,r.z*GRENADE_FLOOR,r.low.y-r.dy*.5],across=[-r.dy*.5,0,r.dx*.5];
   const ps=[[-1,0,0],[1,0,0],[-1,r.run,2],[1,r.run,2],[-1,r.run,0],[1,r.run,0]].map(([side,along,h])=>[c[0]+side*across[0]+r.dx*along,c[1]+h,c[2]+side*across[2]+r.dy*along]);
   for(const ids of [[0,1,3],[0,3,2],[0,2,4],[1,5,3],[2,3,5],[2,5,4]])tri(...ids.map(i=>ps[i]),{kind:'ramp'});
  }
  const physical=sceneryData(p),furnishing=sceneryRule(p);
  if(physical){const b=physical.nodes[0],corners=[];for(const x of [b[0],b[3]])for(const y of [b[1],b[4]])for(const h of [b[2],b[5]]){const q=sceneryPoint(p,[x,y,h],'render');corners.push([q.x,q.h,q.y]);}add({...bounds(corners),scenery:physical,prop:p,source:{kind:'scenery',propId:sceneryId(p)}});}
  else if(furnishing)add(oriented({center:[p.x,(p.z||0)*GRENADE_FLOOR+.4,p.y],size:[1,.8,1]},{kind:'cover',propId:sceneryId(p)}));
  const data=siteData(p);if(data){const ps=data.triangles;for(let i=0;i<ps.length;i+=9){const vs=[];for(let j=0;j<9;j+=3){const [x,y,h]=ps.slice(i+j,i+j+3);vs.push([p.x+(p.rotated?7-y:x),(p.z||0)*GRENADE_FLOOR+h,p.y+(p.rotated?x:y)]);}tri(...vs,{kind:'site',propId:siteId(p)});}}
 }
 old={signature,index,items,width:key[0].length,height:key.length};cache.set(key,old);return old;
}
// Swept sphere against a triangle, including its edges and vertices. A thin
// wall cannot be skipped between frames or squeezed through a sub-diameter gap.
function sphereTriangle(a,d,triangle,r){
 const closest=triangle.closestPointToPoint(a,new T.Vector3()),delta=a.clone().sub(closest);let best=null;
 const accept=(t,n)=>{if(t>=-1e-8&&t<=1+1e-8&&d.dot(n)<-1e-9&&(!best||t<best.t))best={t:Math.max(0,t),normal:n.normalize()};};
 if(delta.lengthSq()<=r*r+1e-12){const n=delta.lengthSq()>1e-14?delta.normalize():triangle.getNormal(new T.Vector3());if(n.dot(d)>0)n.negate();if(delta.lengthSq()>1e-14||r===0)accept(0,n);}
 const n=triangle.getNormal(new T.Vector3()),height=a.clone().sub(triangle.a).dot(n),speed=d.dot(n);
 if(Math.abs(speed)>1e-10)for(const side of [-1,1]){const t=(side*r-height)/speed,center=a.clone().addScaledVector(d,t),contact=center.clone().addScaledVector(n,-side*r);if(triangle.containsPoint(contact))accept(t,n.clone().multiplyScalar(side));}
 if(r>0){
  const roots=(u,v)=>{const A=v.lengthSq(),B=2*u.dot(v),C=u.lengthSq()-r*r,D=B*B-4*A*C;if(A<1e-16||D<0)return [];return [(-B-Math.sqrt(D))/(2*A),(-B+Math.sqrt(D))/(2*A)];};
  const vs=[triangle.a,triangle.b,triangle.c];
  for(let i=0;i<3;i++){const v=vs[i],edge=vs[(i+1)%3].clone().sub(v),length=edge.length();edge.normalize();const rel=a.clone().sub(v),u=rel.clone().addScaledVector(edge,-rel.dot(edge)),w=d.clone().addScaledVector(edge,-d.dot(edge));
   for(const t of roots(u,w)){const center=a.clone().addScaledVector(d,t),along=center.clone().sub(v).dot(edge);if(along>=0&&along<=length)accept(t,center.sub(v).addScaledVector(edge,-along));}
   for(const t of roots(rel,d))accept(t,rel.clone().addScaledVector(d,t));
  }
 }
 return best;
}
function sphereBox(a,d,b,r){
 const o=a.clone().sub(b.center).applyQuaternion(b.inverse),v=d.clone().applyQuaternion(b.inverse);let near=-Infinity,far=Infinity,axis=0,sign=1;
 for(let i=0;i<3;i++){const x=o.getComponent(i),dx=v.getComponent(i),half=b.half[i]+r;if(Math.abs(dx)<1e-12){if(Math.abs(x)>half)return null;continue;}let lo=(-half-x)/dx,hi=(half-x)/dx,side=-1;if(lo>hi){[lo,hi]=[hi,lo];side=1;}if(lo>near){near=lo;axis=i;sign=side;}far=Math.min(far,hi);if(near>far)return null;}
 if(far<0||near>1)return null;
 // Starting on a support while travelling away must not trap the grenade.
 if(near<-.00001)return null;
 const n=V([0,0,0]).setComponent(axis,sign).applyQuaternion(b.q);return d.dot(n)<-1e-9?{t:Math.max(0,near),normal:n}:null;
}
function sphereScenery(from,to,item,r){
 const p=sceneryLocal(item.prop,from,'render'),v=sceneryDirection(item.prop,{x:to.x-from.x,y:to.y-from.y,h:to.h-from.h},'render'),a=V([p.x,p.h,p.y]),d=V([v[0],v[2],v[1]]),data=item.scenery,stack=[0],triangle=new T.Triangle();let best=null;
 while(stack.length){const b=data.nodes[stack.pop()],bounds=[b[0]-r,b[1]-r,b[2]-r,b[3]+r,b[4]+r,b[5]+r];if(!boundsHit([p.x,p.y,p.h],v,bounds,best?.t??1))continue;if(b[6]>=0){stack.push(b[6],b[7]);continue;}
  for(let j=-b[6]-1,end=j+b[7];j<end;j++){const i=j*9,t=data.triangles;triangle.a.set(t[i],t[i+2],t[i+1]);triangle.b.set(t[i+3],t[i+5],t[i+4]);triangle.c.set(t[i+6],t[i+8],t[i+7]);const hit=sphereTriangle(a,d,triangle,r);if(hit&&(!best||hit.t<best.t))best=hit;}
 }
 if(best)best.normal.applyAxisAngle(V([0,1,0]),-sceneryRotation(item.prop)*Math.PI/180);return best;
}
export function sweepGrenade(world,from,to,r=.045,{units=[],ignoreUnit=null}={}){
 const a=V(point(from)),d=V(point(to)).sub(a),candidates=new Set();
 const minX=Math.floor((Math.min(from.x,to.x)-r)/CHUNK),maxX=Math.floor((Math.max(from.x,to.x)+r)/CHUNK),minY=Math.floor((Math.min(from.y,to.y)-r)/CHUNK),maxY=Math.floor((Math.max(from.y,to.y)+r)/CHUNK);
 for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)for(const item of world.index.get(x+','+y)||[])candidates.add(item);
 for(const u of units){if(u.id===ignoreUnit||u.away||u.hp<=0)continue;const h=u.stance==='prone'?.45:u.stance==='kneeling'?1.15:1.65;candidates.add(oriented({center:[u.x,grenadeBase(u)+h/2,u.y],size:[.4,h,.4]},{kind:'unit',unitId:u.id}));}
 let best=null;
 const accept=(hit,source)=>{if(hit&&(!best||hit.t<best.t))best={...hit,...source};};
 for(const b of candidates){if(b.max[1]+r<Math.min(from.h,to.h)||b.min[1]-r>Math.max(from.h,to.h))continue;accept(b.scenery?sphereScenery(from,to,b,r):b.triangle?sphereTriangle(a,d,b.triangle,r):sphereBox(a,d,b,r),b.source);}
 // Physical ground and map limits also exist outside painted floor cells.
 for(const [axis,lo,hi]of [[0,-.5+r,world.width-.5-r],[2,-.5+r,world.height-.5-r],[1,r,Infinity]]){const x=a.getComponent(axis),dx=d.getComponent(axis);if(dx<0&&x+dx<lo)accept({t:Math.max(0,(lo-x)/dx),normal:V([0,0,0]).setComponent(axis,1)},{kind:axis===1?'floor':'boundary'});if(dx>0&&x+dx>hi)accept({t:Math.max(0,(hi-x)/dx),normal:V([0,0,0]).setComponent(axis,-1)},{kind:'boundary'});}
 if(!best)return null;const p=a.addScaledVector(d,best.t);return {...best,x:p.x,y:p.z,h:p.y,normal:{x:best.normal.x,y:best.normal.z,h:best.normal.y}};
}
export function grenadeBlastClear(s,from,to,propId=null){const hit=sweepGrenade(grenadeWorld(s),from,to,0);return !hit||hit.t>=.995||propId!==null&&hit.propId===propId;}
