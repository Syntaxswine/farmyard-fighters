import {MapGeometryCache} from '../map-geometry-cache.js';
import {sceneryRayHit} from '../scenery-rules.js';
import {isPhysicalScenery} from '../scenery-catalog.js';
import {foliageSignature,synchronizeFoliage,foliageOccluded} from '../foliage-obstacles.js';
import {isStrategicSite,siteRayHit} from '../strategic-site-rules.js';
import {unitBaseHeight} from '../tower-geometry.js';
import {woodlandDepth} from './woodland.js';
import {eyeHeight} from './projectiles.js';
import {detectRange} from './perception.js';
import {W,H,LEVELS,levelOf,terrainAt} from './maps.js';
import {EDGES,propCells,PROPS} from './environment.js';
export const TERRAIN_RANGE=75,CHARACTER_RANGE=60;
const N=W*H,index=(x,y,z)=>z*N+y*W+x,caches=new WeakMap();
function scene(s){let cache=caches.get(s);if(!cache){cache=new MapGeometryCache(buildScene);caches.set(s,cache);}return cache.get(s);}
function buildScene(s){const signature=foliageSignature(s);let c;
 const floors=new Uint8Array(N*LEVELS),tall=new Float32Array(N*LEVELS),east=new Uint8Array(N*LEVELS),south=new Uint8Array(N*LEVELS),holes=new Uint8Array(N*LEVELS);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)tall[index(x,y,0)]=s.map[y][x]==='wall'?2.7:s.map[y][x]==='crate'?.8:0;
 for(let z=1;z<LEVELS;z++)for(const [k,t]of Object.entries(s.upper[z-1]||{})){const [x,y]=k.split(',').map(Number);floors[index(x,y,z)]=1;tall[index(x,y,z)]=t==='wall'?2.7:t==='crate'?.8:0;}
 for(const p of s.props||[]){const rule=PROPS[p.kind],height=rule?.tall?2.7:rule?.solid&&rule.cover>0?.8:0;for(const q of propCells(p))tall[index(q.x,q.y,q.z)]=Math.max(tall[index(q.x,q.y,q.z)],height);}
 for(const p of s.stairs||[])holes[index(p.x,p.y,p.z+1)]=1;
 for(const [k,v]of Object.entries(s.edges)){const [axis,x,y,z=0]=k.split(':'),rule=EDGES[v];if(+x>=0&&+y>=0&&rule?.opaque)(axis==='e'?east:south)[index(+x,+y,+z)]=rule.window?2:1;}
 c={scenery:(s.props||[]).filter(isPhysicalScenery),sites:(s.props||[]).filter(isStrategicSite),hasWoodland:!!Object.keys(s.foliage||{}).length||signature.includes('woodland'),signature,floors,tall,east,south,holes,foliage:synchronizeFoliage(s),observers:new Map()};return c;
}
// Cached grid traversal of the same .8-unit cover / 2.7-unit walls used by projectiles.
// Reveal the destination surface itself; only intervening volumes hide a terrain tile.
function clear(c,a,b){
 const az=levelOf(a),bz=levelOf(b),dx=b.x-a.x,dy=b.y-a.y,h0=unitBaseHeight(a)+eyeHeight(a),dh=bz*3+eyeHeight(a)-h0;
 if(c.scenery.length){const length=Math.hypot(dx,dy,dh);if(length>.001&&sceneryRayHit(c.scenery,{x:a.x,y:a.y,h:h0},{x:dx/length,y:dy/length,h:dh/length},Math.max(0,length-.51)))return false;}
 if(c.sites.length){const length=Math.hypot(dx,dy,dh);if(length>.001&&siteRayHit(c.sites,{x:a.x,y:a.y,h:h0},{x:dx/length,y:dy/length,h:dh/length},Math.max(0,length-.51)))return false;}
 const length=Math.hypot(dx,dy,dh);if(length>.51){const t=(length-.51)/length;if(foliageOccluded(c.foliage,[a.x,h0,a.y],[a.x+dx*t,h0+dh*t,a.y+dy*t]))return false;}
 if(dh)for(let z=1;z<LEVELS;z++){const t=(z*3-h0)/dh;if(t<=0||t>=1)continue;const fx=a.x+dx*t,fy=a.y+dy*t;for(const x of [Math.round(fx-1e-8),Math.round(fx+1e-8)])for(const y of [Math.round(fy-1e-8),Math.round(fy+1e-8)])if(c.floors[index(x,y,z)]&&!c.holes[index(x,y,z)])return false;}
 const solid=(x,y,t0,t1)=>{const lo=Math.min(h0+dh*t0,h0+dh*t1),hi=Math.max(h0+dh*t0,h0+dh*t1);for(let z=0;z<LEVELS;z++){const height=c.tall[index(x,y,z)];if(height&&hi>=z*3&&lo<z*3+height-1e-7)return true;}return false;};
 const edge=(axis,x,y,t,offset)=>{const h=h0+dh*t,z=Math.floor(h/3),local=h-z*3;if(local>2.7)return false;const v=(axis===0?c.east:c.south)[index(x,y,z)];return v===1||(v===2&&!(local>=1&&local<=2.4&&offset>=.15&&offset<=.85));};
 let x=a.x,y=a.y,ix=0,iy=0,entry=0;const nx=Math.abs(dx),ny=Math.abs(dy),sx=Math.sign(dx),sy=Math.sign(dy);
 while(ix<nx||iy<ny){
  const tx=nx?(ix+.5)/nx:Infinity,ty=ny?(iy+.5)/ny:Infinity,t=Math.min(tx,ty);
  if((x!==a.x||y!==a.y)&&solid(x,y,entry,t))return false;
  if(Math.abs(tx-ty)<1e-10){const ex=Math.min(x,x+sx),ey=Math.min(y,y+sy);if(edge(0,ex,y,t,sy>0?1:0)||edge(1,x,ey,t,sx>0?1:0)||edge(1,x+sx,ey,t,sx>0?0:1)||edge(0,ex,y+sy,t,sy>0?0:1)||solid(x+sx,y,t,t)||solid(x,y+sy,t,t))return false;x+=sx;y+=sy;ix++;iy++;}
  else if(tx<ty){if(edge(0,Math.min(x,x+sx),y,t,a.y+dy*t-y+.5))return false;x+=sx;ix++;}
  else {if(edge(1,x,Math.min(y,y+sy),t,a.x+dx*t-x+.5))return false;y+=sy;iy++;}
  entry=t;
 }
 return true;
}
export function terrainVisibility(s,observers){const c=scene(s),observerKey=observers.map(p=>p.x+','+p.y+','+levelOf(p)+','+p.heading+','+p.cone+','+(p.species||'')+','+eyeHeight(p)+','+unitBaseHeight(p)).join(';');if(c.observerKey===observerKey)return c.visible;const visible=new Set();for(const p of observers){const cacheKey=p.x+','+p.y+','+levelOf(p)+','+p.heading+','+p.cone+','+(p.species||'')+','+eyeHeight(p)+','+unitBaseHeight(p);let cells=c.observers.get(cacheKey);if(!cells){cells=[];for(let z=0;z<LEVELS;z++)for(let y=Math.max(0,p.y-TERRAIN_RANGE);y<=Math.min(H-1,p.y+TERRAIN_RANGE);y++)for(let x=Math.max(0,p.x-TERRAIN_RANGE);x<=Math.min(W-1,p.x+TERRAIN_RANGE);x++){const id=index(x,y,z);if(z!==levelOf(p)&&z>0&&!c.floors[id])continue;if(Math.hypot(x-p.x,y-p.y,(z-levelOf(p))*3)<=detectRange(p,{x,y},TERRAIN_RANGE)&&clear(c,p,{x,y,z})&&(!c.hasWoodland||Math.hypot(x-p.x,y-p.y,(z-levelOf(p))*3)+9*woodlandDepth(s,p,{x,y,z})<=detectRange(p,{x,y},TERRAIN_RANGE)))cells.push(z?x+','+y+','+z:x+','+y);}c.observers.set(cacheKey,cells);if(c.observers.size>12)c.observers.delete(c.observers.keys().next().value);}for(const k of cells)visible.add(k);}c.observerKey=observerKey;c.visible=visible;return visible;}
