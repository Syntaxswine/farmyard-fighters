// Shared hit-chance modifiers; roll-margin ballistics only place failed shots.
export const METRES_PER_TILE=1.2;
export const LEG_AP_PENALTY=3;
export const BURST_RECOIL=8;
export const legImpaired=u=>u.legWound===true&&u.hp<u.maxHp;
export const injuryMovement=u=>legImpaired(u)?2:1;
export const turnAP=u=>Math.max(0,u.maxAp-(legImpaired(u)?LEG_AP_PENALTY:0));
export function woundLeg(u){if(u.hp<=0||legImpaired(u))return;u.legWound=true;u.ap=Math.max(0,u.ap-LEG_AP_PENALTY);}
export function accuracyPenalty(u){
 const exhaustion=Math.max(0,1-(u.stamina??u.maxStamina??100)/(u.maxStamina||100));
 const injury=Math.max(0,1-u.hp/Math.max(1,u.maxHp));
 return Math.round(exhaustion*10+injury*10);
}
export const roundChance=(chance,index)=>Math.max(5,Math.min(95,Math.round(chance-index*BURST_RECOIL)));
const leadership=u=>Math.max(1,Math.min(100,u.stats?.leadership??u.leadership??20));
export function incomingFire(s,u,shooter,threatens,random){
 if(!threatens||u.hp<=0||u.team===shooter.team)return false;
 let ledger=u.suppression;
 if(!ledger||ledger.round!==s.round)ledger=u.suppression={round:s.round,attackers:[],tested:false};
 if(!ledger.attackers.includes(shooter.id))ledger.attackers.push(shooter.id);
 if(ledger.attackers.length<5||ledger.tested)return false;
 ledger.tested=true;
 if(random()*100<leadership(u))return false;
 u.pinned=true;u.overwatch=null;return true;
}
export function recoverAim(u,random){
 if(u.hp>=u.maxHp)delete u.legWound;
 if(u.pinned&&random()*100<leadership(u))u.pinned=false;
}
export function validCombatState(u,ids){
 if(u.legWound!==undefined&&typeof u.legWound!=='boolean'||u.pinned!==undefined&&typeof u.pinned!=='boolean')return false;
 const v=u.suppression;
 return v===undefined||!!v&&Number.isInteger(v.round)&&v.round>=0&&typeof v.tested==='boolean'&&Array.isArray(v.attackers)&&v.attackers.every(id=>Number.isInteger(id)&&ids.has(id))&&new Set(v.attackers).size===v.attackers.length;
}
