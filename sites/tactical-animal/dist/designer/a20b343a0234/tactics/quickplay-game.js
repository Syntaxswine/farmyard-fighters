import {createGame,refresh,WEAPONS} from './core/engine.js';
import {storeLayout} from './core/inventory.js';
import {initializeStats} from './character-stats.js';
import {medicalChest} from './inventory-tools.js';
import {normalizeQuickPlayTeam,quickPlayPreset} from './quickplay-presets.js';

export function createQuickPlayGame(seed,definition,detect=true,difficulty='easy',team){
 const ids=normalizeQuickPlayTeam(team),presets=ids.map(quickPlayPreset);
 const s=createGame(seed,definition,false,difficulty,{social:true,awareness:true,statSystem:true,rosterSeed:seed,
  cast:presets.map(p=>({name:p.name,species:p.species,weapon:p.weapons[0],stats:p.stats}))});
 const squad=s.units.filter(u=>u.team==='squad');
 squad.forEach((u,i)=>{
  const p=presets[i];u.quickPlayRole=p.id;u.weapon=p.weapons[0];u.slots=p.weapons.slice(0,2);
  // Replace starter supplies once, at creation. Never run this on a loaded save.
  u.ammo=Object.fromEntries(Object.keys(WEAPONS).map(kind=>[kind,0]));
  u.pack=p.weapons.map(kind=>{const rounds=WEAPONS[kind].mag;u.ammo[kind]=rounds;return {type:'weapon',kind,rounds,condition:100};});
  u.pack.push(...structuredClone(p.tools||[]));if(p.medicalChest)u.pack.push(medicalChest());
  u.ammoPouch={...p.reserve};u.medkits=p.medkits??1;u.wireCutters=true;u.utilityCells={};
  initializeStats(u,p.stats);if(!storeLayout(u))throw Error('Quick Fight loadout does not fit: '+p.label);
 });
 s.quickPlayTeam=ids;if(detect)refresh(s);return s;
}
