import {baseWeapon} from './one-handed.js';
// Each merc keeps a serializable share so supplies travel with the people,
// without references to another encounter or occupying backpack cells.
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const quantity=n=>Number.isSafeInteger(n)&&n>=0;
const key=k=>typeof k==='string'&&/^[a-z][a-z0-9-]*$/.test(k);
const owns=(o,k)=>Object.hasOwn(o||{},k)?o[k]:0;
const here=u=>u?.team==='squad'&&!u.away;
const available=u=>here(u)&&!['dead','captured','quit'].includes(u.casualty)&&(u.hp>0||['bleeding','stable'].includes(u.casualty));
const local=(u,kind)=>(u.pack||[]).filter(i=>i.type==='ammo'&&baseWeapon(i.kind)===kind).reduce((n,i)=>n+i.count,0);
const own=(u,kind)=>owns(u.ammoPouch,kind)+local(u,kind);
function accounts(s,u){if(!u)return [];return u.team==='squad'&&s?.units?.includes(u)?available(u)?s.units.filter(available):[]:[u];}
function put(pouch,kind,count){
 const next=owns(pouch,kind)+count;if(!key(kind)||!quantity(count)||!quantity(next))throw Error('Invalid squad ammunition.');
 if(next)pouch[kind]=next;
}
export const validAmmoItem=item=>item?.type==='ammo'&&key(item.kind)&&quantity(item.count)&&item.count>0;
export const canCreditSquadAmmo=(u,item)=>validAmmoItem(item)&&quantity(owns(u.ammoPouch,baseWeapon(item.kind))+item.count);
export function creditSquadAmmo(u,item){
 if(u?.team!=='squad'||!canCreditSquadAmmo(u,item))return false;
 u.ammoPouch??={};put(u.ammoPouch,baseWeapon(item.kind),item.count);return true;
}
export function migrateSquadAmmo(units){
 for(const u of units||[]){if(u?.team!=='squad'||!Array.isArray(u.pack))continue;
  const next={};for(const [kind,count]of Object.entries(u.ammoPouch||{}))put(next,baseWeapon(kind),count);for(const i of u.pack)if(i.type==='ammo')put(next,baseWeapon(i.kind),i.count);
  u.ammoPouch=next;u.pack=u.pack.filter(i=>i.type!=='ammo');
 }
}
export function ammoReserve(u,kind,s=null){kind=baseWeapon(kind);return accounts(s,u).reduce((n,v)=>n+own(v,kind),0);}
export function spendAmmo(u,kind,count,s=null){
 kind=baseWeapon(kind);
 if(!quantity(count)||ammoReserve(u,kind,s)<count)return false;
 const people=accounts(s,u).sort((a,b)=>(a===u?-1:b===u?1:a.id-b.id));
 for(const v of people){
  let n=Math.min(count,owns(v.ammoPouch,kind));if(n){v.ammoPouch[kind]-=n;if(!v.ammoPouch[kind])delete v.ammoPouch[kind];count-=n;}
  for(const i of v.pack||[])if(count&&i.type==='ammo'&&baseWeapon(i.kind)===kind){n=Math.min(count,i.count);i.count-=n;count-=n;}
  v.pack=v.pack.filter(i=>i.type!=='ammo'||i.count>0);if(!count)break;
 }return true;
}
export function sharedAmmoRows(s,u=s?.units?.find(available)){
 const people=accounts(s,u),kinds=new Set(people.flatMap(v=>[...Object.keys(v.ammoPouch||{}),...(v.pack||[]).filter(i=>i.type==='ammo').map(i=>i.kind)]).map(baseWeapon));
 return [...kinds].sort().map(kind=>({kind,count:ammoReserve(u,kind,s)})).filter(i=>i.count>0);
}
export function validAmmoPouches(units,weapons){
 const totals={};for(const u of units){if(u.ammoPouch===undefined)continue;
  if(u.team!=='squad'||!plain(u.ammoPouch))return false;
  for(const [kind,count]of Object.entries(u.ammoPouch)){
   if(!Object.hasOwn(weapons,kind)||!quantity(count)||!quantity(owns(totals,kind)+count))return false;
   totals[kind]=owns(totals,kind)+count;
  }
 }return true;
}
// Resolve membership changes without making the player move ammunition stacks.
export function settleSquadAmmo(s){
 const receivers=s.units.filter(available);
 for(const u of s.units.filter(u=>here(u)&&!available(u))){
  if(!Object.keys(u.ammoPouch||{}).length)continue;
  if(receivers.length){for(const [kind,count]of Object.entries(u.ammoPouch))creditSquadAmmo(receivers[0],{type:'ammo',kind,count});}
  else{const pile={x:u.x,y:u.y,z:u.z||0,items:Object.entries(u.ammoPouch).filter(([,count])=>count>0).map(([kind,count])=>({type:'ammo',kind,count}))};if(pile.items.length)s.loot.push(pile);}
  u.ammoPouch={};
 }
}
export function distributeSquadAmmo(units){
 const people=units.filter(available).sort((a,b)=>a.id-b.id);if(!people.length)return;
 const totals=sharedAmmoRows({units:people},people[0]);migrateSquadAmmo(people);for(const u of people)u.ammoPouch={};
 for(const {kind,count}of totals){
  const carriers=people.filter(u=>baseWeapon(u.weapon)===kind||u.pack.some(i=>i.type==='weapon'&&baseWeapon(i.kind)===kind)),recipients=carriers.length?carriers:people;
  const each=Math.floor(count/recipients.length),extra=count%recipients.length;
  recipients.forEach((u,i)=>{const n=each+(i<extra?1:0);if(n)creditSquadAmmo(u,{type:'ammo',kind,count:n});});
 }
}
