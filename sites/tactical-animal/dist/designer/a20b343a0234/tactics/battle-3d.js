import {attackWeapon,burstAvailable,dualPistols} from './one-handed.js';
import {tutorialObjective} from './tutorial-mission.js';
import {createBattleDialogue} from './battle-dialogue.js';
import {DialogueOrder} from './dialogue-order.js';
import {loadDialogueCatalog,resolveDialogue} from './dialogue-data.js';
import {initializeDialogue,pinDialogue} from './dialogue-state.js';
import {MapGeometryCache} from './map-geometry-cache.js';
import {drawFoliageHover} from './battle-foliage-focus.js';
import {AutosaveSchedule} from './autosave-schedule.js';
import {sectorLoading} from './sector-loading.js';
import {prepareSectorView} from './loading-tracker.js';
import {BattleContextMenu,inspectBattleTile} from './battle-context-menu.js';
import {PickupOrder,pickupRoute} from './pickup-order.js';
import {reserve} from './core/inventory.js';
import {campaignBattle} from './campaign-battle.js';
import {DefeatFlow,createDefeatNotice} from './battle-defeat.js';
import {guardCone,visibleConeGuards,drawGuardCones} from './guard-cones.js';
import {walkingRoutes,walkingHazards,walkingWarning,drawWalkingRoutes} from './walking-preview.js';
import {renderShotPlanner} from './shot-planner.js';
import {intactSite,siteId} from './strategic-site-rules.js';
import {strategicTarget} from './strategic-site-damage.js';
import {barrelId,barrelTarget,isExplosiveBarrel} from './explosive-barrels.js';
import {barrelSight} from './barrel-targeting.js';
import {FlamePlanner} from './flame-planner.js';
import {GrenadePlanner} from './grenade-planner.js';
import {legImpaired} from './combat-state.js';
let shotZone='torso',shotBurst=false;
import {heldWeaponJammed} from './loot-policy.js';
import {edgeCells,LEVELS} from './core/maps.js';
import {nearbyCliffClimbs} from './cliff-actions.js';
import {captureEncounter,restoreEncounter} from './encounter-save.js';
import {getSave,putSave,checkpointSave,saveToken} from './save-store.js';
import {createSavePanel} from './save-panel.js';
import {nearbyLoot,visibleLoot} from './battle-inventory.js';
import {nearbyInteractions,performInteraction,interactionPreview} from './field-actions.js';
import {createCharacterScreen} from './character-screen.js';
import {AIM_LEVELS,shotAim,supportsAim} from './aim-levels.js';
import {climbPreview,performClimb,performTraversal,nearbyBoundaryClimbs} from './ladder-actions.js';
import {unitBaseHeight} from './tower-geometry.js';
import {illuminationAt} from './awareness.js';
import {FrameClock,formatClock,timeOfDay,turnBased} from './game-clock.js';
import {startEncounterClock,tickEncounterClock,settleEncounterRounds} from './encounter-clock.js';
import {createGame,move,stepMovement,previewAttack,attack,attackGround,groundTarget,equip,equipCost,reload,endTurn,stepEnemy,stepInvestigation,canControl,canAimAt,turnTo,headingTo,bearingOffset,WEAPONS,stanceOf,STANCES,alive,moveGroup,combatCosts,MOVEMENT_MODES,movementModeOf,movementCost,effectiveStealth} from './core/engine.js';
import {loadBattleMap} from './battle-map.js';
import {BattleRenderer} from './battle-renderer.js';
import {projectBattlePoint,battleFloorPoint,rotateBattleView,focusBattleView,overviewBattleView} from './isometric-camera.js';
import {MOVEMENT_MS,queuedMovementDuration} from './battle-motion.js';
import {rectangleMembers,pruneSelection,toggleSelection,selectable,selectionModifier,stanceSelection,setSelectionStance,movementSelection,setSelectionMovement} from './battle-selection.js';
import {readSettings,saveSettings} from './settings-3d.js';
import {createSoundPreferences} from './sound-preferences.js';
import {createQuickPlayGame} from './quickplay-game.js';
import {quickPlayEntry,normalizeQuickPlayTeam,validQuickPlayTeam,quickPlayTeamFromSearch} from './quickplay-presets.js';
import {createBattleHud} from './battle-hud.js';

const $=id=>document.getElementById(id),canvas=$('battle'),ctx=canvas.getContext('2d');
$('difficulty').value=readSettings().difficulty;
$('blood-effects').value=readSettings().blood;
$('blood-effects').onchange=()=>{saveSettings({...readSettings(),blood:$('blood-effects').value});renderer?.blood?.setMode($('blood-effects').value);};
let definition,initialState,campaign=null;
const dialogueCatalog=await loadDialogueCatalog().catch(e=>({definitions:{},errors:{},error:e.message}));
let autoToken,autoTokenError;try{autoToken=saveToken(await getSave('auto'));}catch(e){autoTokenError=e;}
let dialogueUI;
try{const campaignSlot=new URLSearchParams(location.search).get('campaign');if(campaignSlot){campaign=await campaignBattle(campaignSlot);initialState=campaign.state;definition=initialState.definition;}const slot=new URLSearchParams(location.search).get('load');if(campaign){}else if(slot){const record=await getSave(slot);if(!record)throw Error('That save slot is empty. Return to the title screen to choose another.');initialState=restoreEncounter(record);definition=initialState.definition;}else definition=await loadBattleMap();}catch(error){$('message').textContent=error.message;$('restart').disabled=true;throw error;}
if(new URLSearchParams(location.search).has('editorPlaytest')){
 const back=document.createElement('button');back.id='return-editor';back.textContent='Return to editor';back.onclick=()=>{window.opener?.focus();window.close();};document.querySelector('header').append(back);
 document.querySelector('aside h1').textContent='Playtest: '+definition.name;
}
if(new URLSearchParams(location.search).get('study')==='wall-xray'||new URLSearchParams(location.search).get('study')==='climbing')document.querySelector('aside h1').textContent=definition.name;
let quickPlayTeam=quickPlayEntry(location.search,initialState)?initialState?normalizeQuickPlayTeam(initialState.quickPlayTeam):quickPlayTeamFromSearch(location.search,readSettings().quickPlayTeam):null;
let cliffViewState=null,cliffViewId=0;
let renderer,state,targetId=null,tileTarget=null,level=0,picks=[],width=1,height=1,lastStep=0,stepDelay=MOVEMENT_MS,drag=null,lastUI='',overviewMode=false,lastUIBusy=false,lastLadderPreparing=false;
const soundPreferences=createSoundPreferences({onChange:volume=>renderer?.audio?.setVolume(volume)});$('blood-effects').closest('section').append(soundPreferences.root);
let selectedIds=new Set(),lastUIDiagnostics='',lastDiagnostic='';
const frameClock=new FrameClock();let userPaused=false,presentationTime=0,lastClockCombat,storageBusy=false,autoDisabled=false;const autosaveSchedule=new AutosaveSchedule({revision:0,round:0},performance.now());
const characterScreen=createCharacterScreen({getState:()=>state,beforeOpen:()=>renderer.settleEquipmentDraws(state),onStopMovement:id=>{if(renderer.busy||!canControl(state,state.units.find(u=>u.id===id)))return false;pickupOrder.cancel();dialogueOrder.cancel();state.queue=[];frameClock.reset();lastUI='';sync();return true;},onInventoryChange:()=>{renderer.captureCombat(state);lastUI='';sync();},getEquipmentState:id=>renderer?.equipmentState(id)||'carried',canEquip:()=>!renderer.busy,onEquip:(id,weapon)=>{if(renderer.busy)return false;const ok=equip(state,state.units.find(u=>u.id===id),weapon);if(ok){renderer.captureCombat(state);lastUI='';}return ok;},onOpen:()=>{frameClock.reset();sync();},onClose:()=>{frameClock.reset();sync();}});
const savePanel=createSavePanel({...campaign?.saveOptions,onSave:saveGame,onLoad:loadGame,onOpen:()=>{frameClock.reset();lastUI='';sync();},onClose:()=>{frameClock.reset();lastUI='';sync();if(defeatFlow.stage==='error')defeatNotice.reopen();}});
const defeatNotice=createDefeatNotice({campaign:!!campaign,onRetry:()=>defeatFlow.finish(),onSaves:()=>savePanel.show()});
const defeatFlow=new DefeatFlow({announce:summary=>{pickupOrder.cancel();dialogueOrder.cancel();closeStances();defeatNotice.show(summary);lastUI='';sync();},clear:()=>defeatNotice.clear(),failed:e=>defeatNotice.failed(e),
 complete:async()=>{storageBusy=true;frameClock.reset();try{if(campaign)await campaign.finishDefeat();}finally{storageBusy=false;frameClock.reset();}},
 navigate:()=>{location.href=campaign?'campaign.html?defeat=1':'../../../index.html';}});
const shotDialog=$('shot-popup');
const paused=(ignorePlanner=false)=>sectorLoading.active||dialogueUI?.open||(!ignorePlanner&&(shotDialog.open||flamePlanner.open||grenadePlanner.open||contextMenu.open))||userPaused||storageBusy||campaign?.paused||document.hidden||characterScreen.open||savePanel.open;
function syncClock(){const phase=timeOfDay(state.clock).phase;$('game-clock').textContent=formatClock(state.clock)+' \u00b7 '+phase[0].toUpperCase()+phase.slice(1);$('drawer-clock').textContent=$('game-clock').textContent;$('pause').textContent=userPaused?'Resume':'Pause';$('pause').setAttribute('aria-pressed',String(userPaused));}
const view={x:0,y:0,zoom:1.15,turn:0};
let stanceAnchor=null;
function closeStances(focus=false){$('stance-menu').hidden=true;if(stanceAnchor){stanceAnchor.setAttribute('aria-expanded','false');if(focus)stanceAnchor.focus();}stanceAnchor=null;}
function setDrawer(open){closeStances();$('command-drawer').hidden=!open;for(const id of ['drawer-toggle','rail-menu'])$(id).setAttribute('aria-expanded',String(open));$('drawer-toggle').textContent=open?'‹':'›';$('drawer-toggle').setAttribute('aria-label',open?'Close command drawer':'Open command drawer');if(!open&&$('command-drawer').contains(document.activeElement))$('drawer-toggle').focus();}
function openStances(id,anchor){
 if(paused()||renderer.busy)return;
 if(stanceAnchor===anchor&&!$('stance-menu').hidden){closeStances(true);return;}
 closeStances();if(!selectedIds.has(id))selectMerc(id);else state.selected=id;lastUI='';sync();
 stanceAnchor=anchor;anchor.setAttribute('aria-expanded','true');const menu=$('stance-menu');menu.hidden=false;
 $('stance-menu-title').textContent=selectedIds.size>1?'Stance · '+selectedIds.size+' selected':'Stance · '+selected().name;
 const rect=anchor.getBoundingClientRect(),box=menu.getBoundingClientRect();
 menu.style.left=Math.max(8,Math.min(innerWidth-box.width-8,rect.left))+'px';
 menu.style.top=Math.max(8,Math.min(innerHeight-box.height-8,rect.top-box.height-8))+'px';
 menu.querySelector('button:not(:disabled)').focus();
}
const hud=createBattleHud($('squad'),{
 onSelect:(id,toggle)=>{closeStances();selectMerc(id,toggle);center();sync();},
 onInventory:id=>{if(dialogueUI?.open)return;closeStances();characterScreen.show(id);},
 onStance:openStances,
 onEquip:(id,weapon)=>action(()=>{const unit=state.units.find(u=>u.id===id);return unit&&equip(state,unit,weapon);}),
 onReload:id=>action(()=>{const unit=state.units.find(u=>u.id===id);return unit&&reload(state,unit);})
});
$('drawer-toggle').onclick=$('rail-menu').onclick=()=>setDrawer($('command-drawer').hidden);
$('rail-overview').onclick=overview;$('rail-saves').onclick=()=>savePanel.show();
$('stance-close').onclick=()=>closeStances(true);
document.addEventListener('pointerdown',e=>{if(document.querySelector('dialog[open]'))return;if(!e.target.closest('#stance-menu,.merc-stance'))closeStances();if(!e.target.closest('#command-drawer,#command-rail')&&!$('command-drawer').hidden)setDrawer(false);});
document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]'))return;if(e.key==='Escape'&&!$('stance-menu').hidden){e.preventDefault();closeStances(true);}else if(e.key==='Escape'&&!$('command-drawer').hidden){e.preventDefault();setDrawer(false);$('drawer-toggle').focus();}});
window.addEventListener('resize',()=>closeStances());
$('squad-dock').addEventListener('scroll',()=>closeStances());
const climbButton=document.createElement('button');climbButton.id='climb-tower';climbButton.textContent='Climb tower';$('reload').parentNode.insertBefore(climbButton,$('reload'));
const fieldPanel=document.createElement('section');fieldPanel.id='field-actions';$('reload').parentNode.after(fieldPanel);
const selected=()=>state.units.find(u=>u.id===state.selected);
const flamePanel=document.createElement('section');flamePanel.id='flame-plan';flamePanel.hidden=true;flamePanel.setAttribute('aria-label','Flamethrower area targeting');$('viewport').append(flamePanel);
const flamePlanner=new FlamePlanner(flamePanel,{onChange:()=>{frameClock.reset();lastUI='';sync();},onFire:point=>{flamePlanner.cancel();action(()=>attackGround(state,selected(),point));}});
const flameButton=document.createElement('button');flameButton.id='aim-flame';flameButton.hidden=true;flameButton.textContent='Aim flame cone';$('reload').before(flameButton);
const canPlanFlame=()=>!storageBusy&&!document.hidden&&!characterScreen.open&&!savePanel.open&&!renderer.busy&&!state.queue.length&&canControl(state,selected());
flameButton.onclick=()=>{if(!canPlanFlame())return;targetId=null;flamePlanner.start(state,selected());};
const grenadePanel=document.createElement('section');grenadePanel.id='grenade-plan';grenadePanel.hidden=true;grenadePanel.setAttribute('aria-label','Grenade targeting');$('viewport').append(grenadePanel);
const grenadePlanner=new GrenadePlanner(grenadePanel,{onChange:()=>{frameClock.reset();lastUI='';sync();},onThrow:point=>{grenadePlanner.cancel();action(()=>attackGround(state,selected(),point));}});
const grenadeButton=document.createElement('button');grenadeButton.id='aim-grenade';grenadeButton.textContent='Lob grenade';grenadeButton.hidden=true;$('reload').before(grenadeButton);
grenadeButton.onclick=()=>{if(!canPlanFlame())return;targetId=null;grenadePlanner.start(state,selected());};
const pickupOrder=new PickupOrder(),dialogueOrder=new DialogueOrder();
const contextMenu=new BattleContextMenu({onChange:()=>{frameClock.reset();lastUI='';if(state)sync();},onAction:runContextAction});
const target=()=>{if(tileTarget)return tileTarget;const site=state.props.find(p=>intactSite(p)&&siteId(p)===targetId);if(site)return strategicTarget(site);const p=state.props.find(p=>isExplosiveBarrel(p)&&barrelId(p)===targetId);return p?barrelTarget(p):state.units.find(u=>u.id===targetId&&u.hp>0&&state.detected.has(u.id));};
const mercStatus=u=>u.away?'Away':u.casualty==='captured'?'Captured':u.casualty==='quit'?'Left squad':u.hp>0?`${stanceOf(u)} · ${movementModeOf(u)} · ${u.hp} HP · ${u.ap} AP · ${Math.floor(u.stamina)} stamina`:u.casualty==='bleeding'?`Bleeding · ${u.bleedTurns} turns`:u.casualty==='stable'?'Stabilized':'Dead';
const message=text=>{$('message').textContent=text;};
const project=u=>projectBattlePoint(u,view,level);
function focus(x,y){overviewMode=false;focusBattleView(view,x,y,width,height);$('hint').textContent='Right-click for actions · Click ground/doors to move · Shift-drag to select mercs · WASD / arrows or drag to pan · Q / E rotate camera · Scroll to zoom';}
function syncLevelButtons(){for(const b of document.querySelectorAll('#battle-levels [data-level]'))b.setAttribute('aria-pressed',String(+b.dataset.level===level));}
function center(){const u=selected();level=u.z||0;$('floor').value=level;syncLevelButtons();focus(u.x,u.y);}
function overview(){overviewMode=true;overviewBattleView(view,definition.width,definition.height,width,height);$('hint').textContent='Click the map to inspect an area · WASD / arrows or drag to pan · Q / E rotate camera · Scroll to zoom · Center returns to your squad';}
function resize(){const box=canvas.getBoundingClientRect(),oldWidth=width,oldHeight=height;width=box.width;height=box.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);if(state){if(overviewMode)overview();else if(oldWidth>1&&oldHeight>1){view.x+=(width-oldWidth)/2;view.y+=(height-oldHeight)/2;}else center();}}
function restart(){dialogueUI?.close();defeatFlow.reset();closeStances();contextMenu.close();pickupOrder.cancel();dialogueOrder.cancel();tileTarget=null;grenadePlanner.cancel();flamePlanner.cancel();renderer?.dispose();renderer=new BattleRenderer(()=>{});state=quickPlayTeam?createQuickPlayGame(1947,definition,true,$('difficulty').value,quickPlayTeam):createGame(1947,definition,true,$('difficulty').value,{social:true,awareness:true,statSystem:true,rosterSeed:1947});prepareDialogueResources();startEncounterClock(state);frameClock.reset();presentationTime=0;renderer.presentationNow=0;lastStep=0;userPaused=false;autosaveSchedule.reset(state,performance.now());selectedIds=new Set([state.selected]);stepDelay=MOVEMENT_MS;drag=null;targetId=null;view.zoom=1.15;lastUI='';center();message(state.difficulty==='easy'?'Exteriors revealed. Look through doors or windows to discover interiors. People still need line of sight.':'Explore to reveal the map.');sync();}
async function saveGame(id){
 if(storageBusy)throw Error('A save or load is already in progress.');settleEncounterRounds(state);const snapshot=autosaveSchedule.snapshot(state),record=campaign?null:captureEncounter(state);storageBusy=true;frameClock.reset();
 try{if(!campaign&&id==='auto'&&autoTokenError)throw autoTokenError;const saved=campaign?await campaign.save(id):id==='auto'?await checkpointSave(id,record,autoToken):await putSave(id,record);if(!campaign&&id==='auto')autoToken=saveToken(saved);autosaveSchedule.saved(snapshot,performance.now());autoDisabled=false;return saved;}finally{storageBusy=false;frameClock.reset();lastUI='';sync();}
}
function installState(restored){dialogueUI?.close();defeatFlow.reset();closeStances();contextMenu.close();pickupOrder.cancel();dialogueOrder.cancel();tileTarget=null;grenadePlanner.cancel();flamePlanner.cancel();renderer?.dispose();renderer=new BattleRenderer(()=>{});state=restored;definition=state.definition;quickPlayTeam=quickPlayEntry(location.search,restored)&&validQuickPlayTeam(restored.quickPlayTeam)?normalizeQuickPlayTeam(restored.quickPlayTeam):null;prepareDialogueResources();$('difficulty').value=state.difficulty;selectedIds=new Set([state.selected]);targetId=null;drag=null;userPaused=true;presentationTime=0;renderer.presentationNow=0;lastStep=0;stepDelay=MOVEMENT_MS;lastClockCombat=undefined;lastUI='';autosaveSchedule.reset(state,performance.now());frameClock.reset();center();sync();message('Encounter loaded and paused. Press Resume to continue.');}
async function loadGame(id){return sectorLoading.run(()=>loadEncounterSave(id),{message:'Restoring saved sector'});}
async function prepareView(){await prepareSectorView(renderer,()=>{ctx.clearRect(0,0,width,height);picks=renderer.draw(ctx,state,view,width,height,level);},{status:text=>sectorLoading.status(text)});}
async function loadEncounterSave(id){if(storageBusy)throw Error('A save or load is already in progress.');storageBusy=true;frameClock.reset();try{if(campaign){const restored=await campaign.load(id);if(restored)installState(restored);}else{const record=await getSave(id);if(!record)throw Error('That save slot is empty.');const restored=restoreEncounter(record);autoToken=saveToken(await getSave('auto'));autoTokenError=null;installState(restored);}if(state)await prepareView();}finally{storageBusy=false;frameClock.reset();lastUI='';sync();}}
async function quickSave(){try{await saveGame('quick');message('Quicksave saved.');}catch(e){message('Could not save: '+e.message);}}
async function quickLoad(){try{await loadGame('quick');}catch(e){message('Could not load: '+e.message);}}
function autosave(){if(new URLSearchParams(location.search).get('study')==='factory-machines')return;if(new URLSearchParams(location.search).get('study')==='tree-cover'||new URLSearchParams(location.search).get('study')==='climbing')return;saveGame('auto').catch(e=>{autoDisabled=true;if(campaign)userPaused=true;sync();message('Autosave failed: '+e.message+' Use Save / Load to retry.');});}
function sync(){
 settleEncounterRounds(state);campaign?.update();const combat=turnBased(state);if(combat!==lastClockCombat){frameClock.reset();lastClockCombat=combat;}syncClock();
 if(cliffViewState!==state){cliffViewState=state;cliffViewId=0;}const traversal=state.cliffTraversals?.at(-1);if(traversal&&traversal.id>cliffViewId){cliffViewId=traversal.id;if(traversal.unitId===state.selected){level=selected().z||0;$('floor').value=level;}}
 syncLevelButtons();
 selectedIds=pruneSelection(state,selectedIds);
 if(selectedIds.size&&!selectedIds.has(state.selected))state.selected=[...selectedIds][0];
 const u=selected(),t=target();if(t?.ground||t?.barrel||t?.structure||!supportsAim(WEAPONS[u.weapon]))shotZone='torso';if(!burstAvailable(u,WEAPONS))shotBurst=false;const preview=t?previewAttack(state,u,t,shotBurst,shotZone,null,$('aim-level').value):null;
 flamePlanner.refresh(state,u,{blocked:paused(true)||renderer.busy,level});
 grenadePlanner.refresh(state,u,{blocked:paused(true)||renderer.busy});
 const signature=JSON.stringify([state.revision,state.phase,state.round,state.selected,level,[...selectedIds],state.queue.length,state.units.filter(v=>v.team==='squad').map(v=>[v.name,v.species,v.outfit,v.weapon,v.slots,v.pack,v.away,v.hp,v.ap,Math.floor(v.stamina),v.medkits,v.pinned,v.legWound,heldWeaponJammed(v),v.ammo[v.weapon],v.stance,v.sneaking,v.running,v.casualty,v.bleedTurns]),t?.id,preview,renderer.diagnostics,renderer.busy,renderer.traversal.preparing,userPaused,paused()]);
 if(signature===lastUI)return;lastUI=signature;
 fieldPanel.replaceChildren();for(const entry of nearbyInteractions(state,u)){const b=document.createElement('button'),p=entry.preview;b.textContent=entry.label+' · '+(p.cost?p.cost+' AP':'1 min')+(p.chance!==undefined?' · '+p.chance+'%':'')+(p.amount>0?' · +'+Math.floor(p.amount):'');b.disabled=paused()||renderer.busy||!p.ok;b.title=p.reason||('Stamina cost: '+p.stamina);b.onclick=()=>action(()=>performInteraction(state,selected(),entry.kind,entry.target));fieldPanel.append(b);}
 for(const entry of [...nearbyCliffClimbs(state,u),...nearbyBoundaryClimbs(state,u)]){const b=document.createElement('button');b.textContent=entry.label+' · '+(combatCosts(state)?entry.cost+' AP':'Free')+(entry.risk?' · '+entry.risk:'');b.disabled=paused()||renderer.busy||!entry.ok;b.title=entry.reason||'Traverse this ledge';b.onclick=()=>action(()=>performTraversal(state,selected(),entry.to));fieldPanel.append(b);}
 $('phase').textContent=(renderer.traversal.preparing?'Preparing ladder motion… · ':'')+`${state.phase==='explore'?'Exploration':state.phase==='player'?'Your turn':state.phase==='enemy'?'Guard turn':state.phase==='won'?'Encounter cleared':'Encounter ended'} · Round ${state.round}`;
 hud.render(state,selectedIds,{blocked:paused()||renderer.busy});
 $('light-exposure').textContent='Light on '+u.name+': '+Math.round(illuminationAt(state,u)*100)+'% · Perception '+(u.perception??50);
 $('selection').textContent=(selectedIds.size>1?selectedIds.size+' selected · ':'')+u.name+' · '+WEAPONS[u.weapon].short;
 $('selection').textContent+=(u.pinned?' · PINNED':'')+(legImpaired(u)?' · Leg wound: movement ×2, −3 AP':'');
 grenadeButton.hidden=!WEAPONS[u.weapon].thrown;grenadeButton.disabled=!canPlanFlame();grenadeButton.textContent='Lob grenade · '+WEAPONS[u.weapon].cost+' AP';
 flameButton.hidden=!WEAPONS[u.weapon].incendiary;flameButton.disabled=!canPlanFlame();flameButton.textContent='Aim flame cone · '+WEAPONS[u.weapon].cost+' AP';
 $('burst-fire').disabled=!burstAvailable(u,WEAPONS);$('burst-label').textContent=dualPistols(u)?'Fire both pistols · −15 accuracy each':'Burst fire';if($('burst-fire').disabled){shotBurst=false;$('burst-fire').checked=false;}
 if(!t&&shotDialog.open)shotDialog.close();
 if(shotDialog.open)renderShotPlanner($('shot-planner'),state,u,t,{zone:shotZone,aim:$('aim-level').value,burst:shotBurst,onSelect:(zone,aim)=>{shotZone=zone;$('aim-level').value=aim;lastUI='';sync();}});
 $('target').textContent=WEAPONS[u.weapon].incendiary?'Aim flame cone, place the template, then confirm. Allies in the spray are also hit.':t?`${t.name} · ${preview.ok?`${shotZone} · ${preview.cost} AP`:preview.reason}`:'Select a visible opponent to inspect a shot.';
 for(const [key,aim] of Object.entries(AIM_LEVELS))$('aim-level').querySelector('[value='+key+']').textContent=aim.label+' · '+shotAim(attackWeapon(u,WEAPONS,shotBurst),key,shotBurst).cost+' AP';
 $('aim-level').disabled=!supportsAim(WEAPONS[u.weapon]);
 $('fire').disabled=paused(true)||renderer.busy||!preview?.ok||!canControl(state,u)||!!state.queue.length;
 const climb=climbPreview(state,u,level);climbButton.hidden=!climb.ok&&!climb.destination;climbButton.textContent=climb.label+(combatCosts(state)?' · '+(climb.cost??3)+' AP':climb.kind==='tower'?' · 30 sec':'');climbButton.textContent+=(climb.risk?' · '+climb.risk:'');climbButton.disabled=paused()||renderer.busy||!climb.ok;climbButton.title=climb.reason||(climb.kind==='roof'?'Climb this roof edge.':climb.kind==='tower'?'Use the stairs or ladder at the gold entrance ring.':'Use this ladder or stair connection.');
 $('reload').textContent=heldWeaponJammed(u)?'Clear jam'+(combatCosts(state)?' · 3 AP':''):'Reload';
 $('reload').disabled=paused()||renderer.busy||!canControl(state,u)||!!state.queue.length||!WEAPONS[u.weapon].mag;
 $('end').disabled=paused()||renderer.busy||state.phase!=='player'||!!state.queue.length;
 $('stop').disabled=(!dialogueOrder.pending&&paused())||!state.queue.length;
 for(const name of Object.keys(STANCES)){const b=$('stance-'+name),group=stanceSelection(state,selectedIds,name);b.setAttribute('aria-pressed',String(group.all));b.disabled=paused()||renderer.busy||!group.ready.length;}
 for(const mode of Object.keys(MOVEMENT_MODES)){const b=$('move-'+mode),group=movementSelection(state,selectedIds,mode);b.setAttribute('aria-pressed',String(group.all));b.disabled=paused()||renderer.busy||!group.ready.length;}
 const group=movementSelection(state,selectedIds,'walk').members,costs=[...new Set(group.map(movementCost))].sort((a,b)=>a-b);
 $('movement-info').textContent=(costs.length?costs.join(' / ')+' AP per straight tile':'No mercs selected')+' · Primary stealth '+effectiveStealth(u)+(u.sneaking?' (+20, capped at 100)':'');
 $('stance-cost').textContent=selectedIds.size+' selected · '+(!combatCosts(state)?'Free stance change':'2 AP per merc changing stance');
 $('log').replaceChildren(...state.log.slice(0,8).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 lastUIDiagnostics=renderer.diagnostics.join('\n');
 if(renderer.diagnostics.length){lastDiagnostic=renderer.diagnostics.at(-1);message(lastDiagnostic);}
 else if(lastDiagnostic){if($('message').textContent===lastDiagnostic)message('Ready.');lastDiagnostic='';}
}
function selectMerc(id,toggle=false){
 if(dialogueUI?.open)return;
 contextMenu.close();pickupOrder.cancel();dialogueOrder.cancel();tileTarget=null;
 const u=state.units.find(u=>u.id===id);if(!u||!selectable(u))return;
 selectedIds=toggle?toggleSelection(selectedIds,id):new Set([id]);state.selected=selectedIds.has(id)?id:[...selectedIds][0];targetId=null;state.queue=[];
 flamePlanner.cancel();grenadePlanner.cancel();
}
function flamePoint(x,y){const lift=unitBaseHeight(selected())-(selected().z||0)*3;return battleFloorPoint(view,x,y,level,lift);}
function grenadePoint(x,y){const hit=renderer.pick(x,y,width,height,level),unit=state.units.find(u=>u.id===hit);if(unit&&unit.hp>0&&(unit.team==='squad'||state.detected.has(unit.id)))return {x:unit.x,y:unit.y,z:unit.z||0,towerPost:unit.towerPost,cliffSupport:unit.cliffSupport};const point=battleFloorPoint(view,x,y,level);return {...point,x:Math.round(point.x),y:Math.round(point.y)};}
function contextChoices(info,merc){
 const u=merc||selected(),free=!paused(true)&&!renderer.busy,ready=free&&canControl(state,u)&&!state.queue.length;
 const entry=(id,label,icon,action,ok=ready,reason='',note='')=>({id,label,icon,action,disabled:!ok,reason:!ok?(reason||(!free?'Finish the current action or resume play.':'This merc cannot act now.')):'',note});
 const entries=[],point=info.point;
 if(merc){
  entries.push(entry('character','Character / inventory','▣',{kind:'character',id:u.id},true));
  entries.push({id:'stance',label:'Stance',icon:'↕',children:Object.keys(STANCES).map(value=>{const p=stanceSelection(state,new Set([u.id]),value);return entry('stance-'+value,({standing:'Stand',kneeling:'Kneel',prone:'Lie prone'})[value],'·',{kind:'stance',value},free&&!!p.ready.length,p.all?'Already in this stance.':'',combatCosts(state)?'2 AP':'Free');})});
  entries.push({id:'movement',label:'Movement mode',icon:'↗',children:Object.keys(MOVEMENT_MODES).map(value=>{const p=movementSelection(state,new Set([u.id]),value);return entry('mode-'+value,value[0].toUpperCase()+value.slice(1),'·',{kind:'mode',value},free&&!!p.ready.length,p.all?'Already using this mode.':'');})});
  entries.push({id:'equipment',label:'Held equipment',icon:'◇',children:[...new Set(['hands',...u.pack.filter(i=>i.type==='weapon').map(i=>i.kind)])].map(weapon=>{const cost=equipCost(state,u,weapon);return entry('equip-'+weapon,WEAPONS[weapon].name,'·',{kind:'equip',weapon},ready&&u.weapon!==weapon&&u.ap>=cost,u.weapon===weapon?'Already held.':u.ap<cost?'Needs '+cost+' AP; '+u.ap+' available.':'',cost?cost+' AP':'Free');})});
  const w=WEAPONS[u.weapon],jam=heldWeaponJammed(u),canReload=jam||w.mag&&u.ammo[u.weapon]<w.mag&&reserve(u,u.weapon,state)>0;
  entries.push(entry('reload',jam?'Clear jam':'Reload','↻',{kind:'reload'},ready&&canReload&&(!combatCosts(state)||u.ap>=3),!canReload?'Magazine full or no matching ammunition.':'',combatCosts(state)?'3 AP':''));
  const interactions=nearbyInteractions(state,u).map(e=>entry('interact-'+e.kind,e.label,'✚',{kind:'interact',entry:e},free&&e.preview.ok,e.preview.reason,e.preview.cost?e.preview.cost+' AP':'1 minute'));
  const climb=climbPreview(state,u,level);if(climb.destination)interactions.push(entry('climb',climb.label,'↟',{kind:'climb'},ready&&climb.ok,climb.reason,[combatCosts(state)?climb.cost+' AP':'',climb.risk].filter(Boolean).join(' · ')));
  for(const e of [...nearbyCliffClimbs(state,u),...nearbyBoundaryClimbs(state,u)])interactions.push(entry('cliff-'+e.kind+'-'+e.to.x+'-'+e.to.y,e.label,'↟',{kind:'cliff',point:e.to},free&&e.ok,e.reason,(combatCosts(state)?e.cost+' AP':'Free')+(e.risk?' · '+e.risk:'')));
  entries.push(...interactions);
  if(state.queue.length)entries.push(entry('stop','Stop movement','■',{kind:'stop'},free));
 }else{
  const warning=walkingWarning(walkingRoutes({...state,queue:[]},[...selectedIds],u,point));
  entries.push(entry('move','Move here',warning?'⚠':'↗',{kind:'move',point},free&&canControl(state,u),'',warning));
  const facing=bearingOffset(u,point)<1e-8;
  entries.push(entry('face','Face this direction','↻',{kind:'face',point},ready&&!facing,facing?'Already facing this direction.':'','Free · '+u.name));
  entries.push(entry('ground-shot','Shoot at this tile','⊕',{kind:'ground-shot',point},ready&&!!WEAPONS[u.weapon].mag,!WEAPONS[u.weapon].mag?'Equip a firearm or area weapon.':'','Plan with '+WEAPONS[u.weapon].name));
 }
 if(!merc)for(const target of info.props||[])if(tutorialObjective(target)&&intactSite(target)){const p=interactionPreview(state,u,'plant-explosives',target);entries.push(entry('plant-explosives','Plant explosives','*',{kind:'interact',entry:{kind:'plant-explosives',target}},free&&p.ok,p.reason,(p.cost?p.cost+' AP':'1 minute')+' / uses 1 charge'));}
 if(info.loot.length){
  const picks=info.loot.map((pile,i)=>{const p=pickupRoute(state,u,pile),warning=walkingWarning([{name:u.name,hazards:walkingHazards(state,p.path||[])}]),note=p.cost?'Approach: '+p.cost+' AP'+(combatCosts(state)&&p.cost>u.ap?' · exceeds current AP':''):'Open nearby inventory';return entry('pickup-'+i,pile.container?.name||(pile.body===undefined?'Pick up items':'Search body'),warning?'⚠':'▤',{kind:'pickup',pile},free&&p.ok,p.reason,[warning,note].filter(Boolean).join(' · '));});
  if(picks.length===1)entries.push(picks[0]);else entries.push({id:'items',label:'Items on this tile',icon:'▤',children:picks});
 }
 return entries;
}
function openGroundAim(point){
 if(!canPlanFlame())return;targetId=null;pickupOrder.cancel();dialogueOrder.cancel();
 if(WEAPONS[selected().weapon].thrown){grenadePlanner.start(state,selected(),point);return;}
 if(WEAPONS[selected().weapon].incendiary){flamePlanner.start(state,selected(),point);return;}
 tileTarget={...groundTarget(point),name:inspectBattleTile(state,point)?.location||'Terrain'};shotZone='torso';shotDialog.showModal();frameClock.reset();lastUI='';sync();
}
function runContextAction(a){
 if(!a)return;
 if(a.kind==='character'){pickupOrder.cancel();dialogueOrder.cancel();characterScreen.show(a.id);return;}
 if(a.kind==='ground-shot'){openGroundAim(a.point);return;}
 if(a.kind==='stance'){$('stance-'+a.value).click();return;}
 if(a.kind==='mode'){$('move-'+a.value).click();return;}
 if(a.kind==='climb'){climbButton.click();return;}
 if(a.kind==='stop'){$('stop').click();return;}
 if(a.kind==='pickup'){
  if(paused()||renderer.busy)return;dialogueOrder.cancel();const p=pickupOrder.start(state,selected(),a.pile);message(p.ok?'Approaching items. The inventory will open when close enough.':p.reason);sync();return;
 }
 action(()=>{if(a.kind==='equip')return equip(state,selected(),a.weapon);if(a.kind==='reload')return reload(state,selected());if(a.kind==='interact')return performInteraction(state,selected(),a.entry.kind,a.entry.target);
  if(a.kind==='cliff')return performTraversal(state,selected(),a.point);
  if(a.kind==='face')return turnTo(state,selected(),headingTo(selected(),a.point));
  if(a.kind==='move')return selectedIds.size>1?moveGroup(state,[...selectedIds],selected(),a.point.x,a.point.y,a.point.z):move(state,selected(),a.point.x,a.point.y,a.point.z);return false;});
}
canvas.addEventListener('contextmenu',e=>{
 e.preventDefault();if(dialogueUI.open){dialogueUI.refresh();return;}if(storageBusy||characterScreen.open||savePanel.open||shotDialog.open)return;
 const b=canvas.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top,hit=renderer.pick(x,y,width,height,level),unit=state.units.find(u=>u.id===hit),pile=renderer.pickLoot(x,y,width,height,level);
 const scenery=renderer.pickScenery(x,y,width,height,level),site=scenery?.structure&&state.props.find(p=>siteId(p)===scenery.id);
 const point=unit?{x:unit.x,y:unit.y,z:unit.z||0,towerPost:unit.towerPost,cliffSupport:unit.cliffSupport}:pile||battleFloorPoint(view,x,y,level),info=inspectBattleTile(state,point);if(!info)return;
 // A tall model can project beyond its footprint. Keep the clicked ground tile
 // for movement, while offering actions on the actual visible structure.
 if(!unit&&site&&!info.props.includes(site)){info.props.push(site);info.objects.push(scenery.name);}
 drag=null;clearHover();renderer.wallXray.setPointer(null,null);flamePlanner.cancel();grenadePlanner.cancel();
 if(unit?.team!=='squad'&&unit?.character?.canTalk&&state.detected.has(unit.id)){
  contextMenu.close();closeStances();if(renderer.busy){message('Finish the current action first.');return;}
  pickupOrder.cancel();dialogueOrder.cancel();state.queue=[];dialogueUI.unlock();
  const order=dialogueOrder.start(state,selected(),unit);
  message(order.ok?(order.path.length?(order.partial?order.reason:'Walking into talking range.')+' Escape cancels.'+(userPaused?' Resume to continue.':''):''):order.reason);
  if(order.ok)updateDialogueOrder();sync();return;
 }
 const merc=unit?.team==='squad'?unit:null;if(merc&&selectable(merc)){if(merc.id!==state.selected)selectMerc(merc.id);else selectedIds=new Set([merc.id]);}
 contextMenu.show({title:merc?merc.name:info.title,location:info.location,detail:merc?mercStatus(merc):info.objects.join(' · '),entries:contextChoices(info,merc)},e.clientX,e.clientY);
});
function updateDialogueOrder(){
 if(!dialogueOrder.pending)return;
 const u=state.units.find(u=>u.id===dialogueOrder.pending.id),sample=u&&renderer.motion.sample(u),walking=sample&&Math.hypot(sample.x-u.x,sample.y-u.y)>.03;
 const result=dialogueOrder.update(state,{busy:renderer.busy||walking});
 if(result?.ready){targetId=null;tileTarget=null;selectedIds=new Set([result.speaker.id]);message('');dialogueUI.show(result.npc,result.speaker);}
 else if(result?.stopped)message(result.reason);
}
function click(x,y,shift=false){
 pickupOrder.cancel();dialogueOrder.cancel();tileTarget=null;
 if(overviewMode){const p=battleFloorPoint(view,x,y,level);focus(p.x,p.y);return;}
 if(grenadePlanner.open){if(!shift&&canPlanFlame())grenadePlanner.aim(grenadePoint(x,y),true);return;}
 if(flamePlanner.open){if(!shift&&canPlanFlame())flamePlanner.aim(flamePoint(x,y),true);return;}
 const hit=renderer.pick(x,y,width,height,level,{selectBody:true});
 if(hit!==null){const u=state.units.find(u=>u.id===hit);if(selectable(u)){selectMerc(u.id,shift);}else if(u.hp<=0&&nearbyLoot(state,selected()).some(p=>p.body===u.id)){characterScreen.show(state.selected);}else if(state.detected.has(u.id)&&u.hp>0){if(WEAPONS[selected().weapon].thrown){if(canPlanFlame())grenadePlanner.start(state,selected(),{x:u.x,y:u.y,z:u.z||0,towerPost:u.towerPost,cliffSupport:u.cliffSupport});}else if(WEAPONS[selected().weapon].incendiary){if(canPlanFlame())flamePlanner.start(state,selected(),{x:u.x,y:u.y,z:u.z||0});}else{targetId=u.id;shotDialog.showModal();frameClock.reset();lastUI='';}}sync();return;}
 const pile=renderer.pickLoot(x,y,width,height,level);if(pile){if(nearbyLoot(state,selected()).includes(pile))characterScreen.show(state.selected);else message('Move beside the supplies to pick them up.');return;}
 const barrel=renderer.pickScenery(x,y,width,height,level);
 if(barrel){if(WEAPONS[selected().weapon].thrown){if(canPlanFlame())grenadePlanner.start(state,selected(),barrel);}else if(WEAPONS[selected().weapon].incendiary){if(canPlanFlame())flamePlanner.start(state,selected(),barrel);}else{targetId=barrel.id;shotZone='torso';shotDialog.showModal();frameClock.reset();lastUI='';}sync();return;}
 if(paused()||renderer.busy||shift)return;
 const door=renderer.pickDoor(x,y,width,height,level);
 if(door){const u=selected(),cells=edgeCells(door),beside=cells.some(p=>p.x===u.x&&p.y===u.y&&p.z===(u.z||0));
  if(!beside||u.towerPost){message('Stand beside this door on the same floor to use it.');return;}
  if(state.edgeLocks?.[door]){message('Door locked. Use Pick lock or Force door in the action panel.');return;}
  const to=cells.find(p=>p.x!==u.x||p.y!==u.y);const ok=move(state,u,to.x,to.y,to.z);message(ok?'Moving through the door.':'Door route unavailable. Check AP, stamina and the other side.');sync();return;
 }
 const point=battleFloorPoint(view,x,y,level),tx=Math.round(point.x),ty=Math.round(point.y);
 if(selectedIds.size>1?moveGroup(state,[...selectedIds],selected(),tx,ty,level):move(state,selected(),tx,ty,level)){targetId=null;message('');}else message('Cannot move there now. Check the route, floor, AP and stamina. Walk or catch your breath if exhausted.');sync();
}
let hoverPointer=null,lastHoverCheck=0;
function clearHover(){hoverPointer=null;delete canvas.dataset.targetCursor;}
function updateTargetCursor(now){
 if(contextMenu.open){delete canvas.dataset.targetCursor;return;}
 if(grenadePlanner.open){canvas.dataset.targetCursor='grenade';return;}
 if(flamePlanner.open){canvas.dataset.targetCursor='flame';return;}
 if(!hoverPointer||shotDialog.open||overviewMode||drag?.moved){delete canvas.dataset.targetCursor;return;}
 if(now-lastHoverCheck<80)return;lastHoverCheck=now;
 const bounds=canvas.getBoundingClientRect(),x=hoverPointer.x-bounds.left,y=hoverPointer.y-bounds.top;
 const id=renderer.pick(x,y,width,height,level),guard=state.units.find(u=>u.id===id);
 if(guard?.team==='guard'&&guard.hp>0&&!guard.away&&state.detected.has(guard.id))canvas.dataset.targetCursor=canAimAt(state,selected(),guard)?'red':'grey';
 else{const barrel=id===null?renderer.pickScenery(x,y,width,height,level):null;if(barrel)canvas.dataset.targetCursor=(barrel.structure?previewAttack(state,selected(),barrel).ok:barrelSight(state,selected(),barrel))?'red':'grey';else delete canvas.dataset.targetCursor;}
}
let walkingCacheKey='',walkingCache=[];
function showWalkingWarning(text=''){const el=$('movement-warning');if(el.textContent!==text)el.textContent=text;el.hidden=!text;}
let showGuardCones=true;const coneGeometry=new MapGeometryCache(()=>new Map());
$('guard-cones').onclick=()=>{showGuardCones=!showGuardCones;$('guard-cones').textContent='Guard cones: '+(showGuardCones?'On':'Off');$('guard-cones').setAttribute('aria-pressed',String(showGuardCones));};
function showGuardSight(now){
 if(!showGuardCones||overviewMode)return;
 const coneCache=coneGeometry.get(state);
 const guards=visibleConeGuards(state,level),cones=[];
 for(const u of guards){const key=JSON.stringify([u.x,u.y,u.z,u.heading,u.cone,u.species,u.stance,u.towerPost,u.towerElevation,u.cliffSupport]);let entry=coneCache.get(u.id);if(!entry||entry.key!==key){entry={key,points:guardCone(state,u)};coneCache.set(u.id,entry);}cones.push(entry.points);}
 drawGuardCones(ctx,cones,project);
}
function showWalkingRoute(){
 if(overviewMode||dialogueUI.open||shotDialog.open||flamePlanner.open||grenadePlanner.open||characterScreen.open||savePanel.open||drag?.moved){walkingCacheKey='';walkingCache=[];showWalkingWarning();return;}
 let goal=null;
 if(hoverPointer&&!contextMenu.open&&!canvas.dataset.targetCursor){const bounds=canvas.getBoundingClientRect(),p=battleFloorPoint(view,hoverPointer.x-bounds.left,hoverPointer.y-bounds.top,level);goal={x:Math.round(p.x),y:Math.round(p.y),z:level};}
 const key=JSON.stringify([state.revision,state.phase,state.selected,level,[...selectedIds],goal,state.queue,state.fires,state.units.filter(u=>selectedIds.has(u.id)).map(u=>[u.x,u.y,u.z,u.ap,u.stance,u.running,u.sneaking,u.legWound])]);
 if(key!==walkingCacheKey){walkingCacheKey=key;walkingCache=walkingRoutes(state,[...selectedIds],selected(),goal);}
 drawFoliageHover(ctx,{...state,concealedInteriors:renderer.interiorFog?.hidden},goal,project,level);
 showWalkingWarning(walkingWarning(walkingCache));
 drawWalkingRoutes(ctx,walkingCache,project,level,view.zoom,turnBased(state));
}
canvas.addEventListener('pointerdown',e=>{if(e.button!==0||drag)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false,select:e.shiftKey,toggle:selectionModifier(e)};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{hoverPointer={x:e.clientX,y:e.clientY};lastHoverCheck=0;const bounds=canvas.getBoundingClientRect();renderer.wallXray.setPointer(e.clientX-bounds.left,e.clientY-bounds.top);if(grenadePlanner.open&&!drag)grenadePlanner.aim(grenadePoint(e.clientX-bounds.left,e.clientY-bounds.top));if(flamePlanner.open&&!drag)flamePlanner.aim(flamePoint(e.clientX-bounds.left,e.clientY-bounds.top));if(!drag||drag.id!==e.pointerId)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)drag.moved=true;if(drag.moved&&!drag.select){view.x+=e.clientX-drag.lastX;view.y+=e.clientY-drag.lastY;}drag.lastX=e.clientX;drag.lastY=e.clientY;});
canvas.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);const r=canvas.getBoundingClientRect();if(d.select&&d.moved){const ids=rectangleMembers(state.units,level,{x:d.x-r.left,y:d.y-r.top},{x:e.clientX-r.left,y:e.clientY-r.top},u=>project(renderer.displayUnit(u)));if(ids.length){selectedIds=new Set(ids);if(!selectedIds.has(state.selected))state.selected=ids[0];targetId=null;state.queue=[];message(ids.length+' mercs selected. Ground clicks move the group; stance buttons affect the group; Fire and Reload use the primary merc.');sync();}else message('No mercs in that rectangle.');}else if(!d.moved)click(e.clientX-r.left,e.clientY-r.top,d.toggle);});
canvas.addEventListener('pointerleave',()=>{clearHover();renderer.wallXray.setPointer(null,null);});
canvas.addEventListener('pointercancel',()=>{clearHover();drag=null;renderer.wallXray.setPointer(null,null);});
canvas.addEventListener('lostpointercapture',()=>{drag=null;});
window.addEventListener('blur',()=>{clearHover();drag=null;renderer.wallXray.setPointer(null,null);});
canvas.addEventListener('wheel',e=>{e.preventDefault();const box=canvas.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top,old=view.zoom;view.zoom=Math.max(.08,Math.min(3,old*Math.exp(-e.deltaY*.001)));view.x=x-(x-view.x)*view.zoom/old;view.y=y-(y-view.y)*view.zoom/old;},{passive:false});
function cancelMovementOrders(){const talking=!!dialogueOrder.pending;pickupOrder.cancel();dialogueOrder.cancel();state.queue=[];if(talking)message('Conversation approach cancelled.');}
document.addEventListener('keydown',e=>{if(e.defaultPrevented||dialogueUI.open||sectorLoading.active||characterScreen.open||savePanel.open)return;if(e.key==='Escape'&&grenadePlanner.open){e.preventDefault();grenadePlanner.cancel();return;}if(e.key==='Escape'&&flamePlanner.open){e.preventDefault();flamePlanner.cancel();return;}if(e.key==='Escape'&&(!paused()||dialogueOrder.pending)){cancelMovementOrders();drag=null;targetId=null;tileTarget=null;sync();}});
document.addEventListener('keydown',e=>{
 if(contextMenu.open||e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||e.isComposing||characterScreen.open||savePanel.open||document.hidden||e.target.isContentEditable||e.target.closest?.('input,select,textarea,[role="textbox"],#stance-menu,#command-drawer')||document.querySelector('dialog[open]'))return;
 if(/^[1-9]$/.test(e.key)&&+e.key<=LEVELS){e.preventDefault();document.querySelector(`#battle-levels [data-level="${+e.key-1}"]`).click();return;}
 if(['q','e'].includes(e.key.toLowerCase())){e.preventDefault();if(!e.repeat&&!drag){rotateBattleView(view,e.key.toLowerCase()==='q'?-1:1,width,height,level);clearHover();renderer.wallXray.setPointer(null,null);}return;}
 const delta={w:[0,40],ArrowUp:[0,40],s:[0,-40],ArrowDown:[0,-40],a:[40,0],ArrowLeft:[40,0],d:[-40,0],ArrowRight:[-40,0]}[e.key.length===1?e.key.toLowerCase():e.key];
 if(!delta)return;e.preventDefault();view.x+=delta[0];view.y+=delta[1];
});
function action(fn){if(paused()||renderer.busy)return;pickupOrder.cancel();dialogueOrder.cancel();const ok=fn();renderer.captureCombat(state,{paused:paused()});message(ok?'':'Action unavailable.');sync();}
 for(const name of Object.keys(STANCES))$('stance-'+name).onclick=()=>{if(paused()||renderer.busy)return;const result=setSelectionStance(state,selectedIds,name);message(result.changed.length+' merc'+(result.changed.length===1?'':'s')+' changed to '+name+'.'+(result.skipped.length?' Could not change: '+result.skipped.join(', ')+'. Check AP and action availability.':''));closeStances(true);sync();};
 for(const mode of Object.keys(MOVEMENT_MODES))$('move-'+mode).onclick=()=>{if(paused()||renderer.busy)return;const result=setSelectionMovement(state,selectedIds,mode);message(result.changed.length+' merc'+(result.changed.length===1?'':'s')+' set to '+mode+'.'+(result.skipped.length?' Could not change: '+result.skipped.join(', ')+'.':''));sync();};
 $('character').onclick=()=>characterScreen.show(state.selected);
 $('save-load').onclick=()=>savePanel.show();$('quicksave').onclick=quickSave;$('quickload').onclick=quickLoad;
 document.addEventListener('keydown',e=>{if(dialogueUI.open||sectorLoading.active||characterScreen.open||savePanel.open||e.target.closest?.('input,select,textarea'))return;if(e.key==='F6'||e.key==='F9'){e.preventDefault();(e.key==='F6'?quickSave:quickLoad)();}});
 $('battle-menu').onclick=async e=>{e.preventDefault();const href=e.currentTarget.href;try{await saveGame('auto');location.href=href;}catch(error){message('Could not save before leaving: '+error.message);}};
 $('restart').onclick=async()=>{try{await saveGame('auto');await sectorLoading.run(async()=>{restart();await prepareView();},{message:'Restarting sector'});}catch(e){message('Could not restart the sector. '+e.message);}};$('center').onclick=center;$('overview').onclick=overview;
 $('reload').onclick=()=>action(()=>reload(state,selected()));$('end').onclick=()=>action(()=>endTurn(state));
 climbButton.onclick=()=>action(()=>{const preview=climbPreview(state,selected(),level),ok=performClimb(state,selected(),level);if(ok&&preview.kind!=='tower'){level=preview.destination.z;$('floor').value=level;}return ok;});
 $('burst-fire').onchange=()=>{shotBurst=$('burst-fire').checked;lastUI='';sync();};
 $('aim-level').onchange=()=>{lastUI='';sync();};
 $('shot-close').onclick=()=>shotDialog.close();
 shotDialog.addEventListener('close',()=>{frameClock.reset();lastUI='';sync();});
 $('fire').onclick=()=>{shotDialog.close();action(()=>{const t=target();return t&&attack(state,selected(),t,shotBurst,false,shotZone,false,$('aim-level').value);});};
 $('stop').onclick=()=>{if(paused()&&!dialogueOrder.pending)return;cancelMovementOrders();sync();};$('floor').onchange=()=>{contextMenu.close();tileTarget=null;level=+$('floor').value;clearHover();targetId=null;drag=null;flamePlanner.cancel();sync();};
 for(const b of document.querySelectorAll('#battle-levels [data-level]'))b.onclick=()=>{$('floor').value=b.dataset.level;$('floor').dispatchEvent(new Event('change'));};
$('pause').onclick=()=>{userPaused=!userPaused;frameClock.reset();sync();};
document.addEventListener('visibilitychange',()=>{renderer.wallXray.setPointer(null,null);renderer.audio?.setPaused(paused());frameClock.reset();sync();if(document.hidden&&!dialogueUI.open&&!storageBusy&&!autoDisabled&&autosaveSchedule.due(state,performance.now(),{hidden:true}))autosave();});
window.addEventListener('pageshow',()=>frameClock.reset());
function prepareDialogueResources(){
 const owner=campaign?.campaign||state,d=initializeDialogue(owner);
 for(const p of [...(state.definition.starts||[]),...(state.definition.guards||[])])if(p.character?.canTalk&&p.character.dialogueRef){try{pinDialogue(d,resolveDialogue(state.definition,d,p.character.dialogueRef,dialogueCatalog));}catch{/* Missing author resources are reported in the conversation, never replaced by a guessed line. */}}
}
dialogueUI=createBattleDialogue({catalog:dialogueCatalog,source:()=>({state,campaign:campaign?.campaign,dialogue:(campaign?.campaign||state).dialogue,busy:renderer?.busy}),
 onChange:()=>{frameClock.reset();lastUI='';},onLoadLatest:()=>loadGame(campaign?'continue':'auto').catch(e=>message(e.message)),
 commit:async(next,expected)=>{
  if(storageBusy)throw Error('A checkpoint is already in progress.');storageBusy=true;frameClock.reset();
  try{if(campaign){state=await campaign.commitDialogue(expected,next);definition=state.definition;}else{
    if(autoTokenError){autoToken=saveToken(await getSave('auto'));autoTokenError=null;}if(state.dialogue.revision!==expected)throw Error('The conversation changed. Review it again.');
    const candidate={...state,dialogue:next},saved=await checkpointSave('auto',captureEncounter(candidate),autoToken);autoToken=saveToken(saved);state.dialogue=next;
   }autosaveSchedule.reset(state,performance.now());autoDisabled=false;
  }finally{storageBusy=false;frameClock.reset();lastUI='';}
 }});
new ResizeObserver(resize).observe(canvas);resize();if(initialState)installState(initialState);else restart();
if(campaign)campaign.mount({changed:()=>{lastUI='';frameClock.reset();sync();},failure:e=>{userPaused=true;message('Campaign checkpoint failed: '+e.message+' Use Save / Load to retry.');}});
if(new URLSearchParams(location.search).get('view')==='overview')overview();
let lastWorldSize="";
function frame(now){
 try{
  defeatFlow.tick(state,now,{suspended:document.hidden||savePanel.open,busy:storageBusy||campaign?.busy});
  renderer.audio?.setPaused(paused());
  const elapsed=frameClock.sample(now,{paused:paused(),mode:turnBased(state)});presentationTime+=elapsed;renderer.presentationNow=presentationTime;tickEncounterClock(state,elapsed,{paused:paused()||renderer.traversal.busy});syncClock();
  if(!paused()&&!renderer.busy&&presentationTime-lastStep>stepDelay){lastStep=presentationTime;stepDelay=queuedMovementDuration(state);if(state.queue.length)stepMovement(state);else if(state.phase==='enemy')stepEnemy(state);else if(['explore','won'].includes(state.phase))stepInvestigation(state);renderer.captureCombat(state);sync();}
  // Dialogue owns its own portrait clock. Keep the last world frame while it is open.
  if(!dialogueUI.open||lastWorldSize!==width+"x"+height){
  lastWorldSize=width+"x"+height;
  renderer.foliageSelectedIds=selectedIds;renderer.foliageRoutes=walkingCache;ctx.clearRect(0,0,width,height);picks=renderer.draw(ctx,state,view,width,height,level);if(renderer.impactDebug.consumePause()){userPaused=true;frameClock.reset();syncClock();lastUI='';sync();}updateTargetCursor(now);showGuardSight(now);showWalkingRoute();if(!overviewMode){flamePlanner.draw(ctx,state,project,view.zoom);grenadePlanner.draw(ctx,state,project,view.zoom);}
  if(!paused()&&dialogueOrder.pending)updateDialogueOrder();
  if(!paused()&&pickupOrder.pending){const u=state.units.find(u=>u.id===pickupOrder.pending.id),sample=u&&renderer.motion.sample(u),walking=sample&&Math.hypot(sample.x-u.x,sample.y-u.y)>.03;const result=pickupOrder.update(state,{busy:renderer.busy||walking});if(result?.ready)characterScreen.show(result.id,{pile:result.pile});else if(result?.stopped)message(result.reason);}
  if(lastLadderPreparing!==renderer.traversal.preparing||lastUIBusy!==renderer.busy||lastUIDiagnostics!==renderer.diagnostics.join('\n')){lastLadderPreparing=renderer.traversal.preparing;lastUIBusy=renderer.busy;sync();}
  for(const u of state.units.filter(v=>v.team==='squad'&&alive(v)&&(v.z||0)===level)){
   const p=project(renderer.displayUnit(u));ctx.strokeStyle=selectedIds.has(u.id)?'#ffe3a0':'#a4d4c2';ctx.lineWidth=u.id===state.selected?2:1;ctx.beginPath();ctx.ellipse(p.x,p.y,17*view.zoom,8*view.zoom,0,0,Math.PI*2);ctx.stroke();
  }
  for(const u of state.units.filter(v=>v.team==='squad'&&v.hp<=0&&!v.away&&!['captured','quit'].includes(v.casualty)&&(v.z||0)===level)){const p=project(u);ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillStyle=u.casualty==='bleeding'?'#ffc0a0':u.casualty==='stable'?'#bce1cc':'#d1cbc2';ctx.strokeStyle='#172520';ctx.lineWidth=3;const label=mercStatus(u);ctx.strokeText(label,p.x,p.y+22);ctx.fillText(label,p.x,p.y+22);}
  for(const [id,point] of Object.entries({...state.contacts,...state.glimpses}))if(!state.detected.has(+id)&&(point.z||0)===level){const p=project(point);ctx.font='bold 18px system-ui';ctx.textAlign='center';ctx.fillStyle=state.glimpses[id]?'#f5d480':'#aaa58c';ctx.strokeStyle='#172520';ctx.lineWidth=3;ctx.strokeText('?',p.x,p.y-12);ctx.fillText('?',p.x,p.y-12);}
  if(target()){const t=target(),p=project(t.ground||t.barrel||t.structure?t:renderer.displayUnit(t));ctx.strokeStyle='#ff9b80';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y,18*view.zoom,9*view.zoom,0,0,Math.PI*2);ctx.stroke();}
  if(drag?.select&&drag.moved){const r=canvas.getBoundingClientRect();ctx.fillStyle='#f2cc8325';ctx.strokeStyle='#f2cc83';ctx.lineWidth=1.5;ctx.fillRect(drag.x-r.left,drag.y-r.top,drag.lastX-drag.x,drag.lastY-drag.y);ctx.strokeRect(drag.x-r.left,drag.y-r.top,drag.lastX-drag.x,drag.lastY-drag.y);}
  }
  if(!defeatFlow.active&&!paused()&&!autoDisabled&&!storageBusy&&autosaveSchedule.due(state,performance.now()))autosave();
  requestAnimationFrame(frame);
 }catch(error){message('Encounter stopped: '+error.message);console.error(error);}
}
// Read-only inspection hooks for browser regression checks.
window.battle3d={get state(){return state;},get level(){return level;},get renderer(){return renderer;},get clock(){return state.clock;},get paused(){return paused();},get picks(){return picks;},get walkingPreview(){return walkingCache;},get flamePreview(){return flamePlanner.preview;},get grenadePreview(){return grenadePlanner.preview;},get dialogue(){return dialogueUI;},get contextMenu(){return contextMenu;},get pickupOrder(){return pickupOrder.pending;},get selectedIds(){return [...selectedIds];},project,view};
await prepareView();
if(new URLSearchParams(location.search).get('study')==='tree-cover'){const {installFoliagePerformanceReview}=await import('./foliage-performance-review.js');installFoliagePerformanceReview(window.battle3d);}
document.addEventListener('sector-ready',()=>{frameClock.reset();lastUI='';sync();});
requestAnimationFrame(frame);

if(new URLSearchParams(location.search).get('study')==='factory-machines'){const {installFactoryMachineReview}=await import('./factory-machine-review.js');installFactoryMachineReview(window.battle3d);}
