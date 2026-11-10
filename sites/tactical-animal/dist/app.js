import {DEFAULT_FIRE_MODE,fireModesFor,shotSeconds,grenadeSeconds,WEAPON_TIMING} from './realtime-combat.js';
import {createRealtimeCareers} from './realtime-progression.js';
import {pointInWorldRect} from './world-grid.js';
import {FrameClock} from './frame-timing.js';
import {TOUR_ID,TOUR_ACTIVITY,isTour,getTourWorld} from './mount-dora-activity.js';
import {TOUR_SAVE,readTourProgress} from './mount-dora-progress.js';
import {ANIMALS,PRIMARY,SECONDARY,DEFAULT_BUILD,MISSIONS,FIRST_REALTIME_MISSION,DEFAULT_MISSION_ID,getMission,missionForState,missionMap,objectiveSecured,missionDestination,Core,normalizeBuild,buildStats,createSoloGame,hero,interaction,interact,dressing,tick,encodeSave,decodeSave,distance} from './solo-game.js';
import {FieldView,drawMinimap} from './field-view.js';
import {cycleStep,nextCameraFocus,bindPressHold,bindHeldTrigger} from './mobile-controls.js';
import {GrenadeAim,fieldCameraFor,screenToGround} from './grenade-controls.js';
import {FlameAim} from './flame-controls.js';
import {weaponArtwork} from './original-art.js';
import {STANCE_ICONS} from './aft/tactics/battle-control-icons.js';
import {selectInteractionTarget} from './interactions.js';
import {aimOptions,availableAim,flashAPShortage,switchSymbol} from './shooting-controls.js';
import {createTargetMonitor} from './targeting-monitor.js';
import {createOperationStorage} from './operation-storage.js';
import {GuardContactTracker,GuardAlertIndicator} from './guard-alert.js';
const $=id=>document.getElementById(id);
const REALTIME=document.body.dataset.realtime==='true';
const storageNamespace=REALTIME?'farmyard-fighters:':'';
const tourSaveKey=storageNamespace+TOUR_SAVE;
const frameClock=new FrameClock();let backgrounded=false,pageFrozen=false;
const ACTIVITIES=[...(REALTIME?[FIRST_REALTIME_MISSION]:[]),...MISSIONS,TOUR_ACTIVITY];
let selectedMissionId=DEFAULT_MISSION_ID;

let tourMemorySave=null,tourLaunchAbort=null,tourLaunchGeneration=0,tourTransit=false,tourArtError=null,tourPreview=null;
let pointTargeting=false,manualTrigger=null;
function drawTourPreparation(){
  const canvas=$('mission-preview'),ctx=canvas.getContext('2d');ctx.fillStyle='#17241e';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(!tourPreview){tourPreview=new Image();tourPreview.onload=()=>{if(selectedMissionId===TOUR_ID)drawTourPreparation();};tourPreview.src=new URL('./maps/mount-dora/atlas.svg',import.meta.url).href;}
  if(tourPreview.complete&&tourPreview.naturalWidth){const scale=Math.min(canvas.width/1440,canvas.height/1680),w=1440*scale,h=1680*scale;ctx.drawImage(tourPreview,(canvas.width-w)/2,(canvas.height-h)/2,w,h);}
}
async function launchTour({resume=false,progress=null}={}){
  const generation=++tourLaunchGeneration;tourLaunchAbort?.abort();const controller=new AbortController();tourLaunchAbort=controller;
  const selectedBuild=normalizeBuild(build);$('deploy').disabled=$('resume').disabled=true;$('tour-launch-status').hidden=false;$('tour-launch-status').textContent='Loading Mount Dora…';
  try{
    const saved=progress||(resume?readTourProgress(tourMemorySave||window.localStorage.getItem(tourSaveKey)):null);
    if(state)storage.write();view?.dispose();view=null;getTourWorld(state)?.dispose();active=false;paused=false;
    $('battle').hidden=true;$('prep').hidden=false;document.body.classList.remove('in-battle');
    const {loadTownTour}=await import('./mount-dora-entry.js');
    const next=await loadTownTour({build:selectedBuild,progress:saved,signal:controller.signal});
    if(generation!==tourLaunchGeneration||controller.signal.aborted){getTourWorld(next)?.dispose();return;}
    tourArtError=null;start(next,{resume:!!saved});$('tour-launch-status').hidden=true;
  }catch(error){
    if(error.name!=='AbortError'&&generation===tourLaunchGeneration){$('tour-launch-status').textContent='Could not enter the town. '+error.message+' Choose Start or Resume to retry.';toast('Could not enter Mount Dora. '+error.message);}
  }finally{if(generation===tourLaunchGeneration){tourLaunchAbort=null;$('deploy').disabled=$('resume').disabled=false;}}
}
function renderTourStatus(){
  const world=getTourWorld(state);if(!world){$('tour-stream-status').hidden=true;return;}
  const status=world.status(),failed=status.failed.filter(s=>world.pinned.has(s.id)),loading=status.loading.filter(id=>world.pinned.has(id));
  $('tour-stream-status').hidden=!tourArtError&&!failed.length&&!loading.length;
  $('tour-stream-copy').textContent=tourArtError?'Town artwork could not load. Retry to continue.':failed.length?'Nearby streets could not load. Your animal stays on loaded ground.':'Loading nearby streets…';
  $('tour-retry').hidden=!tourArtError&&!failed.length;$('tour-retry').disabled=tourTransit;
}
$('tour-retry').onclick=()=>{if(!isTour(state))return;if(tourArtError){const progress=readTourProgress(encodeSave(state));launchTour({progress});}else getTourWorld(state).retry();};
function tourMenu(){
  storage.write();const u=hero(state);
  showDialog('<p class="eyebrow">MOUNT DORA / WALKING TOUR</p><h2>Explore the town.</h2><p>'+safe(u.name)+' · '+short(u.weapon)+'<br>'+Math.round(state.solo.distance)+' metres walked. Sentries are posted throughout town. Weapons and interactions use normal gameplay rules.</p>',[
    ['Continue walking',()=>{},'primary'],['Visit landmark',tourVisits],...weaponActions('Inventory & equipment'),['Tour notes',tourNotes],['Controls',help],
    ['Choose animal or operation',backToPrep],['Title screen',()=>{storage.write();location.assign('./');}],['Start a new walking tour',()=>launchTour()]
  ]);
}
async function tourVisits(){
  const {TOUR_VISITS}=await import('./mount-dora-entry.js');
  showDialog('<p class="eyebrow">MOUNT DORA</p><h2>Visit a landmark.</h2><p>Move directly to a cleared approach. You can also walk there continuously along streets and supported paths.</p>',[
    ...TOUR_VISITS.map(v=>[v.name,()=>travelToLandmark(v.id)]),['Back to tour menu',tourMenu]
  ]);
}
async function travelToLandmark(id){
  const current=state;if(!isTour(current)||tourTransit)return;
  tourTransit=true;paused=true;resetStick();keys.clear();Core.stop(current);$('loading').hidden=false;$('loading').textContent='Loading the landmark approach…';
  try{const {visitTownLandmark}=await import('./mount-dora-entry.js');await visitTownLandmark(current,id);if(state===current&&active){view.center();view.zoom(Math.max(1,24/view.requestedSpan));storage.write();}}
  catch(error){if(state===current&&active)toast(error.message.includes('obstructed')?error.message:'Could not load that landmark approach. Your animal has stayed here. Choose the landmark again to retry.');}
  finally{if(state===current){tourTransit=false;paused=false;$('loading').textContent='Preparing the town…';view?.reportLoading();frameClock.reset(performance.now());renderBattle();}}
}
function tourNotes(){showDialog('<p class="eyebrow">MOUNT DORA</p><h2>Walking tour.</h2><p>Explore the streets, parks and lakefront. Crouch or crawl through brush to stay harder to spot. On the Sneak button, BRUSH signals concealment and SEEN means a guard has you in sight. Water is impassable except for mapped supported routes. Closed buildings remain closed; the town is a source-based exterior approximation.</p><p>'+Math.round(state.solo.distance)+' metres walked. Your animal, equipment, resources and explored area have their own tour save.</p><p>Map data © OpenStreetMap contributors, ODbL 1.0.</p>',[['Back to tour menu',tourMenu],['Continue walking',()=>{},'primary']]);}

let build={...DEFAULT_BUILD},state=null,view=null,active=false,paused=false,selected=null,aim='hip',zone='torso',burst=false,contextKey='',lastUI=0,lastSave=0,lastPhase='',stick={x:0,y:0},stickPointer=null,resultShown=false,aimViewport=null;
const grenadeAim=new GrenadeAim();
const flameAim=new FlameAim(),aiming=()=>grenadeAim.active||flameAim.active;
const keys=new Set(),overlay=$('overlay');
const picker=$('control-picker');
const guardContacts=new GuardContactTracker(),guardAlert=new GuardAlertIndicator($('look'),$('guard-alert-status'));
let pickerTrigger=null,stanceDirection=1,movementDirection=-1;
let lastHeldWeapon=null,areaPress=false;
let interactionFocus=null,handTarget=null;
const safe=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const stanceValues=['standing','kneeling','prone'],movementValues=REALTIME?['run','sneak']:['run','walk','sneak'];
const stanceNames={standing:'Standing',kneeling:'Kneeling',prone:'Prone / crawl'},movementNames={run:'Run',walk:'Off / walk',sneak:'Sneak'};
const movementPoses={walk:'M13 10h6l1 10 7 10h-6l-6-9-3 9H6l5-12-1-4-3 6H2v-4h3l5-6Z',run:'M15 10h6l3 6h5v4h-8l-3-5-2 6 7 6-3 4-9-8-3 8H2l7-15-3 3H2v-4h4l5-5Z',sneak:'M12 14h7l5 5h6v4h-8l-6-5-2 5h10v4l-6 5h-6l6-6h-8l-4 6H1l7-13Z'};
const poseIcon=value=>STANCE_ICONS[value]?.replace('<svg ','<svg class="original-stance" ')||`<svg class="original-stance" viewBox="0 0 32 34" aria-hidden="true"><circle cx="${value==='run'?20:16}" cy="${value==='sneak'?9:5}" r="3"/><path d="${movementPoses[value]}"/></svg>`;
let loadoutChoices=null;
// Resolve the browser's storage getter only inside the handled read/write paths:
// privacy settings can deny access to the property itself during startup.
const operationStorage=createOperationStorage({getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value)},{normalizeBuild,encodeSave,decodeSave,missions:ACTIVITIES,namespace:storageNamespace,defaultMissionId:REALTIME?FIRST_REALTIME_MISSION.id:DEFAULT_MISSION_ID});
const careers=createRealtimeCareers({getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value)},ANIMALS);
const preparationBuilds=Object.fromEntries(ACTIVITIES.map(mission=>[mission.id,{...DEFAULT_BUILD}]));
try{const preferences=operationStorage.preferences();selectedMissionId=preferences.selectedMissionId;Object.assign(preparationBuilds,preferences.builds);build=normalizeBuild(preparationBuilds[selectedMissionId]);}catch(error){toast('Could not read preparation. You can still choose an operation and play in this tab.');}
// An explicit tour link selects preparation only; it never deploys/resumes or writes operation state.
if(new URLSearchParams(location.search).get('activity')===TOUR_ID){selectedMissionId=TOUR_ID;build=normalizeBuild(preparationBuilds[TOUR_ID]);}
function storageWriteFailure(subject,error){const reason=error?.name==='QuotaExceededError'?'Device storage is full.':error?.name==='SecurityError'?'Browser storage is blocked.':'Browser storage could not be written.';toast(`${reason} Could not save ${subject}. Keep this tab open to retain your changes.`);}
const storage={read(){return selectedMissionId===TOUR_ID?tourMemorySave||window.localStorage.getItem(tourSaveKey):operationStorage.read(selectedMissionId);},write(){if(!state)return;if(state.realtime){try{careers.sync(state);}catch(error){storageWriteFailure('character progression',error);}}try{if(isTour(state)){tourMemorySave=encodeSave(state);window.localStorage.setItem(tourSaveKey,tourMemorySave);}else operationStorage.write(state);}catch(error){storageWriteFailure(isTour(state)?'tour progress':'operation progress',error);}}};
const speciesLabel=s=>s.replaceAll('-',' '),short=k=>Core.WEAPONS[k].short;
function button(parent,label,cls,pressed,onClick){const b=document.createElement('button');b.type='button';b.className=cls;b.innerHTML=label;b.setAttribute('aria-pressed',String(pressed));b.onclick=onClick;parent.append(b);return b;}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4000);}
function renderMissionPreparation(){
  const mission=getMission(selectedMissionId),index=ACTIVITIES.indexOf(mission)+1;
  $('operation-select').innerHTML=ACTIVITIES.map(m=>`<option value="${m.id}">${safe(m.title)}</option>`).join('');$('operation-select').value=mission.id;
  $('operation-number').textContent=mission.exploration?'WALKING TOUR':'OP. '+String(index).padStart(3,'0');$('mission-location').textContent=mission.location;
  $('mission-heading').textContent=mission.title;$('briefing-text').textContent=mission.briefing+(REALTIME&&mission.id===DEFAULT_MISSION_ID?' Fire at Will starts off. Approach through the warehouse or yard; use cover, choose when to open fire, and retreat while reloading. Recover the ledger and return to extraction.':'');
  $('mission-steps').innerHTML=mission.steps.map((step,i)=>`<li><b>${String(i+1).padStart(2,'0')}</b> ${safe(step)}</li>`).join('');
  $('deploy').setAttribute('aria-label','Deploy solo: '+mission.title);
  if(mission.exploration){drawTourPreparation();$('mission-preview').setAttribute('aria-label','Mount Dora town overview. The walking tour starts near Donnelly Park.');return;}
  const map=missionMap(mission.id),seen=new Set(),bounds=mission.briefingBounds||map.worldBounds||{x:1,y:1,w:map.terrain[0].length-2,h:map.terrain.length-2};
  for(let y=bounds.y;y<bounds.y+bounds.h;y++)for(let x=bounds.x;x<bounds.x+bounds.w;x++)seen.add(Core.key(x,y));
  drawMinimap($('mission-preview'),{...map,worldBounds:bounds,map:map.terrain,seen,detected:new Set(),units:[{id:0,team:'squad',hp:1,...mission.spawn}],solo:{missionId:mission.id,layoutVersion:mission.layoutVersion??1,objectives:{}}});
  $('mission-preview').setAttribute('aria-label',mission.title+' layout. Arrival, objective and extraction.');
}
function renderPrep(){renderMissionPreparation();const p=ANIMALS.find(a=>a.id===build.animal),stats=buildStats(build);$('hero-portrait').src=`aft/assets/characters/armed/${p.species}-rifle.png`;$('hero-portrait').alt=`${p.name}, the ${speciesLabel(p.species)} worker`;$('hero-name').textContent=p.name;$('hero-species').textContent=speciesLabel(p.species);$('hero-role').textContent=p.label;document.querySelector('.portrait-number').textContent=String(ANIMALS.indexOf(p)+1).padStart(2,'0');$('stats').innerHTML=[['HEALTH',stats.maxHp],[REALTIME?'FIREARMS':'ACTION POINTS',REALTIME?stats.stats.firearms:stats.maxAp],['PERCEPTION',stats.perception]].map(([label,value])=>`<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
  $('animals').replaceChildren();for(const a of ANIMALS)button($('animals'),`<strong>${speciesLabel(a.species)}</strong><small>${a.name}</small>`,'animal-choice',a.id===build.animal,()=>{build.animal=a.id;renderPrep();});
  if(!loadoutChoices){loadoutChoices=[];
    $('primary').replaceChildren();
    for(const kind of PRIMARY){
      const w=Core.WEAPONS[kind],choice=button($('primary'),`<strong>${w.short}</strong>`,'weapon-choice',false,()=>{build.primary=kind;renderPrep();});
      const details=document.createElement('small'),art=weaponArtwork(kind,35);
      choice.setAttribute('aria-label',w.name);art.classList.add('weapon-paint');choice.append(details,art);
      loadoutChoices.push({choice,slot:'primary',kind,details});
    }
    $('secondary').replaceChildren();for(const k of SECONDARY){const choice=button($('secondary'),`<span>${short(k)}</span><small>${k==='knife'?'MELEE':'8 ROUNDS'}</small>`,'small-choice',false,()=>{build.secondary=k;renderPrep();});const art=weaponArtwork(k,22);art.classList.add('sidearm-paint');choice.prepend(art);loadoutChoices.push({choice,slot:'secondary',kind:k});}
  }
  const fireMode=build.fireMode??DEFAULT_FIRE_MODE;
  $('loadout-fire-mode-picker').hidden=!REALTIME||fireModesFor(build.primary).length===1;
  $('loadout-fire-mode').value=fireMode;
  for(const {choice,slot,kind,details}of loadoutChoices){
    choice.setAttribute('aria-pressed',String(build[slot]===kind));
    if(details){
      const w=Core.WEAPONS[kind],timing=REALTIME?shotSeconds(kind,'hip',fireMode).toFixed(2)+' s':w.cost+' AP';
      details.textContent=`${timing} / ${w.range} m / ${w.mag} rounds`;
    }
  }
  $('utility').replaceChildren();for(const [k,label,detail] of [['dressing','Field dressing','×2'],['grenade','Frag grenades','×3']])button($('utility'),`<span>${label}</span><small>${detail}</small>`,'small-choice',k===build.utility,()=>{build.utility=k;renderPrep();});
  const skill=['hmg','rpg','flamethrower'].includes(build.primary)?'heavyWeapons':'firearms';$('primary-summary').textContent=`${skill==='firearms'?'FIREARMS':'HEAVY WEAPONS'} ${p.stats[skill]}`;$('equipment-note').textContent=`${Core.WEAPONS[build.primary].name}. ${p.name}'s ${skill==='firearms'?'firearms':'heavy weapons'} skill: ${p.stats[skill]}/100. ${REALTIME?'Standing runs by default. Crouch and crawl are slower; Sneak halves your pace.':'Movement spends AP by distance, with no tile snapping.'}`;$('build-summary').textContent=`${p.name} / ${speciesLabel(p.species)} · ${short(build.primary)} + ${short(build.secondary)}`;
  try{
    const text=storage.read(),saved=text?JSON.parse(text):null,mission=getMission(selectedMissionId),previous=saved?.solo?.status==='active'&&(saved.solo.layoutVersion??1)!==(mission.layoutVersion??1);
    $('resume').hidden=mission.exploration?!saved||saved.status==='lost':!saved||saved.solo.status!=='active';$('resume').textContent=mission.exploration?'Resume walking tour ↗':previous?'Resume previous checkpoint ↗':'Resume '+mission.title+' ↗';
    if(previous)$('briefing-text').textContent+=' Your save uses the previous checkpoint. Deploy Solo starts the new approach map; Resume keeps your existing progress.';
  }catch(error){$('resume').hidden=true;toast('Could not read saved operations. You can still deploy and play in this tab.');}
  preparationBuilds[selectedMissionId]=normalizeBuild(build);
  try{operationStorage.savePreparation(selectedMissionId,build);}catch(error){storageWriteFailure('preparation changes',error);}
}
$('loadout-fire-mode').onchange=()=>{
  const mode=$('loadout-fire-mode').value;
  if(REALTIME&&fireModesFor(build.primary).includes(mode)){build.fireMode=mode;renderPrep();}
};
$('operation-select').onchange=()=>{
  tourLaunchAbort?.abort();$('tour-launch-status').hidden=true;
  try{selectedMissionId=getMission($('operation-select').value).id;build=normalizeBuild(preparationBuilds[selectedMissionId]);renderPrep();}catch(error){toast(error.message);}
};
$('interaction-icon').append(weaponArtwork('hands',25));
function showDialog(html,actions=[],{context=false,mode='',focusControl}={}){
  endManualTrigger();
  if(picker.open)closePicker();
  guardAlert.stop();
  cancelAreaAim();
  paused=true;resetStick();keys.clear();$('interaction-hand').hidden=true;
  overlay.dataset.mode=mode;
  $('overlay-content').innerHTML=html;
  $('context').hidden=!context;
  const row=$('overlay-actions');row.replaceChildren();
  for(const [label,fn,cls,disabled=false,id] of actions){
    const b=document.createElement('button');b.textContent=label;b.className=cls||'';b.disabled=disabled;
    if(id)b.id=id;
    b.onclick=()=>{closeDialog();fn();};row.append(b);
  }
  if(!overlay.open)overlay.showModal();
  if(context){contextKey='';renderContext(focusControl);}
}
function endManualTrigger(tap=false){
  if(!manualTrigger)return;
  manualTrigger=null;Core.releaseRealtimeTrigger(state,tap);contextKey='';
  frameClock.reset(performance.now());
}
function closeDialog(){endManualTrigger();overlay.close();paused=false;frameClock.reset(performance.now());}
function clearTargeting(){selected=null;view?.route([]);contextKey='';}
function exitTargeting(){clearTargeting();closeDialog();renderBattle();}
overlay.addEventListener('cancel',()=>{endManualTrigger();if(['shooting','point-shooting'].includes(overlay.dataset.mode))clearTargeting();paused=false;frameClock.reset(performance.now());renderBattle();});
function grenadeViewport(){
  const element=flameAim.active?$('flame-aim'):$('grenade-aim');if(element.hidden)return aimViewport;
  const r=$('viewport').getBoundingClientRect(),panel=element.getBoundingClientRect(),controls=document.querySelector('.thumb-layout').getBoundingClientRect();
  const top=Math.max($('minimap-button').getBoundingClientRect().bottom,document.querySelector('.hero-strip').getBoundingClientRect().bottom),sidePanel=panel.right<=controls.left;
  const flameLandscape=flameAim.active&&sidePanel;
  const right=flameLandscape?document.querySelector('.right-controls').getBoundingClientRect().left-r.left-12:r.width-16;
  const bottom=flameLandscape?$('joystick').getBoundingClientRect().top:sidePanel?controls.top:panel.top;
  aimViewport={left:sidePanel?panel.right-r.left+12:16,right,top:top-r.top+12,bottom:Math.max(top-r.top+72,bottom-r.top-12)};
  return aimViewport;
}
function start(s,{resume=false}={}){try{
  endManualTrigger();
  if(REALTIME)Core.enableRealtime(s);
  if(state&&state!==s)storage.write();cancelAreaAim();resetStick();keys.clear();if(picker.open)closePicker();
  guardAlert.stop();guardContacts.reset([...(Array.isArray(s.solo.spottedGuardIds)?s.solo.spottedGuardIds:[]),...(resume?Core.visibleOpponents(s).map(guard=>guard.id):[])]);s.solo.spottedGuardIds=guardContacts.ids();
  view?.dispose();if(state!==s)getTourWorld(state)?.dispose();tourArtError=null;$('loading').textContent=isTour(s)?'Preparing the town…':'Preparing the field…';$('loading').hidden=false;state=s;selectedMissionId=s.solo.missionId;build=normalizeBuild(s.solo.build);
  if(REALTIME&&resume)build.fireMode=preparationBuilds[selectedMissionId]?.fireMode??DEFAULT_FIRE_MODE;
  Core.stop(s);delete s.effect;
  pointTargeting=false;selected=null;interactionFocus=null;handTarget=null;grenadeAim.cancel();flameAim.cancel();lastHeldWeapon=hero(s).weapon;areaPress=false;aimViewport=null;contextKey='';resultShown=false;stanceDirection=1;movementDirection=-1;aim='hip';zone='torso';burst=false;
  $('prep').hidden=true;$('battle').hidden=false;document.body.classList.add('in-battle');active=true;paused=false;
  view=new FieldView($('viewport'),{onPick:pick,getAimViewport:grenadeViewport,onLoading:busy=>{$('loading').hidden=!busy;frameClock.reset(busy?null:performance.now());},onError:message=>{if(isTour(state))tourArtError=message;$('loading').hidden=false;$('loading').textContent='Animal artwork could not load. '+message;}});
  view.setGame(state);view.unlockSound?.();lastPhase=state.phase;frameClock.reset(performance.now());lastUI=0;lastSave=performance.now();renderBattle();storage.write();
}catch(error){active=false;view?.dispose();view=null;$('prep').hidden=false;$('battle').hidden=true;document.body.classList.remove('in-battle');toast('Cannot start 3D view: '+error.message);}}
function backToPrep(){cancelAreaAim();resetStick();keys.clear();Core.stop(state);storage.write();guardAlert.stop();active=false;view?.dispose();view=null;getTourWorld(state)?.dispose();$('battle').hidden=true;$('prep').hidden=false;document.body.classList.remove('in-battle');renderPrep();}
$('deploy').onclick=()=>selectedMissionId===TOUR_ID?launchTour():start(createSoloGame(build,1947,selectedMissionId));$('resume').onclick=()=>{if(selectedMissionId===TOUR_ID){launchTour({resume:true});return;}try{const s=operationStorage.load(selectedMissionId);if(s.solo.status!=='active'){toast('That operation has ended. Deploy a new animal to begin again.');return;}start(s,{resume:true});}catch(error){toast('Could not resume: '+error.message);}};
function positionInteractionHand(){
  const button=$('interaction-hand');
  if(!handTarget||!active||paused||aiming()||!Core.canControl(state,hero(state))||!$('loading').hidden){button.hidden=true;return;}
  const anchor=view.interactionAnchor(handTarget);button.hidden=!anchor.visible;
  if(anchor.visible){button.style.left=anchor.x+'px';button.style.top=anchor.y+'px';}
}
function renderInteractionHand(){
  if(!state)return;
  handTarget=selectInteractionTarget(Core.nearbyInteractions(state),interactionFocus);interactionFocus=handTarget?.id||null;
  if(handTarget){
    const action=handTarget.actions[0],button=$('interaction-hand');
    $('interaction-label').textContent=action.label;$('interaction-cost').textContent=action.cost+' AP';
    button.setAttribute('aria-label',`${action.label} ${handTarget.name} · ${action.cost} AP. Hold for choices.`);
    button.title=action.reason||handTarget.name+' · tap to '+action.label.toLowerCase()+', hold for choices';button.classList.toggle('unaffordable',!action.ok);
  }
  positionInteractionHand();
}
function focusInteraction(id){
  if(!Core.nearbyInteractions(state).some(object=>object.id===id)){toast('Move within clear reach of the object.');return;}
  resetStick();keys.clear();Core.stop(state);selected=null;view.route([]);interactionFocus=id;renderBattle();
}
function useInteraction(id,action,itemId=null){
  if(!state||paused||aiming())return;
  resetStick();keys.clear();const result=Core.performInteraction(state,id,action,itemId);
  if(!result.ok){toast(result.reason);renderBattle();return;}
  selected=null;view.route([]);contextKey='';renderBattle();storage.write();
  if(result.loot)lootWindow(id);
  else if(result.message)showDialog(`<p class="eyebrow">FIELD NOTES</p><h2>${safe(result.name)}</h2><p>${safe(result.message)}</p>`,[['Return to operation',()=>{},'primary'],['Mission & combat log',mission]]);
}
function interactionChoices(){
  const object=Core.nearbyInteractions(state).find(object=>object.id===interactionFocus);if(!object)return;
  const others=Core.nearbyInteractions(state).filter(other=>other.id!==object.id);
  showDialog(`<p class="eyebrow">WITHIN REACH</p><h2>${safe(object.name)}</h2><p>Choose an action. Opening these choices costs 0 AP.</p>`,[
    ...object.actions.map(action=>[`${action.label} · ${action.cost} AP`,()=>useInteraction(object.id,action.id),'',!action.ok]),
    ...others.map(other=>[`Focus ${other.name}`,()=>focusInteraction(other.id)]),
    ['Return to operation',()=>{}],
  ]);
}
function itemLabel(item){
  if(item.type==='ammo')return `${Core.WEAPONS[item.kind].short} ammunition ×${item.quantity}`;
  if(item.type==='dressing')return `Field dressing ×${item.quantity}`;
  if(item.type==='grenade')return `Frag grenade ×${item.quantity}`;
  return `${Core.WEAPONS[item.kind].name} · ${item.rounds} loaded`;
}
function lootWindow(id){
  const check=Core.previewInteraction(state,id,'loot'),object=check.object;if(!check.ok){toast(check.reason);return;}
  const all=Core.previewInteraction(state,id,'take-all');
  showDialog(`<p class="eyebrow">${object.kind==='body'?'BODY':'CHEST'} / LOOT</p><h2>${safe(object.name)}</h2><p>${object.inventory.length?'Take an item or collect everything.':'No items remain.'}</p><p class="loot-note">Transfers cost ${Core.combatCosts(state)?1:0} AP. Duplicate weapons contribute their loaded ammunition. Opening this window is free.</p>`,[
    ['Take all · '+all.cost+' AP',()=>useInteraction(id,'take-all'),'primary',!all.ok,'take-all'],
    ...object.inventory.map(item=>{const action=Core.previewInteraction(state,id,'take',item.id);return [`Take ${itemLabel(item)} · ${action.cost} AP`,()=>useInteraction(id,'take',item.id),'',!action.ok];}),
    ...(object.kind==='chest'?[[`Close chest · ${Core.previewInteraction(state,id,'close').cost} AP`,()=>useInteraction(id,'close'),'',!Core.previewInteraction(state,id,'close').ok]]:[]),
    ['Return to operation',()=>{}],
  ]);
}
bindPressHold($('interaction-hand'),{
  canUse:()=>!!handTarget&&!paused&&!aiming()&&Core.canControl(state,hero(state)),
  press:()=>{resetStick();keys.clear();Core.stop(state);},
  tap:()=>{if(handTarget)useInteraction(handTarget.id,handTarget.actions[0].id);},hold:interactionChoices,
});
function act(fn,{keepMovement=false}={}){if(!state||paused)return;view?.unlockSound?.();if(!keepMovement){resetStick();keys.clear();}fn();contextKey='';renderBattle();storage.write();}
function triggerReloadStatus(u){
  const w=Core.WEAPONS[u.weapon],empty=!!w.mag&&!w.thrown&&!(u.ammo[u.weapon]>0),cost=Core.combatCosts(state)?3:0,reserve=u.ammoPouch?.[u.weapon]||0,can=Core.canControl(state,u);
  const apShort=can&&reserve>0&&u.ap+1e-7<cost;
  const reason=!can?'Wait for your turn':!reserve?'No spare ammunition':apShort?'Not enough AP':'';
  return {empty,cost,reserve,apShort,ok:empty&&!reason,reason};
}
function reloadFromTrigger({targeting=false}={}){
  if(!state||paused&&!targeting)return false;
  if(!Core.reload(state,hero(state))){contextKey='';renderBattle();return false;}
  cancelAreaAim();resetStick();keys.clear();contextKey='';
  if(targeting)shootingMenu('fire');
  renderBattle();storage.write();return true;
}
function pick(p){if(!state||paused||aiming()||state.phase==='enemy'||state.solo.status!=='active')return;resetStick();if(pointTargeting){pointTargeting=false;if(p.interactionId){const object=Core.interactionObjects(state).find(o=>o.id===p.interactionId);if(object)shootPoint({...object,ground:true,h:1,targetName:object.name});return;}if(p.unitId===undefined){shootPoint({...p,ground:true,h:p.h??1.1});return;}}if(p.interactionId){focusInteraction(p.interactionId);return;}if(p.unitId!==undefined){if(p.unitId===0){operationMenu();return;}const target=state.units.find(u=>u.id===p.unitId);if(target?.hp<=0){focusInteraction('body:'+target.id);return;}if(!state.detected.has(target?.id))return;if(hero(state).weapon==='flamethrower'){armFlame(Core.headingTo(hero(state),target));return;}Core.stop(state);Core.turnTo(state,hero(state),Core.headingTo(hero(state),target));if(state.realtime)Core.pinRealtimeTarget(state,target.id);selected={targetId:target.id};burst=false;aim=availableAim(Core.WEAPONS[hero(state).weapon],hero(state).ap);zone='torso';}
  else if(p.windowId){shootPoint(p);return;}
  else{const path=Core.navigationPath(state,hero(state),p.x,p.y);if(!path){toast('No clear route to that point.');return;}view.route([hero(state),...path]);if(state.phase==='player')selected={point:p,path};else{Core.move(state,hero(state),p.x,p.y);selected=null;view.center();}}
  contextKey='';renderBattle();if(selected)selected.targetId!==undefined?shootingMenu():operationMenu();
}
function selectPointTarget(){
  if(!state||!Core.canControl(state,hero(state)))return;
  cancelAreaAim();resetStick();keys.clear();Core.stop(state);selected=null;pointTargeting=true;
  toast('Tap a point to target with your firearm. Options or Escape cancels.');
}
function shootPoint(point){
  const u=hero(state);Core.stop(state);if(u.weapon==='flamethrower'){armFlame(Core.headingTo(u,point));return;}
  const target={...point,name:point.targetName||(point.windowId?(point.paneId?'Glass pane':'Window frame'):'Aimed point')};
  if(state.realtime){
    selected={point:target};
    showDialog(`<p class="eyebrow">${point.windowId?'WINDOW':'TARGET POINT'}</p><h2>${safe(target.name)}</h2><p>${point.windowId?'Glass stops the first shot. Later shots pass through the opening.':'Uses your equipped weapon, ammunition and aim setting.'}</p>`,[],{context:true,mode:'point-shooting'});
    return;
  }
  const single=Core.previewPointAttack(state,u,target),burstShot=Core.previewPointAttack(state,u,target,true),reload=triggerReloadStatus(u),empty=reload.empty;
  showDialog(`<p class="eyebrow">${point.windowId?'WINDOW':'TARGET POINT'}</p><h2>${safe(target.name)}</h2><p>${point.windowId?'Glass stops the first shot. Later shots pass through the opening. Frames and lower walls remain solid.':'Uses your equipped firearm, ammunition and normal AP rules.'}</p><p>${safe(single.reason||'Ready to fire.')}</p>`,[
    [empty?`Reload · ${reload.cost} AP`:`Fire · ${single.cost} AP`,()=>act(()=>empty?Core.reload(state,u):Core.attack(state,u,target)),'primary',empty?!reload.ok:!single.ok],
    ...(Core.WEAPONS[u.weapon].burstRounds?[[`Burst · ${burstShot.cost} AP`,()=>act(()=>Core.attack(state,u,target,true)),'',!burstShot.ok]]:[]),['Return to operation',()=>{}]
  ]);
}
function shootingMenu(focusControl='zone-'+zone){
  if(state?.realtime){aim=state.realtime.aim;zone=state.realtime.zone;}
  const u=hero(state),w=Core.WEAPONS[u.weapon];
  showDialog(`<p class="eyebrow">TARGET CONTROL / PAUSED</p><h2>${safe(w.short)}</h2><p class="shooting-resources">${u.ap.toFixed(1)} ${state.realtime?'TIMED ACTIONS':'AP'}${w.mag?` · ${u.ammo[u.weapon]??0} ROUNDS`:''}</p>`,[],{context:true,mode:'shooting',focusControl});
}
function renderContext(focusControl){if(!state)return;if(state.realtime){renderRealtimeContext(focusControl);return;}const u=hero(state),near=interaction(state),target=selected?.targetId!==undefined?state.units.find(v=>v.id===selected.targetId):null;
  if(target&&(!Core.alive(target)||!state.detected.has(target.id)))selected=null;
  if(target&&selected)aim=availableAim(Core.WEAPONS[u.weapon],u.ap,burst,aim);
  const p=target&&selected&&u.weapon!=='flamethrower'?Core.previewAttack(state,u,target,burst,zone,null,aim):null;
  const reload=triggerReloadStatus(u);
  const sig=JSON.stringify([selected,near,aim,zone,burst,p,reload,u.ap.toFixed(2),u.weapon,u.ammo[u.weapon],u.burningTurns,state.phase,[...state.detected],Math.round(u.x*10),Math.round(u.y*10),target?.hp,target?.species,target?.stance,target?.weapon]);if(sig===contextKey)return;contextKey=sig;const root=$('context');root.replaceChildren();root.classList.toggle('shooting-panel',!!p);
  if(state.phase==='enemy')return;
  function content(title,detail,label,fn,disabled=false){const copy=document.createElement('div');copy.className='context-copy';const h=document.createElement('strong');h.textContent=title;const small=document.createElement('small');small.textContent=detail;copy.append(h,small);root.append(copy);const b=document.createElement('button');b.textContent=label;b.disabled=disabled;b.onclick=()=>{closeDialog();act(fn);};root.append(b);return copy;}
  if(u.burningTurns){content('On fire',`${u.burningTurns} panic turns before burning to ash. Panic advances automatically.`,'Continue panic',()=>Core.endTurn(state));}
  else if(u.weapon==='flamethrower'&&!selected?.point){const flame=Core.previewFlame(state,u,u.heading);content('Flamethrower cone',`${flame.range} m · ${flame.spread}° spread · ${flame.cost} AP${flame.reason?' · '+flame.reason:''}`,'Aim cone',()=>armFlame(),!flame.ok);}
  else if(p){
    const w=Core.WEAPONS[u.weapon],choices=aimOptions(w,u.ap,burst),chosen=choices.find(option=>option.id===aim);
    const monitor=createTargetMonitor(state,target,p,zone);if(monitor)root.append(monitor);
    let restoreFocus;
    function hardware(parent,{control,label,paint,icon,mark,pressed,disabled=false,apShort=false,red=false,amber=false,bar=false,lit,onClick,rerender=true}){
      const b=document.createElement('button');b.type='button';b.className='industrial-switch shooting-switch'+(bar?' fire-bar':'');b.dataset.control=control;
      const description=label+(apShort?' Not enough AP.':'');
      b.setAttribute('aria-label',description);if(pressed!==undefined)b.setAttribute('aria-pressed',String(pressed));
      if(disabled||apShort)b.setAttribute('aria-disabled','true');
      if(red||amber)b.dataset.face=red?'red':'amber';if(lit!==undefined)b.dataset.lit=String(lit);
      // AP-blocked switches accept input solely to acknowledge the failed attempt.
      b.disabled=disabled&&!apShort;b.title=description;
      b.innerHTML=`<span class="switch-legend" aria-hidden="true"><span class="switch-icon"><svg class="switch-glyph" viewBox="0 0 32 32"><use href="${switchSymbol(icon)}"/></svg></span><span class="switch-label">${paint}</span><span class="switch-cost">${mark}</span></span>`;
      b.onclick=()=>{if(apShort){flashAPShortage(b);return;}if(disabled)return;onClick();if(rerender){contextKey='';renderContext(control);}};parent.append(b);if(control===focusControl)restoreFocus=b;return b;
    }
    function bank(label,cls,parent=root){
      const group=document.createElement('fieldset');group.className='shooting-group '+cls;
      const title=document.createElement('legend');title.textContent=label;
      const row=document.createElement('div');row.className='shooting-bank';group.append(title,row);parent.append(group);return row;
    }
    const columns=document.createElement('div');columns.className='shooting-columns';root.append(columns);
    const zones=bank('BODY LOCATION','zone-bank',columns);
    for(const value of ['torso','head','weapon','legs']){
      const preview=Core.previewAttack(state,u,target,burst,value,null,aim),label=Core.AIM_ZONES[value].label;
      hardware(zones,{control:'zone-'+value,label:`Target ${label.toLowerCase()}. ${preview.chance}% hit chance.`,paint:label.toUpperCase(),icon:'target-'+value,mark:`${preview.chance}% HIT`,pressed:zone===value,amber:true,onClick:()=>zone=value});
    }
    const aiming=bank('AIM LEVEL','aim-bank',columns);
    for(const option of choices)hardware(aiming,{
      control:'aim-'+option.id,label:`${option.label}. ${option.cost} AP. +${option.accuracy} accuracy.`,
      paint:{hip:'QUICK SHOT',aimed:'AIMED',full:'FULL AIM'}[option.id],icon:'aim-'+option.id,mark:`${option.cost} AP`,pressed:aim===option.id,disabled:!option.available,apShort:!option.available,amber:true,onClick:()=>aim=option.id
    });
    const ready=reload.empty?reload.ok:p.ok&&Core.canControl(state,u)&&chosen.available;
    const fire=hardware(root,{control:'fire',label:reload.empty?`Reload ${w.short}. ${reload.cost} AP. ${reload.reserve} spare rounds.`:`${burst?'Fire burst':'Fire'}. ${p.chance}% hit chance. ${p.cost} AP.`,paint:reload.empty?'RELOAD':'FIRE',icon:reload.empty?'reload':'fire',mark:`${reload.empty?reload.cost:p.cost} AP`,bar:true,red:true,lit:false,disabled:!ready,apShort:reload.empty?reload.apShort:!chosen.available,rerender:false,onClick:()=>{
      if(reload.empty){reloadFromTrigger({targeting:true});return;}
      closeDialog();act(()=>Core.attack(state,u,target,burst,false,zone,false,aim));
      if(triggerReloadStatus(u).empty&&selected?.targetId===target.id&&Core.alive(target)&&state.detected.has(target.id)&&Core.canControl(state,u))shootingMenu('fire');
    }});
    fire.dataset.ready=String(ready);fire.dataset.action=reload.empty?'reload':'fire';
    const fireRow=bank('FIRE MODE / EXIT','trigger-bank');fireRow.dataset.burst=String(!!w.burstRounds);
    for(const firingBurst of w.burstRounds?[false,true]:[false]){
      const mode=firingBurst?'Burst':'Single',modeAim=availableAim(w,u.ap,firingBurst,aim),choice=aimOptions(w,u.ap,firingBurst).find(option=>option.id===modeAim);
      hardware(fireRow,{control:firingBurst?'burst':'single',label:`${mode} fire. ${firingBurst?w.burstRounds:1} round${firingBurst?'s':''}.`,paint:mode.toUpperCase(),icon:firingBurst?'fire-burst':'fire-single',mark:`${choice.cost} AP`,pressed:burst===firingBurst,apShort:!choice.available,onClick:()=>burst=firingBurst});
    }
    hardware(fireRow,{control:'exit',label:'Exit targeting without firing.',paint:'EXIT',icon:'exit',mark:'',rerender:false,onClick:exitTargeting});
    const warning=reload.empty?reload.reason:p.reason||(!chosen.available?'Not enough AP':'');
    if(warning||w.blast){const note=document.createElement('p');note.className='shooting-warning';note.setAttribute('role','status');note.textContent=[warning,w.blast?'BLAST CAN HURT YOU':''].filter(Boolean).join(' · ');root.append(note);}
    restoreFocus?.focus?.({preventScroll:true});
  }else if(selected?.point){const path=Core.navigationPath(state,u,selected.point.x,selected.point.y),cost=path?.reduce((n,p)=>n+p.cost,0)||0,d=cost/Core.movementRate(u);content('Move to this point',`${d.toFixed(1)} m · ${cost.toFixed(1)} AP${cost>u.ap?' · stops when AP runs out':''}`,'Move',()=>{Core.move(state,u,selected.point.x,selected.point.y);selected=null;view.center();},!path||u.ap<.01);
  }else if(near){const mission=missionForState(state);content(near.label,near.kind==='extract'?mission.extraction.name:`${near.cost} AP · ${mission.objective.after}`,near.kind==='extract'?'Extract ↗':'Collect',()=>interact(state),!near.ok);}
  else if(state.detected.size){const guard=[...state.detected].map(id=>state.units.find(v=>v.id===id)).sort((a,b)=>distance(u,a)-distance(u,b))[0];content('Visible contact',`${guard.name} · ${distance(u,guard).toFixed(1)} m`,'Target',()=>pick({unitId:guard.id}));}
  if(selected&&!p){const cancel=document.createElement('button');cancel.className='cancel-context';cancel.textContent='×';cancel.setAttribute('aria-label','Cancel selection');cancel.onclick=()=>{clearTargeting();renderContext();};root.append(cancel);}
}
function renderBattle(){if(!state)return;const u=hero(state),combat=state.phase==='player'||state.phase==='enemy',can=Core.canControl(state,u);
  $('zoom-out').disabled=view?.canZoom?.(1.2)===false;$('zoom-in').disabled=view?.canZoom?.(.83)===false;
  $('battle-name').textContent=u.name;$('battle-species').textContent=speciesLabel(u.species);
  $('hp-label').textContent=`${Math.ceil(u.hp)} / ${u.maxHp} HP`;$('hp-bar').style.width=`${u.hp/u.maxHp*100}%`;
  $('turn-label').innerHTML='END<br>TURN';$('end-turn').setAttribute('aria-label','End turn');
  $('ap').textContent=combat?Math.max(0,u.ap).toFixed(1):'∞';$('ap-label').textContent=combat?'AP':'FREE MOVE';
  $('end-turn').disabled=state.phase!=='player'||aiming();
  $('end-turn').dataset.lit=String(combat);
  $('end-turn').setAttribute('aria-description',combat?'Combat light on':'Combat light off');
  $('end-turn').setAttribute('aria-label',state.phase==='enemy'?'Guards are acting':'End turn');
  $('turn-label').innerHTML=state.phase==='enemy'?'GUARD<br>TURN':'END<br>TURN';
  $('joystick').classList.toggle('unavailable',!can);
  renderGrenadeControls();renderFlameControls();
  if(REALTIME)renderSneak(u,can&&!aiming());
  else{
    const mode=Core.movementModeOf(u);
    renderCycle('movement',mode,mode==='walk'?'OFF':mode.toUpperCase(),movementNames[mode],can&&!aiming());
  }
  renderCycle('stance',u.stance,{standing:'STAND',kneeling:'KNEEL',prone:'CRAWL'}[u.stance],stanceNames[u.stance],can&&!aiming());
  const contacts=Core.visibleOpponents(state),focused=contacts.find(g=>g.id===view?.focusedId);
  const nextFocus=nextCameraFocus(contacts,view?.focusedId);
  $('visible-count').textContent=contacts.length;$('look').disabled=state.solo.status!=='active'||aiming();
  $('look').dataset.lit=String(contacts.length>0);
  $('look').classList.toggle('inspecting',!!focused);
  const viewing=focused?'Viewing '+focused.name:view?.follow?'Viewing your animal':'Camera panned';
  const nextAction=nextFocus?'View '+nextFocus.name:'Recenter on your animal';
  $('look').setAttribute('aria-label',`${contacts.length} visible opponent${contacts.length===1?'':'s'}. ${viewing}. Next: ${nextAction}.`);
  $('look').title=`${nextAction} · opponents, then your animal`;
  renderTourStatus();if(isTour(state)){$('viewport').setAttribute('aria-label','Mount Dora walking tour. Tap ground to walk, drag to look around, or use the movement controls.');}
  drawMinimap($('minimap'),state);renderContext();renderInteractionHand();if(state.realtime)renderRealtimeBattle();
  if(state.solo.status!=='active'&&!resultShown){resultShown=true;storage.write();const win=state.solo.status==='extracted',mission=missionForState(state);showDialog(`<p class="eyebrow">${safe(mission.title)} / OPERATION ${win?'COMPLETE':'LOST'}</p><h2>${win?mission.result.title:'One worker down.'}</h2><p>${win?`${u.name} ${mission.result.summary} ${Math.round(state.solo.distance)} metres travelled; ${state.realtime?Math.round(state.elapsed)+' seconds in the field':state.round+' combat rounds'}.`:'The factory kept its secrets this time. Try another animal, another loadout, or a quieter route.'}</p>${win?`<p>${mission.result.epilogue}</p>`:''}`,[['Choose your next operation',backToPrep,'primary'],['Replay this loadout',()=>isTour(state)?launchTour():start(createSoloGame(state.solo.build,1947,state.solo.missionId))]]);}
}
if(REALTIME)bindPressHold($('end-turn'),{canUse:()=>!!state&&!paused&&!aiming()&&Core.canControl(state,hero(state)),tap:toggleRealtimeFire,hold:fireSettings});
else $('end-turn').onclick=()=>act(()=>{selected=null;cancelAreaAim();Core.endTurn(state);});
function renderGrenadeControls(){
  const u=hero(state),armed=grenadeAim.active,point=grenadeAim.point,p=armed&&point?Core.previewGrenade(state,u,point):null;
  const count=u.ammo.grenade||0,cost=Core.grenadeCost(u);
  $('grenade-aim').hidden=!armed;$('battle').classList.toggle('aiming-grenade',armed);
  $('stick-caption').textContent=armed?'AIM':'MOVE';
  $('joystick').setAttribute('aria-label',armed?'Grenade aim thumbstick. Direction aims; full displacement reaches maximum range. Release to hold your aim. Keyboard: W A S D or arrows, Enter to throw, Escape to cancel.':'Movement thumbstick. Drag from the center to move. Keyboard: W A S D or arrow keys.');
  $('viewport').setAttribute('aria-label',armed?'Grenade preview. Aim with the joystick, release to hold, then press Throw. Cancel leaves resources unchanged.':'Tactical map. Tap ground to move. Drag to look around. Tap a visible guard to target.');
  if(!armed){renderAreaButton();return;}
  const detail=point?`${p.distance.toFixed(1)} / ${Core.WEAPONS.grenade.range} m · ${p.blast} m blast · ${state.realtime?grenadeSeconds(u).toFixed(1)+' s':cost+' AP'} · ${count} left`:`Move the joystick to aim · ${state.realtime?grenadeSeconds(u).toFixed(1)+' s':cost+' AP'} · ${count} left`;
  if($('grenade-detail').textContent!==detail)$('grenade-detail').textContent=detail;
  const warning=[p?.reason,p?.selfDanger?'Your animal is exposed to the blast.':''].filter(Boolean).join('. ');
  $('grenade-warning').hidden=!warning;$('grenade-warning').textContent=warning;
  renderAreaButton();
}
function updateGrenadePreview(){
  if(!grenadeAim.active)return;
  if(grenadeAim.point)view.previewGrenade(grenadeAim.point,Core.previewGrenade(state,hero(state),grenadeAim.point));
  renderGrenadeControls();
}
function cancelGrenade(){
  if(!grenadeAim.active)return;
  grenadeAim.cancel();resetStick();keys.clear();view?.endGrenadeAim();clearAreaReadiness();$('toast').hidden=true;
}
function armGrenade(){
  pointTargeting=false;

  if(!state||paused||grenadeAim.active||!Core.canControl(state,hero(state)))return;
  const u=hero(state);if(!(u.ammo.grenade>0)||u.ap+1e-7<Core.grenadeCost(u))return;
  cancelFlame();
  state.solo.areaWeapon='grenade';lastHeldWeapon=u.weapon;
  resetStick();keys.clear();Core.stop(state);selected=null;grenadeAim.start();view.beginGrenadeAim();$('toast').hidden=true;renderBattle();
}
function commitGrenade(){
  if(!state||paused||!grenadeAim.active||!grenadeAim.point||stickPointer!==null||keys.size)return;
  const u=hero(state),landing={...grenadeAim.point},p=Core.previewGrenade(state,u,landing);
  if(!p.ok){updateGrenadePreview();return;}
  if(!Core.throwGrenade(state,u,landing))return;
  grenadeAim.cancel();resetStick();keys.clear();view.endGrenadeAim({linger:800});contextKey='';renderBattle();storage.write();
}
$('cancel-grenade').onclick=()=>{cancelGrenade();renderBattle();};
function renderFlameControls(){
  const u=hero(state),armed=flameAim.active,count=u.ammo.flamethrower||0,p=armed?Core.previewFlame(state,u,flameAim.heading):null;
  $('flame-aim').hidden=!armed;$('battle').classList.toggle('aiming-flame',armed);
  if(!armed){renderAreaButton();return;}
  $('stick-caption').textContent='AIM';
  $('joystick').setAttribute('aria-label','Flamethrower aim thumbstick. Direction rotates the full 10 metre cone. Release to hold aim. Enter fires; Escape cancels.');
  $('viewport').setAttribute('aria-label','Flamethrower cone preview. Aim with the joystick, release to hold, then press Fire. Walls and fog clip the highlighted area.');
  const opponents=p.contacts.filter(contact=>contact.team!==u.team).length;
  $('flame-detail').textContent=`${p.range} m · ${p.spread}° cone · ${state.realtime?shotSeconds('flamethrower').toFixed(1)+' s':p.cost+' AP'} · ${count} fuel · ${opponents} visible opponent${opponents===1?'':'s'} in cone`;
  const warning=[p.reason,p.contacts.some(contact=>contact.team===u.team)?'A friendly animal is in the cone.':''].filter(Boolean).join('. ');
  $('flame-warning').hidden=!warning;$('flame-warning').textContent=warning;view.previewFlame(flameAim.heading,p);
  renderAreaButton();
}
function cancelFlame(){
  if(!flameAim.active)return;
  flameAim.cancel();resetStick();keys.clear();view?.endFlameAim();clearAreaReadiness();$('toast').hidden=true;
}
function cancelAreaAim(){pointTargeting=false;cancelGrenade();cancelFlame();clearAreaReadiness();}
function armFlame(heading){
  pointTargeting=false;
  pointTargeting=false;

  if(!state||paused||flameAim.active)return;
  const u=hero(state),direction=Number.isFinite(heading)?heading:u.heading;
  if(u.weapon==='flamethrower'&&triggerReloadStatus(u).empty&&Core.canControl(state,u)){cancelGrenade();state.solo.areaWeapon='flamethrower';lastHeldWeapon=u.weapon;renderBattle();return;}
  if(!Core.previewFlame(state,u,direction).ok)return;
  cancelGrenade();resetStick();keys.clear();Core.stop(state);selected=null;state.solo.areaWeapon='flamethrower';lastHeldWeapon=u.weapon;flameAim.start(direction);view.beginFlameAim();$('toast').hidden=true;renderBattle();
}
function commitFlame(){
  if(!state||paused||!flameAim.active||stickPointer!==null||keys.size)return;
  if(!Core.fireFlame(state,hero(state),flameAim.heading)){renderFlameControls();return;}
  flameAim.cancel();resetStick();keys.clear();view.endFlameAim({linger:1500});contextKey='';renderBattle();storage.write();
}
$('cancel-flame').onclick=()=>{cancelFlame();renderBattle();};
const areaNames={grenade:'Grenade',flamethrower:'Flamethrower'};
const areaIcons={grenade:'<svg class="switch-glyph" viewBox="0 0 32 32"><use href="assets/ui/industrial-switches/symbols.svg#grenade"/></svg>',flamethrower:'<svg class="switch-glyph" viewBox="0 0 32 32"><path d="M16 28 4 6Q16 0 28 6Z"/></svg>'};
function areaWeapon(){
  const u=hero(state);
  if(lastHeldWeapon!==u.weapon){state.solo.areaWeapon=u.weapon==='flamethrower'?'flamethrower':'grenade';lastHeldWeapon=u.weapon;}
  if(!Object.hasOwn(areaNames,state.solo.areaWeapon)||state.solo.areaWeapon==='flamethrower'&&u.weapon!=='flamethrower')state.solo.areaWeapon=u.weapon==='flamethrower'?'flamethrower':'grenade';
  return state.solo.areaWeapon;
}
function clearAreaReadiness(){const b=$('grenade');b.dataset.ready='false';b.dataset.lit='false';}
function renderAreaButton(){
  if(!state)return;
  const u=hero(state),kind=areaWeapon(),flame=kind==='flamethrower',armed=flame?flameAim.active:grenadeAim.active;
  const count=u.ammo[kind]||0,cost=flame?6:Core.grenadeCost(u),can=Core.canControl(state,u),adjusting=stickPointer!==null||keys.size>0||areaPress;
  const p=flame?Core.previewFlame(state,u,armed?flameAim.heading:u.heading):armed&&grenadeAim.point?Core.previewGrenade(state,u,grenadeAim.point):null;
  const reload=flame?triggerReloadStatus(u):null,reloading=!!reload?.empty;
  const ready=!!((reloading?reload.ok:armed&&p?.ok)&&!adjusting&&!paused&&!document.hidden&&can&&$('loading').hidden),b=$('grenade');
  // An unavailable shot must not prevent holding this shared control to switch.
  b.disabled=!can||!$('loading').hidden;b.dataset.ready=String(ready);b.dataset.lit=String(ready);b.setAttribute('aria-pressed',String(armed));
  const icon=reloading?'reload':kind;b.dataset.kind=kind;b.dataset.action=reloading?'reload':armed?'fire':'aim';
  if(b.dataset.icon!==icon){b.dataset.icon=icon;$('area-icon').innerHTML=reloading?`<svg class="switch-glyph" viewBox="0 0 32 32"><use href="${switchSymbol('reload')}"/></svg>`:areaIcons[kind];}
  const action=reloading?'Reload':armed?(flame?'Fire':'Throw'):'Aim';
  $('grenade-count').textContent=count;$('grenade-cost').textContent=`${reloading?reload.cost:cost} AP`;$('grenade-label').textContent=reloading?'RELOAD':armed?action.toUpperCase():flame?'CONE':'GRENADE';
  b.setAttribute('aria-label',reloading?`Reload flamethrower. ${reload.cost} AP. ${reload.reserve} spare fuel charges. Hold to switch weapon.`:`${action} ${flame?'flamethrower cone':'grenade'}. ${count} ${flame?'fuel':'grenades'} remaining. ${cost} AP. Hold to switch weapon.`);
  const reason=reloading?reload.reason:p?.reason||(!count?`No ${flame?'fuel':'grenades'} remaining`:u.ap+1e-7<cost?'Not enough AP':armed&&!p?'Choose a landing point with the joystick':armed&&adjusting?'Release the aim controls, then confirm':'');
  b.title=(ready?`Ready to ${action.toLowerCase()}`:reason||`Aim ${areaNames[kind].toLowerCase()}`)+' · hold to switch grenade / flamethrower';
  b.setAttribute('aria-description',(ready?`Ready to ${reloading?'reload':'fire'}. Yellow light pulses. `:reason?reason+'. ':'')+'Hold for weapon choices, or press Arrow Down.');
}
function areaChoice(kind){
  const u=hero(state),carried=u.weapon===kind||u.pack.some(item=>item.kind===kind)||(u.ammo[kind]||0)>0,cost=kind==='flamethrower'&&u.weapon!==kind?weaponSwapCost(u,kind):0;
  const reason=!carried?'Not carried':!Core.canControl(state,u)?'Wait for your turn':u.ap+1e-7<cost?'Not enough AP to equip':'';
  return {kind,cost,reason,ok:!reason};
}
function selectAreaWeapon(kind){
  const choice=areaChoice(kind);if(!choice.ok){toast(choice.reason);return false;}
  cancelAreaAim();resetStick();keys.clear();Core.stop(state);const u=hero(state);
  if(kind==='flamethrower'&&u.weapon!==kind&&!Core.equip(state,u,kind))return false;
  state.solo.areaWeapon=kind;lastHeldWeapon=u.weapon;selected=null;contextKey='';renderBattle();storage.write();return true;
}
function openAreaPicker(){
  if(!state||paused||!Core.canControl(state,hero(state)))return;
  guardAlert.stop();cancelAreaAim();resetStick();keys.clear();Core.stop(state);paused=true;
  pickerTrigger=$('grenade');pickerTrigger.setAttribute('aria-expanded','true');
  $('control-picker-title').textContent='AREA WEAPON';$('control-picker-cost').textContent='CHOOSE YOUR WEAPON';$('control-picker-hint').textContent='Select a weapon, then tap its button to aim.';
  const row=$('control-choices');row.replaceChildren();row.classList.add('area-choices');const current=areaWeapon(),u=hero(state);
  for(const kind of ['grenade','flamethrower']){
    const choice=areaChoice(kind),detail=choice.reason||`${u.ammo[kind]||0} ${kind==='grenade'?'grenades':'fuel'} · ${choice.cost?choice.cost+' AP to equip':'0 AP to select'}`;
    const b=button(row,`${areaIcons[kind]}<span>${areaNames[kind]}</span><small>${detail}</small>`,'',kind===current,()=>{closePicker();selectAreaWeapon(kind);});b.disabled=!choice.ok;b.setAttribute('aria-label',`${areaNames[kind]} · ${detail}`);if(kind===current)b.autofocus=true;
  }
  const bottom=innerHeight-pickerTrigger.getBoundingClientRect().top+10;picker.style.bottom=`${Math.max(12,Math.min(bottom,innerHeight-220))}px`;picker.showModal();
}
bindPressHold($('grenade'),{
  canUse:()=>!!state&&!paused&&$('loading').hidden&&Core.canControl(state,hero(state)),
  press:()=>{areaPress=true;clearAreaReadiness();},
  tap:()=>{if(areaWeapon()==='flamethrower'){
    const reload=triggerReloadStatus(hero(state));
    if(reload.empty){if(reload.apShort)flashAPShortage($('grenade'));else if(!reload.ok)toast(reload.reason);else reloadFromTrigger();}
    else if(flameAim.active)commitFlame();else armFlame();
  }else if(grenadeAim.active)commitGrenade();else armGrenade();},
  hold:openAreaPicker,
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('grenade').addEventListener(type,()=>{areaPress=false;renderAreaButton();});
function renderCycle(kind,value,label,name,can){
  const b=$(kind+'-cycle');b.disabled=!can;b.setAttribute('aria-label',`${kind==='stance'?'Stance':'Movement'}: ${name.toLowerCase()}. Tap to cycle; hold for choices.`);
  b.dataset.lit=String(kind==='stance'?value!=='standing':value!=='walk');
  if(b.dataset.value===value)return;b.dataset.value=value;
  $(kind+'-icon').innerHTML=poseIcon(value);$(kind+'-label').textContent=label;
}
const sneakLabels={
  clear:['—','Out of sight.'],
  brush:['BRUSH','Brush concealment.'],
  spotted:['SEEN','A guard has you in sight.']
};
function renderSneak(u,can){
  const button=$('movement-cycle'),indicator=$('sneak-indicator');
  const status=Core.sneakStatus(state),pressed=String(u.sneaking),initial=button.dataset.stealth===undefined;
  button.disabled=!can;
  if(initial||button.dataset.lit!==pressed){
    button.dataset.lit=pressed;
    button.setAttribute('aria-pressed',pressed);
  }
  if(initial){
    button.setAttribute('aria-label','Sneak');
    button.setAttribute('aria-describedby','sneak-status');
    $('movement-icon').innerHTML=poseIcon('sneak');
    $('movement-label').textContent='SNEAK';
    indicator.hidden=false;
  }
  if(button.dataset.stealth===status)return;
  button.dataset.stealth=status;
  const [label,description]=sneakLabels[status];
  indicator.textContent=label;
  $('sneak-status').textContent=description;
}
function changeControl(kind,value){
  act(()=>{
    const u=hero(state),isStance=kind==='stance',values=isStance?stanceValues:movementValues,current=isStance?u.stance:Core.movementModeOf(u);
    const direction=Math.sign(values.indexOf(value)-values.indexOf(current));
    const changed=isStance?Core.setStance(state,u,value):Core.setMovementMode(state,u,value);
    if(changed&&direction){if(isStance)stanceDirection=direction;else movementDirection=direction;}
  },{keepMovement:true});
}
function cycleControl(kind){
  const u=hero(state),isStance=kind==='stance',step=cycleStep(isStance?stanceValues:movementValues,isStance?u.stance:Core.movementModeOf(u),isStance?stanceDirection:movementDirection);
  changeControl(kind,step.value);
}
function pickerClosed(){paused=false;frameClock.reset(performance.now());pickerTrigger?.setAttribute('aria-expanded','false');pickerTrigger=null;renderBattle();}
function closePicker(){picker.close();pickerClosed();}
picker.addEventListener('cancel',pickerClosed);
$('close-picker').onclick=closePicker;
picker.addEventListener('click',event=>{if(event.target!==picker)return;const r=picker.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closePicker();});
function openPicker(kind){
  if(!state||paused||aiming()||!Core.canControl(state,hero(state)))return;
  guardAlert.stop();
  resetStick();keys.clear();Core.stop(state);paused=true;
  const u=hero(state),isStance=kind==='stance',values=isStance?stanceValues:movementValues,names=isStance?stanceNames:movementNames,current=isStance?u.stance:Core.movementModeOf(u);
  pickerTrigger=$(kind+'-cycle');pickerTrigger.setAttribute('aria-expanded','true');
  $('control-picker-title').textContent=isStance?'STANCE':'MOVEMENT';
  $('control-picker-cost').textContent=state.realtime?'FREE SWITCH':'FREE SWITCH · 0 AP';
  $('control-picker-hint').textContent=isStance?'Standing ↔ Kneeling ↔ Prone':state.realtime?'Normal pace ↔ Sneak (half speed)':'Run ↔ Off / walk ↔ Sneak';
  const row=$('control-choices');row.replaceChildren();row.classList.remove('area-choices');
  for(const value of values){const b=button(row,`${poseIcon(value)}<span>${names[value]}</span>`,'',value===current,()=>{closePicker();changeControl(kind,value);});b.setAttribute('aria-label',names[value]);if(value===current)b.autofocus=true;}
  const bottom=innerHeight-pickerTrigger.getBoundingClientRect().top+10;
  picker.style.bottom=`${Math.max(12,Math.min(bottom,innerHeight-175))}px`;
  picker.showModal();
}
for(const kind of ['stance','movement'])bindPressHold($(kind+'-cycle'),{
  canUse:()=>!!state&&!paused&&!aiming()&&Core.canControl(state,hero(state)),
  tap:()=>cycleControl(kind),hold:()=>openPicker(kind)
});
$('look').onclick=()=>{
  if(!state||paused||aiming())return;const nextFocus=nextCameraFocus(Core.visibleOpponents(state),view.focusedId);
  resetStick();keys.clear();Core.stop(state);if(nextFocus)view.focusOpponent(nextFocus.id);else view.center();renderBattle();
};
$('zoom-in').onclick=()=>view?.zoom(.83);$('zoom-out').onclick=()=>view?.zoom(1.2);
function weaponSwapCost(u,kind){return Core.combatCosts(state)?u.slots.includes(kind)?2:3:0;}
function fireModeActions(u,selected,reopen){
  const modes=fireModesFor(u.weapon);
  return modes.length>1?modes.map(mode=>[fireModeNames[mode]+(mode===selected?' · selected':''),()=>{
    Core.configureRealtime(state,{fireMode:mode});reopen();
  }]):[];
}
function realtimeWeaponCommands(u,status,can){
  const w=Core.WEAPONS[u.weapon];
  return [
    ['Aim firearm at a point',selectPointTarget,'',!can||!w.mag||w.incendiary||w.thrown],
    [`Reload ${short(u.weapon)} · ${WEAPON_TIMING[u.weapon].reload} s`,()=>act(()=>Core.reload(state,u)),'',
      !can||status.reloading||!w.mag||w.thrown||status.ammo>=w.mag||!status.reserve]
  ];
}
function equipment(){
  const u=hero(state),can=Core.canControl(state,u),status=Core.realtimeStatus(state);
  if(status)storage.write();
  const caption=status?'Weapons.':'Equipment.';
  const detail=status?fireModesFor(u.weapon).length>1?'Fire mode applies to manual fire and Fire at Will.':'Reloads use carried ammunition.':'Stamina off · '+u.ap.toFixed(1)+' AP remaining.';
  showDialog(`<p class="eyebrow">${u.name.toUpperCase()} / ${status?'ARMAMENT':'INVENTORY'}</p><h2>${caption}</h2><p>${detail}</p>`,[
    ...(status?[['Return to operation',()=>{},'primary'],...fireModeActions(u,status.fireMode,equipment),...realtimeWeaponCommands(u,status,can)]:[]),
    ...u.pack.map(i=>{
      if(i.kind==='grenade')return [`Select grenades · ${u.ammo.grenade||0} remaining${areaWeapon()==='grenade'?' · active':''}`,()=>selectAreaWeapon('grenade'),'',!can];
      const cost=weaponSwapCost(u,i.kind);
      const label=`${Core.WEAPONS[i.kind].name}${Core.WEAPONS[i.kind].mag?' · '+(u.ammo[i.kind]??0)+' loaded / '+(u.ammoPouch[i.kind]||0)+' reserve':''}${u.weapon===i.kind?' · equipped':cost?' · '+cost+' AP':''}`;
      return [label,()=>act(()=>Core.equip(state,u,i.kind)),'',!can||u.weapon===i.kind||u.ap<cost];
    }),
    [`Use field dressing ×${state.solo.dressings}${Core.combatCosts(state)?' · 3 AP':''}`,()=>act(()=>dressing(state)),'',!can||!state.solo.dressings||u.hp===u.maxHp||Core.combatCosts(state)&&u.ap<3],
    ['Back to menu',operationMenu],...(!status?[['Return to operation',()=>{},'primary']]:[])
  ]);
}
$('weapons').onclick=()=>{if(state?.realtime&&!paused)equipment();};
function weaponActions(inventoryLabel='Inventory & weapons'){
  const u=hero(state),w=Core.WEAPONS[u.weapon],can=Core.canControl(state,u),costs=Core.combatCosts(state),other=u.weapon===state.solo.build.primary?state.solo.build.secondary:state.solo.build.primary,swapCost=weaponSwapCost(u,other),actionCost=costs?' · 3 AP':'';
  if(state.realtime){const status=Core.realtimeStatus(state);return [[inventoryLabel,equipment],
    ...realtimeWeaponCommands(u,status,can),
    [`Area weapon: ${areaNames[areaWeapon()]} · Change`,openAreaPicker,'',!can],
    [`Switch to ${short(other)} · 0.55 s`,()=>act(()=>Core.equip(state,u,other)),'',!can],
    [`Use field dressing ×${state.solo.dressings}`,()=>act(()=>dressing(state)),'',!can||!state.solo.dressings||u.hp===u.maxHp],
    [`Throw grenade ×${u.ammo.grenade||0} · ${grenadeSeconds(u)} s`,armGrenade,'',!can||!(u.ammo.grenade>0)]];}
  return [[inventoryLabel,equipment],
    ['Aim firearm at a point',selectPointTarget,'',!can||!w.mag||w.incendiary||w.thrown],
    [`Area weapon: ${areaNames[areaWeapon()]} · Change`,openAreaPicker,'',!can],
    [`Switch to ${short(other)}${swapCost?' · '+swapCost+' AP':''}`,()=>act(()=>Core.equip(state,u,other)),'',!can||u.ap<swapCost],
    [`Reload ${short(u.weapon)} · ${u.ammo[u.weapon]??0}/${w.mag}${actionCost}`,()=>act(()=>Core.reload(state,u)),'',!can||!w.mag||u.ammo[u.weapon]>=w.mag||!(u.ammoPouch[u.weapon]>0)||costs&&u.ap<3],
    [`Use field dressing ×${state.solo.dressings}${actionCost}`,()=>act(()=>dressing(state)),'',!can||!state.solo.dressings||u.hp===u.maxHp||costs&&u.ap<3],
    [`Throw grenade ×${u.ammo.grenade||0} · ${Core.grenadeCost(u)} AP`,armGrenade,'',!can||!(u.ammo.grenade>0)||u.ap<Core.grenadeCost(u)]];
}
function operationMenu(){
  if(state?.realtime){realtimeMenu();return;}
  pointTargeting=false;
  if(!state)return;if(isTour(state)){tourMenu();return;}
  storage.write();
  const u=hero(state),w=Core.WEAPONS[u.weapon],can=Core.canControl(state,u),costs=Core.combatCosts(state);
  const other=u.weapon===state.solo.build.primary?state.solo.build.secondary:state.solo.build.primary;
  const swapCost=weaponSwapCost(u,other),actionCost=costs?' · 3 AP':'';
  const phase=state.phase==='enemy'?'Guard turn':state.phase==='player'?`Your turn · round ${state.round}`:'Real-time exploration';
  showDialog(`<p class="eyebrow">${safe(missionForState(state).title)} / OPERATION PAUSED</p><h2>Field menu.</h2><p class="menu-summary">${phase}<br>${u.name} · ${short(u.weapon)} · ${u.ap.toFixed(1)} AP</p>`,[
    ['Continue operation',()=>{},'primary'],
    ...weaponActions(),
    ['Mission & combat log',mission],['Controls',help],['Choose operation, animal & loadout',backToPrep],['Title screen',()=>{storage.write();location.assign('./');}],['Restart this operation',()=>start(createSoloGame(state.solo.build,1947,state.solo.missionId))]
  ],{context:true});
}
function mission(){
  if(isTour(state)){tourNotes();return;}
  const u=hero(state),near=interaction(state),definition=missionForState(state),secured=objectiveSecured(state),dest=missionDestination(state);
  const safe=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const objective=secured?definition.objective.after:definition.objective.instruction;
  showDialog(`<p class="eyebrow">${safe(definition.location)} / ${safe(definition.title.toUpperCase())}</p><h2>Your assignment.</h2><p>${safe(definition.briefing)}</p><p>${safe(objective)}<br>${distance(u,dest).toFixed(1)} m to ${safe(secured?definition.extraction.name:definition.objective.name)}.</p><p class="menu-log-title">RECENT EVENTS</p><ol class="menu-log">${state.log.slice(0,8).map(line=>`<li>${safe(line)}</li>`).join('')}</ol>`,[
    ...(near?[[`${near.label}${near.cost?' · '+near.cost+' AP':''}`,()=>act(()=>interact(state)),'primary',!near.ok]]:[]),
    ['Back to menu',operationMenu],['Return to operation',()=>{}]
  ]);
}
$('menu').onclick=operationMenu;
function help(){if(state?.realtime){realtimeHelp();return;}if(isTour(state)){showDialog('<p class="eyebrow">WALKING TOUR</p><h2>Walk and inspect.</h2><p>Use the joystick, WASD or arrow keys to move. Tap movement to switch run, walk or sneak. Quick taps change pace without stopping; hold for choices.</p><p>Drag the view to pan; use zoom or the eye button to return to your animal. Options → Visit landmark moves you directly to a cleared approach. You can walk across all town sectors continuously.</p><p>Movement has no stamina limit. Weapons, grenades, reloads, injuries and turns use the normal game rules. Firearms can target a point from Options. Doors and other interactions appear where authored data exists.</p>',[['Back to tour menu',tourMenu],['Continue walking',()=>{},'primary']]);return;}showDialog(`<p class="eyebrow">FIELD NOTES</p><h2>One animal.<br>Your decisions.</h2><ul>
  <li>Use the center thumbstick to move freely in any direction. W A S D and arrow keys also work.</li>
  <li>During combat, movement spends AP by the exact distance covered. Stop anywhere. The right buttons are End Turn, your area weapon, then Options.</li>
  <li>Grenade and flamethrower share one button. Hold it to choose which to use, or open Options → Area weapon / Inventory & weapons. Selecting grenades is free and keeps your held weapon. Equipping a flamethrower uses the usual weapon-change cost. The button slowly pulses yellow when a valid aim is held and ready to fire.</li>
  <li>Tap Grenade or press G to aim with the joystick. Direction aims the throw; displacement sets distance, up to 10 m. The animal stays still. Release to hold the preview, then tap Throw or press Enter. Cancel or Escape exits without spending AP or grenades. Choose frag grenades in your loadout to carry three.</li>
  <li>For keyboard aiming, hold W A S D or arrows to adjust direction and distance. Release to hold aim. The camera frames the arc and blast without rotating. Filled ground is exposed to the blast; walls and unexplored ground stop the fill. The outline shows the maximum radius.</li>
  <li>A grenade costs 5 AP, or 2.5 AP while a pistol or SMG is equipped. Throwing keeps that weapon in hand. Blast radius: 5 m. Your animal can be hurt by its own grenade. Blocked flight paths, solid obstacles, and unexplored landing points prevent throwing.</li>
  <li>With a flamethrower equipped, tap CONE or press F. The joystick rotates its full 10 m, 48° area of effect. Release to hold aim, then tap FIRE or press Enter. The cone stops at walls and fog. Firing costs 6 AP and one fuel charge, including when no opponent is inside. Cancel or Escape leaves resources unchanged. Tapping a visible guard starts the cone pointed toward them.</li>
  <li>Tap a visible guard to open the weapon controls. The green CRT shows that guard, the selected body location and its hit chance. Body locations are on the left and aim levels on the right. The highest affordable aim is selected initially; choose a lower level to save AP. Burst changes the cost. An unaffordable switch flashes red three times when pressed. The wide Fire bar is the only action that shoots. Exit or Escape closes targeting without spending AP or ammunition.</li>
  <li>When a gun is empty, FIRE becomes RELOAD. Reloading uses carried spare ammunition and costs 3 AP in combat, or 0 AP outside combat. It does not also shoot. An empty flamethrower shows the same Reload shortcut on its area button.</li>
  <li>Drag the world to look around when not aiming. Use the arrows to zoom.</li>
  <li>Stamina is temporarily off. Run, sneak and crawl remain available at zero stamina.</li>
  <li>Tap the stance button to go standing → kneeling → prone → kneeling → standing. Tap movement for run ↔ off / walk ↔ sneak. Both switches cost 0 AP, even when you have no AP left.</li>
  <li>Hold either button for large direct choices. Keyboard: focus the button and press the down arrow to open choices.</li>
  <li>The eye counts visible opponents. It blinks red and plays a short alert when you first spot a guard. Known guards stay remembered when you resume. Each tap advances through visible opponents from nearby, clear contacts to farther, harder-to-see contacts, then recenters on your animal. The next tap starts the cycle again. With no visible opponents, it simply recenters. Camera inspection costs no AP; moving also returns to your animal.</li>
  <li>A hand appears above visible objects within clear reach. Tap its labelled action, or hold for choices. Tap another nearby object to focus it. Opening choices and loot windows is free; completing an action spends the shown AP in combat.</li>
  <li>Chests and fallen guards share a loot window with individual Take buttons and Take all. Transfers cost 1 AP in combat, including a bulk transfer. Doors open or close for 1 AP; opening a chest or searching a body costs 2 AP. Exploration interactions are free. A blocked doorway cannot close on an animal.</li>
  <li>Options holds inventory, weapon changes, reloads and treatment, including looted supplies. Find your objective and recent events under Mission & combat log. Use the hand to collect the mission evidence and extract.</li>
  </ul>`,[['Back to menu',operationMenu],['Return to operation',()=>{},'primary']]);}
$('minimap-button').onclick=()=>{if(isTour(state)){showDialog('<p class="eyebrow">MOUNT DORA</p><h2>Town map.</h2><div class="map-metal-frame map-expanded-frame"><canvas id="large-map" width="760" height="560" role="img" aria-label="Mount Dora town map. YOU ARE HERE marks your current location; the bright arrow shows your facing direction."></canvas></div><p>YOU ARE HERE marks your current location; the bright arrow shows your facing direction. Water and closed buildings block walking; supported mapped paths remain open.</p>',[['Continue walking',()=>{},'primary']]);drawMinimap($('large-map'),state,{expanded:true});return;}showDialog(`<p class="eyebrow">${safe(missionForState(state).location)} / TACTICAL MAP</p><h2>Find your way.</h2><div class="map-metal-frame map-expanded-frame"><canvas id="large-map" width="760" height="560" role="img" aria-label="Tactical map. YOU ARE HERE marks your current location; the bright arrow shows your facing direction."></canvas></div><p>YOU ARE HERE marks your current location; the bright arrow shows your facing direction. Orange: the objective and visible guards. Green: extraction. Dark areas remain unexplored.</p>`,[['Return to operation',()=>{},'primary']]);drawMinimap($('large-map'),state,{expanded:true});};
function resetStick(){const pointer=stickPointer;stickPointer=null;if(pointer!==null&&$('joystick').hasPointerCapture(pointer))$('joystick').releasePointerCapture(pointer);stick={x:0,y:0};$('stick-knob').style.transform='translate(-50%,-50%)';}
function updateStick(e){
  const r=$('joystick').getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,limit=r.width*.3,n=Math.hypot(dx,dy),scale=Math.min(1,limit/Math.max(1,n));
  stick=n<(aiming()?limit*.12:9)?{x:0,y:0}:{x:dx*scale/limit,y:dy*scale/limit};$('stick-knob').style.transform=`translate(calc(-50% + ${stick.x*limit}px),calc(-50% + ${stick.y*limit}px))`;
  if(flameAim.active){flameAim.aim(stick,fieldCameraFor(state));renderFlameControls();}
  else if(grenadeAim.active){grenadeAim.aim(hero(state),stick,Core.WEAPONS.grenade.range,fieldCameraFor(state));updateGrenadePreview();}else view?.center();
}
$('joystick').onpointerdown=e=>{if(e.button!==0||stickPointer!==null||!state||paused||!Core.canControl(state,hero(state)))return;e.preventDefault();view?.unlockSound?.();stickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);Core.stop(state);selected=null;if(!aiming())view.route([]);updateStick(e);};$('joystick').onpointermove=e=>{if(e.pointerId===stickPointer)updateStick(e);};
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(name,e=>{if(e.pointerId===stickPointer){resetStick();if(grenadeAim.active)renderGrenadeControls();if(flameAim.active)renderFlameControls();}});
addEventListener('keydown',e=>{
  if(!active||paused||e.defaultPrevented||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  if(!e.repeat)view?.unlockSound?.();
  const k=e.key.toLowerCase(),button=e.target.closest('button');
  if(k==='escape'&&pointTargeting){pointTargeting=false;toast('Target selection cancelled.');return;}
  if(REALTIME&&k==='q'){e.preventDefault();if(!e.repeat)cycleRealtimeAim();return;}
  if(REALTIME&&k==='r'){e.preventDefault();if(!e.repeat)act(()=>Core.reload(state,hero(state)));return;}
  if(k==='g'){e.preventDefault();if(!e.repeat)armGrenade();return;}
  if(k==='f'){e.preventDefault();if(!e.repeat)armFlame();return;}
  if(k==='enter'&&aiming()&&!button){e.preventDefault();if(!e.repeat){if(flameAim.active)commitFlame();else commitGrenade();}return;}
  if(k===' '&&button)return;
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)){
    e.preventDefault();if(k===' '){if(!e.repeat&&!aiming()){if(REALTIME)toggleRealtimeFire();else act(()=>Core.endTurn(state));}}else keys.add(k);
  }
  if(k==='escape'){if(aiming()){cancelAreaAim();renderBattle();}else $('menu').click();}
});
addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(grenadeAim.active)renderGrenadeControls();if(flameAim.active)renderFlameControls();});
document.addEventListener('freeze',()=>{endManualTrigger();pageFrozen=true;frameClock.reset();resetStick();keys.clear();});
document.addEventListener('resume',()=>{pageFrozen=false;frameClock.reset(performance.now());});
addEventListener('focus',()=>{backgrounded=false;frameClock.reset(performance.now());});
addEventListener('blur',()=>{endManualTrigger();view?.pauseWeaponSound?.(true);backgrounded=true;frameClock.reset();areaPress=false;resetStick();keys.clear();clearAreaReadiness();guardAlert.stop();});document.addEventListener('visibilitychange',()=>{areaPress=false;resetStick();keys.clear();if(document.hidden){endManualTrigger();view?.pauseWeaponSound?.(true);clearAreaReadiness();guardAlert.stop();storage.write();}frameClock.reset(performance.now());});addEventListener('pagehide',event=>{endManualTrigger();storage.write();guardAlert.stop();if(!event.persisted)void guardAlert.dispose();});
function frame(now){
  requestAnimationFrame(frame);
  const controlsPaused=paused&&!manualTrigger;
  const simulating=active&&!!view&&!controlsPaused&&!backgrounded&&!pageFrozen&&!document.hidden&&$('loading').hidden&&(!isTour(state)||view.art?.readyForMovement),dt=frameClock.sample(now,simulating);
  if(!active||!view)return;
  view.pauseWeaponSound?.(controlsPaused||backgrounded||pageFrozen||document.hidden);
  if(simulating){
    let x=stick.x,y=stick.y;if(keys.size){x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);y=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);}
    const n=Math.max(1,Math.hypot(x,y));x/=n;y/=n;
    if(state.realtime)state.realtime.suspended=aiming()||pointTargeting;
    if(aiming()){
      if(!Core.canControl(state,hero(state)))cancelAreaAim();
      else{Core.stop(state);if(keys.size){const camera=fieldCameraFor(state);if(flameAim.active){flameAim.aim({x,y},camera);renderFlameControls();}else{grenadeAim.nudge(hero(state),{x,y},Core.WEAPONS.grenade.range,dt,camera);updateGrenadePreview();}}}
      tick(state,dt);
    }else{if(Math.hypot(x,y)>.1&&view.focusedId!=null)view.center();tick(state,dt,Math.hypot(x,y)>.1?screenToGround(x,y,fieldCameraFor(state)):null);}
    if(state.phase!==lastPhase){if(!state.realtime||state.solo.status!=='active'){resetStick();keys.clear();cancelAreaAim();Core.stop(state);}lastPhase=state.phase;contextKey='';}
    if(now-lastSave>2500){storage.write();lastSave=now;}
  }
  if(simulating&&state.solo.status==='active'){
    const fresh=guardContacts.observe(state.units.filter(guard=>guard.team==='guard'&&guard.hp>0&&state.detected.has(guard.id)));
    if(fresh.length){state.solo.spottedGuardIds=guardContacts.ids();guardAlert.notify(fresh);storage.write();}
  }
  view.sync(state,now);positionInteractionHand();if(now-lastUI>100){renderBattle();lastUI=now;}
}
renderPrep();requestAnimationFrame(frame);

// Read-only production diagnostics used by native acceptance; no state mutation or test teleports.
export function inspectMountDora(){
  const world=getTourWorld(state);if(!world)return {active,missionId:state?.solo?.missionId||null,touring:false};
  const u=hero(state),actor=view?.actors.get(u.id),projection=view?.projectWorldPoint?.({x:u.x,y:u.y,h:.9}),resident=view?.residentWindow;let actorMeshes=0,actorVertices=0;actor?.root.traverse(o=>{if(o.isMesh){actorMeshes++;actorVertices+=o.geometry?.attributes?.position?.count||0;}});
  return {active,paused,touring:true,ready:!!view?.art?.readyForMovement&&!view?.pending.size&&!view?.failed.size,phase:state.phase,sourceRevision:world.sourceRevision,artRevision:world.artRevision,elapsed:state.elapsed,queueLength:state.queue.length,renderedAt:view?.lastFrameAt,frames:view?.frameCount,input:{stickHeld:stickPointer!==null,keys:[...keys]},
    player:{x:u.x,y:u.y,heading:u.heading,ground:world.tile(Math.round(u.x),Math.round(u.y)),name:u.name,species:u.species,weapon:u.weapon,stance:u.stance,running:u.running,sneaking:u.sneaking,speed:Core.movementSpeed(u),stamina:u.stamina,hp:u.hp,ammo:{...u.ammo}},distance:state.solo.distance,explored:state.seen.size,
    source:{...world.status(),stats:{...world.stats}},render:view?.art?.metrics()||null,camera:view?{span:view.span,requestedSpan:view.requestedSpan,following:view.follow,target:{x:view.target.x,y:view.target.z},resident}:null,actor:{visible:!!actor?.root.visible,standY:actor?.root.position.y??null,visualDistance:view?.samples.get(u.id)?.distance,physicalDistance:u.travelled,onScreen:!!projection?.visible,projection,insideResident:!!resident&&pointInWorldRect(u,resident),meshes:actorMeshes,vertices:actorVertices},
    memory:view?{geometries:view.renderer.info.memory.geometries,textures:view.renderer.info.memory.textures,programs:view.renderer.info.programs.length,shaderFailures:view.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length}:null,artError:tourArtError};
}
export function projectMountDoraTownPoint(point){if(!isTour(state)||!view)return null;return view.projectWorldPoint({x:point[0]-.5,y:point[1]-.5,h:point[2]||0});}

function toggleRealtimeFire(){
  if(!state?.realtime)return;
  act(()=>Core.configureRealtime(state,{autoFire:!state.realtime.autoFire}),{keepMovement:true});
}
function cycleRealtimeAim(){
  if(!state?.realtime||paused||Core.WEAPONS[hero(state).weapon].incendiary)return;
  const values=['hip','aimed','full'];
  act(()=>Core.configureRealtime(state,{aim:values[(values.indexOf(state.realtime.aim)+1)%3]}),{keepMovement:true});
}
$('realtime-aim').onclick=cycleRealtimeAim;
const fireModeNames={single:'Single shot',burst:'3-round burst',auto:'Full auto'};
const fireModePaint={single:'SINGLE',burst:'BURST',auto:'FULL AUTO'};
const priorityNames={nearest:'Nearest',weakest:'Weakest',threat:'Biggest threat'},aimNames={hip:'HIP FIRE',aimed:'AIMED',full:'FULL AIM'};
function renderRealtimeBattle(){
  const r=Core.realtimeStatus(state),u=hero(state),w=Core.WEAPONS[u.weapon],target=state.units.find(v=>v.id===r.targetId);
  const trigger=$('end-turn');trigger.disabled=!Core.canControl(state,u)||aiming()||!r.automatic;
  trigger.dataset.lit=String(r.autoFire);trigger.setAttribute('aria-pressed',String(r.autoFire));
  trigger.setAttribute('aria-label',`${r.autoFire?'Fire at will on. Hold fire':'Hold fire. Enable fire at will'}. Hold for fire mode, aim and target priority.`);
  trigger.title=r.automatic?'Space: toggle fire at will. Hold for firing settings.':'This weapon uses deliberate area or point targeting.';
  $('turn-label').innerHTML=r.autoFire?'FIRE AT<br>WILL':'HOLD<br>FIRE';
  $('realtime-tools').hidden=false;$('realtime-aim').disabled=!!w.incendiary||!Core.canControl(state,u)||aiming();
  $('realtime-aim-label').textContent=w.incendiary?'AREA FIRE':aimNames[r.aim];$('realtime-aim').setAttribute('aria-label',w.incendiary?'Flamethrower area fire. One cone every 3 seconds. No aiming required.':`Aim: ${aimNames[r.aim].toLowerCase()}. Tap to change aim level.`);
  $('ap').textContent=String(r.ammo);$('ap-label').textContent=w.mag?'ROUNDS':'MELEE';
  $('realtime-status').textContent=r.reloading?`RELOADING ${r.remaining.toFixed(1)}s · ${r.reserve} SPARE`:`${w.short}${fireModesFor(u.weapon).length>1?' · '+fireModePaint[r.fireMode]:''} · ${r.ammo}/${w.mag} · ${r.reserve} SPARE`;
  $('realtime-target').textContent=!r.ammo&&!r.reserve&&w.mag?'OUT OF AMMUNITION':target?`${target.name} · ${priorityNames[r.priority]}`:r.autoFire?'WAITING FOR CLEAR SHOT':'HOLD FIRE';
  $('realtime-status').hidden=false;$('realtime-target').hidden=false;
  $('grenade-cost').textContent=(areaWeapon()==='flamethrower'?shotSeconds('flamethrower'):grenadeSeconds(u)).toFixed(1)+' s';
  $('interaction-cost').textContent='';
}
function fireSettings(){
  if(!state?.realtime)return;storage.write();
  const u=hero(state),r=state.realtime,mode=Core.realtimeStatus(state).fireMode;
  showDialog('<p class="eyebrow">FIRE CONTROL / PAUSED</p><h2>Choose your commitment.</h2><p>Fire mode, aim and target priority stay selected between shots. Your animal only fires at detected hostiles with a clear firing path. The flamethrower fires one cone every 3 seconds with no aiming, using its fuel supply. Moving reduces firearm accuracy.</p>',[
    [r.autoFire?'Hold fire':'Enable fire at will',()=>act(()=>Core.configureRealtime(state,{autoFire:!r.autoFire})),'primary'],
    ...fireModeActions(u,mode,fireSettings),
    ...(Core.WEAPONS[u.weapon].incendiary?[]:['hip','aimed','full'].map(value=>[`${aimNames[value]} · ×${value==='hip'?'1':value==='aimed'?'1.5':'2'} shot interval${r.aim===value?' · selected':''}`,()=>{Core.configureRealtime(state,{aim:value});fireSettings();}])),
    ...['nearest','weakest','threat'].map(value=>[`Target: ${priorityNames[value]}${r.priority===value?' · selected':''}`,()=>{Core.configureRealtime(state,{priority:value});fireSettings();}]),
    ['Release pinned target',()=>{Core.pinRealtimeTarget(state,null);fireSettings();},'',r.pinnedId===null],
    ['Return to operation',()=>{}]
  ]);
}
function realtimeMenu(){
  pointTargeting=false;storage.write();const u=hero(state),r=Core.realtimeStatus(state);
  showDialog(`<p class="eyebrow">${safe(missionForState(state).title)} / REAL TIME PAUSED</p><h2>Field menu.</h2><p>${safe(u.name)} · ${safe(short(u.weapon))} · ${r.kills} kills<br>${r.autoFire?'Fire at will':'Hold fire'} · ${Core.WEAPONS[u.weapon].incendiary?'AREA FIRE / 3 s':aimNames[r.aim]} · ${priorityNames[r.priority]}</p>`,[
    ['Continue operation',()=>{},'primary'],['Fire control: mode, aim & target priority',fireSettings],
    ...weaponActions(),...(isTour(state)?[['Visit landmark',tourVisits],['Tour notes',tourNotes]]:[]),
    ['Mission & combat log',mission],['Controls',realtimeHelp],['Choose operation, animal & loadout',backToPrep],
    ['Title screen',()=>{storage.write();location.assign('./');}],
    ['Restart this operation',()=>isTour(state)?launchTour():start(createSoloGame(state.solo.build,1947,state.solo.missionId))]
  ]);
}
function realtimeHelp(){showDialog('<p class="eyebrow">REAL-TIME FIELD NOTES</p><h2>Move. Conceal. Commit.</h2><p>Joystick, WASD or arrows move. Standing runs by default; crouching and crawling are slower. Tap Sneak to halve your pace. Its small lamp reads BRUSH when foliage gives you concealment and SEEN when a guard has you in sight. Red outlines show where visible guards can spot you. Stance switches remain free and bounce through kneeling.</p><p>The top right button toggles Hold Fire / Fire at Will (Space). Hold it to choose your fire mode and nearest, weakest or biggest-threat priority. Tap the aim button above the joystick (Q) to cycle hip fire, aimed and full aim. Higher aim takes longer, including before the first shot. A valid current target stays selected unless a substantially better target appears.</p><p>Tap an opponent for the original CRT body-location and manual firing controls, and to pin that target. Choose Single, 3-round Burst or Full Auto on the loadout screen. Open Weapons beside Aim to change modes, swap guns or reload in the field. Tap Fire for one shot or one burst. In Full Auto, hold Fire to keep firing and release to stop. Fire at Will uses the same mode. Empty guns automatically reload from your finite reserve; R or Weapons reloads early. You can move while reloading. Options and other dialogs pause the whole encounter; switching away also pauses without catching up later.</p><p>Grenades (G), flamethrowers (F), point shots, doors, loot and treatment retain their production controls. Area aiming suspends your automatic gunfire while enemies continue acting. Release the joystick before confirming a throw or flame burst. Flamethrowers also work with Fire at Will: one cone every 3 seconds, with no aiming. They use their normal cone, fuel and reload rules. Explosive weapons remain deliberate.</p><p>An opening hit while sneaking against an unaware opponent deals ×1.5 damage. Noise gives guards a place to investigate; friendly gunfire shares the shooter’s last known opponent position. Guards search after reaching that area, rather than forgetting mid-route. Kills earn the weapon skill XP; stealth kills also earn Sneak XP. First improvement: 3 kills in that skill, then progressively more.</p>',[['Back to menu',realtimeMenu],['Return to operation',()=>{},'primary']]);}
function realtimeHardware(parent,{control,paint,icon,mark='',pressed,bar=false,disabled=false,onClick}){
  const b=document.createElement('button');b.type='button';b.className='industrial-switch shooting-switch'+(bar?' fire-bar':'');b.dataset.control=control;b.dataset.face=bar?'red':'amber';b.disabled=disabled;
  b.setAttribute('aria-label',paint+(mark?' · '+mark:''));if(pressed!==undefined)b.setAttribute('aria-pressed',String(pressed));
  b.innerHTML=`<span class="switch-legend" aria-hidden="true"><span class="switch-icon"><svg class="switch-glyph" viewBox="0 0 32 32"><use href="${switchSymbol(icon)}"/></svg></span><span class="switch-label">${paint}</span><span class="switch-cost">${mark}</span></span>`;
  b.onclick=onClick;parent.append(b);return b;
}
function renderRealtimeContext(focusControl){
  const root=$('context');
  if(manualTrigger){
    const status=Core.realtimeStatus(state),mark=manualTrigger.querySelector?.('.switch-cost'),label=manualTrigger.querySelector?.('.switch-label');
    if(label)label.textContent=status.ammo?'FIRE':'RELOAD';
    if(mark)mark.textContent=status.reloading?'RELOADING':status.ammo+' ROUNDS';
    return;
  }
  const pointShot=overlay.dataset.mode==='point-shooting';
  const target=pointShot?selected?.point:state.units.find(v=>v.id===selected?.targetId);
  if(!target||!overlay.open||!pointShot&&overlay.dataset.mode!=='shooting'){
    if(root.children.length){root.replaceChildren();root.classList.remove('shooting-panel');}
    contextKey='';return;
  }
  const u=hero(state),r=state.realtime,status=Core.realtimeStatus(state),mode=status.fireMode;
  const preview=(zone=r.zone)=>Core.previewAttack(state,u,target,mode==='burst',zone,null,r.aim),p=preview();
  const reload=triggerReloadStatus(u),sig=JSON.stringify([target.id??target,pointShot,target.hp,target.stance,target.weapon,u.weapon,r.zone,r.aim,mode,p,reload,status.ammo,status.reloading]);
  if(sig===contextKey)return;
  contextKey=sig;
  const focused=focusControl??document.activeElement?.dataset?.control;
  root.replaceChildren();root.classList.add('shooting-panel');
  const monitor=pointShot?null:createTargetMonitor(state,target,p,r.zone);if(monitor)root.append(monitor);
  const columns=document.createElement('div');columns.className='shooting-columns';
  function bank(title,parent=columns,className=''){
    const group=document.createElement('fieldset');group.className='shooting-group '+className;
    const legend=document.createElement('legend');legend.textContent=title;
    const row=document.createElement('div');row.className='shooting-bank';group.append(legend,row);parent.append(group);return row;
  }
  let restoreFocus;
  function control(parent,options){
    const b=realtimeHardware(parent,options);if(options.control===focused)restoreFocus=b;return b;
  }
  function configure(values,focus){
    if(manualTrigger)return;
    Core.configureRealtime(state,values);renderContext(focus);storage.write();
  }
  if(!pointShot){
    root.append(columns);
    const zones=bank('BODY LOCATION');
    for(const value of ['torso','head','weapon','legs'])control(zones,{control:'zone-'+value,paint:Core.AIM_ZONES[value].label.toUpperCase(),icon:'target-'+value,mark:preview(value).chance+'% HIT',pressed:r.zone===value,onClick:()=>configure({zone:value},'zone-'+value)});
    const aims=bank('AIM LEVEL');
    for(const value of ['hip','aimed','full'])control(aims,{control:'aim-'+value,paint:aimNames[value],icon:'aim-'+value,mark:shotSeconds(u.weapon,value,mode).toFixed(2)+' s',pressed:r.aim===value,onClick:()=>configure({aim:value},'aim-'+value)});
  }
  const holding=mode==='auto'&&!reload.empty;
  const tap=()=>{if(manualTrigger)return;clearTargeting();closeDialog();act(()=>reload.empty?Core.reload(state,u):Core.attack(state,u,target,mode,false,r.zone,false,r.aim));};
  const fire=control(root,{control:'fire',paint:reload.empty?'RELOAD':'FIRE',icon:reload.empty?'reload':'fire',
    mark:reload.empty?WEAPON_TIMING[u.weapon].reload+' s':holding?'HOLD TO FIRE':mode==='burst'?(p.rounds??3)+' ROUNDS':shotSeconds(u.weapon,r.aim,mode).toFixed(2)+' s',
    bar:true,disabled:reload.empty?!reload.ok||status.reloading:!p.ok,onClick:tap});
  if(holding){
    fire.classList.add('hold-trigger');
    bindHeldTrigger(fire,{
      press:()=>{
        if(manualTrigger||!paused||!Core.pressRealtimeTrigger(state,u,target,r.zone,r.aim))return false;
        manualTrigger=fire;fire.dataset.lit='true';view?.unlockSound?.();frameClock.reset(performance.now());return true;
      },
      release:commit=>{
        if(manualTrigger!==fire)return;
        endManualTrigger(commit);
        if(commit){clearTargeting();closeDialog();}
        renderBattle();storage.write();
      },
      tap
    });
  }
  const modes=fireModesFor(u.weapon),row=bank('FIRE MODE / EXIT',root,'trigger-bank');
  row.dataset.fireModes=modes.length===3?'three':'one';
  for(const value of modes)control(row,{control:value,paint:fireModePaint[value],icon:'fire-'+value,mark:value==='burst'?'3 ROUNDS':'',
    pressed:mode===value,onClick:()=>{if(mode!==value)configure({fireMode:value},value);}});
  control(row,{control:'exit',paint:'EXIT',icon:'exit',onClick:exitTargeting});
  if(p.reason){const note=document.createElement('p');note.className='shooting-warning';note.textContent=p.reason;root.append(note);}
  restoreFocus?.focus?.({preventScroll:true});
}
// Read-only diagnostics: browser acceptance observes the real application and renderer.
export function inspectRealtime(){
  if(!state?.realtime)return {active:false};
  return {active,paused:paused&&!manualTrigger,ready:!!view&&!view.pending?.size&&!view.failed?.size&&$('loading').hidden,missionId:state.solo.missionId,phase:state.phase,status:state.solo.status,elapsed:state.elapsed,queueLength:state.queue.length,...Core.realtimeStatus(state),
    lastDischarge:view?.lastDischarge??null,weaponPose:view?.playerWeaponPose??null,guardSight:[...(view?.guardSight?.outlines.keys()??[])],
    player:{x:hero(state).x,y:hero(state).y,hp:hero(state).hp,stance:hero(state).stance,sneaking:hero(state).sneaking,distance:state.solo.distance,ammo:{...hero(state).ammo},stats:{...hero(state).stats}},
    contacts:Core.visibleOpponents(state).map(v=>({id:v.id,name:v.name,hp:v.hp,x:v.x,y:v.y})),
    guards:state.units.filter(v=>v.team==='guard').map(v=>({id:v.id,x:v.x,y:v.y,hp:v.hp,maxHp:v.maxHp,weapon:v.weapon,firearms:v.stats.firearms,alert:v.alert,
      patrolPoints:v.patrol?.length||0,patrolIndex:v.patrolIndex,moving:v.isMoving,ammo:{...v.ammo},reload:state.realtime.actors[v.id]?.reload,projection:view?.projectWorldPoint?.({...v,h:.9})})),
    objects:Core.interactionObjects(state).map(o=>({id:o.id,kind:o.kind,open:o.open,searched:o.searched,x:o.x,y:o.y})),shaderFailures:view?.renderer?.info.programs.filter(p=>p.diagnostics?.runnable===false).length??0};
}
export function projectRealtimePoint(point){return view?.projectWorldPoint?.(point)||null;}
