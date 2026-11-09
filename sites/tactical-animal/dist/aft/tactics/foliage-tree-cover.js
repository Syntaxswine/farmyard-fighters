// Placement versions are independent of the undergrowth/sight-screen preset.
// Never change these thresholds for an existing saved version.
export const TREE_COVER=Object.freeze({
 'brush-v1':{label:'Brush-led',rank:-1},
 'mixed-v1':{label:'Mixed canopy',rank:.30},
 'trees-v1':{label:'Tree-led',rank:1}
});
export const denseTreePreset=id=>id==='thicket-v1'||id==='wetland-v1';
export const treeCoverOf=cell=>cell?.[3]||'brush-v1';
export const validTreeCover=(id,preset)=>Object.hasOwn(TREE_COVER,id)&&denseTreePreset(preset);
export function treeCoverSelection(cells){
 const values=new Set(cells.filter(Boolean).map(treeCoverOf));
 return values.size>1?'multiple':values.values().next().value||'brush-v1';
}
