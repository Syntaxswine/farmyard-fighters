import {normalizeStats} from './character-stats.js';

// Roles belong to Quick Fight. Campaign recruits and authored map starts keep
// their own identities, statistics and equipment.
const preset=(id,name,species,label,description,weapons,stats,reserve,extra={})=>({id,name,species,label,description,weapons,stats:normalizeStats(stats),reserve,...extra});
export const QUICKPLAY_PRESETS=[
 preset('heavy','Yakov','horse','Heavy specialist','Flamethrower and RPG. Fire, armour and demolition.',
  ['flamethrower','rpg'],{strength:90,endurance:80,dexterity:65,agility:55,perception:60,firearms:55,heavyWeapons:90,explosives:55,leadership:65},
  {flamethrower:8,rpg:3}),
 preset('gunner','Anya','goat','Machine gunner','Heavy machine gun with a pistol backup.',
  ['hmg','pistol'],{strength:80,endurance:75,dexterity:75,agility:60,perception:70,firearms:70,heavyWeapons:90,leadership:45},
  {hmg:150,pistol:24}),
 preset('demolition','Misha','donkey','Demolition expert','Pistol and six grenades. SMG and a spare pistol in the backpack.',
  ['pistol','grenade','smg','pistol-offhand'],{strength:65,endurance:65,dexterity:85,agility:70,intelligence:70,perception:60,mechanical:60,firearms:65,heavyWeapons:45,explosives:90},
  {smg:105,pistol:24,grenade:3},{tools:[{type:'tool',kind:'demolitionCharge',count:2}]}),
 preset('rifleman','Vera','sheep','Rifleman','AK-47 with a pistol backup. A mobile all-rounder.',
  ['assault','pistol'],{strength:60,endurance:65,dexterity:75,agility:70,perception:75,firearms:85,heavyWeapons:35,explosives:35,leadership:70,sneak:55},
  {assault:90,pistol:24}),
 preset('sniper','Sasha','skunk','Sniper','Sniper rifle, pistol and strong observation skills.',
  ['sniper','pistol'],{strength:50,endurance:55,dexterity:90,agility:65,perception:95,firearms:95,leadership:45,sneak:85},
  {sniper:20,pistol:24}),
 preset('doctor','Nadia','cow','Doctor','Rifle, pistol, three first-aid kits and a ten-use medical chest.',
  ['rifle','pistol'],{strength:55,endurance:65,dexterity:75,agility:65,intelligence:90,perception:65,medical:95,firearms:65,leadership:60},
  {rifle:25,pistol:24},{medkits:3,medicalChest:true})
];
export const DEFAULT_QUICKPLAY_TEAM=Object.freeze(['heavy','gunner','demolition','rifleman']);
export const quickPlayPreset=id=>QUICKPLAY_PRESETS.find(p=>p.id===id);
export const validQuickPlayTeam=value=>Array.isArray(value)&&value.length===4&&new Set(value).size===4&&value.every(id=>!!quickPlayPreset(id));
export const normalizeQuickPlayTeam=value=>validQuickPlayTeam(value)?[...value]:[...DEFAULT_QUICKPLAY_TEAM];
export function quickPlayTeamFromSearch(search,fallback){const value=new URLSearchParams(search).get('team')?.split(',');return validQuickPlayTeam(value)?value:normalizeQuickPlayTeam(fallback);}
export function quickPlayEntry(search='',savedState=null){
 const q=new URLSearchParams(search);
 if(q.has('campaign')||q.has('study')||q.has('editorPlaytest'))return false;
 return !q.has('load')||validQuickPlayTeam(savedState?.quickPlayTeam);
}
