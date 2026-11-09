import {migrateSquadAmmo,settleSquadAmmo,distributeSquadAmmo} from './squad-ammo.js';
import {initializeDialogue,pinDialogue} from './dialogue-state.js';
import {tutorialRoleErrors,tutorialCrateLoot} from './tutorial-mission.js';
import {trackMapGeometry} from './map-geometry-cache.js';
import {localEnvironmentProfile} from './environment-regions.js';
import {createGame,refresh,alive,incapacitated,abandonCasualties,walkable} from './core/engine.js';
import {neighbors,tileKey,validateMap} from './core/maps.js';
import {syncWeapons} from './core/inventory.js';
import {playerThreat} from './character-properties.js';
import {createClock,observeRoundTime} from './game-clock.js';
import {startEncounterClock,settleEncounterRounds} from './encounter-clock.js';
import {planRoute,groupPace,travelPreview,travelEdges} from './overmap-travel.js';
import {advanceGroups} from './overmap-groups.js';
import {OPPOSITE,STEP} from './overmap-model.js';
import {bindSectorInventory} from './sector-inventory.js';
import {settleContracts} from './core/world.js';
import {onContract} from './core/happiness.js';
import {defeatSummary} from './mercenary-status.js';

export const CAMPAIGN_VERSION=1;
export const activeState=c=>c.active?c.sectors[c.active.sector].state:null;
const retired=u=>u.casualty==='dead'||u.casualty==='quit'||u.team==='guard'&&u.hp<=0&&!incapacitated(u);
const mobile=u=>u.team==='squad'&&alive(u)&&!u.casualty;
const position=(c,id)=>c.characters[id]?.location;
const atSector=(c,id,index)=>position(c,id)?.kind==='sector'&&position(c,id).sector===index;
const direction=(a,b)=>Object.keys(STEP).find(side=>a%30+STEP[side][0]===b%30&&Math.floor(a/30)+STEP[side][1]===Math.floor(b/30));
const fail=text=>{throw Error(text);};
export function sectorRecord(c,index){return c.sectors[index]??= {initialized:false,population:[],owner:c.overmap.sectors[index]?.owner||'unassigned',references:{},state:null};}
export function groupMembers(c,g){return g.memberIds.map(id=>c.characters[id].unit);}
export function travelState(c,g){return {...g.travel,clock:{...c.clock},members:groupMembers(c,g)};}
export function bindCampaign(c){
 migrateSquadAmmo(Object.values(c.characters).map(r=>r.unit));
 for(const [index,sector]of Object.entries(c.sectors))if(sector.state)bindSectorInventory(trackMapGeometry(sector.state),{present:u=>u&&atSector(c,u.campaignId,+index)&&c.characters[u.campaignId]?.unit===u,contested:()=>c.incidents.some(i=>i.sector===+index&&i.status==='pending')});
 return c;
}
function register(c,u,id,location){
 if(c.characters[id])fail('Duplicate campaign character.');
 u.id=c.nextUnitId++;u.campaignId=id;delete u.away;
 c.characters[id]={id,unit:u,location};
 if(location.kind==='sector')sectorRecord(c,location.sector).population.push(id);
 return u;
}
export {register as registerCampaignCharacter};
export function initializeSector(c,index){
 const sector=sectorRecord(c,index);if(sector.initialized)return sector;
 const assignment=c.assignments[index];if(!assignment)fail('No local map is assigned to this sector yet.');
 const s=createGame((c.seed+index)>>>0,assignment.map,false,c.difficulty,{cast:[],social:true,awareness:true,statSystem:true,rosterSeed:c.seed});startEncounterClock(s);s.clock={...c.clock};
 delete s.dialogue;const residents=s.units;s.units=[];s.loot=[...tutorialCrateLoot(assignment.map),...structuredClone(assignment.map.campaignLoot||[])];
 for(const [i,u]of residents.entries()){
  const authored=u.characterId||'guard_'+i,id=c.id+':sector:'+index+':'+authored;
  register(c,u,id,{kind:'sector',sector:index});sector.references[authored]=id;
 }
 for(const p of s.loot)p.id=c.id+':sector:'+index+':loot:'+p.id;
 sector.state=s;sector.initialized=true;s.units=sector.population.map(id=>c.characters[id].unit);bindCampaign(c);return sector;
}
export function resolveCharacterReference(c,sector,authoredId){
 const id=c.sectors[sector]?.references[authoredId],r=c.characters[id];
 return r&&r.location.kind==='sector'&&r.location.sector===sector&&!retired(r.unit)?r.unit:null;
}
export function createCampaign(content,{id='campaign_'+crypto.randomUUID(),difficulty='easy'}={}){
 const c={version:CAMPAIGN_VERSION,id,seed:content.seed,contentVersion:content.contentVersion,difficulty,revision:0,clock:createClock(),money:20000,overmap:structuredClone(content.overmap),assignments:structuredClone(content.assignments),sectors:{},characters:{},groups:[],active:null,incidents:[],nextIncident:1,nextGroup:2,nextUnitId:0,selectedGroup:'group-1',objectives:{},logistics:{weapons:0,forts:[],convoys:[],militia:{},militiaCost:500},log:[]};initializeDialogue(c,content.seed);for(const a of Object.values(c.assignments))for(const d of Object.values(a.map.dialogueDefinitions||{}))pinDialogue(c.dialogue,d);
 for(const [index,assignment]of Object.entries(c.assignments))if(c.overmap.environments&&!assignment.map.environment)assignment.map.environment=localEnvironmentProfile(c.overmap.environments,+index);
 validateAssignments(c);
 const initial=c.assignments[content.start].map,roster=createGame(c.seed,{...initial,guards:[]},false,difficulty,{social:true,awareness:true,statSystem:true,rosterSeed:c.seed}).units;
 for(const [i,u]of roster.entries()){register(c,u,c.id+':merc:'+i,{kind:'sector',sector:content.start});if(u.characterId)sectorRecord(c,content.start).references[u.characterId]=u.campaignId;}
 const g={id:'group-1',name:'Valley squad',faction:'player',memberIds:roster.map(u=>u.campaignId),waitMinutes:0,travel:{version:1,position:content.start,route:[],progress:0,restRequired:false}};c.groups.push(g);
 initializeSector(c,content.start);
 for(const [wave,r]of (content.reinforcements||[content.reinforcement].filter(Boolean)).entries()){
  const map=c.assignments[r.destination].map;
  const reserves=createGame(c.seed+1,map,false,difficulty,{cast:[],social:true,awareness:true,statSystem:true,rosterSeed:c.seed}).units.slice(0,r.count);
  reserves.forEach((u,i)=>{u.name='Relief guard '+(i+1);delete u.character;delete u.characterId;register(c,u,c.id+':relief:'+wave+':'+i,{kind:'sector',sector:r.source});});
  const enemy={id:'relief-'+(wave+1),name:'Red Hat relief squad '+(wave+1),faction:'red-hats',memberIds:reserves.map(u=>u.campaignId),waitMinutes:r.delay,travel:{version:1,position:r.source,route:[],progress:0,restRequired:false}};
  enemy.travel.route=planRoute(c.overmap,r.source,r.destination,reserves);c.groups.push(enemy);
 }
 return bindCampaign(c);
}
export function validateAssignments(c){
 const roleErrors=tutorialRoleErrors({props:Object.values(c.assignments).flatMap(a=>a.map.props||[])});if(roleErrors.length)fail(roleErrors.join(' '));
 for(const [index,a]of Object.entries(c.assignments)){
  if(!c.overmap.sectors[index]||typeof a.templateId!=='string'||!a.templateId||typeof a.variant!=='string'||![0,90,180,270].includes(a.orientation)||!a.entries?.length)fail('Invalid sector assignment.');
  const errors=validateMap(a.map);if(errors.length)fail('Invalid '+a.map.name+': '+errors.join(' '));
  for(const e of a.entries)if(!OPPOSITE[e.side]||e.offset!==.5||e.width!==6||e.z!==0||e.depth!==8)fail('Invalid entry corridor.');
  for(const e of a.entries){const near=gateCells(e).slice(0,6);for(const p of near){const boundary={...p,...(e.side==='west'?{x:0}:e.side==='east'?{x:239}:e.side==='north'?{y:0}:{y:239})};if(!walkable(a.map,boundary.x,boundary.y,0)||!neighbors(a.map,boundary,undefined,false).some(q=>q.x===p.x&&q.y===p.y))fail('Entry boundary is obstructed.');}if(!entryConnected(a.map,near[2],a.map.exits[0]))fail('Entry has no legal route to the travel marker.');}
 }
 for(const [index,a]of Object.entries(c.assignments))for(const edge of travelEdges(c.overmap,+index))if(c.assignments[edge.to]){
  const side=direction(+index,edge.to),b=c.assignments[edge.to];
  if(!a.entries.some(e=>e.side===side)||!b.entries.some(e=>e.side===OPPOSITE[side]))fail('Assigned sectors need matching travel boundaries.');
 }
}
function entryConnected(map,start,goal){
 const adjacent=(a,b)=>neighbors(map,a,undefined,false).some(p=>p.x===b.x&&p.y===b.y&&p.z===(b.z||0));
 for(const axes of [['x','y'],['y','x']]){let p={...start},ok=true;for(const axis of axes)while(p[axis]!==goal[axis]){const q={...p,[axis]:p[axis]+Math.sign(goal[axis]-p[axis])};if(!adjacent(p,q)){ok=false;break;}p=q;}if(ok&&p.x===goal.x&&p.y===goal.y&&p.z===(goal.z||0))return true;}
 const seen=new Set([tileKey(start.x,start.y,start.z)]),queue=[start];for(let i=0;i<queue.length;i++){const p=queue[i];if(p.x===goal.x&&p.y===goal.y&&p.z===(goal.z||0))return true;for(const q of neighbors(map,p,undefined,false)){const k=tileKey(q.x,q.y,q.z);if(!seen.has(k)){seen.add(k);queue.push(q);}}}return false;
}
function gateCells(entry){const out=[];for(let d=1;d<=entry.depth;d++)for(let t=117;t<=122;t++)out.push(entry.side==='west'?{x:d,y:t,z:0}:entry.side==='east'?{x:239-d,y:t,z:0}:entry.side==='north'?{x:t,y:d,z:0}:{x:t,y:239-d,z:0});return out;}
class BlockedEntryError extends Error {}
export function landingPlan(c,index,side,ids,{reserved=[]}={}){
 const sector=initializeSector(c,index),s=sector.state,entry=c.assignments[index].entries.find(e=>e.side===side);
 if(!entry)fail('This sector has no compatible entry on that side.');
 const occupied=new Set(sector.population.filter(id=>!ids.includes(id)).map(id=>c.characters[id].unit).filter(u=>alive(u)||incapacitated(u)).map(u=>tileKey(u.x,u.y,u.z||0)));
 for(const key of reserved)occupied.add(key);
 for(const p of s.loot)if(p.container&&!p.searched)occupied.add(tileKey(p.x,p.y,p.z||0));
 const cells=gateCells(entry),allowed=new Set(cells.map(p=>tileKey(p.x,p.y))),reachable=new Set(),queue=[];
 for(const p of cells)if((side==='west'?p.x===1:side==='east'?p.x===238:side==='north'?p.y===1:p.y===238)&&walkable(s,p.x,p.y,0)){const boundary={...p,...(side==='west'?{x:0}:side==='east'?{x:239}:side==='north'?{y:0}:{y:239})};if(walkable(s,boundary.x,boundary.y,0)&&neighbors(s,boundary,undefined,false).some(q=>q.x===p.x&&q.y===p.y)){queue.push(p);reachable.add(tileKey(p.x,p.y));}}
 for(let i=0;i<queue.length;i++)for(const p of neighbors(s,queue[i],undefined,false)){const k=tileKey(p.x,p.y,p.z);if(allowed.has(k)&&!reachable.has(k)){reachable.add(k);queue.push(p);}}
 const free=cells.filter(p=>reachable.has(tileKey(p.x,p.y))&&!occupied.has(tileKey(p.x,p.y)));
 if(free.length<ids.length)throw new BlockedEntryError('Entry is blocked or occupied. The group has not been transferred.');
 return new Map(ids.map((id,i)=>[id,free[i]]));
}
function removePopulation(c,id,{history=false}={}){const r=c.characters[id];if(r.location.kind==='sector'){const s=sectorRecord(c,r.location.sector);s.population=s.population.filter(p=>p!==id);if(s.state&&(!history||c.active?.sector!==r.location.sector))s.state.units=s.state.units.filter(u=>u.campaignId!==id);}}
function depart(c,g){
 if(!g.travel.route.length||g.waitMinutes>1e-8)return;
 const edge=g.travel.route[0];if(g.faction==='player')distributeSquadAmmo(sectorRecord(c,edge.from).population.map(id=>c.characters[id].unit));for(const id of g.memberIds){removePopulation(c,id);c.characters[id].location={kind:'travel',group:g.id,from:edge.from,to:edge.to};}
}
function prepareArrivals(c,groups,index,from,reservations){
 const side=direction(index,from);if(!side)fail('Arrival must cross a neighboring sector boundary.');
 // Reserve the whole contact before transferring either side. Failed plans
 // leave other arrivals' reservations intact and never consume landing cells.
 const reserved=new Set(reservations.get(index)),plans=groups.map(g=>{
  const plan=c.assignments[index]?landingPlan(c,index,side,g.memberIds,{reserved}):null;
  if(plan)for(const p of plan.values())reserved.add(tileKey(p.x,p.y,p.z));
  return {index,plan};
 });
 reservations.set(index,reserved);return plans;
}
function arrive(c,g,{index,plan}){
 const sector=sectorRecord(c,index);
 for(const id of g.memberIds){removePopulation(c,id);const r=c.characters[id];r.location={kind:'sector',sector:index};if(!sector.population.includes(id))sector.population.push(id);if(plan){Object.assign(r.unit,plan.get(id));delete r.unit.away;r.unit.overwatch=null;r.unit.post={...plan.get(id),heading:r.unit.heading};}}
 if(sector.state){sector.state.units=[...sector.state.units.filter(u=>!g.memberIds.includes(u.campaignId)),...groupMembers(c,g)];if(c.active?.sector===index){if(sector.state.phase==='won'&&hostilePopulation(c,index))sector.state.phase='explore';refresh(sector.state);}}
 if(g.faction==='red-hats'&&!sector.population.some(id=>mobile(c.characters[id].unit))&&hostilePopulation(c,index)){sector.owner='red-hats';c.overmap.sectors[index].owner='red-hats';}
 c.log.push({time:c.clock.minutes,text:g.name+' arrived at '+(c.overmap.sectors[index].name||'sector '+index)+'.'});
}
function hostilePopulation(c,index){const people=sectorRecord(c,index).population.map(id=>c.characters[id].unit),s={units:people};return people.some(u=>alive(u)&&playerThreat(s,u));}
export function sectorPeace(c,index){return !hostilePopulation(c,index)&&!c.incidents.some(i=>i.sector===index&&i.status==='pending');}
function enqueueContacts(c){
 for(const [index,sector]of Object.entries(c.sectors)){
  if(!sector.population.some(id=>mobile(c.characters[id].unit))||!hostilePopulation(c,+index))continue;
  const existing=c.incidents.find(i=>i.sector===+index&&i.status!=='resolved');if(existing){for(const g of c.groups)if(g.memberIds.some(id=>atSector(c,id,+index))&&!existing.groupIds.includes(g.id))existing.groupIds.push(g.id);continue;}
  const sequence=c.nextIncident++,incident={id:c.id+':incident:'+sequence,order:sequence,time:c.clock.minutes,sector:+index,status:c.active?.sector===+index?'active':'pending',groupIds:c.groups.filter(g=>g.memberIds.some(id=>atSector(c,id,+index))).map(g=>g.id)};c.incidents.push(incident);
  if(c.active?.sector===+index)c.active.incident=incident.id;
 }
}
export function reconcileCampaign(c){
 for(const [index,sector]of Object.entries(c.sectors))if(sector.state){settleSquadAmmo(sector.state);for(const p of sector.state.loot)if(!p.id)p.id=c.id+':sector:'+index+':drop:'+(sector.nextLoot=(sector.nextLoot||0)+1);for(const u of sector.state.units){
  const r=c.characters[u.campaignId];if(!r||r.unit!==u)fail('Campaign and encounter character records disagree.');syncWeapons(u);
  if(retired(u)&&r.location.kind!=='removed'){removePopulation(c,r.id,{history:true});r.location={kind:'removed',reason:u.casualty==='quit'?'quit':'dead'};}
 }}
 for(const g of c.groups)g.memberIds=g.memberIds.filter(id=>{const r=c.characters[id];return r.location.kind!=='removed'&&r.unit.casualty!=='captured';});
 for(const g of c.groups)if(!g.memberIds.length){g.disbanded=true;g.travel.route=[];g.travel.progress=0;g.waitMinutes=0;delete g.entryBlocked;}
 for(const [index,sector]of Object.entries(c.sectors))if(sector.state?.phase==='won'&&!hostilePopulation(c,+index))releaseBodyLoot(c,sector.state);
 if(!c.groups.some(g=>g.id===c.selectedGroup&&g.memberIds.length))c.selectedGroup=c.groups.find(g=>g.faction==='player'&&g.memberIds.length)?.id||null;
 enqueueContacts(c);c.log=c.log.slice(-80);return c;
}
function releaseBodyLoot(c,s){for(const pile of s.loot)if(pile.body!==undefined){const body=Object.values(c.characters).find(r=>r.unit.id===pile.body);if(body?.location.kind==='removed'&&body.location.reason==='dead'){pile.originBody=pile.body;delete pile.body;delete pile.searched;}}}
export function campaignRoute(c,id,destination){
 const g=c.groups.find(g=>g.id===id&&g.faction==='player');if(!g)fail('Select a mercenary group.');
 if(g.travel.route.length||g.travel.progress||g.waitMinutes)fail('Finish this journey before issuing a new route.');
 if(c.active&&c.active.sector===g.travel.position)fail('Leave or retreat from the local encounter before ordering travel.');
 if(!sectorPeace(c,g.travel.position))fail('Enter the contested sector and retreat through a matching boundary.');
 if(g.memberIds.some(id=>!atSector(c,id,g.travel.position)||!mobile(c.characters[id].unit)))fail('Every traveller must be physically present and able to move.');
 const members=groupMembers(c,g),route=planRoute(c.overmap,g.travel.position,destination,members);
 if(!route.length)fail('The group is already there.');if(route.some(e=>!c.assignments[e.to]))fail('That route includes a sector without an assigned local map.');
 const state={...travelState(c,g),route},preview=travelPreview(state);
 return {route,preview,members};
}
export function orderCampaignTravel(c,id,destination,{synchronize=false}={}){
 const p=campaignRoute(c,id,destination),g=c.groups.find(g=>g.id===id),others=c.groups.filter(q=>q!==g&&q.faction==='player'&&q.travel.route.at(-1)?.to===destination);
 const arrival=q=>c.clock.minutes+q.waitMinutes+travelPreview(travelState(c,q)).arrivalMinutes-c.clock.minutes;
 const own=c.clock.minutes+p.preview.travelMinutes+p.preview.restMinutes,shared=Math.max(own,...others.map(arrival));
 g.travel.route=p.route;g.waitMinutes=synchronize?shared-own:0;
 if(synchronize)for(const q of others)q.waitMinutes+=shared-arrival(q);
 depart(c,g);c.revision++;return p;
}
export function splitCampaignGroup(c,id,ids){
 const g=c.groups.find(g=>g.id===id&&g.faction==='player'),chosen=new Set(ids);
 if(!g||g.travel.route.length||g.travel.progress||g.waitMinutes||c.active?.sector===g.travel.position||!sectorPeace(c,g.travel.position))fail('Split a stationary group outside an encounter.');
 if(!ids.length||chosen.size!==ids.length||ids.some(i=>!g.memberIds.includes(i))||ids.length===g.memberIds.length)fail('Choose some mercs, leaving others in the original group.');
 distributeSquadAmmo(sectorRecord(c,g.travel.position).population.map(id=>c.characters[id].unit));
 const number=c.nextGroup++,next={...structuredClone(g),id:'group-'+number,name:'Group '+number,memberIds:ids};g.memberIds=g.memberIds.filter(i=>!chosen.has(i));c.groups.push(next);c.selectedGroup=next.id;c.revision++;return next;
}
function settleSectorContracts(c,s){
 // Revisit already-expired contracts too: the fight may have just ended.
 if(s.units.some(u=>u.contract&&onContract(u)&&c.clock.minutes>=u.contract.until))for(const text of settleContracts(c,s))c.log.push({time:c.clock.minutes,text});
}
export function advanceCampaign(c,minutes,{duringEncounter=false}={}){
 if(!Number.isFinite(minutes)||minutes<=0||minutes>43200)fail('Choose a positive interval of up to 30 days.');
 if(c.active&&!duringEncounter)fail('Resume the local encounter before advancing strategic time.');
 if(!duringEncounter&&c.incidents.some(i=>i.status==='pending'))fail('Resolve the pending encounter first.');
 const end=c.clock.minutes+minutes;let moved=0;
 while(c.clock.minutes<end-1e-8){
  const step=Math.min(1,end-c.clock.minutes),moving=c.groups.filter(g=>g.travel.route.length&&!g.memberIds.some(id=>atSector(c,id,c.active?.sector)));
  // Advance copies of travel and fatigue first. Active tactical units, clocks
  // and sector state objects must retain their identities during a live frame.
  const trial=g=>({...travelState(c,g),route:g.travel.route.map(e=>({...e})),members:groupMembers(c,g).map(u=>({...u,social:{...u.social}}))});
  const runs=moving.map(g=>({g,state:trial(g),waitMinutes:g.waitMinutes})),session={clock:{...c.clock},groups:runs},arrivals=[];
  advanceGroups(session,step);
  for(const run of runs)if(run.state.position!==run.g.travel.position)arrivals.push({runs:[run],index:run.state.position,from:run.g.travel.position});
  // Opposing groups make contact on their shared edge; neither can pass through the other.
  for(const run of runs.filter(r=>r.g.faction==='player'))for(const enemy of runs.filter(r=>r.g.faction!=='player')){
   const a=run.state.route[0],b=enemy.state.route[0];if(!a||!b||run.waitMinutes||enemy.waitMinutes||a.from!==b.to||a.to!==b.from)continue;
   if(run.state.progress/groupPace(run.state.members,a.road).minutes+enemy.state.progress/groupPace(enemy.state.members,b.road).minutes<1-1e-8)continue;
   for(let i=arrivals.length-1;i>=0;i--)if(arrivals[i].runs.includes(run)||arrivals[i].runs.includes(enemy))arrivals.splice(i,1);
   arrivals.push({runs:[run,enemy],index:a.from,from:a.to});
   for(const q of [run,enemy]){q.state.position=a.from;q.state.route=[];q.state.progress=0;}
  }
  const reservations=new Map();
  for(const arrival of arrivals){
   try{const plans=prepareArrivals(c,arrival.runs.map(r=>r.g),arrival.index,arrival.from,reservations);arrival.runs.forEach((run,i)=>run.arrival=plans[i]);}
   catch(error){if(!(error instanceof BlockedEntryError))throw error;
    // Hold at the last valid point on the edge. Waiting consumes world time,
    // but never repeatedly charges the rejected final movement's fatigue.
    for(const run of arrival.runs){run.state=trial(run.g);run.waitMinutes=run.g.waitMinutes;run.blocked=true;}
   }
  }
  Object.assign(c.clock,session.clock);moved+=step;
  for(const run of runs){const g=run.g;g.waitMinutes=run.waitMinutes;const {members,clock,...travel}=run.state;g.travel=travel;
   members.forEach((u,i)=>{const real=c.characters[g.memberIds[i]].unit;if(u.social.fatigue!==undefined){real.social??={};real.social.fatigue=u.social.fatigue;}});
   if(run.blocked){if(!g.entryBlocked)c.log.push({time:c.clock.minutes,text:g.name+' is waiting for a clear sector entry.'});g.entryBlocked=true;}else delete g.entryBlocked;
  }
  // All arrivals commit before anyone continues onward, so simultaneous
  // opponents share an encounter instead of passing through one another.
  for(const run of runs)if(run.arrival)arrive(c,run.g,run.arrival);
  for(const run of runs){const g=run.g;if(run.arrival){const people=sectorRecord(c,g.travel.position).population;if(people.some(id=>mobile(c.characters[id].unit))&&hostilePopulation(c,g.travel.position)){g.travel.route=[];g.travel.progress=0;}}if(g.travel.route.length)depart(c,g);}
  for(const [index,s]of Object.entries(c.sectors))if(s.state&&c.active?.sector!==+index){
   s.state.clock.minutes=c.clock.minutes;
   settleSectorContracts(c,s.state);
  }
  reconcileCampaign(c);
  if(!duringEncounter&&c.incidents.some(i=>i.status==='pending'))break;
 }
 c.revision++;return moved;
}
export function openCampaignSector(c,index){
 if(c.active){if(c.active.sector!==index)fail('Finish or retreat from the current encounter first.');return activeState(c);}
 const first=c.incidents.find(i=>i.status==='pending');if(first&&first.sector!==index)fail('Resolve the earliest pending encounter first.');
 const sector=initializeSector(c,index),mercs=sector.population.map(id=>c.characters[id].unit).filter(mobile);if(!mercs.length)fail('No available mercenary is physically in this sector.');
 const s=sector.state;s.units=sector.population.map(id=>c.characters[id].unit);s.clock={...c.clock};s.phase='explore';s.engaged=false;s.queue=[];s.effect=null;s.enemyIndex=0;s.selected=mercs[0].id;delete s.defeat;
 const ap=new Map(s.units.map(u=>[u.id,u.ap]));refresh(s);for(const u of s.units)u.ap=Math.min(u.ap,ap.get(u.id));observeRoundTime(s.clock,s);
 c.active={id:c.id+':visit:'+c.revision+':'+index,sector:index,startedAt:c.clock.minutes,incident:first?.id||null};if(first)first.status='active';reconcileCampaign(c);bindCampaign(c);c.revision++;return s;
}
export function syncCampaignEncounter(c){
 const s=activeState(c);if(!s)return;
 settleEncounterRounds(s);const delta=s.clock.minutes-c.clock.minutes;if(delta< -1e-7)fail('Encounter clock precedes campaign clock.');
 if(delta>1e-8)advanceCampaign(c,delta,{duringEncounter:true});settleSectorContracts(c,s);reconcileCampaign(c);
}
function resolveActive(c,outcome){
 const a=c.active;if(!a)return;const sector=c.sectors[a.sector],s=sector.state;
 if(outcome==='victory'){if(s.phase!=='won'||hostilePopulation(c,a.sector))fail('The sector has not been cleared.');sector.owner='player';c.overmap.sectors[a.sector].owner='player';}
 if(outcome==='defeat'&&s.phase!=='lost')fail('The encounter has not ended in defeat.');
 if(outcome==='defeat'){const summary=defeatSummary(s);c.log.push({time:c.clock.minutes,text:summary.title+' at '+s.definition.name+'. '+summary.text});}
 if(['defeat','retreat'].includes(outcome)&&hostilePopulation(c,a.sector)){sector.owner='red-hats';c.overmap.sectors[a.sector].owner='red-hats';}
 if(a.incident){const incident=c.incidents.find(i=>i.id===a.incident);incident.status='resolved';incident.outcome=outcome;incident.resolvedAt=c.clock.minutes;}
 for(const u of s.units)if(retired(u))u.corpseOmitted=true;
 releaseBodyLoot(c,s);
 s.effect=null;s.queue=[];c.active=null;c.revision++;
}
export function finishCampaignEncounter(c){
 if(!c.active)return false;syncCampaignEncounter(c);const s=activeState(c);
 if(s.phase==='lost')resolveActive(c,'defeat');else if(s.phase==='won'&&!hostilePopulation(c,c.active.sector))resolveActive(c,'victory');else fail('The sector is still contested. Retreat through a travel boundary.');return true;
}
export function retreatPreview(c,id,destination){
 const g=c.groups.find(g=>g.id===id&&g.faction==='player'),s=activeState(c);if(!g||!s||g.travel.position!==c.active.sector)fail('Select the group in the current encounter.');
 if(s.phase==='enemy'||s.queue.length)fail('Wait for your turn and stop movement before retreating.');
 const side=direction(c.active.sector,destination),entry=c.assignments[c.active.sector].entries.find(e=>e.side===side);
 if(!entry||!c.assignments[destination]||!travelEdges(c.overmap,g.travel.position).some(e=>e.to===destination))fail('No matching retreat boundary.');
 const mercs=groupMembers(c,g).filter(mobile);if(!mercs.length)fail('No mercs can retreat.');
 if(mercs.some(u=>(u.z||0)!==0||!gateCells(entry).some(p=>p.x===u.x&&p.y===u.y)))fail('Gather the moving mercs in the marked six-tile boundary corridor first.');
 return {g,mercs,side,route:planRoute(c.overmap,g.travel.position,destination,mercs)};
}
export function retreatCampaign(c,id,destination){
 const p=retreatPreview(c,id,destination);syncCampaignEncounter(c);const s=activeState(c),index=c.active.sector;
 // Shared casualty rules apply if the final able group leaves its wounded behind.
 const lastGroup=!c.groups.some(g=>g!==p.g&&g.faction==='player'&&g.memberIds.some(id=>atSector(c,id,index)&&mobile(c.characters[id].unit)));
 if(lastGroup)abandonCasualties(s);
 reconcileCampaign(c);if(lastGroup)resolveActive(c,'retreat');p.g.memberIds=p.mercs.map(u=>u.campaignId);p.g.travel.route=p.route;p.g.waitMinutes=0;depart(c,p.g);s.units=s.units.filter(u=>!p.g.memberIds.includes(u.campaignId));
 if(!lastGroup&&!s.units.some(u=>u.id===s.selected&&mobile(u)))s.selected=s.units.find(mobile).id;
 c.revision++;return true;
}
