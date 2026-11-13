import {createRealtimeRules,validateRealtime,awardRealtimeKill,shotSeconds,grenadeSeconds,FIRE_MODES} from './realtime-combat.js';
import {boundedElapsed,SIMULATION_STEP_SECONDS} from './frame-timing.js';
import {TOUR_ID,getTourWorld,bindTourWorld,isTour} from './mount-dora-activity.js';
import {encodeTourProgress} from './mount-dora-progress.js';
import {trunkDistance,trunkSpan} from './trunk-geometry.js';
import {WEAPONS,AIM_ZONES} from './aft/tactics/solo-weapon-data.js';
import {initializeStats,weaponAccuracy,damageAfterResistance} from './aft/tactics/character-stats.js';
import {QUICKPLAY_PRESETS} from './aft/tactics/quickplay-presets.js';
import {identifyRange,headingTo} from './aft/tactics/core/perception.js';
import {shotAim} from './aft/tactics/aim-levels.js';
import {bodyIntersection} from './designer/a20b343a0234/tactics/ballistic-shot.js';
import {angularHelicoidShot,failedShotRoll,placeHelicoidMiss,rollMarginScatter,seededShots} from './designer/a20b343a0234/tactics/helicoid-shot.js';
import {grenadeDamage} from './designer/a20b343a0234/tactics/grenade-ballistics.js';
import {WALL_DIMENSIONS,CRATE_DIMENSIONS} from './world-dimensions.js';
import {missionScenery} from './mission-scenery.js';
import {windowSystem} from './window-catalogue.js';
import {legacyWallSpan,windowToLocal} from './window-system.js';
import {bindWallMaterials,damageWall,restoreWallDamage,wallGaps} from './wall-damage.js';
import {adaptAftSector} from './aft-sector.js';
import {WINDOW_REVIEW_ID} from './window-review-map.js';
import {createInteractionSystem,missionInteractables,interactionFootprint} from './interactions.js';
import {recordFlame} from './flame-event.js';
import {createFireRules,firePending,recordBurn} from './solo-fire.js';
import {createFuelRules,tankExplosionChance} from './solo-fuel.js';
import {createBarrelRules} from './solo-barrels.js';
import {barrelId,isExplosiveBarrel,barrelRayHit} from './aft/tactics/explosive-barrels.js';
export {tankExplosionChance} from './solo-fuel.js';
import {gridDimensions,worldBounds} from './world-grid.js';
import {woodlandDepth} from './designer/a20b343a0234/tactics/core/woodland.js';
import {DEFAULT_MISSION_ID,getMission,missionForState,missionMap,objectiveSecured} from './missions.js';
export {MISSIONS,FIRST_REALTIME_MISSION,DEFAULT_MISSION_ID,getMission,missionForState,missionMap,objectiveSecured,missionDestination} from './missions.js';

// Continuous positions are authoritative. Raster cells describe scenery and fog;
// movement, AP, sightlines, and weapon range use actual world distances.
const EPS=1e-7,RADIUS=.23;
export const ANIMALS=QUICKPLAY_PRESETS;
export const PRIMARY=['assault','rifle','smg','shotgun','sniper','hmg','flamethrower','rpg'];
export const SECONDARY=['pistol','knife'],UTILITIES=['dressing','grenade'];
export const DEFAULT_BUILD=Object.freeze({animal:'rifleman',primary:'assault',secondary:'pistol',utility:'dressing'});
// Preserve the original public brief for existing callers. Active operations
// resolve their own definition through missionForState instead.
export const BRIEF=getMission(DEFAULT_MISSION_ID);
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const key=(x,y)=>`${Math.round(x)},${Math.round(y)}`;
export const hero=s=>s.units.find(u=>u.team==='squad');
export const alive=u=>!!u&&u.hp>0;
export const movementModeOf=u=>u.sneaking?'sneak':u.running?'run':'walk';
export const movementRate=u=>(u.stance==='prone'?8:u.stance==='kneeling'?4:2)*(u.running?.5:u.sneaking?1.5:1);
export const movementSpeed=u=>u.realtimeMovement?(u.stance==='prone'?3.6:u.stance==='kneeling'?7.2:14.4)*(u.sneaking?.5:1):(u.stance==='prone'?1.8:u.stance==='kneeling'?3.6:7.2)*(u.running?2:u.sneaking?.5:1);
export const combatCosts=s=>!s.realtime&&(['player','enemy'].includes(s.phase)||s.units.some(g=>g.team==='guard'&&alive(g)&&g.alert));
export const canControl=(s,u)=>alive(u)&&!u.burningTurns&&u.team==='squad'&&['explore','player','won'].includes(s.phase)&&s.solo.status==='active';
export function validBuild(b){return !!b&&ANIMALS.some(a=>a.id===b.animal)&&PRIMARY.includes(b.primary)&&SECONDARY.includes(b.secondary)&&UTILITIES.includes(b.utility);}
export function normalizeBuild(b){
  if(!validBuild(b))return {...DEFAULT_BUILD};
  const {animal,primary,secondary,utility,fireMode}=b;
  return {animal,primary,secondary,utility,...(FIRE_MODES.includes(fireMode)?{fireMode}:{})};
}
export function buildStats(b){const p=ANIMALS.find(a=>a.id===b.animal),u={team:'squad',name:p.name};initializeStats(u,p.stats);return u;}
export function log(s,message){s.log.unshift(message);s.log=s.log.slice(0,35);s.revision++;}
function makeUnit(id,team,name,species,weapon,x,y,heading,stats){const u={id,team,name,species,weapon,x,y,z:0,heading,stance:'standing',running:false,sneaking:false,travelled:0,isMoving:false,alert:false,lastKnown:null,alertAge:0,slots:[weapon],pack:[],ammo:{[weapon]:WEAPONS[weapon].mag},ammoPouch:{[weapon]:WEAPONS[weapon].mag*3}};initializeStats(u,stats);return u;}
function makeGuard(post,id,stats,townPlayer){
  const guard=makeUnit(id,'guard',post.name||post.character?.displayName||'Guard '+id,post.species,post.weapon,post.x,post.y,post.heading??0,stats);
  if(post.patrol?.length)guard.patrol=structuredClone(post.patrol);
  if(townPlayer){
    // The usual 50-point base pools would leave a half-strength guard
    // with most of the player's health and stamina.
    guard.hp=guard.maxHp=Math.round(townPlayer.maxHp/2);
    guard.stamina=guard.maxStamina=Math.round(townPlayer.maxStamina/2);
    guard.ap=guard.maxAp=Math.round(townPlayer.maxAp/2);
  }
  return guard;
}
function mapMetadata(state,map){
  // Mission scenery belongs to the full world, regardless of render residency.
  for(const name of ['props','obstacles','worldBounds','groundPalette','windows']){
    if(map[name]===undefined)delete state[name];
    else state[name]=structuredClone(map[name]);
  }
  bindWallMaterials(state,map.wallMaterials);
}
export function createSoloGame(build=DEFAULT_BUILD,seed=1947,missionId=DEFAULT_MISSION_ID,{layoutVersion,authoredMap,tourWorld:walkingWorld}={}){
  if(!validBuild(build))throw Error('Choose a valid animal and loadout.');
  if((missionId===TOUR_ID)!==!!walkingWorld)throw Error('The walking tour needs its loaded town sources.');
  if(authoredMap&&missionId!==WINDOW_REVIEW_ID)throw Error('Authored maps use the window playtest.');
  const mission=getMission(missionId,layoutVersion),p=ANIMALS.find(a=>a.id===build.animal),m=walkingWorld?walkingWorld.descriptor():authoredMap?adaptAftSector(authoredMap):missionMap(mission.id,mission.layoutVersion??1),spawn=walkingWorld?.startPoint||authoredMap?.starts?.[0]||mission.spawn;
  if(!insideWorld({map:m.terrain,worldBounds:m.worldBounds},spawn))throw Error('Place a ground-level start in the map designer.');
  const u=makeUnit(0,'squad',p.name,p.species,build.primary,spawn.x,spawn.y,spawn.heading??270,p.stats);
  u.slots=[build.primary,build.secondary];const kinds=[...u.slots,...(build.utility==='grenade'?['grenade']:[])];
  u.ammo=Object.fromEntries(kinds.map(k=>[k,WEAPONS[k].mag]));u.pack=kinds.map(kind=>({type:'weapon',kind,rounds:u.ammo[kind],condition:100}));if(build.secondary==='pistol')u.ammoPouch.pistol=24;
  const stats=walkingWorld?.guardRosterVersion?Object.fromEntries(Object.entries(u.stats).map(([key,value])=>[key,Math.max(1,Math.round(value/2))])):{strength:10,endurance:20,agility:22,firearms:35,perception:35,dexterity:35};
  const posts=walkingWorld?.guardPosts??(authoredMap?authoredMap.guards||[]:mission.guards);
  if(authoredMap&&(posts.length>128||posts.some(g=>!g||!WEAPONS[g.weapon]||!['horse','goat','bull','cow','donkey','sheep','skunk','pig-foreman','pig-director','rabbit','dog','hen'].includes(g.species)||!insideWorld({map:m.terrain,worldBounds:m.worldBounds},g))))throw Error('Unsupported authored guard.');
  const units=[u,...posts.map((g,i)=>makeGuard(g,walkingWorld?g.id:i+1,stats,walkingWorld?.guardRosterVersion?u:null))];
  if(mission.fallen){const f=mission.fallen,fallen=makeUnit(units.length,'guard',f.name,f.species,f.weapon,f.x,f.y,f.heading,stats);fallen.hp=0;fallen.casualty='dead';units.push(fallen);}
  const s={map:m.terrain,edges:m.edges,units,interactables:missionInteractables({missionId:mission.id,layoutVersion:mission.layoutVersion??1}),phase:'explore',round:0,selected:0,visible:new Set(),seen:new Set(),detected:new Set(),log:[],seed,revision:0,queue:[],enemyIndex:1,enemyDelay:0,elapsed:0,solo:{version:2,missionId:mission.id,layoutVersion:mission.layoutVersion??1,build:{...build},objectives:{},inspected:[],ledger:false,status:'active',dressings:build.utility==='dressing'?2:0,distance:0,apDistance:0}};
  if(authoredMap){s.solo.authoredMap=structuredClone(authoredMap);s.interactables=(m.doors||[]).map(({interactive,...door})=>({...door}));}
  mapMetadata(s,m);if(walkingWorld){s.tour={version:1,sourceRevision:walkingWorld.sourceRevision,artRevision:walkingWorld.artRevision};bindTourWorld(s,walkingWorld);}
  windowSystem.restore(s);interactionRules.restore(s);refresh(s);log(s,mission.briefing);return s;
}
const geometryCache=new WeakMap(),GEOMETRY_BUCKET=8;
export function geometry(s){
  const town=getTourWorld(s);if(town)return town.geometryBoxes();
  if(geometryCache.has(s))return geometryCache.get(s).boxes;const boxes=[],gaps=wallGaps(s);
  for(const [k,kind] of Object.entries(s.edges)){
    const span=legacyWallSpan(k,gaps,WALL_DIMENSIONS.length);if(kind==='door'||!span)continue;const [axis,xs,ys]=k.split(':'),x=+xs+(axis==='e'?.5:0),y=+ys+(axis==='s'?.5:0);
    const hx=(axis==='e'?WALL_DIMENSIONS.thickness:WALL_DIMENSIONS.length)/2,hy=(axis==='s'?WALL_DIMENSIONS.thickness:WALL_DIMENSIONS.length)/2;
    const door=s.interactables?.find(object=>object.kind==='door'&&object.edge===k),interactionId=door?.id;
    boxes.push({x0:axis==='s'?span.min:x-hx,x1:axis==='s'?span.max:x+hx,y0:axis==='e'?span.min:y-hy,y1:axis==='e'?span.max:y+hy,height:WALL_DIMENSIONS.height,kind:door?.seeThrough?'prop':'wall',...(interactionId?{interactionId}:kind==='wall'?{wallEdge:k}:{})});
  }
  const cargo=missionForState(s).cover.filter(p=>s.interactables?.some(object=>object.kind==='clue'&&object.id===p.id));
  const {width,height}=gridDimensions(s);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(s.map[y][x]==='crate'){
    const placement=cargo.find(({rect:[cx,cy,w,h]})=>x>=cx&&x<cx+w&&y>=cy&&y<cy+h);
    const {half,height:crateHeight}=CRATE_DIMENSIONS;
    boxes.push({x0:x-half,x1:x+half,y0:y-half,y1:y+half,height:crateHeight,kind:'crate',...(placement?{interactionId:placement.id}:{})});
  }
  for(const box of s.obstacles||[])boxes.push({...box});
  boxes.push(...windowSystem.boxes(s));
  for(const box of missionScenery(missionForState(s),s.map))boxes.push({...box});
  for(const object of s.interactables||[])if(object.kind==='chest'||object.kind==='door'&&object.open)boxes.push({...interactionFootprint(object),kind:object.kind==='door'?object.seeThrough?'prop':'wall':'crate',interactionId:object.id});
  const layers={};
  for(const [name,keep] of Object.entries(GEOMETRY_LAYERS)){
    const buckets=new Map();layers[name]=buckets;
    for(const box of boxes)if(keep(box))for(let y=Math.floor(box.y0/GEOMETRY_BUCKET);y<=Math.floor(box.y1/GEOMETRY_BUCKET);y++)for(let x=Math.floor(box.x0/GEOMETRY_BUCKET);x<=Math.floor(box.x1/GEOMETRY_BUCKET);x++){
      const id=`${x},${y}`;if(!buckets.has(id))buckets.set(id,[]);buckets.get(id).push(box);
    }
  }
  geometryCache.set(s,{boxes,layers});return boxes;
}
// Each question gets its own broad phase, and the layer IS the kind filter:
// walking never sifts a prop's parts, standing sight looks only at walls, and
// anything in flight skips reservations. A caller must name its question.
const GEOMETRY_LAYERS={walk:box=>blocksWalking(box),air:box=>box.sourceKind!=='barrel-explosive'&&occupiesAir(box),wall:box=>box.kind==='wall',flame:box=>box.kind==='wall'||box.kind==='glass'};
// Broad phase shared by movement, sight, silhouettes and area weapons. The
// interaction system invalidates this cache immediately after a door changes.
export function geometryNear(s,a,b,padding,layer){
  const town=getTourWorld(s);if(town)return town.geometryBoxes([Math.min(a.x,b.x)-padding,Math.min(a.y,b.y)-padding,Math.max(a.x,b.x)+padding,Math.max(a.y,b.y)+padding]);
  if(!GEOMETRY_LAYERS[layer])throw Error(`geometryNear needs a layer (${Object.keys(GEOMETRY_LAYERS).join(', ')}), not ${layer}.`);
  if(![a.x,a.y,b.x,b.y,padding].every(Number.isFinite)||padding<0)return [];
  geometry(s);const buckets=geometryCache.get(s).layers[layer],boxes=new Set();
  const x0=Math.min(a.x,b.x)-padding,x1=Math.max(a.x,b.x)+padding,y0=Math.min(a.y,b.y)-padding,y1=Math.max(a.y,b.y)+padding;
  for(let y=Math.floor(y0/GEOMETRY_BUCKET);y<=Math.floor(y1/GEOMETRY_BUCKET);y++)for(let x=Math.floor(x0/GEOMETRY_BUCKET);x<=Math.floor(x1/GEOMETRY_BUCKET);x++)for(const box of buckets.get(`${x},${y}`)||[])if(box.x1>=x0&&box.x0<=x1&&box.y1>=y0&&box.y0<=y1)boxes.add(box);
  return [...boxes];
}
// Geometry kinds answer different questions; tests/short-measure-scenery.test.mjs
// runs the whole table. Walls, crates, chests, open doors, imported obstacles and
// prop reservations stand on the ground from 0 to their height. A prop's parts
// each fill only their own [z0, height]. Walking asks the ground; anything that
// travels through the air asks the parts, so the air beside or under them stays open.
export const blocksWalking=box=>box.kind!=='part';
const occupiesAir=box=>box.kind!=='prop';
const STANDING_EYE=1.1,PRONE_EYE=.3;
const eyeHeight=u=>u.stance==='prone'?PRONE_EYE:u.stance==='kneeling'?.75:STANDING_EYE;
const bodyHeight=u=>u.stance==='prone'?.42:u.stance==='kneeling'?1.15:1.75;
const pointBoxDistance=(p,b)=>b.trunk?trunkDistance(p,b.trunk):Math.hypot(Math.max(b.x0-p.x,0,p.x-b.x1),Math.max(b.y0-p.y,0,p.y-b.y1));
function insideWorld(s,p,padding=0){const b=worldBounds(s);return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=b.x-.5+padding&&p.x<=b.x+b.w-.5-padding&&p.y>=b.y-.5+padding&&p.y<=b.y+b.h-.5-padding;}
export function freePoint(s,p,ignoreId=null,{units=true,radius=RADIUS}={}){if(!insideWorld(s,p,radius))return false;const town=getTourWorld(s);if(town?!town.pointClear(p,radius):geometryNear(s,p,p,radius,'walk').some(b=>pointBoxDistance(p,b)<radius-EPS))return false;return !units||!s.units.some(u=>alive(u)&&u.id!==ignoreId&&distance(u,p)<RADIUS+radius-EPS);}
function boxInterval(a,b,box){if(box.trunk)return trunkSpan(a,b,box.trunk);let lo=0,hi=1;for(const [k,min,max] of [['x',box.x0,box.x1],['y',box.y0,box.y1]]){const d=b[k]-a[k];if(Math.abs(d)<EPS){if(a[k]<min||a[k]>max)return null;continue;}const t0=(min-a[k])/d,t1=(max-a[k])/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return null;}return [lo,hi];}
function intersectsBox(a,b,box){const span=boxInterval(a,b,box);return !!span&&span[1]>EPS&&span[0]<1-EPS;}
// The parameter span within [0,1] where a segment, rising linearly from height
// za at a to zb at b, is inside both the box's footprint and its [z0, height].
function airSpan(a,b,za,zb,box){
  if(box.trunk)return trunkSpan(a,b,box.trunk,za,zb);
  const span=boxInterval(a,b,box);if(!span)return null;
  let [lo,hi]=span;const dz=zb-za,z0=box.z0??0;
  if(Math.abs(dz)<EPS){if(za<z0||za>box.height)return null;}
  else{const t0=(z0-za)/dz,t1=(box.height-za)/dz;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return null;}
  return [lo,hi];
}
// Only walls block standing or kneeling sight. Between two prone animals any
// solid that crosses their eye line blocks it, at its own height.
export function lineClear(s,a,b){
  const town=getTourWorld(s);if(town)return town.lineClear({...a,h:a.h??eyeHeight(a)},{...b,h:b.h??eyeHeight(b)});
  if(![a.x,a.y,b.x,b.y].every(Number.isFinite))return false;
  if(a.stance!=='prone'||b.stance!=='prone')return !geometryNear(s,a,b,0,'wall').some(box=>intersectsBox(a,b,box)&&(!box.windowPart||!!airSpan(a,b,a.h??eyeHeight(a),b.h??eyeHeight(b),box)));
  return !geometryNear(s,a,b,0,'air').some(box=>box.kind!=='glass'&&intersectsBox(a,b,box)&&(box.kind==='wall'&&!box.windowPart||!!airSpan(a,b,PRONE_EYE,PRONE_EYE,box)));
}
export function walkSegment(s,a,b,ignoreId=null){return sceneryWalk(s,a,b)&&unitsWalk(s,a,b,ignoreId);}
// The scenery half of a walk: every 10 cm sample inside the world and clear of walk-blocking boxes.
function sceneryWalk(s,a,b){
  const town=getTourWorld(s);if(town)return town.walkSegment(a,b,RADIUS);
  if(!insideWorld(s,b,RADIUS))return false;
  const blockers=geometryNear(s,a,b,RADIUS,'walk'),steps=Math.max(1,Math.ceil(distance(a,b)/.1));
  for(let i=1;i<=steps;i++){
    const p={x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps};
    if(!insideWorld(s,p,RADIUS)||blockers.some(box=>pointBoxDistance(p,box)<RADIUS-EPS))return false;
  }
  return true;
}
// The unit half: every sample clear of living units other than ignoreId. A unit
// outside the walk's box grown by two radii cannot reach any sample, so it is skipped.
function unitsWalk(s,a,b,ignoreId){
  const pad=2*RADIUS,x0=Math.min(a.x,b.x)-pad,x1=Math.max(a.x,b.x)+pad,y0=Math.min(a.y,b.y)-pad,y1=Math.max(a.y,b.y)+pad;
  const units=s.units.filter(u=>alive(u)&&u.id!==ignoreId&&u.x>=x0&&u.x<=x1&&u.y>=y0&&u.y<=y1);if(!units.length)return true;
  const steps=Math.max(1,Math.ceil(distance(a,b)/.1));
  for(let i=1;i<=steps;i++){const p={x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps};if(units.some(u=>distance(u,p)<2*RADIUS-EPS))return false;}
  return true;
}
// Scenery alone decides whether a grid node is clear and whether a straight walk to
// a neighbouring node is, so searches share those answers through one table per
// geometry (a door changing rebuilds the geometry and so starts a fresh table).
// Units are checked afresh every time. 0 unknown, 1 clear, 2 blocked. The stand-ins
// for last-seen points inside scenery (standIns) depend on the scenery alone too.
const sceneryGrids=new WeakMap();
function sceneryGrid(s){
  const town=getTourWorld(s);if(town)return town.navigationGrid();
  const boxes=geometry(s);let grid=sceneryGrids.get(boxes);
  if(!grid){const {width,height}=gridDimensions(s);grid={width,height,nodes:new Uint8Array(width*height),walks:new Uint8Array(width*height*9),standIns:new Map()};sceneryGrids.set(boxes,grid);}
  return grid;
}
// freePoint for an integer grid node, its scenery half read from the table.
function nodeClear(s,grid,q,ignoreId){
  const inside=q.x>=0&&q.y>=0&&q.x<grid.width&&q.y<grid.height,i=q.y*grid.width+q.x;
  let open=inside?grid.nodes[i]:0;if(!open){open=freePoint(s,q,null,{units:false})?1:2;if(inside)grid.nodes[i]=open;}
  return open===1&&!s.units.some(u=>alive(u)&&u.id!==ignoreId&&distance(u,q)<2*RADIUS-EPS);
}
// walkSegment from grid node p to a neighbouring node q, its scenery half read from the table.
function linkClear(s,grid,p,q,ignoreId){
  const inside=p.x>=0&&p.y>=0&&p.x<grid.width&&p.y<grid.height,i=(p.y*grid.width+p.x)*9+(q.y-p.y+1)*3+(q.x-p.x+1);
  let open=inside?grid.walks[i]:0;if(!open){open=sceneryWalk(s,p,q)?1:2;if(inside)grid.walks[i]=open;}
  return open===1&&unitsWalk(s,p,q,ignoreId);
}
// AFT charges 9 m of sight range per metre of full woodland. Apply the
// concealed fraction from its kneeling (.75) and prone (.45) exposure weights.
const BRUSH_SIGHT_COST={kneeling:9*.25,prone:9*.55};
const sneakStates=new WeakMap();
const sneakStatus=s=>s.solo.status==='active'?(sneakStates.get(s)??'clear'):'clear';
export const sightRange=(observer,target)=>Math.max(1.5,identifyRange(observer,target,observer.team==='squad'?35:26)*(target.sneaking?.7:1));
function sightResult(s,a,b){
  const d=distance(a,b),range=sightRange(a,b);
  if(!alive(a)||d>range)return 'blocked';
  const cost=BRUSH_SIGHT_COST[b.stance],town=getTourWorld(s);
  if(cost&&a.team==='guard'&&b.team==='squad'&&d>3&&(town||missionForState(s).woodland)&&d+cost*(town?town.brushDepth(a,b):woodlandDepth(s,a,b))>range)return 'brush';
  return lineClear(s,a,b)?'spotted':'blocked';
}
export function canSee(s,a,b){return sightResult(s,a,b)==='spotted';}
export function visibleOpponents(s){
  const u=hero(s);
  if(!alive(u))return [];
  // Prefer nearby contacts with clear silhouettes and strong sight acuity.
  // Cover lowers clarity without hiding an already identified opponent's head.
  return s.units.filter(g=>g.team==='guard'&&alive(g)&&s.detected.has(g.id)&&canSee(s,u,g)).map(g=>{
    const d=distance(u,g),nx=-(g.y-u.y)/Math.max(d,EPS),ny=(g.x-u.x)/Math.max(d,EPS);
    const exposed=[-RADIUS,-RADIUS/2,0,RADIUS/2,RADIUS].filter(offset=>{
      const p={x:g.x+nx*offset,y:g.y+ny*offset};
      // Columns conceal whatever stands behind their footprint; a part conceals
      // only where it crosses the line from the viewer's eye to the torso.
      return !geometryNear(s,u,p,0,'air').some(box=>box.kind!=='glass'&&intersectsBox(u,p,box)&&(box.kind!=='part'&&!box.windowPart||!!airSpan(u,p,eyeHeight(u),bodyHeight(g)*.62,box)));
    }).length/5;
    const clarity=(.5+exposed*.5)*identifyRange(u,g,35)/35*(g.sneaking?.7:1);
    return {unit:g,distance:d,score:d/Math.max(.01,clarity)};
  }).sort((a,b)=>a.score-b.score||a.distance-b.distance||a.unit.id-b.unit.id).map(contact=>contact.unit);
}
function visibility(s){
  const u=hero(s),b=worldBounds(s),{width,height}=gridDimensions(s),range=35;
  const x0=Math.max(0,Math.ceil(b.x),Math.ceil(u.x-range)),x1=Math.min(width-1,Math.ceil(b.x+b.w)-1,Math.floor(u.x+range));
  const y0=Math.max(0,Math.ceil(b.y),Math.ceil(u.y-range)),y1=Math.min(height-1,Math.ceil(b.y+b.h)-1,Math.floor(u.y+range));
  s.visible=new Set();
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(distance(u,{x,y})<range&&lineClear(s,u,{x,y})){const k=key(x,y);s.visible.add(k);s.seen.add(k);}
  s.fogAt={x:u.x,y:u.y};
}
export function refresh(s,{forceFog=false}={}){
  const u=hero(s),town=getTourWorld(s),guards=s.units.filter(g=>g.team==='guard'&&alive(g));
  s.detected=new Set(guards.filter(g=>canSee(s,u,g)).map(g=>g.id));
  let status='clear';
  for(const g of guards){
    const sight=sightResult(s,g,u);
    if(sight==='spotted'){
      g.alert=true;g.lastKnown={x:u.x,y:u.y};g.alertAge=0;status='spotted';
    }else if(s.realtime&&status==='clear'&&sight==='brush'&&lineClear(s,g,u))status='brush';
  }
  if(town){if(forceFog)delete s.fogAt;town.reveal(s,u);}
  else if(!s.fogAt||distance(u,s.fogAt)>.25||forceFog)visibility(s);
  if(!alive(u)){s.phase='lost';s.solo.status='lost';s.queue=[];u.isMoving=false;s.revision++;return;}
  if(s.realtime){
    if(status==='clear'&&BRUSH_SIGHT_COST[u.stance]&&town?.hasBrush(u,RADIUS))status='brush';
    sneakStates.set(s,status);
    s.phase=!guards.length&&!firePending(s)&&!missionForState(s).exploration?'won':'explore';s.revision++;return;
  }
  // An open-ended activity has no victory objective; actions still enter the
  // same AP, enemy-turn, injury and fire lifecycle as every other operation.
  if(!guards.length&&!firePending(s)&&!missionForState(s).exploration){if(s.phase!=='won')s.queue=[];s.phase='won';}
  else if(s.phase!=='enemy'){
    const contact=s.engaged||firePending(s)||guards.some(g=>g.alert&&distance(g,u)<=WEAPONS[g.weapon].range+g.maxAp);
    if(contact&&s.phase!=='player'){s.phase='player';s.round++;u.ap=u.burningTurns?0:u.maxAp;s.queue=[];u.isMoving=false;log(s,'Contact. Movement now spends AP by distance.');}
    else if(!contact&&s.phase==='player'){s.phase='explore';s.queue=[];u.isMoving=false;log(s,'Contact broken. Real-time exploration resumed.');}
  }
  s.revision++;
}
export function stop(s){s.queue=[];hero(s).isMoving=false;s.revision++;}
// Stamina is temporarily disabled game-wide. Re-enabling requires the documented
// minimum 300s continuous-run budget and recovery while stationary.
// Swept-disc collision prevents tunnelling. AP charges accepted displacement,
// including wall slides, rather than requested input or pathfinder cells.
export function travel(s,u,dx,dy,{enemy=false}={}){
  if((enemy?(!s.realtime&&s.phase!=='enemy')||!alive(u)||u.burningTurns:!canControl(s,u))||!Number.isFinite(dx)||!Number.isFinite(dy))return 0;
  const requested=Math.hypot(dx,dy);
  if(requested<EPS)return 0;
  const rate=movementRate(u),spends=!s.realtime&&(enemy||s.phase==='player');
  const budget=Math.min(requested,spends?u.ap/rate:Infinity);
  if(budget<EPS){u.isMoving=false;return 0;}
  const steps=Math.ceil(budget/.07),sx=dx/requested*budget/steps,sy=dy/requested*budget/steps,town=getTourWorld(s);
  let walked=0;
  for(let i=0;i<steps;i++){
    let next={x:u.x+sx,y:u.y+sy};
    if(!freePoint(s,next,u.id)){
      const slide=town&&treeSlide(s,town,u,next);
      if(slide)next=slide;
      else if(freePoint(s,{x:next.x,y:u.y},u.id))next.y=u.y;
      else if(freePoint(s,{x:u.x,y:next.y},u.id))next.x=u.x;
      else break;
    }
    const d=distance(u,next);
    if(d<EPS)break;
    u.heading=headingTo(u,next);
    u.x=next.x;u.y=next.y;walked+=d;
    if(spends)u.ap=Math.max(0,u.ap-d*rate);
    u.travelled+=d;fireRules.enterFire(s,u);
    if(u.burningTurns)break;
  }
  u.isMoving=walked>EPS&&!u.burningTurns;
  if(walked){
    if(u.team==='squad'){s.solo.distance+=walked;if(spends)s.solo.apDistance+=walked*rate;}
    refresh(s);
  }
  return walked;
}

function treeSlide(s,town,u,next){
  const {x,y}=next,bounds=[x-RADIUS,y-RADIUS,x+RADIUS,y+RADIUS];
  const trunk=town.solidsFor(bounds).find(solid=>solid.trunkHeight&&trunkDistance(next,solid)<RADIUS-EPS);
  if(!trunk)return null;
  const nx=u.x-trunk.centre[0],ny=u.y-trunk.centre[1],normal=Math.hypot(nx,ny);
  if(normal<EPS)return null;
  const tx=-ny/normal,ty=nx/normal,dx=x-u.x,dy=y-u.y;
  const projected=dx*tx+dy*ty,minSlide=Math.hypot(dx,dy)*.5;
  const amount=Math.max(Math.abs(projected),minSlide),side=Math.sign(projected)||1;
  // Preserve the input's tangent. A nearly head-on step can pick either
  // shoulder, while the normal collision check still handles nearby solids.
  for(const direction of Math.abs(projected)<minSlide?[side,-side]:[side]){
    const p={x:u.x+tx*amount*direction,y:u.y+ty*amount*direction};
    if(freePoint(s,p,u.id))return p;
  }
  return null;
}
// A stable heap preserves tie order without sorting the whole frontier on every
// expansion. The cap also bounds an unreachable request in a large open sector.
export const NAVIGATION_NODE_LIMIT=8192;
class PathFrontier{
  constructor(){this.items=[];this.sequence=0;}
  before(a,b){return a.f<b.f||a.f===b.f&&a.order<b.order;}
  push(point){const p={...point,order:this.sequence++},items=this.items;let i=items.length;items.push(p);while(i){const parent=(i-1)>>1;if(!this.before(p,items[parent]))break;items[i]=items[parent];i=parent;}items[i]=p;}
  pop(){const items=this.items,first=items[0],last=items.pop();if(items.length){let i=0;while(i*2+1<items.length){let child=i*2+1;if(child+1<items.length&&this.before(items[child+1],items[child]))child++;if(!this.before(items[child],last))break;items[i]=items[child];i=child;}items[i]=last;}return first;}
}
// Grid nodes around p that u could stand on and reach from p in a straight walk, nearest first.
function gridNodesAround(s,u,p){
  const a=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const q={x:Math.round(p.x)+dx,y:Math.round(p.y)+dy};if(freePoint(s,q,u.id)&&walkSegment(s,p,q,u.id))a.push(q);
  }
  return a.sort((a,b)=>distance(a,p)-distance(b,p));
}
// A* over integer grid nodes joined by straight walks, from the start nodes (each
// entered at its cost, 0 if it has none) to the first node isGoal accepts. Returns
// the nodes walked, a start first, or null. A caller may pass sealed(reached), asked
// once after SEALED_CHECK expansions: true ends the search as unreachable.
const SEALED_CHECK=256;
function gridSearch(s,u,starts,isGoal,estimate,sealed=null){
  const open=new PathFrontier(),grid=sceneryGrid(s);
  const cost=new Map(),parents=new Map(),points=new Map(),links=new Map(),passable=new Map();
  for(const start of starts){const sk=key(start.x,start.y),g=start.cost??0;if(g>=(cost.get(sk)??Infinity))continue;cost.set(sk,g);points.set(sk,{x:start.x,y:start.y});open.push({x:start.x,y:start.y,g,f:g+estimate(start)});}
  let found=null,expanded=0;
  while(open.items.length&&expanded<NAVIGATION_NODE_LIMIT){
    const p=open.pop(),pk=key(p.x,p.y);if(p.g>(cost.get(pk)??Infinity))continue;
    if(isGoal(p,pk)){found=p;break;}expanded++;
    if(sealed&&expanded===SEALED_CHECK&&sealed(cost))return null;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      if(!dx&&!dy)continue;
      const q={x:p.x+dx,y:p.y+dy},qk=key(q.x,q.y),g=p.g+Math.hypot(dx,dy);
      if(g>=(cost.get(qk)??Infinity))continue;
      if(!passable.has(qk))passable.set(qk,nodeClear(s,grid,q,u.id));if(!passable.get(qk))continue;
      // Direction matters because swept sampling includes its destination.
      const link=pk+'>'+qk;if(!links.has(link))links.set(link,linkClear(s,grid,p,q,u.id));if(!links.get(link))continue;
      cost.set(qk,g);parents.set(qk,pk);points.set(qk,q);open.push({...q,g,f:g+estimate(q)});
    }
  }
  if(!found)return null;
  const raw=[];let current=key(found.x,found.y);while(current){raw.unshift(points.get(current));current=parents.get(current);}
  return raw;
}
// Waypoints from u along raw, each the farthest node still reachable in a straight walk.
function smoothRoute(s,u,raw){
  const result=[];let a=u,index=0;
  while(index<raw.length){let far=index;for(let j=raw.length-1;j>=index;j--)if(walkSegment(s,a,raw[j],u.id)){far=j;break;}const b=raw[far];result.push({...b,z:0,cost:distance(a,b)*movementRate(u)});a=b;index=far+1;}
  return result;
}
export function navigationPath(s,u,x,y){
  const end={x,y};if(!freePoint(s,end,u.id))return null;
  if(walkSegment(s,u,end,u.id))return [{...end,z:0,cost:distance(u,end)*movementRate(u)}];
  const start=gridNodesAround(s,u,u)[0],goals=gridNodesAround(s,u,end);if(!start||!goals.length)return null;
  const goalKeys=new Set(goals.map(p=>key(p.x,p.y))),raw=gridSearch(s,u,[start],(p,pk)=>goalKeys.has(pk),q=>distance(q,end));
  return raw&&smoothRoute(s,u,[...raw,end]);
}
export function move(s,u,x,y){if(!canControl(s,u))return false;const path=navigationPath(s,u,x,y);if(!path?.length)return false;s.queue=path;s.revision++;return true;}
export function turnTo(s,u,heading){if(!canControl(s,u)||!Number.isFinite(heading))return false;u.heading=heading;refresh(s);return true;}
export function setMovementMode(s,u,mode){
  if(!canControl(s,u)||!['run','sneak','walk'].includes(mode))return false;
  u.running=s.realtime?mode!=='sneak':mode==='run';u.sneaking=mode==='sneak';
  if(s.realtime)refresh(s);else s.revision++;
  return true;
}
export function setStance(s,u,stance){if(!canControl(s,u)||!['standing','kneeling','prone'].includes(stance)||u.stance===stance)return false;u.stance=stance;refresh(s,{forceFog:true});return true;}
const random=s=>{s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;};
export const grenadeCost=u=>WEAPONS.grenade.cost*(['pistol','pistol-offhand','smg'].includes(u.weapon)?.5:1);
export function grenadeTrajectory(a,b){
  const rise=Math.min(2.5,distance(a,b)*.35);
  return Array.from({length:33},(_,i)=>{const t=i/32;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:1.1*(1-t)+.08*t+Math.sin(t*Math.PI)*rise};});
}
function grenadePathBlocked(s,path){
  return geometryNear(s,path[0],path.at(-1),0,'air').some(box=>{
    for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];if(airSpan(a,b,a.z,b.z,box))return true;}
    return false;
  });
}
export const grenadeAffects=(s,point,target)=>distance(target,point)<=WEAPONS.grenade.blast&&lineClear(s,point,target);
// The fill stops at walls and unexplored ground. The outer ring still shows the
// maximum blast radius; neither the preview nor its camera changes visibility.
export function grenadeBlastFootprint(s,point){
  if(!s.seen.has(key(point.x,point.y)))return [];
  const radius=WEAPONS.grenade.blast,walls=geometryNear(s,point,point,radius,'wall');
  return Array.from({length:97},(_,i)=>{
    const angle=i/96*Math.PI*2,dx=Math.cos(angle),dy=Math.sin(angle),end={x:point.x+dx*radius,y:point.y+dy*radius};
    let reach=radius;
    for(const wall of walls){const span=wall.windowPart?airSpan(point,end,1.1,1.1,wall):boxInterval(point,end,wall);if(span&&span[1]>EPS)reach=Math.min(reach,Math.max(0,span[0]*radius-.01));}
    for(let d=0;d<=reach;d+=.1)if(!s.seen.has(key(point.x+dx*d,point.y+dy*d))){reach=Math.max(0,d-.1);break;}
    return {x:point.x+dx*reach,y:point.y+dy*reach};
  });
}
export function previewGrenade(s,u,point){
  const w=WEAPONS.grenade,cost=s.realtime?0:grenadeCost(u),valid=point&&Number.isFinite(point.x)&&Number.isFinite(point.y),d=valid?distance(u,point):Infinity;
  let reason='';
  if(!canControl(s,u))reason='Wait for your turn';
  else if(s.realtime&&realtimeRules.busy(s,u))reason=realtimeRules.busy(s,u);
  else if(!(u.ammo.grenade>0))reason='No grenades remaining';
  else if(!valid||!insideWorld(s,point))reason='Choose a point on the field';
  else if(!s.seen.has(key(point.x,point.y)))reason='Choose an explored landing point';
  else if(d>w.range+EPS)reason='Out of throwing range';
  else if(geometryNear(s,point,point,.04,'walk').some(box=>pointBoxDistance(point,box)<.04))reason='Landing point is inside an obstacle';
  else if(grenadePathBlocked(s,grenadeTrajectory(u,point)))reason='Throw path is blocked';
  else if(u.ap+EPS<cost)reason='Not enough AP';
  return {ok:!reason,reason,cost,distance:d,blast:w.blast,discounted:cost<w.cost,selfDanger:!!valid&&grenadeAffects(s,point,u)};
}
export function throwGrenade(s,u,point){return damageAction(s,u,'grenade',()=>{const ok=throwGrenadeNow(s,u,point);if(ok&&s.realtime)realtimeRules.actor(s,u).cooldown=grenadeSeconds(u);return ok;});}
function throwGrenadeNow(s,u,point){
  const p=previewGrenade(s,u,point);if(!p.ok)return false;
  stop(s);if(s.phase!=='player'){s.engaged=true;refresh(s);}
  u.ap=Math.max(0,u.ap-p.cost);u.ammo.grenade--;syncAmmo(u,'grenade');u.heading=headingTo(u,point);
  const impactEvent={explosions:[]},fireBefore=s.fireAnimationSequence||0,windowBefore=s.windowSequence||0;
  const walls=planWallBlast(s,{...point,h:.08},p.blast,grenadeDamage);
  let hits=0;for(const target of s.units.filter(alive))if(alive(target)&&grenadeAffects(s,point,target)){
    if(!detonateImpact(s,u,target,'torso',WEAPONS.grenade,impactEvent))hurt(s,target,Math.round(WEAPONS.grenade.damage*Math.max(.2,1-distance(target,point)/(p.blast+1))));hits++;
  }
  barrelRules.detonate(s,(s.props||[]).filter(p=>isExplosiveBarrel(p)&&grenadeAffects(s,point,p)),impactEvent);
  windowBlast(s,point,p.blast);
  commitWallDamage(s,walls,impactEvent);
  log(s,`${u.name} threw a grenade (${p.cost} AP).`);
  for(const guard of s.units.filter(g=>g.team==='guard'&&alive(g)))if(distance(u,guard)<=WEAPONS.grenade.range*2){guard.alert=true;guard.lastKnown={x:u.x,y:u.y};guard.alertAge=0;}
  s.effect={sequence:[{shooter:u.id,ax:u.x,ay:u.y,bx:point.x,by:point.y,hit:hits>0,weapon:'grenade',blast:p.blast,...impactEvent,windowSequences:windowReceipts(s,windowBefore),fireSequences:(s.fireAnimations||[]).filter(e=>e.sequence>fireBefore).map(e=>e.sequence)}]};
  refresh(s);return true;
}
function attackRounds(s,u,w,burst){
  const requested=burst&&w?.burstRounds?w.burstRounds:1;
  return s.realtime&&w?.mag?Math.min(requested,Math.max(1,u.ammo[u.weapon]||0)):requested;
}
export function previewAttack(s,a,b,burst=false,zone='torso',token=null,aimLevel='hip'){
  if(b?.ground)return previewPointAttack(s,a,b,burst,aimLevel);
  if(!alive(a)||!alive(b)||a.team===b.team)return {ok:false,reason:'Choose a living opponent'};
  if(a.weapon==='grenade'){if(!s.detected.has(b.id))return {ok:false,reason:'Target is not visible'};return {...previewGrenade(s,a,b),chance:100,rounds:1,cover:0};}
  const w=WEAPONS[a.weapon],aim=w&&shotAim(w,aimLevel,burst);if(!aim)return {ok:false,reason:'Choose an aim level'};
  const cost=s.realtime?0:aim.cost,d=distance(a,b),rounds=attackRounds(s,a,w,burst);
  let reason='';
  if(a.team==='squad'&&!s.detected.has(b.id))reason='Target is not visible';
  else if(a.burningTurns)reason='On fire: running in panic';
  else if(s.realtime&&realtimeRules.busy(s,a))reason=realtimeRules.busy(s,a);
  else if(!lineClear(s,a,b)&&!w.arc)reason='Blocked by a wall';
  else if(d>w.range+EPS)reason='Out of range';
  else if(w.mag&&(a.ammo[a.weapon]??0)<rounds)reason='Reload first';
  else if(!s.realtime&&(combatCosts(s)||a.team==='guard')&&a.ap+EPS<cost)reason='Not enough AP';
  else if(s.realtime&&!w.blast&&!w.incendiary&&confirmedImpact(s,a,b,zone)?.unit?.id!==b.id)reason='Shot blocked by cover';
  const cover=geometryNear(s,b,b,.9,'walk').some(box=>(box.kind==='crate'||box.cover)&&pointBoxDistance(b,box)<.9&&intersectsBox(a,b,{x0:box.x0-.3,x1:box.x1+.3,y0:box.y0-.3,y1:box.y1+.3}))?20:0;
  const moving=s.realtime&&a.isMoving,aimBonus=(aim.accuracy||0)*(moving?.4:1);
  const chance=Math.max(5,Math.min(95,weaponAccuracy(a)+(w.accuracy||0)-(w.rangeLoss||0)*d/w.range+aimBonus+(AIM_ZONES[zone]?.accuracy||0)-cover+(a.stance==='kneeling'?5:a.stance==='prone'?10:0)-(moving?15:0)));
  return {ok:!reason,reason,cost,chance:Math.round(chance),rounds,distance:d,cover,...s.realtime?{seconds:shotSeconds(a.weapon,aimLevel,burst)}:{}};
}
const damageOwners=new WeakMap(),realtimeReceipts=new WeakMap();
function damageAction(s,u,weapon,action){const previous=damageOwners.get(s);damageOwners.set(s,{id:u.id,weapon,stealth:false});try{return action();}finally{if(previous)damageOwners.set(s,previous);else damageOwners.delete(s);}}
function markDamageCredit(s,u,stealth=false){const owner=damageOwners.get(s);if(s.realtime&&owner)realtimeRules.actor(s,u).credit={...owner,stealth};}
function kill(s,u,fromDamage=false){const living=alive(u)||!!s.realtime&&fromDamage,credit=s.realtime?.actors[u.id]?.credit,owner=damageOwners.get(s);if(living&&u.team==='guard')awardRealtimeKill(s,credit&&(!owner||credit.id===owner.id&&credit.weapon===owner.weapon)?credit:owner);u.hp=0;u.ap=0;u.casualty='dead';u.burningTurns=0;u.isMoving=false;interactionRules.registerBody(s,u);if(living)log(s,u.name+' is down.');}
function hurt(s,u,damage){if(!alive(u))return;const owner=damageOwners.get(s),source=s.units.find(v=>v.id===owner?.id),w=WEAPONS[owner?.weapon];const stealth=!!(s.realtime&&source?.team==='squad'&&source.sneaking&&!u.alert&&!w?.blast&&!w?.incendiary);if(stealth)damage*=1.5;markDamageCredit(s,u,stealth);if(s.realtime&&source&&source.team!==u.team){u.alert=true;u.lastKnown={x:source.x,y:source.y};}u.hp=Math.max(0,u.hp-damageAfterResistance(u,damage));if(!u.hp)kill(s,u,true);}
function flameAffects(s,a,u,heading){
  const angle=Math.abs(((headingTo(a,u)-heading+540)%360)-180);
  if(!alive(u)||u.id===a.id||distance(a,u)>WEAPONS.flamethrower.range||angle>=24)return false;
  const source=eyeHeight(a),heights=u.stance==='prone'?[.3,.42,.15]:u.stance==='kneeling'?[.75,1.15,.2]:[1.1,1.75,.5];
  const blockers=geometryNear(s,a,u,0,'air');
  // The recorded jet is horizontal at the operator's stance height. A lower
  // broken cell must not deal damage behind a still-clipped upper aim cone.
  if(blockers.some(box=>box.windowPart&&boxInterval(a,u,box)?.[1]>EPS&&!!airSpan(a,u,source,source,box)))return false;
  return heights.some(height=>!blockers.some(box=>{if(box.windowPart)return false;const span=boxInterval(a,u,box);return !!span&&span[1]>EPS&&span[0]<1-EPS&&!!airSpan(a,u,source,height,box);}));
}
function resolveFlame(s,a,event={explosions:[]}){
  const impacts=[];
  for(const u of s.units)if(flameAffects(s,a,u,a.heading)){
    const before=u.hp,visible=s.visible.has(key(u.x,u.y))&&(u.team==='squad'||s.detected.has(u.id));
    if(!detonateImpact(s,a,u,'torso',WEAPONS.flamethrower,event)){kill(s,u);recordBurn(s,u,'ash');}
    impacts.push({id:u.id,x:u.x,y:u.y,before,after:u.hp,dead:!alive(u),visible});
  }
  barrelRules.detonate(s,(s.props||[]).filter(p=>isExplosiveBarrel(p)&&distance(a,p)<=WEAPONS.flamethrower.range&&Math.abs(((headingTo(a,p)-a.heading+540)%360)-180)<24&&lineClear(s,a,p)),event);
  return impacts;
}
export function previewFlame(s,a,heading){
  const w=WEAPONS.flamethrower,valid=Number.isFinite(heading);let reason='';
  if(!canControl(s,a))reason='Wait for your turn';
  else if(s.realtime&&realtimeRules.busy(s,a))reason=realtimeRules.busy(s,a);
  else if(a.weapon!=='flamethrower')reason='Equip the flamethrower';
  else if(!valid)reason='Choose a direction';
  else if(!(a.ammo.flamethrower>0))reason='Reload first';
  else if(!s.realtime&&a.ap+EPS<w.cost)reason='Not enough AP';
  const direction=valid?((heading%360)+360)%360:a.heading;
  const shape=recordFlame({...a,heading:direction},w.range,geometryNear(s,a,a,w.range,'flame'),s.visible);
  const contacts=s.units.filter(u=>(u.team==='squad'||s.detected.has(u.id))&&s.visible.has(key(u.x,u.y))&&flameAffects(s,a,u,direction)).map(u=>({id:u.id,name:u.name,team:u.team}));
  return {ok:!reason,reason,cost:s.realtime?0:w.cost,range:w.range,spread:48,heading:direction,shape,contacts};
}
export function fireFlame(s,a,heading,{keepMovement=false}={}){return damageAction(s,a,'flamethrower',()=>{const ok=fireFlameNow(s,a,heading,keepMovement);if(ok&&s.realtime)realtimeRules.actor(s,a).cooldown=shotSeconds('flamethrower');return ok;});}
function fireFlameNow(s,a,heading,keepMovement=false){
  const p=previewFlame(s,a,heading);if(!p.ok)return false;
  if(!keepMovement)stop(s);if(s.phase!=='player'){s.engaged=true;refresh(s);}
  a.ap=Math.max(0,a.ap-p.cost);a.ammo.flamethrower--;syncAmmo(a,'flamethrower');a.heading=p.heading;
  const impactEvent={explosions:[]},fireBefore=s.fireAnimationSequence||0,windowBefore=s.windowSequence||0,flame=recordFlame(a,p.range,geometryNear(s,a,a,p.range,'flame'),s.visible),impacts=resolveFlame(s,a,impactEvent),angle=a.heading*Math.PI/180;
  log(s,`${a.name} fired a flamethrower cone (${p.cost} AP).`);
  for(const guard of s.units.filter(u=>u.team==='guard'&&alive(u)))if(distance(a,guard)<=p.range*2){guard.alert=true;guard.lastKnown={x:a.x,y:a.y};guard.alertAge=0;}
  s.effect={sequence:[{shooter:a.id,ax:a.x,ay:a.y,bx:a.x+Math.cos(angle)*p.range,by:a.y+Math.sin(angle)*p.range,incendiary:true,hit:impacts.length>0,weapon:'flamethrower',shot:0,shots:1,flame,impacts,...impactEvent,windowSequences:windowReceipts(s,windowBefore),fireSequences:(s.fireAnimations||[]).filter(e=>e.sequence>fireBefore).map(e=>e.sequence)}]};
  refresh(s);return true;
}
function syncAmmo(unit,weapon){for(const item of unit.pack||[])if(item.type==='weapon'&&item.kind===weapon)item.rounds=unit.ammo[weapon]||0;}
function detonateImpact(s,shooter,victim,zone,weapon,event){
  if(!alive(victim))return false;
  const chance=weapon.mag?tankExplosionChance(victim,zone):0;
  if(chance>0&&random(s)<chance){(event.explosions??=[]).push(fuelRules.explode(s,victim));return true;}return false;
}
const windowReceipts=(s,before)=>(s.windowEvents||[]).filter(e=>e.sequence>before).map(e=>e.sequence);
function windowBlast(s,origin,radius,options={}){
  const events=windowSystem.blast(s,origin,radius,{occluded:(a,b)=>!lineClear(s,{...a,h:1.1},b),...options});
  if(events.length)geometryCache.delete(s);return events;
}
function knownWallPoint(s,point){
  if(!s.realtime||!point.wallEdge)return false;
  const wall=geometryNear(s,point,point,.01,'wall').find(box=>box.wallEdge===point.wallEdge&&pointBoxDistance(point,box)<.01);
  if(!wall||point.h>wall.height)return false;
  const [axis,x,y]=point.wallEdge.split(':');
  return s.seen.has(key(+x,+y))||s.seen.has(key(+x+(axis==='e'?1:0),+y+(axis==='s'?1:0)));
}
export function previewPointAttack(s,a,point,burst=false,aimLevel='hip'){
  const w=WEAPONS[a?.weapon],aim=w&&shotAim(w,aimLevel,burst),rounds=attackRounds(s,a,w,burst),d=point?distance(a,point):Infinity;
  const placed=point?.windowId!==undefined?windowSystem.compile(s).find(r=>r.placement.id===point.windowId):null,ceiling=placed?.spec.height??2;
  let reason='';
  if(!canControl(s,a))reason='Wait for your turn';
  else if(s.realtime&&realtimeRules.busy(s,a))reason=realtimeRules.busy(s,a);
  else if(!point?.ground||point.windowId!==undefined&&!placed||![point.x,point.y,point.h].every(Number.isFinite)||point.h<0||point.h>ceiling||!insideWorld(s,point)||!s.seen.has(key(point.x,point.y))&&!knownWallPoint(s,point))reason='Choose an explored point';
  else if(point.barrelId!==undefined&&!barrelRules.present(s,point.barrelId))reason='Barrel already destroyed';
  else if(!w||w.incendiary||a.weapon==='grenade')reason='Use the area weapon controls';
  else if(d>w.range+EPS)reason='Out of range';
  else if(w.mag&&(a.ammo[a.weapon]??0)<rounds)reason='Reload first';
  else if(combatCosts(s)&&a.ap+EPS<aim.cost)reason='Not enough AP';
  return {ok:!reason,reason,cost:s.realtime?0:aim?.cost??0,rounds,distance:d,cover:0,chance:Math.round(Math.max(5,Math.min(95,weaponAccuracy(a)+(w?.accuracy||0)-(w?.rangeLoss||0)*d/(w?.range||1)+(aim?.accuracy||0))))};
}
const shotHeight=(point,zone)=>point.ground?point.h:zone==='head'?bodyHeight(point):zone==='legs'?bodyHeight(point)*.25:bodyHeight(point)*.62;
// A visual muzzle may replace the recorded start only along clear air.
// Contact at the recorded endpoint is valid, including a shot into a wall.
export function projectileSegmentClear(s,a,b){
  return !geometryNear(s,a,b,0,'air').some(box=>{
    const span=airSpan(a,b,a.h,b.h,box);
    return span&&span[0]<1-EPS&&span[1]>EPS;
  });
}
// Resolve the blast against intact cover. A wall falling to this blast opens
// the way for the next shot or blast, including the next round of a burst.
function planWallBlast(s,origin,radius,damageAt){
  if(!s.realtime||isTour(s))return [];
  const plans=[],clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  for(const box of geometryNear(s,origin,origin,radius,'air')){
    if(!box.wallEdge)continue;
    const contact={x:clamp(origin.x,box.x0,box.x1),y:clamp(origin.y,box.y0,box.y1),h:clamp(origin.h,0,box.height)};
    const d=Math.hypot(contact.x-origin.x,contact.y-origin.y,contact.h-origin.h);
    if(d>radius)continue;
    const damage=damageAt(d);
    if(damage>0&&(d<EPS||projectileSegmentClear(s,origin,contact)))plans.push({edge:box.wallEdge,damage});
  }
  return plans;
}
function commitWallDamage(s,plans,event){
  for(const {edge,damage} of plans){
    const receipt=damageWall(s,edge,damage);
    if(!receipt)continue;
    (event.structures??=[]).push(receipt);
    if(receipt.destroyed){
      geometryCache.delete(s);delete s.fogAt;
      log(s,`Wall breached (${receipt.kind==='wall'?'brick':receipt.kind.split('-').at(-1)}).`);
    }
  }
}
function firstShotObstacle(s,a,b,source,end){
  let obstacle=null;
  for(const box of geometryNear(s,a,b,0,'air')){
    const span=airSpan(a,b,source,end,box);
    if(!span||span[0]<=EPS||span[0]>=(obstacle?.t??1+EPS))continue;
    const t=span[0];
    obstacle={box,t,point:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,h:source+(end-source)*t}};
  }
  const length=Math.hypot(b.x-a.x,b.y-a.y,end-source);
  if(length>EPS){
    const direction={x:(b.x-a.x)/length,y:(b.y-a.y)/length,h:(end-source)/length};
    const hit=barrelRayHit(s.props,{x:a.x,y:a.y,h:source},direction,length*(obstacle?.t??1));
    if(hit){const t=hit.distance/length;obstacle={t,box:{kind:'barrel',barrelId:barrelId(hit.prop)},point:{x:a.x+direction.x*hit.distance,y:a.y+direction.y*hit.distance,h:source+direction.h*hit.distance}};}
  }
  return obstacle;
}

function bodyShotContact(event,{unit,t}){
  const dx=event.bx-event.ax,dy=event.by-event.ay,dh=event.bh-event.ah,reach=Math.hypot(dx,dy,dh);
  if(!reach)return null;
  const origin={x:event.ax,y:event.ay,h:event.ah},direction={x:dx/reach,y:dy/reach,h:dh/reach};
  const contact=bodyIntersection(unit,origin,direction,reach,bodyHeight(unit));
  const fraction=contact?contact.distance/reach:t;
  return {x:origin.x+dx*fraction,y:origin.y+dy*fraction,h:origin.h+dh*fraction};
}

function missedTrace(s,a,b,event,chance){
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
  if(!s.realtime){
    const side=(event.shot%2?.36:-.36)/(d||1);
    const end={x:b.x-dy*side,y:b.y+dx*side,h:event.bh+.16};
    const obstacle=firstShotObstacle(s,a,end,event.ah,end.h);
    return {...(obstacle?.box.barrelId?{impact:obstacle}:{}),feedback:{traceEnd:obstacle?.point??end}};
  }
  const origin={x:a.x,y:a.y,h:event.ah};
  if(Math.hypot(d,event.bh-event.ah)<1e-6)return {feedback:{traceEnd:origin}};

  // Reuse AFT's missed-roll scatter on a local copy of the committed seed.
  const sample=seededShots(s.seed),{die}=failedShotRoll(chance,sample);
  const {error}=rollMarginScatter({chance,die,roll:sample()});
  // At arm's length a steep miss can still cross another part of the target.
  const rotation=sample(),sideways=!b.ground&&d<1.2;
  const frame={origin:[a.x,a.y,event.ah],aim:[b.x,b.y,event.bh],error,rotation:sideways?(rotation<.5?0:.5):rotation};
  const target={x:b.x,y:b.y};
  const ray=b.ground||d<2*RADIUS?angularHelicoidShot(frame):
    placeHelicoidMiss(frame,({direction:[x,y,h]})=>!!bodyIntersection(target,origin,{x,y,h},Infinity,bodyHeight(b)));
  const [x,y,h]=ray.direction;
  const ground=h<0?-origin.h/h:Infinity,travel=Math.min(WEAPONS[event.weapon].range,ground);
  const end={x:origin.x+x*travel,y:origin.y+y*travel,h:Math.max(0,origin.h+h*travel)};
  const obstacle=firstShotObstacle(s,origin,end,origin.h,end.h);
  const reach=obstacle?Math.hypot(obstacle.point.x-origin.x,obstacle.point.y-origin.y,obstacle.point.h-origin.h):travel;
  let impact;
  for(const unit of s.units){
    if(!alive(unit)||unit.id===a.id)continue;
    const contact=bodyIntersection(unit,origin,{x,y,h},reach,bodyHeight(unit));
    if(!contact||contact.distance>=(impact?.distance??Infinity))continue;
    impact={unit,zone:contact.zone,distance:contact.distance,
      point:{x:origin.x+x*contact.distance,y:origin.y+y*contact.distance,h:origin.h+h*contact.distance}};
  }
  if(impact)return {impact,feedback:{traceEnd:impact.point}};
  return {...(obstacle?.box.barrelId?{impact:obstacle}:{}),feedback:{traceEnd:obstacle?.point??end,missImpact:!!obstacle||travel===ground,...(obstacle?.box.wallEdge?{wallEdge:obstacle.box.wallEdge}:{})}};
}

export function confirmedImpact(s,a,b,zone='torso'){
  const dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy,source=eyeHeight(a),height=bodyHeight;
  const end=shotHeight(b,zone),dh=end-source;
  const obstacle=firstShotObstacle(s,a,b,source,end),blocked=obstacle?.t??1+EPS;
  return s.units.filter(u=>alive(u)&&u.id!==a.id).map(unit=>{
    const t=length2?((unit.x-a.x)*dx+(unit.y-a.y)*dy)/length2:1,h=source+dh*t;
    if(t<=0||t>1+EPS||t>blocked||h<0||h>height(unit)||Math.hypot(unit.x-a.x-dx*t,unit.y-a.y-dy*t)>RADIUS)return null;
    return {unit,t,zone:unit.id===b.id?zone:h>height(unit)*.8?'head':h<height(unit)*.32?'legs':'torso'};
  }).filter(Boolean).sort((a,b)=>a.t-b.t||a.unit.id-b.unit.id)[0]||obstacle;
}
export function attack(s,a,b,burst=false,byAI=false,zone='torso',reaction=false,aimLevel='hip'){if(s.realtime)return realtimeRules.requestShot(s,a,b,burst,zone,aimLevel);return attackNow(s,a,b,burst,byAI,zone,reaction,aimLevel);}
function attackNow(s,a,b,burst=false,byAI=false,zone='torso',reaction=false,aimLevel='hip'){
  if(byAI?(!s.realtime&&s.phase!=='enemy')||!alive(a)||a.burningTurns:!canControl(s,a))return false;
  const p=previewAttack(s,a,b,burst,zone,null,aimLevel);if(!p.ok)return false;if(a.weapon==='grenade')return throwGrenade(s,a,b);
  if(!s.realtime)stop(s);const weapon=a.weapon,w=WEAPONS[weapon];if(!s.realtime&&!byAI&&s.phase!=='player'){s.engaged=true;refresh(s);}
  a.ap=Math.max(0,a.ap-p.cost);a.heading=headingTo(a,b);
  const hp=b.hp??0,sequence=[];let hits=0,bodyDamage=0;
  for(let round=0;round<p.rounds&&alive(a)&&!a.burningTurns;round++){
    if(w.mag&&!(a.ammo[weapon]>0))break;if(w.mag){a.ammo[weapon]--;syncAmmo(a,weapon);}
    const fireBefore=s.fireAnimationSequence||0,windowBefore=s.windowSequence||0,event={shooter:a.id,target:b.id,ax:a.x,ay:a.y,ah:eyeHeight(a),bx:b.x,by:b.y,bh:shotHeight(b,zone),sourceVisible:a.team==='squad'||s.detected.has(a.id),incendiary:w.incendiary,hit:false,weapon,shot:round,explosions:[]};sequence.push(event);
    if(w.incendiary){event.flame=recordFlame(a,w.range,geometryNear(s,a,a,w.range,'flame'),s.visible);event.impacts=resolveFlame(s,a,event);event.hit=event.impacts.length>0;}
    else if(w.blast){
      const impact=confirmedImpact(s,a,b,zone),box=impact?.box;
      const origin=box?.windowPart||box?.trunk||box?.barrelId||s.realtime&&box?.wallEdge?impact.point:b;event.bx=origin.x;event.by=origin.y;event.bh=origin.h??event.bh;
      const walls=planWallBlast(s,{...origin,h:event.bh},w.blast,d=>w.damage*(1-d/w.blast));
      for(const victim of s.units.filter(alive))if(alive(victim)&&distance(victim,origin)<=w.blast&&lineClear(s,origin,victim)){if(!detonateImpact(s,a,victim,'torso',w,event))hurt(s,victim,Math.round(w.damage*Math.max(.2,1-distance(victim,origin)/(w.blast+1))));event.hit=true;}
      barrelRules.detonate(s,(s.props||[]).filter(p=>isExplosiveBarrel(p)&&distance(p,origin)<=w.blast&&lineClear(s,origin,p)),event);
      windowBlast(s,origin,w.blast);
      commitWallDamage(s,walls,event);
    }else{
      const damage=w.pellets?w.damage*w.pellets*.48:w.damage;
      const rolledHit=random(s)*100<p.chance;
      let impact=rolledHit?(w.mag||s.windows?.length?confirmedImpact(s,a,b,zone):alive(b)?{unit:b,zone}:null):null;
      if(!impact&&w.mag){
        const miss=missedTrace(s,a,b,event,p.chance);
        Object.assign(event,miss.feedback);impact=miss.impact;
      }
      if(impact?.box){event.bx=impact.point.x;event.by=impact.point.y;event.bh=impact.point.h;
        if(impact.box.barrelId)barrelRules.detonate(s,[impact.box.barrelId],event);
        if(impact.box.kind==='glass'){const record=windowSystem.compile(s).find(r=>r.placement.id===impact.box.windowId),local=windowToLocal(record.placement,{...a,h:eyeHeight(a)});
          const broken=windowSystem.breakPane(s,impact.box.windowId,impact.box.paneId,impact.point,{cause:w.mag?'bullet':'melee',direction:local[2]<0?1:-1});if(broken){geometryCache.delete(s);event.glass=true;}
        }
        if(s.realtime&&w.mag&&!event.glass){
          event.missImpact=true;
          if(impact.box.wallEdge)event.wallEdge=impact.box.wallEdge;
        }
      }else if(impact?.unit){
        const victim=impact.unit,known=victim.team==='squad'||s.detected.has(victim.id);
        const contact=s.realtime&&w.mag&&known?(impact.point??bodyShotContact(event,impact)):null,hpBefore=victim.hp;
        event.hit=true;event.impact={unitId:victim.id,zone:impact.zone};event.bx=victim.x;event.by=victim.y;event.bh=shotHeight(victim,impact.zone);
        if(!detonateImpact(s,a,victim,impact.zone,w,event)){
          hurt(s,victim,Math.round(damage*(AIM_ZONES[impact.zone]?.damage||1)));
          if(contact&&hpBefore>victim.hp)event.bodyImpact={contact,seed:s.seed,strength:.7+.5*(hpBefore-victim.hp)/victim.maxHp};
        }
        bodyDamage+=hpBefore-victim.hp;
      }
      if(event.wallEdge)commitWallDamage(s,[{edge:event.wallEdge,damage}],event);
    }
    event.windowSequences=windowReceipts(s,windowBefore);event.fireSequences=(s.fireAnimations||[]).filter(e=>e.sequence>fireBefore).map(e=>e.sequence);if(event.hit)hits++;
  }
  for(const event of sequence)event.shots=sequence.length;
  log(s,`${a.name} → ${b.name||'window'}: ${b.ground?sequence.some(e=>e.glass)?'glass broken':'shot':hits?Math.round(bodyDamage||hp-b.hp)+' damage':'miss'} (${p.chance}%).`);
  for(const g of s.units.filter(g=>g.team==='guard'&&alive(g)))if(distance(a,g)<=w.range*2){g.alert=true;g.lastKnown=s.realtime&&a.team==='guard'&&a.lastKnown?{...a.lastKnown}:{x:a.x,y:a.y};g.alertAge=0;}
  s.effect={sequence,cost:p.cost};refresh(s);return true;
}
export function equip(s,u,id){if(!canControl(s,u)||!u.pack.some(i=>i.kind===id)||u.weapon===id)return false;const cost=combatCosts(s)?u.slots.includes(id)?2:3:0;if(u.ap+EPS<cost)return false;stop(s);u.ap-=cost;u.weapon=id;if(s.realtime)realtimeRules.changedWeapon(s,u);log(s,'Equipped '+WEAPONS[id].name+'.');return true;}
export function reload(s,u){return s.realtime?realtimeRules.reload(s,u):reloadNow(s,u);}
function reloadNow(s,u,real=false){if(real?!alive(u)||u.burningTurns:!canControl(s,u))return false;const w=WEAPONS[u.weapon],count=Math.min(w.mag-(u.ammo[u.weapon]??0),u.ammoPouch[u.weapon]||0),cost=combatCosts(s)?3:0;if(!count||u.ap+EPS<cost)return false;if(!real)stop(s);u.ap-=cost;u.ammo[u.weapon]+=count;u.ammoPouch[u.weapon]-=count;syncAmmo(u,u.weapon);log(s,'Reloaded '+count+' rounds.');return true;}
export function endTurn(s){if(s.realtime)return false;if(s.phase!=='player'||s.solo.status!=='active')return false;stop(s);for(const unit of s.units)fireRules.panicRun(s,unit);s.phase='enemy';s.enemyIndex=1;s.enemyDelay=.35;s.engaged=false;for(const g of s.units.filter(g=>g.team==='guard')){g.ap=g.burningTurns?0:g.maxAp;g.alertAge++;if(g.alertAge>3&&!canSee(s,g,hero(s)))g.alert=false;}s.revision++;return true;}
// A guard within ARRIVED of its last waypoint has arrived. A route can also open at
// its own grid node, inside that distance; it walks on to the next waypoint
// instead of ending its turn there.
const ARRIVED=.08;
function enemyStep(s,dt){const u=hero(s);let g=s.units[s.enemyIndex];if(!g){fireRules.finishRound(s);s.round++;s.panicDelay=3;u.ap=alive(u)&&!u.burningTurns?u.maxAp:0;u.stamina=Math.min(u.maxStamina,u.stamina+10);s.phase='player';refresh(s);return;}if(!alive(g)||g.burningTurns||!g.alert||g.ap<.02){g.isMoving=false;s.enemyIndex++;s.enemyDelay=.15;return;}s.enemyDelay-=dt;if(s.enemyDelay>0)return;const p=previewAttack(s,g,u);if(p.ok&&canSee(s,g,u)){attack(s,g,u,false,true);s.enemyDelay=.6;return;}if(g.ammo[g.weapon]===0&&g.ap>=3){const count=Math.min(WEAPONS[g.weapon].mag,g.ammoPouch[g.weapon]||0);if(count){g.ammo[g.weapon]=count;g.ammoPouch[g.weapon]-=count;g.ap-=3;s.enemyDelay=.4;return;}}if(g.ap<WEAPONS[g.weapon].cost&&canSee(s,g,u)&&distance(g,u)<=WEAPONS[g.weapon].range){g.ap=0;return;}const path=approachPath(s,g,g.lastKnown||u),next=path?.length>1&&distance(g,path[0])<ARRIVED?path[1]:path?.[0];if(!next){g.ap=0;return;}const d=distance(g,next);if(d<ARRIVED){g.ap=0;return;}const step=Math.min(d,movementSpeed(g)*dt);if(!travel(s,g,(next.x-g.x)/d*step,(next.y-g.y)/d*step,{enemy:true}))g.ap=0;}
// Every frame reuses the same movement/turn step; stop catch-up at control-phase changes.
export function tick(s,dt=1/60,input=null){
  if(s.solo.status!=='active')return false;
  const seconds=boundedElapsed(dt),steps=Math.max(1,Math.ceil((seconds-1e-9)/SIMULATION_STEP_SECONDS)),receipts=s.realtime&&s.effect&&realtimeReceipts.get(s)!==s.effect?[{effect:s.effect,at:0}]:[];let previous=s.effect;
  for(let i=0;i<steps;i++){const phase=s.phase;tickStep(s,seconds/steps,input);if(s.effect&&s.effect!==previous){receipts.push({effect:s.effect,at:i*seconds/steps});previous=s.effect;}if(s.phase!==phase||s.solo.status!=='active')break;}
  if(receipts.length>1)s.effect={...s.effect,sequence:receipts.flatMap(({effect,at})=>(effect.sequence||[effect]).map(event=>({...event,catchupDelayMs:(event.catchupDelayMs||0)+(at-receipts[0].at)*1000})))};
  if(s.realtime)realtimeReceipts.set(s,s.effect);return true;
}
function tickStep(s,dt,input){if(s.realtime)return realtimeRules.step(s,dt,input);s.elapsed+=dt;for(const u of s.units)u.isMoving=false;if(s.phase==='enemy'){enemyStep(s,dt);return true;}const u=hero(s);if(u.burningTurns){refresh(s);if(s.phase==='player'){s.panicDelay=Math.max(0,(s.panicDelay??3)-dt);if(!s.panicDelay)endTurn(s);}return true;}if(input&&Math.hypot(input.x,input.y)>.1){s.queue=[];const n=Math.max(1,Math.hypot(input.x,input.y));travel(s,u,input.x/n*movementSpeed(u)*dt,input.y/n*movementSpeed(u)*dt);}else if(s.queue.length){const p=s.queue[0],d=distance(u,p);if(d<.025)s.queue.shift();else{const step=Math.min(d,movementSpeed(u)*dt),moved=travel(s,u,(p.x-u.x)/d*step,(p.y-u.y)/d*step);if(!moved||s.phase==='player'&&u.ap<EPS)s.queue=[];}}else if(s.phase==='explore'||s.phase==='won')u.stamina=Math.min(u.maxStamina,u.stamina+dt*2);return true;}
const fireRules=createFireRules({kill,walkSegment,random,key,log,onIgnite:(s,u)=>markDamageCredit(s,u)});
const fuelRules=createFuelRules({kill,ignite:fireRules.ignite,recordBurn,inside:insideWorld,log,windowBlast});
const barrelRules=createBarrelRules({log,clearGeometry:s=>{geometryCache.delete(s);delete s.fogAt;},explode:(s,prop)=>{
  const walls=planWallBlast(s,{...prop,h:.4},5,d=>180*(1-d/5)),receipt=fuelRules.barrel(s,prop);
  commitWallDamage(s,walls,receipt);return receipt;
}});
export const ignite=(s,u)=>{const result=fireRules.ignite(s,u);if(result)refresh(s);return result;};
export const enterFire=(s,u)=>{const result=fireRules.enterFire(s,u);if(result)refresh(s);return result;};
const interactionRules=createInteractionSystem({hero,canControl,combatCosts,distance,geometry,blocksWalking,pointBoxDistance,refresh,stop,log,clearGeometry:s=>geometryCache.delete(s),weapons:WEAPONS,radius:RADIUS});
export const interactionObjects=s=>interactionRules.objects(s);
export const nearbyInteractions=s=>interactionRules.nearby(s);
export const previewInteraction=(s,id,action,itemId)=>interactionRules.preview(s,id,action,itemId);
export const performInteraction=(s,id,action,itemId)=>{const result=interactionRules.perform(s,id,action,itemId);if(result.ok&&s.realtime&&!['loot','inspect'].includes(action))realtimeRules.actor(s,hero(s)).cooldown=Math.max(realtimeRules.actor(s,hero(s)).cooldown,action==='open'||action==='search'?1:.4);return result;};
// Existing mission/menu callers use the same validated actions as the hand.
export function interaction(s){const mission=missionForState(s),object=nearbyInteractions(s).find(object=>['ledger','objective','extract'].includes(object.kind));if(!object)return null;return {...object.actions[0],kind:object.kind,label:object.kind==='extract'?mission.extraction.label:'Take the '+mission.objective.name.toLowerCase()};}
export function interact(s){if(missionForState(s).exploration){const object=nearbyInteractions(s)[0];return !!object&&performInteraction(s,object.id,object.actions[0].id).ok;}const secured=objectiveSecured(s);return performInteraction(s,secured?'extraction':missionForState(s).objective.id,secured?'extract':'collect').ok;}
export function dressing(s){const u=hero(s),cost=combatCosts(s)?3:0;if(!canControl(s,u)||s.solo.dressings<1||u.hp>=u.maxHp||u.ap+EPS<cost)return false;stop(s);u.ap-=cost;u.hp=Math.min(u.maxHp,u.hp+35);s.solo.dressings--;log(s,u.name+' used a field dressing (+35 HP).');return true;}
export function encodeSave(s){if(isTour(s))return encodeTourProgress(s,getTourWorld(s));return JSON.stringify(s,(k,v)=>['effect','fireAnimations','windowEvents'].includes(k)?undefined:v instanceof Set?{$set:[...v]}:v);}
export function decodeSave(text){
  const s=JSON.parse(text,(_,v)=>v&&Array.isArray(v.$set)?new Set(v.$set):v);
  if(s?.kind==='farmyard-mount-dora-tour')throw Error('Resume the walking tour through its streamed loader.');
  if(s?.solo?.version!==2||!validBuild(s.solo.build)||!Array.isArray(s.units)||s.units.filter(u=>u?.team==='squad').length!==1||!['active','extracted','lost'].includes(s.solo.status)||!['visible','seen','detected'].every(k=>s[k] instanceof Set))throw Error('Unsupported solo save.');
  const mission=missionForState(s);s.solo.missionId=mission.id;
  if(s.solo.authoredMap&&mission.id!==WINDOW_REVIEW_ID)throw Error('Unsupported authored operation save.');
  const map=s.solo.authoredMap?adaptAftSector(s.solo.authoredMap):missionMap(mission.id,mission.layoutVersion??1),{width,height}=gridDimensions(map),canonical={map:map.terrain,worldBounds:map.worldBounds};
  if(!Array.isArray(s.map)||s.map.length!==height||s.map.some(row=>!Array.isArray(row)||row.length!==width)||s.units.some(u=>!u||!insideWorld(canonical,u)||!Number.isFinite(u.hp)||!Number.isFinite(u.ap)||u.lastKnown&&!insideWorld(canonical,u.lastKnown)))throw Error('Unsupported solo save.');
  if(s.fogAt&&!insideWorld(canonical,s.fogAt))throw Error('Unsupported visibility save.');
  const validCell=value=>{if(typeof value!=='string'||!/^\d+,\d+$/.test(value))return false;const [x,y]=value.split(',').map(Number);return x<width&&y<height&&insideWorld(canonical,{x,y});};
  if(['visible','seen'].some(name=>[...s[name]].some(value=>!validCell(value)))||[...s.detected].some(id=>!s.units.some(u=>u.id===id)))throw Error('Unsupported visibility save.');
  if(!s.edges||typeof s.edges!=='object'||Array.isArray(s.edges)||Object.entries(s.edges).some(([edge,kind])=>{const match=/^[es]:(\d+):(\d+)$/.exec(edge);return !match||+match[1]>=width||+match[2]>=height||!['wall','door','closed-door'].includes(kind);}))throw Error('Unsupported geometry save.');
  if(s.queue===undefined)s.queue=[];
  if(!Array.isArray(s.queue)||s.queue.some(p=>!p||!insideWorld(canonical,p,RADIUS)||!Number.isFinite(p.cost)||p.cost<0))throw Error('Unsupported movement save.');
  if(Array.isArray(s.interactables)&&s.interactables.some(object=>object?.kind!=='body'&&(!object||!insideWorld(canonical,object))))throw Error('Unsupported object save.');
  // Saved terrain/door state remains played state. Imported immutable scenery
  // is always rebuilt from the mission, never trusted from a save or a window.
  mapMetadata(s,map);barrelRules.restore(s);windowSystem.restore(s);restoreWallDamage(s,map);
  if(s.solo.objectives===undefined)s.solo.objectives={};
  if(!s.solo.objectives||typeof s.solo.objectives!=='object'||Array.isArray(s.solo.objectives)||Object.entries(s.solo.objectives).some(([id,value])=>id!==mission.objective.id||typeof value!=='boolean'))throw Error('Unsupported objective save.');
  if(mission.id===DEFAULT_MISSION_ID&&s.solo.ledger)s.solo.objectives.ledger=true;
  if(s.solo.inspected===undefined)s.solo.inspected=[];
  if(!Array.isArray(s.solo.inspected)||s.solo.inspected.some(id=>!mission.clues.some(clue=>clue.id===id)))throw Error('Unsupported inspection save.');
  return releaseFromScenery(restoreRuntimeSystems(s));
}
export function restoreRuntimeSystems(s){
  validateRealtime(s,p=>insideWorld(s,p));
  fireRules.restore(s,p=>insideWorld(s,p));fuelRules.restore(s);
  return interactionRules.restore(s);
}
// The nearest spot around p (never p itself) where a unit could stand, scanned
// outward in 5 cm rings of 32 bearings; null beyond maxRadius metres.
function nearestStanding(s,p,ignoreId,maxRadius){
  for(let ring=1;ring*.05<=maxRadius+EPS;ring++){const r=ring*.05;for(let i=0;i<32;i++){const a=i/32*Math.PI*2,q={x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r};if(freePoint(s,q,ignoreId))return q;}}
  return null;
}
// Approach goals are remembered ground points: retain standing sight, independent
// of the quarry's current stance. Window heads/sills block only at their actual
// height; ordinary walls keep the existing opaque footprint rule.
function standingWallHit(a,b,box){return intersectsBox(a,b,box)&&(!box.windowPart||!!airSpan(a,b,STANDING_EYE,STANDING_EYE,box));}
// Expand footprints by ARRIVED without stretching a window member vertically.
// The 8 cm horizontal stopping margin still protects a goal's standing view.
function wideSight(s,a,b,margin){return !geometryNear(s,a,b,margin,'wall').some(box=>standingWallHit(a,b,{...box,x0:box.x0-margin,x1:box.x1+margin,y0:box.y0-margin,y1:box.y1+margin}));}
// A guard closing on its quarry stops 0.75 m short of it. With a straight walk to
// that spot, and a clear line from it to the quarry, it walks straight there.
// Otherwise one search takes it to the nearest node, by walking distance, that
// stands within QUARRY_REACH of the quarry and sees it past the walls; from there
// the straight walk usually opens. The goal set depends on the quarry and the
// scenery alone, not on where the guard stands, so a step cannot flip the plan, and
// no single solid or cut-off spot can freeze the guard. Sight is tested with walls
// grown by ARRIVED, so it holds wherever the guard stops. Nothing is held between
// ticks: a resumed save plans exactly the same route.
export const QUARRY_REACH=2;
const SEALED_BUDGET=128;
// A last-seen point inside scenery (a door shut over it, a leaf swung onto it, a prop
// an old save predates) is no spot an animal could stand on, and close to it nothing
// can see it. Its stand-ins are clear points that would see it but for what covers it
// (the boxes within a body's radius of it), scanned in 5 cm rings (32 bearings) out to
// 0.7 m beyond the first ring that has one (a shut door's clearance is 0.62 m across,
// so the far side is always reached) and at most 1.5 m: one for each group of them
// that see one another past the walls, the innermost of each. A shut door gets one on
// each side, an open leaf one on each face, and nothing behind a wall gets one. The
// search takes goals round every stand-in, so a guard walks to whichever side of a
// shut door it reaches first. Units are left out, so nobody's body pushes a stand-in
// away, and the stand-ins depend on the point and the scenery alone; they are kept
// per geometry.
export function standIns(s,p){
  if(freePoint(s,p,null,{units:false}))return [p];
  const grid=sceneryGrid(s),k=`${p.x},${p.y}`;if(grid.standIns.has(k))return grid.standIns.get(k);
  const cover=new Set(geometryNear(s,p,p,RADIUS,'walk').filter(box=>pointBoxDistance(p,box)<RADIUS-EPS));
  const seesPast=q=>!geometryNear(s,p,q,0,'wall').some(box=>!cover.has(box)&&standingWallHit(p,q,box));
  let clear=[];
  for(let ring=1,last=30;ring<=last;ring++){
    for(let i=0;i<32;i++){const a=i/32*Math.PI*2,q={x:p.x+Math.cos(a)*ring*.05,y:p.y+Math.sin(a)*ring*.05};if(freePoint(s,q,null,{units:false})&&seesPast(q))clear.push(q);}
    if(clear.length&&last===30)last=Math.min(30,ring+14);
  }
  const stands=[],sees=(a,b)=>lineClear(s,{...a,stance:'standing'},{...b,stance:'standing'});
  while(clear.length){const q=clear[0];stands.push(q);clear=clear.filter(r=>!sees(r,q));}
  grid.standIns.set(k,Object.freeze(stands));return stands;
}
// The nodes a guard's search starts from: normally the nearest node it can walk
// straight to. A route smoothed along a wall can cross a strip so narrow that no node
// is a straight walk from it (Short Measure has one, between the ration room's south
// wall and the sealed-load-arrival prop). A guard standing in one may leave along any
// of 32 bearings: on each, the first point 10-150 cm out from which a node is a
// straight walk starts the search at the cost of walking there and on to the node, so
// the guard leaves by the way that is shortest to walk, as it takes a door's side.
function searchStarts(s,g){
  const node=gridNodesAround(s,g,g)[0];if(node)return [{...node,cost:0}];
  const starts=new Map();
  for(let i=0;i<32;i++){
    const a=i/32*Math.PI*2;
    for(let ring=2;ring<=30;ring++){
      const q={x:g.x+Math.cos(a)*ring*.05,y:g.y+Math.sin(a)*ring*.05};
      if(!freePoint(s,q,g.id)||!walkSegment(s,g,q,g.id))break;
      const node=gridNodesAround(s,g,q)[0];if(!node)continue;
      const k=key(node.x,node.y),cost=distance(g,q)+distance(q,node);
      if(!(starts.get(k)?.cost<=cost))starts.set(k,{...node,cost,via:q});
      break;
    }
  }
  return [...starts.values()];
}
export function approachPath(s,g,lastSeen){
  const quarries=standIns(s,lastSeen);if(!quarries.length)return null;
  // The straight walk tries the stand-ins nearest first; the search weighs them all.
  for(const quarry of [...quarries].sort((a,b)=>distance(a,g)-distance(b,g))){
    const range=distance(g,quarry),offset=Math.min(.75,range),aim={x:quarry.x-(quarry.x-g.x)/Math.max(range,.001)*offset,y:quarry.y-(quarry.y-g.y)/Math.max(range,.001)*offset};
    if(wideSight(s,aim,quarry,ARRIVED)&&freePoint(s,aim,g.id)&&walkSegment(s,g,aim,g.id))return [{...aim,z:0,cost:distance(g,aim)*movementRate(g)}];
  }
  const goals=[],taken=new Set(),grid=sceneryGrid(s);
  const reach=QUARRY_REACH+EPS;
  for(const q of quarries)for(let y=Math.ceil(q.y-reach);y<=q.y+reach;y++)for(let x=Math.ceil(q.x-reach);x<=q.x+reach;x++){const p={x,y},pk=key(x,y);if(!taken.has(pk)&&distance(p,q)<=reach&&nodeClear(s,grid,p,g.id)&&wideSight(s,p,q,ARRIVED)){taken.add(pk);goals.push(p);}}
  const starts=goals.length?searchStarts(s,g):[];if(!starts.length)return null;
  // A quarry behind closed doors sits in a small pocket: after SEALED_CHECK nodes
  // without reaching it, flood back from its goals, and when that flood runs dry
  // within SEALED_BUDGET nodes without meeting the guard's search, stop there
  // instead of searching the rest of the map every round.
  const goalKeys=new Set(goals.map(p=>key(p.x,p.y))),sealed=reached=>{
    const seen=new Set(goalKeys),queue=[...goals];
    for(let i=0;i<queue.length;i++){
      const p=queue[i];if(reached.has(key(p.x,p.y)))return false;
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
        const q={x:p.x+dx,y:p.y+dy},qk=key(q.x,q.y);if((!dx&&!dy)||seen.has(qk)||!nodeClear(s,grid,q,g.id)||!linkClear(s,grid,q,p,g.id))continue;
        seen.add(qk);queue.push(q);if(queue.length>SEALED_BUDGET)return false;
      }
    }
    return true;
  };
  const estimate=quarries.length===1?q=>Math.max(0,distance(q,quarries[0])-QUARRY_REACH):q=>Math.min(...quarries.map(c=>Math.max(0,distance(q,c)-QUARRY_REACH)));
  const raw=gridSearch(s,g,starts,(p,pk)=>goalKeys.has(pk),estimate,sealed);if(!raw)return null;
  const via=starts.find(p=>p.x===raw[0].x&&p.y===raw[0].y).via;
  return smoothRoute(s,g,via?[via,...raw]:raw);
}
// A save written before a prop became solid may store a living animal inside it
// (Short Measure's ration scale stands where its clue marker once had no
// collision). Such a unit moves to the nearest clear point, scanned outward in
// 5 cm rings; every other played position is kept exactly.
function releaseFromScenery(s){
  for(const u of s.units){
    if(!alive(u)||freePoint(s,u,u.id,{units:false}))continue;
    const best=nearestStanding(s,u,u.id,3);
    if(!best)continue;
    u.x=best.x;u.y=best.y;u.isMoving=false;
    if(u.team==='squad')s.queue=[];
  }
  return s;
}
function realtimePlayerStep(s,dt,input){
  const u=hero(s);
  if(input&&Math.hypot(input.x,input.y)>.1){s.queue=[];const n=Math.max(1,Math.hypot(input.x,input.y));travel(s,u,input.x/n*movementSpeed(u)*dt,input.y/n*movementSpeed(u)*dt);}
  else if(s.queue.length){const p=s.queue[0],d=distance(u,p);if(d<.025)s.queue.shift();else{const step=Math.min(d,movementSpeed(u)*dt);if(!travel(s,u,(p.x-u.x)/d*step,(p.y-u.y)/d*step))s.queue=[];}}
}
function guardActive(s,g){
  const town=getTourWorld(s);
  return !town||(distance(g,hero(s))<=72&&town.residentAt(g)&&(!g.lastKnown||town.residentAt(g.lastKnown)));
}
const realtimeRules=createRealtimeRules({hero,alive,distance,canSee,confirmedImpact,previewAttack,headingTo,flameAffects,previewFlame,fireFlame:(s,u,heading)=>fireFlame(s,u,heading,{keepMovement:true}),attack:(s,a,...args)=>damageAction(s,a,a.weapon,()=>attackNow(s,a,...args)),completeReload:(s,u)=>reloadNow(s,u,true),travel,movePlayer:realtimePlayerStep,approachPath,navigationPath,guardActive,pointTargetExists:(s,p)=>!!barrelRules.present(s,p.barrelId),refresh,log,fireRules});
export function targetBarrel(s,u,point){
  const w=WEAPONS[u.weapon];
  if(!canControl(s,u)||!barrelRules.present(s,point?.barrelId)||!s.seen.has(key(point.x,point.y))||distance(u,point)>w.range)return false;
  if(w.incendiary)return fireFlame(s,u,headingTo(u,point));
  if(!w.mag||w.thrown)return false;
  stop(s);return s.realtime?realtimeRules.targetPoint(s,u,point):attack(s,u,point,false);
}
export const enableRealtime=s=>realtimeRules.enable(s);
export const configureRealtime=(s,changes)=>realtimeRules.configure(s,changes);
export const pinRealtimeTarget=(s,id)=>realtimeRules.pin(s,id);
export const realtimeStatus=s=>s.realtime?realtimeRules.status(s):null;
export const realtimeTarget=s=>s.realtime?realtimeRules.choose(s):null;
export function realtimeWeaponAim(s,u){
  const aim=realtimeRules.aimFor(s,u);
  if(!aim)return null;
  const {target,zone,progress}=aim;
  return {x:target.x,y:target.y,h:shotHeight(target,zone),progress};
}
const pressRealtimeTrigger=(s,u,target,zone,aim)=>realtimeRules.pressTrigger(s,u,target,zone,aim);
const releaseRealtimeTrigger=(s,tap)=>realtimeRules.releaseTrigger(s,tap);
export const Core={enableRealtime,configureRealtime,pinRealtimeTarget,realtimeStatus,realtimeTarget,pressRealtimeTrigger,releaseRealtimeTrigger,targetBarrel,tankExplosionChance,ignite,enterFire,WEAPONS,AIM_ZONES,key,alive,movementModeOf,movementRate,movementSpeed,combatCosts,canControl,canSee,sneakStatus,visibleOpponents,refresh,log,stop,travel,navigationPath,move,turnTo,setMovementMode,setStance,grenadeCost,grenadeTrajectory,grenadeAffects,grenadeBlastFootprint,previewGrenade,throwGrenade,previewFlame,fireFlame,previewPointAttack,previewAttack,attack,equip,reload,endTurn,headingTo,interactionObjects,nearbyInteractions,previewInteraction,performInteraction,restoreRuntimeSystems};
