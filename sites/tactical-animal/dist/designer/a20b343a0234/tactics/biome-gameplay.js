import {MAP_LEVELS} from './map-layers.js';
import {synchronizeFoliage} from './foliage-obstacles.js';
import {foliageAt,foliageTerrain,foliageGround,foliageTreeAt,foliageRule,foliageOccupied} from './foliage-data.js';
import {DIMENSIONS} from './hybrid-world.js';
import {BIOME_TERRAIN,biomeTree} from './biome-gameplay-data.js';
export {BIOME_TERRAIN,BIOME_TERRAIN_NAMES,biomeTree} from './biome-gameplay-data.js';
export {biomeOverride,biomeFamilyAt,biomeSeed} from './biome-family.js';
import {biomeFamilyAt,biomeSeed} from './biome-family.js';
export function biomeEnabled(map){return !!(map.environment||map.foliage||map.props?.some(p=>biomeTree(p.kind))||(map.terrain||map.map||[]).some(row=>row.some(t=>BIOME_TERRAIN[t]||t==='woodland'||t==='woodland-dense'))||(map.upper||[]).some(layer=>Object.values(layer).some(t=>BIOME_TERRAIN[t]||t==='woodland'||t==='woodland-dense')));}
// The map's overlay remains the sole authority for movement. Art never writes a
// generated study mask back into the map or turns decorative plants into walls.
export function biomePlans(map,obstacles){
 if(!biomeEnabled(map))return [];
 obstacles??=synchronizeFoliage(map);
 const terrain=map.terrain||map.map,width=terrain[0].length,depth=terrain.length,plans=[];
 const occupied=foliageOccupied(map);
 const ledges=new Set((map.props||[]).filter(p=>p.kind==='cliff-ledge'&&(p.cliffMask??15)===15).map(p=>`${p.x},${p.y},${(p.z||0)+1}`));
 const origin=map.environment?.origin?.map(n=>n*240)||[0,0];
 for(let level=0;level<=Math.min(MAP_LEVELS-1,map.upper?.length||0);level++){
  const families=new Map(),heights=new Float64Array(width*depth).fill(NaN),density=new Uint8Array(width*depth),blocked=new Uint8Array(width*depth),natural=new Uint8Array(width*depth),familyAt=new Array(width*depth);
  for(let y=0;y<depth;y++)for(let x=0;x<width;x++){
   const t=foliageTerrain(map,x,y,level),i=y*width+x;if(!foliageGround(t)||occupied.has(`${x},${y},${level}`))continue;
   heights[i]=ledges.has(`${x},${y},${level}`)?(level-1)*DIMENSIONS.floorSpacing+2:level*DIMENSIONS.floorSpacing;
   natural[i]=1;const family=foliageRule(map,x,y,level)?.family||biomeFamilyAt(map,x,y,level);familyAt[i]=family;if(!families.has(family))families.set(family,[]);
   const cover=foliageAt(map,x,y,level);if(cover){density[i]=cover[0];blocked[i]=cover[1]?1:0;if(blocked[i])families.get(family).push([x,y]);}
  }
  const index=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<width&&y<depth?y*width+x:-1;
  const heightAt=(x,y)=>{const h=heights[index(x,y)];return Number.isFinite(h)?h:null;};
  const blockedAt=(x,y)=>blocked[index(x,y)]===1,densityAt=(x,y)=>(density[index(x,y)]||0)/100;
  for(const [family,cells]of families)plans.push({width,depth,level,family,cells,origin,seed:biomeSeed(map),heightAt,blockedAt,densityAt,
   obstacles,trees:obstacles.trees.filter(t=>t.z===level&&t.family===family),
   opaqueAt:(x,y)=>!!foliageRule(map,x,y,level)?.opaque,
   includeAt:(x,y)=>familyAt[index(x,y)]===family,
   naturalAt:(x,y)=>natural[index(x,y)]===1,
   familyAt:(x,y)=>familyAt[index(x,y)],
   treeAt:(x,y)=>foliageTreeAt(map,x,y,level),
   passableCells:()=>{const result=[];for(let y=0;y<depth;y++)for(let x=0;x<width;x++){const i=y*width+x;if(familyAt[i]===family&&density[i]&&!blocked[i])result.push({x,y,height:heights[i],density:density[i]});}return result;}
  });
 }
 return plans;
}
