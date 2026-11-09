import {adjacentTo,canControl,move,navigationPath,pathCost} from './core/engine.js';
import {visibleLoot,nearbyLoot} from './battle-inventory.js';
import {cliffSupportAt} from './cliff-support.js';
import {rampSupportAt} from './cliff-ramps.js';
import {siteSupportAt} from './strategic-site-rules.js';

export function pickupRoute(s,u,pile){
 if(!u||!canControl(s,u))return {ok:false,reason:'This merc cannot move now.'};
 if(!s.loot.includes(pile)||!visibleLoot(s,pile))return {ok:false,reason:'Those items are no longer visible.'};
 if(adjacentTo(s,u,pile))return {ok:true,path:[],cost:0};
 const z=pile.z||0,candidates=[];
 for(const [dx,dy]of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]){
  const p={x:pile.x+dx,y:pile.y+dy,z},support=siteSupportAt(s,p)||rampSupportAt(s,p)||cliffSupportAt(s,p);
  // Never inherit a tower post or the actor's old terrain support at a new tile.
  const at={...u,...p,towerPost:null,cliffSupport:support};
  if(!adjacentTo(s,at,pile))continue;
  const path=navigationPath(s,u,p.x,p.y,p.z);if(path?.length)candidates.push({ok:true,path,goal:p,cost:pathCost(path)});
 }
 return candidates.sort((a,b)=>a.cost-b.cost)[0]||{ok:false,reason:'No discovered route to an interaction spot.'};
}

// This is a UI intention, not a second movement engine. Every step still pays
// normal AP/stamina and rechecks doors, occupants, casualties and visibility.
export class PickupOrder {
 constructor(){this.pending=null;}
 cancel(){const p=this.pending,next=p?.state.queue[0],g=next?.goal;if(p&&next?.id===p.id&&g&&g.x===p.goal?.x&&g.y===p.goal?.y&&g.z===p.goal?.z)p.state.queue=[];this.pending=null;}
 start(s,u,pile){
  this.cancel();const route=pickupRoute(s,u,pile);if(!route.ok)return route;
  if(route.path.length&&!move(s,u,route.goal.x,route.goal.y,route.goal.z))return {ok:false,reason:'Movement unavailable. Check AP and stamina.'};
  this.pending={state:s,id:u.id,pile,goal:route.goal};return route;
 }
 update(s,{busy=false,selectedId=s.selected}={}){
  const p=this.pending;if(!p)return null;
  const u=s.units.find(u=>u.id===p.id),stop=reason=>{this.cancel();return {stopped:true,reason};};
  if(p.state!==s||p.id!==selectedId)return stop('Pickup cancelled.');
  if(!canControl(s,u)||!s.loot.includes(p.pile)||!visibleLoot(s,p.pile))return stop('Pickup interrupted.');
  if(s.queue.length){const next=s.queue[0],g=next.goal;if(next.id!==u.id||!g||g.x!==p.goal?.x||g.y!==p.goal?.y||g.z!==p.goal?.z)return stop('Pickup cancelled by another order.');}
  if(busy)return null;
  if(nearbyLoot(s,u).includes(p.pile)){s.queue=[];this.cancel();return {ready:true,id:u.id,pile:p.pile};}
  if(!s.queue.length)return stop('Pickup stopped before reaching the items. Check AP, stamina or the route.');
  return null;
 }
}
