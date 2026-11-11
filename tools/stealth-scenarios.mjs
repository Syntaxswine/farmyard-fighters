import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {TownWorld,decodeTownSector} from '../sites/tactical-animal/dist/mount-dora-world.js';
import {Core,confirmedImpact,createSoloGame,DEFAULT_BUILD,hero,tick} from '../sites/tactical-animal/dist/solo-game.js';
import {damageAfterResistance,initializeStats} from '../sites/tactical-animal/dist/aft/tactics/character-stats.js';

// Declared synthetic fixture. Geographic project data supplies the supported
// world envelope and decoder schema. All placements below belong to this yard.
export const STEALTH_SCENARIO={
  id:'two-route-ambush-v1',
  synthetic:true,
  victory:'Player alive and every guard dead',
  build:{...DEFAULT_BUILD,fireMode:'auto'},
  stepSeconds:.05,
  timeoutSeconds:90,
  targetPriority:'threat',
  spawn:{x:120,y:166,heading:270},
  guards:[
    {id:1,name:'West defender',species:'pig-foreman',weapon:'hmg',x:117,y:127.7,heading:90},
    {id:2,name:'East defender',species:'pig-foreman',weapon:'assault',x:122,y:128.1,heading:90}
  ],
  guardStats:{strength:55,endurance:60,dexterity:65,firearms:65,heavyWeapons:65,perception:60},
  solids:[
    {id:'west-building',x0:111,y0:146,x1:119.6,y1:159,height:3,cover:true},
    {id:'east-building',x0:124,y0:143,x1:130,y1:151,height:3},
    {id:'defender-cover',x0:115,y0:128.5,x1:124,y1:129,height:.92,cover:true}
  ],
  brush:{x0:135,x1:142,y0:122,y1:169,density:60},
  trees:[{x:140,y:142,z:0,kind:'tree-broadleaf'},{x:140,y:155,z:0,kind:'tree-broadleaf'}],
  routes:{
    frontal:{targetWinRate:.5,stance:'standing',mode:'run',
      waypoints:[{x:120,y:145.4}],fightStance:'kneeling',aim:'aimed'},
    flank:{targetWinRate:.8,stance:'prone',mode:'sneak',
      waypoints:[{x:136,y:166},{x:136,y:127.8},{x:131,y:127.8}],fightStance:'prone',aim:'aimed'}
  }
};

const project=JSON.parse(fs.readFileSync(new URL('../maps/mount-dora/project.json',import.meta.url)));
const sector=project.sectors.find(s=>s.id==='A01');
const raw={version:2,name:'Synthetic two-route ambush',width:240,height:240,levels:3,
  upper:[{},{}],edges:{},stairs:[],climbs:[],props:STEALTH_SCENARIO.trees,guards:sector.guards,
  terrain:Array.from({length:240},()=>Array(240).fill('ground-grass')),
  mountDora:{sectorId:sector.id,buildingIds:[]},foliage:{}};
const brush=STEALTH_SCENARIO.brush;
for(let y=brush.y0;y<=brush.y1;y++)for(let x=brush.x0;x<=brush.x1;x++)
  raw.foliage[x+','+y+',0']=[brush.density,false,'woodland-v1'];
for(const tree of raw.props)delete raw.foliage[tree.x+','+tree.y+',0'];
const packet=decodeTownSector(raw,sector);
const digest=createHash('sha256').update(JSON.stringify(STEALTH_SCENARIO)).digest('hex');
const art={ART_REVISION:digest,PLACEMENTS:STEALTH_SCENARIO.solids.map(s=>({
  id:s.id,solids:[{kind:'polygon',height:s.height,cover:!!s.cover,
    polygons:[[[[s.x0+.5,s.y0+.5],[s.x1+.5,s.y0+.5],[s.x1+.5,s.y1+.5],[s.x0+.5,s.y1+.5]]]]}]
}))};

export function createStealthScenario(seed){
  const world=new TownWorld(project,{art,fetcher:()=>{throw Error('Synthetic benchmark has no external map fetches.');}});
  world.cache.set(sector.id,packet);
  world.sourceRevision=digest;
  world.startPoint=STEALTH_SCENARIO.spawn;
  world.guardPosts=STEALTH_SCENARIO.guards;
  const state=createSoloGame(STEALTH_SCENARIO.build,seed,'mount-dora',{tourWorld:world});
  for(const guard of state.units.filter(u=>u.team==='guard'))initializeStats(guard,STEALTH_SCENARIO.guardStats);
  Core.enableRealtime(state);
  return {state,world,dispose:()=>world.dispose()};
}

// Hash trial indices across the uint32 seed space. Consecutive raw LCG seeds
// have correlated opening rolls, which would distort a small trial batch.
export function trialSeed(index,base=1947){
  let value=(index+base)>>>0;
  value=Math.imul(value^(value>>>16),0x7feb352d);
  value=Math.imul(value^(value>>>15),0x846ca68b);
  return (value^(value>>>16))>>>0;
}

export function runStealthTrial(routeId,seed){
  const route=STEALTH_SCENARIO.routes[routeId];
  if(!route)throw Error('Unknown stealth route '+routeId);
  const {state,world,dispose}=createStealthScenario(seed),player=hero(state);
  const result={seed,route:routeId,win:false,outcome:'timeout',firstSpottedAt:null,firstPlayerShotAt:null,
    spottedBeforeAttack:false,shots:0,guardShots:0,collateralHits:0,hpAtAttack:null};
  let waypoint=0,fighting=false,lastEffect;
  function observeSight(){
    if(result.firstSpottedAt===null&&state.units.some(g=>g.team==='guard'&&g.hp>0&&Core.canSee(state,g,player)))
      result.firstSpottedAt=state.elapsed;
  }
  function engage(){
    fighting=true;result.hpAtAttack=player.hp;
    Core.stop(state);Core.setStance(state,player,route.fightStance);
    const living=state.units.filter(g=>g.team==='guard'&&g.hp>0);
    if(living.length)Core.turnTo(state,player,Core.headingTo(player,living[0]));
    Core.configureRealtime(state,{autoFire:true,aim:route.aim,fireMode:'auto',priority:STEALTH_SCENARIO.targetPriority});
  }
  try{
    if(!world.pointClear(player))throw Error('Synthetic start is obstructed.');
    Core.setStance(state,player,route.stance);Core.setMovementMode(state,player,route.mode);
    for(let frame=0;frame<STEALTH_SCENARIO.timeoutSeconds/STEALTH_SCENARIO.stepSeconds;frame++){
      observeSight();
      let input=null;
      if(!fighting){
        let end=route.waypoints[waypoint];
        if(Math.hypot(end.x-player.x,end.y-player.y)<.01)end=route.waypoints[++waypoint];
        if(!end)engage();
        else{
          const dx=end.x-player.x,dy=end.y-player.y,distance=Math.hypot(dx,dy);
          const step=Core.movementSpeed(player)*STEALTH_SCENARIO.stepSeconds;
          const scale=Math.min(1,distance/step);
          input={x:dx/distance*scale,y:dy/distance*scale};
        }
      }
      if(fighting){
        const targets=Core.visibleOpponents(state);
        const torso=targets.some(g=>confirmedImpact(state,player,g,'torso')?.unit?.id===g.id);
        const zone=torso?'torso':'head';
        if(state.realtime.zone!==zone)Core.configureRealtime(state,{zone});
      }
      tick(state,STEALTH_SCENARIO.stepSeconds,input);
      observeSight();
      if(state.effect!==lastEffect){
        lastEffect=state.effect;
        for(const shot of state.effect?.sequence??[]){
          if(shot.shooter===player.id){
            result.shots++;
            if(result.firstPlayerShotAt===null)result.firstPlayerShotAt=state.elapsed;
            if(shot.impact&&shot.impact.unitId!==shot.target)result.collateralHits++;
          }else result.guardShots++;
        }
      }
      if(player.hp<=0){result.outcome='dead';break;}
      if(state.units.filter(g=>g.team==='guard').every(g=>g.hp<=0)){
        result.win=true;result.outcome='victory';break;
      }
    }
    result.spottedBeforeAttack=result.firstSpottedAt!==null&&
      (result.firstPlayerShotAt===null||result.firstSpottedAt<result.firstPlayerShotAt);
    return {...result,seconds:state.elapsed,hp:player.hp,maxHp:player.maxHp,
      maximumGuardTorsoDamage:Math.max(...state.units.filter(g=>g.team==='guard').map(g=>damageAfterResistance(player,Core.WEAPONS[g.weapon].damage))),
      guardsKilled:state.units.filter(g=>g.team==='guard'&&g.hp<=0).length,
      position:{x:player.x,y:player.y}};
  }finally{dispose();}
}
