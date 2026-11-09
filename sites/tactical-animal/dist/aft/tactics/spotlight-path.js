import {MAP_LEVELS} from './map-layers.js';
import {PATROL_WAIT_STEP,MAX_PATROL_WAIT,samePatrolTile} from './character-patrol.js';

export const MAX_SPOTLIGHT_POINTS=3,SPOT_LEG_SECONDS=60;
export const spotlightAimPoints=prop=>(prop.lightTargets||[]).map(p=>p&&({x:prop.x+p.x,y:prop.y+p.y,z:(prop.z||0)+(p.z??0),waitSeconds:p.waitSeconds===undefined?0:p.waitSeconds}));

// A reusable block may aim beyond its own edge; full maps and editor clicks
// still require targets inside their map. A beam may target an unwalkable tile.
export function spotlightPathError(points,size=240){
 if(!Array.isArray(points)||points.length>MAX_SPOTLIGHT_POINTS)return 'Spotlights support up to three aim points.';
 const seen=new Set();
 for(const p of points){
  // Older authored lighting studies use precise positions between tile centres.
  if(!p||![p.x,p.y,p.z??0].every(Number.isFinite)||(p.z??0)<0||(p.z??0)>=MAP_LEVELS||size!==null&&(p.x<0||p.y<0||p.x>=size||p.y>=size))return 'Spotlight aim points must be positions on layers 1–6 inside the map.';
  if(!Number.isInteger(p.waitSeconds)||p.waitSeconds<0||p.waitSeconds>MAX_PATROL_WAIT||p.waitSeconds%PATROL_WAIT_STEP)return 'Spotlight waits must be multiples of 15 seconds, up to 24 hours.';
  const key=[p.x,p.y,p.z||0].join(',');if(seen.has(key))return 'Duplicate spotlight aim point: add wait time to its flag instead.';seen.add(key);
 }
 return '';
}
export function clickSpotlightPoint(points,point){
 const next=structuredClone(points||[]),found=next.find(p=>samePatrolTile(p,point));
 if(found)found.waitSeconds=(found.waitSeconds||0)+PATROL_WAIT_STEP;
 else next.push({x:point.x,y:point.y,z:point.z||0,waitSeconds:0});
 const error=spotlightPathError(next);if(error)throw Error(error);return next;
}
export function spotlightPathPhase(points,seconds){
 const waits=points.map(p=>Number.isFinite(p.waitSeconds)?Math.max(0,Math.min(MAX_PATROL_WAIT,p.waitSeconds)):0);
 const duration=points.length*SPOT_LEG_SECONDS+waits.reduce((sum,n)=>sum+n,0);
 let elapsed=Math.max(0,seconds)%duration;
 for(let i=0;i<points.length;i++){
  if(elapsed<waits[i]+SPOT_LEG_SECONDS)return {a:points[i],b:points[(i+1)%points.length],t:Math.max(0,elapsed-waits[i])/SPOT_LEG_SECONDS};
  elapsed-=waits[i]+SPOT_LEG_SECONDS;
 }
 return {a:points[0],b:points[0],t:0};
}
