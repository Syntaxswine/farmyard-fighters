import test from 'node:test';
import assert from 'node:assert/strict';
import {createRealtimeCareers} from '../dist/realtime-progression.js';
import {Core,ANIMALS,DEFAULT_BUILD,createSoloGame,hero} from '../dist/solo-game.js';
test('animal careers carry skill gains to new operations and do not repeat awards from old checkpoints',()=>{
 const stored=new Map(),careers=createRealtimeCareers({getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},ANIMALS);
 const first=Core.enableRealtime(createSoloGame()),base=hero(first).stats.firearms;
 first.realtime.kills=3;first.realtime.earned.firearms=3;careers.sync(first);assert.equal(hero(first).stats.firearms,base+1);
 const next=Core.enableRealtime(createSoloGame(DEFAULT_BUILD,1,'short-measure'));careers.sync(next);assert.equal(hero(next).stats.firearms,base+1);
 first.realtime.kills=1;first.realtime.earned.firearms=1;careers.sync(first);assert.equal(careers.inspect(DEFAULT_BUILD.animal).kills,3);assert.equal(hero(first).stats.firearms,base+1);
 next.realtime.kills=5;next.realtime.earned.firearms=5;careers.sync(next);assert.equal(careers.inspect(DEFAULT_BUILD.animal).kills,8);assert.equal(hero(next).stats.firearms,base+2);
});
test('different animals have independent careers and corrupt profile data is rejected',()=>{
 const stored=new Map(),careers=createRealtimeCareers({getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},ANIMALS),s=Core.enableRealtime(createSoloGame());
 s.realtime.kills=3;s.realtime.earned.sneak=3;careers.sync(s);assert.equal(careers.inspect(ANIMALS.find(a=>a.id!==DEFAULT_BUILD.animal).id).kills,0);
 const [key]=stored.keys();stored.set(key,'{"version":2}');assert.throws(()=>careers.inspect(DEFAULT_BUILD.animal),/careers/);
});
