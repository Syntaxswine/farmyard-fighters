import {MAP_LEVELS} from './map-layers.js';
import {hedgeObstacles} from './hedge-obstacles.js';
import {isHedge} from './hedge-data.js';
import {hedgeSurfaceHit,compileHedgeSurface} from './hedge-surfaces.js';
import {foliageAt,foliageRule,foliageTreeAt,foliageTreeSpaceAvailable,foliageOccupied} from './foliage-data.js';
import {biomeFamilyAt,biomeSeed} from './biome-family.js';
import {selectBiomeTree} from './biome-tree-mix.js';
import {biomePlantParts,BIOME_TREE_GROUNDING} from './biome-plant-parts.js';
import {segmentBox} from './hybrid-geometry.js';
import {groundHash} from './biome-ground-composition.js';
import {TREE_COVER,treeCoverOf} from './foliage-tree-cover.js';
import {MapGeometryCache,invalidateMapGeometry} from './map-geometry-cache.js';

// These are physical world heights, with the same local silhouette conversion
// used by battle-shot-effects. Floor/ledge bases are converted independently.
// Dense thickets contain several finite volumes per tile. Two-tile buckets
// avoid testing an entire 8x8 stand for each terrain-visibility ray. This only
// narrows candidate lists; exact volumes and nearest-hit tests are unchanged.
const SCALE=1.65/1.8,CHUNK=2,caches=new WeakMap();
const keyOf=m=>m.terrain||m.map;
export function treePlacementRank(m){const origin=m.environment?.origin?.map(n=>n*240)||[0,0],seed=biomeSeed(m);return t=>groundHash(t.x+origin[0],t.y+origin[1],seed+631+t.z*911);}
export function foliageSignature(m){const d=m.definition||m;return JSON.stringify([keyOf(m),m.upper,m.coverOccupiedProps||m.props,m.foliage,m.environment,m.edges,m.stairs,m.climbs,d.starts,d.guards,d.exits]);}
export function invalidateFoliage(m){caches.delete(keyOf(m));invalidateMapGeometry(m);}
export function synchronizeFoliage(m){
 let cached=caches.get(keyOf(m));
 if(!cached){cached={geometry:new MapGeometryCache(map=>{
  // Rendering removes separately painted props but preserves their complete
  // occupancy list. Switching back to the simulation is not a forest edit.
  // Check foliage's own inputs after a generic cache miss before rebuilding it.
  const signature=foliageSignature(map);if(signature===cached.signature)return cached.scene;
  const scene=!Object.keys(map.foliage||{}).length&&!signature.includes('"woodland')&&!(map.coverOccupiedProps||map.props||[]).some(isHedge)?{boxes:[],worldBoxes:[],index:new Map(),worldIndex:new Map(),trees:[],screens:[],wood:[]}:buildFoliageObstacles(map);
  cached.signature=signature;return scene;
 })};caches.set(keyOf(m),cached);}
 cached.scene=cached.geometry.get(m);return cached.scene;
}
export function foliageObstacles(m){return caches.get(keyOf(m))?.scene||synchronizeFoliage(m);}

export function foliageSegment(start,end,b){
 if(b.hedgeTree)return hedgeSurfaceHit(start,end,b);
 if(b.lobes){
  // Leaf masses are clipped to their painted tile; paths remain visibly open.
  let lo=0,hi=1;for(let i=0;i<3;i++){const d=end[i]-start[i];if(Math.abs(d)<1e-10){if(start[i]<b.min[i]||start[i]>b.max[i])return null;}else {let a=(b.min[i]-start[i])/d,c=(b.max[i]-start[i])/d;if(a>c)[a,c]=[c,a];lo=Math.max(lo,a);hi=Math.min(hi,c);}}if(lo>hi)return null;
  let hit=null;for(const l of b.lobes){
   const ox=(start[0]-l.center[0])/l.radius[0],oy=(start[1]-l.center[1])/l.radius[1],oz=(start[2]-l.center[2])/l.radius[2],dx=(end[0]-start[0])/l.radius[0],dy=(end[1]-start[1])/l.radius[1],dz=(end[2]-start[2])/l.radius[2];
   const a=dx*dx+dy*dy+dz*dz,q=2*(dx*ox+dy*oy+dz*oz),c=ox*ox+oy*oy+oz*oz-1,disc=q*q-4*a*c;if(disc<0||a<1e-14)continue;
   const near=(-q-Math.sqrt(disc))/(2*a),far=(-q+Math.sqrt(disc))/(2*a),t=Math.max(lo,near);if(t<=Math.min(hi,far)&&(hit===null||t<hit))hit=t;
  }
  return hit;
 }
 if(!b.beam)return segmentBox(start,end,b);
 const {a,b:tip,radius}=b.beam,v=tip.map((n,i)=>n-a[i]),length=Math.hypot(...v),w=v.map(n=>n/length);
 const u=Math.abs(w[1])<.99?[w[2],0,-w[0]]:[1,0,0],ul=Math.hypot(...u);for(let i=0;i<3;i++)u[i]/=ul;
 const n=[w[1]*u[2]-w[2]*u[1],w[2]*u[0]-w[0]*u[2],w[0]*u[1]-w[1]*u[0]];
 const local=p=>{const q=p.map((v,i)=>v-a[i]);return [q.reduce((s,v,i)=>s+v*u[i],0),q.reduce((s,v,i)=>s+v*w[i],0),q.reduce((s,v,i)=>s+v*n[i],0)];};
 return segmentBox(local(start),local(end),{min:[-radius,0,-radius],max:[radius,length,radius]});
}
function indexed(boxes){const index=new Map();for(const b of boxes)for(let x=Math.floor(b.min[0]/CHUNK);x<=Math.floor(b.max[0]/CHUNK);x++)for(let y=Math.floor(b.min[2]/CHUNK);y<=Math.floor(b.max[2]/CHUNK);y++){const k=`${x},${y}`;if(!index.has(k))index.set(k,[]);index.get(k).push(b);}return index;}
export function traceFoliage(scene,start,end,purpose='shot',space='simulation',anyHit=false){
 const index=space==='world'?scene.worldIndex:scene.index,dx=end[0]-start[0],dz=end[2]-start[2],sx=Math.sign(dx),sz=Math.sign(dz),visited=new Set();let hit=null,x=Math.floor(start[0]/CHUNK),z=Math.floor(start[2]/CHUNK);
 if(!Number.isFinite(dx)||!Number.isFinite(dz)||!Number.isFinite(start[1])||!Number.isFinite(end[1]))return null;
 let tx=dx?((x+(sx>0?1:0))*CHUNK-start[0])/dx:Infinity,tz=dz?((z+(sz>0?1:0))*CHUNK-start[2])/dz:Infinity;const stepX=dx?CHUNK/Math.abs(dx):Infinity,stepZ=dz?CHUNK/Math.abs(dz):Infinity;
 const visit=(x,z)=>{
   for(const b of index.get(`${x},${z}`)||[]){
    if(visited.has(b))continue;visited.add(b);if(purpose==='sight'?!b.blocksSight:!b.blocksShot)continue;
    const entry=segmentBox(start,end,b);if(entry===null||hit&&entry>hit.t)continue;
    const at=foliageSegment(start,end,b);if(at!==null&&(!hit||at<hit.t)){hit={t:at,box:b};if(anyHit)return true;}
   }
   return false;
 };
 // Traverse in entry order instead of allocating/sorting every boundary cut.
 // At a corner also visit both touched side buckets, including reverse rays.
 while(true){
  if(visit(x,z))return hit;const next=Math.min(tx,tz);
  if(hit&&hit.t<Math.min(next,1)-1e-10||next>1)break;
  if(Math.abs(tx-tz)<1e-10){if(visit(x+sx,z)||visit(x,z+sz))return hit;x+=sx;z+=sz;tx+=stepX;tz+=stepZ;}
  else if(tx<tz){x+=sx;tx+=stepX;}
  else {z+=sz;tz+=stepZ;}
 }
 return hit;
}
// Terrain reveal needs a yes/no obstruction, not the nearest impact receipt.
// Firearms, guard/target rays and public trace callers retain nearest-hit order.
export function foliageOccluded(scene,start,end,space='simulation'){return !!traceFoliage(scene,start,end,'sight',space,true);}
export function foliageRayHit(m,origin,direction,reach,purpose='shot'){
 const start=[origin.x,origin.h,origin.y],end=[origin.x+direction.x*reach,origin.h+direction.h*reach,origin.y+direction.y*reach],hit=traceFoliage(foliageObstacles(m),start,end,purpose);
 return hit?hit.t*reach:null;
}
function beamBox(a,b,radius,extra){return {...extra,beam:{a,b,radius},min:a.map((v,i)=>Math.min(v,b[i])-radius),max:a.map((v,i)=>Math.max(v,b[i])+radius)};}
function rotate(p,r){const c=Math.cos(r),s=Math.sin(r);return [p[0]*c+p[2]*s,p[1],-p[0]*s+p[2]*c];}
function partBeam(p){
 if(p.a)return [p.a,p.b];
 const [rx,ry,rz]=p.rotation||[0,0,0],sy=Math.sin(ry),cy=Math.cos(ry),sx=Math.sin(rx),cx=Math.cos(rx),sz=Math.sin(rz),cz=Math.cos(rz);
 const axis=[sy*sx*cz-cy*sz,cx*cz,cy*sx*cz+sy*sz];
 return [-1,1].map(sign=>p.position.map((v,i)=>v+axis[i]*p.size[1]*sign/2));
}
// Explicit study overrides never enter the ordinary saved-map cache.
export function buildFoliageObstacles(m,{denseTreeMix=null,treesOnly=false}={}){
 if(denseTreeMix!==null&&!['current','mixed','trees'].includes(denseTreeMix))throw Error('Unknown dense tree mix');
 const override=denseTreeMix===null?null:({current:'brush-v1',mixed:'mixed-v1',trees:'trees-v1'})[denseTreeMix];
 const hasExtra=override?override!=='brush-v1':Object.values(m.foliage||{}).some(c=>TREE_COVER[treeCoverOf(c)]?.rank>=0);
 const terrain=keyOf(m)||[],width=terrain[0]?.length||0,depth=terrain.length,trees=[],screens=[],wood=[],worldBoxes=[],boxes=[],origin=m.environment?.origin?.map(n=>n*240)||[0,0],seed=biomeSeed(m);
 const ledges=new Set((m.props||[]).filter(p=>p.kind==='cliff-ledge'&&(p.cliffMask??15)===15).map(p=>`${p.x},${p.y},${(p.z||0)+1}`));
 const bases=(x,y,z)=>ledges.has(`${x},${y},${z}`)?[(z-1)*3+2,(z-1)*2.12+2]:[z*3,z*2.12];
 function add(b,simBase,worldBase){
  if(b.triangles){b.hedgeTree=compileHedgeSurface(b.triangles);delete b.triangles;}
  b.foliageVolume=true;b.kind='foliage';b.material=b.blocksShot?'wood':'foliage';b.center=b.min.map((v,i)=>(v+b.max[i])/2);b.size=b.max.map((v,i)=>v-b.min[i]);worldBoxes.push(b);
  const cv=p=>[p[0],simBase+(p[1]-worldBase)/SCALE,p[2]],s={...b,min:cv(b.min),max:cv(b.max)};if(b.hedgeTree)s.hedgeSpace={base:worldBase,simBase,scale:SCALE};if(b.beam)s.beam={a:cv(b.beam.a),b:cv(b.beam.b),radius:b.beam.radius};if(b.lobes)s.lobes=b.lobes.map(l=>({center:cv(l.center),radius:[l.radius[0],l.radius[1]/SCALE,l.radius[2]]}));boxes.push(s);
 }
 const candidates=[],infill=[],occupied=foliageOccupied(m);
 for(let z=0;z<=Math.min(MAP_LEVELS-1,m.upper?.length||0);z++)for(let y=0;y<depth;y++)for(let x=0;x<width;x++){
  const c=foliageAt(m,x,y,z);if(!c||occupied.has(`${x},${y},${z}`))continue;const rule=foliageRule(m,x,y,z),family=rule.family||biomeFamilyAt(m,x,y,z),[simBase,base]=bases(x,y,z),id=`foliage:${x},${y},${z}`,source={x,y,z};
  if(rule.opaque&&!treesOnly){
   const variation=groundHash(x+origin[0],y+origin[1],seed+43),height=rule.height*(1+.45*variation),lobes=[[.32,.50,.86],[1.10,.92,.89],[height-.75,.75,.86+.12*variation]].map(([h,ry,r])=>({center:[x,base+h,y],radius:[r,ry,r]}));
   const screen={id:id+':screen',source,family,height,base,x,y,z,lobes,blocksSight:true,blocksShot:false,min:[x-.5,base,y-.5],max:[x+.5,base+height,y+.5]};screens.push(screen);add(screen,simBase,base);
   // Crossing substantial deadfall supplies real cover below the leaf screen.
   // Two slim beams leave honest shot gaps; leaves never become bulletproof.
   for(let i=0;i<2;i++){
    const n=groundHash(x+origin[0],y+origin[1],seed+z*911+i*53),angle=n*Math.PI*2,h=.36+i*.72+n*.22,r=.12,dx=Math.cos(angle)*.34,dy=Math.sin(angle)*.34,
     a=[x-dx,base+h,y-dy],b=[x+dx,base+h+.12*(n-.5),y+dy],beam=beamBox(a,b,r,{id:id+':wood:'+i,source,family,blocksSight:true,blocksShot:true});wood.push(beam);add(beam,simBase,base);
   }
  }
  if(!c[1]&&foliageTreeAt(m,x,y,z))candidates.push({x,y,z,family,simBase,base,dense:false});
  else if(c[1]){
   const wx=x+origin[0],wy=y+origin[1],gx=Math.floor(wx/9),gy=Math.floor(wy/9);
   const current=wx===gx*9+3+Math.floor(groundHash(gx,gy,seed+83+z*911)*3)&&wy===gy*9+3+Math.floor(groundHash(gx,gy,seed+197+z*911)*3),ix=Math.floor(wx/3),iy=Math.floor(wy/3),extra=hasExtra&&wx===ix*3+Math.floor(groundHash(ix,iy,seed+419+z*911)*3)&&wy===iy*3+Math.floor(groundHash(ix,iy,seed+521+z*911)*3);
   if(!current&&!extra)continue;
   let safe=true;for(let dy=-3;dy<=3&&safe;dy++)for(let dx=-3;dx<=3;dx++){const other=foliageAt(m,x+dx,y+dy,z);if(!other?.[1]||bases(x+dx,y+dy,z)[1]!==base){safe=false;break;}}
   if(safe&&foliageTreeSpaceAvailable(m,x,y,z,3))(current?candidates:infill).push({x,y,z,family,simBase,base,dense:true});
  }
 }
 // Reserve a complete potential population before applying saved cell tiers.
 // Neighbouring mix edits cannot free a candidate slot and shuffle other trees.
 const rank=treePlacementRank(m);
 infill.sort((a,b)=>rank(a)-rank(b)||a.z-b.z||a.y-b.y||a.x-b.x);
 const slots=new Map(),slotKey=(x,y,z)=>x+','+y+','+z;
 const reserve=t=>{const k=slotKey(Math.floor(t.x/3),Math.floor(t.y/3),t.z);if(!slots.has(k))slots.set(k,[]);slots.get(k).push(t);};
 candidates.forEach(reserve);
 for(const t of infill){
  let near=false;const gx=Math.floor(t.x/3),gy=Math.floor(t.y/3);
  for(let y=gy-1;y<=gy+1&&!near;y++)for(let x=gx-1;x<=gx+1;x++)if(slots.get(slotKey(x,y,t.z))?.some(c=>Math.hypot(c.x-t.x,c.y-t.y)<2.6)){near=true;break;}
  if(near)continue;reserve(t);
  const mix=override||treeCoverOf(foliageAt(m,t.x,t.y,t.z));
  if(rank(t)<=(TREE_COVER[mix]?.rank??-1))candidates.push(t);
 }
 for(const t of candidates){
  const {x,y,z,family,simBase,base,dense}=t,{id,variant}=selectBiomeTree(family,x+origin[0],y+origin[1],seed+z*911),scale=dense?1.8:1;
  trees.push({...t,id,variant,scale});if(treesOnly)continue;
  for(const [i,p]of biomePlantParts(id,variant).entries())if(p.paint==='bark'&&p.shape!=='biome-buttress'&&p.size[0]>=.07){
   const points=partBeam(p).map(q=>rotate(q,variant*.45)).map(q=>[x+q[0]*scale,base+(q[1]+BIOME_TREE_GROUNDING[id][variant])*scale,y+q[2]*scale]);
   add(beamBox(...points,p.size[0]*scale/2,{id:`foliage:${x},${y},${z}:trunk:${i}`,source:{x,y,z},family,blocksSight:true,blocksShot:true}),simBase,base);
  }
 }
 if(!treesOnly)for(const b of hedgeObstacles(m))add(b,b.simBase,b.base);
 return {boxes,worldBoxes,index:indexed(boxes),worldIndex:indexed(worldBoxes),trees,screens,wood};
}
