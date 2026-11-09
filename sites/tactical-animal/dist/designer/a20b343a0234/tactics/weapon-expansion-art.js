import {WEAPON_EXPANSION_FRAMES} from './weapon-expansion-frames.js';

export const EXPANSION_WEAPON_LABELS={
 shotgun:'Pump-action shotgun',smg:'PPSh submachine gun',sniper:'Sniper rifle',
 hmg:'Heavy machine gun','grenade-launcher':'Grenade launcher',rpg:'RPG',grenade:'Hand grenade',flamethrower:'Flamethrower',
};
export const EXPANSION_WEAPONS=Object.keys(EXPANSION_WEAPON_LABELS);
const key=(outfit,species,weapon,stance)=>`${outfit}/${species}/${weapon}/${stance}`;
const frames=new Map(WEAPON_EXPANSION_FRAMES.map(frame=>[key(frame.outfit,frame.species,frame.weapon,frame.stance),frame]));

export function weaponExpansionArt(species,weapon,stance='standing',outfit='normal'){
 if(weapon==='launcher')weapon='grenade-launcher';
 // The foreman's uniform is shared by both factions.
 if(species==='pig-foreman')outfit='normal';
 return frames.get(key(outfit,species,weapon,stance))||null;
}
