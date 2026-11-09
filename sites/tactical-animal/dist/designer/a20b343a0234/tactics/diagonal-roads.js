export const ROAD_CORNERS=['nw','ne','se','sw'];
export const ROAD_GRASSES=['grass','cover-grass','meadow-0','meadow-1','meadow-2','meadow-3','sand','meadow-sand','concrete'];
export const DIAGONAL_ROADS=ROAD_GRASSES.flatMap(grass=>ROAD_CORNERS.flatMap(corner=>[false,true].map(border=>'road-diagonal-'+grass+'-'+corner+(border?'-border':''))));
export function diagonalRoad(id){if(!DIAGONAL_ROADS.includes(id))return null;const border=id.endsWith('-border'),base=border?id.slice(0,-7):id;return {grass:base.slice(14,-3),corner:base.slice(-2),border};}
export function roadSignedDistance(corner,x,y){return (corner==='nw'?1-x-y:corner==='ne'?x-y:corner==='se'?x+y-1:y-x)/Math.SQRT2;}
export function roadSurface(id,x,y){const r=diagonalRoad(id);if(!r)return null;const d=roadSignedDistance(r.corner,x,y);return r.border&&Math.abs(d)<.045?'concrete':d>=0?'asphalt':r.grass;}
export function roadLabel(id){const r=diagonalRoad(id);return r?'Diagonal road · '+r.corner.toUpperCase()+' road half · '+({grass:'grass','cover-grass':'dark grass',sand:'cliff sand','meadow-sand':'meadow / sand'}[r.grass]||r.grass)+(r.border?' · concrete border':''):id;}
