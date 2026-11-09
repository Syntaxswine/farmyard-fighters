import {SHORT_MEASURE_SOLIDS,SOLIDS_DIGEST} from './mission-art/short-measure/solids.js';
import {CRATE_DIMENSIONS} from './world-dimensions.js';
// The solid table this simulation registered; the art view must have the same.
export const SCENERY_DIGEST=SOLIDS_DIGEST;

// Bespoke mission scenery registered with the authoritative simulation. The
// art kit draws these solids; this module is what movement, sight and weapons
// query, so neither side can be accepted without the other.
//   prop: a placement's ground reservation. It blocks walking, grenade landings
//         and reach, but never sight or projectiles.
//   part: one solid piece of the model with its own [z0, height] span. It blocks
//         bullets, grenade arcs, flame and prone sight where it is, and leaves the
//         air around it open. Walking never asks it.
// A cover-owned placement (owner 'cover:x,y,w,h') keeps the mission's crate cells
// as its reservation and adds only its parts.
const ART={
  'short-measure':{
    layoutVersion:1,solids:SHORT_MEASURE_SOLIDS,
    // A prop that embodies a clue or the objective may be reached into.
    interactions:{'worker-scale':'worker-scale','sealed-load':'sealed-load','shipping-manifest':'shipping-manifest'},
    // Full sack loads conceal a target like crates do for the to-hit cover rule.
    cover:['sealed-load-arrival'],
  },
};
// A marker or hand above an embodied clue clears the prop's top by this much.
const ANCHOR_CLEARANCE=.28;

function artFor(mission){
  const art=ART[mission?.id];
  return art&&(mission.layoutVersion??1)===art.layoutVersion?art:null;
}
export const missionHasArt=mission=>!!artFor(mission);
export function coverRect(owner){
  const match=/^cover:(\d+),(\d+),(\d+),(\d+)$/.exec(owner||'');
  return match?match.slice(1).map(Number):null;
}
// A cover-owned placement stands only where every one of its cells is a crate.
function coverPresent(rect,terrain){
  const [x,y,w,h]=rect;
  for(let cy=y;cy<y+h;cy++)for(let cx=x;cx<x+w;cx++)if(terrain?.[cy]?.[cx]!=='crate')return false;
  return true;
}

export function missionScenery(mission,terrain){
  const art=artFor(mission);if(!art)return [];
  const boxes=[];
  for(const solid of art.solids){
    const interactionId=art.interactions[solid.id],tag=interactionId?{interactionId}:{},rect=coverRect(solid.owner);
    if(rect&&!coverPresent(rect,terrain))continue;
    if(!rect){
      const [x0,y0,x1,y1]=solid.footprint;
      boxes.push({x0,x1,y0,y1,height:solid.height,kind:'prop',placementId:solid.id,...(art.cover.includes(solid.id)?{cover:true}:{}),...tag});
    }
    for(const [x0,x1,y0,y1,z0,z1] of solid.parts)boxes.push({x0,x1,y0,y1,z0,height:z1,kind:'part',placementId:solid.id,...tag});
  }
  return boxes;
}

// What the simulation registered, in the kit's binding shape. A cover-owned
// placement reports the envelope of the crate cells actually on the map, so a
// collider that disagrees with the art makes the kit refuse the model.
export function missionArtBindings(mission,terrain){
  const art=artFor(mission),bindings={};if(!art)return bindings;
  for(const solid of art.solids){
    let footprint=[...solid.footprint],height=solid.height;
    const rect=coverRect(solid.owner);
    if(rect){
      if(!coverPresent(rect,terrain))continue;
      const [x,y,w,h]=rect,{half}=CRATE_DIMENSIONS;
      footprint=[x-half,y-half,x+w-1+half,y+h-1+half];height=CRATE_DIMENSIONS.height;
    }
    bindings[solid.id]={owner:solid.owner,footprint,height,occlusion:{mode:'solid-mesh-parts',shapeKey:solid.shapeKey}};
  }
  return bindings;
}

// The registered solid that embodies this clue, if any, lifts its marker and
// interaction hand above the model instead of leaving them inside it.
export function clueAnchorHeight(mission,object,fallback){
  const base=object.anchorHeight??fallback,art=artFor(mission);
  if(!art||object.kind!=='clue')return base;
  const solid=art.solids.find(solid=>art.interactions[solid.id]===object.id);if(!solid)return base;
  // An authored anchor that already clears the prop stays exactly as authored.
  const lifted=solid.height+ANCHOR_CLEARANCE;
  return lifted>base+1e-9?lifted:base;
}
