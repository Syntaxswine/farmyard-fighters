// Existing editor generator, using the pinned rule modules.
import {validateFeaturePlan,fitsFeaturePlan,requiredConnections} from './core/feature-plan.js';
import {blankMap,validateMap,passable,blockedEdge,levelOf} from './core/maps.js';
import {validateBlock,openBlock,applyData} from './core/blocks.js';
import {connectionSet,connectionsMatch,seamsMatch} from './core/connections.js';
export function generateConnectedMap(designs,seed=7,plan=null){
 if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('Use a whole-number seed between 0 and 4294967295.');
 if(!designs.length)throw Error('Save at least one block with all four connections assigned.');
 if(designs.length>128)throw Error('Use at most 128 connected blocks in the generation library.');
 const catalog=designs.map(d=>{validateBlock(d);return {d,ports:connectionSet(openBlock(d),0,0,d.connections)};});
 if(plan){validateFeaturePlan(plan);const missing=[];for(let y=0;y<10;y++)for(let x=0;x<10;x++)if(!catalog.some(c=>fitsFeaturePlan(c.d,c.ports,plan,x,y)))missing.push((x+1)+','+(y+1)+' ['+Object.entries(requiredConnections(plan,x,y)).map(([d,t])=>d+':'+t).join(' ')+']');if(missing.length)throw Error('Missing blocks for '+missing.length+' sectors: '+missing.slice(0,5).join('; '));}
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 for(let i=catalog.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[catalog[i],catalog[j]]=[catalog[j],catalog[i]];}
 let attempts=0;const placed=[];
 function solve(index,guards){if(index===100)return true;if(++attempts>20000)return false;const x=index%10,y=Math.floor(index/10),offset=Math.floor(random()*catalog.length);for(let i=0;i<catalog.length;i++){const c=catalog[(i+offset)%catalog.length];if(plan&&!fitsFeaturePlan(c.d,c.ports,plan,x,y))continue;if(guards+c.d.guards.length>46)continue;if(x&&!connectionsMatch(placed[index-1].ports.east,c.ports.west))continue;if(x&&!seamsMatch(placed[index-1].d,c.d,'east'))continue;if(y&&!connectionsMatch(placed[index-10].ports.south,c.ports.north))continue;if(y&&!seamsMatch(placed[index-10].d,c.d,'south'))continue;placed[index]=c;if(solve(index+1,guards+c.d.guards.length))return true;}placed.length=index;return false;}
 if(!solve(0,0))throw Error('No matching 10×10 layout found within 20,000 searches. Add compatible continuation or empty blocks; the map is unchanged.');
 const m=blankMap('Connected blocks '+seed);m.blockConnections={};if(plan)m.featurePlan=structuredClone(plan);
 placed.forEach(({d},i)=>{const sx=i%10,sy=Math.floor(i/10);applyData(m,d,sx*24,sy*24,true);m.blockConnections[sx+','+sy]=structuredClone(d.connections);});
 // Find five mutually adjacent, free ground cells for the squad and travel point.
 let spawn=null;for(let y=1;y<239&&!spawn;y++)for(let x=1;x<239&&!spawn;x++){const cells=[{x,y,z:0},{x:x-1,y,z:0},{x:x+1,y,z:0},{x,y:y-1,z:0},{x,y:y+1,z:0}];if(cells.every(p=>passable(m,p)&&!m.guards.some(g=>g.x===p.x&&g.y===p.y&&levelOf(g)===0))&&cells.slice(1).every(p=>!blockedEdge(m,cells[0],p))){m.starts=cells.slice(0,4);m.exits=[cells[4]];spawn=cells;}}
 if(!spawn)throw Error('The matched layout has no valid connected squad start or contains inaccessible guards. Adjust the blocks and try another seed.');
 const errors=validateMap(m);if(errors.length)throw Error(errors[0]);
 return m;
}
