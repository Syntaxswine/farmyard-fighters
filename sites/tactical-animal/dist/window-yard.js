import {createSoloGame,DEFAULT_BUILD,hero,Core,tick,encodeSave,decodeSave} from './solo-game.js';
import {FieldView} from './field-view.js';
import {fireModesFor} from './realtime-combat.js';
import {bindHeldTrigger} from './mobile-controls.js';
const $=id=>document.getElementById(id),slot='farmyard-window-review-save',authored=new URLSearchParams(location.search).has('authored');
let state,view,target,mode='shot',input={x:0,y:0},previous=performance.now(),raf,closed=false,holdingFire=false;
const message=text=>$('message').textContent=text;
function start(saved){
  cancelFireHold();view?.dispose();view=null;state=null;target=null;mode='shot';input={x:0,y:0};
  try{const source=authored?JSON.parse(localStorage.getItem('farmyard-window-authored-map')):undefined;if(authored&&!source)throw Error('Open the map from Playtest map in the designer.');state=saved||createSoloGame({...DEFAULT_BUILD,primary:$('weapon').value,utility:'grenade'},1,'window-yard',{authoredMap:source});
    if(new URLSearchParams(location.search).get('rules')!=='turn-based')Core.enableRealtime(state);view=new FieldView($('viewport'),{onPick:pick,aimAtWall:()=>mode==='shot',onLoading:busy=>$('loading').hidden=!busy,onError:message});view.setGame(state);view.windowEffects.muted=$('mute').checked;for(const id of ['save','turn','reload','grenade','center','cancel'])$(id).disabled=false;$('loading').textContent='Preparing the field…';message(state.realtime?'Tap a wall, glass, or a guard to aim.':'Tap glass or a guard to aim. Plain panes span the whole window; divided panes break independently.');render();
  }catch(e){for(const id of ['save','turn','reload','grenade','center','cancel','fire','burst'])$(id).disabled=true;$('loading').hidden=false;$('loading').textContent=e.message;message('The field could not be opened. Check the map in the designer, or retry in a browser with WebGL.');}
}
function preview(burst=false){
  const u=hero(state);if(!target)return null;
  if(mode==='grenade')return Core.previewGrenade(state,u,target);
  if(u.weapon==='flamethrower')return Core.previewFlame(state,u,Core.headingTo(u,target));
  return Core.previewAttack(state,u,target,burst);
}
function render(){
  if(!state)return;
  const u=hero(state),rt=Core.realtimeStatus(state),fireMode=rt?.fireMode??'single',p=preview(fireMode==='burst');
  $('fire-mode-label').hidden=!rt||mode!=='shot'||fireModesFor(u.weapon).length===1;
  $('fire-mode').value=fireMode;$('fire-mode').disabled=holdingFire;
  $('fire').disabled=!holdingFire&&!p?.ok;
  $('fire').textContent=mode==='grenade'?'Throw':u.weapon==='flamethrower'?'Fire cone':fireMode==='auto'?'Hold to fire':fireMode==='burst'?'Fire burst':'Fire';
  $('burst').hidden=!!rt;
  $('burst').disabled=!!rt||mode!=='shot'||!Core.WEAPONS[u.weapon].burstRounds||!preview(true)?.ok;
  $('turn').disabled=!rt&&state.phase!=='player';
  if(rt){
    $('turn').textContent='Fire at Will';
    $('turn').setAttribute('aria-pressed',String(rt.autoFire));
    $('status').textContent=`Real time · ${rt.ammo} rounds · ${rt.reloading?'reloading':holdingFire?'trigger held':'ready'}`;
  }else $('status').textContent=`${state.phase} · ${u.ap.toFixed(1)} AP · ${u.ammo[u.weapon]??0} rounds · ${Object.values(state.windowBreaks||{}).flat().length} panes broken`;
  if(target){
    if(mode==='grenade')view?.previewGrenade(target,p);
    else if(u.weapon==='flamethrower')view?.previewFlame(Core.headingTo(u,target),p);
  }
}
function pick(p){cancelFireHold();if(!Core.canControl(state,hero(state)))return;view.unlockSound();
  if(mode==='grenade'){target=p;Core.stop(state);message(Core.previewGrenade(state,hero(state),p).reason||'Grenade aimed. Throw to confirm.');}
  else if(p.barrelId){target={...p,name:'Explosive barrel'};Core.stop(state);message('Explosive barrel targeted. Fire to confirm.');}
  else if(p.windowId){target={...p,name:p.paneId?'Glass pane':'Window frame'};Core.stop(state);message(`${target.name}: ${p.windowId}${p.paneId?' / '+p.paneId:''}. Fire to confirm.`);}
  else if(p.wallEdge){target={...p,name:'Wall'};Core.stop(state);message('Wall aimed. Fire to confirm.');}
  else if(p.unitId!==undefined&&p.unitId!==0){target=state.units.find(u=>u.id===p.unitId);Core.stop(state);message('Target: '+target.name);}
  else if(Number.isFinite(p.x)){target=null;const path=Core.navigationPath(state,hero(state),p.x,p.y);if(path){Core.move(state,hero(state),p.x,p.y);view.route(path);}else message('No clear walking route. Broken windows keep the existing wall passage rule.');}
  render();
}
function clearAim(){target=null;mode='shot';view?.route([]);}
function fire(fireMode=false){
  if(!target)return;
  view.unlockSound();const u=hero(state);
  const ok=mode==='grenade'?Core.throwGrenade(state,u,target):u.weapon==='flamethrower'?Core.fireFlame(state,u,Core.headingTo(u,target)):Core.attack(state,u,target,fireMode);
  message(ok?state.log[0]:preview(fireMode===true||fireMode==='burst')?.reason||'Shot unavailable');
  if(ok)clearAim();render();
}
const cancelFireHold=bindHeldTrigger($('fire'),{
  press:()=>{
    if(!state?.realtime||!target||mode!=='shot'||Core.realtimeStatus(state).fireMode!=='auto')return false;
    holdingFire=Core.pressRealtimeTrigger(state,hero(state),target);
    if(holdingFire)view.unlockSound();
    return holdingFire;
  },
  release:commit=>{
    holdingFire=false;Core.releaseRealtimeTrigger(state,commit);
    if(commit)clearAim();render();
  },
  tap:()=>fire(Core.realtimeStatus(state)?.fireMode??false)
});
$('fire-mode').onchange=()=>{Core.configureRealtime(state,{fireMode:$('fire-mode').value});render();};
$('burst').onclick=()=>fire(true);$('new').onclick=()=>start();$('weapon').onchange=()=>start();
$('save').onclick=()=>{try{localStorage.setItem(slot,encodeSave(state));message('Review saved. Broken panes are saved; transient shards and sound are not.');}catch(e){message(e.message);}};
$('restore').onclick=()=>{try{const saved=localStorage.getItem(slot);if(!saved)throw Error('Save a review first.');start(decodeSave(saved));message('Review restored. Broken panes stay open without replaying the effect.');}catch(e){message(e.message);}};
$('turn').onclick=()=>{cancelFireHold();if(state.realtime)Core.configureRealtime(state,{autoFire:!state.realtime.autoFire});else Core.endTurn(state);target=null;render();};$('reload').onclick=()=>{cancelFireHold();Core.reload(state,hero(state));render();};$('center').onclick=()=>view?.center();
$('grenade').onclick=()=>{cancelFireHold();mode='grenade';target=null;Core.stop(state);message('Tap an explored landing point, then Throw. The normal arc and blast rules apply.');render();};
$('cancel').onclick=()=>{cancelFireHold();clearAim();render();};$('mute').onchange=()=>{if(view?.windowEffects){view.windowEffects.muted=$('mute').checked;if($('mute').checked)view.weaponAudio?.stopAll();else view.unlockSound();}};
for(const button of document.querySelectorAll('[data-dx]')){button.onpointerdown=e=>{cancelFireHold();button.setPointerCapture(e.pointerId);target=null;mode='shot';input={x:+button.dataset.dx,y:+button.dataset.dy};};button.onpointerup=button.onpointercancel=()=>input={x:0,y:0};}
window.addEventListener('keydown',e=>{if(e.target.matches('input,select'))return;const movement={a:{x:-1,y:0},d:{x:1,y:0},w:{x:0,y:-1},s:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}}[e.key];if(movement){cancelFireHold();e.preventDefault();input=movement;}});window.addEventListener('keyup',()=>input={x:0,y:0});window.addEventListener('blur',()=>{cancelFireHold();input={x:0,y:0};});document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelFireHold();});
function frame(now){if(closed)return;const dt=Math.min(.05,(now-previous)/1000);previous=now;if(state&&view&&!document.hidden){tick(state,dt,input);view.sync(state,now);render();}raf=requestAnimationFrame(frame);}
window.addEventListener('pagehide',()=>{cancelFireHold();closed=true;cancelAnimationFrame(raf);view?.dispose();});start();raf=requestAnimationFrame(frame);
// Read-only review diagnostics. Browser checks still use real controls/picking;
// no state, camera, combat or editor mutation is exposed through this API.
export function inspectWindowYard(){if(!state||!view)return null;return structuredClone({phase:state.phase,elapsed:state.elapsed,units:state.units,windows:state.windows,breaks:state.windowBreaks||{},sequence:state.windowSequence||0,events:state.windowEvents||[],effect:state.effect,assets:[...view.windowArt.assets].map(([id,asset])=>({id,panes:[...asset.panes].map(([id,pane])=>({id,visible:pane.root.visible})),solids:asset.solidParts().length})),resident:view.residentWindow,effects:view.windowEffects.stats(),render:{calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles,programs:view.renderer.info.programs.length}});}
export function projectWindowYard(point){if(!view)return null;const p=view.camera.position.clone().set(point.x,point.h??0,point.y).project(view.camera),rect=$('viewport').getBoundingClientRect();return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2,visible:Math.abs(p.x)<.98&&Math.abs(p.y)<.98&&Math.abs(p.z)<1};}
export function inspectExplosionFeedback(){if(!view||!state)return null;return structuredClone({props:state.props||[],fireAnimations:state.fireAnimations||[],fires:state.fires||[],lastDischarge:view.lastDischarge,
  blastShake:{count:view.explosionShake.count,byKind:view.explosionShake.counts,peak:view.shakePeak||0,pixels:view.lastShake,last:view.explosionShake.last},
  camera:{position:view.camera.position.toArray(),target:view.target.toArray()},shaderFailures:view.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length});}
