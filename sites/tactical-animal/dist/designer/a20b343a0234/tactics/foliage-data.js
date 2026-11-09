import {MAP_LEVELS} from './map-layers.js';
import {FOLIAGE_PRESETS,validFoliagePreset} from './foliage-presets.js';
import {biomeFamilyAt} from './biome-family.js';
import {validTreeCover} from './foliage-tree-cover.js';
// [density percent, blocks walking, optional preset ID, optional tree-cover version].
// Ground remains authoritative for the plants' habitat and survives clearing.
import {BIOME_TERRAIN} from './biome-gameplay-data.js';
import {PROPS} from './environment.js';
import {SITE_PROPS} from './strategic-site-rules.js';
import {SCENERY_PROPS,isScenery,scenerySize} from './scenery-catalog.js';
const natural=new Set(['yard','ground-grass','ground-dirt','ground-gravel','woodland','woodland-dense',...Object.keys(BIOME_TERRAIN)]);
export const foliageGround=terrain=>natural.has(terrain);
export const foliageKey=(x,y,z=0)=>`${x},${y},${z}`;
export const foliageTerrain=(map,x,y,z=0)=>z?map.upper?.[z-1]?.[`${x},${y}`]||'void':(map.terrain||map.map)?.[y]?.[x]||'void';
export function foliageAt(map,x,y,z=0){
 const terrain=foliageTerrain(map,x,y,z);if(!foliageGround(terrain))return null;
 return map.foliage?.[foliageKey(x,y,z)]||(terrain==='woodland-dense'?[100,true]:terrain==='woodland'?[100,false]:null);
}
export const foliageBlocks=(map,x,y,z=0)=>!(map.knowledge&&!map.knowledge.has(z?foliageKey(x,y,z):`${x},${y}`))&&(foliageAt(map,x,y,z)?.[1]===true||foliageTreeAt(map,x,y,z));
export const foliageDepth=(map,x,y,z=0)=>(foliageAt(map,x,y,z)?.[0]||0)/100;
const treeHash=(x,y,seed)=>{let n=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(seed,1442695041);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
// Open woodland has isolated trunk tiles, never a solid wall of shrub cover.
// One candidate per 7x7 block, jittered by one tile, leaves at least four clear
// tiles between trunks even at maximum density. Collision and art use this rule.
export function foliageTreeAt(map,x,y,z=0){
 const cover=foliageAt(map,x,y,z);if(!cover||cover[1])return false;
 const seed=((map.environment?.field.seed??173)&0x7fffffff)+z*911,ox=(map.environment?.origin?.[0]||0)*240,oy=(map.environment?.origin?.[1]||0)*240,wx=x+ox,wy=y+oy,gx=Math.floor(wx/7),gy=Math.floor(wy/7);
 if(wx!==gx*7+2+Math.floor(treeHash(gx,gy,seed+83)*3)||wy!==gy*7+2+Math.floor(treeHash(gx,gy,seed+197)*3)||treeHash(gx,gy,seed+419)*100>=cover[0])return false;
 // Never plant in narrow strips or along the edge of a clearing or upper floor.
 for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
  const c=foliageAt(map,x+dx,y+dy,z);if(!c||c[1])return false;
  for(let above=z+1;above<=(map.upper?.length||0);above++){const t=map.upper[above-1]?.[`${x+dx},${y+dy}`];if(t&&t!=='void')return false;}
 }
 return foliageTreeSpaceAvailable(map,x,y,z,2);
}
export function foliageTreeSpaceAvailable(map,x,y,z,radius=2){
 for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)for(let above=z+1;above<=(map.upper?.length||0);above++){const t=map.upper[above-1]?.[`${x+dx},${y+dy}`];if(t&&t!=='void')return false;}
 const definition=map.definition||map,near=p=>(p.z||0)===z&&Math.abs(p.x-x)<=radius&&Math.abs(p.y-y)<=radius;
 if([...(definition.starts||[]),...(definition.guards||[]),...(definition.exits||[])].some(near))return false;
 if((map.stairs||[]).some(p=>(p.z===z||p.z+1===z)&&near({...p,z})))return false;
 if((map.climbs||[]).some(p=>near(p)||near({x:p.x+p.dx,y:p.y+p.dy,z:p.z+1})))return false;
 for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)for(const axis of ['e','s'])if(map.edges?.[`${axis}:${x+dx}:${y+dy}${z?':'+z:''}`])return false;
 for(const p of map.coverOccupiedProps||map.props||definition.props||[]){
  if((p.z||0)<z)continue;const rule=SITE_PROPS[p.kind]||SCENERY_PROPS[p.kind]||PROPS[p.kind]||{w:1,h:1},w=(isScenery(p)?scenerySize(p).w:p.rotated?rule.h:rule.w),h=(isScenery(p)?scenerySize(p).h:p.rotated?rule.w:rule.h);
  if(p.x<=x+radius&&p.x+w-1>=x-radius&&p.y<=y+radius&&p.y+h-1>=y-radius)return false;
 }
 return true;
}
export function foliageErrors(map,size=240){
 if(map.foliage===undefined)return [];
 if(!map.foliage||typeof map.foliage!=='object'||Array.isArray(map.foliage))return ['Invalid foliage overlay.'];
 for(const [key,value]of Object.entries(map.foliage)){
  const [x,y,z]=key.split(',').map(Number);
  if(key!==foliageKey(x,y,z)||![x,y,z].every(Number.isInteger)||x<0||y<0||x>=size||y>=size||z<0||z>=MAP_LEVELS||!Array.isArray(value)||![2,3,4].includes(value.length)||(value.length>=3&&!validFoliagePreset(value[2],value[1]))||!Number.isInteger(value[0])||value[0]<1||value[0]>100||typeof value[1]!=='boolean'||!foliageGround(foliageTerrain(map,x,y,z)))return ['Invalid foliage cell: '+key];
  if(value.length===4&&!validTreeCover(value[3],value[2]))return ['Invalid foliage tree cover at '+key+': '+String(value[3])+' requires a supported dense-thicket preset.'];
 }
 return [];
}
export function cleanFoliage(map){
 if(!map.foliage)return;
 for(const key of Object.keys(map.foliage)){const [x,y,z]=key.split(',').map(Number);if(!foliageGround(foliageTerrain(map,x,y,z)))delete map.foliage[key];}
 if(!Object.keys(map.foliage).length)delete map.foliage;
}
export function extractFoliage(map,x,y,size=24){
 const foliage={};for(const [key,value]of Object.entries(map.foliage||{})){const [a,b,z]=key.split(',').map(Number);if(a>=x&&b>=y&&a<x+size&&b<y+size)foliage[foliageKey(a-x,b-y,z)]=[...value];}
 return Object.keys(foliage).length?{foliage}:{};
}
export function placeFoliage(map,block,x,y,size=24){
 const foliage={...map.foliage};for(const key of Object.keys(foliage)){const [a,b]=key.split(',').map(Number);if(a>=x&&b>=y&&a<x+size&&b<y+size)delete foliage[key];}
 for(const [key,value]of Object.entries(block.foliage||{})){const [a,b,z]=key.split(',').map(Number);foliage[foliageKey(a+x,b+y,z)]=[...value];}
 if(Object.keys(foliage).length)map.foliage=foliage;else delete map.foliage;
}

// Legacy blocking wetlands retain their bog ground texture beneath the new
// dense sight screen. Unrelated impassable terrain gains no opacity.
export function foliagePreset(map,x,y,z=0){const c=foliageAt(map,x,y,z);return c?(c[2]||(!c[1]?'woodland-v1':biomeFamilyAt(map,x,y,z)==='wetlands'?'wetland-v1':'thicket-v1')):null;}
export function foliageRule(map,x,y,z=0){return FOLIAGE_PRESETS[foliagePreset(map,x,y,z)]||null;}

// A shared exclusion mask prevents collision where scenery replaces the plants.
export function foliageOccupied(map){
 const occupied=new Set();
 for(const p of map.coverOccupiedProps||map.props||[]){const rule=SITE_PROPS[p.kind]||SCENERY_PROPS[p.kind]||PROPS[p.kind]||{w:1,h:1},w=(isScenery(p)?scenerySize(p).w:p.rotated?rule.h:rule.w),h=(isScenery(p)?scenerySize(p).h:p.rotated?rule.w:rule.h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)occupied.add(foliageKey(p.x+x,p.y+y,p.z||0));}
 return occupied;
}
