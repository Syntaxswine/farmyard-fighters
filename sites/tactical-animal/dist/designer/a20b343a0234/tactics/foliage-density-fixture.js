import {blankMap} from './core/maps.js';
import {BIOME_FAMILIES} from './biome-foliage-data.js';
import {paintFoliage} from './editor-foliage-brush.js';

export const FOLIAGE_DENSITIES=Object.freeze([35,65,85,100]);
export const FOLIAGE_DENSITY_FRAMES=Object.freeze({
 overview:{focus:[119.5,1.3,119.5],horse:[120,0,127],ppu:6.25},
 clearing:{focus:[120,1.3,124],horse:[120,0,127],ppu:22},
 corridor:{focus:[148,1.3,101],horse:[148,0,104],ppu:32},
});

// Use the map maker's actual area brush, including its placement exclusions.
// The cleared routes and seed are identical at every density. Percentages are
// sampling thresholds, not a promise that that fraction of land is tree canopy.
export function foliageDensityCommands(density=65,growth='woodland'){
 if(!Number.isInteger(density)||density<1||density>100)throw Error('Choose foliage density from 1 to 100.');
 if(!['woodland','thicket'].includes(growth))throw Error('Unknown foliage growth: '+growth);
 const rectangle=(tool,x,y,ex,ey)=>({tool,start:{x,y,z:0},end:{x:ex,y:ey,z:0},options:{foliageShape:'rectangle'}});
 return [
  {...rectangle('foliage-cover',72,72,167,167),options:{foliageShape:'rectangle',foliageDensity:density,foliageBlocked:growth==='thicket',foliagePreset:growth==='thicket'?'thicket-v1':'woodland-v1'}},
  rectangle('clear-foliage',118,72,120,167),
  rectangle('clear-foliage',72,126,167,128),
  {tool:'clear-foliage',start:{x:120,y:126,z:0},options:{foliageShape:'round',foliageSize:17}},
  rectangle('clear-foliage',148,72,148,125),
 ];
}

export function foliageDensityFixture(family='temperate',density=65,growth='woodland',{painted=true}={}){
 if(!BIOME_FAMILIES[family])throw Error('Unknown foliage habitat: '+family);
 const commands=foliageDensityCommands(density,growth),map=blankMap(`Foliage fill · ${family} · ${density}% · ${growth}`);
 for(const row of map.terrain)row.fill('ground-biome-'+family);
 map.starts=[{x:120,y:127,z:0},{x:121,y:127,z:0},{x:120,y:128,z:0},{x:121,y:128,z:0}];
 map.exits=[{x:119,y:170,z:0}];
 if(painted)for(const command of commands)paintFoliage(map,command,240);
 return map;
}
