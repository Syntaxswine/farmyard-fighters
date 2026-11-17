import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Core,DEFAULT_BUILD,createSoloGame,hero,encodeSave,decodeSave,freePoint,projectileSegmentClear} from '../dist/solo-game.js';
import {doorFootprint} from '../dist/interactions.js';
import {windowReviewSource,WINDOW_REVIEW_ID} from '../dist/window-review-map.js';
import {app} from './app-harness.mjs';

function fixture(axis='e',sign=1,obstruct=false){
 const source=windowReviewSource();source.farmyardWindows.instances=[];source.edges={[axis+':20:25']:'door-wood-closed',...(obstruct==='wall'?{'e:19:25':'wall-brick'}:{})};if(obstruct==='crate')source.terrain[24][20]='crate';
 const state=createSoloGame(DEFAULT_BUILD,1947,WINDOW_REVIEW_ID,{authoredMap:source}),unit=hero(state),door=state.interactables.find(o=>o.kind==='door');door.swing=sign;
 Object.assign(unit,{x:door.x+(axis==='e'?sign*.34:-.3),y:door.y+(axis==='s'?sign*.34:-.3),ap:5});state.phase='player';state.engaged=true;Core.refresh(state,{forceFog:true});return {state,unit,door};
}
for(const axis of ['e','s'])for(const sign of [1,-1])test('a close animal can push/pull an imported '+axis+' door away from swing '+sign+' without moving or spending twice',()=>{
 const {state:s,unit:u,door:d}=fixture(axis,sign),position={x:u.x,y:u.y},before=encodeSave(s),leaf=doorFootprint(d,true);
 assert(freePoint(s,u,u.id),'The player is at a physically clear approach, despite artwork overlap');
 assert(u.x>=leaf.x0-.23&&u.x<=leaf.x1+.23&&u.y>=leaf.y0-.23&&u.y<=leaf.y1+.23);
 assert(Core.previewInteraction(s,d.id,'open').ok);assert.equal(encodeSave(s),before,'Preview must not flip the real leaf or spend AP');
 assert(Core.performInteraction(s,d.id,'open').ok);assert.equal(d.swing,-sign);assert.equal(u.ap,4);assert.deepEqual({x:u.x,y:u.y},position);assert(freePoint(s,u,u.id));
 const a={x:d.x+(axis==='e'?-.6:0),y:d.y+(axis==='s'?-.6:0),h:1.1},b={x:d.x+(axis==='e'?.6:0),y:d.y+(axis==='s'?.6:0),h:1.1};assert(projectileSegmentClear(s,a,b));
 const resumed=decodeSave(encodeSave(s)),rd=resumed.interactables.find(o=>o.id===d.id);assert.equal(rd.swing,-sign);assert(rd.open);assert(freePoint(resumed,hero(resumed),hero(resumed).id));
});
test('a reverse swing still refuses a solid obstruction or another living animal and spends no AP',()=>{
 for(const obstacle of ['wall','crate','animal']){
  const {state:s,unit:u,door:d}=fixture('e',1,obstacle);
  if(obstacle==='animal'){const b=doorFootprint({...d,swing:-1},true);Object.assign(s.units[1],{x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2});}
  const before=encodeSave(s),result=Core.performInteraction(s,d.id,'open');assert(!result.ok,obstacle);assert.match(result.reason,/obstructed|doorway/);assert.equal(u.ap,5);assert.equal(encodeSave(s),before);
 }
});
test('the contextual door button stays available as the camera moves and opens on a single tap',()=>{
 const {state:s}=fixture(),a=app({realTime:true,initialState:s});
 a.view.interactionAnchor=()=>({visible:false,x:-200,y:-200});a.advance(3);
 assert(!a.el('interaction-hand').hidden);assert.equal(a.el('interaction-label').textContent,'Open door');assert.equal(a.el('interaction-target').textContent,'Wooden door');assert.equal(a.el('interaction-hand').style.top,undefined);
 a.el('interaction-hand').click();assert(s.interactables.find(o=>o.kind==='door').open);assert.equal(a.el('interaction-label').textContent,'Close door');assert(!a.el('overlay').open);
});
