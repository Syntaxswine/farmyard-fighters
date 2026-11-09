// Five ordinary playable layers, plus a sixth for authored roofs, towers or
// unusually high terrain. Old three-layer documents retain their exact shape.
export const MAP_LEVELS=6,PLAYABLE_LEVELS=MAP_LEVELS-1,CANOPY_LEVEL=MAP_LEVELS-1;
export const validLayerCount=n=>Number.isInteger(n)&&n>=3&&n<=MAP_LEVELS;
export const mapLevelCount=map=>map.levels??map.definition?.levels??((map.upper?.length??2)+1);
export function ensureMapLayer(map,z){
 if(!Number.isInteger(z)||z<0||z>=MAP_LEVELS)throw Error(`Choose an editing layer from 1 to ${MAP_LEVELS}.`);
 map.upper??=[{},{}];while(map.upper.length<z)map.upper.push({});
 map.levels=Math.max(map.levels??3,z+1);
}
