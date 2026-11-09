import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Core,createSoloGame,DEFAULT_BUILD,hero,walkSegment,lineClear,encodeSave,decodeSave,tick} from '../dist/solo-game.js';
import {WINDOW_REVIEW_ID,windowReviewSource} from '../dist/window-review-map.js';
import {loadTownTour} from '../dist/mount-dora-entry.js';
import {getTourWorld} from '../dist/mount-dora-activity.js';
import {readTourProgress} from '../dist/mount-dora-progress.js';
import {app} from './app-harness.mjs';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {InteractionScenery} from '../dist/interaction-view.js';
const action=(a,text)=>{const b=a.el('overlay-actions').children.find(b=>b.textContent.startsWith(text));assert(b,text);return b;};
const projectURL=new URL('../../../maps/mount-dora/project.json',import.meta.url),fetcher=async url=>new Response(fs.readFileSync(url));
const town=build=>loadTownTour({build:{...DEFAULT_BUILD,utility:'grenade',...build},fetcher,projectURL});
function authoredDoorGame(){const source=windowReviewSource();source.guards=[];source.edges={'e:20:25':'door-wood-closed','s:24:25':'door-steel-closed','s:20:22':'doorway-concrete-open'};source.farmyardWindows.instances=[];return createSoloGame(DEFAULT_BUILD,1947,WINDOW_REVIEW_ID,{authoredMap:source});}

test('editor-placed doors use production hand actions, collision, AP, blocking checks and saved state',()=>{
 const s=authoredDoorGame(),u=hero(s),doors=s.interactables.filter(o=>o.kind==='door');assert.equal(doors.length,2);
 const door=doors.find(o=>o.edge==='e:20:25'),a=app({initialState:s}),other={x:21,y:25};
 const scenery=new InteractionScenery(s,{loader:{load(_url,onLoad){const t=new T.Texture({width:1254,height:1254});onLoad?.(t);return t;}}});
 assert(!walkSegment(s,u,other,u.id));assert(!lineClear(s,u,other));a.view.options.onPick({interactionId:door.id});assert.equal(a.el('interaction-hand').hidden,false);
 const leaf=scenery.records.get(door.id).leaf;assert(leaf.scale.x<leaf.scale.z);
 a.el('interaction-hand').click();scenery.update(s);assert(leaf.scale.x>leaf.scale.z);assert(door.open);assert(walkSegment(s,u,other,u.id));assert(lineClear(s,u,other));
 u.x=20.5;const ap=u.ap;assert.equal(Core.performInteraction(s,door.id,'close').ok,false);assert(door.open);assert.equal(u.ap,ap);
 u.x=20;s.phase='player';u.ap=8;assert(Core.performInteraction(s,door.id,'close').ok);assert.equal(u.ap,7);
 const restored=decodeSave(encodeSave(s)),d=restored.interactables.find(o=>o.id===door.id);assert.equal(d.open,false);assert(!walkSegment(restored,hero(restored),other,0));
 scenery.dispose();assert.equal(scenery.records.size,0);
});

test('Mount Dora uses the normal firearm, grenade, AP turn and resume lifecycle',async()=>{
 const s=await town(),w=getTourWorld(s),u=hero(s);
 try{
  const a=app({initialState:s}),ammo=u.ammo[u.weapon],grenades=u.ammo.grenade;
  assert.equal(a.el('grenade').disabled,false);a.el('menu').click();action(a,'Aim firearm at a point').click();
  a.view.options.onPick({x:u.x-5,y:u.y,ground:true,h:1.1});action(a,'Fire ·').click();assert.equal(u.ammo[u.weapon],ammo-1);assert.equal(s.phase,'player');assert(u.ap<u.maxAp);
  assert(Core.throwGrenade(s,u,{x:u.x-8,y:u.y}));assert.equal(u.ammo.grenade,grenades-1);assert(s.effect.sequence.some(e=>e.weapon==='grenade'));
  const progress=readTourProgress(encodeSave(s)),restored=await loadTownTour({progress,fetcher,projectURL});
  try{assert.equal(restored.phase,'player');assert.equal(hero(restored).ap,u.ap);assert.equal(hero(restored).ammo.grenade,u.ammo.grenade);assert.equal(restored.round,s.round);assert(Core.endTurn(restored));finishTurn(restored);assert.equal(restored.phase,'explore');assert.equal(hero(restored).ap,hero(restored).maxAp);}finally{getTourWorld(restored).dispose();}
 }finally{w.dispose();}
});

function finishTurn(state){
 for(let i=0;i<200&&state.phase==='enemy';i++)tick(state,.05);
 assert.notEqual(state.phase,'enemy');
}

test('Mount Dora uses real flame effects and the production burn-to-death lifecycle',async()=>{
 const s=await town({primary:'flamethrower'}),w=getTourWorld(s),u=hero(s);
 try{
  const fuel=u.ammo.flamethrower;assert(Core.fireFlame(s,u,180));assert.equal(u.ammo.flamethrower,fuel-1);assert(s.effect.sequence[0].flame);assert(Core.endTurn(s));finishTurn(s);
  assert(Core.ignite(s,u));Core.refresh(s);const progress=readTourProgress(encodeSave(s)),restored=await loadTownTour({progress,fetcher,projectURL});
  try{const r=hero(restored);assert.equal(r.burningTurns,3);assert.equal(r.ap,0);assert.equal(restored.fireAnimations,undefined);for(let i=0;i<3;i++){assert(Core.endTurn(restored));finishTurn(restored);}assert.equal(r.hp,0);assert.equal(restored.solo.status,'lost');assert.equal(readTourProgress(encodeSave(restored)).status,'lost');}finally{getTourWorld(restored).dispose();}
 }finally{w.dispose();}
});

test('legacy tour checkpoints still load and point-target cancellation cannot fire a weapon',async()=>{
 const s=await town(),w=getTourWorld(s);
 try{
  const legacy=JSON.parse(encodeSave(s));delete legacy.runtime;const restored=await loadTownTour({progress:readTourProgress(JSON.stringify(legacy)),fetcher,projectURL});
  try{assert.equal(restored.phase,'explore');assert.equal(hero(restored).x,hero(s).x);assert.deepEqual(hero(restored).ammo,hero(s).ammo);}finally{getTourWorld(restored).dispose();}
  const a=app({initialState:s}),ammo=structuredClone(a.u.ammo);a.el('menu').click();action(a,'Aim firearm at a point').click();a.key('Escape');
  a.view.options.onPick({x:a.u.x-1,y:a.u.y});assert.equal(a.el('overlay').open,false);assert.deepEqual(a.u.ammo,ammo);
  a.el('menu').click();action(a,'Aim firearm at a point').click();a.key('g');a.el('cancel-grenade').click();a.view.options.onPick({x:a.u.x-1,y:a.u.y});assert.equal(a.el('overlay').open,false);assert.deepEqual(a.u.ammo,ammo);
 }finally{w.dispose();}
});
