import {foliageSignature} from './foliage-obstacles.js';
import {buildWorld,traceWorld,DIMENSIONS} from './hybrid-world.js';
import {segmentBox} from './hybrid-geometry.js';
import {MAP_LEVELS} from './map-layers.js';
const caches=new WeakMap();
export const isHybrid=s=>s?.geometryMode==='hybrid';
export const floorSpacing=s=>isHybrid(s)?DIMENSIONS.floorSpacing:3;
export const physicalHeight=(s,u)=>isHybrid(s)?u.hp<=0?.3:DIMENSIONS[u.stance]||DIMENSIONS.standing:u.hp<=0?.3:u.stance==='prone'?.55:u.stance==='kneeling'?1.2:1.8;
export const physicalMuzzle=(s,u)=>isHybrid(s)?u.stance==='prone'?.35:u.stance==='kneeling'?.9:1.2:u.stance==='prone'?.35:u.stance==='kneeling'?.9:1.3;
export function muzzlePoint(s,u){
 const h=(u.z||0)*floorSpacing(s)+physicalMuzzle(s,u);
 if(!isHybrid(s))return {x:u.x,y:u.y,h};
 const body=bodyRegions(s,u),weapon=body.regions.find(r=>r.zone==='weapon'),offset=weapon.max[0];
 return {x:u.x+Math.cos(body.heading)*offset,y:u.y+Math.sin(body.heading)*offset,h};
}
// Explicit invalidation at simulation mutations. Shallow state views share their map key.
export function invalidateHybrid(s){caches.delete(s.map||s.terrain);}
const geometrySignature=s=>foliageSignature(s);
export function synchronizeHybrid(s){if(!isHybrid(s))return;const old=caches.get(s.map||s.terrain);if(old?.signature!==geometrySignature(s))invalidateHybrid(s);}
export function hybridWorld(s){
 const key=s.map||s.terrain;let cached=caches.get(key);
 if(!cached){const geometry=buildWorld(s),unsupported=geometry.diagnostics.filter(d=>!d.source.startsWith('stairs:'));if(unsupported.length)throw Error('Unsupported hybrid content: '+unsupported.map(d=>d.source).join(', '));cached={geometry,signature:geometrySignature(s)};caches.set(key,cached);}
 return cached.geometry;
}
export function bodyRegions(s,u){
 const height=physicalHeight(s,u),prone=u.stance==='prone'||u.hp<=0;
 const heading=(u.heading??(u.facing===-1?180:0))*Math.PI/180;
 const make=(zone,x,y,w,h,d)=>({zone,center:[x,y,0],size:[w,h,d],min:[x-w/2,y-h/2,-d/2],max:[x+w/2,y+h/2,d/2]});
 const regions=prone?[make('legs',-.5,height*.4,.6,height*.65,.34),make('torso',.05,height*.5,.65,height,.44),make('head',.55,height*.65,.35,height*.7,.32),make('weapon',.83,.35,.3,.12,.18)]
 :[make('legs',0,height*.18,.38,height*.36,.32),make('torso',0,height*.60,.48,height*.48,.38),make('head',0,height*.92,.3,height*.16,.3),make('weapon',.37,physicalMuzzle(s,u),.4,.14,.18)];
 return {heading,origin:[u.x,(u.z||0)*floorSpacing(s),u.y],regions};
}
export function aimPoint(s,u,zone='torso'){
 if(!isHybrid(s))return {x:u.x,y:u.y,h:(u.z||0)*3+(zone==='weapon'?physicalMuzzle(s,u):physicalHeight(s,u)*(zone==='head'?.92:zone==='legs'?.28:.72))};
 const body=bodyRegions(s,u),r=body.regions.find(r=>r.zone===zone)||body.regions[1],c=Math.cos(body.heading),n=Math.sin(body.heading);
 return {x:u.x+r.center[0]*c,y:u.y+r.center[0]*n,h:body.origin[1]+r.center[1]};
}
export function traceHybrid(s,shooter,origin,direction,reach,{bodies=true,purpose='shot'}={}){
 const length=Math.hypot(direction.x,direction.y,direction.h);if(!Number.isFinite(length)||length<1e-7||!Number.isFinite(reach)||reach<=0)throw Error('Invalid projectile ray');
 const start=[origin.x,origin.h,origin.y],end=[origin.x+direction.x/length*reach,origin.h+direction.h/length*reach,origin.y+direction.y/length*reach];
 let hit=traceWorld(hybridWorld(s),start,end,{filter:b=>purpose==='sight'?b.blocksSight!==false:b.blocksShot!==false}),limit=hit?.t??1;
 // Canonical event precision avoids last-bit Math.hypot differences between V8 builds.
 const canonical=v=>Math.round(v*1e10)/1e10;
 const impact=(kind,t,extra={})=>{const p=start.map((v,i)=>canonical(v+(end[i]-v)*t));return {kind,x:p[0],y:p[2],h:p[1],z:Math.max(0,Math.min(MAP_LEVELS-1,Math.floor((p[1]+1e-7)/floorSpacing(s)))),distance:canonical(t*reach),...extra};};
 let result=hit?impact(hit.kind==='roof'?'floor':hit.kind==='foliage'?'cover':hit.kind,hit.t,{objectId:hit.id,normal:hit.normal,material:hit.material}):impact('range',1);
 // Keep the playable map boundary and physical ground outside painted/void tiles.
 for(const [axis,lo,hi]of [[0,-.5,239.5],[2,-.5,239.5],[1,0,Infinity]]){
  const delta=end[axis]-start[axis];let t=null;
  if(start[axis]<lo||start[axis]>hi)t=0;
  else if(delta<0&&end[axis]<lo)t=(lo-start[axis])/delta;
  else if(delta>0&&end[axis]>hi)t=(hi-start[axis])/delta;
  if(t!==null&&t<limit){limit=t;result=impact(axis===1?'floor':'boundary',t);}
 }
 if(bodies&&purpose!=='sight')for(const u of s.units||[]){if(u===shooter||u.away||!(u.hp>0||['bleeding','stable'].includes(u.casualty)))continue;
  const body=bodyRegions(s,u),c=Math.cos(body.heading),n=Math.sin(body.heading);
  const local=p=>{const x=p[0]-body.origin[0],z=p[2]-body.origin[2];return [x*c+z*n,p[1]-body.origin[1],-x*n+z*c];};
  for(const r of body.regions){const t=segmentBox(local(start),local(end),r);if(t!==null&&t<limit){limit=t;result=impact('unit',t,{unitId:u.id,zone:r.zone,objectId:`unit:${u.id}:${r.zone}`});}}
 }
 return result;
}
