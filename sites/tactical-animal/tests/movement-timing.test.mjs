import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {TownWorld} from '../dist/mount-dora-world.js';
import * as ART from '../dist/mission-art/mount-dora/manifest.js';
import {Core,createSoloGame,DEFAULT_BUILD,hero,tick,encodeSave} from '../dist/solo-game.js';
import {loadTownTour} from '../dist/mount-dora-entry.js';
import {getTourWorld} from '../dist/mount-dora-activity.js';
import {readTourProgress} from '../dist/mount-dora-progress.js';
import {FrameClock,MAX_FRAME_SECONDS} from '../dist/frame-timing.js';
import {FieldView} from '../dist/field-view.js';
import {pointInWorldRect} from '../dist/world-grid.js';
import {app} from './app-harness.mjs';
const base=new URL('../../../maps/mount-dora/',import.meta.url),project=JSON.parse(fs.readFileSync(new URL('project.json',base))),fetcher=async u=>new Response(fs.readFileSync(u));
const close=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);let world;
before(async()=>{world=await new TownWorld(project,{baseURL:base,fetcher,art:ART}).identify();await world.readyAt({x:425,y:470});assert(world.walkSegment({x:425,y:470},{x:425,y:435}));world.startPoint={x:425,y:470};});
after(()=>world?.dispose());
const tour=()=>createSoloGame(DEFAULT_BUILD,1947,'mount-dora',{tourWorld:world});
function controlTap(a,id,pointerId=2){const b=a.el(id);b.fire('pointerdown',{pointerId});b.fire('pointerup',{pointerId});b.click();}
function normal(){const s=createSoloGame();hero(s).x=4;hero(s).y=25;return s;}

test('one wall-clock second has the same doubled pace at60,20,10,5,2 and1FPS',()=>{
  for(const [stance,mode,speed]of [['standing','walk',7.2],['standing','run',14.4],['standing','sneak',3.6],['kneeling','walk',3.6],['prone','walk',1.8]])for(const fps of [60,20,10,5,2,1]){
    const s=tour(),u=hero(s);u.stamina=0;Core.setStance(s,u,stance);Core.setMovementMode(s,u,mode);
    for(let i=0;i<fps;i++)tick(s,1/fps,{x:0,y:-1});close(s.solo.distance,speed);close(s.elapsed,1);close(u.stamina,0);assert.equal(Core.movementModeOf(u),mode);close(Core.movementSpeed(u),speed);
    const ordinary=hero(normal());ordinary.stance=stance;ordinary.running=mode==='run';ordinary.sneaking=mode==='sneak';close(Core.movementSpeed(ordinary),speed);
  }
});
test('exhausted existing tour saves can select Run and keep their route and resources',async()=>{
  const original=tour();hero(original).stamina=0;const progress=readTourProgress(encodeSave(original)),s=await loadTownTour({build:DEFAULT_BUILD,progress,fetcher,projectURL:new URL('project.json',base)});
  try{const u=hero(s),ammo=JSON.stringify(u.ammo);assert(Core.move(s,u,u.x,u.y-20));Core.setMovementMode(s,u,'run');assert(s.queue.length);tick(s,.5);assert(u.running);close(s.solo.distance,7.2);close(u.stamina,0);assert.equal(JSON.stringify(u.ammo),ammo);}finally{getTourWorld(s).dispose();}
});
test('two-pointer quick Run/stance taps preserve the held joystick and held keys',()=>{
  const a=app({initialState:tour()});a.u.stamina=0;a.drag(32,-38.4);a.advance();const before=a.s.solo.distance;
  controlTap(a,'movement-cycle');assert(a.u.running);assert(a.el('joystick').hasPointerCapture(1));a.advance();close(a.s.solo.distance-before,.72);assert.equal(a.el('movement-label').textContent,'RUN');
  a.el('joystick').fire('pointerup');a.key('w');controlTap(a,'stance-cycle');assert.equal(a.u.stance,'kneeling');const at=a.s.solo.distance;a.advance();assert(a.s.solo.distance>at+.3);a.key('w','keyup');
});
test('tap-to-walk keeps its queued destination when Run is selected at zero stamina',()=>{
  const a=app({initialState:tour()});a.u.stamina=0;a.view.options.onPick({x:425,y:450});assert(a.s.queue.length);controlTap(a,'movement-cycle');a.advance(2);assert(a.u.running);assert(a.s.queue.length);close(a.s.solo.distance,1.44);
});
test('pause, hidden, blur and art-loading transitions discard their elapsed time',()=>{
  const a=app({initialState:tour()});a.u.stamina=0;Core.setMovementMode(a.s,a.u,'run');
  for(const kind of ['pause','hidden','blur','freeze','loading']){
    Core.move(a.s,a.u,a.u.x,a.u.y-10);const before={x:a.u.x,y:a.u.y,elapsed:a.s.elapsed};
    if(kind==='pause')a.el('menu').click();if(kind==='hidden')a.visibility(true);if(kind==='blur')a.events.get('blur')();if(kind==='freeze')a.documentEvents.get('freeze')();if(kind==='loading')a.view.options.onLoading(true);
    a.elapse(30000);a.advance(1,0);close(a.u.x,before.x);close(a.u.y,before.y);close(a.s.elapsed,before.elapsed);
    if(kind==='pause')a.el('overlay-actions').children.find(b=>b.textContent==='Continue walking').click();if(kind==='hidden')a.visibility(false);if(kind==='blur')a.events.get('focus')();if(kind==='freeze')a.documentEvents.get('resume')();if(kind==='loading')a.view.options.onLoading(false);
    a.advance(1,0);close(a.u.x,before.x);close(a.u.y,before.y);a.advance();assert(Math.hypot(a.u.x-before.x,a.u.y-before.y)<=.72+1e-6);
  }
});
test('catch-up discards the old input at explore→player and enemy→player transitions',()=>{
  for(const initial of ['explore','enemy']){const setup=()=>{const s=normal(),g=s.units[1];for(const guard of s.units.slice(2))guard.hp=0;g.x=6;g.y=25;g.hp=100;g.alert=initial==='enemy';s.phase=initial;s.enemyIndex=s.units.length;s.engaged=initial==='enemy';return s;},s=setup(),reference=setup();
    do{tick(reference,.05,{x:1,y:0});}while(reference.phase===initial&&reference.elapsed<1);
    tick(s,1,{x:1,y:0});assert.equal(s.phase,'player');close(s.elapsed,reference.elapsed);close(hero(s).x,hero(reference).x);close(hero(s).ap,hero(s).maxAp);close(s.solo.apDistance,0);assert(s.elapsed<1);
  }
});
test('catch-up is bounded and retains exact swept wall/water collision at the faster pace',async()=>{
  const s=tour(),u=hero(s);Core.setMovementMode(s,u,'run');tick(s,30,{x:0,y:-1});close(s.elapsed,MAX_FRAME_SECONDS);close(s.solo.distance,14.4);
  const w=await new TownWorld(project,{baseURL:base,fetcher,art:ART}).identify();try{
    for(const [spawn,input]of [[{x:480,y:508},{x:0,y:-1}],[{x:529,y:1402},{x:0,y:-1}]]){await w.readyAt(spawn);assert(w.pointClear(spawn));w.startPoint=spawn;const state=createSoloGame(DEFAULT_BUILD,1947,'mount-dora',{tourWorld:w}),animal=hero(state);Core.setMovementMode(state,animal,'run');tick(state,1,input);assert(w.pointClear(animal));assert(w.walkSegment(spawn,animal));assert(state.solo.distance<14.4,'Solid wall or boardwalk rail stops fast travel');}
  }finally{w.dispose();}
});
function camera(s,width,height){const v=Object.assign(Object.create(FieldView.prototype),{state:s,renderer:{setSize(){}},camera:new T.OrthographicCamera(),target:new T.Vector3(hero(s).x,0,hero(s).y),container:{clientWidth:width,clientHeight:height,getBoundingClientRect:()=>({left:0,top:0,width,height})},span:13,requestedSpan:13,follow:true});v.updateCamera();return v;}
test('elapsed camera follow keeps fast low-FPS Run projected on screen and inside resident blocks',()=>{
  for(const fps of [60,5,2,1])for(const [width,height]of [[1280,720],[390,844]]){const s=tour(),u=hero(s),v=camera(s,width,height);Core.setMovementMode(s,u,'run');v.updateFollowCamera(s,0);
    for(let n=1;n<=fps*2;n++){tick(s,1/fps,{x:0,y:-1});v.updateFollowCamera(s,n*1000/fps);assert(v.projectWorldPoint({...u,h:.9}).visible);assert(pointInWorldRect(u,v.residentWindow));assert(v.residentWindow.blocks.length<=25);}
  }
});
test('repeated zoom-out enlarges actual phone/desktop ground extent with at most25 blocks',()=>{
  for(const [width,height]of [[1280,720],[390,844]]){const s=tour(),v=camera(s,width,height),spans=[v.span];for(let n=0;n<5;n++){v.zoom(1.2);spans.push(v.span);assert(v.residentWindow.blocks.length<=25);}for(let n=1;n<spans.length;n++)assert(spans[n]>spans[n-1]+.1);assert(v.span>spans[0]*2);for(let n=0;n<20;n++)v.zoom(1.2);assert.equal(v.canZoom(1.2),false);assert(v.span>40,'Maximum view exceeds the old35m ceiling');assert(v.residentWindow.blocks.length<=25);}
});
test('clock reset excludes paused/background time and bounds active stalls',()=>{const c=new FrameClock();c.reset(0);close(c.sample(200),.2);c.sample(30000,false);close(c.sample(60000,true),0);close(c.sample(60500,true),.5);close(c.sample(90000,true),1);});
