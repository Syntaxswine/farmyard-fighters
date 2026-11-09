import {validMedicalChest,medicalChest} from './inventory-tools.js';
import {WIDTH,HEIGHT,SIDES,STEP,OPPOSITE} from './overmap-model.js';
import {createClock,advanceClock} from './game-clock.js';
import {MERC_STATS} from './character-stats.js';
// Minutes per adjacent sector. The explicit 45-minute endpoint is intentional.
export const TRAVEL_TIMES=[[1,180,120],[10,163,109],[20,145,97],[30,127,84],[40,108,72],[50,90,60],[60,84,57],[70,78,54],[80,72,51],[90,66,48],[100,60,45]];
export const FATIGUE_PER_HOUR=10,REST_PER_HOUR=10,REST_AT=80,RESUME_AT=60;
export function sectorMinutes(agility,road=false){
 if(!Number.isFinite(agility)||agility<1||agility>100)throw Error('Agility must be from 1 to 100.');
 return TRAVEL_TIMES.findLast(row=>agility>=row[0])[road?2:1];
}
export const fatigue=u=>u.social?.fatigue??0;
export function groupPace(members,road=false){
 if(!members.length)throw Error('A travelling group needs at least one member.');
 return members.reduce((slow,u)=>{const minutes=sectorMinutes(u.stats?.agility,road);return !slow||minutes>slow.minutes||minutes===slow.minutes&&u.stats.agility<slow.agility?{minutes,id:u.id,name:u.name,agility:u.stats.agility}:slow;},null);
}
function adjacent(i,side){const [dx,dy]=STEP[side],x=i%WIDTH+dx,y=Math.floor(i/WIDTH)+dy;return x<0||x>=WIDTH||y<0||y>=HEIGHT?null:y*WIDTH+x;}
const roadPorts=s=>s.routes.filter(r=>r.kind==='road').flatMap(r=>[r.from,r.to]);
const barrier=s=>s.routes.some(r=>r.kind==='river'||r.kind==='cliff');
function gateSide(s,side){
 const obstacles=s.routes.filter(r=>r.kind==='river'||r.kind==='cliff');
 return obstacles.every(r=>s.gate===(r.kind==='river'?'bridge':'passage')&&OPPOSITE[r.from.side]===r.to.side&&![r.from.side,r.to.side].includes(side));
}
export function travelEdges(map,index){
 const a=map.sectors[index];if(!a)return [];
 return SIDES.flatMap(side=>{
  const to=adjacent(index,side);if(to===null)return [];const b=map.sectors[to],opposite=OPPOSITE[side];
  const road=roadPorts(a).some(p=>p.side===side&&roadPorts(b).some(q=>q.side===opposite&&q.offset===p.offset));
  if((a.role==='tutorial'||b.role==='tutorial')&&!(a.travel.includes(side)&&b.travel.includes(opposite)))return [];
  if((barrier(a)&&(!road||!gateSide(a,side)))||(barrier(b)&&(!road||!gateSide(b,opposite))))return [];
  return [{from:index,to,road}];
 });
}
export function planRoute(map,start,destination,members,{roadsOnly=false}={}){
 const land=groupPace(members),road=groupPace(members,true),cost=new Map([[start,0]]),prev=new Map(),pending=new Set([start]);
 while(pending.size){let at=[...pending].reduce((a,b)=>cost.get(a)<=cost.get(b)?a:b);pending.delete(at);if(at===destination)break;
  for(const edge of travelEdges(map,at)){if(roadsOnly&&!edge.road)continue;const minutes=(edge.road?road:land).minutes,total=cost.get(at)+minutes;if(total<(cost.get(edge.to)??Infinity)){cost.set(edge.to,total);prev.set(edge.to,{...edge,minutes});pending.add(edge.to);}}
 }
 if(!cost.has(destination))throw Error('No traversable route. Rivers and cliffs require a connected crossing; tutorial edges require travel connections.');
 const route=[];for(let at=destination;at!==start;){const edge=prev.get(at);route.unshift(edge);at=edge.from;}return route;
}
export function createTravel(map,members=Object.entries(MERC_STATS).map(([name,stats],id)=>({id,name,medkits:1,pack:name==='Vera'?[medicalChest()]:[],stats:{...stats},social:{fatigue:0}}))){
 groupPace(members);const start=map.sectors.findIndex(s=>s.role==='tutorial'&&s.tutorialStep===1);
 return {version:1,position:start<0?0:start,clock:createClock(),members:structuredClone(members),route:[],progress:0,restRequired:members.some(u=>fatigue(u)>=REST_AT)};
}
export function setDestination(state,map,destination){
 if(state.progress>0)throw Error('Finish the current sector crossing before changing the route.');
 state.route=planRoute(map,state.position,destination,state.members);
}
function changeFatigue(state,delta){for(const u of state.members){u.social??={};u.social.fatigue=Math.max(0,Math.min(100,fatigue(u)+delta));}}
// Stops exactly at the threshold, retaining fractional progress through the edge.
export function travelUntilStop(state,map){
 if(state.restRequired||state.members.some(u=>fatigue(u)>=REST_AT)){state.restRequired=true;return {minutes:0,restRequired:true};}
 let minutes=0;
 while(state.route.length){
  const edge=state.route[0],current=travelEdges(map,state.position).find(e=>e.to===edge.to);
  if(!current||current.road!==edge.road||edge.from!==state.position)throw Error('The route changed. Plan travel again.');
  const duration=groupPace(state.members,edge.road).minutes,remaining=duration-state.progress;
  const available=(REST_AT-Math.max(...state.members.map(fatigue)))*60/FATIGUE_PER_HOUR;
  const step=Math.max(0,Math.min(remaining,available));advanceClock(state.clock,step);changeFatigue(state,step*FATIGUE_PER_HOUR/60);minutes+=step;state.progress+=step;
  if(state.progress>=duration-1e-8){state.position=edge.to;state.route.shift();state.progress=0;}
  if(Math.max(...state.members.map(fatigue))>=REST_AT-1e-8){state.restRequired=true;break;}
 }
 return {minutes,restRequired:state.restRequired};
}
export function restTravel(state,hours=2){
 if(!Number.isFinite(hours)||hours<=0||hours>24)throw Error('Rest must be between 0 and 24 hours.');
 advanceClock(state.clock,hours*60);changeFatigue(state,-hours*REST_PER_HOUR);
 if(Math.max(...state.members.map(fatigue))<=RESUME_AT+1e-8)state.restRequired=false;
}
export function travelPreview(state){
 const copy=structuredClone(state);let travelMinutes=0,restMinutes=0,stops=0;
 // Preview the approved fatigue rules without advancing the real state or clock.
 let remaining=copy.route.reduce((n,e)=>n+groupPace(copy.members,e.road).minutes,0)-copy.progress;
 let high=Math.max(...copy.members.map(fatigue)),mustRest=copy.restRequired||high>=REST_AT;
 while(remaining>1e-8){if(mustRest){const rest=Math.max(0,high-RESUME_AT)*60/REST_PER_HOUR;restMinutes+=rest;high=RESUME_AT;stops++;mustRest=false;}
  const step=Math.min(remaining,(REST_AT-high)*60/FATIGUE_PER_HOUR);remaining-=step;travelMinutes+=step;high+=step*FATIGUE_PER_HOUR/60;mustRest=high>=REST_AT-1e-8;
 }
 return {travelMinutes,restMinutes,stops,arrivalMinutes:state.clock.minutes+travelMinutes+restMinutes};
}
export function validateTravel(state,map){
 const fail=()=>{throw Error('Invalid saved travel session. Reset the travel test to start again.');};
 if(!state||state.version!==1||!Number.isInteger(state.position)||!map.sectors[state.position]||!Number.isFinite(state.clock?.minutes)||state.clock.minutes<0||!Array.isArray(state.members)||!state.members.length||state.members.length>32||typeof state.restRequired!=='boolean'||!Array.isArray(state.route)||state.route.length>WIDTH*HEIGHT||!Number.isFinite(state.progress)||state.progress<0)fail();
 for(const u of state.members){if(u.pack!==undefined&&(!Array.isArray(u.pack)||u.pack.some(i=>!validMedicalChest(i))))fail();if(u.medkits!==undefined&&(!Number.isInteger(u.medkits)||u.medkits<0))fail();if((u.hp!==undefined&&(!Number.isFinite(u.hp)||u.hp<0))||(u.maxHp!==undefined&&(!Number.isFinite(u.maxHp)||u.maxHp<=0||u.hp>u.maxHp)))fail();if(typeof u.name!=='string'||u.name.length>100||!Number.isFinite(fatigue(u))||fatigue(u)<0||fatigue(u)>100)fail();sectorMinutes(u.stats?.agility);}
 let at=state.position;for(const edge of state.route){if(edge.from!==at||!travelEdges(map,at).some(e=>e.to===edge.to&&e.road===edge.road))fail();at=edge.to;}
 if(state.route.length?state.progress>=groupPace(state.members,state.route[0].road).minutes:state.progress!==0)fail();
 if(state.members.some(u=>fatigue(u)>=REST_AT))state.restRequired=true;return state;
}
