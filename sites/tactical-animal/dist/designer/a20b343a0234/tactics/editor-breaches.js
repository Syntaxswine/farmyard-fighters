import {MAP_LEVELS,mapLevelCount} from './map-layers.js';
import {BREAKABLE_WALLS,emptyBreaches,cleanBreaches} from './breach-data.js';
import {structureInfo,damageStructure} from './structure-health.js';
import {settleStructureCollapse} from './structure-collapse.js';
import {propCells} from './environment.js';

export function breakStructure(map,tool,p){
 const z=p.z||0,b=map.breaches??=emptyBreaches(mapLevelCount(map));while(b.upper.length<z)b.upper.push({});
 if(tool==='break-wall'){
  const kind=map.edges[p.edge];if(b.edges[p.edge]&&!kind)return false;
  if(!BREAKABLE_WALLS.has(kind))return false;
  b.edges[p.edge]=kind;delete map.edges[p.edge];delete map.edgeLocks?.[p.edge];return true;
 }
 if(!Number.isInteger(z)||z<1||z>=MAP_LEVELS)throw Error('Break floor uses an upper floor. Select an upper layer.');
 const info=structureInfo(map,p);if(!info||info.type!=='floor')return false;
 const at=q=>q.x===p.x&&q.y===p.y&&(q.z||0)===z;
 if([...(map.starts||[]),...(map.guards||[]),...(map.exits||[]),...(map.props||[]).flatMap(propCells),...(map.stairs||[]).flatMap(q=>[q,{...q,z:q.z+1}]),...(map.climbs||[]).flatMap(q=>[q,{x:q.x+q.dx,y:q.y+q.dy,z:q.z+1}])].some(at))throw Error('Move characters, objects and access links off this floor first.');
 const receipt=damageStructure(map,p,info.hp);b.upper[z-1][`${p.x},${p.y}`]=info.kind;
 const fallen=settleStructureCollapse(map,[receipt]);for(const [key,kind]of Object.entries(fallen.before.edges))if(BREAKABLE_WALLS.has(kind))b.edges[key]=kind;
 if(!Object.keys(map.structureHealth||{}).length)delete map.structureHealth;return true;
}
export function finishBreachEdit(map,tool,points,z){
 if(tool==='erase-edge')for(const p of points)delete map.breaches?.edges[p.edge];
 if(tool==='erase-tile'&&z)for(const p of points)delete map.breaches?.upper[z-1]?.[`${p.x},${p.y}`];
 cleanBreaches(map);
}
