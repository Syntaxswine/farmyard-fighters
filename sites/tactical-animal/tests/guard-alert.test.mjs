import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GuardContactTracker,GuardAlertSound,GuardAlertIndicator} from '../dist/guard-alert.js';
import {createSoloGame,encodeSave,decodeSave} from '../dist/solo-game.js';

const boris={id:1,name:'Boris'},lev={id:2,name:'Lev'};

test('first sightings alert once; camera cycling, unchanged contacts and reacquisition stay quiet',()=>{
  const tracker=new GuardContactTracker();
  assert.deepEqual(tracker.observe([]),[]);
  assert.deepEqual(tracker.observe([boris]),[boris]);
  assert.deepEqual(tracker.observe([boris]),[]);
  assert.deepEqual(tracker.observe([lev,boris,lev]),[lev]);
  assert.deepEqual(tracker.observe([boris,lev]),[]);
  assert.deepEqual(tracker.observe([]),[]);
  assert.deepEqual(tracker.observe([lev,boris]),[]);
});

test('discovery history survives the real save format and resets for a new operation',()=>{
  const tracker=new GuardContactTracker(),state=createSoloGame();
  tracker.observe([boris]);state.solo.spottedGuardIds=tracker.ids();
  const restored=decodeSave(encodeSave(state)),resumed=new GuardContactTracker(restored.solo.spottedGuardIds);
  assert.deepEqual(resumed.observe([boris]),[]);
  assert.deepEqual(resumed.observe([boris,lev]),[lev]);
  resumed.reset();assert.deepEqual(resumed.observe([boris]),[boris]);
});

test('seeding visible contacts on legacy resume avoids an immediate repeated alert',()=>{
  const tracker=new GuardContactTracker([boris.id]);
  assert.deepEqual(tracker.observe([boris]),[]);
  assert.deepEqual(tracker.observe([boris,lev]),[lev]);
});

function audioFixture(){
  const target=new EventTarget();target.hidden=false;
  const contexts=[];
  const parameter=()=>({value:0,events:[],setValueAtTime(value,time){this.events.push({value,time});},linearRampToValueAtTime(value,time){this.events.push({value,time});}});
  const node=()=>({connections:[],connect(to){this.connections.push(to);},disconnect(){this.disconnected=true;}});
  const makeContext=()=>{
    const context={state:'suspended',currentTime:3,destination:{},gains:[],sources:[],resume(){this.state='running';return Promise.resolve();},close(){this.state='closed';return Promise.resolve();},
      createGain(){const gain={...node(),gain:parameter()};this.gains.push(gain);return gain;},
      createOscillator(){const source={...node(),frequency:parameter(),starts:[],stops:[],start(at){this.starts.push(at);},stop(at){this.stops.push(at);}};this.sources.push(source);return source;}};
    contexts.push(context);return context;
  };
  return {target,contexts,sound:new GuardAlertSound({target,makeContext})};
}

test('sound waits for a game gesture and never queues blocked alerts for a later click',async()=>{
  const {target,contexts,sound}=audioFixture();
  assert.equal(sound.play(),false);assert.equal(contexts.length,0);
  target.dispatchEvent(new Event('pointerdown'));await sound.unlock();
  assert.equal(contexts.length,1);assert.equal(contexts[0].sources.length,0);
  assert.equal(sound.play(),true);assert.equal(contexts[0].sources.length,2);
  assert.ok(contexts[0].sources[1].starts[0]>contexts[0].sources[0].stops[0]);
  assert.ok(contexts[0].sources.at(-1).stops[0]-contexts[0].currentTime<.5);
  assert.ok(contexts[0].gains[0].gain.value>0&&contexts[0].gains[0].gain.value<=.15);
  await sound.dispose();
});

test('hidden or suspended pages stay silent and rapid discoveries cannot stack voices',async()=>{
  const {target,contexts,sound}=audioFixture();await sound.unlock();
  target.hidden=true;assert.equal(sound.play(),false);target.hidden=false;
  contexts[0].state='suspended';assert.equal(sound.play(),false);await sound.unlock();
  assert.equal(sound.play(),true);const previous=[...sound.voices];
  assert.equal(sound.play(),true);assert.equal(sound.voices.size,2);
  assert.ok(previous.every(voice=>voice.source.disconnected&&voice.gain.disconnected));
  await sound.dispose();assert.equal(sound.voices.size,0);assert.equal(contexts[0].state,'closed');
  target.dispatchEvent(new Event('keydown'));assert.equal(contexts.length,1);
});

test('missing Web Audio and denied playback remain harmless',async()=>{
  const unsupported=new GuardAlertSound({makeContext:()=>null});
  assert.equal(await unsupported.unlock(),false);assert.equal(unsupported.play(),false);await unsupported.dispose();
  const {sound,contexts}=audioFixture();await sound.unlock();
  contexts[0].state='suspended';contexts[0].resume=()=>Promise.reject(Error('Playback denied'));
  assert.equal(await sound.unlock(),false);assert.equal(sound.play(),false);await sound.dispose();
});

function indicatorFixture(){
  const classes=new Set(),button={offsetWidth:60,classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)}},status={textContent:''};
  const sound={plays:0,stops:0,play(){this.plays++;return true;},stop(){this.stops++;},dispose(){this.disposed=true;}};
  return {classes,status,sound,indicator:new GuardAlertIndicator(button,status,sound)};
}

test('simultaneous new guards share one accessible alert and the pulse expires',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const {classes,status,sound,indicator}=indicatorFixture();
  indicator.notify([boris,lev]);assert.equal(sound.plays,1);assert.equal(classes.has('guard-alert'),true);
  assert.match(status.textContent,/2 new guards spotted: Boris, Lev/);
  t.mock.timers.tick(1999);assert.equal(classes.has('guard-alert'),true);
  t.mock.timers.tick(1);assert.equal(classes.has('guard-alert'),false);assert.equal(status.textContent,'');
});

test('a later discovery restarts the bounded pulse and leaving play cancels it',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const {classes,status,sound,indicator}=indicatorFixture();
  indicator.notify([boris]);t.mock.timers.tick(1500);indicator.notify([lev]);t.mock.timers.tick(500);
  assert.equal(classes.has('guard-alert'),true);assert.match(status.textContent,/Lev/);assert.equal(sound.plays,2);
  indicator.stop();assert.equal(classes.has('guard-alert'),false);assert.equal(status.textContent,'');
  t.mock.timers.tick(2000);assert.equal(classes.has('guard-alert'),false);indicator.dispose();assert.equal(sound.disposed,true);
});
