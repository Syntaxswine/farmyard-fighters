export {PLACEMENTS,ART_REVISION,SOURCE_FEATURES_SHA256,AUTHORED_LAYOUT_SHA256} from './placements.js';
import {PLACEMENTS} from './placements.js';
export const TOWN_BOUNDS=Object.freeze([0,0,1440,1680]);
export const ATLAS_URL=new URL('./painted-materials-bbe33709.png',import.meta.url).href;
export const SOURCE_REVISION='2502646482218524fd5129641da769bb82462e4d';
export const REPLACEMENT_SOURCE_IDS=Object.freeze(PLACEMENTS.flatMap(p=>p.replacesSourceIds));
export const boundsIntersect=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
function checkBounds(b){if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[2]<b[0]||b[3]<b[1])throw Error('Supply [west,north,east,south] in town metres.');}
// Full-object bounds populate a small immutable index. No meshes allocated here.
const index=new Map(),cell=24;
for(const p of PLACEMENTS)for(let y=Math.floor(p.bounds[1]/cell);y<=Math.floor(p.bounds[3]/cell);y++)for(let x=Math.floor(p.bounds[0]/cell);x<=Math.floor(p.bounds[2]/cell);x++){const k=x+','+y;if(!index.has(k))index.set(k,new Set());index.get(k).add(p);}
export function placementsForBounds(bounds){checkBounds(bounds);const found=new Set();for(let y=Math.floor(bounds[1]/cell);y<=Math.floor(bounds[3]/cell);y++)for(let x=Math.floor(bounds[0]/cell);x<=Math.floor(bounds[2]/cell);x++)for(const p of index.get(x+','+y)||[])if(boundsIntersect(p.bounds,bounds))found.add(p);return [...found].sort((a,b)=>a.id.localeCompare(b.id));}
export function solidsForBounds(bounds){return placementsForBounds(bounds).flatMap(p=>p.solids.map((solid,i)=>({id:p.id+':solid:'+i,placementId:p.id,sourceIds:p.sourceIds,collisionPolicy:p.collisionPolicy,...solid})));}
// The height a walker stands at, in town metres: a raised pier deck's height where
// the point lies beside a deck piece, within its walking half width and not past its
// ends (the generator's rule for walkable deck cells, so a cell centre answers for
// its cell), otherwise 0.
const besideDeck=(p,[a,b],half)=>{const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length)return false;const along=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length,across=Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/length;return along>=-1e-9&&along<=length+1e-9&&across<=half+1e-9;};
export function deckHeightAt(point){if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))throw Error('Supply a town point [east,south].');let height=0;for(const p of placementsForBounds([point[0],point[1],point[0],point[1]]))if(p.kind==='pier'&&p.deck&&besideDeck(point,p.ends,p.deck.walkHalfWidthM))height=Math.max(height,p.deck.heightM);return height;}
