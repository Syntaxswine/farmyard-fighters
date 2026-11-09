import {test} from 'node:test';
import {app} from './app-harness.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TownWorld} from '../dist/mount-dora-world.js';
import {createSoloGame,DEFAULT_BUILD,Core,hero,encodeSave,tick} from '../dist/solo-game.js';
import * as ART from '../dist/mission-art/mount-dora/manifest.js';
import {loadTownTour,visitTownLandmark,TOUR_VISITS} from '../dist/mount-dora-entry.js';
import {getTourWorld,TOUR_ACTIVITY} from '../dist/mount-dora-activity.js';
import {readTourProgress} from '../dist/mount-dora-progress.js';
import {createOperationStorage,OPERATION_SAVE} from '../dist/operation-storage.js';
import {normalizeBuild,decodeSave,MISSIONS} from '../dist/solo-game.js';
const base=new URL('../../../maps/mount-dora/',import.meta.url),projectURL=new URL('project.json',base),project=JSON.parse(fs.readFileSync(projectURL));
const fetcher=async url=>new Response(fs.readFileSync(url));
const shelterVisits={'donnelly-park':'md:donnelly-stage','elizabeth-evans':'md:evans-pavilion','gilbert-park':'md:shelter:557154684'};
async function idle(w){while(w.inFlight.size||w.queue.length)await new Promise(r=>setTimeout(r,1));}
test('committed production art leaves every source-reviewed visit approach clear and obeys all native ownership replacements',async()=>{
  const w=await new TownWorld(project,{baseURL:base,fetcher,art:ART}).identify();
  try{for(const visit of TOUR_VISITS){const p={x:visit.town[0]-.5,y:visit.town[1]-.5};await w.readyAt(p);assert(w.resumeClear(p),visit.id);assert(w.cache.size<=9);if(shelterVisits[visit.id]){const artwork=ART.PLACEMENTS.find(p=>p.id===shelterVisits[visit.id]);assert(artwork);assert(Math.hypot(artwork.anchor[0]-visit.town[0],artwork.anchor[1]-visit.town[1])<2,'Open-shelter visit immediately exposes its real artwork');}}assert.equal(w.visualReplacement.size,1079);assert(w.physicalReplacement.size>0);}finally{w.dispose();}
});
test('actual Core travel follows both mapped boardwalk centre lines, joins and returns with production rails intact',async()=>{
  const f=JSON.parse(fs.readFileSync(new URL('features.json',base))).features,first=f.find(x=>x.id==='osm-way-548471563').geometry.coordinates,second=f.find(x=>x.id==='osm-way-688219167').geometry.coordinates;
  const points=[...first,...second.slice(1)].map(p=>({x:p[0]-.5,y:p[1]-.5})),w=await new TownWorld(project,{baseURL:base,fetcher,art:ART}).identify();w.startPoint=points[0];
  try{await w.readyAt(points[0]);await idle(w);const s=Core.enableRealtime(createSoloGame(DEFAULT_BUILD,1947,'mount-dora',{tourWorld:w})),u=hero(s);let length=0;
    for(const p of [...points.slice(1),...points.slice(0,-1).reverse()]){const d=Math.hypot(p.x-u.x,p.y-u.y),walked=Core.travel(s,u,p.x-u.x,p.y-u.y);assert(Math.abs(walked-d)<1e-5,'Mapped deck/rail clearance at '+JSON.stringify(p));assert(Math.hypot(u.x-p.x,u.y-p.y)<1e-5);length+=d;}
    assert(length>1000);assert(Math.abs(s.solo.distance-length)<1e-5);assert(Math.hypot(u.x-points[0].x,u.y-points[0].y)<1e-5);assert.equal(s.phase,'explore');assert(w.stats.peakDecoded<=9);
  }finally{w.dispose();}
});
test('streamed resume retains position and resources while free exploration remains available',async()=>{
  const s=await loadTownTour({build:DEFAULT_BUILD,fetcher,projectURL}),w=getTourWorld(s),u=hero(s);
  try{u.ammo.assault=4;u.stamina=0;u.running=true;const before={x:u.x,y:u.y},round=s.round;tick(s,.05,{x:1,y:0});assert(u.running);assert.equal(u.stamina,0);assert(u.x>before.x);
    assert.equal(s.round,round);assert.equal(s.phase,'explore');
    const saved=readTourProgress(encodeSave(s));const restored=await loadTownTour({build:DEFAULT_BUILD,progress:saved,fetcher,projectURL});try{assert.equal(hero(restored).x,u.x);assert.equal(hero(restored).y,u.y);assert.equal(hero(restored).ammo.assault,4);assert.equal(hero(restored).stamina,u.stamina);for(const key of s.seen)assert(restored.seen.has(key),'Resume preserves explored cell '+key);}finally{getTourWorld(restored).dispose();}
  }finally{w.dispose();}
});
test('explicit visit failure never relocates the animal and choosing it again retries source loading',async()=>{
  let fail=false;const get=async url=>fail&&url.pathname.endsWith('/C05.map.json')?new Response('offline',{status:503}):fetcher(url);
  const s=await loadTownTour({build:DEFAULT_BUILD,fetcher:get,projectURL}),w=getTourWorld(s),u=hero(s);
  try{await idle(w);const before={x:u.x,y:u.y};fail=true;await assert.rejects(visitTownLandmark(s,'grantham-lighthouse'),/C05/);assert.equal(u.x,before.x);assert.equal(u.y,before.y);fail=false;await visitTownLandmark(s,'grantham-lighthouse');assert.equal(u.x,504);assert.equal(u.y,1168);assert(w.pointClear(u));}finally{w.dispose();}
});
test('the operation writer refuses a tour and leaves every normal save byte unchanged',()=>{
  const data=new Map(),backend={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},store=createOperationStorage(backend,{normalizeBuild,encodeSave,decodeSave,missions:[...MISSIONS,TOUR_ACTIVITY]});
  store.write(createSoloGame(DEFAULT_BUILD));const before=new Map(data);assert.throws(()=>store.write({solo:{missionId:'mount-dora'}}),/separate storage/);assert.deepEqual(data,before);assert(data.get(OPERATION_SAVE));store.savePreparation('mount-dora',DEFAULT_BUILD);assert.equal(data.get(OPERATION_SAVE),before.get(OPERATION_SAVE));
});

test('an explicit tour deep link selects preparation without deploying or changing an existing operation save',()=>{
  const normal=encodeSave(createSoloGame(DEFAULT_BUILD)),a=app({autoDeploy:false,search:'?activity=mount-dora',initialStorage:[[OPERATION_SAVE,normal]]});
  assert.equal(a.el('operation-select').value,'mount-dora');assert.equal(a.views.length,0);assert.equal(a.saved.get(OPERATION_SAVE),normal);assert(!a.saved.has('farmyard-mount-dora-tour-v1'));
});
