import {traceProjectile,eyeHeight} from './core/projectiles.js';
import {CHARACTER_RANGE} from './core/visibility.js';
import {sightOf} from './core/perception.js';
import {W,H} from './core/maps.js';
import {unitBaseHeight} from './tower-geometry.js';

// A horizontal eye-height sight envelope, not a promise to detect a sneaking target.
export function guardCone(s,u){
 const width=u.cone??sightOf(u).field,steps=Math.ceil(width/3),range=CHARACTER_RANGE*sightOf(u).range,origin={x:u.x,y:u.y,h:unitBaseHeight(u)+eyeHeight(u)},world={...s,units:[]},points=[{x:u.x,y:u.y,z:u.z||0}];
 for(let i=0;i<=steps;i++){
  const angle=((u.heading??0)-width/2+width*i/steps)*Math.PI/180,dx=Math.cos(angle),dy=Math.sin(angle);
  const edge=Math.min(range,dx>1e-8?(W-1-u.x)/dx:dx< -1e-8?-u.x/dx:Infinity,dy>1e-8?(H-1-u.y)/dy:dy< -1e-8?-u.y/dy:Infinity);
  // An outward ray from a boundary tile has no length to trace. Close that
  // side of the cone at the guard instead of passing an invalid zero ray.
  if(edge<=1e-7){points.push({...points[0]});continue;}
  const hit=traceProjectile(world,null,origin,{x:dx,y:dy,h:0},edge);
  points.push({x:hit.x,y:hit.y,z:u.z||0});
 }
 return points;
}
export function visibleConeGuards(s,level){return s.units.filter(u=>u.team==='guard'&&u.hp>0&&!u.away&&(u.z||0)===level&&s.detected.has(u.id));}
export function drawGuardCones(ctx,cones,project){
 ctx.save();ctx.fillStyle='#e7a44418';ctx.strokeStyle='#e7a44488';ctx.lineWidth=1;
 for(const points of cones){ctx.beginPath();points.forEach((point,i)=>{const p=project(point);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.fill();ctx.stroke();}
 ctx.restore();
}
