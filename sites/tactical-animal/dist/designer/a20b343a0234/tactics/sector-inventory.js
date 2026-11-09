import {alive,pileOpen,canControl,combatCosts} from './core/engine.js';
import {playerThreat} from './character-properties.js';
const contexts=new WeakMap();
export const bindSectorInventory=(state,context)=>contexts.set(state,context);
export function canUseSectorInventory(state,merc){
 const context=contexts.get(state);
 if(!context||!context.present(merc)||!state.units.includes(merc)||merc.team!=='squad'||!alive(merc)||merc.casualty)return false;
 return canControl(state,merc)&&!combatCosts(state)&&!state.queue.length&&!state.fires?.length&&!context.contested()&&!state.units.some(u=>alive(u)&&playerThreat(state,u));
}
export function sectorInventory(state,merc){return canUseSectorInventory(state,merc)?state.loot.filter(p=>pileOpen(p)&&p.items.length):[];}
