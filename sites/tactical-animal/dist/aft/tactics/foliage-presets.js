// Versioned gameplay presets. Decorative density never weakens an opaque screen.
export const FOLIAGE_PRESETS=Object.freeze({
 'woodland-v1':{label:'Open woodland',blocked:false,opaque:false,height:0,summary:'Walk between trees. Sight and shots pass through gaps; trunks stop both.'},
 'thicket-v1':{label:'Dense thicket',blocked:true,opaque:true,height:2.2,summary:'Impassable. Leaves block sight; trunks and deadfall stop shots.'},
 'wetland-v1':{label:'Dense wetland thicket',blocked:true,opaque:true,height:2.2,family:'wetlands',summary:'Impassable reeds and willow growth. Sight is blocked; waterlogged wood stops shots.'},
 'bog-v1':{label:'Open bog',blocked:true,opaque:false,height:0,family:'wetlands',summary:'Unsafe footing, including the land patches. Open sight and fire except through trees.'}
});
export const validFoliagePreset=(id,blocked)=>Object.hasOwn(FOLIAGE_PRESETS,id)&&FOLIAGE_PRESETS[id].blocked===blocked;
