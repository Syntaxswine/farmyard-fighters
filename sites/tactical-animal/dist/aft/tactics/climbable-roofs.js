import {MAP_LEVELS} from './map-layers.js';
import {mapGeometryRevision} from './map-geometry-cache.js';
export const GAP_ROOF_KINDS=['north','east','south','west'].map(side=>'roof-flat-parapet-gap-'+side);
export const ROOF_KINDS=['roof-corrugated-flat','roof-corrugated-sloped','roof-flat-parapet'];
export const roofVisualKind=kind=>kind.replace(/^roof-climbable-/,'roof-');
export const climbableRoofKind=kind=>ROOF_KINDS.includes(kind)?kind.replace('roof-','roof-climbable-'):kind;
export const isClimbableRoof=p=>!!p?.kind&&ROOF_KINDS.includes(roofVisualKind(p.kind))&&!p.kind.includes('parapet');
export function roofLabel(kind){if(GAP_ROOF_KINDS.includes(kind))return 'Parapet roof · ladder gap '+kind.split('-').at(-1);if(kind==='roof-climbable-flat-parapet')return 'Flat parapet roof (legacy · blocked)';const names={'roof-corrugated-flat':'Corrugated flat roof','roof-corrugated-sloped':'Corrugated sloped roof','roof-flat-parapet':'Flat parapet roof'};return (names[roofVisualKind(kind)]||kind)+(kind.startsWith('roof-climbable-')?' (legacy variant)':'');}
const cache=new WeakMap();
function index(map){const props=map.props||[];const revision=mapGeometryRevision(map),cached=cache.get(props);if(cached&&cached.revision===revision)return cached;const links=[],byTile=new Map(),seen=new Set();for(const p of props){if(!isClimbableRoof(p)||!(p.z>0&&p.z<MAP_LEVELS))continue;for(let y=p.y;y<p.y+2;y++)for(let x=p.x;x<p.x+2;x++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const q={x:x-dx,y:y-dy,z:p.z-1,dx,dy},id=[q.x,q.y,q.z,dx,dy].join(',');if(seen.has(id))continue;seen.add(id);links.push(q);for(const key of [`${q.x},${q.y},${q.z}`,`${x},${y},${p.z}`]){if(!byTile.has(key))byTile.set(key,[]);byTile.get(key).push(q);}}}const result={links,byTile,revision};cache.set(props,result);return result;}
// Geometry and current collision validity are checked by roofValid at lookup time.
export const automaticRoofClimbs=map=>index(map).links;
export const automaticRoofLinksAt=(map,p)=>index(map).byTile.get(`${p.x},${p.y},${p.z||0}`)||[];

// Each entry is a solid one-tile parapet boundary; the gap removes one entry.
export function parapetEdges(p){
 if(!p.kind?.includes('flat-parapet'))return [];
 const gap=p.kind.includes('-gap-')?p.kind.split('-').at(-1):null,edges=[];
 for(const side of ['north','east','south','west'])for(let i=0;i<2;i++){
  if(side===gap&&i===0)continue;
  let a=side==='north'?[i,0]:side==='south'?[i,1]:side==='west'?[0,i]:[1,i];
  let b=side==='north'?[i,-1]:side==='south'?[i,2]:side==='west'?[-1,i]:[2,i];
  if(p.rotated){a=[1-a[1],a[0]];b=[1-b[1],b[0]];}
  edges.push({a:{x:p.x+a[0],y:p.y+a[1],z:p.z||0},b:{x:p.x+b[0],y:p.y+b[1],z:p.z||0}});
 }return edges;
}
const parapetCache=new WeakMap(),pointKey=p=>[p.x,p.y,p.z||0].join(','),boundaryKey=(a,b)=>[pointKey(a),pointKey(b)].sort().join('|');
function parapets(map){const props=map.props||[];const revision=mapGeometryRevision(map),cached=parapetCache.get(props);if(cached&&cached.revision===revision)return cached;const edges=new Set(),tiles=new Set();for(const p of props)if(p.kind?.includes('flat-parapet')){for(const e of parapetEdges(p))edges.add(boundaryKey(e.a,e.b));for(let x=p.x;x<p.x+2;x++)for(let y=p.y;y<p.y+2;y++)tiles.add(pointKey({x,y,z:p.z}));}const result={edges,tiles,revision};parapetCache.set(props,result);return result;}
export const parapetBlocks=(map,a,b)=>parapets(map).edges.has(boundaryKey(a,b));
export const parapetAt=(map,p)=>parapets(map).tiles.has(pointKey(p));
