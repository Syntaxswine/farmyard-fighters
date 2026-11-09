// Art-family IDs, not new terrain or collision IDs. Gameplay selects a family.
export const BIOME_FAMILIES=Object.freeze({
 jungle:{label:'Jungle',ground:'jungle',trees:['jungle-canopy','jungle-palm'],low:['jungle-broadleaf','jungle-fern'],reuse:[],description:'Buttressed crowns, arching palms and broad understory leaves.'},
 temperate:{label:'Temperate',ground:'temperate',trees:['temperate-broadleaf','temperate-pine'],low:['temperate-shrub','temperate-tuft'],reuse:['tree-broadleaf','tree-pine'],description:'The established broadleaf and pine, with meadow shrubs and tufts.'},
 snow:{label:'Snow',ground:'snow',trees:['snow-spruce','snow-alpine-pine'],low:['snow-scrub','snow-grass'],reuse:['pine-tier geometry'],description:'Narrow snowy spruce, open alpine boughs and low winter plants.'},
 dry:{label:'Dry grassland',ground:'dry',trees:['dry-acacia','dry-scrub-tree'],low:['dry-tussock','dry-shrub'],reuse:['shared bark and crown primitives'],description:'Flat spreading acacia, angular scrub and straw tussocks.'},
 wetlands:{label:'Wetlands',ground:'wetlands',trees:['wetland-cypress','wetland-willow'],low:['wetland-reeds','wetland-marsh-leaves'],reuse:['shared bark and crown primitives'],description:'Flared cypress, hanging willow, reeds and broad marsh leaves.'}
});
export const BIOME_PLANTS=Object.fromEntries(Object.entries(BIOME_FAMILIES).flatMap(([biome,f])=>[...f.trees.map(id=>[id,{biome,category:'tree',label:id.split('-').slice(1).join(' ')}]),...f.low.map(id=>[id,{biome,category:'low',label:id.split('-').slice(1).join(' ')}])]));
export const BIOME_TEXTURES={original:'../assets/environment/painted/foliage-atlas-v1.png',foliage:'../assets/environment/biome-foliage/foliage-atlas-v1.png',ground:'../assets/environment/biome-foliage/ground-atlas-v1.png'};
// Bounds are [column, row from TOP, columns, rows], before the sampling inset.
export const BIOME_PAINT={
 bark:{atlas:'original',panel:[1,1,2,2],projection:'bark'},
 leaves:{atlas:'original',panel:[1,0,2,2]},pine:{atlas:'original',panel:[0,1,2,2],projection:'needles'},
 jungle:{atlas:'foliage',panel:[0,0,4,2]},frond:{atlas:'foliage',panel:[1,0,4,2],projection:'uv'},
 dry:{atlas:'foliage',panel:[2,0,4,2]},wet:{atlas:'foliage',panel:[3,0,4,2],projection:'hanging'},cypress:{atlas:'original',panel:[0,1,2,2],projection:'needles'},
 snowPine:{atlas:'foliage',panel:[0,1,4,2],projection:'needles'},snow:{atlas:'foliage',panel:[1,1,4,2]},
 straw:{atlas:'foliage',panel:[2,1,4,2],projection:'uv'},moss:{atlas:'foliage',panel:[3,1,4,2]},
 blade:{atlas:'original',panel:[0,0,2,2],projection:'uv'},
};
export const BIOME_GROUNDS={jungle:[0,0,3,2],temperate:[1,0,3,2],snow:[2,0,3,2],dry:[0,1,3,2],wetlands:[1,1,3,2],mud:[2,1,3,2]};
export const GROUND_TILE_SIZE=2;
export const GROUND_VARIANTS=4;
export const MATURE_TREE_SCALE=1.8;
