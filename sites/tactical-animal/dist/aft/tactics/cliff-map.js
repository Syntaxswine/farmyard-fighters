// Saved cliff tiles. Ground occupancy is separate from future elevated traversal.
export const CLIFF_PROPS=Object.freeze(Object.fromEntries(['ledge','crag'].map(family=>['cliff-'+family,{w:1,h:1,solid:true,cover:0,cliff:true}])));
export const isCliff=p=>!!CLIFF_PROPS[p?.kind];
export const CLIFF_LIMIT=2048;
export function cliffMapErrors(map){
 const tiles=(map.props||[]).filter(isCliff);
 if(tiles.length>CLIFF_LIMIT)return ['A map supports at most 2048 cliff tiles.'];
 for(const p of tiles){
  if(p.rotated)return ['Cliff contours use the corner mask, not prop rotation.'];
  if(p.cliffMask!==undefined&&(!Number.isInteger(p.cliffMask)||p.cliffMask<1||p.cliffMask>15))return ['Cliff corner mask must be 1–15.'];
  if(p.cliffVariant!==undefined&&(!Number.isInteger(p.cliffVariant)||p.cliffVariant<0||p.cliffVariant>2))return ['Cliff contour variant must be 0–2.'];
  if(p.cliffSand!==undefined&&(!Number.isFinite(p.cliffSand)||p.cliffSand<0||p.cliffSand>1))return ['Cliff sand blend must be 0–1.'];
 }
 // Shared corner occupancy must agree, otherwise independently clipped neighbors crack.
 const corners=new Map();
 for(const p of tiles)for(const [dx,dy,bit] of [[0,0,1],[1,0,2],[1,1,4],[0,1,8]]){
  const key=[p.x+dx,p.y+dy,p.z||0].join(','),occupied=!!((p.cliffMask??15)&bit);
  if(corners.has(key)&&corners.get(key)!==occupied)return ['Adjacent cliff tiles must agree on shared corners.'];
  corners.set(key,occupied);
 }
 return [];
}
export function cliffTiles(props,level){return props.filter(p=>isCliff(p)&&(p.z||0)===level).map(p=>({x:p.x,z:p.y,mask:p.cliffMask??15,variant:p.cliffVariant??0,set:p.kind.slice(6),sand:p.cliffSand??(p.kind==='cliff-crag'?1:0)}));}
