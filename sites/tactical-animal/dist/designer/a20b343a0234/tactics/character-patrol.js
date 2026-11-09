import {MAP_LEVELS} from './map-layers.js';
// Authored patrols are separate from the AI's disposable investigation route.
export const PATROL_WAIT_STEP=15,MAX_PATROL_POINTS=128,MAX_PATROL_WAIT=86400;
export const samePatrolTile=(a,b)=>a.x===b.x&&a.y===b.y&&(a.z||0)===(b.z||0);
export function patrolError(points,size=240){
 if(points===undefined)return '';
 if(!Array.isArray(points)||points.length>MAX_PATROL_POINTS)return `Patrols support up to ${MAX_PATROL_POINTS} waypoints.`;
 const seen=new Set();
 for(const p of points){
  if(!p||![p.x,p.y,p.z??0].every(Number.isInteger)||p.x<0||p.y<0||p.x>=size||p.y>=size||(p.z??0)<0||(p.z??0)>=MAP_LEVELS)return 'Patrol waypoints must stay on playable levels inside the map or block.';
  if(!Number.isInteger(p.waitSeconds)||p.waitSeconds<0||p.waitSeconds>MAX_PATROL_WAIT||p.waitSeconds%PATROL_WAIT_STEP)return 'Patrol waits must be multiples of 15 seconds, up to 24 hours.';
  const key=[p.x,p.y,p.z||0].join(',');if(seen.has(key))return 'Duplicate patrol waypoint: add wait time to the existing flag instead.';seen.add(key);
 }return '';
}
export function patrolMapErrors(map,size=240,passable=null){
 const errors=[];
 for(const [i,g]of (map.guards||[]).entries()){
  const error=patrolError(g.patrol,size),name=g.character?.displayName||`Character ${i+1}`;
  if(error)errors.push(name+': '+error);
  else if(g.patrol?.length){
   if(g.towerPost)errors.push(name+': fixed tower lookouts cannot follow a ground patrol.');
   if(passable)for(const [n,p]of g.patrol.entries())if(!passable(map,p))errors.push(`${name}: patrol waypoint ${n+1} needs a walkable tile.`);
  }
 }return errors;
}
export function clickPatrolPoint(points,point){
 const next=structuredClone(points||[]),found=next.find(p=>samePatrolTile(p,point));
 if(found)found.waitSeconds+=PATROL_WAIT_STEP;
 else next.push({x:point.x,y:point.y,z:point.z||0,waitSeconds:0});
 const error=patrolError(next);if(error)throw Error(error);return next;
}
export const shiftPatrol=(points,dx,dy,dz=0)=>points.map(p=>({...p,x:p.x+dx,y:p.y+dy,z:(p.z||0)+dz}));

// Called only while calm and outside turn-based combat. Time is game minutes,
// so pausing, save/load and time acceleration use the same clock as everything else.
export function patrolDestination(s,g){
 if(!g.patrol?.length)return null;
 const now=s.clock?.minutes??0;
 if(!Number.isInteger(g.patrolIndex)||g.patrolIndex<0||g.patrolIndex>=g.patrol.length)g.patrolIndex=0;
 let point=g.patrol[g.patrolIndex];
 if(!samePatrolTile(g,point)){delete g.patrolWaitUntil;return point;}
 if(g.patrolWaitUntil===undefined)g.patrolWaitUntil=now+point.waitSeconds/60;
 if(now+1e-9<g.patrolWaitUntil||g.patrol.length===1)return null;
 g.patrolIndex=(g.patrolIndex+1)%g.patrol.length;delete g.patrolWaitUntil;
 return g.patrol[g.patrolIndex];
}
export function validPatrolState(g){
 return !patrolError(g.patrol)&&(g.patrolIndex===undefined||Number.isInteger(g.patrolIndex)&&g.patrolIndex>=0&&g.patrolIndex<(g.patrol?.length||0))&&(g.patrolWaitUntil===undefined||Number.isFinite(g.patrolWaitUntil)&&g.patrolWaitUntil>=0&&!!g.patrol?.length);
}
