import {loadWeight} from './core/inventory.js';
import {loadMultiplier} from './inventory-tools.js';
// Stamina belongs to simulation time; presentation never spends or restores it.
export const STAMINA_RECOVERY_PER_MINUTE=8;
export const hasStamina=u=>!!u?.stats&&Number.isFinite(u.stamina)&&Number.isFinite(u.maxStamina);
export const canSpendStamina=(u,cost)=>!hasStamina(u)||u.stamina+1e-8>=cost;
export function spendStamina(u,cost){if(!hasStamina(u))return;u.stamina=Math.max(0,u.stamina-cost);u.staminaDelay=.25;}
export function movementStamina(u,to){const distance=Math.hypot(to.x-u.x,to.y-u.y),climb=Math.abs((to.z||0)-(u.z||0));return loadMultiplier(u,loadWeight(u))*(climb?12*climb:to.kind==='wall'?12:to.kind==='window'?6:distance*(u.stance==='prone'?3:u.running?4:u.sneaking?2:1));}
export function canMoveStamina(u,to){return !['wall','window'].includes(to.kind)&&!u.running&&!u.sneaking&&u.stance!=='prone'&&(to.z||0)===(u.z||0)||canSpendStamina(u,movementStamina(u,to));}
export function spendMovement(u,to){spendStamina(u,movementStamina(u,to));}
export function recoverStamina(state,minutes,{combat=false}={}){if(!(minutes>0))return;const queued=new Set(state.queue.flatMap(p=>p.group?p.group.map(q=>q.id):[p.id]));for(const u of state.units){if(!hasStamina(u)||u.hp<=0||u.casualty||u.burningTurns||u.away)continue;if(!combat&&queued.has(u.id))continue;const delay=Math.min(minutes,u.staminaDelay||0);u.staminaDelay=Math.max(0,(u.staminaDelay||0)-minutes);u.stamina=Math.min(u.maxStamina,u.stamina+(minutes-delay)*STAMINA_RECOVERY_PER_MINUTE);}}
