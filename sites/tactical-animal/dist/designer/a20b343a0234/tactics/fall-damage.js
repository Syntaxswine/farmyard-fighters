import {bodyMass} from './character-mass.js';
import {MAP_LEVELS} from './map-layers.js';
import {loadWeight} from './core/inventory.js';
import {woundLeg} from './combat-state.js';
import {terrainAt,passable,blockedEdge} from './core/maps.js';

// Balance curve: 20 / 50 / 90 HP for one / two / three stories at 100 kg total.
// Fractional heights are useful for slips before reaching the top of a climb.
export function fallDamage(u,height){
 height=Math.max(0,height);
 const weight=Math.max(.75,Math.min(1.5,Math.sqrt((bodyMass(u)+loadWeight(u))/100)));
 return Math.round((5*height*height+15*height)*weight);
}
export const fallPoint=u=>({x:u.x,y:u.y,z:u.z||0,...u.towerPost?{towerPost:{...u.towerPost}}:{},...u.cliffSupport?{cliffSupport:{...u.cliffSupport}}:{}});
export function cancelClimbOrders(s,u){if(s.queue?.some(p=>p.id===u.id||p.group?.some(q=>q.id===u.id)))s.queue=[];}
export function findFallLanding(s,u,column,fromLevel=(column.z||0)+1,reserved=new Set(),ignore=new Set()){
 const occupied=p=>s.units.some(v=>v!==u&&!ignore.has(v)&&!v.away&&(v.hp>0||['bleeding','stable'].includes(v.casualty))&&!v.towerPost&&Math.round(v.x)===p.x&&Math.round(v.y)===p.y&&(v.z||0)===p.z);
 for(let z=Math.min(MAP_LEVELS-1,Math.ceil(fromLevel)-1);z>=0;z--){
  if(terrainAt(s,column.x,column.y,z)==='void')continue;
  const p={x:column.x,y:column.y,z},choices=[p,...[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:p.x+dx,y:p.y+dy,z})).filter(q=>!blockedEdge(s,p,q))];
  // A solid occupied floor stops a fall; never tunnel through it to the next level.
  return choices.find(q=>passable(s,q)&&!occupied(q)&&!reserved.has(`${q.x},${q.y},${q.z}`))||null;
 }
 return null;
}
export function applyFallInjury(s,u,height,hurt=(s,u,damage)=>{u.hp=Math.max(0,u.hp-damage);if(!u.hp){u.casualty='dead';u.ap=0;}}){
 const damage=fallDamage(u,height);if(damage>0)hurt(s,u,damage);
 if(damage>=20&&u.hp>0)woundLeg(u);
 u.overwatch=null;u.running=false;u.sneaking=false;u.route=null;
 return damage;
}
export function failedClimbFall(s,u,route,{hurt,fatal}={}){
 const from=fallPoint(u),to=route.to||route,down=(to.z||0)<from.z;
 const tower=route.tower,stories=tower?3:route.kind==='window'?1/3:route.kind==='wall'?1:Math.abs((to.z||0)-from.z)||1;
 const bottom=tower?route.bottom:down?to:from;
 const height=route.kind==='window'||route.kind==='wall'?stories:down||route.descending?stories:stories/2;
 const landing=findFallLanding(s,u,bottom,(bottom.z||0)+1);
 delete u.towerPost;delete u.cliffSupport;cancelClimbOrders(s,u);
 if(landing)Object.assign(u,landing);else {u.x=bottom.x;u.y=bottom.y;u.z=bottom.z||0;}
 const damage=applyFallInjury(s,u,height,hurt);
 if(!landing){if(fatal)fatal(s,u);else{u.hp=0;u.casualty='dead';u.ap=0;}}
 return {unitId:u.id,from,to:fallPoint(u),height,damage,kind:'fall'};
}
