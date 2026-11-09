import {bulletTrajectory} from './core/projectiles.js';
import {tileKey,inBounds} from './core/maps.js';
import {shotAim,supportsAim} from './aim-levels.js';
import {weaponAccuracy} from './character-stats.js';
import {accuracyPenalty,roundChance} from './combat-state.js';
import {heldWeaponJammed} from './loot-policy.js';
import {handAttackReady,handWeapons} from './one-handed.js';

// A terrain aim point is not an invented person: no identification, body-part
// bonus, or guaranteed victim. The ordinary projectile trace resolves impacts.
export function previewGroundFire(s,a,b,w,charges,burst=false,aimLevel='hip'){
 const aim=shotAim(w,aimLevel,burst),rounds=burst?(w.burstRounds||1):1,cost=aim?.cost??w.cost;
 const distance=Math.hypot(a.x-b.x,a.y-b.y),range=Math.max(0,w.range-Math.max(0,(b.z||0)-(a.z||0)));
 const chance=Math.round(Math.max(5,Math.min(95,weaponAccuracy(a)+(w.accuracy||0)+(aim?.accuracy||0)-Math.max(0,distance-3)/Math.max(1,w.range-3)*(w.rangeLoss??25)-accuracyPenalty(a))));
 let reason='';
 if(!inBounds(b.x,b.y,b.z||0))reason='Outside the map';
 else if(!supportsAim(w))reason='Equip a firearm or area weapon';
 else if(!aim)reason='Choose an aim level';
 else if(!s.seen.has(tileKey(b.x,b.y,b.z||0)))reason='Choose discovered terrain';
 else if(a.burningTurns)reason='On fire: running in panic';
 else if(a.pinned&&aim.level!=='hip')reason='Pinned: only hip fire available';
 else if(heldWeaponJammed(a))reason='Weapon jammed: clear jam with Reload';
 else if(distance>range)reason='Out of range';
 else if(!handAttackReady(a,w,rounds))reason=w.dual?'Both pistols must be loaded and unjammed':'Reload required';
 else if(charges&&a.ap<cost)reason='Not enough AP';
 // A preview may show known cover, but must not name or expose hidden people.
 const known={...s,units:s.units.filter(u=>u===a||u.team===a.team||s.detected.has(u.id))};
 const path=!reason?bulletTrajectory(known,a,b,{accurate:true,zone:'torso',reach:w.range*1.5},()=>0):null;
 const blocker=path?.unitId!==undefined?known.units.find(u=>u.id===path.unitId):null;
 return {ok:!reason,reason,cost,rounds,...w.dual?{dualWeapons:handWeapons(a)}:{},chance,shotChances:Array.from({length:rounds},(_,i)=>roundChance(chance,i)),aimLevel:aim?.level,zone:'torso',range,distance,ground:true,
  obstruction:blocker?{kind:'unit',name:blocker.name,friendly:blocker.team===a.team}:path&&['wall','cover','prop'].includes(path.kind)?{kind:path.kind}:null};
}
