import {canControl,move,navigationState,pathTo,reachable,pathCost,walkable,occupant,turnTo,headingTo,key} from './core/engine.js';
import {inBounds} from './core/maps.js';
import {cliffSupportAt} from './cliff-support.js';
import {rampSupportAt} from './cliff-ramps.js';
import {siteSupportAt} from './strategic-site-rules.js';
import {dialogueParticipants,dialoguePosition,dialogueReadiness,TALK_RANGE} from './dialogue-rules.js';

function atTile(s,u,p){
 return {...u,...p,towerPost:null,cliffSupport:siteSupportAt(s,p)||rampSupportAt(s,p)||cliffSupportAt(s,p)};
}
export function dialogueRoute(s,u,npc,{routeTo=pathTo,reachableFrom=reachable}={}){
 const ready=dialogueParticipants(s,npc,u);if(!ready.ok)return ready;
 if(!canControl(s,u))return {ok:false,reason:'This merc cannot move now.'};
 if(dialoguePosition(s,npc,u).ok)return {ok:true,path:[],cost:0};
 // Reuse the discovered navigation graph and normal movement costs. Candidate
 // destinations are on the NPC's level, with a clear conversation sightline.
 const planning=navigationState(s),z=npc.z||0,candidates=[];
 for(let y=Math.max(0,npc.y-TALK_RANGE);y<=npc.y+TALK_RANGE;y++)for(let x=Math.max(0,npc.x-TALK_RANGE);x<=npc.x+TALK_RANGE;x++){
  if(!inBounds(x,y,z)||Math.hypot(x-npc.x,y-npc.y)>TALK_RANGE||!walkable(planning,x,y,z)||occupant(planning,x,y,z))continue;
  candidates.push({x,y,z});
 }
 candidates.sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y));
 let reachableTiles,reachablePoints;
 for(const goal of candidates){
  if(reachableTiles&&!reachableTiles.has(key(goal.x,goal.y,goal.z)))continue;
  if(!dialoguePosition(s,npc,atTile(s,u,goal)).ok)continue;
  const path=routeTo(planning,u,goal.x,goal.y,goal.z);
  if(!path?.length){
   // A separated region can contain hundreds of plausible talking spots. Once
   // the nearest fails, explore the shared movement graph once rather than
   // exhausting that same region in a new path search for every candidate.
   if(reachableTiles)break;
   reachablePoints=reachableFrom(planning,u,Infinity);
   reachableTiles=new Set(reachablePoints.map(p=>key(p.x,p.y,p.z)));
   continue;
  }
  const stop=path.findIndex(p=>dialoguePosition(s,npc,atTile(s,u,p)).ok),route=stop<0?path:path.slice(0,stop+1);
  const end=route.at(-1);return {ok:true,path:route,goal:{x:end.x,y:end.y,z:end.z},cost:pathCost(route)};
 }
 // No talking spot is reachable. Walk to the nearest reachable point toward
 // the NPC, using the same single reachability pass, then end the intention.
 // Never open dialogue through a wall, move backwards just to appear busy,
 // or keep retrying an impossible destination on every movement tick.
 let fallback;
 if(reachablePoints){
  const distance=p=>Math.hypot(p.x-npc.x,p.y-npc.y,((p.z||0)-z)*3);
  let closest=null,bestDistance=distance(u);
  for(const p of reachablePoints){const d=distance(p);if(d<bestDistance-1e-9||closest&&Math.abs(d-bestDistance)<1e-9&&p.cost<closest.cost){closest=p;bestDistance=d;}}
  if(closest)fallback=routeTo(planning,u,closest.x,closest.y,closest.z);
 }else fallback=routeTo(planning,u,npc.x,npc.y,z,{partial:true});
 if(fallback?.length){const end=fallback.at(-1);return {ok:true,partial:true,path:fallback,goal:{x:end.x,y:end.y,z:end.z},cost:pathCost(fallback),reason:'Route blocked. Walking as close as possible, then stopping.'};}
 return {ok:false,reason:'Route blocked. Already as close as possible; no clear talking spot within '+TALK_RANGE+' tiles.'};
}

// A transient intention: save/load never silently resumes a conversation.
// Movement itself still belongs to the engine and pays normal stamina/AP.
export class DialogueOrder {
 constructor(){this.pending=null;}
 ownsQueue(s){const p=this.pending,next=s.queue[0],g=next?.goal;return p?.state===s&&next?.id===p.id&&g&&g.x===p.goal?.x&&g.y===p.goal?.y&&g.z===p.goal?.z;}
 cancel(){if(this.pending&&this.ownsQueue(this.pending.state))this.pending.state.queue=[];this.pending=null;}
 start(s,u,npc){
  this.cancel();const route=dialogueRoute(s,u,npc);if(!route.ok)return route;
  if(route.path.length&&!move(s,u,route.goal.x,route.goal.y,route.goal.z))return {ok:false,reason:'Cannot approach. Check stamina and the route.'};
  this.pending={state:s,id:u.id,npcId:npc.id,goal:route.path.length?s.queue[0]?.goal||route.goal:route.goal,partial:!!route.partial};return route;
 }
 update(s,{busy=false,selectedId=s.selected}={}){
  const p=this.pending;if(!p)return null;const stop=reason=>{this.cancel();return {stopped:true,reason};};
  if(p.state!==s||p.id!==selectedId)return stop('Conversation approach cancelled.');
  const u=s.units.find(u=>u.id===p.id),npc=s.units.find(u=>u.id===p.npcId),ready=dialogueParticipants(s,npc,u);
  if(!ready.ok)return stop(ready.reason);
  if(s.queue.length&&!this.ownsQueue(s))return stop('Conversation approach cancelled by another order.');
  if(busy)return null;
  if(dialoguePosition(s,npc,u).ok){
   this.cancel();turnTo(s,u,headingTo(u,npc));
   const final=dialogueReadiness(s,npc,u);return final.ok?{ready:true,speaker:u,npc}:stop(final.reason);
  }
  if(!s.queue.length){const arrived=p.goal&&u.x===p.goal.x&&u.y===p.goal.y&&(u.z||0)===p.goal.z;return stop(p.partial&&arrived?'Stopped at the barrier. Cannot reach a clear talking spot.':'Stopped before reaching talking range. Check stamina, obstacles or the NPC’s position.');}
  return null;
 }
}
