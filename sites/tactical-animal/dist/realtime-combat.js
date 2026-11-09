import {WEAPONS} from './aft/tactics/solo-weapon-data.js';
import {AIM_LEVELS} from './aft/tactics/aim-levels.js';
import {weaponSkill,refreshStats} from './aft/tactics/character-stats.js';
import {patrolDestination} from './aft/tactics/character-patrol.js';

// Seconds, independent of frame rate and of the inherited turn/AP scheduler.
export const WEAPON_TIMING=Object.freeze({
  hands:{shot:.8,reload:0},knife:{shot:.7,reload:0},
  pistol:{shot:.65,reload:1.8},'pistol-offhand':{shot:.65,reload:1.8},
  assault:{shot:.5,auto:.14,reload:2.4},smg:{shot:.4,auto:.11,reload:2.8},rifle:{shot:1.25,reload:2.8},
  shotgun:{shot:1,reload:3},sniper:{shot:1.8,reload:3.2},hmg:{shot:.7,auto:.18,reload:4},
  grenade:{shot:1.2,reload:0},launcher:{shot:1.6,reload:3.6},rpg:{shot:2.2,reload:4},
  flamethrower:{shot:3,reload:3.5},
});
export const TARGET_PRIORITIES=['nearest','weakest','threat'];
export const automaticWeapon=weapon=>!!WEAPONS[weapon]?.mag&&!WEAPONS[weapon].blast&&!WEAPONS[weapon].thrown;
const SINGLE_MODE=Object.freeze(['single']);
export const FIRE_MODES=Object.freeze(['single','burst','auto']);
export const DEFAULT_FIRE_MODE='auto';
export const fireModesFor=weapon=>WEAPON_TIMING[weapon]?.auto?FIRE_MODES:SINGLE_MODE;
function modeFor(weapon,mode){
  const requested=mode===true?'burst':mode;
  return fireModesFor(weapon).includes(requested)?requested:'single';
}
const savedMode=record=>record.fireMode??(record.burst?'burst':'single');
const validSavedMode=record=>record.fireMode===undefined?typeof record.burst==='boolean':FIRE_MODES.includes(record.fireMode);
export function shotSeconds(weapon,aim='hip',mode='single'){
  const timing=WEAPON_TIMING[weapon],selected=modeFor(weapon,mode);
  const interval=selected==='auto'?timing.auto:timing.shot*(selected==='burst'?1.5:1);
  return interval*(WEAPONS[weapon].incendiary?1:AIM_LEVELS[aim]?.multiplier||1);
}
export const grenadeSeconds=unit=>WEAPON_TIMING.grenade.shot*(['pistol','pistol-offhand','smg'].includes(unit.weapon)?.5:1);
const emptyActor=weapon=>({weapon,cooldown:0,aimRemaining:0,signature:'',targetId:null,reload:null,manual:null,route:[],repath:0,search:8,credit:null});
const finite=(n,max=60)=>Number.isFinite(n)&&n>=0&&n<=max;

export function validateRealtime(state,inside=()=>true){
  const r=state.realtime;if(!r)return;
  const ids=new Set(state.units.map(u=>u.id)),target=id=>id===null||ids.has(id);
  if(r.version!==1||typeof r.runId!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(r.runId)||typeof r.autoFire!=='boolean'||!TARGET_PRIORITIES.includes(r.priority)||!Object.hasOwn(AIM_LEVELS,r.aim)||!Object.hasOwn({torso:1,head:1,legs:1,weapon:1},r.zone)||!validSavedMode(r)||!target(r.targetId)||!target(r.pinnedId)||!finite(r.time,1e10)||!finite(r.fireClock,3)||!Number.isSafeInteger(r.kills)||r.kills<0||!r.actors||typeof r.actors!=='object'||Array.isArray(r.actors)||!r.xp||!r.gains||!r.earned)throw Error('Unsupported real-time save.');
  for(const key of ['firearms','heavyWeapons','explosives','dexterity','sneak'])if(!Number.isSafeInteger(r.earned[key])||r.earned[key]<0||r.earned[key]>1e9||!Number.isSafeInteger(r.xp[key])||r.xp[key]<0||r.xp[key]>1e9||!Number.isSafeInteger(r.gains[key])||r.gains[key]<0||r.gains[key]>100)throw Error('Unsupported real-time progression.');
  for(const [id,a]of Object.entries(r.actors)){
    if(!ids.has(Number(id))||!a||!WEAPONS[a.weapon]||!finite(a.cooldown)||!finite(a.aimRemaining)||!finite(a.repath)||!finite(a.search)||typeof a.signature!=='string'||a.signature.length>256||!target(a.targetId)||!Array.isArray(a.route)||a.route.length>8192||a.route.some(p=>!p||!inside(p)))throw Error('Unsupported real-time actor.');
    if(a.reload&&(!WEAPONS[a.reload.weapon]?.mag||a.reload.weapon!==a.weapon||!finite(a.reload.remaining)||a.reload.remaining>WEAPON_TIMING[a.weapon].reload))throw Error('Unsupported real-time reload.');
    if(a.manual&&(!Object.hasOwn(AIM_LEVELS,a.manual.aim)||!Object.hasOwn({torso:1,head:1,legs:1,weapon:1},a.manual.zone)||!validSavedMode(a.manual)||!a.manual.point&&!ids.has(a.manual.targetId)||a.manual.point&&(!inside(a.manual.point)||!finite(a.manual.point.h,20))))throw Error('Unsupported queued real-time shot.');
    if(a.credit&&(!ids.has(a.credit.id)||!WEAPONS[a.credit.weapon]||typeof a.credit.stealth!=='boolean'))throw Error('Unsupported real-time damage credit.');
  }
}

export function awardRealtimeKill(state,source){
  const r=state.realtime,u=state.units.find(u=>u.team==='squad');
  if(!r||source?.id!==u.id)return;
  r.kills++;
  for(const skill of [weaponSkill(source.weapon)||'dexterity',...(source.stealth?['sneak']:[])]){
    r.xp[skill]++;r.earned[skill]++;
    const needed=3+r.gains[skill]*2;
    if(r.xp[skill]>=needed&&u.stats[skill]<100){r.xp[skill]-=needed;r.gains[skill]++;u.stats[skill]++;refreshStats(u);state.log.unshift(skill+' improved to '+u.stats[skill]+'.');}
  }
}

export function createRealtimeRules({hero,alive,distance,canSee,confirmedImpact,previewAttack,attack,headingTo,flameAffects,previewFlame,fireFlame,completeReload,travel,movePlayer,approachPath,navigationPath,guardActive=()=>true,refresh,log,fireRules}){
  const heldTriggers=new WeakMap(),patrolDetours=new WeakMap();
  const actor=(s,u)=>s.realtime.actors[u.id]??=(emptyActor(u.weapon));
  function enable(s){
    if(!s.realtime){
      const skills=['firearms','heavyWeapons','explosives','dexterity','sneak'];
      const preference=s.solo?.build?.fireMode;
      const fireMode=FIRE_MODES.includes(preference)?preference:DEFAULT_FIRE_MODE;
      s.realtime={version:1,runId:globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),autoFire:false,priority:'nearest',aim:'hip',zone:'torso',fireMode,targetId:null,pinnedId:null,time:0,fireClock:0,kills:0,xp:Object.fromEntries(skills.map(k=>[k,0])),gains:Object.fromEntries(skills.map(k=>[k,0])),earned:Object.fromEntries(skills.map(k=>[k,0])),actors:{}};
    }
    for(const u of s.units){actor(s,u);u.realtimeMovement=true;if(!u.burningTurns)u.running=!u.sneaking;}
    if(['player','enemy'].includes(s.phase))s.phase='explore';
    refresh(s);return s;
  }
  function ready(s,u){const a=actor(s,u);return alive(u)&&!u.burningTurns&&!a.reload&&a.cooldown<=1e-7;}
  function busy(s,u){const a=actor(s,u);return a.reload?'Reloading · '+a.reload.remaining.toFixed(1)+' s':a.cooldown>1e-7?'Weapon cycling · '+a.cooldown.toFixed(1)+' s':'';}
  function resetAim(a){a.signature='';a.aimRemaining=0;a.targetId=null;}
  function configure(s,changes){
    const r=s.realtime;if(!r)return false;
    if(!changes||typeof changes!=='object'||Object.keys(changes).some(k=>!['autoFire','aim','priority','zone','burst','fireMode'].includes(k)))return false;
    const {burst,fireMode,...settings}=changes,u=hero(s);
    const mode=fireMode!==undefined?fireMode:burst===undefined?undefined:burst?'burst':'single';
    if(settings.aim!==undefined&&!Object.hasOwn(AIM_LEVELS,settings.aim)||settings.priority!==undefined&&!TARGET_PRIORITIES.includes(settings.priority)||settings.zone!==undefined&&!Object.hasOwn({head:1,torso:1,legs:1,weapon:1},settings.zone)||burst!==undefined&&typeof burst!=='boolean'||mode!==undefined&&!fireModesFor(u.weapon).includes(mode)||settings.autoFire!==undefined&&typeof settings.autoFire!=='boolean')return false;
    const a=actor(s,u),changed=settings.aim!==undefined&&settings.aim!==r.aim||settings.zone!==undefined&&settings.zone!==r.zone||mode!==undefined&&mode!==savedMode(r);
    Object.assign(r,settings);
    if(mode!==undefined)r.fireMode=mode;
    if(changed&&!WEAPONS[u.weapon].incendiary){resetAim(a);a.manual=null;heldTriggers.delete(s);}
    if(settings.autoFire===false){a.manual=null;r.targetId=null;heldTriggers.delete(s);resetAim(a);}
    s.revision++;return true;
  }
  function pin(s,id){const u=s.units.find(u=>u.id===id);if(id!==null&&(!u||u.team!=='guard'||!alive(u)||!s.detected.has(id)))return false;s.realtime.pinnedId=id;resetAim(actor(s,hero(s)));s.revision++;return true;}
  function changedWeapon(s,u){if(u.team==='squad')heldTriggers.delete(s);const a=actor(s,u);a.weapon=u.weapon;a.reload=null;a.manual=null;a.cooldown=Math.max(a.cooldown,.55);resetAim(a);}
  function reload(s,u){
    const a=actor(s,u),w=WEAPONS[u.weapon];
    if(!alive(u)||u.burningTurns||a.reload||!w.mag||w.thrown||(u.ammo[u.weapon]||0)>=w.mag||!(u.ammoPouch[u.weapon]>0))return false;
    a.manual=null;resetAim(a);a.reload={weapon:u.weapon,remaining:WEAPON_TIMING[u.weapon].reload};log(s,u.name+' reloading ('+a.reload.remaining+' s).');return true;
  }
  function planShot(s,u,target,mode,zone,aim){
    if(!s.realtime||!ready(s,u)||u.team!=='squad'||!target||!Object.hasOwn(AIM_LEVELS,aim))return null;
    const fireMode=modeFor(u.weapon,mode);
    if(!previewAttack(s,u,target,fireMode==='burst',zone,null,aim).ok)return null;
    return {targetId:target.ground?null:target.id,point:target.ground?{...target}:null,fireMode,zone,aim};
  }
  function requestShot(s,u,target,mode=false,zone='torso',aim='hip'){
    const order=planShot(s,u,target,mode,zone,aim);if(!order)return false;
    const a=actor(s,u);a.manual=order;resetAim(a);return true;
  }
  function pressTrigger(s,u,target,zone='torso',aim='hip'){
    if(heldTriggers.has(s)||modeFor(u.weapon,'auto')!=='auto')return false;
    const order=planShot(s,u,target,'auto',zone,aim);if(!order)return false;
    const a=actor(s,u);a.manual=null;resetAim(a);
    heldTriggers.set(s,{order,weapon:u.weapon,fired:false});return true;
  }
  function releaseTrigger(s,tap=false){
    const held=heldTriggers.get(s);if(!held)return false;
    heldTriggers.delete(s);
    const u=hero(s),a=actor(s,u);
    // A quick, deliberate tap may release before the first shot acquires aim.
    // A cancellation or a hold that already fired has no queued follow-up.
    if(tap&&!held.fired&&held.weapon===u.weapon&&alive(u)&&!u.burningTurns)a.manual=held.order;
    else resetAim(a);
    return true;
  }
  function eligible(s,u,v,zone){
    return alive(v)&&v.team!==u.team&&canSee(s,u,v)&&(u.team!=='squad'||s.detected.has(v.id))&&distance(u,v)<=WEAPONS[u.weapon].range&&(WEAPONS[u.weapon].incendiary?flameAffects(s,u,v,headingTo(u,v)):confirmedImpact(s,u,v,zone)?.unit?.id===v.id);
  }
  const threat=(u,v)=>WEAPONS[v.weapon].damage*(WEAPONS[v.weapon].pellets||1)/shotSeconds(v.weapon)/(1+distance(u,v)/Math.max(1,WEAPONS[v.weapon].range));
  function choose(s){
    const r=s.realtime,u=hero(s);if(!automaticWeapon(u.weapon))return null;
    const options=s.units.filter(v=>v.team==='guard'&&eligible(s,u,v,r.zone));
    const pinned=options.find(v=>v.id===r.pinnedId);if(pinned)return pinned;
    const value=v=>r.priority==='nearest'?distance(u,v):r.priority==='weakest'?v.hp:-threat(u,v);
    options.sort((a,b)=>value(a)-value(b)||distance(u,a)-distance(u,b)||a.id-b.id);
    const best=options[0],current=options.find(v=>v.id===r.targetId);
    if(!best||!current)return best||null;
    // Keep a valid target unless a new one improves the selected metric by 20%.
    const better=r.priority==='threat'?threat(u,best)>threat(u,current)*1.2:value(best)<value(current)*.8;
    return better?best:current;
  }
  function fire(s,u,target,aim,mode,zone,dt,effects,autoTime=dt){
    const incendiary=WEAPONS[u.weapon].incendiary;
    // Flame is an area effect: no aim acquisition, body zone or aim modifier.
    if(incendiary){aim='hip';zone='torso';}
    const firingMode=modeFor(u.weapon,mode),burst=firingMode==='burst',fullAuto=firingMode==='auto';
    const seconds=shotSeconds(u.weapon,aim,firingMode),a=actor(s,u);
    const signature=[target.ground?JSON.stringify(target):target.id,u.weapon,aim,fullAuto?'auto':burst,zone].join('/');
    if(a.signature!==signature){a.signature=signature;a.targetId=target.id??null;a.aimRemaining=incendiary?0:seconds;}
    // Acquisition cannot overlap a reload or shorten the previous shot's recovery.
    if(!ready(s,u))return false;
    const aimStep=fullAuto?autoTime:dt,remaining=a.aimRemaining;
    a.aimRemaining=Math.max(0,remaining-aimStep);if(a.aimRemaining>1e-7)return false;
    const flame=u.team==='squad'&&incendiary,heading=flame?headingTo(u,target):null;
    const p=flame?previewFlame(s,u,heading):previewAttack(s,u,target,burst,zone,null,aim);if(!p.ok)return false;
    if(!(flame?fireFlame(s,u,heading):attack(s,u,target,burst,u.team==='guard',zone,false,aim)))return false;
    // Keep the unused portion of the step so automatic cadence does not drift
    // when the interval is shorter than a few simulation steps.
    a.cooldown=seconds-(fullAuto?Math.max(0,aimStep-remaining):0);
    a.manual=null;a.aimRemaining=0;
    if(s.effect){
      if(fullAuto)for(const event of s.effect.sequence||[s.effect])event.fullAuto=true;
      effects.push(s.effect);
    }
    return true;
  }
  function advanceActor(s,u,dt){
    const a=actor(s,u);if(a.weapon!==u.weapon)changedWeapon(s,u);
    a.cooldown=Math.max(0,a.cooldown-dt);a.repath=Math.max(0,a.repath-dt);
    if(a.reload){
      if(!alive(u)||u.burningTurns||a.reload.weapon!==u.weapon){a.reload=null;return;}
      a.reload.remaining=Math.max(0,a.reload.remaining-dt);
      if(a.reload.remaining<=1e-7){a.reload=null;completeReload(s,u);a.cooldown=Math.max(a.cooldown,.1);}
    }
  }
  function walkGuard(s,g,point,speed,dt){
    const d=distance(g,point);if(d<=1e-7)return true;
    const fraction=Math.min(1,speed*dt/d);
    return travel(s,g,(point.x-g.x)*fraction,(point.y-g.y)*fraction,{enemy:true})>0;
  }
  function walkPatrol(s,g,dt){
    if(!g.patrol?.length)return;
    const point=g.patrol[g.patrolIndex??0];
    // The AFT scheduler uses tile arrivals. Normalize sub-micrometre drift
    // after continuous travel so it advances exactly once per waypoint.
    if(point&&distance(g,point)<=1e-7){g.x=point.x;g.y=point.y;}
    const target=patrolDestination({clock:{minutes:s.realtime.time/60}},g);
    if(!target)return;
    g.running=false;
    let detour=patrolDetours.get(g);
    if(detour?.target!==target){patrolDetours.delete(g);detour=null;}
    const route=detour?.route;
    while(route?.length&&distance(g,route[0])<.06)route.shift();
    if(walkGuard(s,g,route?.[0]??target,2.2,dt))return;
    // Authored legs are clear when placed. Use ordinary navigation if a
    // guard is displaced during combat or another animal is in the way.
    if(!detour||s.realtime.time>=detour.retryAt){
      patrolDetours.set(g,{target,route:navigationPath(s,g,target.x,target.y)||[],retryAt:s.realtime.time+1});
    }
  }
  function guard(s,g,dt,effects){
    const a=actor(s,g),u=hero(s);if(!alive(g)||g.burningTurns||!alive(u)||!guardActive(s,g))return;
    if(!g.alert){walkPatrol(s,g,dt);return;}
    if(g.patrol?.length){g.running=true;patrolDetours.delete(g);}
    const sees=canSee(s,g,u);if(sees){g.lastKnown={x:u.x,y:u.y};a.search=8;}
    const w=WEAPONS[g.weapon];
    if(w.mag&&!g.ammo[g.weapon]&&g.ammoPouch[g.weapon]>0&&!a.reload)reload(s,g);
    if(eligible(s,g,u,'torso')&&(g.ammo[g.weapon]>0||!w.mag)){
      a.route=[];fire(s,g,u,'hip',false,'torso',dt,effects);return;
    }
    resetAim(a);
    if(!g.lastKnown)return;
    if(distance(g,g.lastKnown)<1.2&&!sees){
      a.route=[];a.search-=dt;g.heading=(g.heading+dt*45)%360;
      if(a.search<=0){g.alert=false;g.lastKnown=null;a.search=8;log(s,g.name+' finished searching.');}return;
    }
    if(!a.repath){a.route=approachPath(s,g,g.lastKnown)||[];a.repath=.75+(g.id%3)*.1;}
    while(a.route.length&&distance(g,a.route[0])<.08)a.route.shift();
    const next=a.route[0];
    if(next){if(!walkGuard(s,g,next,7.2,dt))a.route=[];}
    else if(!sees){a.search-=dt;if(a.search<=0){g.alert=false;g.lastKnown=null;a.search=8;}}
  }
  function step(s,dt,input){
    const r=s.realtime,u=hero(s),effects=[];r.time+=dt;s.elapsed+=dt;
    const autoTime=Math.max(0,dt-actor(s,u).cooldown);
    for(const v of s.units){v.isMoving=false;advanceActor(s,v,dt);}
    if(!u.burningTurns)movePlayer(s,dt,input);
    refresh(s);if(!alive(u))return;
    const a=actor(s,u),w=WEAPONS[u.weapon];
    if(!u.burningTurns){
      if(w.mag&&!w.thrown&&!u.ammo[u.weapon]&&u.ammoPouch[u.weapon]>0&&!a.reload)reload(s,u);
      if(!r.suspended){
        const held=heldTriggers.get(s),manual=held?.order??a.manual;
        const target=manual?(manual.point||s.units.find(v=>v.id===manual.targetId)):r.autoFire?choose(s):null;
        r.targetId=target?.id??null;
        if(target&&(target.ground||alive(target))){
          if(fire(s,u,target,manual?.aim??r.aim,savedMode(manual??r),manual?.zone??r.zone,dt,effects,autoTime)&&held)held.fired=true;
        }else{resetAim(a);a.manual=null;}
      }else resetAim(a);
    }
    for(const g of s.units)if(g.team==='guard')guard(s,g,dt,effects);
    r.fireClock+=dt;
    if(r.fireClock>=3-1e-7){
      r.fireClock=Math.max(0,r.fireClock-3);s.round++;
      for(const v of s.units)fireRules.panicRun(s,v);
      fireRules.finishRound(s);
    }
    if(effects.length)s.effect={sequence:effects.flatMap(e=>e.sequence||[e])};
    refresh(s);
  }
  function status(s){const u=hero(s),a=actor(s,u),r=s.realtime;return {autoFire:r.autoFire,fireMode:modeFor(u.weapon,savedMode(r)),triggerHeld:heldTriggers.has(s),aim:r.aim,priority:r.priority,targetId:r.targetId,pinnedId:r.pinnedId,remaining:a.reload?.remaining??a.cooldown,reloading:!!a.reload,aimRemaining:a.aimRemaining,ammo:u.ammo[u.weapon]||0,reserve:u.ammoPouch[u.weapon]||0,kills:r.kills,automatic:automaticWeapon(u.weapon),weapon:u.weapon};}
  // The renderer reads the active order without consuming it or starting a shot.
  function aimFor(s,u){
    const r=s.realtime,a=r?.actors[u.id],player=u.team==='squad';
    if(!a?.signature||a.weapon!==u.weapon||a.reload||!alive(u)||u.burningTurns)return null;
    if(player&&r.suspended||!player&&!u.alert)return null;
    const order=player?(heldTriggers.get(s)?.order??a.manual):null;
    if(player&&!order&&!r.autoFire)return null;
    const target=order?.point??s.units.find(v=>v.id===a.targetId);
    if(!target||!target.ground&&(!alive(target)||player&&!s.detected.has(target.id)))return null;
    const aim=order?.aim??(player?r.aim:'hip'),zone=order?.zone??(player?r.zone:'torso');
    const seconds=shotSeconds(u.weapon,aim,player?savedMode(order??r):'single');
    return {target,zone,progress:1-a.aimRemaining/seconds};
  }
  return {enable,actor,ready,busy,configure,pin,changedWeapon,reload,requestShot,pressTrigger,releaseTrigger,choose,step,status,aimFor};
}
