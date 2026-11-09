import {beginGunshotAction,stampGunshotEvent,prepareBodyImpact,commitBodyImpact} from '../gunshot-impacts.js';
import {attackWeapon,handAttackReady,handWeapons,pairedInHand} from '../one-handed.js';
import {settleSquadAmmo} from '../squad-ammo.js';
import {tutorialCrateLoot} from '../tutorial-mission.js';
import {initializeDialogue,ensureDialogueUnitIds,pinDialogue} from '../dialogue-state.js';
import {climbingPreview,rollClimb} from '../climbing.js';
import {failedClimbFall,cancelClimbOrders} from '../fall-damage.js';
import {withCombatQueries,combatQuery} from '../combat-queries.js';
import {invalidateMapGeometry,trackMapGeometry} from '../map-geometry-cache.js';
import {patrolDestination} from '../character-patrol.js';
import {synchronizeFoliage} from '../foliage-obstacles.js';
import {projectileStructureDamage,commitStructureDamage} from '../structure-damage.js';
import {planFlameStructureDamage} from '../structure-flame.js';
import {settleStructureCollapse} from '../structure-collapse.js';
import {mergeScenery} from '../structure-health.js';
import {previewGroundFire} from '../ground-fire.js';
import {intactSite,siteId,siteEscapeSteps} from '../strategic-site-rules.js';
import {flameStrategicSites} from '../strategic-site-damage.js';
import {presentBarrel,isExplosiveBarrel} from '../explosive-barrels.js';
import {previewBarrelAttack} from '../barrel-targeting.js';
import {applyFuelBlast,detonateBarrels,fuelBlastReaches} from '../fuel-blast.js';
import {firePoint,recordBurn} from '../fire-events.js';
import {flamePreview,flameShape,flameVictims,flameBarrels} from '../flame-cone.js';
import {rollFirearmShot} from '../helicoid-shot.js';
import {injuryMovement,turnAP,woundLeg,accuracyPenalty,roundChance,incomingFire,recoverAim} from '../combat-state.js';
import {automaticRoofClimbs} from '../climbable-roofs.js';
import {recordRoofTraversal} from '../roof-traversal.js';
import {rampSupportAt} from '../cliff-ramps.js';
import {applyRuntimeCharacter,combatBehavior,hostileToPlayer,playerThreat,provokeCharacter} from '../character-properties.js';
import {updateCliffSupports} from '../cliff-support.js';
import {recordCliffTraversal} from '../cliff-traversal.js';
import {COMBAT_ROUND_MINUTES as ROUND_MINUTES} from '../game-clock.js';
export {ROUND_MINUTES};
import {towerForUnit,unitBaseHeight,TOWER_HEIGHT} from '../tower-geometry.js';
import {updateAwareness,awarenessPerception} from '../awareness.js';
import {shotAim,supportsAim} from '../aim-levels.js';
import {initializeStats,weaponAccuracy,damageAfterResistance} from '../character-stats.js';
import {spendStamina,spendMovement,canMoveStamina,recoverStamina} from '../stamina.js';
import {starterTools} from '../inventory-tools.js';
import {equipmentDropRate,noEquipmentDrops,weaponCondition,initializeWeaponCondition,damageHeldWeapon,heldWeaponJammed,heldWeaponItem,weaponJams} from '../loot-policy.js';
import {explosivePreview,explosiveTrajectory,detonate} from './explosives.js';
import {initPersonality,initGuardSocial,socialRoll,friendlyReaction,helped,settleStress,injuryStrain,killRelief,collapse} from './personalities.js';
import {partnerLost,stabilizedPartner,cleanWin,onContract} from './happiness.js';
import {initProgression,awardCombatXP,train} from './progression.js';
import {bulletTrajectory,shotgunTrajectories,traceProjectile,eyeHeight,targetHeight} from './projectiles.js';
import {gridLayout,storeLayout,placeItem,initInventory,reserve,consumeAmmo,syncWeapons,accepts,receive} from './inventory.js';
import {inCone,headingTo,sightOf,identifyRange,detectRange} from './perception.js';
import {ARCHETYPES,drawArchetype,hearingScale,stepsScale,cellsScale,alertScale,nerveFraction,brokenRoundsOf,archetypeBark,bond as archetypeBond,shoutRadius,traitsOf,rungOf,opposing} from './archetypes.js';
export {ARCHETYPES,NAMES as ARCHETYPE_NAMES,drawArchetype,drawSquad,rungOf,retaliationScale,bond as archetypeBond,shoutRadius,describeArchetype} from './archetypes.js';
export {inCone,headingTo,bearingOffset,sightOf,identifyRange,detectRange,acuity,SIGHT,JOHNSON} from './perception.js';
import {woodlandDepth} from './woodland.js';
import {terrainVisibility,TERRAIN_RANGE,CHARACTER_RANGE} from './visibility.js';
export {TERRAIN_RANGE,CHARACTER_RANGE} from './visibility.js';
import {PROPS,EDGES,propAt,propTall,propCells} from './environment.js';
import {W,H,factoryMap,validateMap,openDoorBetween,blockedEdge,levelOf,tileKey,terrainAt,neighbors,stairSet,canStep,LEVELS,passable,sightEdge,edgeBetween,edgeCells,inBounds} from './maps.js';
export {W,H} from './maps.js';
export const WEAPONS={
 hands:{name:'Workers’ fists',short:'Hands',cost:3,range:1,damage:16,mag:0},
 knife:{name:'NR-40 knife',short:'NR-40',cost:3,range:1,damage:27,mag:0},
 pistol:{name:'TT-33 pistol',short:'TT-33',cost:4,range:12,damage:27,mag:8,penetrationClass:'pistol',accuracy:-20,rangeLoss:35},
 'pistol-offhand':{name:'TT-33 pistol · second',short:'TT-33 II',cost:4,range:12,damage:27,mag:8,penetrationClass:'pistol',accuracy:-20,rangeLoss:35},
 rifle:{name:'Mosin-Nagant',short:'Mosin',cost:6,range:24,damage:48,mag:5,accuracy:5,rangeLoss:18},
 assault:{name:'AK-47',short:'AK-47',cost:4,range:24,damage:26,mag:30,burstRounds:3,rangeLoss:26},
 smg:{name:'PPSh submachine gun',short:'SMG',cost:4,range:20,damage:27,mag:35,burstRounds:3,penetrationClass:'pistol',rangeLoss:30},
 hmg:{name:'Heavy machine gun',short:'HMG',cost:6,range:28,damage:48,mag:50,burstRounds:3,rangeLoss:24},
 shotgun:{name:'Pump-action shotgun',short:'Shotgun',cost:5,range:12,damage:27,mag:6,penetrationClass:'pistol',pellets:6,rangeLoss:15},
 sniper:{name:'Sniper rifle',short:'Sniper',cost:8,range:36,damage:75,mag:5,accuracy:10,rangeLoss:12},
 grenade:{name:'Fragmentation grenade',short:'Grenade',cost:5,range:10,damage:120,mag:3,blast:5,arc:true,thrown:true},
 launcher:{name:'Grenade launcher',short:'Launcher',cost:6,range:22,damage:140,mag:1,blast:3,arc:true},
 rpg:{name:'RPG',short:'RPG',cost:7,range:40,damage:220,mag:1,blast:4},
 flamethrower:{name:'Backpack flamethrower',short:'Flamer',cost:6,range:10,damage:180,mag:4,rangeLoss:15,incendiary:true}
};
export const weaponDamage=(w,range)=>w.incendiary?Math.round(w.damage*(range<=3?1:Math.max(.25,1-(range-3)/7*.75))):w.damage;
export const AIM_ZONES={head:{label:'Head',accuracy:-25,damage:1.5},weapon:{label:'Weapon',accuracy:-15,damage:.75},torso:{label:'Torso',accuracy:0,damage:1},legs:{label:'Legs',accuracy:-10,damage:.85}};
export function tankExplosionChance(unit,zone){
 const carrying=unit.weapon==='flamethrower'||unit.pack?.some(i=>i.type==='weapon'&&i.kind==='flamethrower');
 if(!carrying||unit.tanksExploded||(unit.ammo?.flamethrower??0)<=0)return 0;
 return zone==='torso'?.25:zone==='weapon'&&unit.weapon==='flamethrower'?.9:0;
}
export const STANCES={standing:{label:'Standing',moveCost:2},kneeling:{label:'Kneeling',moveCost:4},prone:{label:'Prone',moveCost:8}};
export const stanceOf=u=>Object.hasOwn(STANCES,u?.stance)?u.stance:'standing';
export const MOVEMENT_MODES={walk:{label:'Walk',apMultiplier:1,speed:1},run:{label:'Run',apMultiplier:.5,speed:2},sneak:{label:'Sneak',apMultiplier:1.5,speed:.5}};
export const movementModeOf=u=>u?.sneaking?'sneak':u?.running?'run':'walk';
export const movementMultiplier=u=>MOVEMENT_MODES[movementModeOf(u)].apMultiplier*injuryMovement(u);
export const movementCost=u=>STANCES[stanceOf(u)].moveCost*movementMultiplier(u);
export const effectiveStealth=u=>Math.min(100,Math.max(0,(u.stealth||0)+(u.sneaking?20:0)));
function movementCosts(s,step){return s.phase==='player'||!!step.climb&&combatCosts(s);}
export function movementStep(u,p,q,combat=false){
 const climb=climbingPreview(u,q,combat);
 if(climb&&(!climb.ok||stanceOf(u)!=='standing'))return null;
 const cost=climb&&!climb.legacy?climb.cost:q.kind==='cliff'?8*injuryMovement(u):(q.kind==='ramp'||levelOf(q)===levelOf(p)?STANCES[stanceOf(u)].moveCost*q.cost:q.cost)*movementMultiplier(u);
 return {...q,cost,...climb?{climb}: {}};
}
export function movementNeighbors(s,u,p=u,stairs){if(towerForUnit(s,u))return [];return neighbors(s,p,stairs).concat(siteEscapeSteps(s,u,p)).filter(q=>(q.kind==='ramp'||levelOf(q)===levelOf(p)||stanceOf(u)==='standing')&&!(levelOf(q)===levelOf(p)&&q.x!==p.x&&q.y!==p.y&&[occupant(s,q.x,p.y,levelOf(p)),occupant(s,p.x,q.y,levelOf(p))].some(v=>v&&v!==u))).map(q=>movementStep(u,p,q,combatCosts(s))).filter(Boolean);}
export const key=tileKey;
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,unitBaseHeight(a)-unitBaseHeight(b));
export const alive=u=>u.hp>0&&!u.away&&u.casualty!=='quit'; // A unit that crossed the map edge is off this map: not a target, not an occupant, not controllable here; a merc that quit (G5) has left the squad.
export const incapacitated=u=>u?.hp===0&&['bleeding','stable'].includes(u.casualty);
// A stabilized casualty gets back up after three full squad turns (turns that begin after the stabilization), at 5 HP, still exhausted. See RULES.md, Casualty recovery.
export const RECOVERY_TURNS=3,RECOVERY_HP=5;
export function beginRecovery(s,u){u.recoveryTurns=RECOVERY_TURNS;u.recoveryFrom=s.round;}
export const recovering=u=>u?.casualty==='stable'&&u.recoveryTurns>0;
// Squad-turn ends still to come before the comrade stands (the turn it was stabilized in does not count).
export const recoveryEnds=(s,u)=>u.casualty==='stable'?u.recoveryTurns+(s.round===u.recoveryFrom?1:0):0;
// A physical body on this map is alive(u)||incapacitated(u) with no `away` flag; projectiles.js and explosives.js inline that test (importing engine there would be a cycle).
export const medicalCost=u=>Math.ceil(12-9*Math.max(0,Math.min(100,Number(u.medical)||0))/100);
export const squad=s=>s.units.filter(u=>u.team==='squad'&&alive(u));
// Ids are stable: a fresh map numbers its units by index, a hired merc keeps its campaign id (recruits.js) on every map it visits, so the index is only a fast path.
export const unit=(s,id)=>{const u=s.units[id];return u&&u.id===id?u:s.units.find(v=>v.id===id);};
export const roster=s=>s.units.filter(u=>u.team==='squad');
export const guards=s=>s.units.filter(u=>u.team==='guard'&&alive(u));
export const occupant=(s,x,y,z=0)=>s.units.find(u=>(alive(u)||incapacitated(u))&&u.x===x&&u.y===y&&levelOf(u)===z);
export const tile=(s,x,y,z=0)=>terrainAt(s,x,y,z);
export const walkable=(s,x,y,z=0)=>passable(s,{x,y,z});
export function log(s,message){s.log.unshift(message);s.log=s.log.slice(0,50);s.revision++;}
// One unit record, the shape every system reads. On a fresh map the id is the index; a hired merc brings its campaign id (world.js enlist).
export function spawnUnit(s,{team,name,species,x,y,z=0,weapon,id=s.units.length,medical=0}){const u={id,team,name,species,x,y,z,medical,medkits:team==='squad'?1:0,wireCutters:team==='squad',casualty:null,bleedTurns:0,sneaking:false,running:false,stealth:20,overwatch:null,lastHeard:null,stance:'standing',hp:team==='squad'?100:45,maxHp:team==='squad'?100:45,ap:team==='squad'?12:Math.max(7,WEAPONS[weapon].cost),maxAp:team==='squad'?12:Math.max(7,WEAPONS[weapon].cost),accuracy:team==='squad'?85:55,weapon,ammo:Object.fromEntries(Object.entries(WEAPONS).map(([k,v])=>[k,v.mag])),alert:false,state:'rest',wary:false,post:null,lastKnown:null,facing:1,heading:team==='squad'?45:225,cone:sightOf({species}).field,moved:false,fired:false,lastAt:x+','+y+','+z,steps:0};if(s.rules?.statSystem)initializeStats(u);s.units.push(u);return u;}
export const DEFAULT_CAST=[['Yakov','horse','assault'],['Anya','goat','rifle'],['Misha','donkey','pistol'],['Vera','sheep','knife']];
// options.cast: [{name,species,weapon}] takes the squad starts in order (the balance instrument fields a hired merc alone); absent, the four comrades.
export function createGame(seed=1947,definition=factoryMap(),detect=true,difficulty='standard',options={}){
 const errors=validateMap(definition);if(errors.length)throw Error(errors.join(' '));
 const s={difficulty:difficulty==='easy'?'easy':'standard',map:structuredClone(definition.terrain),upper:structuredClone(definition.upper),stairs:structuredClone(definition.stairs),climbs:structuredClone(definition.climbs||[]),props:structuredClone(definition.props||[]),canopies:structuredClone(definition.canopies||[]),sectors:structuredClone(definition.sectors),edges:{...definition.edges},...(definition.environment?{environment:structuredClone(definition.environment)}:{}),...(definition.foliage?{foliage:structuredClone(definition.foliage)}:{}),...(definition.breaches?{breaches:structuredClone(definition.breaches)}:{}),edgeLocks:structuredClone(definition.edgeLocks||{}),definition:structuredClone(definition),units:[],phase:'explore',round:0,selected:0,visible:new Set(),seen:new Set(),detected:new Set(),glimpses:{},log:[],seed,perceptionSeed:seed,revision:0,queue:[],enemyIndex:0,contacts:{},effect:null};
 initializeDialogue(s,seed);for(const d of Object.values(definition.dialogueDefinitions||{}))pinDialogue(s.dialogue,d);
 const add=(team,name,species,x,y,weapon,z=0)=>spawnUnit(s,{team,name,species,x,y,z,weapon,medical:team==='squad'?[0,25,50,100][s.units.length]:0});
 const cast=options.cast?options.cast.map(c=>[c.name,c.species,c.weapon]):DEFAULT_CAST;
 definition.starts.forEach((p,i)=>{if(cast[i]){add('squad',cast[i][0],p.species||cast[i][1],p.x,p.y,p.weapon||cast[i][2],levelOf(p));if(p.heading!==undefined){const u=s.units.at(-1);u.heading=p.heading;const angle=p.heading*Math.PI/180;u.facing=Math.cos(angle)-Math.sin(angle)>=0?1:-1;}if(p.outfit)s.units.at(-1).outfit=p.outfit;applyRuntimeCharacter(s.units.at(-1),p);}});
 const names=['Boris','Lev','Grigori','Oleg','Pavel','Igor','Anton','Vadim','Yuri','Sasha','Pyotr','Nikolai'];
 definition.guards.forEach((g,i)=>{add('guard',names[i]||`Guard ${i+1}`,g.species,g.x,g.y,g.weapon,levelOf(g));applyRuntimeCharacter(s.units.at(-1),g);if(g.outfit)s.units.at(-1).outfit=g.outfit;if(Number.isFinite(g.heading))s.units.at(-1).heading=g.heading;});
 for(const g of guards(s))g.post={x:g.x,y:g.y,z:levelOf(g),heading:g.heading}; // a guard's start tile and heading are its post
 // G3 behind its knob: the campaign (createWorld) draws an archetype per guard from a hash of the seed and the guard's index; plain createGame leaves the G2 base numbers.
 let rosterSeed=(options.rosterSeed??seed)>>>0;for(const c of String(definition.name||''))rosterSeed=Math.imul(rosterSeed^c.charCodeAt(0),16777619)>>>0;
 s.rules={social:!!options.social,awareness:!!options.awareness,rosterSeed};if(s.rules.social)for(const [i,g] of guards(s).entries()){g.archetype=drawArchetype(rosterSeed,i);g.traits={...ARCHETYPES[g.archetype].traits};initGuardSocial(g);}
 for(const u of s.units){initInventory(u,WEAPONS);initializeWeaponCondition(s,u);if(u.team==='squad'){initProgression(u);initPersonality(u,s.rules.social);}}s.loot=definition.starts.map((p,i)=>({...p,items:[{type:'ammo',kind:i%2?'rifle':'pistol',count:i%2?5:8}]}));
 if(definition.name==='Factory test')for(const [i,kind]of ['shotgun','sniper','smg','hmg'].entries())s.loot[i].items.push({type:'weapon',kind,rounds:WEAPONS[kind].mag},{type:'ammo',kind,count:12});
 if(definition.name==='Factory test')for(const [i,kind]of ['grenade','launcher','rpg'].entries())s.loot[i+1].items.push({type:'weapon',kind,rounds:WEAPONS[kind].mag},{type:'ammo',kind,count:kind==='grenade'?6:3});
 if(definition.name==='Factory test')s.loot[0].items.push({type:'weapon',kind:'flamethrower',rounds:4},{type:'ammo',kind:'flamethrower',count:4});
 if(options.statSystem){s.rules.statSystem=true;for(const u of s.units){const source=u.team==='guard'?definition.guards[u.id-s.units.filter(v=>v.team==='squad').length]:definition.starts[u.id],authored={...(u.team==='squad'?options.cast?.[u.id]?.stats:{}),...source?.stats};if(Number.isFinite(source?.perception)&&!Number.isFinite(authored.perception))authored.perception=source.perception;initializeStats(u,authored);starterTools(u);}}
 if(s.rules.awareness)for(const u of s.units){const source=u.team==='guard'?definition.guards[u.id-s.units.filter(v=>v.team==='squad').length]:definition.starts[u.id];if(source?.towerPost)u.towerPost=structuredClone(source.towerPost);u.perception=u.stats?u.stats.perception:Number.isFinite(source?.perception)?Math.max(0,Math.min(100,source.perception)):50;}
 s.loot.push(...tutorialCrateLoot(definition));ensureDialogueUnitIds(s);trackMapGeometry(s);if(detect)refresh(s);log(s,`Local map ready / ${definition.guards.length} guards.`);return s;
}
// Visibility and projectiles share solid geometry, but bodies do not occlude sight.
export function zoneVisible(s,a,b,zone='torso'){a={...a,cliffSupport:rampSupportAt(s,a)||a.cliffSupport};b={...b,cliffSupport:rampSupportAt(s,b)||b.cliffSupport};
 const origin={x:a.x,y:a.y,h:unitBaseHeight(a)+eyeHeight(a)},end=unitBaseHeight(b)+(b.hp===undefined?eyeHeight(b):targetHeight(b,zone));
 const direction={x:b.x-a.x,y:b.y-a.y,h:end-origin.h},length=Math.hypot(direction.x,direction.y,direction.h);
 if(length<1e-7)return true;
 return combatQuery(s,'body-ray',[origin.x,origin.y,origin.h,b.x,b.y,end].join(','),()=>{
 const hit=traceProjectile(s,null,origin,direction,length,{purpose:'sight'});
 return hit.kind==='range'||hit.distance>=length-1e-7;});
}
export const visibleZones=(s,a,b)=>Object.keys(AIM_ZONES).filter(zone=>zoneVisible(s,a,b,zone));
export function lineOfSight(s,a,b){return ['head','torso','legs','weapon'].some(zone=>zoneVisible(s,a,b,zone));}
export const pathCost=path=>path.reduce((n,p)=>n+(p.cost||1),0);
export function pathTo(s,u,x,y,z=levelOf(u),{partial=false,avoidEnd=new Set()}={}){if(towerForUnit(s,u))return null;
 if(!inBounds(x,y,z))return null;
 const target=occupant(s,x,y,z),exact=walkable(s,x,y,z)&&(!target||target===u)&&!avoidEnd.has(key(x,y,z));
 if(!partial&&!exact)return null;
 const start=key(u.x,u.y,levelOf(u)),goal=key(x,y,z),occupied=new Set(s.units.filter(p=>(alive(p)||incapacitated(p))&&p!==u).map(p=>key(p.x,p.y,levelOf(p)))),stairs=stairSet(s);
 const heuristic=p=>{const dx=Math.abs(p.x-x),dy=Math.abs(p.y-y);return (Math.max(dx,dy)+.5*Math.min(dx,dy))*movementCost(u)+2*movementMultiplier(u)*Math.abs(levelOf(p)-z);},heap=[],scores=new Map([[start,0]]),parents=new Map();
 const deviation=p=>Math.abs((p.x-u.x)*(y-u.y)-(p.y-u.y)*(x-u.x));const less=(a,b)=>a.f<b.f||(a.f===b.f&&(deviation(a)<deviation(b)||(deviation(a)===deviation(b)&&a.g>b.g)));
 const push=n=>{heap.push(n);let i=heap.length-1;while(i){const p=(i-1)>>1;if(!less(heap[i],heap[p]))break;[heap[i],heap[p]]=[heap[p],heap[i]];i=p;}};
 const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&less(heap[c+1],heap[c]))c++;if(!less(heap[c],heap[i]))break;[heap[i],heap[c]]=[heap[c],heap[i]];i=c;}}return first;};
 const trace=k=>{const path=[];while(k!==start){const entry=parents.get(k);path.push(entry.point);k=entry.parent;}return path.reverse();};
 // Track a fallback during the SAME search. A full route always wins. Only
 // strictly closer endpoints count as progress; ties prefer cheaper movement.
 const remaining=p=>Math.hypot(p.x-x,p.y-y,(levelOf(p)-z)*3);
 let best=null,bestDistance=remaining(u);
 push({...u,z:levelOf(u),k:start,g:0,f:heuristic(u)});
 while(heap.length){const p=pop();if(p.g!==scores.get(p.k))continue;if(p.k===goal&&!avoidEnd.has(p.k))return trace(goal);
  if(partial&&!avoidEnd.has(p.k)){const d=remaining(p);if(d<bestDistance-1e-9||best&&Math.abs(d-bestDistance)<1e-9&&p.g<best.g){best=p;bestDistance=d;}if(!exact&&bestDistance<=1&&best)return trace(best.k);}
  for(const q of movementNeighbors(s,u,p,stairs)){const k=key(q.x,q.y,q.z),g=p.g+q.cost;if(occupied.has(k)||g>=(scores.get(k)??Infinity))continue;scores.set(k,g);parents.set(k,{parent:p.k,point:q});push({...q,k,g,f:g+heuristic(q)});}
 }return partial?(best?trace(best.k):[]):null;
}
// Tiles a unit can stand on within `budget` AP of its own movement (its stance, diagonals, stairs, doors it would open), cheapest first; the same graph as pathTo.
export function reachable(s,u,budget){
 const start={x:u.x,y:u.y,z:levelOf(u)},occupied=new Set(s.units.filter(p=>(alive(p)||incapacitated(p))&&p!==u).map(p=>key(p.x,p.y,levelOf(p)))),stairs=stairSet(s),costs=new Map([[key(start.x,start.y,start.z),0]]),out=[{...start,cost:0}];
 for(let i=0;i<out.length;i++){const p=out[i];if(p.cost!==costs.get(key(p.x,p.y,p.z)))continue;for(const q of movementNeighbors(s,u,p,stairs)){const k=key(q.x,q.y,q.z),c=p.cost+q.cost;if(c>budget||occupied.has(k)||c>=(costs.get(k)??Infinity))continue;costs.set(k,c);out.push({x:q.x,y:q.y,z:q.z,cost:c});}}
 return out.filter(p=>p.cost===costs.get(key(p.x,p.y,p.z))).sort((a,b)=>a.cost-b.cost);
}
// Turn mode is for opponents who can hurt you soon: an alert guard is a threat when, within this many of its own turns of walking (routes, doors and
// walls as they are), it can stand where a squad member is inside its weapon's range with a clear line of fire (melee: on an adjacent tile). See RULES.md, Local alerts.
export const THREAT_TURNS=2;
export function threatens(s,g){if(!playerThreat(s,g))return false;
 if(!alive(g)||g.burningTurns)return false;
 const w=WEAPONS[g.weapon],melee=w.mag===0,range=melee?1:w.range,budget=THREAT_TURNS*g.maxAp,walk=budget/movementCost(g);
 const near=squad(s).filter(p=>Math.hypot(g.x-p.x,g.y-p.y)<=range+walk+1);if(!near.length)return false;
 for(const t of reachable(s,g,budget)){const from={...g,x:t.x,y:t.y,z:t.z};
  for(const p of near){const d=melee?(t.z===levelOf(p)?Math.max(Math.abs(t.x-p.x),Math.abs(t.y-p.y)):Infinity):Math.hypot(t.x-p.x,t.y-p.y)+Math.max(0,levelOf(p)-t.z);
   if(d<=range&&lineOfSight(s,from,p))return true;}} // melee too: a blade across a wall or a closed door is no threat
 return false;
}
export const sightRange=(a,b)=>b?.sneaking?Math.max(8,CHARACTER_RANGE-20-effectiveStealth(b)*.2-(stanceOf(b)==='prone'?10:0)):CHARACTER_RANGE;
// 0 unseen, 1 glimpsed (a moving target inside the detect lobe), 2 identified (inside the identify lobe). Walls block both. See docs/tactics/SIGHT.md.
export function geometricPerceive(s,a,b){const cap=sightRange(a,b),d=distance(a,b)+9*woodlandDepth(s,a,b);if(d<=identifyRange(a,b,cap))return lineOfSight(s,a,b)?2:0;if(b.moved&&d<=detectRange(a,b,cap))return lineOfSight(s,a,b)?1:0;return 0;}
export function perceive(s,a,b){return awarenessPerception(s,a,b,geometricPerceive(s,a,b),visibleZones);}
export const glimpsed=(s,a,b)=>perceive(s,a,b)>=1;
export const canSee=(s,a,b)=>perceive(s,a,b)===2;
// Detection keeps the actual facing. A manually aimed shot can turn toward a
// currently identified squad contact for free, but still needs the shooter's
// own unobstructed view and recognition. Queries never turn or reveal anyone;
// attack commits the facing when it fires. AI and overwatch retain their cones.
export function canAimAt(s,a,b){
 if(!a||!b)return false;
 if(a.team!=='squad')return canSee(s,a,b);
 return squad(s).some(p=>canSee(s,p,b))&&canSee(s,{...a,heading:headingTo(a,b)},b);
}
// Awareness rolls are cached until movement or a new turn; UI refresh never rerolls.
export function detectionChance(s,a,b){
 if(!canSee(s,a,b))return 0;
 const range=identifyRange(a,b,sightRange(a,b));
 let chance=.95-.5*Math.min(1,distance(a,b)/Math.max(1,range));
 if(b.sneaking)chance*=Math.max(.2,.55-effectiveStealth(b)*.003);
 if(stanceOf(b)==='kneeling')chance*=.75;else if(stanceOf(b)==='prone')chance*=.45;
 if(coverAgainst(s,a,b))chance*=.45;
 return Math.max(.01,chance*Math.exp(-woodlandDepth(s,a,b)*.35));
}
export function notices(s,a,b){if(a.team==='guard'&&b.team==='squad'&&!playerThreat(s,a)&&!(combatBehavior(a)!=='fight'&&(s.engaged||['player','enemy'].includes(s.phase))))return false;
 if(s.rules?.awareness)return canSee(s,a,b);
 const records=a.noticed||(a.noticed={}),old=records[b.id];
 if(!canSee(s,a,b)){delete records[b.id];return false;}
 if(old?.seen)return true;
 const stamp=[s.round,a.x,a.y,levelOf(a),a.heading,a.steps,b.x,b.y,levelOf(b),b.steps].join(',');
 if(old?.stamp===stamp)return false;
 // Independent deterministic stream leaves combat RNG untouched.
 let hash=(s.perceptionSeed??1947)>>>0;
 for(const c of a.id+':'+b.id+':'+stamp)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 hash^=hash>>>16;hash=Math.imul(hash,0x45d9f3b);hash^=hash>>>16;
 const seen=(hash>>>0)/4294967296<detectionChance(s,a,b);records[b.id]={stamp,seen};return seen;
}
// Every trigger that can put several guards in Alert at once (a refresh's sightings, a gunshot's alarm ring) is one cascade: a listener that
// declined a shout is not re-asked by the next guard the same trigger alerts.
export function refresh(s,...args){return withCombatQueries(s,()=>refreshQueryAction(s,...args));}
function refreshQueryAction(s){return cascade(s,()=>refreshNow(s));}
function refreshNow(s){settleSquadAmmo(s);synchronizeFoliage(s);settleCivilianFear(s);updateCliffSupports(s);
 updateAwareness(s,{geometry:geometricPerceive,zones:visibleZones});
 const oldDetected=s.detected,oldVisible=s.visible,oldGlimpses=s.glimpses||{};
 for(const u of s.units){const at=u.x+','+u.y+','+levelOf(u);u.moved=!!u.fired||u.lastAt!==at;u.lastAt=at;u.fired=false;}s.visible=terrainVisibility(s,squad(s));s.detected=new Set(guards(s).filter(g=>squad(s).some(p=>canSee(s,p,g))).map(g=>g.id));
 s.glimpses={};for(const g of guards(s))if(!s.detected.has(g.id)&&squad(s).some(p=>perceive(s,p,g)===1))s.glimpses[g.id]=s.rules?.awareness?approximate(g):{x:g.x,y:g.y,z:levelOf(g)};
 for(const g of guards(s))if(s.detected.has(g.id))s.contacts[g.id]={x:g.x,y:g.y,z:levelOf(g),...(g.towerPost?{towerElevation:TOWER_HEIGHT}:{})};
 if(s.queue.length&&[...s.detected].some(id=>!oldDetected.has(id)&&playerThreat(s,unit(s,id)))){s.queue=[];log(s,'Movement stopped: new opponent spotted.');}
 else if(s.queue.length&&Object.keys(s.glimpses).some(id=>!oldGlimpses[id]&&!oldDetected.has(Number(id)))){s.queue=[];log(s,'Movement stopped: movement glimpsed.');}
 if(s.visible!==oldVisible||s.seen.size<s.visible.size)for(const k of s.visible)s.seen.add(k);
 if(!squad(s).length){if(!s.defeat){const escaped=s.units.filter(u=>u.team==='squad'&&u.away),converted=[];for(const u of s.units.filter(u=>u.team==='squad'&&!u.away&&!['captured','dead','quit'].includes(u.casualty))){u.casualty=u.casualty==='stable'?'captured':'dead';u.bleedTurns=0;u.recoveryTurns=0;u.ap=0;u.overwatch=null;syncWeapons(u);converted.push(u);}
  if(s.rules?.social&&escaped.length)for(const u of converted)for(const line of partnerLost(s.units,u,u.casualty))log(s,line);/* the crossers who escaped grieve the comrades the lost map cost; a defeat nobody escaped settles nothing */const fresh=s.units.filter(u=>u.team==='squad'&&!u.recorded&&['captured','dead'].includes(u.casualty));s.defeat={location:s.definition.name,round:s.round,escaped:escaped.map(u=>({id:u.id,name:u.name})),captured:fresh.filter(u=>u.casualty==='captured').map(u=>structuredClone(u)),dead:fresh.filter(u=>u.casualty==='dead').map(u=>({id:u.id,name:u.name}))};for(const u of fresh)u.recorded=true; // a loss lists only the comrades it cost; earlier losses on the roster stay recorded once
log(s,converted.length===0&&s.units.some(u=>u.team==='squad'&&u.casualty==='quit')?'The squad has walked out.':s.defeat.captured.length+' captured / '+s.defeat.dead.length+' dead.'+(escaped.length?' '+escaped.length+' crossed the map edge.':''));}s.phase='lost';s.queue=[];return;}
 if(!alive(unit(s,s.selected)))s.selected=squad(s)[0].id;
 s.exposed={};for(const g of guards(s))if(s.detected.has(g.id)){const zones=new Set();for(const u of squad(s))if(canSee(s,u,g))for(const zone of visibleZones(s,u,g))zones.add(zone);s.exposed[g.id]=[...zones];}
 const pending=s.units.some(u=>['bleeding','stable'].includes(u.casualty)||alive(u)&&u.burningTurns>0)||(s.fires?.length||0)>0; // a stabilized comrade is still down: the turns keep coming until it stands
 if(!guards(s).some(g=>playerThreat(s,g))&&!pending&&!s.engaged){if(s.phase!=='won'){log(s,'Local map cleared. Explore or gather at the travel marker.');s.queue=[];}s.phase='won';s.alerted=new Set();s.engaged=false;contactEnds(s);if(!squad(s).length)return refreshNow(s);/* the last body walked out: the re-entry declares the defeat (review round 2) */s.revision++;return;}
 for(const g of guards(s))reconcile(s,g);
 for(const g of guards(s)){const targets=squad(s).filter(p=>notices(s,g,p));if(targets.length)identified(s,g,targets.sort((a,b)=>distance(g,a)-distance(g,b))[0]);
  else{const moving=squad(s).filter(p=>perceive(s,g,p)===1);if(moving.length)suspect(s,g,approximate(moving.sort((a,b)=>distance(g,a)-distance(g,b))[0]));}}
 // Hearing or seeing something is not a fight yet: only a guard that can bring a comrade under fire within two turns, a pending casualty or fire,
 // or the squad itself opening fire (engaged, until it ends that turn) holds turn mode.
 const wasAlert=s.alerted||new Set(),nowAlert=new Set(guards(s).filter(g=>playerThreat(s,g)&&active(g)).map(g=>g.id));s.alerted=nowAlert;
 const fresh=guards(s).filter(g=>nowAlert.has(g.id)&&!wasAlert.has(g.id)),heard=()=>fresh.some(g=>squad(s).some(p=>canSee(s,g,p)))?'You have been seen, but they are too far to reach you yet.':'You are pretty sure someone heard that.';
 const threat=guards(s).some(g=>playerThreat(s,g)&&g.alert&&threatens(s,g)&&(!s.rules?.awareness||['player','enemy'].includes(s.phase)||squad(s).some(p=>canSee(s,p,g)||canSee(s,g,p)))),contact=pending||!!s.engaged||threat;let warned=false;
 if(['explore','won'].includes(s.phase)&&contact){s.phase='player';s.round++;s.queue=[];if(s.rules?.social&&!s.fight)s.fight={casualty:false}; // G5: a clean win lifts the squad
  // AP is live across the engagement: a fight that resumes while guards were already alert continues with the AP the squad has; a fresh fight gets a full turn. Guards always start theirs full.
  // freshFight is set by entering a map and by Area clear, so a fight on a new map is fresh even when its guards kept an alert from before.
  const resumed=wasAlert.size>0&&!s.freshFight;s.freshFight=false;for(const u of s.units)if(u.burningTurns)u.ap=0;else if(u.team==='guard'||!resumed)u.ap=turnAP(u);
  log(s,'CONTACT / Squad turn. Movement costs 2 / 4 / 8 AP per tile: standing / kneeling / prone.');
}
 else if((s.phase==='player'||s.phase==='enemy')&&!contact){
  // A drop during the guard phase ends that round: the squad's next turn is a fresh one, exactly as if the guards had finished.
  if(s.phase==='enemy')newRound(s);
  s.phase='explore';s.queue=[];
  if(nowAlert.size){warned=fresh.length>0;log(s,(warned?heard()+' ':'Area quiet: ')+'No one can reach you within two turns: real time resumes, alerted guards are still coming; actions other than walking still cost AP.');}
  else{for(const u of squad(s))u.overwatch=null;s.freshFight=true;log(s,'Area clear. Real-time exploration resumed.');contactEnds(s);if(!squad(s).length)return refreshNow(s);}}
 // The last alerted guard stood down while the map was already in real time: the same all-clear, without a phase change.
 else if(['explore','won'].includes(s.phase)&&wasAlert.size&&!nowAlert.size&&!s.engaged){for(const u of squad(s))u.overwatch=null;s.freshFight=true;log(s,'Area clear. The alert is over.');contactEnds(s);if(!squad(s).length)return refreshNow(s);}

 // Guards newly alerted by a report or a sighting who cannot reach the squad get their warning whatever the phase did (a shot of your own may have opened the turn).
 if(fresh.length&&!threat&&!warned)log(s,heard());
 if(!alive(unit(s,s.selected)))s.selected=squad(s)[0].id;
 s.revision++;
}
// AP is charged in turn mode and, in real time, whenever a guard on the map is alert or the squad has opened fire: the engagement is one economy;
// only walking stays free in real time (both sides walk). See RULES.md, Local alerts and combat pacing.
export const combatCosts=s=>s.phase==='player'||s.phase==='enemy'||(['explore','won'].includes(s.phase)&&((s.alerted?.size||0)>0||!!s.engaged));
export function canControl(s,u){return u&&alive(u)&&!u.burningTurns&&u.team==='squad'&&['explore','player','won'].includes(s.phase);}
// Downed comrades left on a map when the last standing squad member crosses its edge meet the defeat rule: stabilized are captured, bleeding die.
// G5: the end of a contact (the map won, or the last alerted guard stood down) lifts every merc's happiness when nobody went down, and lets a merc
// whose meter has been at zero for a day walk: quitting never happens mid-contact.
function contactEnds(s){for(const u of s.units){delete u.pinned;delete u.suppression;}for(const u of squad(s))if(u.contract?.expired)quitMerc(s,u,'contract'); // a contract that ran out mid-fight ends with the contact (world.js settleContracts)
 for(const u of squad(s))if(u.quitPending){if(u.social.happiness===0)quitMerc(s,u);else u.quitPending=false;} // a meter that rose again before the end is no longer quitting
 if(s.fight){if(!s.fight.casualty&&cleanWin(squad(s)))log(s,'A clean fight: the squad\'s spirits lift.');s.fight=null;}}
// Quitting is a roster state beside captured and dead: the merc keeps its skills and history in the record, takes what it holds, and is off the map.
export function quitMerc(s,u,cause='quit'){if(!onContract(u))return false;u.casualty='quit';u.quitPending=false;if(u.contract)u.contract.ended=cause;u.ap=0;u.overwatch=null;u.away=undefined;u.x=-1;u.y=-1;u.z=0;syncWeapons(u);log(s,cause==='contract'?u.name+"'s contract has ended: "+u.name+' has left the squad.':cause==='released'?u.name+' was paid off and left the squad.':u.name+' has quit the squad.');
 for(const line of partnerLost(s.units,u,'quit'))log(s,line);if(!alive(unit(s,s.selected)))s.selected=squad(s)[0]?.id??s.selected;s.revision++;return true;}
export function abandonCasualties(s){const left=[];for(const u of s.units)if(u.team==='squad'&&!u.away&&incapacitated(u)){u.casualty=u.casualty==='stable'?'captured':'dead';if(s.rules?.social)for(const line of partnerLost(s.units,u,u.casualty))log(s,line);u.bleedTurns=0;u.recoveryTurns=0;u.ap=0;u.overwatch=null;syncWeapons(u);left.push(u);}return left;}
export function setStance(s,u,stance){
 if(!Object.hasOwn(STANCES,stance)||!canControl(s,u)||s.queue.length||stanceOf(u)===stance||(combatCosts(s)&&u.ap<2))return false;
 if(combatCosts(s))u.ap-=2;u.overwatch=null;u.stance=stance;refresh(s);log(s,u.name+' is '+stance+'.');return true;
}

export function navigationState(s){const climbs=[...s.climbs,...automaticRoofClimbs(s)];const known=p=>s.seen.has(key(p.x,p.y,levelOf(p))),knowledge=new Set(s.seen);for(const p of climbs)if(known(p)||known({x:p.x+p.dx,y:p.y+p.dy,z:p.z+1}))for(const q of [p,{x:p.x,y:p.y,z:p.z+1},{x:p.x+p.dx,y:p.y+p.dy,z:p.z+1}])knowledge.add(key(q.x,q.y,q.z));return {...s,knowledge,edges:Object.fromEntries(Object.entries(s.edges).filter(([k])=>edgeCells(k).some(known))),props:s.props.filter(p=>propCells(p).some(known)),stairs:s.stairs.filter(p=>known(p)||known({...p,z:p.z+1})),climbs:climbs.filter(p=>known(p)||known({x:p.x+p.dx,y:p.y+p.dy,z:p.z+1})),units:s.units.filter(p=>p.team==='squad'||s.detected.has(p.id))};}
export function navigationPath(s,u,x,y,z=levelOf(u),options){if(!inBounds(x,y,z))return null;return pathTo(navigationState(s),u,x,y,z,options);}

export function move(s,u,x,y,z=levelOf(u)){
 if(!canControl(s,u))return false;const path=navigationPath(s,u,x,y,z,{partial:true});if(!path?.length)return false;
 if(!canMoveStamina(u,path[0])||s.phase==='player'&&path[0].cost>u.ap)return false;
 const end=path.at(-1),goal={x:end.x,y:end.y,z:end.z};
 if(goal.x!==x||goal.y!==y||goal.z!==z)log(s,'Route blocked: walking as close as possible, then stopping.');
 u.overwatch=null;s.queue=path.map(p=>({id:u.id,...p,goal}));return true;
}
export function stepMovement(s,...args){return withCombatQueries(s,()=>stepMovementQueryAction(s,...args));}
function stepMovementQueryAction(s){
 if(!s.queue.length||!['explore','player','won'].includes(s.phase))return false;
 if(s.queue[0].group)return stepGroupMovement(s);
 let step=s.queue[0];const actor=unit(s,step.id);if(step.goal&&canControl(s,actor)){const goal=step.goal,path=navigationPath(s,actor,goal.x,goal.y,goal.z,{partial:true});if(!path?.length){s.queue=[];log(s,'Route stopped: destination reached or no discovered route remains.');return false;}const end=path.at(-1);if(end.x!==goal.x||end.y!==goal.y||end.z!==goal.z){Object.assign(goal,{x:end.x,y:end.y,z:end.z});log(s,'Route blocked: walking as close as possible, then stopping.');}s.queue=path.map(p=>({id:actor.id,...p,goal}));}step=s.queue.shift();const u=unit(s,step.id),currentStep=u&&movementNeighbors(s,u).find(p=>p.x===step.x&&p.y===step.y&&p.z===levelOf(step));if(!canControl(s,u)||!currentStep||!canMoveStamina(u,currentStep)||occupant(s,step.x,step.y,levelOf(step))||(movementCosts(s,currentStep)&&u.ap<currentStep.cost)){s.queue=[];return false;}
 step=currentStep;if(!commitClimb(s,u,step)){refresh(s);return true;}recordSimpleTraversal(s,u,step);recordCliffTraversal(s,u,step);recordRoofTraversal(s,u,step);spendMovement(u,step);openDoorBetween(s,u,step);u.heading=headingTo(u,step);u.facing=(step.x-u.x)-(step.y-u.y)>=0?1:-1;u.x=step.x;u.y=step.y;u.z=levelOf(step);u.steps++;u.overwatch=null;emitNoise(s,u,u.sneaking?3:10);if(movementCosts(s,currentStep))u.ap-=currentStep.cost;enterFire(s,u);refresh(s);return true;
}
export function coverAgainst(s,a,b){
 const occupied=PROPS[propAt(s,b.x,b.y,levelOf(b))?.kind];
 if(occupied&&!occupied.solid&&occupied.cover>0)return true;
 const dx=a.x-b.x,dy=a.y-b.y;if(dx===0&&dy===0)return false;const cells=[];if(Math.abs(dx)>=Math.abs(dy)*.5)cells.push([b.x+Math.sign(dx),b.y]);if(Math.abs(dy)>=Math.abs(dx)*.5)cells.push([b.x,b.y+Math.sign(dy)]);
 return cells.some(([x,y])=>tile(s,x,y,levelOf(b))==='crate'||PROPS[propAt(s,x,y,levelOf(b))?.kind]?.cover>0||(EDGES[s.edges[edgeBetween(b,{x,y,z:levelOf(b)})]]?.cover||0)>0);
}
const retaliationToken=Symbol('retaliation');
export function previewAttack(s,a,b,burst=false,zone='torso',token=null,aimLevel='hip'){if(a?.team==='guard'&&!playerThreat(s,a))return {ok:false,reason:'Character does not fight the player'};
 if(!a||!b||!alive(a)||!alive(b)||a.team===b.team&&token!==retaliationToken)return {ok:false,reason:'Choose a living opponent'};
 if(b.structure){
  if(!s.props.some(p=>intactSite(p)&&siteId(p)===b.id))return {ok:false,reason:'Structure already destroyed'};
  if(WEAPONS[a.weapon].incendiary)return flamePreview(s,a,{...b,ground:true},WEAPONS[a.weapon],combatCosts(s));
  if(WEAPONS[a.weapon].blast)return explosivePreview(s,a,b,WEAPONS[a.weapon]);
  return {ok:false,reason:'Use a flamethrower or explosive weapon',cost:WEAPONS[a.weapon].cost,rounds:1};
 }
 if(b.barrel){
  if(!presentBarrel(s,b))return {ok:false,reason:'Barrel already destroyed'};
  if(WEAPONS[a.weapon].incendiary)return flamePreview(s,a,{...b,ground:true},WEAPONS[a.weapon],combatCosts(s));
  if(WEAPONS[a.weapon].blast)return explosivePreview(s,a,b,WEAPONS[a.weapon]);
  return previewBarrelAttack(s,a,b,attackWeapon(a,WEAPONS,burst),combatCosts(s),burst,aimLevel);
 }
 if(WEAPONS[a.weapon].incendiary){
  const p=flamePreview(s,a,b,WEAPONS[a.weapon],combatCosts(s));
  if(!b.ground&&!canAimAt(s,a,b))return {...p,ok:false,reason:'Target not visible'};
  return p;
 }
 if(WEAPONS[a.weapon].blast)return explosivePreview(s,a,b,WEAPONS[a.weapon]);
 if(b.ground)return previewGroundFire(s,a,b,attackWeapon(a,WEAPONS,burst),combatCosts(s),burst,aimLevel);
 if(!Object.hasOwn(AIM_ZONES,zone))return {ok:false,reason:'Choose an aim location'};
 const aiming=shotAim(attackWeapon(a,WEAPONS,burst),aimLevel,burst);if(!aiming)return {ok:false,reason:'Choose an aim level'};
 const aim=AIM_ZONES[zone];
 const w=attackWeapon(a,WEAPONS,burst),rounds=burst?(w.burstRounds||1):1,cost=aiming.cost,melee=w.mag===0,range=melee?(levelOf(a)===levelOf(b)?Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y)):Infinity):Math.hypot(a.x-b.x,a.y-b.y);
 const visible=token!==retaliationToken&&a.team==='squad'?squad(s).some(p=>canSee(s,p,b)):canSee(s,a,b);
 const cover=!melee&&coverAgainst(s,a,b),heightCover=!melee&&levelOf(b)>levelOf(a)&&(a.x!==b.x||a.y!==b.y),coverPenalty=cover?25:heightCover?15:0,rangePenalty=melee?0:Math.max(0,levelOf(b)-levelOf(a)),effectiveRange=Math.max(0,w.range-rangePenalty);
 const chance=Math.max(supportsAim(w)?5:10,Math.min(95,weaponAccuracy(a)+(melee?10:0)+(w.accuracy||0)+aim.accuracy+aiming.accuracy-(melee?0:Math.max(0,range+rangePenalty-3)/Math.max(1,w.range-3)*(w.rangeLoss??25))-coverPenalty-(melee?0:accuracyPenalty(a))));
 let reason='';
 if(a.pinned&&aiming.level!=='hip')reason='Pinned: only hip fire available';else if(heldWeaponJammed(a))reason='Weapon jammed: clear jam with Reload';else if(a.burningTurns>0)reason='On fire: running in panic';else if(melee&&zone!=='torso')reason='Aimed shots require a firearm';else if(!visible)reason='Target not visible';else if(a.team!=='squad'&&!inCone(a,b))reason='Outside personal sight cone';else if(range>effectiveRange)reason='Out of range';else if(!lineOfSight(s,a,b))reason='Line of fire blocked';else if(!canAimAt(s,a,b))reason='Selected merc has not identified this target';else if(!melee&&!zoneVisible(s,a,b,zone))reason=AIM_ZONES[zone].label+' hidden by cover';else if(w.mag&&!handAttackReady(a,w,rounds))reason=w.dual?'Both pistols must be loaded and unjammed':'Reload required';else if(combatCosts(s)&&a.ap<cost)reason='Not enough AP';
 let obstruction=null;
 if(!reason&&!melee&&!w.incendiary){const path=bulletTrajectory(s,a,b,{accurate:true,zone,reach:w.range*1.5},()=>0);if(path.unitId!==b.id){const unit=s.units.find(u=>u.id===path.unitId);obstruction=unit?{kind:'unit',id:unit.id,name:unit.name,friendly:unit.team===a.team}:{kind:path.kind};}}
 return {ok:!reason,reason,cost,rounds,...w.dual?{dualWeapons:handWeapons(a)}:{},aimLevel:aiming.level,chance:Math.round(chance),shotChances:Array.from({length:rounds},(_,i)=>roundChance(chance,i)),cover,heightCover,coverPenalty,rangePenalty,damage:damageAfterResistance(b,Math.round(weaponDamage(w,range)*aim.damage)),rawDamage:Math.round(weaponDamage(w,range)*aim.damage),pellets:w.pellets||1,zone,range:effectiveRange,tankChance:melee?0:tankExplosionChance(b,zone),obstruction};
}
function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
function combatDamage(s,u,damage,fatal=false,source=null){provokeCharacter(s,u,source);
 const living=alive(u),before=u.hp;if(u.hp>=u.maxHp)delete u.legWound;u.hp=Math.max(0,u.hp-damage);injuryStrain(u,before-u.hp);if(u.team==="guard"&&combatBehavior(u)!=="fight"&&before>u.hp){u.npcFrightened=true;u.npcFearTicks=ALERT_ROUNDS*REALTIME_ROUND_TICKS;u.civilianFlee=true;if(source)u.threat={x:source.x,y:source.y,z:levelOf(source)};}
 if(u.team==='guard'&&living&&u.hp>0)struck(s,u,source);
 if(u.hp>0)return;
 if(living)killRelief(source,u);
 if(u.team==='guard'&&living&&s.rules?.social)mourn(s,u,source);
 if(u.team==='guard'&&living&&!u.lootDropped){delete s.contacts[u.id];awardCombatXP(s);s.loot.push({x:u.x,y:u.y,z:levelOf(u),body:u.id,...(u.towerPost?{towerPost:structuredClone(u.towerPost)}:{}),searched:false,items:rollLoot(s,u)});u.pack=[];u.lootDropped=true;}
 if(u.team==='squad'&&(living||fatal&&incapacitated(u))){u.casualty=fatal?'dead':s.difficulty==='easy'?'stable':'bleeding';u.bleedTurns=u.casualty==='bleeding'?6:0;u.ap=0;u.overwatch=null;s.queue=[];u.recoveryTurns=0;u.burningTurns=0;if(living)collapse(u);if(u.casualty==='stable')beginRecovery(s,u);if(s.fight)s.fight.casualty=true;if(u.casualty==='dead'&&s.rules?.social)for(const line of partnerLost(s.units,u,'dead',source))log(s,line);}
}
function ignite(s,u){
 if(!alive(u)||u.burningTurns>0)return;
 u.burningTurns=3;u.ap=0;u.overwatch=null;u.stance='standing';u.sneaking=false;u.running=false;
 if(u.team==='guard'&&stateOf(u)!=='broken')setState(s,u,'alert');
 recordBurn(s,u,'ignite');s.queue=[];log(s,u.name+' is on fire / 3 panic turns before burning to ash.');
}
export function enterFire(s,u){if(s.fires?.some(p=>p.x===u.x&&p.y===u.y&&p.z===levelOf(u)))ignite(s,u);}
function panicRun(s,u){
 if(!alive(u)||!u.burningTurns)return;
 const fireRoute=[firePoint(u)],heading=Math.floor(random(s)*8)*45;
 for(let step=0;step<3;step++){
  const choices=movementNeighbors(s,u).filter(p=>levelOf(p)===levelOf(u)&&!occupant(s,p.x,p.y,p.z));
  if(!choices.length)break;
  choices.sort((a,b)=>Math.cos((headingTo(u,b)-heading)*Math.PI/180)-Math.cos((headingTo(u,a)-heading)*Math.PI/180));
  const p=choices[0];openDoorBetween(s,u,p);u.heading=headingTo(u,p);u.facing=(p.x-u.x)-(p.y-u.y)>=0?1:-1;u.x=p.x;u.y=p.y;u.steps++;fireRoute.push(firePoint(u));emitNoise(s,u,15);
 }
 recordBurn(s,u,'panic',fireRoute);u.ap=0;u.fireActedRound=s.round;
 log(s,u.name+' runs in panic / '+u.burningTurns+' turns of fire.');
}
function expireBurn(s,u){
 u.burningTurns=0;if(!alive(u))return;
 combatDamage(s,u,Math.max(u.hp,1),true);recordBurn(s,u,'ash');log(s,u.name+' burned to ash.');
}
function finishFireRound(s){
 for(const u of s.units)if(u.burningTurns>0&&u.fireActedRound===s.round){u.burningTurns--;if(!u.burningTurns)expireBurn(s,u);}
 s.fires=(s.fires||[]).map(p=>({...p,turns:p.turns-1})).filter(p=>p.turns>0);
}
const fuelHooks={damage:combatDamage,ignite,burn:recordBurn};
function explodeTanks(s,wearer,source=null){
 const wornWeapon=wearer.weapon;wearer.tanksExploded=true;wearer.ammo.flamethrower=0;
 wearer.pack=wearer.pack.filter(i=>i.kind!=='flamethrower');wearer.slots=wearer.slots.map(id=>id==='flamethrower'?null:id);
 if(wearer.weapon==='flamethrower')wearer.weapon='hands';wearer.overwatch=null;
 const result=applyFuelBlast(s,wearer,fuelHooks,source,wearer),receipt=recordBurn(s,wearer,'tank');receipt.weapon=wornWeapon;receipt.fires=result.fires;
 log(s,wearer.name+"'s fuel tanks exploded / "+result.victims.length+' caught in blast.');
 return {x:wearer.x,y:wearer.y,z:levelOf(wearer),h:unitBaseHeight(wearer)+.8,kind:'tank',unitId:wearer.id,fireSequence:receipt.sequence,burns:result.burns,structures:result.structures,before:result.before};
}
function appendBarrelBlasts(s,event,explosions,targets,source){
 const standing=s.units.filter(alive),blasts=detonateBarrels(s,targets,fuelHooks,source);
 for(const blast of blasts){event.hit=true;event.explosions.push(blast);explosions.push(blast);(event.burns??=[]).push(...blast.burns);log(s,'Explosive barrel detonated.');}
 for(const u of standing)if(!alive(u)&&!event.downed.includes(u.id))event.downed.push(u.id);
}

function settleAttackStructures(s,event,source){
 const receipts=[...(event.structures||[]),...event.explosions.flatMap(e=>e.structures||[])],fallen=settleStructureCollapse(s,receipts,{hurt:(s,u,damage)=>combatDamage(s,u,damage,false,source),fatal:(s,u)=>combatDamage(s,u,Math.max(u.hp,1),true,source)});
 event.falls=fallen.falls;
 if(event.grenade){for(const e of event.explosions)mergeScenery(event.grenade.scenery,e.before);mergeScenery(event.grenade.scenery,fallen.before);}
 for(const f of fallen.falls){const u=s.units.find(u=>u.id===f.id);if(u.hp<=0&&!event.downed.includes(u.id))event.downed.push(u.id);if(u.burningTurns||u.burnedRemains){recordBurn(s,u,u.hp>0?'ignite':'ash');(event.burns??=[]).push(u.id);}log(s,u.name+' fell to level '+(f.to.z+1)+'.');}
}
export function attack(s,...args){return withCombatQueries(s,()=>attackQueryAction(s,...args));}
function attackQueryAction(s,a,b,burst=false,byAI=false,zone='torso',reaction=false,aimLevel='hip'){
 if(s.queue.length)return false;
 if(reaction?!(s.phase==='enemy'&&a?.team==='squad'&&alive(a)&&!a.burningTurns&&a.overwatch?.weapon===a.weapon&&a.overwatch.heading===a.heading&&!burst&&zone==='torso'&&withinOverwatch(a,b)&&canSee(s,a,b)):byAI?!(s.phase==='enemy'&&a?.team==='guard'&&alive(a)&&!a.burningTurns):!canControl(s,a))return false;
 if(byAI&&!playerThreat(s,a))return false;const p=previewAttack(s,reaction?{...a,ap:WEAPONS[a.weapon].cost}:a,b,burst,zone,null,reaction?'hip':aimLevel);if(!p.ok)return false;a.overwatch=null;
 a.fired=true;
 // Orienting reflex: an attack from outside the victim's field spins it toward the attacker (turning is free).
 if(!b.ground&&!b.barrel&&!b.structure&&!inCone(b,a)){b.heading=headingTo(b,a);b.facing=Math.cos(b.heading*Math.PI/180)-Math.sin(b.heading*Math.PI/180)>=0?1:-1;log(s,b.name+' spins toward the attack.');}
 if(b.team==='guard')targeted(s,b,a);
 // A squad attack from real time opens a turn (engaged holds it until the squad ends that turn); the shot is re-checked against the AP the turn actually has.
 if(['explore','won'].includes(s.phase)){s.engaged=true;refresh(s);if(s.phase==='player'&&a.team==='squad'&&a.ap<p.cost){log(s,a.name+': not enough AP to fire.');return false;}}
 spendStamina(a,WEAPONS[a.weapon].mag?2:6);if(!reaction&&combatCosts(s))a.ap-=p.cost; // no charge on a map with nothing left to fight (a blast on a won map)
 const trajectories=[],explosions=[],sequence=[];
 // A stack suspends the current burst while a reply resolves; ammunition bounds chains.
 const frames=[{a,b,p,zone,left:p.rounds,weapon:a.weapon,aim:{...b},reply:false,impactAction:beginGunshotAction(s)}];
 cascade(s,()=>{while(frames.length){ // one attack, replies included, is one trigger for the guards it alerts
  const f=frames.at(-1);if(f.p.dualWeapons&&f.left)f.weapon=f.p.dualWeapons[f.p.rounds-f.left];const shooter=f.a,target=f.b,w=WEAPONS[f.weapon];
  if(!f.left||!alive(shooter)||shooter.burningTurns||w.mag&&shooter.ammo[f.weapon]<1){frames.pop();continue;}
  if(weaponJams(s,shooter,f.weapon,w)){shooter.overwatch=null;log(s,shooter.name+': '+w.short+' jammed. Clear jam before firing.');frames.pop();continue;}
  f.left--;shooter.overwatch=null;shooter.heading=headingTo(shooter,f.aim);shooter.facing=(f.aim.x-shooter.x)-(f.aim.y-shooter.y)>=0?1:-1;
  emitNoise(s,shooter,w.mag?30:2);if(w.mag)alarm(s,shooter,w.range*2);if(w.mag)shooter.ammo[f.weapon]--;
  const shotChance=w.incendiary?100:roundChance(f.p.chance,f.p.rounds-f.left-1);
  const ballistic=w.mag&&!w.incendiary,shotRoll=supportsAim(w)?rollFirearmShot(shotChance,()=>random(s)):null;
  const accurate=w.incendiary?false:shotRoll?shotRoll.rolledHit:w.blast?false:random(s)*100<shotChance;
  const pellets=w.pellets?shotgunTrajectories(s,shooter,f.aim,{accurate,zone:f.zone,chance:shotChance,shotRoll,precision:w.precision??80,reach:w.range*1.5,pellets:w.pellets},()=>random(s)):null;
  const shot=pellets?pellets[0]:w.blast?explosiveTrajectory(s,shooter,f.aim,w,f.p,()=>random(s)):ballistic?bulletTrajectory(s,shooter,f.aim,{accurate,zone:f.zone,chance:shotChance,shotRoll,precision:w.precision??80,burst:f.p.rounds>1,reach:w.range*1.5},()=>random(s)):null;
  if(ballistic&&!target.ground&&!target.barrel&&!target.structure&&alive(target)){
   // A clear aimed ray threatens the target even if this round misses. A solid
   // obstacle intercepting that ray prevents distant fire from pinning them.
   const threat=bulletTrajectory(s,shooter,f.aim,{accurate:true,zone:f.zone,reach:w.range*1.5},()=>0);
   if(incomingFire(s,target,shooter,threat.unitId===target.id||shot?.unitId===target.id,()=>random(s)))log(s,target.name+' is pinned by incoming fire.');
  }
  if(shot)trajectories.push(...(pellets||[shot]));
  const victim=ballistic?s.units.find(u=>u.id===shot.unitId):accurate&&alive(target)?target:null;
  const event={shooter:shooter.id,target:target.id,ax:shooter.x,ay:shooter.y,bx:f.aim.x,by:f.aim.y,az:levelOf(shooter),bz:levelOf(f.aim),hit:!!victim,incendiary:!!w.incendiary,trajectories:pellets||(shot?[shot]:[]),explosions:[],downed:[],reply:f.reply,shotChance,shotRoll,weapon:f.weapon,...f.p.dualWeapons?{dual:true}: {}};if(w.thrown)event.grenade={shooter:structuredClone(shooter),release:1.92,recovery:4.6};sequence.push(event);if(ballistic&&!w.blast)stampGunshotEvent(event,f.impactAction,shooter,s.units);
  const flame=w.incendiary?flameShape(s,shooter,f.aim,w):null;
  const flameStructures=flame?planFlameStructureDamage(s,flame,w.damage):[],flameBarrelHits=flame?flameBarrels(s,flame):[];
  const flameHits=flame?flameVictims(s,shooter,flame).map(unit=>({unit,zone:'torso',damage:Math.max(1,unit.hp)})):null;
  if(flame){event.flame=flame;event.sites=flameStrategicSites(s,flame);event.hit=flameHits.length>0||event.sites.length>0;log(s,shooter.name+' sprays a cone of flame.');}
  const structureResult=flame?commitStructureDamage(s,flameStructures):w.blast?null:projectileStructureDamage(s,pellets||(shot?[shot]:[]),p=>weaponDamage(w,p.distance));
  event.structures=structureResult?.receipts||[];
  const blastResult=w.blast?detonate(s,shot,w):null;
  if(blastResult){event.structures=blastResult.structures||[];if(event.grenade)event.grenade.scenery=blastResult.before;event.explosions.push(blastResult.blast);explosions.push(blastResult.blast);event.sites=blastResult.sites;event.hit=blastResult.hits.length>0||event.sites.length>0;log(s,`${shooter.name}: ${w.short} detonated / ${blastResult.blast.destroyed} structures destroyed.`);}
  if(event.structures.length){event.hit=true;for(const r of event.structures)log(s,r.kind.replaceAll('-',' ')+': '+(r.destroyed?'destroyed':r.hp+'/'+r.maxHp+' HP')+'.');}
  const barrelHits=[...(pellets||(shot?[shot]:[])).filter(p=>p.propId).map(p=>p.propId),...(blastResult?.barrels||[]),...flameBarrelHits];
  appendBarrelBlasts(s,event,explosions,barrelHits,shooter);
  if(!victim&&!blastResult&&!pellets&&!flame){settleAttackStructures(s,event,shooter);if(!event.hit)log(s,`${shooter.name} → ${target.name}: miss${f.reply?' / retaliation':''}.`);continue;}
  const pelletHits=pellets?.map(p=>({trajectory:p,unit:s.units.find(u=>u.id===p.unitId),zone:p.zone,damage:Math.round(w.damage*AIM_ZONES[p.zone||f.zone].damage*(shooter.team==='guard'?.65:1))})).filter(p=>p.unit);
  if(pellets){event.hit=event.hit||pelletHits.length>0;if(!event.hit)log(s,`${shooter.name} → ${target.name}: pellets missed.`);}
  const impacts=flameHits||(blastResult?blastResult.hits:pelletHits)||[{unit:victim,damage:Math.round(Math.round(weaponDamage(w,Math.hypot(shooter.x-victim.x,shooter.y-victim.y))*AIM_ZONES[shot?.zone||f.zone].damage)*(shooter.team==='guard'&&!w.incendiary?.65:1))}];
  const reacted=new Set();
  for(const {unit:victim,damage:rawAmount,zone:pelletZone,trajectory=shot}of impacts){if(!alive(victim)&&!incapacitated(victim))continue;const amount=flame?rawAmount:damageAfterResistance(victim,rawAmount);
  const hitZone=w.blast?'torso':pelletZone||shot?.zone||f.zone;damageHeldWeapon(s,victim,hitZone,rawAmount);
  if(victim.team==='guard')targeted(s,victim,shooter);
  const tankChance=w.mag?tankExplosionChance(victim,hitZone):0,standing=s.units.filter(alive);
  if(tankChance>0&&random(s)<tankChance){const blast=explodeTanks(s,victim,shooter);explosions.push(blast);event.explosions.push(blast);(event.burns??=[]).push(...blast.burns);appendBarrelBlasts(s,event,explosions,s.props.filter(p=>isExplosiveBarrel(p)&&fuelBlastReaches(victim,p)),shooter);}
  else {const bodyImpact=ballistic&&!w.blast?prepareBodyImpact(event,f.impactAction,trajectory,victim,amount):null;combatDamage(s,victim,amount,!!w.incendiary||incapacitated(victim)||!!bodyImpact?.fatalHead,shooter);commitBodyImpact(event,bodyImpact,victim);if(!w.blast&&hitZone==='legs'&&amount>0)woundLeg(victim);if(w.incendiary){if(victim.hp<=0)recordBurn(s,victim,'ash');ignite(s,victim);(event.burns??=[]).push(victim.id);}}
  // Units this impact put down (a tank blast can take neighbours too), so the renderer can time their fall.
  for(const u of standing)if(!alive(u)&&!event.downed.includes(u.id))event.downed.push(u.id);
  const friendly=victim.team===shooter.team;
  log(s,`${shooter.name} → ${victim.name}: ${amount} damage${friendly?' / friendly fire':''}${f.reply?' / retaliation':''}${!alive(victim)?' / down':''}.`);
  // G4: a guard under the campaign knob keeps the same ledger as a merc, so a colleague's bullet gets the same reaction (its bond starts at the archetype matrix).
  if(friendly&&victim!==shooter&&victim.social&&alive(victim)&&!reacted.has(victim.id)){reacted.add(victim.id);if(victim.team==='guard')victim.social.bonds[shooter.name]??=restingBond(victim,shooter);
   const armed=WEAPONS[victim.weapon].mag>0,turned={...victim,heading:headingTo(victim,shooter),ap:WEAPONS[victim.weapon].cost};
   const reply=armed&&alive(shooter)?previewAttack(s,turned,shooter,false,'torso',retaliationToken):{ok:false};
   const response=friendlyReaction(s,victim,shooter,amount,reply.ok);
   if(response){event.dialogue=`${response.speaker}: “${response.line}”`;log(s,event.dialogue);if(response.retaliate){frames.push({a:victim,b:shooter,p:reply,zone:'torso',left:1,weapon:victim.weapon,aim:{...shooter},reply:true,impactAction:beginGunshotAction(s)});}}
  }
 }
 settleAttackStructures(s,event,shooter);
 }});
 s.effect=sequence.length?{...sequence[0],trajectories,explosions,explosion:explosions.at(-1),sequence}:null;
 refresh(s);if(byAI)resolveOverwatch(s,a);return true;
}

export function groundTarget(point){return {...point,barrel:false,id:'ground',name:'Terrain',team:'terrain',hp:1,ground:true,weapon:'hands'};}
export function attackGround(s,u,point,burst=false,aimLevel='hip'){if(!WEAPONS[u?.weapon]?.mag)return false;return attack(s,u,groundTarget(point),burst,false,'torso',false,aimLevel);}
export const READY_SWAP_AP=2;
export function equipCost(s,u,id){return !combatCosts(s)||id==='hands'||u.weapon===id||pairedInHand(u,id)?0:!u.slots.includes(id)?3:READY_SWAP_AP;}
export function equip(s,u,id,slot=1){if(!canControl(s,u)||s.queue.length||!WEAPONS[id]||u.weapon===id||!(id==='hands'||u.pack.some(i=>i.type==='weapon'&&i.kind===id)))return false;const stored=id!=='hands'&&!u.slots.includes(id),cost=equipCost(s,u,id);if(combatCosts(s)&&u.ap<cost)return false;const slots=[...u.slots];if(stored)slots[slot===0?0:1]=id;const layout=gridLayout({...u,slots});if(!layout.ok)return false;if(combatCosts(s))u.ap-=cost;u.slots=slots;storeLayout(u,layout);u.weapon=id;if(u.stats)u.accuracy=weaponAccuracy(u);if(id==='flamethrower')delete u.tanksExploded;u.overwatch=null;log(s,u.name+' equipped '+WEAPONS[id].name+'.');return true;}
export function equipCutters(s,u,slot){
 if(!canControl(s,u)||s.queue.length||!u.wireCutters||![0,1].includes(slot)||u.slots.includes('wireCutters'))return false;
 const cost=combatCosts(s)?3:0;if(u.ap<cost)return false;
 const slots=[...u.slots],replaced=slots[slot];slots[slot]='wireCutters';const layout=gridLayout({...u,slots});if(!layout.ok)return false;
 u.ap-=cost;u.slots=slots;storeLayout(u,layout);if(u.weapon===replaced)u.weapon='hands';u.overwatch=null;
 log(s,u.name+' equipped wire cutters in the '+(slot?'secondary':'primary')+' slot.');return true;
}
export function stowWeapon(s,u,slot){if(!canControl(s,u)||s.queue.length||![0,1].includes(slot)||!u.slots[slot])return false;const slots=[...u.slots],kind=slots[slot];slots[slot]=null;const layout=gridLayout({...u,slots});if(!layout.ok)return false;u.slots=slots;storeLayout(u,layout);if(u.weapon===kind)u.weapon='hands';u.overwatch=null;log(s,'Equipment moved to backpack.');return true;}
export function arrangeInventory(s,u,key,cell){if(!canControl(s,u)||s.queue.length||!placeItem(u,key,cell))return false;log(s,'Backpack rearranged.');return true;}
export function reload(s,u,byAI=false){if(byAI?!(s.phase==='enemy'&&u?.team==='guard'&&alive(u)&&!u.burningTurns):!canControl(s,u))return false;if(heldWeaponJammed(u)){if(s.queue.length||combatCosts(s)&&u.ap<3)return false;if(combatCosts(s))u.ap-=3;delete heldWeaponItem(u).jammed;u.overwatch=null;log(s,u.name+' cleared the weapon jam.');return true;}const w=WEAPONS[u.weapon],count=Math.min(w.mag-u.ammo[u.weapon],reserve(u,u.weapon,s));if(s.queue.length||!w.mag||count<=0||(combatCosts(s)&&u.ap<3)||!consumeAmmo(u,u.weapon,count,s))return false;if(combatCosts(s))u.ap-=3;u.overwatch=null;u.ammo[u.weapon]+=count;syncWeapons(u);log(s,u.name+' reloaded '+count+' rounds.');return true;}
// Same floor, own tile or a cardinal neighbour, no barrier between: the reach for loot, bodies and hand-overs.
export const adjacentTo=(s,u,p)=>levelOf(u)===levelOf(p)&&Math.abs(unitBaseHeight(u)-unitBaseHeight(p))<.1&&Math.abs(u.x-p.x)+Math.abs(u.y-p.y)<=1&&(u.x===p.x&&u.y===p.y||!blockedEdge(s,u,p));
// Loot rolls use their own stream so a body's contents never move a bullet (see socialSeed in personalities.js for the same idea).
function lootRandom(s){s.lootSeed=(Math.imul(s.lootSeed??(s.seed^0x51ed270b),1664525)+1013904223)>>>0;return s.lootSeed/4294967296;}
// What a fallen guard's body holds, rolled once at the fall from what it actually carried: every gun with the rounds it had loaded,
// 40-100% of each reserve stack (the rest spilled, spent or ruined), nothing it did not carry. See RULES.md, Bodies as containers.
export function rollLoot(s,u){if(noEquipmentDrops(u))return [];syncWeapons(u);const items=[];for(const i of u.pack){if(i.type==='weapon'&&i.kind==='hands')continue;/* bare hands are not an item */if(!['weapon','ammo'].includes(i.type)||i.type==='ammo'&&!(i.count>0))continue;if(lootRandom(s)>=equipmentDropRate(s,u))continue;if(i.type==='weapon')items.push({type:'weapon',kind:i.kind,rounds:i.rounds,condition:weaponCondition(s,u,i),...(i.jammed?{jammed:true}:{})});else if(i.type==='ammo'&&i.count>0){const kept=Math.ceil(i.count*(.4+.6*lootRandom(s)));if(kept>0)items.push({type:'ammo',kind:i.kind,count:kept});}}return items;}
// A body is a closed container until a comrade searches it; supply piles and dropped items are open.
export const SEARCH_COST=3;
export const pileOpen=p=>(p.body===undefined&&!p.container)||!!p.searched;
export const pileContents=p=>pileOpen(p)?p.items:[];
const describeItem=i=>i.type==='weapon'?WEAPONS[i.kind].short+' ('+i.rounds+' loaded)':i.kind==='flamethrower'?i.count+' fuel bursts':i.count+' '+i.kind+' rounds';
export function searchPreview(s,u,pile){const cost=combatCosts(s)?SEARCH_COST:0;let reason='';if(!canControl(s,u)||s.queue.length)reason='Cannot act now';else if(!pile||!s.loot.includes(pile)||pileOpen(pile))reason='Nothing to search';else if(pile.container?.locked)reason='Container is locked';else if(!adjacentTo(s,u,pile))reason='Stand beside the body or container';else if(combatCosts(s)&&u.ap<cost)reason='Not enough AP';return {ok:!reason,reason,cost};}
export function searchBody(s,u,pile){const p=searchPreview(s,u,pile);if(!p.ok)return false;u.ap-=p.cost;u.overwatch=null;pile.searched=true;const who=pile.container?.name||unit(s,pile.body)?.name||'the body';log(s,u.name+' searched '+who+': '+(pile.items.length?pile.items.map(describeItem).join(', '):'nothing worth taking')+'.');refresh(s);return true;}
export function inventoryTransfer(s,u,index,mode,target=null){if(!canControl(s,u)||s.queue.length)return false;const near=p=>adjacentTo(s,u,p);if(mode==='take'){if(!s.loot.includes(target)||!near(target)||!pileOpen(target))return false;const item=target.items[index];if(!item||!accepts(u,item))return false;target.items.splice(index,1);receive(u,item);}else{syncWeapons(u);const item=u.pack[index];if(!item)return false;if(mode==='give'){if(!s.units.includes(target)||target===u||!alive(target)||target.team!=='squad'||!near(target)||!accepts(target,item))return false;receive(target,item);}else if(mode==='drop'){let pile=s.loot.find(p=>p.body===undefined&&p.x===u.x&&p.y===u.y&&levelOf(p)===levelOf(u));/* never into a closed body: a dropped item stays in the open */if(!pile){pile={x:u.x,y:u.y,z:levelOf(u),items:[]};s.loot.push(pile);}pile.items.push(item);}else return false;u.pack.splice(index,1);if(item.type==='weapon'){u.slots=u.slots.map(k=>k===item.kind?null:k);if(u.weapon===item.kind)u.weapon='hands';u.overwatch=null;}}log(s,'Inventory updated.');return true;}
export function endTurn(s,...args){return withCombatQueries(s,()=>endTurnQueryAction(s,...args));}
function endTurnQueryAction(s){if(s.phase!=='player'||s.queue.length)return false;s.engaged=false;for(const u of s.units)if(u.casualty==='bleeding'&&--u.bleedTurns<=0){u.casualty='dead';log(s,u.name+' died from blood loss.');if(s.fight)s.fight.casualty=true;if(s.rules?.social)for(const line of partnerLost(s.units,u,'dead'))log(s,line);}
 // Only a turn that began after the stabilization counts; the third such end runs the counter out, and the comrade stands when the next squad turn begins (stepEnemy), never for the guards' volley first.
 for(const u of s.units)if(recovering(u)&&s.round>u.recoveryFrom)u.recoveryTurns--;for(const u of s.units)panicRun(s,u);s.phase='enemy';s.enemyIndex=0;for(const g of guards(s)){recoverAim(g,()=>random(s));g.ap=g.burningTurns?0:turnAP(g);}log(s,'Guard turn.');return true;}
// The bookkeeping of a new squad turn: fires burn down, recovered comrades stand, AP refills (the waiting crosser's too), stress settles.
function newRound(s){recoverStamina(s,1,{combat:true});finishFireRound(s);settleRound(s);s.round++;for(const u of s.units)if(u.casualty==='stable'&&u.recoveryTurns<=0){u.casualty=null;u.hp=RECOVERY_HP;log(s,u.name+' is back on their feet / '+RECOVERY_HP+' HP, exhausted.');}for(const p of squad(s)){recoverAim(p,()=>random(s));p.ap=p.burningTurns?0:turnAP(p);p.overwatch=null;settleStress(p,2);}for(const p of s.units)if(p.team==='squad'&&p.away&&p.hp>0){recoverAim(p,()=>random(s));p.ap=turnAP(p);p.away.ap=p.ap;}/* a comrade waiting beyond the edge gets the new turn too */}
export function stepEnemy(s,...args){return withCombatQueries(s,()=>stepEnemyQueryAction(s,...args));}
function stepEnemyQueryAction(s){
 if(s.phase!=='enemy')return false;
 const g=s.units[s.enemyIndex];
 if(!g){newRound(s);s.phase='player';refresh(s);log(s,`Squad turn / ${s.round}.`);return true;}
 if(g.team==='guard'&&alive(g)&&!g.burningTurns&&combatBehavior(g)!=='fight'){civilianStep(s,g,true);s.enemyIndex++;refresh(s);return true;}if(g.team!=='guard'||!playerThreat(s,g)||!alive(g)||g.burningTurns>0||!active(g)||g.ap<1){s.enemyIndex++;return true;}
 const targets=squad(s).filter(p=>notices(s,g,p)).sort((a,b)=>distance(g,a)-distance(g,b));
 const target=targets[0];if(target)identified(s,g,target);
 if(stateOf(g)==='broken')return fleeTurn(s,g,target);
 if(stateOf(g)==='alert'){
  const targetZone=target&&['torso','head','legs','weapon'].find(zone=>previewAttack(s,g,target,false,zone).ok);
  if(targetZone){attack(s,g,target,false,true,targetZone);return true;}
  if(target&&previewAttack(s,g,target).reason==='Not enough AP'){g.ap=0;s.enemyIndex++;return true;}
  if(WEAPONS[g.weapon].mag&&(g.ammo[g.weapon]===0||heldWeaponJammed(g))&&reload(s,g,true))return true;}
 // Alert guards close on their last fix; searching guards walk the report cells, one per round, and fire only once they identify someone (Alert again).
 const dest=stateOf(g)==='alert'?g.lastKnown:searchGoal(g);
 if(!dest){if(stateOf(g)==='searching')setState(s,g,'standdown');else g.heading=(g.heading+45)%360;g.ap=0;s.enemyIndex++;refresh(s);return true;}
 if(stateOf(g)==='searching'&&atFix(s,g,dest)){g.search.index++;if(!searchGoal(g))setState(s,g,'standdown');g.ap=0;s.enemyIndex++;refresh(s);return true;}
 if(!inCone(g,dest)){g.heading=headingTo(g,dest);refresh(s);return true;}
 let best=null;
 if(stateOf(g)==='searching'){const path=boundedRoute(s,g,fixGoals(s,dest),REALTIME_NODES);if(path?.length)best=path;} // a searcher has no shot to line up: the bounded router is enough
 else for(const q of neighbors(s,dest)){if(!WEAPONS[g.weapon].mag&&distance(q,dest)>WEAPONS[g.weapon].range)continue;const path=pathTo(s,g,q.x,q.y,q.z);if(path?.length&&(!best||pathCost(path)<pathCost(best)))best=path;}
 if(best&&best[0].cost<=g.ap){const p=best[0];stepTo(s,g,p);g.ap=Math.max(0,g.ap-p.cost);refresh(s);resolveOverwatch(s,g);return true;}
 g.ap=0;s.enemyIndex++;return true;
}
// Broken: run from the last threat while the AP lasts; fire only when cornered.
function fleeTurn(s,g,target){
 const p=fleeStep(s,g);
 if(p&&p.cost<=g.ap){stepTo(s,g,p);g.ap=Math.max(0,g.ap-p.cost);refresh(s);resolveOverwatch(s,g);return true;}
 if(!p&&target){const zone=['torso','head','legs','weapon'].find(z=>previewAttack(s,g,target,false,z).ok);if(zone){attack(s,g,target,false,true,zone);return true;}}
 g.ap=0;s.enemyIndex++;return true;
}

export function stabilizePreview(s,medic,patient){const cost=medicalCost(medic);let reason='';if(!canControl(s,medic)||s.queue.length)reason='Cannot act now';else if(!s.units.includes(patient)||patient.team!=='squad'||patient.casualty!=='bleeding'||patient.bleedTurns<=0)reason='Choose a bleeding teammate';else if(!medic.medkits)reason='No medkits remaining';else if(levelOf(medic)!==levelOf(patient)||Math.abs(medic.x-patient.x)+Math.abs(medic.y-patient.y)!==1||blockedEdge(s,medic,patient))reason='Stand beside the casualty with an open edge';else if(combatCosts(s)&&medic.ap<cost)reason='Not enough AP';return {ok:!reason,reason,cost};}
export function stabilize(s,medic,patient){const p=stabilizePreview(s,medic,patient);if(!p.ok)return false;if(combatCosts(s))medic.ap-=p.cost;medic.medkits--;patient.casualty='stable';patient.bleedTurns=0;beginRecovery(s,patient);const thanks=helped(patient,medic);if(s.rules?.social)stabilizedPartner(medic,patient);if(thanks)log(s,patient.name+': '+thanks);log(s,medic.name+' stabilized '+patient.name+'.');refresh(s);return true;}
export function cutPreview(s,u,edge){let reason='';const cost=4;if(!canControl(s,u)||s.queue.length)reason='Cannot act now';else if(!u.wireCutters)reason='Wire cutters required';else if(!u.slots.includes('wireCutters'))reason='Equip wire cutters in a held slot';else if(s.edges[edge]!=='fence-chainlink')reason='Choose a chain-link fence';else if(!edgeCells(edge).some(p=>p.x===u.x&&p.y===u.y&&levelOf(p)===levelOf(u)))reason='Stand beside the fence';else if(combatCosts(s)&&u.ap<cost)reason='Not enough AP';return {ok:!reason,reason,cost};}
export function cutFence(s,u,edge){const p=cutPreview(s,u,edge);if(!p.ok)return false;if(combatCosts(s))u.ap-=p.cost;s.edges[edge]='fence-cut';invalidateMapGeometry(s);u.overwatch=null;log(s,u.name+' cut a passable opening in the fence.');refresh(s);return true;}

export function moveGroup(s,ids,leader,x,y,z=levelOf(leader)){
 const members=[...new Set(ids)].map(id=>unit(s,id));if(!members.length||!members.includes(leader)||members.some(u=>!canControl(s,u)||levelOf(u)!==levelOf(leader)))return false;
 const dx=x-leader.x,dy=y-leader.y,reserved=new Set(),orders=[];
 // Selected comrades vacate their starts; execution still checks real occupancy.
 const planning=navigationState(s);planning.units=planning.units.filter(u=>!members.includes(u));
 // Frontmost members vacate space first; every member still takes at most one step per tick.
 members.sort((a,b)=>(b.x*dx+b.y*dy)-(a.x*dx+a.y*dy));
 for(const u of members){const gx=u.x+dx,gy=u.y+dy,candidates=[];for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++)candidates.push({x:gx+ox,y:gy+oy,z,d:ox*ox+oy*oy});candidates.sort((a,b)=>a.d-b.d);let found=null;for(const goal of candidates){if(reserved.has(key(goal.x,goal.y,z)))continue;const path=inBounds(goal.x,goal.y,z)?pathTo(planning,u,goal.x,goal.y,z,{partial:true,avoidEnd:reserved}):null;if(path){if(s.phase==='player'&&path.length&&path[0].cost>u.ap)continue;const end=path.at(-1)||u;if(reserved.has(key(end.x,end.y,levelOf(end))))continue;found={x:end.x,y:end.y,z:levelOf(end)};break;}}if(!found)return false;reserved.add(key(found.x,found.y,found.z));orders.push({id:u.id,goal:found});}
 if(orders.every(o=>{const u=unit(s,o.id);return u.x===o.goal.x&&u.y===o.goal.y&&levelOf(u)===o.goal.z;}))return false;for(const u of members)u.overwatch=null;s.queue=[{group:orders}];log(s,'Group movement ordered for '+orders.length+' comrades.');return true;
}
function stepGroupMovement(s){const order=s.queue[0];let moved=false;for(const entry of order.group){const u=unit(s,entry.id),goal=entry.goal;if(!canControl(s,u)){s.queue=[];return moved;}if(u.x===goal.x&&u.y===goal.y&&levelOf(u)===goal.z)continue;const path=navigationPath(s,u,goal.x,goal.y,goal.z,{partial:true}),step=path?.[0],valid=step&&movementNeighbors(s,u).find(p=>p.x===step.x&&p.y===step.y&&p.z===step.z);if(!valid||!canMoveStamina(u,valid)||occupant(s,step.x,step.y,step.z)||(movementCosts(s,valid)&&u.ap<valid.cost)){s.queue=[];log(s,'Group stopped: route blocked or a comrade lacks AP.');return moved;}const end=path.at(-1);Object.assign(goal,{x:end.x,y:end.y,z:end.z});if(!commitClimb(s,u,valid)){refresh(s);return true;}recordSimpleTraversal(s,u,valid);recordCliffTraversal(s,u,valid);recordRoofTraversal(s,u,valid);spendMovement(u,valid);openDoorBetween(s,u,step);u.heading=headingTo(u,step);u.facing=(step.x-u.x)-(step.y-u.y)>=0?1:-1;u.x=step.x;u.y=step.y;u.z=step.z;u.steps++;u.overwatch=null;emitNoise(s,u,u.sneaking?3:10);if(movementCosts(s,valid))u.ap-=valid.cost;enterFire(s,u);moved=true;refresh(s);if(s.queue[0]!==order)return moved;}
 if(order.group.every(e=>{const u=unit(s,e.id);return u.x===e.goal.x&&u.y===e.goal.y&&levelOf(u)===e.goal.z;}))s.queue=[];return moved;
}

export function turnTo(s,u,heading){if(!canControl(s,u)||s.queue.length||!Number.isFinite(heading))return false;heading=((heading%360)+360)%360;if(heading===u.heading)return false;u.overwatch=null;u.heading=heading;u.facing=Math.cos(heading*Math.PI/180)-Math.sin(heading*Math.PI/180)>=0?1:-1;refresh(s);return true;}

export function setMovementMode(s,u,mode){
 if(!Object.hasOwn(MOVEMENT_MODES,mode)||!canControl(s,u)||s.queue.length||movementModeOf(u)===mode)return false;
 u.sneaking=mode==='sneak';u.running=mode==='run';u.overwatch=null;refresh(s);return true;
}
export function setSneaking(s,u){return setMovementMode(s,u,u.sneaking?'walk':'sneak');}
// Suspicion is approximate: the 6-tile grid cell nearest the source, shared by hearing and peripheral glimpses.
const approximate=u=>({x:Math.max(0,Math.min(W-1,Math.round(u.x/6)*6)),y:Math.max(0,Math.min(H-1,Math.round(u.y/6)*6)),z:levelOf(u),...(u.towerPost?{towerElevation:TOWER_HEIGHT}:{})});
// A gunshot alerts every guard within twice the weapon's range, squad or guard shooter alike. Guards already alert keep
// their own, better fix; the rest converge on the approximate report. Suspicion beyond that ring is unchanged (emitNoise).
export function alarm(s,shooter,radius){cascade(s,()=>{for(const g of guards(s))if(g!==shooter&&!['alert','broken'].includes(stateOf(g))&&distance(g,shooter)<=radius)setState(s,g,'alert',approximate(shooter),{quiet:true});});}
// Footsteps: a wary guard (one that has stood down once on this map) hears half again as far. An alert or broken guard keeps its own fix
// and only remembers the sound, for when it drops out of Alert.
export function emitNoise(s,u,radius){if(u.team!=='squad')return;for(const g of guards(s))if(!canSee(s,g,u)&&distance(g,u)<=radius*(g.wary?WARY_HEARING:1)*hearingScale(g)){const fix=approximate(u);if(['alert','broken'].includes(stateOf(g))){g.lastHeard=fix;g.searchSteps=suspicionSteps(g);}else suspect(s,g,fix);}}
// Guard alert states (GUARDS.md G2). One state per guard; `g.alert` stays the boolean the rest of the engine reads (true only in Alert), so
// threatens(), the enemy phase and the travel gate are unchanged. Rest, Suspicious, Alert, Searching, Stand-down and Broken are the rules;
// personality parameters (G3) will scale the numbers. Counters in rounds tick at the end of each guard phase (settleRound); in real time
// the same transitions happen on arrival and sweep (stepInvestigation), and a map the squad has left settles by the campaign clock on re-entry (settleGuards).
export const GUARD_STATES=['rest','suspicious','alert','searching','standdown','broken'];
export const ALERT_ROUNDS=3,SEARCH_CELLS=4,BROKEN_ROUNDS=2,SUSPICION_STEPS=12,SUSPICION_SWEEP=2,REALTIME_ROUND_TICKS=6,WARY_HEARING=1.5,WARY_STEPS=1.5,NERVE=1/3,STANDOFF_TRIES=3,BARK_RANGE=30;
// The boolean wins when the two disagree (fixtures and older code flip it directly), and the old suspicion fields alone still read as Suspicious.
export const stateOf=g=>{const st=g.alert?'alert':g.state&&g.state!=='alert'?g.state:'rest';return st==='rest'&&g.lastHeard&&g.searchSteps>0?'suspicious':st;};
export const active=g=>['alert','searching','broken'].includes(stateOf(g)); // holds the engagement economy and the warnings; contact itself needs Alert
const suspicionSteps=g=>Math.round(SUSPICION_STEPS*(g.wary?WARY_STEPS:1)*stepsScale(g));
const alertRoundsOf=g=>Math.max(1,Math.round(ALERT_ROUNDS*alertScale(g)));
// The resting bond between two units: the authored value for the authored mercs, the archetype matrix for everyone else.
export function restingBond(a,b){if(a?.social?.resting&&b?.name in a.social.resting)return a.social.resting[b.name];return archetypeBond(a?.archetype,b?.archetype);}
// A bark reaches the log when the squad could hear it (the old thirty-tile hearing ring) or already sees the guard.
function bark(s,g,message,state){if(!(s.detected?.has(g.id)||squad(s).some(p=>distance(g,p)<=BARK_RANGE)))return;const line=state?archetypeBark(g,state):null;if(line)log(s,g.name+': “'+line+'”');else if(message)log(s,message);}
// The neighbouring 6-tile report cells around a fix that a guard can actually stand in, nearest first.
function searchCells(s,g,center){const cells=[];for(const [dx,dy] of [[6,0],[-6,0],[0,6],[0,-6],[6,6],[-6,6],[6,-6],[-6,-6]]){const c={x:center.x+dx,y:center.y+dy,z:levelOf(center)};if(!inBounds(c.x,c.y,c.z)||!fixGoals(s,c).size)continue;cells.push(c);}
 return cells.sort((a,b)=>distance(g,a)-distance(g,b)).slice(0,Math.max(1,Math.round(SEARCH_CELLS*cellsScale(g))));}
export const searchGoal=g=>g.search?.cells[g.search.index]||null;
const atFix=(s,g,dest)=>fixGoals(s,dest).has(key(g.x,g.y,levelOf(g)));
function homeGoals(s,g){const p=g.post;if(!p)return new Set();const o=occupant(s,p.x,p.y,levelOf(p));return walkable(s,p.x,p.y,levelOf(p))&&(!o||o===g)?new Set([key(p.x,p.y,levelOf(p))]):fixGoals(s,p);}
export function setState(s,g,state,fix=null,{swept=false,quiet=false}={}){if(g.character){if(combatBehavior(g)!=="fight"&&state!=="rest"){if(!g.npcFrightened&&!["alert","broken"].includes(state))return;g.npcFrightened=true;g.npcFearTicks=ALERT_ROUNDS*REALTIME_ROUND_TICKS;g.threat=fix||g.threat||g.lastKnown;g.state=combatBehavior(g)==="flee"||g.civilianFlee?"broken":"seeking-cover";g.alert=false;g.overwatch=null;return;}if(!hostileToPlayer(s,g)&&state!=="rest")return;}
 const from=stateOf(g);
 if(from===state){ // a repeat of the same trigger refreshes the fix and the counters, nothing else
  if(state==='suspicious'){if(fix)g.lastHeard=fix;g.searchSteps=suspicionSteps(g);}
  else if(state==='broken'){if(fix)g.threat=fix;g.brokenRounds=brokenRoundsOf(g);g.brokenTicks=0;g.hitRound=s.round;}
  else if(state==='searching'&&fix){g.lastKnown=fix;g.search={cells:[fix,...searchCells(s,g,fix)],index:0};g.route=undefined;g.sweep=undefined;}
  else if(fix)g.lastKnown=fix;
  return;}
 g.state=state;g.alert=state==='alert';g.route=undefined;g.sweep=undefined;g.standoff=0;
 if(state==='rest'){g.lastKnown=null;g.lastHeard=null;g.searchSteps=0;g.search=null;g.unseen=0;g.threat=null;}
 else if(state==='suspicious'){if(fix)g.lastHeard=fix;g.searchSteps=suspicionSteps(g);g.search=null;bark(s,g,g.name+': “Who\'s there?”','suspicious');}
 else if(state==='alert'){if(fix)g.lastKnown=fix;g.unseen=0;g.seenRound=-1;g.search=null;shout(s,g,quiet);}
 else if(state==='searching'){if(fix)g.lastKnown=fix;const c=g.lastKnown||g.threat||{x:g.x,y:g.y,z:levelOf(g)};g.search={cells:[...(swept?[]:[c]),...searchCells(s,g,c)],index:0};bark(s,g,g.name+' lost the trail and is searching.','searching');}
 else if(state==='standdown'){g.lastKnown=null;g.lastHeard=null;g.search=null;g.searchSteps=0;bark(s,g,g.name+' gave up the search.','standdown');}
 else if(state==='broken'){g.threat=fix||g.threat||g.lastKnown;g.brokenRounds=brokenRoundsOf(g);g.brokenTicks=0;g.hitRound=s.round;bark(s,g,g.name+' breaks and runs.','broken');}
}
// Tests and older code flip the boolean directly: the state follows it.
function reconcile(s,g){const st=stateOf(g);if(st!==g.state){g.state=st;g.route=undefined;g.sweep=undefined;g.standoff=0;if(st==='alert'){g.unseen=0;g.seenRound=-1;}g.search=null;}}
// Identification: the freshest fix. A broken guard notes where the threat is but stays broken.
function identified(s,g,p){const fix={x:p.x,y:p.y,z:levelOf(p)};g.seenRound=s.round;g.unseen=0;const st=stateOf(g);if(st==='broken'){g.lastKnown=fix;g.threat=fix;return;}if(st==='alert')g.lastKnown=fix;else setState(s,g,'alert',fix);}
// A footstep or a peripheral glimpse: a resting, standing-down or suspicious guard goes (or stays) Suspicious toward it; a searching guard re-centres its search on it.
function suspect(s,g,fix){const st=stateOf(g);if(st==='alert'||st==='broken')return;setState(s,g,st==='searching'?'searching':'suspicious',fix);}
// G4 shouts (GUARDS.md). An Alert guard shouts once on entering the state: colleagues within its archetype's shout radius that heed it take its fix and
// go Alert (and shout in turn, so an alarm can run down a chain); a resting or stood-down colleague that does not heed goes Suspicious toward the
// shouter, a suspicious or searching one keeps its own trail. One trigger asks each guard once (`cascade`: a shout, a gunshot's whole alarm ring, a
// refresh's sightings share one asked set), and the shouter asks its whole ring before any answer relays, so a colleague bonded to the shouter is
// asked by the shouter, never first by a stranger's relay, and a listener that declined a stranger earlier in the trigger still answers a shouter it is bonded to (the asked set blocks rolls, never a bonded answer); a Jester's joke is not an ask, so its listener stays askable. Guards alerted by a shout
// answer without their own alert bark (one bark per cascade, plus the answer count), and a report-alerted guard (alarm, quiet) propagates the same
// way without speaking. The campaign clock settle asks nobody: what the guards said to each other while the squad was away is not simulated. A shout without a fix rallies the others on the shouter. A Rebel (radius 0) shouts for
// nobody; a Jester's listeners only ever go Suspicious. Heeding: a resented or feud listener ignores the shout, a bonded one always answers, anyone
// else rolls its obedience on the social stream (never the ballistic one). Off the knob the alert bark is all that happens, so a plain game is G2
// to the count (the knob check below is redundant with the archetype check, since plain guards draw none; it stays as the stated gate).
export const bondOf=(a,b)=>a?.social?.bonds?.[b?.name]??restingBond(a,b);
function heeds(s,h,g){const b=bondOf(h,g);if(opposing(b))return false;if(rungOf(b).name==='bonded')return true;return socialRoll(s)<(traitsOf(h)?.obedience??50)/100;}
// A sealed cascade lets no shout propagate at all (the campaign-clock settle): membership in the asked set only blocks rolls, never a bonded answer, so sealing is a flag, not a full set.
function cascade(s,fn,{sealed=false}={}){const top=!s.shouting;if(top)s.shouting=new Set();if(sealed)s.sealed=(s.sealed||0)+1;try{return fn();}finally{if(sealed)s.sealed--;if(top){delete s.shouting;delete s.sealed;}}}
function shout(s,g,quiet=false){if(!quiet)bark(s,g,null,'alert');if(!s.rules?.social||!g.archetype||s.sealed)return;const r=shoutRadius(g);if(r<=0)return;
 cascade(s,()=>{const asked=s.shouting,fix=g.lastKnown||{x:g.x,y:g.y,z:levelOf(g)},here={x:g.x,y:g.y,z:levelOf(g)},heeders=[];
  for(const h of guards(s)){if(h===g||distance(h,g)>r||['alert','broken'].includes(stateOf(h))||asked.has(h.id)&&rungOf(bondOf(h,g)).name!=='bonded')continue; // the asked set blocks rolls, never a bonded answer
   const doubt=()=>{if(['rest','standdown'].includes(stateOf(h)))suspect(s,h,here);};
   if(g.archetype==='Jester'){doubt();continue;}
   asked.add(h.id);if(heeds(s,h,g))heeders.push(h);else doubt();}
  for(const h of heeders)if(!['alert','broken'].includes(stateOf(h)))setState(s,h,'alert',{...fix},{quiet:true});
  if(heeders.length)bark(s,g,heeders.length+(heeders.length===1?' guard answers ':' guards answer ')+g.name+"'s shout.");});}
// G4 grief. A colleague the guard liked (trusted or bonded) falling within earshot costs stress (bonded 25, trusted 15) and a guard whose stress
// passes its nerve breaks on the spot: away from the killer if the killer is not a guard, away from where the colleague fell otherwise (so a
// broken mourner is never fixless and "cornered" where it stands). Stress is the mercs' meter, so the hits a guard has taken count toward it.
// A colleague's bullet as the cause adds the G5 quantities: the bond toward the killer drops a further 40 (trusted 20) and the grudge rises by
// the same. The grief line is logged when the squad can see the mourner (grief is watched, not heard).
export const GRIEF_STRESS={bonded:25,trusted:15},GRIEF_BOND={bonded:40,trusted:20};
function mourn(s,dead,killer){for(const g of guards(s)){if(!g.social||g===dead||distance(g,dead)>BARK_RANGE)continue;const rung=rungOf(bondOf(g,dead)).name;if(!(rung in GRIEF_STRESS))continue;
 g.social.stress=Math.min(100,g.social.stress+GRIEF_STRESS[rung]);g.social.memories.unshift(dead.name+' was killed beside me.');g.social.memories.length=Math.min(8,g.social.memories.length);
 if(killer&&killer.team==='guard'&&killer!==g){const inc=g.social.incidents[killer.name]||={hits:0,damage:0,grudge:0};inc.grudge=Math.min(100,inc.grudge+GRIEF_BOND[rung]);g.social.bonds[killer.name]=Math.max(-100,bondOf(g,killer)-GRIEF_BOND[rung]);}
 const from=killer&&killer.team!==g.team&&Number.isFinite(killer.x)?{x:killer.x,y:killer.y,z:levelOf(killer)}:{x:dead.x,y:dead.y,z:levelOf(dead)};
 if(g.social.stress>(traitsOf(g)?.nerve??50)&&stateOf(g)!=='broken'&&!g.burningTurns)setState(s,g,'broken',from);
 else if(s.detected?.has(g.id))log(s,g.name+' saw '+dead.name+' fall.');}}
// Shot at, hit or miss: a broken guard learns where the shooter is and keeps running; anyone else is Alert toward the shooter. A colleague's bullet tells it nothing.
function targeted(s,b,a){provokeCharacter(s,b,a);if(!a||a.team===b.team)return;const fix={x:a.x,y:a.y,z:levelOf(a)};const st=stateOf(b);if(st==='broken'){b.threat=fix;b.lastKnown=fix;}else if(st==='alert')b.lastKnown=fix;else setState(s,b,'alert',fix);}
const onFire=(s,q)=>!!s.fires?.some(f=>f.x===q.x&&f.y===q.y&&f.z===levelOf(q));
// A hit that leaves the guard standing: at or below NERVE of its health its nerve breaks for BROKEN_ROUNDS; otherwise it is Alert toward the shooter.
function struck(s,u,source){const fix=source&&source.team!==u.team&&Number.isFinite(source.x)?{x:source.x,y:source.y,z:levelOf(source)}:null;u.hitRound=s.round;const st=stateOf(u);
 if(u.hp<=u.maxHp*nerveFraction(u)&&!u.burningTurns)setState(s,u,'broken',fix);
 else if(st==='broken'){if(fix)u.threat=fix;u.brokenRounds=brokenRoundsOf(u);u.brokenTicks=0;}
 else if(st==='alert'){if(fix)u.lastKnown=fix;}
 else setState(s,u,'alert',fix);}
// End of a guard phase: K rounds without an identification drop Alert to Searching; R rounds unshot end Broken.
function settleRound(s){cascade(s,()=>{for(const g of guards(s)){const st=stateOf(g);
 if(st==='alert'){if(g.seenRound===s.round)g.unseen=0;else if(++g.unseen>=alertRoundsOf(g))setState(s,g,'searching');}
 else if(st==='broken'&&g.hitRound!==s.round&&--g.brokenRounds<=0)setState(s,g,g.lastKnown?'alert':'standdown');}});} // the recoveries of one guard phase are one trigger
// The step away from the last threat that ends nearest an ally or the post; null when cornered (no legal step increases the distance).
function fleeStep(s,g){const threat=g.threat||g.lastKnown;if(!threat)return null;const d0=distance(g,threat);
 const options=movementNeighbors(s,g).filter(q=>levelOf(q)===levelOf(g)&&!occupant(s,q.x,q.y,levelOf(q))&&!onFire(s,q)&&distance(q,threat)>d0+1e-9);if(!options.length)return null;
 const allies=guards(s).filter(o=>o!==g),refuge=q=>Math.min(g.post?distance(q,g.post):Infinity,...allies.map(o=>distance(q,o)));
 return options.sort((a,b)=>refuge(a)-refuge(b)||distance(b,threat)-distance(a,threat))[0];}
function stepTo(s,g,p){const live=movementNeighbors(s,g).find(q=>q.x===p.x&&q.y===p.y&&q.z===p.z);if(!live||!canMoveStamina(g,live))return false;Object.assign(p,live);if(!commitClimb(s,g,p,{guard:true}))return false;recordSimpleTraversal(s,g,p);recordCliffTraversal(s,g,p);recordRoofTraversal(s,g,p);spendMovement(g,p);g.heading=headingTo(g,p);openDoorBetween(s,g,p);g.facing=(p.x-g.x)-(p.y-g.y)>=0?1:-1;g.x=p.x;g.y=p.y;g.z=levelOf(p);g.steps++;enterFire(s,g);}
function sweep(s,g,ticks){g.sweep=(g.sweep??ticks)-1;g.heading=(g.heading+90)%360;return g.sweep<=0;}
// Rest at the post (or where the guard stands when the post cannot be reached), wary for the rest of the map.
function settle(s,g,home=true){setState(s,g,'rest');g.wary=true;if(home&&g.post)g.heading=g.post.heading;bark(s,g,g.name+(home?' is back at post.':' settled where it stood.'),'rest');}
// Nearest free walkable tile to a point, breadth first (a post or a fix may be occupied by the time the guard gets there).
function placeAt(s,g,p){if(towerForUnit(s,g))return false;const z=levelOf(p),start={x:p.x,y:p.y,z};if(!inBounds(start.x,start.y,z))return false;const q=[start],seen=new Set([key(start.x,start.y,z)]);
 for(let i=0;i<q.length&&i<4000;i++){const c=q[i],cz=levelOf(c);const o=occupant(s,c.x,c.y,cz);if(walkable(s,c.x,c.y,cz)&&(!o||o===g)){g.x=c.x;g.y=c.y;g.z=cz;g.lastAt=c.x+','+c.y+','+cz;return true;}
  for(const b of neighbors(s,c)){const k=key(b.x,b.y,levelOf(b));if(!seen.has(k)){seen.add(k);q.push(b);}}}
 return false;}
// A map the squad has left advances no rounds; on re-entry its guards settle by the campaign clock, one round per ROUND_MINUTES:
// K rounds take an alert or broken guard to its fix and Searching, M more take it home and wary; suspicion and a stand-down resolve within a round.
export function settleGuards(s,minutes){const rounds=Math.floor(minutes/ROUND_MINUTES);if(rounds<=0)return;
 if(s.rules?.social)for(const g of guards(s))settleStress(g,rounds*ROUND_MINUTES/60*5); // guards work stress off at the mercs' resting rate
 if(s.fires?.length)s.fires=s.fires.filter(f=>(f.turns-=rounds)>0);for(const g of guards(s))if(g.burningTurns){g.burningTurns=Math.max(0,g.burningTurns-rounds);if(!g.burningTurns)expireBurn(s,g);} // fires burn down by the same clock
 cascade(s,()=>{for(const g of guards(s)){let st=stateOf(g);if(st==='rest')continue;
  const home=()=>{if(g.post)placeAt(s,g,g.post);setState(s,g,'rest');g.wary=true;if(g.post)g.heading=g.post.heading;};
  if(st==='suspicious'||st==='standdown'){home();continue;}
  let left=rounds;
  if(st==='broken'){const r=brokenRoundsOf(g);if(left<r)continue;left-=r;if(!g.lastKnown&&!g.threat){home();continue;}setState(s,g,'alert',g.lastKnown||g.threat,{quiet:true});st='alert';}
  if(st==='alert'){const k=alertRoundsOf(g);if(left<k)continue;left-=k;const c=g.lastKnown||g.threat||{x:g.x,y:g.y,z:levelOf(g)};placeAt(s,g,c);setState(s,g,'searching',c);g.search.cells.shift();}
  const cells=g.search?g.search.cells.length-g.search.index:0;if(left>=cells)home();else g.search.index+=left;}},{sealed:true}); // the clock settles no shouts
 s.revision++;}

// Real-time route finding is bounded: one A* of at most REALTIME_NODES expansions per guard, only when its goal changes or its remembered
// path is blocked. When the budget runs out the guard takes the path to the closest tile it explored and searches again from there; a goal it
// cannot approach at all is retried every REALTIME_RETRY ticks. Goals are the walkable tiles on and around the fix, or the nearest
// walkable tile within six of it when the fix itself (a 6-tile grid cell from a report) is void, water or off the map.
export const REALTIME_NODES=1200,REALTIME_RETRY=40,SWEEP_TICKS=8,REALTIME_SEARCHES=3; // at most this many fresh route searches per tick; the rest of the guards wait a tick
export function fixGoals(s,dest){const z=levelOf(dest),goals=new Set();for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=dest.x+dx,y=dest.y+dy;if(inBounds(x,y,z)&&walkable(s,x,y,z))goals.add(key(x,y,z));}
 if(!goals.size){let best=null,bd=Infinity;for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){const x=dest.x+dx,y=dest.y+dy,d=Math.hypot(dx,dy);if(d<bd&&inBounds(x,y,z)&&walkable(s,x,y,z)){best=key(x,y,z);bd=d;}}if(best)goals.add(best);}return goals;}
export function boundedRoute(s,g,goals,budget){if(towerForUnit(s,g))return null;
 const start=key(g.x,g.y,levelOf(g));if(goals.has(start))return [];
 const occupied=new Set(s.units.filter(p=>(alive(p)||incapacitated(p))&&p!==g).map(p=>key(p.x,p.y,levelOf(p)))),stairs=stairSet(s),scores=new Map([[start,0]]),parents=new Map(),heap=[];
 // A* toward the nearest goal (the same admissible estimate pathTo uses), so an open-ground route costs tens of expansions, not a diamond of thousands.
 const pts=[...goals].map(k=>{const [x,y,z=0]=k.split(',').map(Number);return [x,y,z];}),unit=movementCost(g),h=p=>Math.min(...pts.map(([x,y,z])=>{const dx=Math.abs(p.x-x),dy=Math.abs(p.y-y);return (Math.max(dx,dy)+.5*Math.min(dx,dy))*unit+2*movementMultiplier(g)*Math.abs(p.z-z);}));
 const less=(a,b)=>a.f<b.f||(a.f===b.f&&a.g>b.g);const push=n=>{heap.push(n);let i=heap.length-1;while(i){const p=(i-1)>>1;if(!less(heap[i],heap[p]))break;[heap[i],heap[p]]=[heap[p],heap[i]];i=p;}};
 const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&less(heap[c+1],heap[c]))c++;if(!less(heap[c],heap[i]))break;[heap[i],heap[c]]=[heap[c],heap[i]];i=c;}}return first;};
 const trace=k=>{const path=[];while(k!==start){const e=parents.get(k);path.push(e.point);k=e.parent;}return path.reverse();};
 const first={x:g.x,y:g.y,z:levelOf(g),k:start,g:0,f:h({x:g.x,y:g.y,z:levelOf(g)})};push(first);let expanded=0,best=first,bestH=first.f;
 while(heap.length&&expanded<budget){const p=pop();if(p.g!==scores.get(p.k))continue;expanded++;
  if(goals.has(p.k))return trace(p.k);
  const hp=p.f-p.g;if(hp<bestH){bestH=hp;best=p;}
  // Lean expansion: the same legality as movementNeighbors (level changes need standing, no cutting a corner past a body) checked against the precomputed occupied set.
  for(const n of neighbors(s,p,stairs).concat(siteEscapeSteps(s,g,p))){const same=n.kind==='ramp'||n.z===p.z;if(!same&&stanceOf(g)!=='standing')continue;if(same&&n.x!==p.x&&n.y!==p.y&&(occupied.has(key(n.x,p.y,p.z))||occupied.has(key(p.x,n.y,p.z))))continue;const q=movementStep(g,p,n,combatCosts(s));if(!q||combatCosts(s)&&q.cost>turnAP(g))continue;const k=key(n.x,n.y,n.z),c=p.g+q.cost;if(occupied.has(k)||c>=(scores.get(k)??Infinity))continue;scores.set(k,c);parents.set(k,{parent:p.k,point:q});push({...q,k,g:c,f:c+h(q)});}}
 // Out of budget: head for the closest tile explored (partial route), or give up when nothing is closer than where the guard stands.
 return best===first||!Number.isFinite(bestH)?null:trace(best.k);
}
// One real-time step toward a fix, from the guard's remembered route; null when it stands at (or beside) the fix or cannot get there now.
function realtimeStep(s,g,dest,quota,goals=fixGoals(s,dest)){
 const goal=[...goals].sort().join('|');let r=g.route;
 if(!r||r.goal!==goal){r=g.route={goal,path:null,wait:0};g.sweep=undefined;}
 if(goals.has(key(g.x,g.y,levelOf(g))))return null;
 if(r.path?.length){const p=r.path[0];if(movementNeighbors(s,g).some(q=>q.x===p.x&&q.y===p.y&&q.z===p.z)&&!occupant(s,p.x,p.y,p.z))return r.path.shift();r.path=null;}
 if(r.wait>0){r.wait--;return null;}
 if(quota.left<=0)return undefined; // no search budget left this tick: try again next tick
 quota.left--;const path=boundedRoute(s,g,goals,REALTIME_NODES);
 if(!path||!path.length){r.path=null;r.wait=REALTIME_RETRY;return null;}
 r.path=path;return r.path.shift();
}
// Real time: every guard with something to do takes one step per tick, by state (GUARDS.md G2). Suspicious guards walk their step budget
// toward what they heard, then sweep two quarter turns and stand down; alert guards too far to matter close on their last fix, sweep eight
// ticks and drop to Searching; searching guards visit the neighbouring report cells, sweeping at each, then stand down; a guard standing down
// walks back to its post and rests, wary; a broken guard runs from the last threat for two rounds' worth of ticks. refresh() opens the fight
// the moment an alert guard could reach the squad within two turns.
export function stepInvestigation(s,...args){return withCombatQueries(s,()=>stepInvestigationQueryAction(s,...args));}
function stepInvestigationQueryAction(s){if(['explore','won'].includes(s.phase)&&!s.engaged&&!s.fires?.length&&!guards(s).some(g=>playerThreat(s,g)&&active(g)))for(const g of guards(s))if(g.npcFrightened)g.npcFearTicks=Math.max(0,(g.npcFearTicks||0)-1);settleCivilianFear(s);
 if(!['explore','won'].includes(s.phase))return false;let acted=false;const quota={left:REALTIME_SEARCHES};
 for(const g of guards(s)){
  if(g.burningTurns)continue;
  if(stateOf(g)==='rest'&&!g.npcFrightened&&g.patrol?.length){
   const dest=patrolDestination(s,g),p=dest?realtimeStep(s,g,dest,quota,new Set([key(dest.x,dest.y,levelOf(dest))])):null;
   if(p){stepTo(s,g,p);patrolDestination(s,g);acted=true;}continue;
  }
  if(combatBehavior(g)!=='fight'){acted=civilianStep(s,g,false)||acted;continue;}if(!playerThreat(s,g))continue;const st=stateOf(g);if(st==='rest')continue;
  if(st==='broken'){const p=fleeStep(s,g);if(p)stepTo(s,g,p);else{const seen=squad(s).find(q=>notices(s,g,q));if(seen){setState(s,g,'alert',{x:seen.x,y:seen.y,z:levelOf(seen)},{quiet:true});identified(s,g,seen);bark(s,g,g.name+' is cornered and turns to fight.','alert');acted=true;continue;}}
   acted=true;if(++g.brokenTicks>=brokenRoundsOf(g)*REALTIME_ROUND_TICKS)setState(s,g,g.lastKnown?'alert':'standdown');continue;}
  const dest=st==='suspicious'?g.lastHeard:st==='alert'?g.lastKnown:st==='searching'?searchGoal(g):g.post;
  const spent=st==='suspicious'&&g.searchSteps<=0; // the step budget ran out short of the sound: sweep where it stands
  const goals=st==='standdown'?homeGoals(s,g):undefined;
  const p=dest&&!spent?realtimeStep(s,g,dest,quota,goals):null;if(p===undefined)continue;
  if(p){stepTo(s,g,p);acted=true;g.sweep=undefined;if(st==='suspicious')g.searchSteps--;continue;}
  acted=true;
  // At the fix, out of steps, or unable to get there now (boxed in, or a detour longer than the search budget).
  if(st==='standdown'){if(!dest||goals.has(key(g.x,g.y,levelOf(g))))settle(s,g);else if(g.route?.wait===REALTIME_RETRY&&++g.standoff>=STANDOFF_TRIES)settle(s,g,false);continue;}
  if(dest&&!spent&&g.sweep===undefined){const heading=headingTo(g,dest);if(g.heading!==heading)g.heading=heading;}
  if(sweep(s,g,st==='suspicious'?SUSPICION_SWEEP:SWEEP_TICKS)){
   if(st==='suspicious')setState(s,g,'standdown');
   else if(st==='alert')setState(s,g,'searching',null,{swept:true});
   else{g.search.index++;if(!searchGoal(g))setState(s,g,'standdown');}}
 }
 if(acted)refresh(s);return acted;
}
export const overwatchRange=u=>Math.max(1,Math.min(WEAPONS[u.weapon].range,u.overwatch?.range??u.watchRange??WEAPONS[u.weapon].range));
export const withinOverwatch=(u,b)=>Math.hypot(u.x-b.x,u.y-b.y)+Math.max(0,levelOf(b)-levelOf(u))<=overwatchRange(u);
export function setOverwatch(s,u,range=overwatchRange(u)){if(!Number.isFinite(range)||range<1||range>WEAPONS[u.weapon].range)return false;if(!canControl(s,u)||s.phase!=='player'||s.queue.length||u.overwatch||!WEAPONS[u.weapon].mag||u.ammo[u.weapon]<1||u.ap<WEAPONS[u.weapon].cost)return false;u.ap-=WEAPONS[u.weapon].cost;u.watchRange=range;u.overwatch={weapon:u.weapon,heading:u.heading,range};log(s,u.name+' reserved one overwatch shot.');return true;}
export function resolveOverwatch(s,g){if(!playerThreat(s,g))return;if(s.phase!=='enemy'||!alive(g))return;for(const u of squad(s)){const watch=u.overwatch;if(!watch)continue;if(watch.weapon!==u.weapon||watch.heading!==u.heading){u.overwatch=null;continue;}if(withinOverwatch(u,g)&&canSee(s,u,g)&&previewAttack(s,{...u,ap:WEAPONS[u.weapon].cost},g).ok){attack(s,u,g,false,false,'torso',true);if(!alive(g)||s.phase!=='enemy')break;}}}

export function allocateSkill(s,u,skill){if(!canControl(s,u)||s.queue.length||!['explore','won'].includes(s.phase)||!train(u,skill))return false;log(s,u.name+' trained '+skill+'.');refresh(s);return true;}

function settleCivilianFear(s){
 if(!['explore','won'].includes(s.phase)||s.engaged||s.fires?.length||guards(s).some(g=>playerThreat(s,g)&&active(g)))return;
 for(const g of guards(s))if(g.npcFrightened&&(g.npcFearTicks||0)<=0){g.npcFrightened=false;g.civilianFlee=false;g.threat=null;g.lastKnown=null;g.lastHeard=null;g.state='rest';g.alert=false;}
}
// Bounded local search: prefer nearby cover that screens the known threat.
function civilianCoverStep(s,g){
 const origin={...g,stance:'standing'},open=[{p:origin,cost:0,first:null}],seen=new Map([[key(g.x,g.y,levelOf(g)),0]]);let best=null,visited=0;
 while(open.length&&visited++<256){open.sort((a,b)=>b.cost-a.cost);const node=open.pop(),p=node.p;
  if(coverAgainst(s,g.threat,p)){
   const score=node.cost+(lineOfSight(s,g.threat,{...g,...p,stance:'kneeling'})?6:0);
   if(!best||score<best.score)best={...node,score};
  }
  if(node.cost>=24)continue;
  for(const q of movementNeighbors(s,origin,p)){if(levelOf(q)!==levelOf(g)||occupant(s,q.x,q.y,levelOf(q))||onFire(s,q))continue;
   const cost=node.cost+q.cost,k=key(q.x,q.y,levelOf(q));if(cost>24||cost>=(seen.get(k)??Infinity))continue;
   seen.set(k,cost);open.push({p:q,cost,first:node.first||q});
  }
 }
 return best;
}
function civilianStep(s,g,turn){
 if(!g.threat)return false;
 let changed=false;g.overwatch=null;
 for(let n=0;n<(turn?Math.ceil(g.maxAp):1);n++){
 const close=s.units.filter(u=>u!==g&&alive(u)&&levelOf(u)===levelOf(g)&&distance(g,u)<=10&&lineOfSight(s,g,u)).sort((a,b)=>distance(g,a)-distance(g,b))[0];
 if(close){g.civilianFlee=true;g.threat={x:close.x,y:close.y,z:levelOf(close)};}
 const flee=combatBehavior(g)==='flee'||g.civilianFlee;
  const cover=flee?null:civilianCoverStep(s,g);
  if(!flee&&cover&&!cover.first){changed||=g.stance!=='kneeling';g.stance='kneeling';g.state='cowering';break;}
  // No reachable cover: stay low rather than walking toward the danger.
  if(!flee&&!cover){changed||=g.stance!=='kneeling';g.stance='kneeling';g.state='cowering';break;}
  g.stance='standing';g.state=flee?'broken':'seeking-cover';const p=flee?fleeStep(s,g):cover.first;
  if(!p||turn&&p.cost>g.ap)break;stepTo(s,g,p);if(turn)g.ap=Math.max(0,g.ap-p.cost);changed=true;
 }
 if(turn)g.ap=0;return changed;
}

// A preview is pure. Only an accepted traversal consumes this independent roll.
export function commitClimb(s,u,step,{paid=false,guard=false}={}){
 const result=rollClimb(s,u,step);if(!result.checked&&!result.blocked)return true;
 s.lastClimb={unitId:u.id,kind:step.kind,...result};
 if(result.success)return true;
 if(result.blocked){cancelClimbOrders(s,u);return false;}
 if(!paid){spendMovement(u,step);if(!guard&&combatCosts(s))u.ap=Math.max(0,u.ap-step.cost);}
 u.overwatch=null;u.route=null;cancelClimbOrders(s,u);
 if(result.fall){const event=failedClimbFall(s,u,step,{hurt:(s,u,damage)=>combatDamage(s,u,damage),fatal:(s,u)=>combatDamage(s,u,Math.max(u.hp,1),true)});recordSimpleEvent(s,event);log(s,u.name+' fell: '+event.damage+' HP'+(result.criticalFailure?' (critical failure)':'')+'.');enterFire(s,u);}
 else log(s,u.name+' could not complete the climb and returned safely.');
 return false;
}
function recordSimpleEvent(s,event){s.simpleTraversal={...event,id:(s.simpleTraversal?.id||0)+1};s.simpleTraversals=[...(s.simpleTraversals||[]),s.simpleTraversal].slice(-64);}
function recordSimpleTraversal(s,u,to){
 if(!['window','wall','ladder'].includes(to.kind))return;
 recordSimpleEvent(s,{unitId:u.id,kind:to.kind,from:{x:u.x,y:u.y,z:levelOf(u)},to:{x:to.x,y:to.y,z:levelOf(to)},running:!!to.climb?.running});
}
