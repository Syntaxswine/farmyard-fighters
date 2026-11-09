import * as THREE from './vendor/three.module.js';

// Radius at each height, measured from native neutral triangle cross-sections.
// Add .02 clearance and round upward to .01. In particular, the skunk's tail
// must not determine foot clearance. These are not gameplay body dimensions.
const heights=[0,.25,.50,.75,1,1.25,1.50];
const profile=(id,label,height,radii)=>Object.freeze({id,label,height,maxRadius:Math.max(...radii),bands:Object.freeze(radii.map((radius,i)=>Object.freeze({minY:heights[i],maxY:heights[i+1]??height,radius})))});
export const SITE_CLEARANCE_PROFILES=Object.freeze({
 horse:profile('horse','Horse',1.70,[.35,.34,.44,.46,.46,.30,.19]),
 wide:profile('wide','Whole roster · turn space',1.85,[.38,.43,.55,.67,.70,.72,.71]),
});
export const SITE_STEP_CLEARANCE=.08;
const key=(x,z)=>x+','+z;
const EPS=1e-10;

function clipHeight(poly,height,sign){
 const next=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=(a.y-height)*sign,db=(b.y-height)*sign;
  if(da>=0)next.push(a);
  if((da>=0)!==(db>=0))next.push(a.clone().lerp(b,da/(da-db)));
 }return next;
}
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0],sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
function pointSegment(point,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
 const t=length?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dz)/length)):0;
 const nearest=[a[0]+t*dx,a[1]+t*dz];return {distance:(point[0]-nearest[0])**2+(point[1]-nearest[1])**2,nearest,t};
}
function contains(point,poly){
 let inside=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}
// Distance from a motion segment to the obstacle's horizontal cross-section.
// A radius around that segment is a true capsule, not its square bounding box.
function segmentPolygon(a,b,poly){
 if(contains(a,poly))return {distance:0,point:a};if(contains(b,poly))return {distance:0,point:b};
 let result={distance:Infinity,point:null};
 const keep=(distance,point,edge,t)=>{if(distance<result.distance)result={distance,point,edge,t};};
 for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],ab=sub(b,a),pq=sub(q,p),pa=sub(p,a),denom=cross(ab,pq);
  if(Math.abs(denom)>EPS){const t=cross(pa,pq)/denom,u=cross(pa,ab)/denom;if(t>=0&&t<=1&&u>=0&&u<=1)return {distance:0,point:[p[0]+u*pq[0],p[1]+u*pq[1]],edge:i,t:u};}
  for(const v of [a,b]){const c=pointSegment(v,p,q);keep(c.distance,c.nearest,i,c.t);}
  keep(pointSegment(p,a,b).distance,p,i,0);keep(pointSegment(q,a,b).distance,q,i,1);
 }return result;
}

export function analyzeSiteClearance(root,profileId='horse'){
 const profile=SITE_CLEARANCE_PROFILES[profileId];
 if(!profile)throw RangeError('Unknown site clearance profile: '+profileId);
 const floor=root.userData.slabHeight;
 if(!Number.isFinite(floor))throw TypeError('A strategic site root is required');
 root.updateMatrixWorld(true);
 // Convert into the asset's local frame so placing/rotating a site does not
 // change its authored local cell mask.
 const inverse=root.matrixWorld.clone().invert(),bands=profile.bands.map(b=>({...b,faces:[]}));
 for(const assembly of root.children){
  if(assembly.name==='hardstanding')continue;
  assembly.traverse(mesh=>{
   if(!mesh.isMesh)return;
   const transform=inverse.clone().multiply(mesh.matrixWorld),p=mesh.geometry.attributes.position,index=mesh.geometry.index;
   for(let i=0;i<(index?.count??p.count);i+=3){
    const vertices=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(transform));
    const bounds=new THREE.Box3().setFromPoints(vertices);
    if(bounds.max.y<=floor+SITE_STEP_CLEARANCE||bounds.min.y>=floor+profile.height)continue;
    for(const band of bands){
     const low=floor+Math.max(SITE_STEP_CLEARANCE,band.minY),high=floor+band.maxY;
     if(bounds.max.y<low||bounds.min.y>high)continue;
     const polygon=clipHeight(clipHeight(vertices,low,1),high,-1);
     if(!polygon.length)continue;
     const projected=polygon.map(v=>[v.x,v.z]);
     band.faces.push({polygon:projected,vertices:polygon,plane:new THREE.Plane().setFromCoplanarPoints(...vertices),bounds:new THREE.Box2().setFromPoints(projected.map(p=>new THREE.Vector2(...p))),part:assembly.name});
    }
   }
  });
 }
 const probe=(from,to=from)=>{
  for(const band of bands){
   const box=new THREE.Box2(new THREE.Vector2(Math.min(from[0],to[0])-band.radius,Math.min(from[1],to[1])-band.radius),new THREE.Vector2(Math.max(from[0],to[0])+band.radius,Math.max(from[1],to[1])+band.radius));
   for(const f of band.faces)if(box.intersectsBox(f.bounds)){
    const contact=segmentPolygon(from,to,f.polygon);
    if(contact.distance<=band.radius**2+EPS){
     const [x,z]=contact.point;
     const y=contact.edge!==undefined?THREE.MathUtils.lerp(f.vertices[contact.edge].y,f.vertices[(contact.edge+1)%f.vertices.length].y,contact.t):-(f.plane.constant+f.plane.normal.x*x+f.plane.normal.z*z)/f.plane.normal.y;
     return {part:f.part,band:[band.minY,band.maxY],radius:band.radius,point:[x,y,z]};
    }
   }
  }
  return null;
 };
 const cells=[];
 for(let z=0;z<8;z++)for(let x=0;x<8;x++){
  const center=[x-3.5,z-3.5],contact=probe(center);
  cells.push({x,z,center,passable:!contact,reason:contact?.part??null,contact});
 }
 const byKey=new Map(cells.map(c=>[key(c.x,c.z),c])),links=[],entries=[];
 for(const cell of cells){
  if(!cell.passable)continue;
  for(const [dx,dz]of [[1,0],[0,1]]){
   const next=byKey.get(key(cell.x+dx,cell.z+dz));
   if(next?.passable&&!probe(cell.center,next.center))links.push({from:[cell.x,cell.z],to:[next.x,next.z]});
  }
  for(const [edge,condition,dx,dz]of [['west',cell.x===0,-1,0],['east',cell.x===7,1,0],['north',cell.z===0,0,-1],['south',cell.z===7,0,1]]){
   if(condition&&!probe(cell.center,[cell.center[0]+dx,cell.center[1]+dz]))entries.push({cell:[cell.x,cell.z],edge});
  }
 }
 // Reachability prevents an isolated clear pocket being advertised as a route.
 const reachable=new Set(entries.map(e=>key(...e.cell))),queue=[...reachable],adj=new Map();
 for(const link of links){const a=key(...link.from),b=key(...link.to);if(!adj.has(a))adj.set(a,[]);if(!adj.has(b))adj.set(b,[]);adj.get(a).push(b);adj.get(b).push(a);}
 for(let i=0;i<queue.length;i++)for(const next of adj.get(queue[i])||[])if(!reachable.has(next)){reachable.add(next);queue.push(next);}
 for(const c of cells)c.reachable=c.passable&&reachable.has(key(c.x,c.z));
 return {
  status:'proposed-standing-clearance',shape:'circular-height-bands',profile:structuredClone(profile),surfaceHeight:floor,stepClearance:SITE_STEP_CLEARANCE,
  width:8,depth:8,cellOrigin:[-3.5,-3.5],placementOriginOffset:[3.5,3.5],
  rows:Array.from({length:8},(_,z)=>cells.filter(c=>c.z===z).map(c=>c.reachable?'.':c.passable?'o':'#').join('')),
  legend:{'.':'clear and reachable','#':'equipment / rubble blocks standing clearance',o:'clear but disconnected'},
  cells,links,entries,
 };
}
