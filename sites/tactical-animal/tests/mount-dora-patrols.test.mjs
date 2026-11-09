import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTownTour} from '../dist/mount-dora-entry.js';
import {getTourWorld} from '../dist/mount-dora-activity.js';
import {readTourProgress} from '../dist/mount-dora-progress.js';
import {Core,DEFAULT_BUILD,distance,encodeSave,hero,tick} from '../dist/solo-game.js';

const projectURL=new URL('../../../maps/mount-dora/project.json',import.meta.url);
const fetcher=async url=>new Response(fs.readFileSync(url));
const load=progress=>loadTownTour({build:DEFAULT_BUILD,progress,fetcher,projectURL});
const guards=s=>s.units.filter(u=>u.team==='guard');

test('the forty-two sentries use the real map, clear patrol legs, and half-player stats',async()=>{
  const state=await load(),world=getTourWorld(state),player=hero(state);
  try{
    const posts=guards(state);
    assert.equal(posts.length,42);
    assert.deepEqual(new Set(posts.map(g=>g.weapon)),new Set(['pistol','smg','rifle','shotgun']));
    assert(posts.some(g=>g.patrol?.length===2));
    assert(posts.some(g=>g.patrol?.length===8));
    for(const guard of posts){
      assert.equal(guard.maxHp,Math.round(player.maxHp/2));
      assert.equal(guard.maxStamina,Math.round(player.maxStamina/2));
      assert.equal(guard.maxAp,Math.round(player.maxAp/2));
      for(const [key,value] of Object.entries(player.stats))assert.equal(guard.stats[key],Math.max(1,Math.round(value/2)));
      await world.readyAt(guard);
      assert(world.resumeClear(guard),guard.name+' needs a clear post');
      const route=guard.patrol||[];
      for(let i=0;i<route.length;i++){
        assert(world.resumeClear(route[i]),guard.name+' waypoint '+i);
        assert(world.walkSegment(route[i],route[(i+1)%route.length]),guard.name+' leg '+i);
      }
    }
  }finally{world.dispose();}
});

test('a streamed street sentry turns at its endpoint and resumes from its saved waypoint',async()=>{
  const original=Core.enableRealtime(await load()),world=getTourWorld(original);
  let state,restored;
  try{
    let approach,post;
    for(const candidate of guards(original).filter(g=>g.patrol?.length===2)){
      for(const [dx,dy] of [[44,0],[-44,0],[0,44],[0,-44],[31,31],[-31,-31]]){
        const point={x:candidate.x+dx,y:candidate.y+dy};
        if(candidate.patrol.some(p=>distance(point,p)<33||distance(point,p)>68)||guards(original).some(g=>g!==candidate&&distance(point,g)<33))continue;
        await world.readyAt(point);
        if(world.resumeClear(point)){approach=point;post=candidate;break;}
      }
      if(post)break;
    }
    assert(approach,'A clear checkpoint in active patrol range is required');
    const progress=readTourProgress(encodeSave(original));
    Object.assign(progress.player,approach);
    state=Core.enableRealtime(await load(progress));
    const guard=guards(state).find(g=>g.id===post.id);
    const [first,last]=guard.patrol;
    const length=distance(first,last);
    for(let i=0;i<400&&guard.travelled<length+2;i++)tick(state,.05);
    assert(!guard.alert&&guard.travelled>=length+2);
    assert.equal(guard.patrolIndex,0);
    assert(distance(guard,last)>1&&distance(guard,first)<length-1);
    const saved=readTourProgress(encodeSave(state));
    assert(!Object.hasOwn(saved.runtime.guards.find(g=>g.id===guard.id),'patrol'));
    restored=Core.enableRealtime(await load(saved));
    const resumed=guards(restored).find(g=>g.id===guard.id);
    assert.deepEqual(resumed.patrol,guard.patrol);
    assert.equal(resumed.patrolIndex,guard.patrolIndex);
    assert.equal(distance(resumed,guard),0);
    tick(restored,.05);
    assert(distance(resumed,first)<distance(guard,first));
  }finally{for(const s of [restored,state,original])getTourWorld(s)?.dispose();}
});

test('a pre-patrol checkpoint gets the new roster without reviving a fallen sentry',async()=>{
  const original=Core.enableRealtime(await load());
  let restored;
  try{
    const legacy=JSON.parse(encodeSave(original));
    delete legacy.runtime.guardRosterVersion;
    legacy.runtime.guards=legacy.runtime.guards.filter(g=>g.id<=42);
    for(const id of [43,44,45])delete legacy.runtime.realtime.actors[id];
    const casualty=legacy.runtime.guards.find(g=>g.id===14);
    Object.assign(casualty,{hp:0,ap:0,casualty:'dead'});
    restored=Core.enableRealtime(await load(readTourProgress(JSON.stringify(legacy))));
    const sentry=guards(restored).find(g=>g.id===casualty.id);
    assert.equal(guards(restored).length,42);
    assert.equal(sentry.hp,0);
    assert(Core.interactionObjects(restored).some(o=>o.id==='body:'+sentry.id));
    assert(guards(restored).some(g=>g.hp>0&&g.patrol?.length===2));
  }finally{for(const s of [restored,original])getTourWorld(s)?.dispose();}
});
