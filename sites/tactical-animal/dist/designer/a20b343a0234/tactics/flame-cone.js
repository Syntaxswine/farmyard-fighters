import {traceProjectile,muzzleHeight,targetHeight} from './core/projectiles.js';
import {inBounds,levelOf,tileKey} from './core/maps.js';
import {unitBaseHeight} from './tower-geometry.js';
import {isExplosiveBarrel,barrelId} from './explosive-barrels.js';

// The hull of the nozzle and a circular mouth: an ice-cream-cone template,
// ten tiles long and six tiles wide with the current weapon definition.
// Characters do not shield each other from a spray; scenery still intercepts it.
export const FLAME_RADIUS_RATIO=.3;
const EPS=1e-6;
function reachAt(shape,offset){const c=shape.range-shape.radius;return c*Math.cos(offset)+Math.sqrt(Math.max(0,shape.radius**2-(c*Math.sin(offset))**2));}
export function insideFlame(shape,p){
 const x=p.x-shape.origin.x,y=p.y-shape.origin.y,r=Math.hypot(x,y);
 if(r<EPS||r>shape.range+EPS)return false;
 const cosine=(x*Math.cos(shape.heading)+y*Math.sin(shape.heading))/r;
 return cosine>=Math.cos(shape.halfAngle)-EPS&&r<=reachAt(shape,Math.acos(Math.min(1,Math.max(-1,cosine))))+EPS;
}
export function flameShape(s,a,point,w){
 const heading=Math.atan2(point.y-a.y,point.x-a.x),base=unitBaseHeight(a),origin={x:a.x,y:a.y,h:base+muzzleHeight(a)},world={...s,units:[]},rays=[];
 const radius=w.range*FLAME_RADIUS_RATIO,halfAngle=Math.asin(radius/(w.range-radius)),steps=36,shape={origin,base,z:levelOf(a),heading,halfAngle,range:w.range,radius,rays};
 for(let i=0;i<=steps;i++){
  const offset=-halfAngle+2*halfAngle*i/steps,angle=heading+offset;
  rays.push(traceProjectile(world,null,origin,{x:Math.cos(angle),y:Math.sin(angle),h:0},reachAt(shape,offset)));
 }
 return shape;
}
export function flameVictims(s,a,shape){
 const world={...s,units:[]};
 return s.units.filter(u=>{
  if(u.id===a.id||u.away||['quit','captured','dead'].includes(u.casualty)||!(u.hp>0||['bleeding','stable'].includes(u.casualty))||Math.abs(unitBaseHeight(u)-shape.base)>1||!insideFlame(shape,u))return false;
  // A standing head can be exposed over low cover while a prone body is safe.
  // These exact same candidates are used by the preview and the damage pass.
  return ['torso','head','legs'].some(zone=>{
   const end={x:u.x,y:u.y,h:unitBaseHeight(u)+targetHeight(u,zone)},d={x:end.x-shape.origin.x,y:end.y-shape.origin.y,h:end.h-shape.origin.h},length=Math.hypot(d.x,d.y,d.h);
   const hit=traceProjectile(world,null,shape.origin,d,length);
   return hit.kind==='range'||hit.distance>=length-EPS;
  });
 });
}
export function flamePreview(s,a,point,w,charges){
 const finite=point&&[point.x,point.y,point.z??0].every(Number.isFinite),distance=finite?Math.hypot(point.x-a.x,point.y-a.y):0;
 let reason='';
 if(!finite||!inBounds(Math.round(point.x),Math.round(point.y),levelOf(point)))reason='Choose a point on the map';
 else if(distance<EPS)reason='Point the cone away from the shooter';
 else if(levelOf(point)!==levelOf(a)||!point.ground&&Math.abs(unitBaseHeight(point)-unitBaseHeight(a))>1)reason='Aim along the shooter’s current level';
 else if(!point.ground&&distance>w.range)reason='Out of range';
 else if(a.team==='squad'&&!s.seen.has(tileKey(Math.round(point.x),Math.round(point.y),levelOf(point))))reason='Choose discovered terrain';
 else if(a.burningTurns)reason='On fire: running in panic';
 else if((a.ammo?.[a.weapon]??0)<1)reason='Reload required';
 else if(charges&&a.ap<w.cost)reason='Not enough AP';
 const shape=finite&&distance>EPS?flameShape(s,a,point,w):null;
 return {ok:!reason,reason,cost:w.cost,rounds:1,chance:100,zone:'torso',range:w.range,flame:shape,affected:shape?flameVictims(s,a,shape).map(u=>u.id):[]};
}
export function flameBarrels(s,shape){
 const world={...s,units:[]};
 return s.props.filter(isExplosiveBarrel).filter(p=>{
  if(Math.abs(unitBaseHeight(p)-shape.base)>1||!insideFlame(shape,p))return false;
  const d={x:p.x-shape.origin.x,y:p.y-shape.origin.y,h:unitBaseHeight(p)+.4-shape.origin.h},range=Math.hypot(d.x,d.y,d.h);
  return traceProjectile(world,null,shape.origin,d,range+.01).propId===barrelId(p);
 });
}
