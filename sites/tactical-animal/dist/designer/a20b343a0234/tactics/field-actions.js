import {intactSite,siteControlPoint,siteRule,destroyStrategicSite} from './strategic-site-rules.js';
import {tutorialObjective,DEMOLITION_CHARGE,demolitionCount} from './tutorial-mission.js';
import {invalidateMapGeometry} from './map-geometry-cache.js';
import {toolCount,consumeTool} from './inventory-tools.js';
import {canControl,combatCosts,refresh,emitNoise,stabilize,stabilizePreview} from './core/engine.js';
import {edgeCells,blockedEdge} from './core/maps.js';
import {EDGES,propCells} from './core/environment.js';
import {unitBaseHeight} from './tower-geometry.js';
import {LIGHT_FORMS} from './light-sources.js';
import {effectiveSkill} from './character-stats.js';
import {canSpendStamina,spendStamina,recoverStamina} from './stamina.js';
import {advanceEncounterTime} from './encounter-clock.js';
export const repairable=p=>!!LIGHT_FORMS[p?.kind]&&!LIGHT_FORMS[p.kind].fire;
const nearby=(s,u,p)=>!!u&&!!p&&Math.abs(unitBaseHeight(u)-unitBaseHeight(p))<.1&&Math.abs(u.x-p.x)+Math.abs(u.y-p.y)<=1&&(u.x===p.x&&u.y===p.y||!blockedEdge(s,u,p));
const besideDoor=(u,key)=>!u.towerPost&&edgeCells(key).some(p=>p.x===u.x&&p.y===u.y&&p.z===(u.z||0));
const besideControls=(s,u,p)=>{const q=siteControlPoint(p);return !!u&&!u.towerPost&&(u.z||0)===(p.z||0)&&Math.abs(unitBaseHeight(u)-q.h)<=.3&&Math.hypot(u.x-q.x,u.y-q.y)<=1.5&&(!((u.x===q.x)!==(u.y===q.y))||!blockedEdge(s,u,q));};
export function interactionPreview(s,u,kind,target){
 const costs={rest:4,heal:6,repair:8,pick:8,force:10,sabotage:6,'plant-explosives':6},stamina={rest:0,heal:3,repair:3,pick:4,force:12,sabotage:3,'plant-explosives':3};
 if(kind==='stabilize'){const p=stabilizePreview(s,u,target);return {...p,cost:combatCosts(s)?p.cost:0,minutes:1,reason:nearby(s,u,target)?p.reason:'Stand beside the casualty on the same height.',ok:p.ok&&nearby(s,u,target),stamina:0};}
 let reason='',amount=0,chance;
 if(!Object.hasOwn(costs,kind))return {ok:false,reason:'Unknown action'};
 if(!u?.stats||!s.units.includes(u)||!canControl(s,u)||s.queue.length)reason='Cannot act now.';
 else if(combatCosts(s)&&u.ap<costs[kind])reason='Not enough AP.';
 else if(!canSpendStamina(u,stamina[kind]))reason='Not enough stamina.';
 else if(kind==='rest'){amount=Math.min(20,u.maxStamina-u.stamina);if(amount<=0)reason='Stamina is full.';}
 else if(kind==='heal'){
  amount=Math.min(target?.maxHp-target?.hp,10+Math.floor(effectiveSkill(u,'medical')*.4));
  if(!s.units.includes(target)||target.team!=='squad'||target.hp<=0||target.casualty||target.away)reason='Choose a conscious teammate.';
  else if(!nearby(s,u,target))reason='Stand beside the patient on the same height.';
  else if(!u.medkits)reason='A medical kit is required.';else if(!(amount>0))reason='Health is full.';
 }else if(kind==='plant-explosives'){
  if(!s.props.includes(target)||!intactSite(target)||!tutorialObjective(target))reason='Choose an intact tutorial radio tower or SAM site.';
  else if(!demolitionCount(u))reason='This merc must carry demolition explosives. Collect a charge from the crash-sector crate or a teammate.';
  else if(!besideControls(s,u,target)){const q=siteControlPoint(target);reason=`Stand beside the control equipment at column ${q.x+1}, row ${q.y+1}, level ${q.z+1}.`;}
 }else if(kind==='sabotage'){
  if(!s.props.includes(target)||!intactSite(target)||target.sabotage!==true||tutorialObjective(target))reason='This structure has no free sabotage action. Use Plant explosives for tutorial objectives.';
  else if(!besideControls(s,u,target))reason='Stand beside the structure’s control equipment.';
 }else if(kind==='repair'){
  amount=Math.min(100-(target?.condition??100),Math.max(5,Math.floor(effectiveSkill(u,'mechanical')/2)));
  if(!s.props.includes(target)||!repairable(target))reason='Choose an electrical light fixture.';
  else if(!propCells(target).some(p=>nearby(s,u,p)))reason='Stand beside the fixture.';
  else if(!(amount>0))reason='Fixture is working.';else if(!toolCount(u,'repairKit'))reason='Repair supplies are required.';
 }else{
  const difficulty=s.edgeLocks?.[target],skill=kind==='force'?u.stats.strength:u.stats.dexterity;
  chance=Math.max(5,Math.min(95,50+skill-(difficulty||50)));
  if(!difficulty||!EDGES[s.edges[target]]?.opensTo)reason='Choose a locked door.';else if(!besideDoor(u,target))reason='Stand beside the door.';else if(kind==='pick'&&!toolCount(u,'lockpicks'))reason='A lockpick set is required.';
 }
 return {ok:!reason,reason,cost:combatCosts(s)?costs[kind]:0,minutes:1,stamina:stamina[kind],amount,chance};
}
export function performInteraction(s,u,kind,target){
 const p=interactionPreview(s,u,kind,target);if(!p.ok)return false;
 if(kind==='stabilize'){if(!stabilize(s,u,target))return false;}else u.ap-=p.cost;spendStamina(u,p.stamina);u.overwatch=null;let result='';
 if(kind==='stabilize'){result='stabilized '+target.name+'.';}
 else if(kind==='rest'){u.stamina=Math.min(u.maxStamina,u.stamina+p.amount);result='rested: +'+Math.round(p.amount)+' stamina.';}
 else if(kind==='heal'){u.medkits--;target.hp+=p.amount;if(target.hp>=target.maxHp)delete target.legWound;result='treated '+target.name+': +'+p.amount+' HP.';}
 else if(kind==='sabotage'||kind==='plant-explosives'){if(kind==='plant-explosives')consumeTool(u,DEMOLITION_CHARGE);const receipt=destroyStrategicSite(s,target,{cause:'trigger'});result=(kind==='plant-explosives'?'planted explosives and destroyed ':'sabotaged ')+receipt.name+'.';emitNoise(s,u,20);}
 else if(kind==='repair'){consumeTool(u,'repairKit');target.condition=(target.condition??100)+p.amount;result='repaired '+target.kind+': '+target.condition+'%'+(target.condition===100?' / working.':' / still offline.');}
 else {s.interactionSeed=(Math.imul((s.interactionSeed??s.seed)>>>0,1664525)+1013904223)>>>0;const success=s.interactionSeed/4294967296*100<p.chance;if(success){delete s.edgeLocks[target];s.edges[target]=EDGES[s.edges[target]].opensTo;invalidateMapGeometry(s);}if(kind==='force')emitNoise(s,u,20);result=(success?'opened the locked door.':'failed to open the lock.');}
 if(!combatCosts(s)&&s.clock){advanceEncounterTime(s,p.minutes,false);recoverStamina({...s,units:s.units.filter(v=>v!==u)},p.minutes);s.awarenessSeconds=(s.awarenessSeconds||0)+60*p.minutes;}
 s.log.unshift(u.name+' '+result);refresh(s);return true;
}
export function nearbyInteractions(s,u){
 const entries=[{kind:'rest',target:null,label:'Catch breath'}];
 for(const p of s.props)if(intactSite(p)&&besideControls(s,u,p)){if(tutorialObjective(p))entries.push({kind:'plant-explosives',target:p,label:'Plant explosives · '+siteRule(p).name});else if(p.sabotage===true)entries.push({kind:'sabotage',target:p,label:'Sabotage '+siteRule(p).name});}
 for(const v of s.units)if(v.team==='squad'&&!v.away&&nearby(s,u,v)&&((v.hp>0&&v.hp<v.maxHp)||v.casualty==='bleeding'))entries.push({kind:v.casualty==='bleeding'?'stabilize':'heal',target:v,label:(v.casualty==='bleeding'?'Stabilize ':'Treat ')+v.name});
 for(const key of Object.keys(s.edgeLocks||{}))if(EDGES[s.edges[key]]?.opensTo&&besideDoor(u,key))for(const kind of ['pick','force']){const p=edgeCells(key).find(p=>p.x!==u.x||p.y!==u.y),direction=p.x>u.x?'east':p.x<u.x?'west':p.y>u.y?'south':'north',material=s.edges[key].includes('steel')?'steel':s.edges[key].includes('wood')?'wooden':'cell';entries.push({kind,target:key,label:(kind==='pick'?'Pick lock':'Force door')+' · '+direction+' '+material+' door'});}
 for(const p of s.props)if(repairable(p)&&(p.condition??100)<100&&propCells(p).some(q=>nearby(s,u,q)))entries.push({kind:'repair',target:p,label:'Repair '+p.kind});
 return entries.map(e=>({...e,preview:interactionPreview(s,u,e.kind,e.target)}));
}
