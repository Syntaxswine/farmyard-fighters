import {TownWorld,sha256} from './mount-dora-world.js';
import {blockWindow} from './world-grid.js';
import {TOUR_ID,TOUR_ACTIVITY,getTourWorld} from './mount-dora-activity.js';
import {createSoloGame,validBuild,hero,Core,freePoint,log} from './solo-game.js';
import {TownExplored} from './mount-dora-progress.js';
import {TownEnvironment,drawTownMinimap} from './mount-dora-view.js';
// Source-reviewed approaches in canonical town metres; open-shelter visits use
// Architect-verified centres so the artwork and roof focus are immediately visible.
// Each keeps its place beside its landmark as reviewed on main when the grid
// streets were straightened (project.json generation.approachMovesM).
export const TOUR_VISITS=Object.freeze([
  {id:'donnelly-park',name:'Donnelly Park',town:[478,483.75]},
  {id:'lakeside-inn',name:'Lakeside Inn',town:[334.5,808.5]},
  {id:'elizabeth-evans',name:'Elizabeth Evans Park',town:[470,1005]},
  {id:'grantham-lighthouse',name:'Grantham Point lighthouse',town:[504.5,1168.5]},
  {id:'gilbert-park',name:'Gilbert Park',town:[737.2963,1180.367]},
  {id:'palm-island',name:'Palm Island boardwalk',town:[529.5,1402.5]},
  {id:'palm-entrance',name:'Palm Island entrance',town:[665.969,1296.5786]},
  {id:'historic-shopfronts',name:'Donnelly / Fourth shopfronts',town:[434.5,636.5]},
  {id:'donnelly-house',name:'Donnelly House',town:[414.5,479.5]},
  {id:'history-museum',name:'History Museum',town:[480.5,598.5]},
  {id:'former-depot',name:'Former depot',town:[326.5,685.5]}
]);
async function readBytes(fetcher,url,signal,limit){
  const response=await fetcher(url,{signal,cache:'no-cache'});if(!response.ok)throw Error('Could not load town data (HTTP '+response.status+').');
  const bytes=await response.arrayBuffer();if(bytes.byteLength>limit)throw Error('Town document exceeds its supported size.');return bytes;
}
function restoreGuard(state,guard,saved,rosterChanged,layoutChanged){
  const {name,patrol}=guard;
  if(!rosterChanged&&!layoutChanged){
    if(saved.patrolIndex!==undefined&&saved.patrolIndex>=(patrol?.length??0))throw Error('Unsupported saved patrol waypoint.');
    Object.assign(guard,structuredClone(saved),{name,patrol,isMoving:false});
    return;
  }
  // Old posts can now lie inside walls or foliage. Preserve casualties and
  // proportional injuries while placing the revised roster at its new posts.
  const fresh={...guard};
  const previous=structuredClone(saved);
  if(saved.hp>0&&rosterChanged){
    Object.assign(guard,previous,fresh,{hp:Math.max(1,Math.round(fresh.maxHp*saved.hp/saved.maxHp))});
    if(guard.burningTurns)guard.ap=0;
  }else{
    Object.assign(guard,previous,{x:fresh.x,y:fresh.y,heading:fresh.heading,name,patrol,alert:false,lastKnown:null,isMoving:false});
  }
  delete guard.patrolIndex;delete guard.patrolWaitUntil;
  delete guard.level;delete guard.elevation;delete guard.stairId;
  if(state.realtime?.actors)delete state.realtime.actors[guard.id];
}
export async function loadTownTour({build,progress=null,signal,fetcher=globalThis.fetch,projectURL=new URL('./maps/mount-dora/project.json',import.meta.url),artModule,kitModule,interiorModule}={}){
  if(!validBuild(progress?.build||build))throw Error('Choose a valid animal and loadout.');
  const [projectBytes,art,kit,interiors]=await Promise.all([readBytes(fetcher,projectURL,signal,1_000_000),
    artModule||import('./mission-art/mount-dora/manifest.js'),kitModule||import('./mission-art/mount-dora/kit.js'),interiorModule||import('./mission-art/mount-dora-interiors/manifest.js')]);
  if(signal?.aborted)throw new DOMException('Canceled','AbortError');
  const project=JSON.parse(new TextDecoder().decode(projectBytes)),baseURL=new URL('./',projectURL);
  if(project.generation.authoredLayoutSHA256!==art.AUTHORED_LAYOUT_SHA256)throw Error('Town map and artwork layouts differ. Reload the page before starting.');
  const features=await readBytes(fetcher,new URL(project.featuresFile,baseURL),signal,8_000_000);
  if(await sha256(features)!==art.SOURCE_FEATURES_SHA256)throw Error('Town map and artwork revisions differ. Reload the page before starting.');
  const world=await new TownWorld(project,{baseURL,fetcher,art,interiors}).identify();
  world.restoreObjectChanges(progress?.runtime?.objects);
  world.restoreExploration(progress);
  world.artModule=art;world.visits=TOUR_VISITS;world.sourceSignal=new AbortController();
  const abort=()=>world.dispose();signal?.addEventListener('abort',abort,{once:true});
  const dispose=world.dispose.bind(world);world.dispose=()=>{world.sourceSignal.abort();signal?.removeEventListener('abort',abort);world.overviewImage=null;dispose();};
  world.createEnvironment=(renderer,state,options)=>new TownEnvironment(renderer,state,{...options,artModule:art,createArt:kit.createMountDoraArt,
    loadAtlas:THREE=>kit.loadMountDoraAtlas({THREE,signal:world.sourceSignal.signal,url:new URL(art.ATLAS_URL,new URL('./mission-art/mount-dora/manifest.js',import.meta.url)).href})});
  world.drawMinimap=drawTownMinimap;
  if(typeof Image!=='undefined'){const image=new Image();image.onload=()=>{if(!world.disposed){world.overviewImage=image;world.emit();}};image.onerror=()=>{world.overviewUnavailable=true;};image.src=new URL(project.atlasFile,baseURL).href;}
  world.startPoint=progress?{x:progress.player.x,y:progress.player.y,heading:progress.player.heading,...(progress.player.level||progress.player.stairId?{level:progress.player.level??0,elevation:progress.player.elevation,...(progress.player.stairId?{stairId:progress.player.stairId}:{})}:{})}:{...TOUR_ACTIVITY.spawn};
  try{
    await world.readyAt(world.startPoint);
    let relocated=false;
    if(progress&&!world.resumeClear(world.startPoint)){
      const old=world.startPoint,candidates=[];
      for(let y=-24;y<=24;y++)for(let x=-24;x<=24;x++)candidates.push({x:Math.round(old.x)+x,y:Math.round(old.y)+y});
      candidates.sort((a,b)=>Math.hypot(a.x-old.x,a.y-old.y)-Math.hypot(b.x-old.x,b.y-old.y)||a.y-b.y||a.x-b.x);
      const target=candidates.find(p=>world.resumeClear(p))||{...TOUR_ACTIVITY.spawn};
      await world.readyAt(target);
      if(!world.resumeClear(target))throw Error('No clear outdoor approach is available for this saved tour. Your checkpoint has been preserved.');
      world.startPoint={...target,heading:old.heading};relocated=true;
    }
    if(!world.resumeClear(world.startPoint))throw Error('The Donnelly Park approach is obstructed. Try loading the current tour artwork again.');
    if(signal?.aborted)throw new DOMException('Canceled','AbortError');
    const state=createSoloGame(progress?.build||build,1947,TOUR_ID,{tourWorld:world});
    if(progress){
      const initial=hero(state),u=progress.player;if(u.species!==initial.species||u.slots.some(kind=>!Core.WEAPONS[kind])||!Core.WEAPONS[u.weapon])throw Error('Unsupported saved tour animal or equipment.');
      Object.assign(initial,structuredClone(u),{id:0,team:'squad',x:world.startPoint.x,y:world.startPoint.y,isMoving:false,...(relocated?{level:0,elevation:0,stairId:undefined}:{})});state.seen=world.exploredFloors.get(initial.level??0)||new TownExplored();
      state.solo.dressings=progress.dressings;state.solo.distance=progress.distance;state.elapsed=progress.elapsed;state.log=(progress.log||[]).filter(x=>typeof x==='string').slice(0,20);
      if(progress.runtime){
        const r=progress.runtime;if(r.realtime)state.realtime=structuredClone(r.realtime);Object.assign(state,{phase:r.phase,round:r.round,seed:r.seed,engaged:r.engaged,enemyIndex:r.enemyIndex,enemyDelay:r.enemyDelay,fires:structuredClone(r.fires)});
        if(r.panicDelay!==undefined)state.panicDelay=r.panicDelay;
        state.solo.status=r.status;if(r.areaWeapon)state.solo.areaWeapon=r.areaWeapon;
        for(const saved of r.guards||[]){
          const guard=state.units.find(u=>u.id===saved.id&&u.team==='guard');
          if(!guard||saved.species!==guard.species||!Core.WEAPONS[saved.weapon]||saved.slots.some(kind=>!Core.WEAPONS[kind]))throw Error('Unsupported saved town guard.');
          const rosterChanged=!!world.guardRosterVersion&&r.guardRosterVersion!==world.guardRosterVersion;
          restoreGuard(state,guard,saved,rosterChanged,progress.sourceRevision!==world.sourceRevision);
        }
      }
      // Restore casualties through the normal body system before applying
      // each saved container's searched and looted state.
      Core.restoreRuntimeSystems(state);
      if(progress.runtime?.objects.length){
        for(const saved of progress.runtime.objects){const object=state.interactables.find(o=>o.id===saved?.id);if(!object)continue;for(const key of ['open','searched','inventory'])if(saved[key]!==undefined)object[key]=structuredClone(saved[key]);}
        Core.restoreRuntimeSystems(state);
      }
      if(relocated)log(state,'The town layout has changed. Moved to a clear outdoor approach; your equipment and tour progress are retained.');
      else if(progress.sourceRevision!==world.sourceRevision||progress.artRevision!==world.artRevision)log(state,'The town has been updated. Your saved position is clear and your progress is retained.');
      Core.refresh(state,{forceFog:true});
    }
    return state;
  }catch(error){world.dispose();throw error;}
}
export async function visitTownLandmark(state,id){
  const world=getTourWorld(state),visit=TOUR_VISITS.find(v=>v.id===id);if(!world||!visit)throw Error('Choose a town landmark.');
  const u=hero(state),old={x:u.x,y:u.y},target={x:visit.town[0]-.5,y:visit.town[1]-.5,level:0,elevation:0};
  world.coverageTarget=target;world.ensureCoverage(blockWindow(state,target),target);world.retry();
  try{
    await world.readyAt(target);if(world.disposed)throw Error('The tour has ended.');
    if(!world.resumeClear(target)||!freePoint(state,target,u.id,{from:null}))throw Error('That landmark approach is obstructed. Your animal has stayed at its previous location.');
    Core.stop(state);Object.assign(u,target,{isMoving:false});delete u.stairId;delete state.fogAt;Core.refresh(state,{forceFog:true});log(state,'Visited '+visit.name+'.');
  }finally{
    world.coverageTarget=null;
    if(!world.disposed)world.ensureCoverage(blockWindow(state,u),u);
  }
  return {visit,from:old,to:{x:u.x,y:u.y}};
}
