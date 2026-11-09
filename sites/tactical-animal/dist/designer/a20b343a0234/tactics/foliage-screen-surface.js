import {groundHash,groundNoise} from './biome-ground-composition.js';

export const SCREEN_CHUNK_SIZE=24;
const directions=[[1,0],[-1,0],[0,1],[0,-1]];
const massAt=(x,z,seed)=>groundNoise(x,z,5.8,seed+421)*.72+groundNoise(x,z,2.3,seed+433)*.28;

// Compose several tiles as a clump, not a separate identical bush per cell.
// World coordinates keep the field continuous across render chunks. This is
// only an art field: occupancy and the finite sight volumes still own the edge.
export function screenComposition(plan,x,z){
 const [ox,oz]=plan.origin||[0,0],wx=x+ox,wz=z+oz,seed=plan.seed;
 const mass=massAt(wx,wz,seed);
 return {mass,angle:groundNoise(wx,wz,7.4,seed+449)*Math.PI*2,tone:groundNoise(wx,wz,8.5,seed+457)};
}

// Jittered world-space growing sites give neighbouring cells irregular shared
// clumps. The render chunk grid never becomes a visible planting pattern.
export function screenClumpAt(x,z,seed){
 const gx=Math.floor(x/3),gz=Math.floor(z/3);let best=null,distance=Infinity;
 for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
  const u=gx+dx,v=gz+dz,cx=u*3+.35+groundHash(u,v,seed+601)*2.3,cz=v*3+.35+groundHash(u,v,seed+617)*2.3,d=(x-cx)**2+(z-cz)**2;
  if(d<distance){distance=d;best={key:u+','+v,x:cx,z:cz};}
 }return best;
}

// A few enclosed hollows give the eye a rest inside a busy stand. They belong
// to the planting, not the map: roots, solid deadfall and sight volumes remain.
// Growing sites use world coordinates and an irregular oval rather than a
// repeated round hole in every clump. Thin screens never receive a hollow.
function screenHollows(plan,cells,lookup){
 const [ox,oz]=plan.origin||[0,0],spacing=7,sites=new Map(),hollows=[];
 if(!cells.length)return {hollows,at:()=>null};
 let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
 for(const s of cells){minX=Math.min(minX,s.x);maxX=Math.max(maxX,s.x);minZ=Math.min(minZ,s.y);maxZ=Math.max(maxZ,s.y);}
 const shape=(h,x,z)=>{const dx=x-h.x,dz=z-h.z,u=(dx*h.c+dz*h.sn)/h.rx,v=(-dx*h.sn+dz*h.c)/h.rz,a=Math.atan2(v,u),r=1+.12*Math.sin(a*3+h.phase)+.07*Math.sin(a*5-h.phase);return Math.hypot(u,v)/r;};
 for(let v=Math.floor((minZ+oz)/spacing);v<=Math.floor((maxZ+oz)/spacing);v++)for(let u=Math.floor((minX+ox)/spacing);u<=Math.floor((maxX+ox)/spacing);u++){
  const n=groundHash(u,v,plan.seed+1801);
  // Keep about 70% of the first draft's sites, without shifting the survivors.
  if(n>.72||groundHash(u,v,plan.seed+1867)>.70)continue;
  const x=u*spacing+1.4+groundHash(u,v,plan.seed+1811)*4.2-ox,z=v*spacing+1.4+groundHash(u,v,plan.seed+1823)*4.2-oz,owner=lookup.get(`${Math.floor(x+.5)},${Math.floor(z+.5)}`);
  if(!owner||owner.family!==plan.family)continue;
  const angle=groundHash(u,v,plan.seed+1831)*Math.PI,rx=.95+n*.45,rz=1.25+groundHash(u,v,plan.seed+1847)*.85;
  const h={x,z,base:owner.base,rx,rz,c:Math.cos(angle),sn:Math.sin(angle),phase:n*Math.PI*2},reach=Math.ceil(Math.max(rx,rz)+1.2);let enclosed=true;
  for(let dz=-reach;dz<=reach&&enclosed;dz++)for(let dx=-reach;dx<=reach;dx++){
   const cx=Math.floor(x+.5)+dx,cz=Math.floor(z+.5)+dz;
   if(shape(h,cx,cz)>1.55)continue;
   const s=lookup.get(cx+','+cz);if(!s||s.family!==plan.family||s.base!==h.base){enclosed=false;break;}
  }
  if(enclosed){sites.set(u+','+v,h);hollows.push(h);}
 }
 const at=(x,z,base)=>{
  const u=Math.floor((x+ox)/spacing),v=Math.floor((z+oz)/spacing);let found=null,q=Infinity;
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
   const h=sites.get(`${u+dx},${v+dz}`);if(!h||h.base!==base)continue;
   const d=shape(h,x,z);if(d<q&&d<1.8){q=d;found=h;}
  }return found?{h:found,q}:null;
 };
 return {hollows,at};
}

// Cosmetic plants for the existing sight ellipsoids. No rule, seed, preset or
// collider is authored here. Solid lobes and overlapping leaf fans are clipped
// by the same finite envelope in the shader.
export function screenSurface(plan){
 const surface=plan.family==='snow'?snowScreenSurface(plan):rootedScreenSurface(plan),chunks=new Map(surface.chunks.map(g=>[g.key,g]));
 // Boundary boughs are mandatory at every LOD. Broad interior grouping must
 // not leave a character-sized hole in an authored one-cell sight screen.
 for(const s of surface.cells){
  if(!directions.some(([dx,dz])=>surface.exposed(s,dx,dz)))continue;
  const g=chunks.get(`${Math.floor(s.x/SCREEN_CHUNK_SIZE)},${Math.floor(s.y/SCREEN_CHUNK_SIZE)}`),group=screenComposition(plan,s.x,s.y),n=groundHash(s.x,s.y,plan.seed+719);
  const snow=plan.family==='snow';
  for(let i=0;i<(snow?4:2);i++){
   const angle=group.angle+i*Math.PI/2,c=Math.cos(angle),sn=Math.sin(angle),points=[],uv=[],bottom=s.base+(snow?(i<2?.74:1.38):.42),originalTop=s.base+(snow&&i<2?1.62:2.23)+n*.13,top=originalTop+(snow?0:Math.max(0,group.mass-.35)*1.25),width=1.65;
   // Keep the eye-height band in place. Only the upper tips sway inward with
   // the wider clump, so the outer silhouette varies without a sight slit.
   const edge=directions.reduce((p,[dx,dz])=>surface.exposed(s,dx,dz)?[p[0]+dx,p[1]+dz]:p,[0,0]),tip=snow?0:.10+group.mass*.28;
   const rows=snow?[bottom,top]:[bottom,s.base+1.94,top];
   for(let row=0;row<rows.length;row++)for(const side of [-1,1]){const vertical=Math.min(1,(rows[row]-bottom)/(originalTop-bottom)),along=side*width/2,depth=(vertical-.5)*(snow?.78:.25),inset=row===rows.length-1?tip:0;points.push(s.x+along*c-depth*sn-edge[0]*inset,rows[row],s.y+along*sn+depth*c-edge[1]*inset);uv.push(side<0?.12:.88,.08+.84*vertical);}
   for(const target of [g.fringe,g.far,g.distant]){const a=target.position.length/3;target.position.push(...points);target.uv.push(...uv);for(let row=0;row<rows.length-1;row++){const k=a+row*2;target.index.push(k,k+1,k+2,k+2,k+1,k+3);}}
  }
 }
 return surface;
}
function snowScreenSurface(plan){
 const lookup=new Map(plan.obstacles.screens.filter(s=>s.z===plan.level).map(s=>[s.x+','+s.y,s]));
 const cells=[...lookup.values()].filter(s=>s.family===plan.family),chunks=new Map();
 const [originX,originZ]=plan.origin||[0,0],cellGrid=new Array(plan.width*plan.depth);
 for(const s of lookup.values())cellGrid[s.y*plan.width+s.x]=s;
 // Shared vertices, side rows and finite-difference normals ask for the same
 // field samples repeatedly. Keep scratch caches only for this surface build.
 const compositionCache=new Map(),coreCache=new Map();
 const compositionAt=(x,z)=>{const key=x+','+z;if(!compositionCache.has(key))compositionCache.set(key,screenComposition(plan,x,z));return compositionCache.get(key);};
 // All core and normal samples lie on the existing quarter-cell mesh grid.
 // Numeric sample keys avoid allocating strings for every repeated normal.
 const sampleKey=(x,z)=>(x+1)*4+(z+1)*4*(plan.width+2)*4;
 const roofAt=(x,z,base,owner=lookup.get(`${Math.floor(x+.5)},${Math.floor(z+.5)}`))=>{
  if(!owner||owner.base!==base)return base;
  let top=base;for(const l of owner.lobes){const q=1-((x-l.center[0])/l.radius[0])**2-((z-l.center[2])/l.radius[2])**2;if(q>=0)top=Math.max(top,l.center[1]+l.radius[1]*Math.sqrt(q));}return top;
 };
 // Lower the shoulder gradually toward a shorter neighbour instead of cutting
 // a separate peak out of each tile. The owning crown is always an upper bound;
 // nearby shorter crowns may lower it, but taller neighbours cannot raise it.
 const ceilingCache=new Map();
 const ceilingAt=(s,x,z)=>{
  if(!ceilingCache.has(s.base))ceilingCache.set(s.base,new Map());const cache=ceilingCache.get(s.base),key=sampleKey(x,z);if(cache.has(key))return cache.get(key);
  let limit=Infinity;
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
   const cx=Math.floor(x+.5)+dx,cz=Math.floor(z+.5)+dz;if(cx<0||cx>=plan.width||cz<0||cz>=plan.depth)continue;
   const c=cellGrid[cz*plan.width+cx];if(!c||c.base!==s.base)continue;
   const px=Math.max(c.x-.5,Math.min(c.x+.5,x)),pz=Math.max(c.y-.5,Math.min(c.y+.5,z));
   limit=Math.min(limit,roofAt(px,pz,s.base,c)+Math.hypot(x-px,z-pz)*.45);
  }if(!Number.isFinite(limit))limit=s.base;cache.set(key,limit);return limit;
 };
 const coreAt=(s,x,z)=>{
  if(!coreCache.has(s.family))coreCache.set(s.family,new Map());const familyCache=coreCache.get(s.family);
  if(!familyCache.has(s.base))familyCache.set(s.base,new Map());const cache=familyCache.get(s.base),key=sampleKey(x,z);
  if(!cache.has(key)){
   const mass=massAt(x+originX,z+originZ,plan.seed);let distance=3;
   for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
    const cx=Math.floor(x+.5)+dx,cz=Math.floor(z+.5)+dz,other=lookup.get(cx+','+cz);if(other?.base===s.base)continue;
    distance=Math.min(distance,Math.hypot(Math.max(0,Math.abs(x-cx)-.5),Math.max(0,Math.abs(z-cz)-.5)));
   }
   // Limit the actual slope, including the inset shoulder. A one-tile strip
   // gets a low drift; it cannot inherit a tall interior snow-bank profile.
   cache.set(key,Math.min(ceilingAt(s,x,z),s.base+.04+Math.min(.82+mass*.70,Math.max(0,distance-.20)*.70)));
  }return cache.get(key);
 };
 const exposed=(s,dx,dy)=>{const n=lookup.get(`${s.x+dx},${s.y+dy}`);return !n||n.base!==s.base;};
 const inset=(x,z,fraction)=>{
  const [ox,oz]=plan.origin||[0,0],a=(x+ox)+(z+oz),wave=.5+.32*Math.sin(a*2.13)+.18*Math.sin(a*5.31+1.7);
  return .25+.10*wave+.04*Math.sin(fraction*Math.PI);
 };
 const contour=(s,x,z,fraction)=>{
  let px=x,pz=z;
  for(const [dx,dz]of directions)if(exposed(s,dx,dz)){
   const d=dx?Math.abs(x-s.x-dx*.5):Math.abs(z-s.y-dz*.5),amount=inset(x,z,fraction)*Math.max(0,1-d/.5);
   px-=dx*amount;pz-=dz*amount;
  }return [px,pz];
 };
 const get=(x,y)=>{const key=`${Math.floor(x/SCREEN_CHUNK_SIZE)},${Math.floor(y/SCREEN_CHUNK_SIZE)}`;if(!chunks.has(key))chunks.set(key,{key,position:[],normal:[],uv:[],color:[],index:[],fringe:{position:[],uv:[],index:[]},far:{position:[],uv:[],index:[]},distant:{position:[],uv:[],index:[]},cells:[]});return chunks.get(key);};
 const fringeQuad=(g,points,mirror=false,lod=2)=>{for(const target of [g.fringe,...(lod<2?[g.far]:[]),...(lod<1?[g.distant]:[])]){const i=target.position.length/3;target.position.push(...points.flat());target.uv.push(...(mirror?[1,0,0,0,1,1,0,1]:[0,0,1,0,0,1,1,1]));target.index.push(i,i+1,i+2,i+2,i+1,i+3);}};
 const vertex=(g,x,y,z,base,n)=>{
  const i=g.position.length/3;g.position.push(x,y,z);g.normal.push(...n);g.uv.push(x+z,y-base);
  const tone=groundNoise(x+originX,z+originZ,8.5,plan.seed+457),t=.88+tone*.16;
  g.color.push(t*(.98+tone*.025),t,t*(1.015-tone*.035));return i;
 };
 for(const s of cells){
  const g=get(s.x,s.y);g.cells.push([s.x,s.y,s.base]);const first=g.position.length/3;
  for(let iz=0;iz<=2;iz++)for(let ix=0;ix<=2;ix++){
   // Sample normals at the actual half-cell mesh spacing. Adjacent vertices
   // reuse those samples instead of evaluating sub-pixel derivatives repeatedly.
   const x=s.x-.5+ix*.5,z=s.y-.5+iz*.5,h=coreAt(s,x,z),e=.5,dx=(coreAt(s,x+e,z)-coreAt(s,x-e,z))/(2*e),dz=(coreAt(s,x,z+e)-coreAt(s,x,z-e))/(2*e),len=Math.hypot(dx,1,dz);
   const [px,pz]=contour(s,x,z,1);vertex(g,px,h,pz,s.base,[-dx/len,1/len,-dz/len]);
  }
  for(let iz=0;iz<2;iz++)for(let ix=0;ix<2;ix++){const a=first+iz*3+ix,b=a+1,c=a+3,d=c+1;g.index.push(a,c,b,b,c,d);}
  // Close small core joins; no raised slab or detached cap at a tile seam.
  for(const [dx,dz]of directions)if(!exposed(s,dx,dz)){
   const other=lookup.get(`${s.x+dx},${s.y+dz}`);
   for(let col=0;col<2;col++){
    const points=[];for(const edge of [col*.5-.5,(col+1)*.5-.5]){const x=s.x+dx*.5+(dz?edge:0),z=s.y+dz*.5+(dx?edge:0),own=coreAt(s,x,z),lower=Math.min(own,coreAt(other,x,z));points.push([x,lower,z],[x,own,z]);}
    if(Math.abs(points[1][1]-points[0][1])+Math.abs(points[3][1]-points[2][1])<1e-6)continue;
    const a=g.position.length/3;for(const p of points)vertex(g,...p,s.base,[dx,0,dz]);g.index.push(a,a+1,a+2,a+2,a+1,a+3);
   }
  }
  for(const [dx,dz]of directions)if(exposed(s,dx,dz)){
   const start=g.position.length/3;
   for(let row=0;row<=5;row++)for(let col=0;col<=4;col++){
    const along=-.5+col*.25,bx=s.x+dx*.5+(dz?along:0),bz=s.y+dz*.5+(dx?along:0),top=coreAt(s,bx,bz),fraction=row/5;
    const [px,pz]=contour(s,bx,bz,fraction);vertex(g,px,s.base+(top-s.base)*fraction,pz,s.base,[dx,0,dz]);
   }
   for(let row=0;row<5;row++)for(let col=0;col<4;col++){const a=start+row*5+col,b=a+1,c=a+5,d=c+1;g.index.push(a,b,c,b,d,c);}
   // Folded shoulder normals soften the flat cut wall without extra models.
   for(let row=0;row<=5;row++)for(let col=0;col<=4;col++){
    const pos=(r,c)=>g.position.slice((start+r*5+c)*3,(start+r*5+c)*3+3),a=pos(row,Math.max(0,col-1)),b=pos(row,Math.min(4,col+1)),c=pos(Math.max(0,row-1),col),d=pos(Math.min(5,row+1),col),u=b.map((v,i)=>v-a[i]),v=d.map((n,i)=>n-c[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],sign=normal[0]*dx+normal[2]*dz<0?-1:1,len=Math.hypot(...normal)||1;
    g.normal.splice((start+row*5+col)*3,3,...normal.map(n=>n/len*sign));
   }
   const h=Math.min(roofAt(s.x,s.y,s.base,s),s.base+2.28),n=groundHash(s.x+dx*17,s.y+dz*31,plan.seed+81),group=compositionAt(s.x,s.y);
   for(let row=0;row<2;row++){
    const wet=plan.family==='wetlands',snow=plan.family==='snow',width=1.02+n*.38+group.mass*.28,top=h-.04-row*.16,height=wet?s.base+.06:Math.max(s.base+.25,h-(snow?.85:1.7)),offset=row?.22:-.24,depth=row?.24:.40,points=[];
    for(const vertical of [0,1])for(const a of [-width/2,width/2]){
     const along=a+offset+(vertical?(row?-.03:.03):0),out=depth+(vertical?-.08:.04)+a*(row?.18:-.18);
     points.push([s.x+dx*out+(dz?along:0),vertical?top:height,s.y+dz*out+(dx?along:0)]);
    }fringeQuad(g,points,n>.5,row===0?0:2);
   }
  }
  // A broad bough occasionally crosses several occupied cells. Quiet pockets
  // expose the painted core; they never make a gap in the blocked thicket.
  // Near/far/distant retain nested subsets of the same composed fans.
  const [ox,oz]=plan.origin||[0,0],n=groundHash(s.x+ox,s.y+oz,plan.seed+183),group=compositionAt(s.x,s.y),snow=plan.family==='snow';
  const count=group.mass>.58?3:group.mass>.43?2:1;
  if(group.mass>.28&&n<.12+group.mass*.70)for(let row=0;row<count;row++){
   const angle=group.angle+(n-.5)*.75+(row-.5)*.38,width=(snow?2.25:1.95)+group.mass*.65+n*.2,c=Math.cos(angle),sn=Math.sin(angle),top=coreAt(s,s.x,s.y)+.54,height=snow?.83:plan.family==='wetlands'?1.45:1.15,points=[];
   const jx=(groundHash(s.x+ox,s.y+oz,plan.seed+197)-.5)*.36,jz=(groundHash(s.x+ox,s.y+oz,plan.seed+211)-.5)*.36;
   for(const vertical of [0,1])for(const x of [-width/2,width/2]){
    const z=(vertical?(snow?.74:.43):snow?-.55:-.28)*(row?-1:1),px=s.x+jx+x*c-z*sn,pz=s.y+jz+x*sn+z*c;
    points.push([px,top-height+vertical*(height-.02-row*.045),pz]);
   }fringeQuad(g,points,n>.5,row);
  }
 }
 compositionCache.clear();coreCache.clear();ceilingCache.clear();cellGrid.length=0;
 return {chunks:[...chunks.values()],cells,roofAt,exposed};
}

// Rooted, intersecting branch silhouettes leave the low ground, water and
// individual trees visible. There is deliberately no extruded canopy floor or
// vertical perimeter wall. The same finite shader clips every LOD to the saved
// occupied cells, while full-height foliage explains the unchanged sight rule.
function rootedScreenSurface(plan){
 const lookup=new Map(plan.obstacles.screens.filter(s=>s.z===plan.level).map(s=>[s.x+','+s.y,s]));
 const cells=[...lookup.values()].filter(s=>s.family===plan.family),chunks=new Map(),[ox,oz]=plan.origin||[0,0];
 const planting=screenHollows(plan,cells,lookup);
 const roofAt=(x,z,base,owner=lookup.get(`${Math.floor(x+.5)},${Math.floor(z+.5)}`))=>{
  if(!owner||owner.base!==base)return base;
  let top=base;for(const l of owner.lobes){const q=1-((x-l.center[0])/l.radius[0])**2-((z-l.center[2])/l.radius[2])**2;if(q>=0)top=Math.max(top,l.center[1]+l.radius[1]*Math.sqrt(q));}return top;
 };
 const exposed=(s,dx,dz)=>{const n=lookup.get(`${s.x+dx},${s.y+dz}`);return !n||n.base!==s.base;};
 const get=(s)=>{const key=`${Math.floor(s.x/SCREEN_CHUNK_SIZE)},${Math.floor(s.y/SCREEN_CHUNK_SIZE)}`;if(!chunks.has(key))chunks.set(key,{key,position:[],normal:[],uv:[],color:[],index:[],fringe:{position:[],uv:[],index:[]},far:{position:[],uv:[],index:[]},distant:{position:[],uv:[],index:[]},roots:{position:[],uv:[],index:[]},cells:[]});return chunks.get(key);};
 const card=(targets,points,mirror)=>{for(const target of targets){const i=target.position.length/3;target.position.push(...points.flat());for(let row=0;row<3;row++)target.uv.push(mirror?1:0,row/2,mirror?0:1,row/2);target.index.push(i,i+1,i+2,i+2,i+1,i+3,i+2,i+3,i+4,i+4,i+3,i+5);}};
 const vertex=(g,p,normal,base,tone)=>{const i=g.position.length/3;g.position.push(...p);g.normal.push(...normal);g.uv.push(p[0]+p[2],p[1]-base);g.color.push(tone*.91,tone,tone*.84);return i;};
 const crown=(g,s,cx,cz,center,rx,ry,rz,phase,tone)=>{
  const start=g.position.length/3;
  for(const angle of [-Math.PI/2,-.40,.55,Math.PI/2])for(let i=0;i<8;i++){
   const a=i*Math.PI/4+phase,wave=1+.12*Math.sin(a*3+phase),px=cx+Math.cos(a)*Math.cos(angle)*rx*wave,pz=cz+Math.sin(a)*Math.cos(angle)*rz*wave;
   const h=Math.max(s.base,Math.min(center+Math.sin(angle)*ry,roofAt(px,pz,s.base))),nx=Math.cos(a)*Math.cos(angle)/rx,ny=Math.sin(angle)/ry,nz=Math.sin(a)*Math.cos(angle)/rz,len=Math.hypot(nx,ny,nz);
   vertex(g,[px,h,pz],[nx/len,ny/len,nz/len],s.base,tone);
  }
  for(let row=0;row<3;row++)for(let i=0;i<8;i++){const a=start+row*8+i,b=start+row*8+(i+1)%8,c=a+8,d=b+8;if(row>0)g.index.push(a,c,b);if(row<2)g.index.push(b,c,d);}
 };
 const groups=new Map();
 for(const s of cells){
  get(s).cells.push([s.x,s.y,s.base]);const key=screenClumpAt(s.x+ox,s.y+oz,plan.seed).key+','+s.base;
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);
 }
 for(const members of groups.values()){
  const s=members[0],g=get(s),x=members.reduce((n,c)=>n+c.x,0)/members.length,z=members.reduce((n,c)=>n+c.y,0)/members.length,wx=x+ox,wz=z+oz;
  const group=screenComposition(plan,x,z),wet=s.family==='wetlands',n=groundHash(wx,wz,plan.seed+183),cx=x+(groundHash(wx,wz,plan.seed+197)-.5)*.38,cz=z+(groundHash(wx,wz,plan.seed+211)-.5)*.38;
  const spanX=Math.max(...members.map(s=>s.x))-Math.min(...members.map(s=>s.x))+1,spanZ=Math.max(...members.map(s=>s.y))-Math.min(...members.map(s=>s.y))+1;
  if(!wet&&s.family!=='snow'){
   // Low rooted bramble, interrupted by larger leaf sprays. No high closed
   // canopy connects these bases, so the real terrain remains visible.
   const hollow=planting.at(cx,cz,s.base);
   if(n<.62&&(!hollow||hollow.q>1.2)){const h=.36+group.mass*.55;
    crown(g,s,cx,cz,s.base+h,spanX*(.34+n*.13),h,spanZ*(.34+n*.13),group.angle,.93+group.tone*.12);
   }
  }else if(wet){
   // Curved reed blades reveal water at their feet. Their broad middle leaves
   // overlap at eye height, while tapered tips give the stand an uneven crown.
   for(let i=0;i<14;i++){
    const a=i*2.399+group.angle,r=.16+(i%3)*.08;let bx=x+Math.cos(a)*r,bz=z+Math.sin(a)*r;
    const hollow=planting.at(bx,bz,s.base);if(hollow&&hollow.q<1.12){const factor=1.12/Math.max(.02,hollow.q);bx=hollow.h.x+(bx-hollow.h.x)*factor;bz=hollow.h.z+(bz-hollow.h.z)*factor;}
    const h=Math.min(...members.map(s=>s.height))*(.70+(i%4)*.08),width=.035+(i%3)*.014,start=g.position.length/3;
    for(let row=0;row<5;row++)for(const side of [-1,1]){
     const t=row/4,bend=Math.sin(t*Math.PI*.8)*.42,spread=Math.sin(t*Math.PI)*width,px=bx+Math.cos(a)*bend-Math.sin(a)*side*spread,pz=bz+Math.sin(a)*bend+Math.cos(a)*side*spread;
     vertex(g,[px,s.base+.025+h*t,pz],[-Math.cos(a)*.65,.4,-Math.sin(a)*.65],s.base,.88+group.tone*.24);
    }
    for(let row=0;row<4;row++){const k=start+row*2;g.index.push(k,k+1,k+2,k+2,k+1,k+3);}
   }
  }
  const count=Math.max(4,Math.ceil(members.length*.85)),rootCount=Math.max(2,Math.ceil(members.length/3));
  for(let i=0;i<count+rootCount;i++){
   const root=i>=count,lod=i%4===3?2:i%4===2?1:0,member=members[(i*5)%members.length],j=groundHash(member.x+ox,member.y+oz,plan.seed+i*17);
   let px=member.x+(j-.5)*.45,pz=member.y+(groundHash(member.x+ox,member.y+oz,plan.seed+i*31)-.5)*.45,angle=group.angle+i*1.047+(n-.5)*.8;
   const pocket=planting.at(px,pz,s.base);
   // Only the decorative root painting yields in the quiet centre. The scene
   // still renders every physical cover branch and its supporting fine stems.
   if(root&&pocket?.q<.78)continue;
   const hollow=!root&&pocket,rim=hollow?Math.max(0,Math.min(1,(1.5-hollow.q)/.7)):0;
   if(hollow){
    const {h,q}=hollow,factor=Math.max(1,(.98+j*.28)/Math.max(.02,q));px=h.x+(px-h.x)*factor;pz=h.z+(pz-h.z)*factor;
    // Turn existing fans partway around the hollow, with overlapping tips
    // and unequal setbacks. A complete upright ring would look like a fence.
    const dx=px-h.x,dz=pz-h.z,u=(dx*h.c+dz*h.sn)/(h.rx*h.rx),v=(-dx*h.sn+dz*h.c)/(h.rz*h.rz);
    const tangent=Math.atan2(u*h.sn+v*h.c,u*h.c-v*h.sn)+Math.PI/2,turn=Math.atan2(Math.sin(tangent-angle),Math.cos(tangent-angle));
    angle+=turn*rim*(.72+j*.20);
   }
   const c=Math.cos(angle),sn=Math.sin(angle),width=root?1.65:(wet?1.9:2.1+j*.55)*(1-rim*.16),bottom=s.base+(root?.025:wet?.05:.70+j*.2),top=root?s.base+1.48:s.base+(wet?2.08+group.mass*.85+j*.22:1.65+group.mass*1.4+j*.2)-rim*j*.23;
   const lean=(i%2?1:-1)*(root?.25:(wet?.45:.65+j*.4)*(1-rim*.76)),points=[];
   for(const row of [0,1,2])for(const side of [-1,1]){
    const fraction=row/2,along=side*width*.5,depth=(fraction-.5)*lean;
    points.push([px+along*c-depth*sn,bottom+(top-bottom)*fraction,pz+along*sn+depth*c]);
   }
   card(root?[g.roots]:[g.fringe,...(lod<2?[g.far]:[]),...(lod<1?[g.distant]:[])],points,(n+i*.37)%1>.5);
  }
 }
 return {chunks:[...chunks.values()],cells,roofAt,exposed,hollows:planting.hollows};
}
