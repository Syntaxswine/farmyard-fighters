import {sceneryRayHit} from '../scenery-rules.js';
import {isPhysicalScenery,sceneryId} from '../scenery-catalog.js';
import {foliageRayHit} from '../foliage-obstacles.js';
import {structureInfo} from '../structure-health.js';
import {siteRayHit,isStrategicSite,siteId} from '../strategic-site-rules.js';
import {barrelRayHit,barrelId} from '../explosive-barrels.js';
import {bodyIntersection,firearmTrajectory,pelletTrajectories} from '../ballistic-shot.js';
import {bankRayHit} from '../ramp-banks.js';
import {rampRayHit} from '../cliff-ramps.js';
import {cliffSupportAt} from '../cliff-support.js';
import {cliffRayHit} from '../cliff-map-geometry.js';
import {unitBaseHeight,towerRayHit} from '../tower-geometry.js';
import {terrainAt,levelOf,sightEdge,edgeBetween,W,H,LEVELS} from './maps.js';
import {PROPS,propAt} from './environment.js';

const EPS=1e-7;
export const bodyHeight=u=>u.hp<=0?.3:u.stance==='prone'?.55:u.stance==='kneeling'?1.2:1.8;
export const muzzleHeight=u=>u.stance==='prone'?.35:u.stance==='kneeling'?.9:1.3;
export const eyeHeight=muzzleHeight;
export const targetHeight=(u,zone='torso')=>u.ground?.04:u.barrel?.4:zone==='weapon'?muzzleHeight(u):bodyHeight(u)*(zone==='head'?.92:zone==='legs'?.28:.72);
const point=(origin,direction,t)=>({x:origin.x+direction.x*t,y:origin.y+direction.y*t,h:origin.h+direction.h*t});
const slab=(origin,velocity,low,high)=>Math.abs(velocity)<EPS?(origin>=low&&origin<=high?[-Infinity,Infinity]:null):[Math.min((low-origin)/velocity,(high-origin)/velocity),Math.max((low-origin)/velocity,(high-origin)/velocity)];

// A shot has one continuous path. Team membership never filters collision candidates.
export function traceProjectile(state,shooter,origin,direction,reach,{purpose='shot'}={}){
 const length=Math.hypot(direction.x,direction.y,direction.h);
 if(!Number.isFinite(length)||length<EPS||!Number.isFinite(reach)||reach<=0)throw Error('Invalid projectile ray');
 const d={x:direction.x/length,y:direction.y/length,h:direction.h/length};
 let nearest=null,limit=reach;
 for(const unit of purpose==='sight'?[]:state.units){
  if(unit===shooter||unit.away||unit.casualty==='quit'||!(unit.hp>0||['bleeding','stable'].includes(unit.casualty)))continue; // a unit that crossed the map edge (away) or quit the squad (G5) has no body here
  const hit=bodyIntersection(unit,origin,d,reach,bodyHeight(unit));
  if(hit&&hit.distance<limit){limit=hit.distance;nearest=unit;}
 }
 const barrelHit=barrelRayHit(state.props,origin,d,limit);let nearestProp=barrelHit?.prop;
 if(barrelHit){limit=barrelHit.distance;nearest=null;}
 const siteHit=siteRayHit(state.props,origin,d,limit);
 if(siteHit){limit=siteHit.distance;nearest=null;nearestProp=siteHit.prop;}
 const sceneryHit=sceneryRayHit(state.props,origin,d,limit);
 if(sceneryHit){limit=sceneryHit.distance;nearest=null;nearestProp=sceneryHit.prop;}
 const impact=(kind,t,extra={})=>{const p=point(origin,d,t),surfaceKind=extra.propKind||(extra.structure&&structureInfo(state,extra.structure)?.kind);return {kind,...p,...surfaceKind&&{surfaceKind},z:Math.max(0,Math.min(LEVELS-1,Math.floor((p.h+EPS)/3))),distance:t,...extra};};
 const hits=[foliageRayHit(state,origin,d,limit,purpose),bankRayHit(state.props,origin,d,limit),rampRayHit(state.props,origin,d,limit),towerRayHit(state.props,origin,d,limit),cliffRayHit(state.props,origin,d,limit)].filter(t=>t!==null),terrainHit=hits.length?Math.min(...hits):null;if(terrainHit!==null&&terrainHit<limit){limit=terrainHit;nearest=null;nearestProp=null;}
 // Exact grid/level crossings keep thin walls, corner joins and floor slabs solid.
 const crossings=[0,limit];
 for(const axis of ['x','y'])if(Math.abs(d[axis])>EPS){
  let boundary=Math.floor(origin[axis]+.5)+(d[axis]>0?.5:-.5);
  for(let t=(boundary-origin[axis])/d[axis];t<limit;t=(boundary-origin[axis])/d[axis]){if(t>EPS)crossings.push(t);boundary+=Math.sign(d[axis]);}
 }
 if(Math.abs(d.h)>EPS)for(let z=0;z<LEVELS;z++){const t=(z*3-origin.h)/d.h;if(t>EPS&&t<limit)crossings.push(t);}
 crossings.sort((a,b)=>a-b);
 const times=crossings.filter((t,i)=>!i||t-crossings[i-1]>EPS);
 for(let i=0;i<times.length;i++){
  const t=times[i],p=point(origin,d,t),before=point(origin,d,t-EPS),after=point(origin,d,t+EPS);
  const ax=Math.round(before.x),ay=Math.round(before.y),bx=Math.round(after.x),by=Math.round(after.y);
  if(after.x<-.5||after.y<-.5||after.x>=W-.5||after.y>=H-.5)return impact('boundary',t);
  if(t>EPS){
   const lower=Math.floor(Math.min(before.h,after.h)/3),upper=Math.floor(Math.max(before.h,after.h)/3);
   if(lower!==upper&&upper>=0&&upper<LEVELS){
    const cells=new Set([`${ax},${ay}`,`${bx},${by}`]);
    for(const cell of cells){const [x,y]=cell.split(',').map(Number);if((upper===0||terrainAt(state,x,y,upper)!=='void'&&!cliffSupportAt(state,{x,y,z:upper}))&&!(state.stairs||[]).some(s=>s.x===x&&s.y===y&&s.z===upper-1))return impact('floor',t,{structure:{x,y,z:upper}});}
   }
   const z=Math.floor(p.h/3),height=p.h-z*3;
   if(z>=0&&z<LEVELS&&height<=2.7){
    if(ax!==bx&&ay!==by)for(const [x,y]of [[ax,by],[bx,ay]]){const terrain=terrainAt(state,x,y,z),placed=propAt(state,x,y,z),prop=PROPS[placed?.kind],top=terrain==='wall'||prop?.tall?2.7:terrain==='crate'||prop?.solid&&!prop.explosive&&prop.cover>0?.8:0;if(top&&height<=top)return impact('cover',t,{...(terrain==='wall'?{structure:{x,y,z}}:placed?{propKind:placed.kind}:{})});}
    if(ax!==bx)for(const y of new Set([ay,by]))if(sightEdge(state,{x:ax,y,z},{x:bx,y,z},{height,offset:p.y-y+.5}))return impact('wall',t,{structure:{edge:edgeBetween({x:ax,y,z},{x:bx,y,z})}});
    if(ay!==by)for(const x of new Set([ax,bx]))if(sightEdge(state,{x,y:ay,z},{x,y:by,z},{height,offset:p.x-x+.5}))return impact('wall',t,{structure:{edge:edgeBetween({x,y:ay,z},{x,y:by,z})}});
   }
  }
  if(i===times.length-1)break;
  const end=times[i+1],mid=point(origin,d,(t+end)/2),x=Math.round(mid.x),y=Math.round(mid.y),z=Math.floor(mid.h/3);
  if(z<0)return impact('floor',t,{structure:{x,y,z:0}});
  if(z>=LEVELS)continue;
  const terrain=terrainAt(state,x,y,z),placed=propAt(state,x,y,z),prop=PROPS[placed?.kind];
  const height=terrain==='wall'||prop?.tall?2.7:(terrain==='crate'||prop?.solid&&!prop.explosive&&prop.cover>0)?.8:0;
  if(height){const vertical=slab(origin.h,d.h,z*3,z*3+height);if(vertical){const hit=Math.max(t,vertical[0]);if(hit<=Math.min(end,vertical[1]))return impact('cover',hit,{...(terrain==='wall'?{structure:{x,y,z}}:placed?{propKind:placed.kind}:{})});}}
 }
 if(terrainHit!==null&&limit===terrainHit)return impact('cover',limit);
 if(nearestProp)return impact('prop',limit,{propId:isPhysicalScenery(nearestProp)?sceneryId(nearestProp):isStrategicSite(nearestProp)?siteId(nearestProp):barrelId(nearestProp),propKind:nearestProp.kind});
 if(nearest){const result=impact('unit',limit,{unitId:nearest.id}),relative=(result.h-unitBaseHeight(nearest))/bodyHeight(nearest);result.zone=relative>.85?'head':relative<.38?'legs':'torso';return result;}
 return impact('range',reach);
}

export function bulletTrajectory(state,shooter,target,options,random){
 return firearmTrajectory(state,shooter,target,options,random,{trace:traceProjectile,bodyHeight,muzzleHeight,targetHeight});
}

export function shotgunTrajectories(state,shooter,target,options,random){
 return pelletTrajectories(state,shooter,target,options,random,{trace:traceProjectile,bodyHeight,muzzleHeight,targetHeight});
}
