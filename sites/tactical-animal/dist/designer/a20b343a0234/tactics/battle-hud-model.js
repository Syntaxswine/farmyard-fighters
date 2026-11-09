import {WEAPONS,canControl,combatCosts,equipCost,stanceOf,movementModeOf} from './core/engine.js';
import {reserve} from './core/inventory.js';
import {unitArt} from './red-hats-art.js';
import {inventoryArt} from './loot-art.js';
import {weaponIcon} from './weapon-icons.js';
import {isDeceased} from './mercenary-status.js';
import {pairedInHand} from './one-handed.js';
const bounded=(v,max)=>Math.max(0,Math.min(Number.isFinite(max)&&max>0?max:1,Number.isFinite(v)?v:0));
export function resource(value,max){const limit=Number.isFinite(max)&&max>0?max:1,current=bounded(value,limit);return {value:Math.floor(current),max:limit,percent:100*current/limit};}
export function readyWeapons(u){
 const held=u.weapon||'hands',alternate=(u.slots||[]).find(k=>k&&k!==held)||null;
 return [held,alternate];
}
export function hudPortrait(u){
 return unitArt({...u,weapon:'hands',stance:'standing'}).src;
}
export function weaponReadout(state,u,kind,{blocked=false}={}){
 if(!kind)return {kind:null,name:'Empty ready slot',short:'Empty slot',image:null,amount:null,canEquip:false,canReload:false,reason:'Choose a second ready weapon in Inventory.'};
 const w=WEAPONS[kind],held=kind===u.weapon,rounds=Math.max(0,Math.floor(u.ammo?.[kind]??0)),spare=reserve(u,kind,state),jammed=!!u.pack?.find(i=>i.type==='weapon'&&i.kind===kind)?.jammed;
 const available=!blocked&&canControl(state,u)&&!state.queue.length,cost=w?equipCost(state,u,kind):0,reloadCost=combatCosts(state)?3:0;
 return {kind,held,paired:pairedInHand(u,kind),name:w?.name||'Wire cutters',short:w?.short||'Cutters',image:weaponIcon(kind)||inventoryArt({type:w?'weapon':'utility',kind}),amount:w?.mag?rounds:null,capacity:w?.mag||0,reserve:spare,unit:w?.thrown?'grenades':w?.incendiary?'bursts':'rounds',jammed,cost,reloadCost,
  canEquip:available&&!!w&&!held&&u.ap>=cost,
  canReload:available&&held&&!!w?.mag&&u.ap>=reloadCost&&(jammed||rounds<w.mag&&spare>0),
  reason:!w?'Open Inventory to manage this tool.':held?'In hand':pairedInHand(u,kind)?'Other hand · Use free':cost?'Draw · '+cost+' AP':'Draw · Free',
  reloadLabel:jammed?'Clear jam':'Reload'};
}
export function squadReadout(state,u,options={}){
 return {id:u.id,name:u.name,portrait:hudPortrait(u),deceased:isDeceased(u),hp:resource(u.hp,u.maxHp),stamina:resource(u.stamina,u.maxStamina),ap:resource(u.ap,u.maxAp),stance:stanceOf(u),movement:movementModeOf(u),status:isDeceased(u)?'Deceased':u.away?'Away':u.casualty==='captured'?'Captured':u.casualty==='quit'?'Left squad':u.hp<=0?(u.casualty==='bleeding'?'Bleeding · '+u.bleedTurns+' turns':'Stabilized'):u.pinned?'Pinned':u.burningTurns?'Burning':'',weapons:readyWeapons(u).map(k=>weaponReadout(state,u,k,options))};
}
