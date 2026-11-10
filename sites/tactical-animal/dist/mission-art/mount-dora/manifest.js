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
// the point lies on a drawn deck piece (its full width, including the run past a
// bend joint), otherwise 0. Within half the width of a joint the deck also counts:
// past a bend the run already covers that disc, and at a nearly straight joint it
// closes the hairline wedge (under 2 cm) that two square ends leave, where the
// generator's round joint band still lets a walker stand. The town asks about the
// centre of the walker's cell, so a walker stands on the deck wherever the drawn
// deck covers their cell's centre.
export function deckCovers(q,p){const [a,b]=p.ends,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),half=p.width/2,[before,after]=p.deck.extend??[0,0],joints=p.deck.joints??[false,false];if(!length)return false;
 const along=((q[0]-a[0])*dx+(q[1]-a[1])*dy)/length,across=Math.abs((q[0]-a[0])*dy-(q[1]-a[1])*dx)/length;
 if(across<=half+1e-9&&along>=-before-1e-9&&along<=length+after+1e-9)return true;
 return [a,b].some((end,k)=>joints[k]&&Math.hypot(q[0]-end[0],q[1]-end[1])<=half+1e-9);}
export function deckHeightAt(point){if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))throw Error('Supply a town point [east,south].');let height=0;for(const p of placementsForBounds([point[0],point[1],point[0],point[1]]))if(p.kind==='pier'&&p.deck&&deckCovers(point,p))height=Math.max(height,p.deck.heightM);return height;}
