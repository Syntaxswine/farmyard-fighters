import {characterArt,ARMED_WEAPONS,CHARACTER_STANCES} from "./character-art.js";
import {weaponExpansionArt} from './weapon-expansion-art.js';
export const RED_HAT_SPECIES=["horse","goat","donkey","sheep","cow","hen","skunk","pig-foreman"];
export function unitArt(unit,pose='idle'){
 const stance=unit.stance||'standing';
 const expanded=weaponExpansionArt(unit.species,unit.weapon,stance,unit.outfit==='red-hats'?'red-hats':'normal');if(expanded)return expanded;
 if(['flamethrower','grenade','launcher','rpg'].includes(unit.weapon))return {...unitArt({...unit,weapon:'hands'},'idle'),overlay:unit.weapon};
 return (unit.outfit==='red-hats'?redHatArt(unit.species,unit.weapon||'hands',stance):null)||characterArt(unit.species,unit.weapon||'hands',pose,stance);
}
export {ARMED_WEAPONS,CHARACTER_STANCES};
export function redHatArt(species,weapon="hands",stance="standing"){
 if(!RED_HAT_SPECIES.includes(species)||!CHARACTER_STANCES.includes(stance))return null;
 const expanded=weaponExpansionArt(species,weapon,stance,'red-hats');if(expanded)return expanded;
 if(weapon!=="hands"&&!ARMED_WEAPONS.includes(weapon))return null;
 if(species==="pig-foreman")return characterArt(species,weapon,"idle",stance);
 if(species==="skunk"&&weapon==="hands"&&stance!=="standing")return {src:`../assets/characters/red-hats/skunk-hands-${stance}.png`,width:species==='skunk'&&stance==='prone'?512:384,height:256,anchor:[species==='skunk'&&stance==='prone'?256:192,244],contentHeight:stance==="kneeling"?176:96};
 if(weapon==="hands")return stance==="standing"?{src:`../assets/characters/red-hats/${species}-idle.png`,width:256,height:256,anchor:[128,244],contentHeight:236}:null;
 return {src:`../assets/characters/red-hats/${species}-${weapon}-${stance}.png`,width:species==='skunk'&&stance==='prone'?512:384,height:256,anchor:[species==='skunk'&&stance==='prone'?256:192,244],contentHeight:stance==="standing"?236:stance==="kneeling"?176:96};
}
