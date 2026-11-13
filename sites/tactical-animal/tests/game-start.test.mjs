import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {app} from './app-harness.mjs';

function startup(href='https://example.test/game.html?activity=pinewire-prison&rules=turn-based#briefing'){
  const elements=new Map(),events=new Map(),timers=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{id,dataset:{}});return elements.get(id);};
  let nextTimer=0;
  const location={href,replace:url=>{location.replaced=url;}};
  const document={body:{dataset:{}},getElementById:element},window={addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  vm.runInNewContext(fs.readFileSync(new URL('../dist/game-start.js',import.meta.url),'utf8'),{
    document,window,location,URL,Date,
    setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
  });
  return {element,document,window,location,timers,events,fire:(name,target)=>events.get(name)?.({target})};
}

test('a failed application import retries once, retaining the selected operation and rules without a reload loop',()=>{
  const s=startup(),retry=new URL(s.element('startup-retry').href);
  assert.equal(retry.searchParams.get('activity'),'pinewire-prison');assert.equal(retry.searchParams.get('rules'),'turn-based');assert.equal(retry.hash,'#briefing');assert.ok(retry.searchParams.get('reload'));
  s.fire('error',{id:'game-entry'});
  assert.equal(s.element('game-startup').dataset.state,'retrying');assert.equal(s.events.size,0);assert.equal(s.timers.size,1);
  [...s.timers.values()][0]();const next=new URL(s.location.replaced);
  assert.equal(next.searchParams.get('activity'),'pinewire-prison');assert.equal(next.searchParams.get('rules'),'turn-based');assert.equal(next.hash,'#briefing');assert.equal(next.searchParams.get('startupRetry'),'1');
  const again=startup(next.href);again.fire('error',{id:'game-entry'});
  assert.equal(again.element('game-startup').dataset.state,'failed');assert.match(again.element('startup-heading').textContent,/could not load/);assert.equal(again.timers.size,0);assert.equal(again.events.size,0);
  const manual=new URL(again.element('startup-retry').href);assert.equal(manual.searchParams.get('activity'),'pinewire-prison');assert.equal(manual.searchParams.has('startupRetry'),false);
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
