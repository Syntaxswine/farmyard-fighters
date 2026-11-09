import {MAP_LEVELS} from '../map-layers.js';
import {floorTerrain,EDGES,propAt,PROPS} from './environment.js';
export const DIRECTIONS=['north','east','south','west'];
export const CONNECTION_TYPES=['none','fence','road','river','wall','cliff'];
const key=(x,y,z=0)=>`${x},${y}${z?','+z:''}`;
const tile=(m,x,y,z)=>z?(m.upper?.[z-1]?.[key(x,y)]||'void'):m.terrain[y][x];
// N/S offsets run west to east; E/W offsets run north to south.
export function connectionProfile(m,sx,sy,direction,type){
 if(!CONNECTION_TYPES.includes(type)||!DIRECTIONS.includes(direction))throw Error('Unknown connection type or direction.');
 const horizontal=direction==='north'||direction==='south',x0=sx*24,y0=sy*24;
 const points=Array.from({length:24},(_,i)=>({x:x0+(horizontal?i:direction==='east'?23:0),y:y0+(horizontal?direction==='south'?23:0:i)}));
 const roads=[],rivers=[],fences=[],walls=[],heights=[];
 points.forEach((p,i)=>{const t=tile(m,p.x,p.y,0);if(t==='ground-asphalt')roads.push(i);if(t==='water')rivers.push(i);let height=0;for(let z=1;z<MAP_LEVELS;z++)if(floorTerrain(tile(m,p.x,p.y,z)))height=z;heights.push(height);
 if(i===23)return;for(let z=0;z<MAP_LEVELS;z++){const edge=(horizontal?'e':'s')+':'+p.x+':'+p.y+(z?':'+z:'');const material=m.edges[edge];if(material?.startsWith('fence-'))fences.push({position:i,level:z,material});else if(material==='wall'||material?.startsWith('wall-'))walls.push({position:i,level:z,material:material==='wall'?'wall-concrete':material});}});
 const transitions=heights.slice(1).filter((h,i)=>h!==heights[i]).length;
 const present=[roads.length&&'road',rivers.length&&'river',fences.length&&'fence',walls.length&&'wall',transitions&&'cliff'].filter(Boolean);
 if(present.length>1)throw Error(direction+': only one element may meet this boundary.');
 if(type==='none'){if(present.length)throw Error(direction+': boundary contains '+present[0]+', not None.');return {type,level:heights[0]};}
 if(present[0]!==type)throw Error(direction+': draw a '+type+' reaching this boundary first.');
 if(type==='road'||type==='river'){for(const p of points){const t=tile(m,p.x,p.y,0);if(t!==(type==='road'?'ground-asphalt':'water'))continue;const seam=(horizontal?'s':'e')+':'+(p.x-(direction==='west'?1:0))+':'+(p.y-(direction==='north'?1:0));if(EDGES[m.edges[seam]]?.solid||PROPS[propAt(m,p.x,p.y,0)?.kind]?.solid)throw Error(direction+': '+type+' connection is blocked at the boundary.');}const cells=type==='road'?roads:rivers;if(cells.at(-1)-cells[0]+1!==cells.length)throw Error(direction+': use one continuous '+type+' opening.');if(type==='road'&&(cells[0]!==9||cells.length!==6))throw Error(direction+': roads must be six tiles wide and centered (tiles 10–15).');return {type,position:cells[0],width:cells.length,level:0};}
 if(type==='fence'||type==='wall'){const entries=type==='fence'?fences:walls;if(entries.length!==1)throw Error(direction+': only one '+type+' may continue through the boundary.');return {type,...entries[0]};}
 if(transitions!==1)throw Error(direction+': a cliff needs one elevation change along the boundary.');
 return {type,position:heights.findIndex((h,i)=>i&&h!==heights[i-1])-1,lowOffsetHeight:heights[0],highOffsetHeight:heights[23]};
}
export function connectionSet(m,sx,sy,types){
 if(!types||Array.isArray(types)||typeof types!=='object'||Object.keys(types).length!==4||DIRECTIONS.some(d=>!Object.hasOwn(types,d)||!CONNECTION_TYPES.includes(types[d])))throw Error('Choose exactly one element for each of north, east, south and west.');
 return Object.fromEntries(DIRECTIONS.map(d=>[d,connectionProfile(m,sx,sy,d,types[d])]));
}
export const connectionsMatch=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validateConnections(m){
 const records=m.blockConnections;if(records===undefined)return [];
 if(!records||Array.isArray(records)||typeof records!=='object')return ['Invalid block connection records.'];
 const errors=[],profiles={};for(const [k,types]of Object.entries(records)){const [sx,sy]=k.split(',').map(Number);if(!Number.isInteger(sx)||!Number.isInteger(sy)||sx<0||sy<0||sx>9||sy>9||k!==sx+','+sy){errors.push('Invalid connected sector.');continue;}try{profiles[k]=connectionSet(m,sx,sy,types);}catch(e){errors.push('Sector '+(sx+1)+','+(sy+1)+': '+e.message);}}
 for(const [k,p]of Object.entries(profiles)){const [x,y]=k.split(',').map(Number);for(const [other,a,b]of [[(x+1)+','+y,'east','west'],[x+','+(y+1),'south','north']])if(profiles[other]&&!connectionsMatch(p[a],profiles[other][b]))errors.push('Connection mismatch between sectors '+k+' and '+other+'.');}
 return errors;
}
// A shared seam may be authored by either neighbor; two explicit materials must agree.
export function seamsMatch(a,b,direction){const opposite={east:'west',south:'north'}[direction];const entries=(d,side)=>{const out={};for(const [k,v]of Object.entries(d.edges)){const [axis,x,y,z='0']=k.split(':');if(side==='east'&&axis==='e'&&+x===23||side==='west'&&axis==='e'&&+x===-1)out[y+':'+z]=v+'|'+(d.edgeLocks?.[k]||0);if(side==='south'&&axis==='s'&&+y===23||side==='north'&&axis==='s'&&+y===-1)out[x+':'+z]=v+'|'+(d.edgeLocks?.[k]||0);}return out;};const left=entries(a,direction),right=entries(b,opposite);return Object.keys(left).every(k=>right[k]===undefined||right[k]===left[k]);}
