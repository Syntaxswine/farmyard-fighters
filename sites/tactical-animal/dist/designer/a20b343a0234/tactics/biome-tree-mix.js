import {groundHash} from './biome-ground-composition.js';

// Reuse actual authored models together, not just rotations of one species.
// Weights retain a biome's dominant trees while sharing suitable existing forms.
// These IDs are consumed by both rendering and physical trunk/branch cover.
export const BIOME_TREE_MIXES=Object.freeze({
 jungle:Object.freeze({'jungle-canopy':4,'jungle-palm':3,'temperate-broadleaf':2}),
 temperate:Object.freeze({'temperate-broadleaf':4,'temperate-pine':3,'wetland-willow':2,'dry-scrub-tree':1}),
 snow:Object.freeze({'snow-spruce':4,'snow-alpine-pine':3,'temperate-pine':2}),
 dry:Object.freeze({'dry-acacia':4,'dry-scrub-tree':3,'temperate-pine':2}),
 wetlands:Object.freeze({'wetland-cypress':4,'wetland-willow':4,'temperate-broadleaf':2})
});

export function biomeTreeModels(family){
 const mix=BIOME_TREE_MIXES[family];if(!mix)throw Error('Unknown tree biome: '+family);
 return Object.keys(mix);
}

export function selectBiomeTree(family,worldX,worldY,seed=173){
 const ids=biomeTreeModels(family),mix=BIOME_TREE_MIXES[family];
 let choice=groundHash(worldX,worldY,seed+587)*ids.reduce((n,id)=>n+mix[id],0),id=ids.at(-1);
 for(const candidate of ids){choice-=mix[candidate];if(choice<0){id=candidate;break;}}
 return {id,variant:Math.floor(groundHash(worldX,worldY,seed+701)*3)};
}
