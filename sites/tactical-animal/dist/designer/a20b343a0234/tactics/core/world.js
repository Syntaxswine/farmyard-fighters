import {createClock,mapStartMinutes,formatClock,advanceClock,elapsedGameMinutes,observeRoundTime,turnBased} from '../game-clock.js';
export {PLAY_MINUTES_PER_SECOND} from '../game-clock.js';
import {restStrain,driftBonds} from './personalities.js';
import {settleHappiness} from './happiness.js';
import {quitMerc} from './engine.js';
import {factoryMap,generateMap,blockedEdge,tileKey,levelOf,neighbors,W,H} from './maps.js';
import {createGame,squad,guards,alive,incapacitated,canControl,abandonCasualties,occupant,refresh,walkable,log,movementCost,emitNoise,enterFire,combatCosts,settleGuards,spawnUnit,unit,WEAPONS} from './engine.js';
import {initInventory} from './inventory.js';
import {initProgression} from './progression.js';
import {onContract} from './happiness.js';
import {slate,fit,dailyRate,pricesFor,buildRecruit,recruitSocial,contractPrices,payDay,ROSTER_MAX,MERC_ID_BASE,DAY_MINUTES} from './recruits.js';
import {awardXP} from './progression.js';
export const TRAVEL_MINUTES=60,REST_RECOVERY_HOURS=48,MEDICAL_RECOVERY_HOURS=24,MEDIC_SKILL_REQUIRED=25;
// The overmap is a grid of local-map tiles. Two tiles are linked when they touch; a squad walks from one to the next across the shared edge.
export const BORDER=3,SIDES={north:{dx:0,dy:-1},east:{dx:1,dy:0},south:{dx:0,dy:1},west:{dx:-1,dy:0}},OPPOSITE={north:'south',east:'west',south:'north',west:'east'};
export function linksFrom(positions){const ids=Object.keys(positions),links=[];for(const a of ids)for(const b of ids)if(a<b&&Math.abs(positions[a].x-positions[b].x)+Math.abs(positions[a].y-positions[b].y)===1)links.push([a,b]);return links;}
export function createWorld(custom=null,difficulty='standard',rosterSeed=1947) {
  const positions={factory:{x:0,y:0},yard:{x:1,y:0},annex:{x:2,y:0}};
  const world={difficulty,current:'factory',start:'factory',clock:createClock(mapStartMinutes(custom)),money:0,journeys:0,lastIncome:0,locations:{factory:{type:'factory'},yard:{type:'yard'},annex:{type:'factory'}},definitions:{factory:custom||factoryMap(),yard:generateMap(83,'Freight yard'),annex:generateMap(126,'Outer factory')},rosterSeed,nextId:MERC_ID_BASE,hired:[],states:{factory:createGame(1947,custom||factoryMap(),true,difficulty,{social:true,rosterSeed})},positions,links:linksFrom(positions)};observeRoundTime(world.clock,currentMap(world));return world;
}
export const currentMap=world=>world.states[world.current];
// Shortest overmap route from the original starting tile, never from the squad.
export function locationDistance(world,destination){
 const queue=[[world.start,0]],seen=new Set([world.start]);
 for(let i=0;i<queue.length;i++){const [id,distance]=queue[i];if(id===destination)return distance;
  for(const link of world.links)if(link.includes(id))for(const next of link)if(!seen.has(next)){seen.add(next);queue.push([next,distance+1]);}
 }return Infinity;
}
export function factoryIncome(world,id){
 if(!world.definitions[id]||world.locations[id]?.type!=='factory')return 0;
 const distance=locationDistance(world,id);return Number.isFinite(distance)?100*(distance+1):0;
}
export const liberated=(world,id)=>world.states[id]?.phase==='won';
export const incomePerHour=world=>Object.keys(world.definitions).reduce((sum,id)=>sum+(liberated(world,id)?factoryIncome(world,id):0),0);
export const clockLabel=world=>formatClock(world.clock);
// Every elapsed interval uses the same clock and production calculation.
export function advanceTime(world,minutes){
 if(!Number.isFinite(minutes)||minutes<=0)return 0;
 const earned=world.clock.incomeRemainder+incomePerHour(world)*minutes/60,income=Math.floor(earned+1e-9);
 advanceClock(world.clock,minutes);world.clock.incomeRemainder=Math.max(0,earned-income);world.money+=income;return income;
}
export function settleWorldClock(world){const s=currentMap(world),minutes=observeRoundTime(world.clock,s),income=advanceTime(world,minutes);if(minutes){settleMorale(world,s,minutes);settleContracts(world,s);}return income;}
export function tickWorld(world,elapsedMs,{paused=false}={}){
 if(paused)return 0;const roundIncome=settleWorldClock(world),s=currentMap(world);
 if(s.phase==='lost'||turnBased(s))return roundIncome;
 const minutes=elapsedGameMinutes(elapsedMs),income=advanceTime(world,minutes);if(minutes){settleMorale(world,s,minutes);settleContracts(world,s);}return roundIncome+income;
}
// G5: happiness is settled whenever the campaign clock advances (exploration, downtime, travel). A waiting crosser counts as on its destination.
// A merc whose meter has been at zero for a day quits here if the map is calm; otherwise the engine lets it go when the contact ends.
// `now` is the clock at the END of the settled interval (a sliced downtime passes each slice's end).
export function settleMorale(world,s,minutes,mapOf=u=>u.away?u.away.destination:world.current,now=world.clock.minutes){if(!s.rules?.social)return [];
 const {lines,quitting}=settleHappiness(s.units.filter(u=>u.team==='squad'),minutes,now,mapOf);for(const line of lines)log(s,line);
 let walked=false;if(['explore','won'].includes(s.phase)&&!combatCosts(s))for(const u of s.units)if(u.team==='squad'&&u.quitPending&&u.social?.happiness===0&&quitMerc(s,u))walked=true;if(walked)refresh(s);/* the same class as a contract walk: an empty squad is a defeat only refresh() declares */return lines;} // calm means no guard alert and nothing engaged; otherwise the engine lets it go when the contact ends
export function downtimeReason(world,activity='resting or training'){
 const s=currentMap(world);
 if(s.phase!=='won'||guards(s).length)return 'Clear this map before '+activity+'.';
 if(s.queue.length)return 'Stop movement before resting or training.';
 if(away(s).length)return 'Regroup first: comrades are waiting beyond the map edge.';
 if(!squad(s).some(u=>!u.casualty))return 'No troops available.';
 if(s.units.some(u=>u.team==='squad'&&['bleeding','stable'].includes(u.casualty)))return 'Resolve squad casualties first.';
 return '';
}
export function medicalRestPreview(world,medicId=null){
 const troops=squad(currentMap(world)).filter(u=>!u.casualty),medics=troops.filter(u=>u.medical>=MEDIC_SKILL_REQUIRED).sort((a,b)=>b.medical-a.medical);
 const medic=medicId===null?medics[0]:medics.find(u=>u.id===medicId),wounded=troops.filter(u=>u.hp<u.maxHp),needsKit=wounded.filter(u=>!(u.medicalRestHours>0));
 const kits=troops.reduce((sum,u)=>sum+u.medkits,0);
 const reason=downtimeReason(world)||(!medic?'Choose an available medic with at least 25 Medical.':!wounded.length?'No wounded troops need treatment.':kits<needsKit.length?`Need ${needsKit.length} medkits; squad has ${kits}.`:'');
 return {ok:!reason,reason,medic,kits,kitsNeeded:needsKit.length,needsKit};
}
export function spendTime(world,activity,hours,medicId=null){
 const error=downtimeReason(world);if(error)return {ok:false,error};
 if(!['rest','medical-rest','train'].includes(activity)||![1,4,8,24,48].includes(hours))return {ok:false,error:'Choose rest, medical care or training for 1, 4, 8, 24 or 48 hours.'};
 const s=currentMap(world),troops=squad(s).filter(u=>!u.casualty);
 if(activity==='train'&&!troops.some(u=>u.level<10))return {ok:false,error:'All available troops have reached level 10.'};
 const treatment=activity==='medical-rest'?medicalRestPreview(world,medicId):null;
 if(treatment&&!treatment.ok)return {ok:false,error:treatment.reason};
 if(treatment){let needed=treatment.kitsNeeded;for(const donor of troops){const used=Math.min(donor.medkits,needed);donor.medkits-=used;needed-=used;}for(const patient of treatment.needsKit)patient.medicalRestHours=MEDICAL_RECOVERY_HOURS;}
 const income=advanceTime(world,hours*60);
 let healed=0;
 // Rest drifts bonds and the meter settles in one-hour slices, so a rung boundary the drift crosses changes the rate at the same clock hour
 // whether the player chose one 48-hour rest or two of 24 (Codex's G5 review); training drifts nothing and settles once.
 const crossings=[];if(activity!=='train'&&s.rules?.social){const end=world.clock.minutes;for(let done=0;done<hours;done++){for(const u of troops)crossings.push(...driftBonds(u,1));settleMorale(world,s,60,undefined,end-(hours-done-1)*60);}}else settleMorale(world,s,hours*60);
 for(const u of troops){u.overwatch=null;if(activity!=='train'){restStrain(u,hours);const assisted=Math.min(hours,u.medicalRestHours||0),before=u.hp;recoverHealth(u,assisted/MEDICAL_RECOVERY_HOURS+(hours-assisted)/REST_RECOVERY_HOURS);u.medicalRestHours=u.hp===u.maxHp?0:Math.max(0,(u.medicalRestHours||0)-assisted);healed+=u.hp-before;u.ap=u.maxAp;}else if(u.level<10)awardXP(u,25*hours);}
 const message=activity==='train'?`Squad trained for ${hours} hour${hours===1?'':'s'}; +${25*hours} XP per eligible troop.`:`Squad rested for ${hours} hour${hours===1?'':'s'}; restored ${healed} HP total.`+(treatment?` ${treatment.medic.name} provided care; used ${treatment.kitsNeeded} medkits.`:'');
 refresh(s);log(s,message);for(const line of crossings)log(s,line);
 settleContracts(world,s); // last: a merc whose contract ran out inside the block is healed or trained for the hours it did, then walks (review round 2)
 return {ok:true,income,message};
}
function recoverHealth(u,fraction){
 if(u.hp>=u.maxHp){u.restHealing=0;return;}
 const recovery=(u.restHealing||0)+u.maxHp*fraction,whole=Math.floor(recovery+1e-9);
 u.hp=Math.min(u.maxHp,u.hp+whole);u.restHealing=u.hp===u.maxHp?0:Math.max(0,recovery-whole);
}
// Squad members who already crossed an edge and wait on the next map's border. They are off this map (see alive in engine.js).
export const away=s=>s.units.filter(u=>u.team==='squad'&&u.away);
export const beyond=(world,id,side)=>{const p=world.positions?.[id],d=SIDES[side];if(!p||!d)return null;return Object.keys(world.positions).find(k=>k!==id&&world.positions[k].x===p.x+d.dx&&world.positions[k].y===p.y+d.dy)||null;};
export const borderSides=u=>[u.y<BORDER&&'north',u.x>=W-BORDER&&'east',u.y>=H-BORDER&&'south',u.x<BORDER&&'west'].filter(Boolean);
// Crossing is one more step: the stance's cardinal move cost in combat, free while exploring.
export const crossingCost=(s,u)=>combatCosts(s)?movementCost(u):0;
export function travelReason(world,destination) {
  const s=currentMap(world);
  if(!world.definitions[destination])return 'Unknown location.';
  if(destination===world.current)return 'You are already here.';
  if(!world.links.some(l=>l.includes(world.current)&&l.includes(destination)))return 'Travel to the neighboring location first.';
  if(!['explore','won'].includes(s.phase)||guards(s).some(g=>g.alert))return 'Finish the active encounter before traveling.';
  if(s.queue.length)return 'Stop movement before traveling.';
  if(!squad(s).length)return 'No surviving squad members.';
  const waiting=away(s)[0];
  if(waiting&&waiting.away.destination!==destination)return `Comrades are waiting beyond the ${waiting.away.side} edge, in ${world.definitions[waiting.away.destination].name}. Travel there.`;
  const exit=s.definition.exits[0];
  if(squad(s).some(u=>levelOf(u)!==levelOf(exit)||Math.hypot(u.x-exit.x,u.y-exit.y)>2))return 'Gather every living squad member within 2 tiles of the travel marker.';
  return '';
}
function landing(s,start,occupied) {
  const q=[start],seen=new Set([tileKey(start.x,start.y,levelOf(start))]);
  for(let i=0;i<q.length;i++){const p=q[i];if(walkable(s,p.x,p.y,levelOf(p))&&!occupied.has(tileKey(p.x,p.y,levelOf(p))))return p;
    for(const b of neighbors(s,p)){const k=tileKey(b.x,b.y,levelOf(b));if(!seen.has(k)){seen.add(k);q.push(b);}}
  }
  // An edge tile can be water or void with no walkable neighbour chain: take the nearest free ground tile instead.
  let best=null,bestD=Infinity;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const d=Math.hypot(x-start.x,y-start.y);if(d<bestD&&walkable(s,x,y,0)&&!occupied.has(tileKey(x,y,0))){best={x,y,z:0};bestD=d;}}return best;
}
// Where a unit lands on the next map: crossers appear on the opposite border at the row or column they left from, everyone else at their start.
function entryTile(next,u){const from=u.away;if(!from)return next.definition.starts[u.id]??next.definition.starts[0];/* a hired merc has no start of its own: it lands beside the first */return {x:from.side==='east'?0:from.side==='west'?W-1:from.x,y:from.side==='south'?0:from.side==='north'?H-1:from.y,z:0};}
function arrivalPlan(world,destination){
  const previous=currentMap(world),next=world.states[destination]||createGame(1947,world.definitions[destination],false,world.difficulty,{social:true,rosterSeed:world.rosterSeed});
  const occupied=new Set(guards(next).map(u=>tileKey(u.x,u.y,levelOf(u)))),places=new Map();
  for(const u of previous.units.filter(u=>u.team==='squad')){const p=landing(next,entryTile(next,u),occupied);if(!p)return {ok:false,error:'No free arrival tile.'};places.set(u.id,p);if(alive(u)||u.away)occupied.add(tileKey(p.x,p.y,levelOf(p)));}
  return {ok:true,next,places};
}
function arrive(world,destination,plan=arrivalPlan(world,destination)){
  if(!plan.ok)return plan;
  const previous=currentMap(world),{next,places}=plan;
  const left=abandonCasualties(previous);
  if(left.length){log(previous,'Left behind: '+left.map(u=>u.name+' ('+u.casualty+')').join(', ')+'.');
    // The run's record of the fallen (the future rescue facility reads it) gets the abandoned exactly as a lost fight would record them.
    for(const u of left)u.recorded=true;
    world.defeats=[...(world.defeats||[]),{map:world.current,location:previous.definition.name,round:previous.round,cause:'abandoned',escaped:[],captured:left.filter(u=>u.casualty==='captured').map(u=>structuredClone(u)),dead:left.filter(u=>u.casualty==='dead').map(u=>({id:u.id,name:u.name}))}];}
  // Leaving a lost map (the crossers resolving their retreat) files its record with the run at once; re-entry below is the fallback.
  if(previous.phase==='lost'&&previous.defeat){world.defeats=[...(world.defeats||[]),{...previous.defeat,map:world.current}];delete previous.defeat;previous.phase='explore';}
  const incoming=structuredClone(previous.units.filter(u=>u.team==='squad')),carried=new Map();
  for(const u of incoming){const p=places.get(u.id);if(u.away?.ap!==undefined)carried.set(u.id,u.away.ap);delete u.away;if(u.casualty==='quit'){u.x=-1;u.y=-1;u.z=0;continue;} // a merc that quit travels as a record, never as a body
   u.x=p.x;u.y=p.y;u.z=levelOf(p);u.alert=false;u.lastKnown=null;}
  // A map left mid-fight, or lost after some comrades crossed its edge, is entered fresh: its guards keep their alert and last fix, refresh() decides contact.
  if(next.phase==='lost'){world.defeats=[...(world.defeats||[]),{...next.defeat,map:destination}];delete next.defeat;next.phase='explore';}
  if(['player','enemy'].includes(next.phase)){next.phase='explore';next.enemyIndex=0;}
  next.units=[...incoming,...next.units.filter(u=>u.team==='guard')];next.selected=incoming.find(alive)?.id??previous.selected;next.queue=[];next.effect=null;next.alerted=new Set();next.engaged=false;next.freshFight=true;next.fight=null;previous.fight=null; // entering a map is a fresh fight, and a map change ends a contact without a clean-win lift: full AP on contact (capped by what a crosser carried), whatever alert the guards kept
  // Failed travel takes no time. Production during transit uses previously liberated maps.
  previous.leftAt=world.clock.minutes; // the moment this map was left: its guards settle by the clock when the squad returns
  const income=advanceTime(world,TRAVEL_MINUTES);settleMorale(world,next,TRAVEL_MINUTES,()=>destination);settleContracts(world,next); // the hour on the road, everyone together on the destination
  if(Number.isFinite(next.leftAt))settleGuards(next,world.clock.minutes-next.leftAt);next.leftAt=undefined;
  world.states[destination]=next;world.current=destination;world.journeys++;world.lastIncome=income;
  refresh(next);
  // Crossing mid-turn does not refill the turn: a unit that crossed in combat and arrives into contact keeps the AP it had.
  if(next.phase==='player')for(const u of squad(next))if(carried.has(u.id))u.ap=Math.min(u.ap,carried.get(u.id));
  log(next,'Arrived from the overmap.'+(left.length?' Left behind: '+left.map(u=>u.name).join(', ')+'.':'')+(income?' Factory income +$'+income+' · Treasury $'+world.money+'.':''));return {ok:true,state:next,income,left};
}
export function travel(world,destination) {
  const error=travelReason(world,destination);if(error)return {ok:false,error};
  return arrive(world,destination);
}
// Retreat: any controllable squad member standing on the ground inside the 3-tile border band can walk off that edge onto the neighbouring
// overmap tile, in or out of combat. Crossers wait at the far side; the squad regroups there when the last standing member follows or falls.
export function leaveReason(world,u,side){
  const s=currentMap(world);
  if(!SIDES[side])return 'Unknown edge.';
  if(!u||u.team!=='squad'||!alive(u))return 'No one to move.';
  if(!canControl(s,u))return 'Cannot act now.';
  if(s.queue.length)return 'Stop movement before leaving the map.';
  if(levelOf(u)!==0)return 'Descend to the ground to leave the map.';
  if(!borderSides(u).includes(side))return `Walk into the ${BORDER}-tile band along the ${side} edge first.`;
  const destination=beyond(world,world.current,side);
  if(!destination)return `Nothing lies beyond the ${side} edge.`;
  const waiting=away(s)[0];
  if(waiting&&waiting.away.destination!==destination)return `Comrades are already crossing to ${world.definitions[waiting.away.destination].name}; use the ${waiting.away.side} edge.`;
  if(combatCosts(s)&&u.ap<crossingCost(s,u))return 'Not enough AP.';
  return '';
}
export function leave(world,u,side){
  const error=leaveReason(world,u,side);if(error)return {ok:false,error};
  const s=currentMap(world),destination=beyond(world,world.current,side),last=squad(s).length===1;
  // Flag the crosser before planning so the plan lands it on the far border; a failed plan changes nothing.
  u.away={destination,side,x:u.x,y:u.y};
  const plan=last?arrivalPlan(world,destination):null;if(plan&&!plan.ok){delete u.away;return plan;}
  if(combatCosts(s)){u.ap-=crossingCost(s,u);u.away.ap=u.ap;}
  u.overwatch=null;
  log(s,`${u.name} crossed the ${side} edge toward ${world.definitions[destination].name}.`);
  if(!last){refresh(s);return {ok:true,state:s,arrived:false};}
  return {arrived:true,...arrive(world,destination,plan)};
}
// A waiting crosser can walk back onto the tile it left from, if that tile is still free: the far border walks both ways.
export function recallReason(world,u){
  const s=currentMap(world);
  if(!u||u.team!=='squad'||!u.away||u.hp<=0)return 'No one is waiting there.';
  if(!['explore','player','won'].includes(s.phase))return 'Cannot act now.';
  if(s.queue.length)return 'Stop movement before returning.';
  if(!walkable(s,u.away.x,u.away.y,0)||occupant(s,u.away.x,u.away.y,0))return 'The tile it left from is blocked.';
  if(combatCosts(s)&&u.ap<crossingCost(s,u))return 'Not enough AP.';
  return '';
}
export function recall(world,u){
  const error=recallReason(world,u);if(error)return {ok:false,error};
  const s=currentMap(world),{side,x,y}=u.away;
  if(combatCosts(s))u.ap-=crossingCost(s,u);
  delete u.away;u.x=x;u.y=y;u.z=0;u.overwatch=null;
  // A return is a step like any other: it makes a footstep and walks into whatever burns on that tile.
  emitNoise(s,u,u.sneaking?3:10);enterFire(s,u);
  log(s,`${u.name} came back across the ${side} edge.`);refresh(s);return {ok:true,state:s};
}
// Mercenary contracts (ECONOMY.md, "Mercenary contracts"). Hiring happens on a cleared map, like rest; a contract runs on the campaign clock
// and a merc whose contract has run out walks at the next safe moment, the way a merc that quit does (G5).
export const hiringDay=world=>Math.floor(world.clock.minutes/DAY_MINUTES);
export const hiringReason=world=>downtimeReason(world,'hiring');
// The squad members a candidate is measured against and counted with: on contract (standing or down), not dead, captured or gone.
export const contracted=s=>s.units.filter(u=>u.team==='squad'&&onContract(u));
// Today's slate: six candidates drawn from the roster seed and the campaign day, minus the ones already signed today; new faces at midnight.
export function candidates(world){const s=currentMap(world),members=contracted(s),today=hiringDay(world);
 world.hired=world.hired.filter(k=>k.startsWith(today+':')); // yesterday's keys can never match again
 const taken=new Set(s.units.filter(u=>u.team==='squad'&&u.hired?.day!==today).map(u=>u.name)); // today's own hires keep their slot's name, so signing one candidate never renames another
 return slate(world.rosterSeed,today,{taken}).filter(c=>!world.hired.includes(c.key)).map(c=>{const f=fit(c.archetype,members),rate=dailyRate(c,f);return {...c,fit:f,rate,prices:pricesFor(rate,c.archetype)};});}
// Spawn a candidate onto a map beside `at` (the selected comrade by default) as a full squad unit: inventory, progression, the candidate's build, its ledger.
export function enlist(s,c,{id=null,at=null,social=!!s.rules?.social}={}){
 if(id===null)id=1+Math.max(MERC_ID_BASE-1,...s.units.map(v=>v.id)); // the next free campaign id; hire() passes world.nextId
 const anchor=at||squad(s)[0]||s.definition.starts[0],occupied=new Set(s.units.filter(u=>alive(u)||incapacitated(u)).map(u=>tileKey(u.x,u.y,levelOf(u))));
 const p=landing(s,{x:anchor.x,y:anchor.y,z:levelOf(anchor)},occupied);if(!p)return null;
 const u=spawnUnit(s,{team:'squad',name:c.name,species:c.species,x:p.x,y:p.y,z:levelOf(p),weapon:c.kit.weapon,id});
 initInventory(u,WEAPONS);initProgression(u);buildRecruit(u,c,WEAPONS);recruitSocial(u,s.units.filter(v=>v.team==='squad'&&v!==u&&onContract(v)),social);/* the ledger names the members on contract, not the dead, the captured or the gone */if(Number.isFinite(anchor.heading))u.heading=anchor.heading;return u;}
export function hire(world,key,term){
 const s=currentMap(world),reason=hiringReason(world);if(reason)return {ok:false,error:reason};
 const c=candidates(world).find(c=>c.key===key);if(!c)return {ok:false,error:'That candidate has moved on.'};
 const t=c.prices[term];if(!t)return {ok:false,error:'Choose a day, a week or a month.'};
 if(contracted(s).length>=ROSTER_MAX)return {ok:false,error:`The roster holds ${ROSTER_MAX}.`};
 if(world.money<t.price)return {ok:false,error:`Need $${t.price.toLocaleString()}; the treasury holds $${world.money.toLocaleString()}.`};
 const u=enlist(s,c,{id:world.nextId,at:unit(s,s.selected)});if(!u)return {ok:false,error:'No free ground to arrive on.'};
 world.nextId++;world.money-=t.price;world.hired.push(c.key);const now=world.clock.minutes;
 u.hired={key:c.key,day:c.day,grade:c.grade,rate:c.rate,signed:now};u.contract={term,from:now,until:now+t.minutes,paid:t.price,renewals:0,expired:false};
 refresh(s);log(s,`${u.name} signed on for a ${term} at $${t.price.toLocaleString()}${c.fit.trouble.length?' (asked more: expects trouble with '+c.fit.trouble.join(' and ')+')':''}.`);return {ok:true,unit:u,price:t.price};}
// Renewal extends from the contract's end (nothing is lost by renewing early) or from now when it has run out; pay day lifts the meter (GUARDS.md G5's table).
// Renewal is allowed mid-fight (it is the one moment an expired contract can be seen); paying off waits for the quiet, since the merc leaves at once.
export function renewReason(world,u){if(!u?.hired||!onContract(u))return 'No such contract.';if(u.away)return u.name+' is beyond the map edge.';return '';}
export function releaseReason(world,u){const reason=renewReason(world,u);if(reason)return reason;if(combatCosts(currentMap(world)))return 'Finish the fight first.';return '';}
export function renew(world,id,term){
 const s=currentMap(world),u=unit(s,id),reason=renewReason(world,u);if(reason)return {ok:false,error:reason};
 const t=contractPrices(u)[term];if(!t)return {ok:false,error:'Choose a day, a week or a month.'};
 if(world.money<t.price)return {ok:false,error:`Need $${t.price.toLocaleString()}; the treasury holds $${world.money.toLocaleString()}.`};
 world.money-=t.price;const now=world.clock.minutes,from=Math.max(now,u.contract.until);
 u.contract={...u.contract,term,until:from+t.minutes,paid:u.contract.paid+t.price,renewals:u.contract.renewals+1,expired:false};payDay(u);
 log(s,`${u.name} signed on for another ${term} at $${t.price.toLocaleString()}.`);s.revision++;return {ok:true,price:t.price};}
// Paying a merc off ends the contract now, no refund; it leaves the way a merc that quit does.
export function release(world,id){const s=currentMap(world),u=unit(s,id),reason=releaseReason(world,u);if(reason)return {ok:false,error:reason};quitMerc(s,u,'released');refresh(s);return {ok:true};}
// Every clock advance: a contract past its end is up; the merc walks at once on a calm map, otherwise when the contact ends (engine contactEnds).
export function settleContracts(world,s,now=world.clock.minutes){const lines=[];
 for(const u of s.units)if(u.team==='squad'&&u.contract&&onContract(u)&&!u.contract.expired&&now>=u.contract.until){u.contract.expired=true;const line=u.name+"'s contract is up.";lines.push(line);log(s,line);}
 let walked=false;if(['explore','won'].includes(s.phase)&&!combatCosts(s))for(const u of s.units)if(u.team==='squad'&&u.contract?.expired&&onContract(u)&&quitMerc(s,u,'contract'))walked=true;
 if(walked)refresh(s); // the last body walking out is a defeat only refresh() declares ("The squad has walked out."); nothing else would call it
 return lines;}
// A map lost after some comrades crossed its edge ends the fight for those who stayed; the crossers still arrive.
export function resolveRetreat(world){
  const s=currentMap(world);if(s.phase!=='lost'||!away(s).length)return {ok:false,error:'Nothing to resolve.'};
  const fallen=s.defeat,result=arrive(world,away(s)[0].away.destination);
  if(result.ok&&fallen)log(result.state,`Left on ${fallen.location}: ${fallen.dead.length} dead, ${fallen.captured.length} captured.`);
  return result;
}
