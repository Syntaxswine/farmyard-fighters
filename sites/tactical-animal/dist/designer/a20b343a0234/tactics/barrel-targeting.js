import {barrelKey,presentBarrel} from './explosive-barrels.js';
import {traceProjectile,muzzleHeight} from './core/projectiles.js';
import {inCone} from './core/perception.js';
import {unitBaseHeight} from './tower-geometry.js';
import {shotAim,supportsAim} from './aim-levels.js';
import {weaponAccuracy} from './character-stats.js';
import {accuracyPenalty,roundChance} from './combat-state.js';
import {heldWeaponJammed} from './loot-policy.js';
import {handAttackReady,handWeapons} from './one-handed.js';

export function barrelSight(s,a,b){
 if(!a||!b||!presentBarrel(s,b)||s.difficulty!=='easy'&&!s.seen.has(barrelKey(b))||a.team!=='squad'&&!inCone(a,b))return false;
 const origin={x:a.x,y:a.y,h:unitBaseHeight(a)+muzzleHeight(a)},d={x:b.x-a.x,y:b.y-a.y,h:unitBaseHeight(b)+.4-origin.h};
 const range=Math.hypot(d.x,d.y,d.h);if(!range)return false;
 return traceProjectile(s,a,origin,d,range+.01).propId===b.id;
}
export function previewBarrelAttack(s,a,b,w,charges,burst=false,aimLevel='hip'){
 const aiming=shotAim(w,aimLevel,burst),rounds=burst?(w.burstRounds||1):1,cost=aiming?.cost??w.cost;
 const range=Math.hypot(a.x-b.x,a.y-b.y),rangePenalty=Math.max(0,(b.z||0)-(a.z||0)),effectiveRange=Math.max(0,w.range-rangePenalty);
 const chance=Math.round(Math.max(5,Math.min(95,weaponAccuracy(a)+(w.accuracy||0)+(aiming?.accuracy||0)-Math.max(0,range+rangePenalty-3)/Math.max(1,w.range-3)*(w.rangeLoss??25)-accuracyPenalty(a))));
 let reason='';
 if(!presentBarrel(s,b))reason='Barrel already destroyed';
 else if(!supportsAim(w))reason='Shoot the barrel with a firearm or use an area weapon';
 else if(!aiming)reason='Choose an aim level';
 else if(a.pinned&&aiming.level!=='hip')reason='Pinned: only hip fire available';
 else if(heldWeaponJammed(a))reason='Weapon jammed: clear jam with Reload';
 else if(a.burningTurns)reason='On fire: running in panic';
 else if(!barrelSight(s,a,b))reason=a.team==='squad'?'Barrel unseen or line of fire blocked':'Line of fire blocked or outside personal sight cone';
 else if(range>effectiveRange)reason='Out of range';
 else if(!handAttackReady(a,w,rounds))reason=w.dual?'Both pistols must be loaded and unjammed':'Reload required';
 else if(charges&&a.ap<cost)reason='Not enough AP';
 return {ok:!reason,reason,cost,rounds,...w.dual?{dualWeapons:handWeapons(a)}:{},chance,shotChances:Array.from({length:rounds},(_,i)=>roundChance(chance,i)),aimLevel:aiming?.level,zone:'torso',range:effectiveRange,barrel:true};
}
