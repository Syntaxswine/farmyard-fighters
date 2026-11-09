import {noEquipmentDrops} from './loot-policy.js';
import {tileKey,levelOf} from './maps.js';
// Shared inventory and ground-loot sprites; legacy casualty dressing only before loot transfer.
export const LOOT_WEAPONS=['pistol','rifle','assault'];
export function inventoryArt(item){
 if(item.kind==='pistol-offhand')item={...item,kind:'pistol'};
 if(item.kind==='largeMedicalKit')return '../assets/equipment/large-medical-kit.svg';
 if(['grenade','launcher','rpg','shotgun','sniper','smg','hmg'].includes(item.kind)&&['weapon','ammo'].includes(item.type))return '../assets/equipment/'+item.kind+'.svg';
 if(item.kind==='flamethrower'&&['weapon','ammo'].includes(item.type))return '../assets/equipment/'+(item.type==='weapon'?'flamethrower':'fuel')+'.svg';
 const id=item.type==='weapon'&&LOOT_WEAPONS.includes(item.kind)?'gun-'+item.kind:item.type==='ammo'&&LOOT_WEAPONS.includes(item.kind)?'ammo-'+item.kind:item.kind==='medkits'?'first-aid-kit':item.kind==='wireCutters'?'wire-cutters':null;
 return id?`../assets/environment/loot/${id}.png`:null;
}
export function drawLootPile(ctx,load,pile,point,zoom){
 const sprites=[...new Set(pile.items.map(inventoryArt).filter(Boolean))];
 let drawn=false;
 for(const [i,src] of sprites.entries()){
  const img=load(src),size=(src.includes('/gun-')&&!src.includes('pistol')?40:23)*zoom;
  if(img.complete&&img.naturalWidth){ctx.drawImage(img,point.x+(i%3-1)*9*zoom-size/2,point.y+Math.floor(i/3)*6*zoom-size/2,size,size);drawn=true;}
 }
 return drawn;
}
export function deathDropArt(unit){
 if(noEquipmentDrops(unit)||unit.lootDropped||unit.hp>0||['bleeding','stable','captured'].includes(unit.casualty)||!LOOT_WEAPONS.includes(unit.weapon))return [];
 const weapon=unit.weapon;
 const drops=[{src:`../assets/environment/loot/gun-${weapon}.png`,size:weapon==='pistol'?23:40,dx:-4,dy:-2}];
 if((unit.ammo?.[weapon]??0)>0)drops.push({src:`../assets/environment/loot/ammo-${weapon}.png`,size:17,dx:11,dy:5});
 return drops;
}
export function fallenVisible(state,unit,level){
 return unit.casualty!=='captured'&&unit.hp<=0&&levelOf(unit)===level&&state.seen.has(tileKey(unit.x,unit.y,levelOf(unit)));
}
export function drawDeathDrops(ctx,load,unit,point,zoom){
 for(const drop of deathDropArt(unit)){
  const img=load(drop.src),size=drop.size*zoom;
  if(img.complete&&img.naturalWidth)ctx.drawImage(img,point.x+drop.dx*zoom-size/2,point.y+drop.dy*zoom-size/2,size,size);
 }
}
