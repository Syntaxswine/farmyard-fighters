import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {app} from './app-harness.mjs';

function startup(){
  const elements=new Map(),events=new Map(),timers=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{id,dataset:{}});return elements.get(id);};
  const document={body:{dataset:{}},getElementById:element},window={addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  vm.runInNewContext(fs.readFileSync(new URL('../dist/game-start.js',import.meta.url),'utf8'),{
    document,window,location:{href:'https://example.test/game.html?activity=pinewire-prison&rules=turn-based#briefing'},URL,Date,
    setTimeout:fn=>{timers.set(1,fn);return 1;},clearTimeout:id=>timers.delete(id),
  });
  return {element,document,window,timers,events,fire:(name,target)=>events.get(name)?.({target})};
}

test('a failed application import offers a fresh-page retry that retains the selected operation and rules',()=>{
  const s=startup(),retry=new URL(s.element('startup-retry').href);
  assert.equal(retry.searchParams.get('activity'),'pinewire-prison');assert.equal(retry.searchParams.get('rules'),'turn-based');assert.equal(retry.hash,'#briefing');assert.ok(retry.searchParams.get('reload'));
  s.fire('error',{id:'game-entry'});
  assert.equal(s.element('game-startup').dataset.state,'failed');assert.match(s.element('startup-heading').textContent,/could not load/);assert.equal(s.timers.size,0);assert.equal(s.events.size,0);
});

test('a slow import stays recoverable, and an optional image error does not fail startup',()=>{
  const s=startup();s.fire('error',{id:'hero-portrait'});assert.equal(s.element('game-startup').dataset.state,undefined);
  s.timers.get(1)();assert.equal(s.element('game-startup').dataset.state,'slow');assert.match(s.element('startup-copy').textContent,/keep waiting/);
  s.document.body.dataset.gameReady='true';s.fire('load',{id:'game-entry'});assert.equal(s.timers.size,0);assert.equal(s.events.size,0);
});

test('an application evaluation error is recoverable, while errors after preparation is ready do not replace it',()=>{
  const failed=startup();failed.fire('error',failed.window);assert.equal(failed.element('game-startup').dataset.state,'failed');
  const ready=startup();ready.document.body.dataset.gameReady='true';ready.fire('error',ready.window);assert.equal(ready.element('game-startup').dataset.state,undefined);
});

test('preparation becomes available only after its actual choices and deployment handlers initialize',()=>{
  const a=app({autoDeploy:false,realTime:true,search:'?activity=pinewire-prison'});
  assert.equal(a.document.body.dataset.gameReady,'true');assert.equal(a.el('game-startup').hidden,true);assert.equal(a.el('prep').inert,false);assert.equal(a.el('prep')['aria-busy'],'false');assert.equal(a.el('deploy').disabled,false);
  assert.equal(a.el('animals').children.length,6);assert.ok(a.el('primary').children.length>0);a.el('deploy').click();assert.equal(a.s.solo.missionId,'pinewire-prison');
});
