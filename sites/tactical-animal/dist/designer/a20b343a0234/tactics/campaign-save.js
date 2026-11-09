import {migrateSquadAmmo} from './squad-ammo.js';
import {initializeDialogue,validateDialogueState,validateDialogueActors} from './dialogue-state.js';
import {validateSavedState} from './encounter-save.js';
import {validateMap} from './core/maps.js';
import {migrateClimbing} from './character-stats.js';
import {environmentErrors} from './environment-regions.js';
import {observeRoundTime} from './game-clock.js';
import {validateTravel} from './overmap-travel.js';
import {bindCampaign,validateAssignments,CAMPAIGN_VERSION,groupMembers,travelState} from './campaign-model.js';

export const CAMPAIGN_FORMAT='animal-factory-campaign';
const finite=n=>Number.isFinite(n)&&n>=0;
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const fail=()=>{throw Error('This campaign save is damaged or inconsistent. The running campaign has not changed.');};
const transient=['effect','queue','fireAnimations','fireAnimationSequence','towerTraversal','cliffTraversals','cliffTraversalSequence','roofTraversals','roofTraversalSequence','shouting','sealed','lastClimb','simpleTraversal','simpleTraversals'];
export function validateCampaign(c,{assignments=true}={}){
 if(c?.dialogue!==undefined)validateDialogueState(c.dialogue);
 if(!plain(c)||c.version!==CAMPAIGN_VERSION||typeof c.id!=='string'||!c.id||!integer(c.seed)||c.seed>4294967295||typeof c.contentVersion!=='string'||!['easy','standard'].includes(c.difficulty)||!integer(c.revision)||!finite(c.clock?.minutes)||!finite(c.money)||!integer(c.nextUnitId)||!integer(c.nextGroup)||!integer(c.nextIncident)||!plain(c.characters)||!plain(c.sectors)||!plain(c.assignments)||!Array.isArray(c.groups)||!Array.isArray(c.incidents)||c.overmap?.width!==30||c.overmap?.height!==15||c.overmap.sectors?.length!==450)fail();
 if(environmentErrors(c.overmap.environments).length)fail();
 if(c.dialogue)validateDialogueActors(c.dialogue,Object.values(c.characters).map(r=>r.unit));
 if(Object.values(c.sectors).some(sector=>sector.state?.dialogue!==undefined))fail();
 // This memo belongs only to this synchronous validation pass. A later edit,
 // reload or destruction is revalidated; no mutable definition is trusted by age.
 const definitions=new WeakSet();
 if(assignments)validateAssignments(c);
 for(const a of Object.values(c.assignments)){if(!assignments&&validateMap(a.map,{connectivity:false}).length)fail();definitions.add(a.map);}
 const numeric=new Set(),physical=new Set(),members=new Set(),groupIds=new Set(c.groups.map(g=>g.id));
 if(groupIds.size!==c.groups.length||c.groups.length>64||c.incidents.length>10000||Object.keys(c.characters).length>10000)fail();
 for(const [id,r]of Object.entries(c.characters)){
  if(!r||id!==r.id||r.unit?.campaignId!==id||!integer(r.unit.id)||r.unit.id>=c.nextUnitId||numeric.has(r.unit.id)||!plain(r.location)||!['sector','travel','removed'].includes(r.location.kind))fail();numeric.add(r.unit.id);
  if(r.location.kind==='sector'&&!c.overmap.sectors[r.location.sector]||r.location.kind==='travel'&&(!groupIds.has(r.location.group)||!c.overmap.sectors[r.location.from]||!c.overmap.sectors[r.location.to])||r.location.kind==='removed'&&!['dead','quit'].includes(r.location.reason))fail();
  if(!finite(r.unit.hp)||!finite(r.unit.maxHp)||r.unit.hp>r.unit.maxHp||!Array.isArray(r.unit.pack)||r.unit.medkits!==undefined&&!integer(r.unit.medkits))fail();
 }
 const pileIds=new Set();
 const exemplar=Object.values(c.sectors).find(s=>s.state)?.state;if(!exemplar)fail();
 const people=Object.values(c.characters).map(r=>r.unit);for(let i=0;i<people.length;i+=100)validateSavedState({...exemplar,units:people.slice(i,i+100)},{population:true,unitIds:numeric,definitions});
 for(const [index,sector]of Object.entries(c.sectors)){
  if(!c.overmap.sectors[index]||typeof sector.initialized!=='boolean'||!Array.isArray(sector.population)||!plain(sector.references)||!['player','red-hats','unassigned','neutral'].includes(sector.owner))fail();
  for(const id of sector.population){const r=c.characters[id];if(!r||physical.has(id)||r.location.kind!=='sector'||r.location.sector!==+index||r.unit.casualty==='dead'||r.unit.casualty==='quit')fail();physical.add(id);}
  for(const id of Object.values(sector.references))if(!c.characters[id])fail();
  if(!sector.initialized){if(sector.state!==null)fail();continue;}
  const s=sector.state;if(!s||!c.assignments[index]||s.clock.minutes!==c.clock.minutes)fail();
  validateSavedState(s,{population:true,unitIds:numeric,definitions});
  for(const u of s.units){const r=c.characters[u.campaignId];if(!r||r.unit!==u||r.location.kind!=='removed'&&!sector.population.includes(r.id))fail();}
  if(sector.population.some(id=>!s.units.includes(c.characters[id].unit)))fail();
  for(const p of s.loot){if(typeof p.id!=='string'||pileIds.has(p.id))fail();pileIds.add(p.id);if(p.body!==undefined&&!numeric.has(p.body))fail();}
 }
 for(const r of Object.values(c.characters))if(r.location.kind==='sector'&&!physical.has(r.id))fail();
 for(const g of c.groups){
  if(typeof g.id!=='string'||!g.id||typeof g.name!=='string'||!['player','red-hats'].includes(g.faction)||!Array.isArray(g.memberIds)||!finite(g.waitMinutes))fail();
  if(g.entryBlocked!==undefined&&(typeof g.entryBlocked!=='boolean'||g.entryBlocked&&(!g.memberIds.length||!g.travel.route.length)))fail();
  if(!g.memberIds.length){if(g.disbanded!==true||g.travel.route.length||g.travel.progress||g.waitMinutes)fail();continue;}
  // A synchronised group may wait partway along an edge. Waiting does not put
  // its people back into the sector they have already left.
  const departed=g.travel.route.length&&(g.waitMinutes<=1e-8||g.travel.progress>0||c.characters[g.memberIds[0]]?.location.kind==='travel');
  for(const id of g.memberIds){const r=c.characters[id];if(!r||members.has(id)||r.location.kind==='removed'||r.unit.casualty==='captured')fail();members.add(id);
   if(departed?(r.location.kind!=='travel'||r.location.group!==g.id||r.location.from!==g.travel.route[0].from||r.location.to!==g.travel.route[0].to):(r.location.kind!=='sector'||r.location.sector!==g.travel.position))fail();
  }
  const state=travelState(c,g);validateTravel(state,c.overmap);if(state.restRequired!==g.travel.restRequired&&g.travel.route.length)fail();
  if(groupMembers(c,g).some(u=>g.faction==='player'&&u.team!=='squad'))fail();
 }
 for(const r of Object.values(c.characters))if(r.location.kind==='travel'&&!members.has(r.id))fail();
 if(c.selectedGroup!==null&&!c.groups.some(g=>g.id===c.selectedGroup&&g.faction==='player'))fail();
 let lastTime=-1,lastOrder=0;const incidents=new Set();
 for(const i of c.incidents){if(typeof i.id!=='string'||incidents.has(i.id)||!finite(i.time)||i.time>c.clock.minutes||!integer(i.order)||i.order<=lastOrder||i.time<lastTime||i.order>=c.nextIncident||!c.sectors[i.sector]||!['pending','active','resolved'].includes(i.status)||!Array.isArray(i.groupIds)||i.status==='resolved'&&(!['victory','defeat','retreat'].includes(i.outcome)||!finite(i.resolvedAt)))fail();
  if(i.status!=='resolved'&&(!i.groupIds.length||i.groupIds.some(id=>!groupIds.has(id))))fail();incidents.add(i.id);lastTime=i.time;lastOrder=i.order;
 }
 if(c.active){const s=c.sectors[c.active.sector]?.state;if(typeof c.active.id!=='string'||!s||!finite(c.active.startedAt)||c.active.startedAt>c.clock.minutes||!s.units.some(u=>u.team==='squad'&&u.id===s.selected)||c.active.incident&&!c.incidents.some(i=>i.id===c.active.incident&&i.sector===c.active.sector&&i.status==='active'))fail();}
 if(c.incidents.some(i=>i.status==='active'&&i.id!==c.active?.incident))fail();return c;
}
export function captureCampaign(c,now=Date.now()){
 validateCampaign(c,{assignments:false});
 // Project the persistent graph before cloning it. In particular, do not clone
 // each map definition and character roster again through every live sector.
 const sectors=Object.fromEntries(Object.entries(c.sectors).map(([id,sector])=>{
  if(!sector.state)return [id,sector];
  const s=Object.fromEntries(Object.entries(sector.state).filter(([key])=>key!=='map'&&key!=='units'&&key!=='definition'&&!transient.includes(key)));
  return [id,{...sector,unitIds:sector.state.units.map(u=>u.campaignId),state:{...s,queue:[],effect:null}}];
 }));
 // These validated grids contain only immutable terrain-name strings. Copying
 // their rows directly avoids the general graph serializer visiting hundreds
 // of thousands of primitive cells. Keep aliases within the detached snapshot,
 // but never share a mutable row with the running campaign.
 const assignments=Object.fromEntries(Object.entries(c.assignments).map(([id,a])=>{const map={...a.map};delete map.terrain;return [id,{...a,map}];}));
 const data=structuredClone({...c,assignments,sectors}),grids=new WeakMap(),rows=new WeakMap();
 const copyGrid=grid=>{if(!grids.has(grid))grids.set(grid,grid.map(row=>{if(!rows.has(row))rows.set(row,row.slice());return rows.get(row);}));return grids.get(grid);};
 for(const [id,a]of Object.entries(c.assignments))data.assignments[id].map.terrain=copyGrid(a.map.terrain);
 for(const [id,sector]of Object.entries(c.sectors))if(sector.state)data.sectors[id].state.map=copyGrid(sector.state.map);
 return {format:CAMPAIGN_FORMAT,version:CAMPAIGN_VERSION,savedAt:now,campaignId:c.id,revision:c.revision,mapName:c.active?c.assignments[c.active.sector].map.name:'Valley campaign',round:c.active?c.sectors[c.active.sector].state.round:0,minutes:c.clock.minutes,data};
}
export function restoreCampaign(record){
 if(record?.format!==CAMPAIGN_FORMAT||record.version!==CAMPAIGN_VERSION)throw Error('This is not a supported campaign save.');
 const c=structuredClone(record.data);if(!plain(c)||!plain(c.characters)||!plain(c.sectors)||!plain(c.assignments)||record.campaignId!==c.id||record.revision!==c.revision)fail();
 for(const [index,sector]of Object.entries(c.sectors))if(sector.state){if(!Array.isArray(sector.unitIds)||sector.unitIds.some(id=>!c.characters[id]))fail();sector.state.units=sector.unitIds.map(id=>c.characters[id].unit);sector.state.definition=c.assignments[index]?.map;delete sector.unitIds;}
 initializeDialogue(c);for(const r of Object.values(c.characters))migrateClimbing(r?.unit);
 validateCampaign(c);try{migrateSquadAmmo(Object.values(c.characters).map(r=>r.unit));}catch{fail();}
 for(const sector of Object.values(c.sectors))if(sector.state)observeRoundTime(sector.state.clock,sector.state);
 return bindCampaign(c);
}
// Transition staging: rejected actions or failed writes leave the caller's state intact.
export async function checkpointTransition(current,command,persist){
 const candidate=bindCampaign(structuredClone(current));await command(candidate);candidate.revision=current.revision+1;
 const record=captureCampaign(candidate);await persist(record,current.revision);return candidate;
}
