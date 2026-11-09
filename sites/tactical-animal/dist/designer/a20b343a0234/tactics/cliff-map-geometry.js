import {MAP_LEVELS} from './map-layers.js';
import * as T from './vendor/three.module.js';
import {CLIFF_HEIGHT} from './cliff-models.js';
import {cliffTileGeometry} from './cliff-tiles.js';
import {cliffTiles,isCliff} from './cliff-map.js';

// Collision uses the same welded triangles as rendering, in tactical coordinates.
// Awareness filters fixture props into fresh arrays; key by cliff content to reuse geometry.
const cache=new Map();
export function cliffGeometry(props=[]){
 const signature=JSON.stringify(props.filter(isCliff));
 let entry=cache.get(signature);if(entry)return entry;
 const index=new Map();
 for(let level=0;level<MAP_LEVELS;level++){
  const tiles=cliffTiles(props,level);if(!tiles.length)continue;
  const geometry=cliffTileGeometry('mixed',tiles,{weathered:true}),a=geometry.attributes.position;
  for(let i=0;i<a.count;i+=3){
   const points=[0,1,2].map(j=>new T.Vector3(a.getX(i+j)-.5,a.getY(i+j)+level*3,a.getZ(i+j)-.5));
   const xs=points.map(p=>p.x),ys=points.map(p=>p.z),triangle={points,level};
   for(let x=Math.floor(Math.min(...xs)+.5);x<=Math.floor(Math.max(...xs)+.5);x++)for(let y=Math.floor(Math.min(...ys)+.5);y<=Math.floor(Math.max(...ys)+.5);y++){
    const key=x+','+y;if(!index.has(key))index.set(key,[]);index.get(key).push(triangle);
   }
  }
  geometry.dispose();
 }
 entry={index,signature};if(cache.size>=2)cache.delete(cache.keys().next().value);cache.set(signature,entry);return entry;
}
export function cliffRayHit(props,origin,direction,reach){
 if(!props?.some(isCliff))return null;
 const {index}=cliffGeometry(props),o=new T.Vector3(origin.x,origin.h,origin.y),d=new T.Vector3(direction.x,direction.h,direction.y).normalize(),ray=new T.Ray(o,d),hit=new T.Vector3(),times=[0,reach],candidates=new Set();
 for(const axis of ['x','z'])if(Math.abs(d[axis])>1e-10){
  const end=o[axis]+d[axis]*reach,lo=Math.min(o[axis],end),hi=Math.max(o[axis],end);
  for(let k=Math.ceil(lo-.5);k+.5<=hi;k++){const t=(k+.5-o[axis])/d[axis];if(t>0&&t<reach)times.push(t);}
 }
 times.sort((a,b)=>a-b);
 for(let i=0;i<times.length;i++)for(const t of [times[i],i?(times[i]+times[i-1])/2:times[i]]){
  const x=o.x+d.x*t,y=o.z+d.z*t;
  for(const dx of [-1e-7,1e-7])for(const dy of [-1e-7,1e-7])for(const tri of index.get(Math.floor(x+.5+dx)+','+Math.floor(y+.5+dy))||[])candidates.add(tri);
 }
 let nearest=null;
 for(const {points} of candidates)if(ray.intersectTriangle(...points,false,hit)){const distance=hit.distanceTo(o);if(distance<=reach+1e-7&&(nearest===null||distance<nearest))nearest=distance;}
 return nearest;
}
// Heights here use the core's 3-unit floors; presentation uses floorSpacing=2.12.
// This is a surface query, not permission to stand, climb, or enter from water.
export function cliffSurfaceAt(props,x,y,level=0){
 const p=props.find(p=>isCliff(p)&&p.x===Math.floor(x+.5)&&p.y===Math.floor(y+.5)&&(p.z||0)===level);if(!p)return null;
 const height=level*3+CLIFF_HEIGHT+.01,t=cliffRayHit(props,{x,y,h:height},{x:0,y:0,h:-1},CLIFF_HEIGHT+.02);
 return t===null?null:{x,y,z:level,height:height-t,family:p.kind.slice(6),climbable:p.kind==='cliff-ledge'};
}
