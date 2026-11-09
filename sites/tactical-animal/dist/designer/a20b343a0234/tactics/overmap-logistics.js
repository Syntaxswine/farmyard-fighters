import {updateFirstAid,interruptFirstAid} from './overmap-first-aid.js';
import {interruptRest} from './overmap-rest.js';
import {militiaMinutes,militiaKey,militiaAt,militiaCount,militiaLoadout,trainMilitia,sectorLeadership,normalizeMilitia} from './overmap-militia.js';
import {createTravel,planRoute,validateTravel} from './overmap-travel.js';
import {advanceGroups} from './overmap-groups.js';
export const WEEK=7*1440;
const number=(v)=>Number.isFinite(v)&&v>=0;
const name=(map,i)=>map.sectors[i]?.name||`Sector ${i%30+1}, ${Math.floor(i/30)+1}`;
const idle=g=>!g.state.route.length&&!g.state.progress&&!g.training&&!g.rest&&!g.firstAid;
const troops=()=>Array.from({length:4},(_,i)=>({id:i,name:'Red Hat '+(i+1),stats:{agility:50},social:{fatigue:0}}));
function entry(map,position,clock,id){const state=createTravel(map,troops());state.position=position;state.clock={...clock};return {id,state,waitMinutes:0};}
function log(l,text,time){l.log.push({text,time});if(l.log.length>80)l.log.shift();}
export function ensureLogistics(session,map){
 if(session.logistics){normalizeMilitia(session,map);return session.logistics;}
 const l=session.logistics={version:1,nextId:1,forts:[],convoys:[],raiders:[],militia:{},weapons:0,money:5000,militiaCost:500,pending:null,log:[]};
 map.sectors.forEach((s,index)=>{if(s.role==='fortress')l.forts.push({index,owner:s.owner==='player'?'player':'red-hats',stock:0,readyAt:null,nextDispatch:session.clock.minutes});});return l;
}
function bestRoute(map,from,targets,members,roadsOnly=false){let best=null;for(const index of targets){try{const route=planRoute(map,from,index,members,{roadsOnly}),minutes=route.reduce((n,e)=>n+e.minutes,0);if(!best||minutes<best.minutes)best={index,route,minutes};}catch{ /* Unreachable sectors are not valid objectives. */ }}return best;}
function startBatch(session,fort){if(fort.owner==='red-hats'&&fort.readyAt===null&&fort.stock>0){fort.stock--;fort.readyAt=session.clock.minutes+WEEK;log(session.logistics,'Weapons consumed: fortress recruitment started.',session.clock.minutes);}}
function processEvents(session,map){const l=session.logistics,now=session.clock.minutes;
 for(const fort of l.forts){if(fort.owner!=='red-hats')continue;
  if(now>=fort.nextDispatch){const factories=map.sectors.flatMap((s,i)=>s.facilities.includes('factory')&&s.owner==='red-hats'?[i]:[]),pick=bestRoute(map,fort.index,factories,troops(),true);
   if(pick){const convoy=entry(map,pick.index,session.clock,'convoy-'+l.nextId++);convoy.fort=fort.index;convoy.state.route=planRoute(map,pick.index,fort.index,convoy.state.members,{roadsOnly:true});l.convoys.push(convoy);log(l,'Weapons dispatched to '+name(map,fort.index)+'.',now);}
   fort.nextDispatch=now+WEEK;
  }
  if(fort.readyAt!==null&&now>=fort.readyAt){const raider=entry(map,fort.index,session.clock,'raiders-'+l.nextId++);raider.name='Red Hat squad';l.raiders.push(raider);fort.readyAt=null;log(l,'Red Hat squad recruited at '+name(map,fort.index)+'.',now);}
  startBatch(session,fort);
 }
 for(const convoy of [...l.convoys])if(!convoy.state.route.length&&convoy.state.position===convoy.fort){const fort=l.forts.find(f=>f.index===convoy.fort);if(fort?.owner==='red-hats'){fort.stock++;startBatch(session,fort);log(l,'Weapons delivered to '+name(map,fort.index)+'.',now);}l.convoys=l.convoys.filter(c=>c!==convoy);}
 const ids=new Set();for(const c of l.convoys)if(!l.forts.some(f=>f.index===c.fort))throw Error('Unknown convoy destination.');for(const g of [...l.convoys,...l.raiders]){if(typeof g.id!=='string'||ids.has(g.id)||!number(g.waitMinutes))throw Error('Invalid enemy group.');ids.add(g.id);validateTravel(g.state,map);if(g.state.clock.minutes!==session.clock.minutes)throw Error('Enemy clock mismatch.');delete g.targetSignature;}if(l.pending&&(!['fortress','convoy','raiders'].includes(l.pending.kind)||!map.sectors[l.pending.sector]||!Array.isArray(l.pending.groupIds)||l.pending.groupIds.some(id=>!session.groups.some(g=>g.id===id))))throw Error('Invalid encounter handoff.');
 for(const g of session.groups)if(g.training&&now>=g.training.endsAt){l.militia[militiaKey(map,g.training.sector)]=trainMilitia(militiaAt(session,map,g.training.sector));log(l,g.name+' finished a militia training batch.',now);delete g.training;}
}
function retarget(session,map){const targets=[...new Set(session.groups.map(g=>g.state.position))];for(const g of session.logistics.raiders){if(g.state.progress>1e-8)continue;const signature=g.state.position+':'+targets.join(',');if(g.targetSignature===signature)continue;g.targetSignature=signature;const pick=bestRoute(map,g.state.position,targets,g.state.members);g.target=pick?.index??null;g.state.route=pick?.route||[];}}
function contact(session,map,previous=new Map()){
 const l=session.logistics;if(l.pending)return true;
 for(const g of session.groups){for(const [kind,list]of [['convoy',l.convoys],['raiders',l.raiders]])for(const enemy of list){const same=g.state.position===enemy.state.position;
  const swap=previous.get(g.id)===enemy.state.position&&previous.get(enemy.id)===g.state.position;
  if(same||swap){l.pending={kind,enemyId:enemy.id,sector:g.state.position,militia:militiaCount(militiaAt(session,map,g.state.position)),militiaRoster:militiaLoadout(militiaAt(session,map,g.state.position)),groupIds:session.groups.filter(q=>q.state.position===g.state.position).map(q=>q.id)};interruptRest(session,l.pending.groupIds);interruptFirstAid(session,l.pending.groupIds);log(l,kind==='convoy'?'Weapons convoy intercepted. Encounter required.':'Red Hats reached mercenaries. Encounter required.',session.clock.minutes);return true;}}
  const fort=l.forts.find(f=>f.owner==='red-hats'&&f.index===g.state.position);if(fort){l.pending={kind:'fortress',sector:fort.index,militia:militiaCount(militiaAt(session,map,fort.index)),militiaRoster:militiaLoadout(militiaAt(session,map,fort.index)),groupIds:[g.id]};interruptRest(session,l.pending.groupIds);interruptFirstAid(session,l.pending.groupIds);log(l,'Fortress assault ready. Encounter required.',session.clock.minutes);return true;}
 }return false;
}
// Minute-sized strategic ticks make large skips and repeated short steps identical,
// and prevent clocks from skipping interception opportunities or recruitment dates.
export function advanceLogistics(session,map,minutes){
 if(!number(minutes)||minutes<=0||minutes>30*1440)throw Error('Advance between one minute and 30 days.');ensureLogistics(session,map);if(session.logistics.pending)throw Error('Resolve the pending encounter before advancing.');
 let elapsed=0;processEvents(session,map);retarget(session,map);if(contact(session,map))return elapsed;
 while(elapsed<minutes-1e-8){const step=Math.min(1,minutes-elapsed),l=session.logistics,all=[...session.groups.filter(g=>!g.training),...l.convoys,...l.raiders],previous=new Map(all.map(g=>[g.id,g.state.position]));
  advanceGroups({clock:session.clock,groups:all},step);for(const g of session.groups)g.state.clock={...session.clock};elapsed+=step;updateFirstAid(session);
  // Interception wins ties with delivery; a captured shipment cannot start a timer.
  if(contact(session,map,previous))break;
  processEvents(session,map);retarget(session,map);if(contact(session,map))break;
 }return elapsed;
}
export function resolveLogisticsEncounter(session,outcome){
 const l=session.logistics,p=l?.pending;if(!p)throw Error('No pending encounter.');if(outcome!=='player-victory')throw Error('Only a confirmed player victory can clear this handoff.');
 if(p.kind==='fortress'){const f=l.forts.find(f=>f.index===p.sector);f.owner='player';f.stock=0;f.readyAt=null;l.convoys=l.convoys.filter(c=>c.fort!==f.index);}
 else if(p.kind==='convoy'){l.convoys=l.convoys.filter(c=>c.id!==p.enemyId);l.weapons++;}
 else l.raiders=l.raiders.filter(c=>c.id!==p.enemyId);
 log(l,'Player victory recorded: '+p.kind+'.',session.clock.minutes);l.pending=null;
}
export function startMilitiaTraining(session,map,id){
 const l=ensureLogistics(session,map),g=session.groups.find(g=>g.id===id);if(!g||!idle(g)||l.pending)throw Error('Select an idle group in a secure sector.');
 const sector=g.state.position,site=map.sectors[sector],fort=l.forts.find(f=>f.index===sector);
 if(!(fort?.owner==='player'||site.owner==='player'||site.tutorialStep===5))throw Error('Militia training requires a player-held sector or the tutorial town.');
 if(l.militiaCost===null)throw Error('Set the confirmed militia batch price in the tester settings first.');if(l.money<l.militiaCost)throw Error('Not enough money for militia training.');
 const key=militiaKey(map,sector);
 if(session.groups.some(q=>q.training&&militiaKey(map,q.training.sector)===key))throw Error('This town already has a training assignment.');
 trainMilitia(militiaAt(session,map,sector)); // Validate capacity and round limit before charging.
 const leadership=sectorLeadership(session,sector),duration=militiaMinutes(leadership);
 l.money-=l.militiaCost;g.training={sector,leadership,endsAt:session.clock.minutes+duration,paid:l.militiaCost};log(l,g.name+' assigned to train four militia.',session.clock.minutes);
}
export function cancelMilitiaTraining(session,id){const g=session.groups.find(g=>g.id===id);if(!g?.training)throw Error('This group is not training.');delete g.training;}
function validateSavedEnemies(session,map){
 const l=session.logistics,ids=new Set(session.groups.map(g=>g.id));
 for(const g of [...l.convoys,...l.raiders]){
  if(!g||typeof g.id!=='string'||!g.id.length||ids.has(g.id)||!number(g.waitMinutes))throw Error('Invalid saved enemy group.');
  ids.add(g.id);validateTravel(g.state,map);
  if(g.state.clock.minutes!==session.clock.minutes)throw Error('Saved enemy clock mismatch.');
 }
 for(const c of l.convoys)if(!l.forts.some(f=>f.index===c.fort))throw Error('Unknown saved convoy destination.');
 const p=l.pending;if(p===null)return;
 if(!p||!['fortress','convoy','raiders'].includes(p.kind)||!Number.isInteger(p.sector)||!map.sectors[p.sector]||!Array.isArray(p.groupIds)||!p.groupIds.length||new Set(p.groupIds).size!==p.groupIds.length||p.groupIds.some(id=>!session.groups.some(g=>g.id===id)))throw Error('Invalid saved encounter handoff.');
 if(p.kind==='fortress'){
  if(!l.forts.some(f=>f.index===p.sector&&f.owner==='red-hats'))throw Error('Saved encounter requires an enemy fortress.');
 }else if(!(p.kind==='convoy'?l.convoys:l.raiders).some(g=>g.id===p.enemyId))throw Error('Saved encounter references a missing enemy.');
}
export function validateLogistics(session,map){const l=session.logistics;if(!l)return;if(l.version!==1||!Number.isInteger(l.nextId)||l.nextId<1||!number(l.money)||!(l.militiaCost===null||number(l.militiaCost))||!number(l.weapons)||!Array.isArray(l.forts)||!Array.isArray(l.convoys)||!Array.isArray(l.raiders)||!Array.isArray(l.log)||!l.militia||typeof l.militia!=='object')throw Error('Invalid logistics save.');
 if(l.forts.length>450||l.convoys.length>1000||l.raiders.length>1000||l.log.length>80||new Set(l.forts.map(f=>f.index)).size!==l.forts.length)throw Error('Invalid logistics inventory.');
 normalizeMilitia(session,map);
 for(const f of l.forts)if(map.sectors[f.index]?.role!=='fortress'||!['player','red-hats'].includes(f.owner)||!Number.isInteger(f.stock)||f.stock<0||!(f.readyAt===null||number(f.readyAt))||!number(f.nextDispatch))throw Error('Invalid fortress schedule.');
 validateSavedEnemies(session,map);
 const assigned=new Set();
 for(const g of session.groups)if(g.training){
  const t=g.training,key=militiaKey(map,t.sector);
  if(!map.sectors[t.sector]||g.state.position!==t.sector||g.state.route.length||g.state.progress||!number(t.endsAt)||assigned.has(key)||(t.leadership!==undefined&&(!Number.isFinite(t.leadership)||t.leadership<1||t.leadership>100)))throw Error('Invalid militia assignment.');
  trainMilitia(militiaAt(session,map,t.sector));assigned.add(key);
 }
}
