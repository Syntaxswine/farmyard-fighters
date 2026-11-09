import {weaponExpansionArt} from './weapon-expansion-art.js';
export const CHARACTER_SPECIES=['horse','goat','donkey','sheep','cow','hen','pig-foreman','pig-director','skunk'];
export const ARMED_WEAPONS=['knife','pistol','rifle','assault'];
export const OVERLAY_WEAPONS=['flamethrower','grenade','launcher','rpg'];
export const CHARACTER_STANCES=['standing','kneeling','prone'];
export function characterArt(species,weapon='hands',pose='idle',stance='standing'){
 if(weapon==='pistol-offhand')weapon='pistol';
 const expanded=weaponExpansionArt(species,weapon,stance);if(expanded)return expanded;
 if(OVERLAY_WEAPONS.includes(weapon))return {...characterArt(species,'hands','idle',stance),overlay:weapon};
 if(stance==='kneeling'||stance==='prone')return {src:`../assets/characters/stances/${species}-${ARMED_WEAPONS.includes(weapon)?weapon:'hands'}-${stance}.png`,width:species==='skunk'&&stance==='prone'?512:384,height:256,anchor:[species==='skunk'&&stance==='prone'?256:192,244],contentHeight:stance==='kneeling'?176:96};
 if(species==='skunk')pose='idle';
 const armed=ARMED_WEAPONS.includes(weapon);
 return {src:armed?`../assets/characters/armed/${species}-${weapon}.png`:`../assets/characters/${species}-${pose}.png`,width:armed?256:192,height:256,anchor:[armed?128:96,244],contentHeight:236};
}
