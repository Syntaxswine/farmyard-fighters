import {MAP_LEVELS} from './map-layers.js';
// Authored ruins store the identity of deliberately removed cells. The cells
// themselves stay absent, so no special passability or projectile rules apply.
export const BREAKABLE_FLOORS=new Set(['floor','bridge','ground-wood-planks','ground-concrete','ground-tiles','ground-asphalt']);
export const BREAKABLE_WALLS=new Set(['wall','wall-brick','wall-concrete','wall-corrugated','window-brick','window-concrete','window-corrugated']);
export const emptyBreaches=(levels=3)=>({edges:{},upper:Array.from({length:levels-1},()=>({}))});
export const breachesOf=m=>m.breaches??m.definition?.breaches;
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const edgeParts=key=>{const [axis,a,b,c='0']=key.split(':');return {axis,x:+a,y:+b,z:+c};};
const edgeKey=({axis,x,y,z})=>`${axis}:${x}:${y}`+(z?':'+z:'');
const edgeCells=p=>[p,{...p,x:p.x+(p.axis==='e'?1:0),y:p.y+(p.axis==='s'?1:0)}];
const inside=(p,x,y,size)=>p.x>=x&&p.x<x+size&&p.y>=y&&p.y<y+size;
const occupied=t=>!!t&&t!=='void';
export function breachErrors(m,size=240){
 const b=m.breaches;if(b===undefined)return [];
 if(!object(b)||!object(b.edges)||!Array.isArray(b.upper)||(b.upper.length<2||b.upper.length>=MAP_LEVELS||b.upper.length>(m.upper?.length??MAP_LEVELS-1))||!b.upper.every(object))return ['Invalid broken-wall or floor data.'];
 for(const [key,kind]of Object.entries(b.edges)){
  const p=edgeParts(key);
  if(!/^[es]:-?\d+:-?\d+(?::[1-5])?$/.test(key)||edgeKey(p)!==key||!edgeCells(p).some(q=>inside(q,0,0,size))||!BREAKABLE_WALLS.has(kind)||m.edges?.[key])return ['Invalid broken wall at '+key+'.'];
 }
 for(let layer=0;layer<b.upper.length;layer++)for(const [key,kind]of Object.entries(b.upper[layer])){
  const [x,y]=key.split(',').map(Number);
  if(!Number.isInteger(x)||!Number.isInteger(y)||key!==`${x},${y}`||!inside({x,y},0,0,size)||!BREAKABLE_FLOORS.has(kind)||occupied(m.upper?.[layer]?.[key]))return ['Invalid broken floor at '+key+', level '+(layer+2)+'.'];
 }
 return [];
}
export function cleanBreaches(m){
 const b=m.breaches;if(!b)return;
 for(const key of Object.keys(b.edges))if(m.edges?.[key])delete b.edges[key];
 for(let z=0;z<b.upper.length;z++)for(const key of Object.keys(b.upper[z]))if(occupied(m.upper?.[z]?.[key]))delete b.upper[z][key];
 if(!Object.keys(b.edges).length&&b.upper.every(layer=>!Object.keys(layer).length))delete m.breaches;
}
export function extractBreaches(m,x,y,size=24){
 if(!m.breaches)return {};const b=emptyBreaches(m.breaches.upper.length+1);
 for(const [key,kind]of Object.entries(m.breaches.edges)){const p=edgeParts(key);if(edgeCells(p).some(q=>inside(q,x,y,size)))b.edges[edgeKey({...p,x:p.x-x,y:p.y-y})]=kind;}
 for(let z=0;z<m.breaches.upper.length;z++)for(const [key,kind]of Object.entries(m.breaches.upper[z])){const [px,py]=key.split(',').map(Number);if(inside({x:px,y:py},x,y,size))b.upper[z][`${px-x},${py-y}`]=kind;}
 return {breaches:b};
}
export function placeBreaches(m,d,x,y){
 if(!d.breaches)return;const b=m.breaches??=emptyBreaches(d.breaches.upper.length+1);while(b.upper.length<d.breaches.upper.length)b.upper.push({});
 for(const [key,kind]of Object.entries(d.breaches.edges)){const p=edgeParts(key);b.edges[edgeKey({...p,x:p.x+x,y:p.y+y})]=kind;}
 for(let z=0;z<d.breaches.upper.length;z++)for(const [key,kind]of Object.entries(d.breaches.upper[z])){const [px,py]=key.split(',').map(Number);b.upper[z][`${px+x},${py+y}`]=kind;}
}
export function clearBlockBreaches(m,x,y,size=24){
 const b=m.breaches;if(!b)return;
 for(const key of Object.keys(b.edges))if(edgeCells(edgeParts(key)).some(p=>inside(p,x,y,size)))delete b.edges[key];
 for(let z=0;z<b.upper.length;z++)for(const key of Object.keys(b.upper[z])){const [px,py]=key.split(',').map(Number);if(inside({x:px,y:py},x,y,size))delete b.upper[z][key];}
}
