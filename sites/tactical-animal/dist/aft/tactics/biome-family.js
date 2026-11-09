import {foliageTerrain,foliageGround} from './foliage-data.js';
import {localEnvironmentFamily} from './environment-regions.js';
import {isCliff} from './cliff-map.js';
import {BIOME_TERRAIN} from './biome-gameplay-data.js';
export function biomeOverride(map,x,y,z=0){
 const terrain=foliageTerrain(map,x,y,z);if(BIOME_TERRAIN[terrain])return BIOME_TERRAIN[terrain];
 if(['ground-dirt','ground-gravel'].includes(terrain))return 'dry';
 if(z&&foliageGround(terrain)&&(map.props||[]).some(p=>isCliff(p)&&p.x===x&&p.y===y&&(p.z||0)===z-1&&(p.cliffSand??0)>=.5))return 'dry';
 return null;
}
export function biomeFamilyAt(map,x,y,z=0){
 const explicit=biomeOverride(map,x,y,z);if(explicit)return explicit;
 if(map.environment){const family=localEnvironmentFamily(map.environment,x+.5,y+.5);return family==='dry-grassland'?'dry':family;}
 return 'temperate';
}
export function biomeSeed(map){return (map.environment?.field.seed??173)&0x7fffffff;}
