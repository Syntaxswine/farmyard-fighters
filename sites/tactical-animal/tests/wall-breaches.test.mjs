import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {OriginalEnvironment} from '../dist/original-art.js';
import {Core,createSoloGame,DEFAULT_BUILD,decodeSave,encodeSave,geometry,hero,lineClear,projectileSegmentClear,tick,walkSegment} from '../dist/solo-game.js';
import {WINDOW_REVIEW_ID,windowReviewSource} from '../dist/window-review-map.js';

const edge='e:22:24',behind='e:25:24';
const aim={x:22.57,y:24,h:1.1,ground:true,wallEdge:edge};
const start={x:21.8,y:24,h:1.1},end={x:23.2,y:24,h:1.1};
const clear=s=>[walkSegment(s,start,end),lineClear(s,start,end),projectileSegmentClear(s,start,end)];

// Authored fixture straddles a render block seam at y=23.5.
function yard({material='wall-corrugated',weapon='smg',guards=false,x=20,blast=false}={}){
  const map=windowReviewSource();
  map.farmyardWindows.instances=[];
  map.edges={'e:22:23':material,[edge]:material,'e:22:25':material,...(blast?{[behind]:'wall-corrugated'}:{})};
  map.guards=guards?[{x:24,y:24,species:'pig-foreman',weapon:'pistol',heading:0}]:[];
  Object.assign(map.starts[0],{x,y:24,heading:0});
  const s=Core.enableRealtime(createSoloGame({...DEFAULT_BUILD,primary:weapon,utility:'grenade'},1,WINDOW_REVIEW_ID,{authoredMap:map}));
  hero(s).stats.firearms=hero(s).stats.dexterity=100;
  return s;
}

function fire(s,target=aim,seed=1){
  const u=hero(s);
  for(let i=0;i<60&&s.realtime.actors[u.id]?.cooldown>1e-7;i++)tick(s,.05);
  s.seed=seed;
  const previous=s.effect;
  assert.ok(Core.attack(s,u,target),Core.previewAttack(s,u,target).reason);
  for(let i=0;i<60;i++){
    tick(s,.05);
    if(s.effect!==previous){const shot=s.effect?.sequence.find(event=>event.shooter===u.id);if(shot)return shot;}
  }
  assert.fail('No committed player shot');
}

test('the authored wall retains AFT health, then opens collision, sight, and a rough rendered gap',async()=>{
  const s=yard(),u=hero(s),texture=()=>new T.Texture();
  const view=new OriginalEnvironment({capabilities:{getMaxAnisotropy:()=>4}},s,{loader:{load:texture,loadAsync:async()=>texture()}});
  const ray=new T.Raycaster(new T.Vector3(20,1.1,24),new T.Vector3(1,0,0));
  const pick=()=>{view.root.updateMatrixWorld(true);const hit=view.pickWall(ray);return hit?.object.userData.wallEdges[hit.instanceId];};
  try{
    await view.ready;
    assert.equal(pick(),edge);
    assert.deepEqual(clear(s),[false,false,false]);
    assert.ok(!s.seen.has('23,24'));
    for(const remaining of [73,46,19]){
      const shot=fire(s);
      assert.equal(shot.structures[0].hp,remaining);
      assert.equal(s.edges[edge],'wall');
      assert.deepEqual(clear(s),[false,false,false]);
    }
    const damaged=decodeSave(encodeSave(s));
    assert.equal(damaged.structureHealth['edge:'+edge].hp,19);
    const final=fire(s);
    assert.equal(final.structures[0].destroyed,true);
    assert.ok(Math.abs(final.bx-22.42)<1e-7);
    assert.equal(s.edges[edge],undefined);
    assert.deepEqual(clear(s),[true,true,true]);
    assert.ok(s.visible.has('23,24'));
    assert.ok(Core.navigationPath(s,u,end.x,end.y));
    view.update(s,u);
    assert.equal(pick(),undefined);
    const remnants=[...view.chunks.values()].flatMap(chunk=>[...chunk.breachMeshes.keys()]).sort();
    assert.deepEqual(remnants,['e:22:23','e:22:25']);
    assert.equal(geometry(s).find(box=>box.wallEdge==='e:22:23').y1,23.5);
    assert.deepEqual(clear(decodeSave(encodeSave(s))),[true,true,true]);
  }finally{view.dispose();}
});

test('a grenade opens a light wall while the intact scene shields the far wall and guard',()=>{
  const s=yard({guards:true,x:17,blast:true}),u=hero(s),guard=s.units[1],hp=guard.hp;
  assert.ok(Core.throwGrenade(s,u,{x:22.25,y:24}));
  assert.equal(s.edges[edge],undefined);
  assert.equal(s.edges[behind],'wall');
  assert.equal(s.structureHealth['edge:'+behind],undefined);
  assert.equal(guard.hp,hp);
  assert.ok(s.detected.has(guard.id));
  assert.ok(s.effect.sequence[0].structures.some(r=>r.id==='edge:'+edge&&r.destroyed));
});

test('an RPG detonates on a masonry wall and opens it with one direct hit',()=>{
  const s=yard({weapon:'rpg',material:'wall-brick',guards:true,x:17}),guard=s.units[1],hp=guard.hp;
  const shot=fire(s);
  const wall=shot.structures.find(r=>r.id==='edge:'+edge);
  assert.equal(wall.maxHp,200);
  assert.equal(wall.destroyed,true);
  assert.equal(guard.hp,hp);
  assert.ok(Math.abs(shot.bx-22.42)<1e-7);
  assert.equal(hero(s).ammo.rpg,0);
  assert.ok(walkSegment(s,start,end,guard.id));
  assert.ok(lineClear(s,start,end)&&projectileSegmentClear(s,start,end));
});
