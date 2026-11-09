import fs from 'node:fs';
import vm from 'node:vm';
import * as game from '../dist/solo-game.js';
import {FrameClock} from '../dist/frame-timing.js';
import {pointInWorldRect} from '../dist/world-grid.js';
import * as tourActivity from '../dist/mount-dora-activity.js';
import * as tourProgress from '../dist/mount-dora-progress.js';
import * as controls from '../dist/mobile-controls.js';
import * as grenadeControls from '../dist/grenade-controls.js';
import * as shootingControls from '../dist/shooting-controls.js';
import * as targetMonitor from '../dist/targeting-monitor.js';
import * as flameControls from '../dist/flame-controls.js';
import * as guardAlerts from '../dist/guard-alert.js';
import {selectInteractionTarget} from '../dist/interactions.js';
import {createOperationStorage} from '../dist/operation-storage.js';
import {STANCE_ICONS} from '../dist/aft/tactics/battle-control-icons.js';
import * as realtimeCombat from '../dist/realtime-combat.js';
import {createRealtimeCareers} from '../dist/realtime-progression.js';

// Actual application handlers and simulation with a lightweight DOM/renderer.
export function app({autoDeploy=true,initialStorage=[],storageFailure=null,search='',initialState=null,realTime=false}={}){
  const elements=new Map(),events=new Map(),documentEvents=new Map(),saved=new Map(initialStorage),views=[];let animation,clock=0;
  class Element {
    constructor(id=''){
      this.id=id;this.style={};this.dataset={};this.children=[];this.listeners=new Map();this.hidden=false;this.disabled=false;this.open=false;this.textContent='';this.captures=new Set();
      const classes=new Set();
      this.classList={add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name)),contains:name=>classes.has(name),toggle:(name,force)=>{const on=force??!classes.has(name);if(on)classes.add(name);else classes.delete(name);return on;}};
    }
    setAttribute(name,value){this[name]=value;}
    addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(fn);}
    replaceChildren(...children){this.children=children;}
    append(...children){this.children.push(...children);}
    prepend(...children){this.children.unshift(...children);}
    closest(){return null;}
    getContext(){return {fillRect(){},drawImage(){}};}
    getBoundingClientRect(){return {left:100,top:600,width:155,height:155,bottom:755};}
    setPointerCapture(id){this.captures.add(id);}
    hasPointerCapture(id){return this.captures.has(id);}
    releasePointerCapture(id){this.captures.delete(id);}
    showModal(){this.open=true;}
    close(){this.open=false;}
    click(){if(!this.disabled)this.fire('click',{detail:1});}
    fire(type,extra={}){const event={type,pointerId:1,button:0,clientX:177.5,clientY:677.5,target:this,preventDefault(){},...extra};this['on'+type]?.(event);for(const fn of this.listeners.get(type)||[])fn(event);}
  }
  const el=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const doc={getElementById:el,querySelector:el,createElement:tag=>Object.assign(new Element(),{tagName:tag}),createElementNS:(_namespace,tag)=>Object.assign(new Element(),{tagName:tag}),body:new Element(),hidden:false,addEventListener:(name,fn)=>documentEvents.set(name,fn)};
  doc.body.dataset.realtime=String(realTime);
  class FieldView {
    constructor(_container,options){this.options=options;this.follow=true;views.push(this);}
    setGame(state){this.state=state;this.art=state.solo.missionId===tourActivity.TOUR_ID?{readyForMovement:true}:null;this.options.onLoading(false);}
    interactionAnchor(){return {x:200,y:300,visible:true};}
    beginGrenadeAim(){this.preview=null;this.aiming=true;}
    endGrenadeAim(){this.aiming=false;}
    previewGrenade(point,preview){this.preview={point:{...point},...preview};}
    beginFlameAim(){this.flamePreview=null;this.flameAiming=true;}
    endFlameAim(){this.flameAiming=false;}
    previewFlame(heading,preview){this.flamePreview={heading,...preview};}
    zoom(factor){this.zoomFactor=(this.zoomFactor||1)*factor;}
    route(){} center(){} sync(){} dispose(){this.disposed=true;this.aiming=false;}
  }
  if(!saved.has('tactical-animal-build-v1'))saved.set('tactical-animal-build-v1',JSON.stringify({...game.DEFAULT_BUILD,utility:'grenade'}));
  const context={...game,...realtimeCombat,createRealtimeCareers,FrameClock,pointInWorldRect,...tourActivity,...tourProgress,URL,URLSearchParams,AbortController,Image:class {complete=false;naturalWidth=0;},location:{search},__appModuleURL:new URL('../dist/app.js',import.meta.url).href,...controls,...grenadeControls,...flameControls,...shootingControls,...guardAlerts,createTargetMonitor:(...args)=>targetMonitor.createTargetMonitor(...args,doc),selectInteractionTarget,createOperationStorage,STANCE_ICONS,weaponArtwork:()=>new Element(),FieldView,drawMinimap(){},document:doc,localStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},setTimeout,clearTimeout,performance:{now:()=>clock},requestAnimationFrame:fn=>animation=fn,innerHeight:844,addEventListener:(name,fn)=>events.set(name,fn),console};
  context.window={get localStorage(){return context.localStorage;}};
  if(storageFailure){
    const blocked=()=>{throw Object.assign(new Error('Storage access is denied.'),{name:'SecurityError'});};
    const backend={getItem:key=>storageFailure==='read-denied'?blocked():saved.get(key),setItem(key,value){if(storageFailure==='read-denied')return saved.set(key,value);if(storageFailure==='quota')throw Object.assign(new Error('Storage quota exceeded.'),{name:'QuotaExceededError'});blocked();}};
    // A denied browser can throw while evaluating window.localStorage, before
    // getItem or setItem is ever called. Exercise that exact startup boundary.
    Object.defineProperty(context,'localStorage',{get:storageFailure==='denied'?blocked:()=>backend});
  }
  // Preserve the production module URL while executing actual handlers in this
  // controlled VM. Read-only diagnostics remain ordinary local functions here.
  const application=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url','__appModuleURL')
    .replace(/^export (?=(?:async )?function )/gm,'');
  vm.runInNewContext(application+'\n;globalThis.__startHarnessGame=start;',context);
  if(initialState)context.__startHarnessGame(initialState);
  else if(autoDeploy)el('deploy').click();
  const key=(name,type='keydown')=>events.get(type)({key:name,target:{tagName:'BODY',closest:()=>null},preventDefault(){},repeat:false});
  const advance=(count=1,stepMs=50)=>{for(let i=0;i<count;i++){clock+=stepMs;animation(clock);}};
  const drag=(x,y)=>{el('joystick').fire('pointerdown');el('joystick').fire('pointermove',{clientX:177.5+x,clientY:677.5+y});};
  return {el,get view(){return views.at(-1);},get s(){return views.at(-1)?.state;},get u(){return game.hero(views.at(-1).state);},views,key,advance,drag,events,documentEvents,elapse:ms=>{clock+=ms;},visibility:hidden=>{doc.hidden=hidden;documentEvents.get('visibilitychange')?.();},saved,document:doc};
}
