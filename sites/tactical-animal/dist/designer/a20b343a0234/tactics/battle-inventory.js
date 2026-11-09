import {canUseSectorInventory} from './sector-inventory.js';
import {canControl,combatCosts,alive,adjacentTo,pileOpen,searchBody,searchPreview,equip,equipCutters,stowWeapon,arrangeInventory,WEAPONS,refresh} from './core/engine.js';
import {gridLayout,storeLayout,syncWeapons,accepts,receive} from './core/inventory.js';
import {tileKey} from './core/maps.js';
import {TOOLS} from './inventory-tools.js';
export const itemName=i=>WEAPONS[i.kind]?.name||TOOLS[i.kind]?.name||({medkits:'Medical kit',wireCutters:'Wire cutters'}[i.kind])||i.kind;
export const visibleLoot=(s,p)=>s.visible.has(tileKey(p.x,p.y,p.z||0))&&(p.items.length||!pileOpen(p));
export const nearbyLoot=(s,u)=>s.loot.filter(p=>visibleLoot(s,p)&&adjacentTo(s,u,p));
export const nearbyRecipients=(s,u)=>s.units.filter(v=>v!==u&&v.team==='squad'&&alive(v)&&!v.casualty&&adjacentTo(s,u,v));
export function carriedItem(u,key){if(key==='medkits')return u.medkits>0?{type:'utility',kind:key,count:u.medkits}:null;if(key==='wireCutters')return u.wireCutters?{type:'utility',kind:key,count:1}:null;return /^(0|[1-9]\d*)$/.test(String(key))?u.pack[Number(key)]:null;}
function insert(u,item){if(item.type==='utility'){if(item.kind==='medkits')u.medkits+=item.count;else if(item.kind==='wireCutters'&&!u.wireCutters)u.wireCutters=true;else return false;}else {if(!accepts(u,item))return false;receive(u,structuredClone(item));}return gridLayout(u).ok;}
function remove(u,key,count){const item=carriedItem(u,key);if(key==='medkits')u.medkits-=count;else if(key==='wireCutters'){u.wireCutters=false;u.slots=u.slots.map(k=>k===key?null:k);}else if(item.type==='weapon'||item.count===count)u.pack.splice(Number(key),1);else item.count-=count;if(item.type==='weapon'){u.slots=u.slots.map(k=>k===item.kind?null:k);if(u.weapon===item.kind)u.weapon='hands';}u.overwatch=null;}
// Stage the entire transfer before touching either inventory, the pile, or AP.
function prepare(s,u,action){
 if(!s.units.includes(u)||!canControl(s,u)||s.queue.length)return {ok:false,reason:'Cannot manage equipment now.'};
 const {mode,key,target,index}=action;if(!['take','give','drop'].includes(mode))return {ok:false,reason:'Unknown transfer.'};
 const cost=combatCosts(s)?2:0;if(u.ap<cost)return {ok:false,reason:'Needs 2 AP.'};
 if(mode==='take'&&(!(action.sector?canUseSectorInventory(s,u)&&s.loot.includes(target):nearbyLoot(s,u).includes(target))||!pileOpen(target)))return {ok:false,reason:'Stand beside visible, searched loot.'};
 if(mode==='give'&&!nearbyRecipients(s,u).includes(target))return {ok:false,reason:'Stand beside the recipient with an open edge.'};
 const source=structuredClone(u);syncWeapons(source);const original=mode==='take'&&Number.isInteger(index)?target.items[index]:mode==='take'?null:carriedItem(source,key);
 if(!original||original.kind==='hands')return {ok:false,reason:'Item is unavailable.'};
 const available=original.type==='weapon'?1:original.count,count=action.count??available;
 if(!Number.isInteger(count)||count<1||count>available)return {ok:false,reason:'Choose a valid quantity.'};
 const item={...original,...(original.type==='weapon'?{}:{count}),cell:undefined};
 const recipient=mode==='give'?structuredClone(target):source;
 if(mode!=='drop'&&!insert(recipient,item))return {ok:false,reason:'No backpack space or item already owned.'};
 if(mode!=='take')remove(source,key,count);
 source.ap-=cost;storeLayout(source);if(mode==='give')storeLayout(recipient);
 return {ok:true,cost,source,recipient,item,count};
}
export const transferPreview=(s,u,action)=>{const p=prepare(s,u,action);return {ok:p.ok,reason:p.reason||'',cost:p.cost??0};};
export function transferItem(s,u,action){const p=prepare(s,u,action);if(!p.ok)return false;const {mode,target,index}=action;
 Object.assign(u,p.source);if(mode==='give')Object.assign(target,p.recipient);
 else if(mode==='take'){const item=target.items[index];if(item.type==='weapon'||item.count===p.count)target.items.splice(index,1);else item.count-=p.count;}
 else{let pile=s.loot.find(q=>q.body===undefined&&q.x===u.x&&q.y===u.y&&(q.z||0)===(u.z||0)&&adjacentTo(s,u,q));if(!pile){pile={x:u.x,y:u.y,z:u.z||0,...(u.towerPost?{towerPost:structuredClone(u.towerPost)}:{}),items:[]};s.loot.push(pile);}pile.items.push(p.item);}
 s.log.unshift(u.name+' '+({take:'picked up ',give:'gave ',drop:'dropped '}[mode])+itemName(p.item)+(mode==='give'?' to '+target.name:'')+'.');refresh(s);return true;}
export function inventoryAction(s,u,a){
 if(['take','give','drop'].includes(a.mode))return transferItem(s,u,a);
 if(!s.units.includes(u)||!canControl(s,u)||s.queue.length)return false;
 if(a.mode==='search')return nearbyLoot(s,u).includes(a.target)&&searchPreview(s,u,a.target).ok&&searchBody(s,u,a.target);
 if(a.mode==='stow')return stowWeapon(s,u,a.slot);
 if(a.mode==='arrange')return arrangeInventory(s,u,a.key,a.cell);
 if(a.mode==='ready'){const i=carriedItem(u,a.key);if(!i||![0,1].includes(a.slot))return false;if(i.kind==='wireCutters')return equipCutters(s,u,a.slot);if(i.type!=='weapon')return false;return equip(s,u,i.kind,a.slot);}
 return false;
}
