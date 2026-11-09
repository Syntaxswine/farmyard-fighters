import {grenadeWorld,sweepGrenade,GRENADE_FLOOR} from './grenade-geometry.js';
import {structureInfo,damageStructure,emptyScenery,mergeScenery} from './structure-health.js';

// Collect before committing: a single blast cannot damage a window twice via
// its sill/lintel, or expose a second room halfway through resolving the blast.
export function planStructureBlast(s,origin,radius,damageAt,{spacing=GRENADE_FLOOR,accept=()=>true}={}){
 const scale=GRENADE_FLOOR/spacing,from={...origin,h:origin.h*scale},world=grenadeWorld(s),plans=new Map();
 for(const b of world.items){
  const q=b.source,target=q.edge?{edge:q.edge}:q.x!==undefined&&['floor','roof','wall'].includes(q.kind)?{x:q.x,y:q.y,z:q.z||0}:null;
  if(!target)continue;
  const p={x:Math.max(b.min[0],Math.min(from.x,b.max[0])),y:Math.max(b.min[2],Math.min(from.y,b.max[2])),h:Math.max(b.min[1],Math.min(from.h,b.max[1]))};
  const point={...p,h:p.h/scale},distance=Math.hypot(point.x-origin.x,point.y-origin.y,point.h-origin.h);
  if(distance>radius)continue;
  const info=structureInfo(s,target);if(!info||!accept(info,point))continue;
  const amount=damageAt(distance);if(!(amount>0)||amount<=(plans.get(info.id)?.damage||0))continue;
  const hit=sweepGrenade(world,from,p,0);
  if(hit&&hit.t<.995&&distance>.001)continue;
  plans.set(info.id,{target,damage:amount});
 }
 return [...plans.values()];
}
export function commitStructureDamage(s,plans){
 const receipts=[],before=emptyScenery();
 for(const p of plans){const r=damageStructure(s,p.target,p.damage);if(!r)continue;receipts.push(r);mergeScenery(before,r.before);}
 return {receipts,before,destroyed:receipts.filter(r=>r.destroyed).length};
}
export function projectileStructureDamage(s,shots,damageAt){
 return commitStructureDamage(s,shots.filter(p=>p.structure).map(p=>({target:p.structure,damage:damageAt(p)})));
}
