import {paintFoliage} from './editor-foliage-brush.js';
import {buildFoliageObstacles,treePlacementRank} from './foliage-obstacles.js';
import {TREE_COVER,treeCoverOf} from './foliage-tree-cover.js';
import {foliageAt} from './foliage-data.js';

const key=t=>`${t.x},${t.y},${t.z}`;
export function foliageStrokePreview(source,command,size,oldTrees=buildFoliageObstacles(source,{treesOnly:true}).trees,population){
 // Only the overlay and legacy ground can be written by this brush. Geometry,
 // sight caches and the live document are never touched by preview generation.
 const map={...source,terrain:source.terrain.map(r=>[...r]),upper:source.upper.map(l=>({...l})),foliage:{...source.foliage}};
 const result=paintFoliage(map,command,size,{preview:true});let trees=oldTrees;
 if(result.cells.length){
  if(population&&command.options?.foliageMode==='tree-cover'&&command.tool!=='clear-foliage'){
   // Composition-only edits do not change eligibility. Filter the cached
   // authoritative population instead of rebuilding placement while dragging.
   const rank=treePlacementRank(map);trees=population.trees.filter(t=>population.baseline.has(key(t))||rank(t)<=TREE_COVER[treeCoverOf(foliageAt(map,t.x,t.y,t.z))].rank);
  }else trees=buildFoliageObstacles(map,{treesOnly:true}).trees;
 }
 const old=new Map(oldTrees.map(t=>[key(t),t])),next=new Set(trees.map(key));
 const cells=result.footprint,xs=cells.map(c=>c.x),ys=cells.map(c=>c.y),z=command.start.z||0;
 const minX=Math.min(...xs)-7,maxX=Math.max(...xs)+7,minY=Math.min(...ys)-7,maxY=Math.max(...ys)+7;
 const nearby=t=>t.z===z&&t.x>=minX&&t.x<=maxX&&t.y>=minY&&t.y<=maxY;
 return {...result,ok:true,trees:[...trees.filter(nearby).map(t=>({...t,change:old.has(key(t))?'retained':'added'})),...oldTrees.filter(t=>nearby(t)&&!next.has(key(t))).map(t=>({...t,change:'removed'}))]};
}
