import * as T from './aft/tactics/vendor/three.module.js';
import {createShortMeasureArt} from './mission-art/short-measure/kit.js';
import {PLACEMENTS,GROUND_MARKINGS} from './mission-art/short-measure/manifest.js';
import {SOLIDS_DIGEST} from './mission-art/short-measure/solids.js';
import {coverRect,missionArtBindings,missionHasArt} from './mission-scenery.js';
import {missionForState,objectiveSecured} from './missions.js';
import {pointInWorldRect} from './world-grid.js';

const cell=(x,y)=>`${x},${y}`;
// Tiles under a footprint [west,north,east,south]; tiles are centred on integers.
function tilesUnder([west,north,east,south]){
  const tiles=[];
  for(let y=Math.floor(north+.5);y<=Math.floor(south+.5);y++)for(let x=Math.floor(west+.5);x<=Math.floor(east+.5);x++)tiles.push(cell(x,y));
  return tiles;
}

// Draws a mission's bespoke art kit with exactly the bindings the simulation
// registered (mission-scenery.js). Props follow map knowledge like cargo does;
// the collectible paper follows the objective. Returns null for missions
// without art.
// `bindings` defaults to what the simulation registered; tests pass others.
// `expectDigest` is the solid table the running simulation loaded: a page left
// open across a deploy can fetch this module newer than its rules, and must not
// draw art for collision it does not have. Refusing keeps the inherited cargo.
export function createMissionArt(state,{onLoading=()=>{},onError=()=>{},loader,bindings:override,expectDigest=SOLIDS_DIGEST}={}){
  const mission=missionForState(state);if(!missionHasArt(mission))return null;
  if(expectDigest!==SOLIDS_DIGEST){onError('The game was updated while this page was open. Reload to continue.');return null;}
  let disposed=false;
  const manager=new T.LoadingManager();
  manager.onStart=()=>{if(!disposed)onLoading(true);};
  manager.onLoad=()=>{if(!disposed)onLoading(false);};
  // The kit draws plain paper without its illustration; a failed load is cosmetic.
  manager.onError=url=>{if(!disposed)console.warn('Mission paper art could not load: '+url.split('/').at(-1));};
  const paper=(loader||new T.TextureLoader(manager)).load(new URL('./mission-art/short-measure/shipping-manifest.svg',import.meta.url).href);
  paper.colorSpace=T.SRGBColorSpace;
  const bindings=override??missionArtBindings(mission,state.map);
  const art=createShortMeasureArt({missionId:mission.id,bindings,collected:objectiveSecured(state),paperTexture:paper});
  // A registered solid that the kit refused would be collision nobody can see.
  const refused=art.skipped.filter(id=>bindings[id]);
  if(refused.length)onError('Mission art disagrees with its registered collision: '+refused.join(', '));
  const props=PLACEMENTS.map(p=>({anchor:{x:p.anchor[0],y:p.anchor[1]},tiles:tilesUnder(p.footprint),model:art.root.getObjectByName(p.id)})).filter(r=>r.model);
  const marks=GROUND_MARKINGS.map(m=>({anchor:{x:m.at[0],y:m.at[1]},tile:cell(Math.round(m.at[0]),Math.round(m.at[1])),mesh:art.root.getObjectByName(m.id)})).filter(r=>r.mesh);
  // Crate tiles whose visual an accepted cover replacement now owns. Never draw both.
  const replacedCells=new Set();
  for(const p of PLACEMENTS){
    const rect=coverRect(p.owner);if(!rect||!art.root.getObjectByName(p.id))continue;
    const [x,y,w,h]=rect;for(let cy=y;cy<y+h;cy++)for(let cx=x;cx<x+w;cx++)replacedCells.add(cell(cx,cy));
  }
  return {
    root:art.root,skipped:art.skipped,refused,replacedCells,
    update(state,window){
      if(disposed)return;
      for(const {anchor,tiles,model} of props)model.visible=pointInWorldRect(anchor,window)&&tiles.some(tile=>state.seen.has(tile));
      for(const {anchor,tile,mesh} of marks)mesh.visible=pointInWorldRect(anchor,window)&&state.seen.has(tile);
      art.setCollected(objectiveSecured(state));
    },
    dispose(){if(disposed)return;disposed=true;art.dispose();paper.dispose();},
  };
}
