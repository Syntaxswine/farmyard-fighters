import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TownExplored,readTourProgress,encodeTourProgress,TOUR_SAVE} from '../dist/mount-dora-progress.js';
import {createSoloGame,DEFAULT_BUILD,hero,Core} from '../dist/solo-game.js';
test('sparse explored bits survive revisits, far edges and save/restore without cell strings',()=>{
  const seen=new TownExplored();for(const p of ['0,0','23,23','24,24','1439,1679','24,24'])seen.add(p);assert.equal(seen.size,4);assert.equal(seen.chunks.size,3);const data=seen.snapshot(),restored=TownExplored.restore(data);assert.equal(restored.size,4);for(const p of seen)assert(restored.has(p));assert(!restored.has('-1,0'));assert(JSON.stringify(data).length<600);assert.throws(()=>TownExplored.restore({...data,chunks:[...data.chunks,data.chunks[0]]}),/block/);
});
test('tour progress retains selected animal and resources and excludes all static world sources',()=>{
  const s=createSoloGame(DEFAULT_BUILD),u=hero(s);s.seen=new TownExplored();s.seen.add('1439,1679');u.ammo.assault=7;u.stamina=0;const world={sourceRevision:'a'.repeat(64),artRevision:'b'.repeat(64),project:{generation:{sourceDigest:'c'.repeat(64)}}};
  const text=encodeTourProgress(s,world),p=readTourProgress(text);assert.equal(p.player.ammo.assault,7);assert.equal(p.player.stamina,0);assert.equal(p.build.animal,DEFAULT_BUILD.animal);assert(p.seen.has('1439,1679'));assert(text.length<6000);assert(!Object.hasOwn(JSON.parse(text),'map'));assert(!Object.hasOwn(JSON.parse(text),'terrain'));assert.notEqual(TOUR_SAVE,'tactical-animal-operation-v2');
  assert.throws(()=>readTourProgress(text.replace('\"version\":1','\"version\":9')),/progress/);
});
