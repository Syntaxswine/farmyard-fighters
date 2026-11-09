import * as T from '../dist/aft/tactics/vendor/three.module.js';
import {FieldView} from '../dist/field-view.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {visualTravelDistance,movementPresentation} from '../dist/locomotion-sample.js';
import {ANIMAL_MOTION_CATALOG} from '../dist/aft/tactics/animal-motion-catalog.js';
import {createWorkerLocomotion} from '../dist/aft/tactics/worker-locomotion.js';
import {createBattlePosture} from '../dist/aft/tactics/battle-posture.js';
import {createSoloGame,hero,tick,Core} from '../dist/solo-game.js';
const transforms=worker=>worker.bones.flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray()]);
test('new Walk and adapted Run reproduce liked old7.2m/s Run cadence and frozen native transforms',()=>{
  for(const species of ['goat','sheep','hen','pig-foreman']){
    const profile=ANIMAL_MOTION_CATALOG.find(p=>p.id===species),worker=profile.create(JSON.parse(fs.readFileSync(new URL('../dist/aft/tactics/'+profile.file,import.meta.url)))),locomotion=createWorkerLocomotion(worker,profile),posture=createBattlePosture(worker,profile);let previous={travelled:0,distance:0},lastPlant=true,cycles=0;
    try{for(let frame=1;frame<=120;frame++){const t=frame/120,physical={travelled:14.4*t,running:true},distance=visualTravelDistance(physical,previous),sample={distance,blend:1,heading:0,stance:'standing',pose:{kneel:0,prone:0,down:0},hp:100};
      const reference={...sample,distance:7.2*t};const gait=locomotion.apply(reference);posture.apply(reference);const expected=transforms(worker);locomotion.apply(sample);posture.apply(sample);const actual=transforms(worker);assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-expected[i])<1e-7,species+' native transform'+i);assert(Math.abs(distance-7.2*t)<1e-8);if(lastPlant&&!gait.feet[-1].planted)cycles++;lastPlant=gait.feet[-1].planted;previous={...physical,distance};
    }assert(cycles>=7&&cycles<=16,species+' measured native cycles per second: '+cycles);}finally{locomotion.dispose();worker.dispose();worker.skeleton.dispose();}
  }
});
test('visual phase stays continuous across run/walk, idle and visits while actual travel is untouched',()=>{
  let previous={travelled:0,distance:0};for(const [travelled,running,distance]of [[2,false,2],[4,true,3],[4,true,3],[4,false,3],[5,false,4]]){const unit={travelled,running,x:500,y:1000},before={...unit};assert.equal(visualTravelDistance(unit,previous),distance);assert.deepEqual(unit,before);previous={...unit,distance};}
});
test('same-phase catch-up retains every enemy attack cue with ordered playback offsets',()=>{
  const s=createSoloGame(),u=hero(s),g=s.units[1];u.x=4;u.y=25;u.hp=u.maxHp=10000;g.x=4;g.y=22;g.weapon='pistol';g.ammo.pistol=8;g.ap=20;g.alert=true;for(const other of s.units.slice(2))other.hp=0;s.phase='enemy';s.enemyIndex=1;s.enemyDelay=0;
  assert(Core.previewAttack(s,g,u).ok);tick(s,1);assert.equal(s.phase,'enemy');assert.equal(g.ammo.pistol,6);assert.equal(s.effect.sequence.length,2);assert(s.effect.sequence.every(e=>e.weapon==='pistol'));assert.equal(s.effect.sequence[0].catchupDelayMs,0);assert(s.effect.sequence[1].catchupDelayMs>=550&&s.effect.sequence[1].catchupDelayMs<=700);
});

test('load/counter rewind seed accepted movement and a completed substep route still animates',()=>{
  assert.equal(movementPresentation({travelled:900,running:true,isMoving:false}).distance,0);
  const rewound=movementPresentation({travelled:0,running:true,isMoving:false},{travelled:900,distance:12});assert.equal(rewound.distance,12);assert.equal(rewound.moving,false);
  const s=createSoloGame(),u=hero(s);for(const g of s.units.slice(1))g.hp=0;u.x=4;u.y=25;s.phase='won';const previous={travelled:u.travelled,distance:0};Core.move(s,u,4.1,25);tick(s,1);assert.equal(u.isMoving,false);const presentation=movementPresentation(u,previous);assert(presentation.moving);assert(presentation.distance>0);
});

test('a delayed single catch-up tracer starts on its first rendered frame without expiring unseen',()=>{
  const v=Object.assign(Object.create(FieldView.prototype),{scene:new T.Scene(),effects:[]}),shot={weapon:'pistol',ax:0,ay:0,bx:3,by:0,shots:1,shot:0};v.queueEffects({sequence:[shot,{...shot,catchupDelayMs:650}]},0);const first=v.effects[0],delayed=v.effects[1];assert(first.started);assert(!delayed.started);v.animateEffects(0);assert(first.line.visible);assert(!delayed.line.visible);v.animateEffects(1000);assert(delayed.started&&delayed.line.visible);assert.equal(delayed.at,1000);assert.equal(delayed.line.material.opacity,1);v.animateEffects(1100);assert(delayed.line.visible);v.clearEffects();assert.equal(v.scene.children.length,0);
});
