export const STAT_DEFINITIONS=[['strength','Strength'],['endurance','Endurance'],['dexterity','Dexterity'],['agility','Agility'],['intelligence','Intelligence'],['perception','Perception'],['mechanical','Mechanical'],['medical','Medical'],['firearms','Firearms'],['heavyWeapons','Heavy weapons'],['explosives','Explosives'],['leadership','Leadership'],['sneak','Sneak'],['climbing','Climbing']];
export const STAT_VERSION=2;
export const BASE_STATS={strength:25,endurance:30,dexterity:35,agility:35,intelligence:40,perception:40,mechanical:15,medical:15,firearms:35,heavyWeapons:15,explosives:15,leadership:20,sneak:25,climbing:50};
export const GUARD_STATS={...BASE_STATS,strength:20,endurance:25,agility:30,firearms:40,heavyWeapons:35,perception:45};
// Starting balance profiles, independent of species. Maps may override any value.
export const MERC_STATS={
 Yakov:{strength:60,endurance:60,dexterity:55,agility:58,intelligence:55,perception:60,mechanical:30,medical:10,firearms:65,heavyWeapons:55,explosives:30,leadership:75,sneak:30},
 Anya:{strength:40,endurance:45,dexterity:80,agility:70,intelligence:60,perception:75,mechanical:25,medical:25,firearms:80,heavyWeapons:30,explosives:45,leadership:40,sneak:75},
 Misha:{strength:70,endurance:75,dexterity:55,agility:45,intelligence:75,perception:50,mechanical:85,medical:45,firearms:50,heavyWeapons:65,explosives:65,leadership:45,sneak:25},
 Vera:{strength:40,endurance:55,dexterity:65,agility:50,intelligence:85,perception:65,mechanical:25,medical:90,firearms:40,heavyWeapons:15,explosives:20,leadership:65,sneak:45}
};
export const statValue=(v,fallback=1)=>Math.max(1,Math.min(100,Math.round(Number.isFinite(v)?v:fallback)));
export function normalizeStats(value={},base=BASE_STATS){return Object.fromEntries(STAT_DEFINITIONS.map(([key])=>[key,statValue(value?.[key],base[key]??BASE_STATS[key])]));}
// Add only the new field to old saves. Never heal, refill AP, or conceal invalid values.
export function migrateClimbing(u){if(u?.stats&&u.stats.climbing===undefined&&(u.statVersion??1)<2){u.stats.climbing=BASE_STATS.climbing;u.statVersion=STAT_VERSION;}return u;}
export function weaponSkill(weapon){if(['hands','knife'].includes(weapon))return null;if(weapon==='grenade')return 'explosives';if(['hmg','rpg','launcher','flamethrower'].includes(weapon))return 'heavyWeapons';return 'firearms';}
export function weaponAccuracy(u,weapon=u.weapon){if(!u.stats)return u.accuracy;const skill=weaponSkill(weapon),dex=statValue(u.stats.dexterity);return skill?statValue(u.stats[skill])*.75+dex*.25:dex;}
export function effectiveSkill(u,key){if(!u.stats)return u[key]||0;return Math.min(100,statValue(u.stats[key])+(key==='medical'||key==='mechanical'?Math.floor(statValue(u.stats.intelligence)/10):0));}
export const damageResistance=u=>u?.stats?Math.ceil(statValue(u.stats.endurance)/10):0;
export const damageAfterResistance=(u,damage)=>Math.max(0,damage-damageResistance(u));
export function refreshStats(u,{refill=false}={}){if(!u.stats)return u;u.stats=normalizeStats(u.stats);u.statVersion=STAT_VERSION;u.maxHp=50+u.stats.strength;u.maxStamina=50+u.stats.endurance;u.maxAp=4+Math.round(14*(u.stats.agility-1)/99);u.damageResistance=damageResistance(u);u.accuracy=weaponAccuracy(u);u.medical=effectiveSkill(u,'medical');u.stealth=u.stats.sneak;u.perception=u.stats.perception;
 for(const [current,max]of [['hp','maxHp'],['ap','maxAp'],['stamina','maxStamina']])u[current]=refill?u[max]:Math.min(u[max],Math.max(0,Number.isFinite(u[current])?u[current]:u[max]));return u;
}
export function initializeStats(u,overrides={}){u.stats=normalizeStats(overrides,u.team==='guard'?GUARD_STATS:MERC_STATS[u.name]||BASE_STATS);return refreshStats(u,{refill:true});}
export function migrateStats(u){if(!u.stats){const legacy={...BASE_STATS,strength:(u.maxHp??75)-50,agility:1+((u.maxAp??9)-4)*99/14,medical:u.medical,perception:u.perception,sneak:u.stealth};legacy.firearms=((u.accuracy??35)-BASE_STATS.dexterity*.25)/.75;u.stats=normalizeStats(legacy);}return refreshStats(u);}
export function trainStat(u,key){const aliases={shooting:'firearms',vitality:'strength',mobility:'agility',stealth:'sneak'};key=aliases[key]||key;if(!u.stats||!Object.hasOwn(u.stats,key)||!Number.isInteger(u.skillPoints)||u.skillPoints<1||u.stats[key]>=100)return false;u.skillPoints--;u.stats[key]++;refreshStats(u);return true;}
