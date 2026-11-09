// Integration audit through production Core.travel, using the reviewed source
// routes and art solids. This is offline evidence, not a second movement engine.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2);
assert(args.length===0||args.length===2&&args[0]==='--runtime','Usage: node tools/maps/review-mount-dora-travel.mjs [--runtime APP_DIST]');
const runtime=args.length?path.resolve(args[1]):path.join(root,'sites/tactical-animal/dist');
const town=path.join(root,'maps/mount-dora');
const fixture=JSON.parse(fs.readFileSync(path.join(town,'playable/route-fixtures.json')));
const projectBytes=fs.readFileSync(path.join(town,'project.json'));
assert.equal(createHash('sha256').update(projectBytes).digest('hex'),fixture.sourceProjectSHA256);
const project=JSON.parse(projectBytes);
const load=relative=>import(pathToFileURL(path.join(runtime,relative)).href);
const [{TownWorld},{Core,createSoloGame,hero,DEFAULT_BUILD},art]=await Promise.all([
  load('mount-dora-world.js'),load('solo-game.js'),load('mission-art/mount-dora/manifest.js')
]);
const report={schema:'mount-dora-production-travel/1',sourceDigest:project.generation.sourceDigest,artRevision:art.ART_REVISION,
  movement:'Production Core.travel with native wall slabs, source terrain, vegetation and production art solids',
  scope:'Continuous physical travel; rendering, input and loading failures are covered by native browser acceptance.',routes:[],boardwalks:[]};
const asGame=p=>({x:p[0]-.5,y:p[1]-.5});
async function run(points){
  const world=await new TownWorld(project,{baseURL:pathToFileURL(town+path.sep),fetcher:async url=>new Response(fs.readFileSync(url)),art}).identify();
  world.startPoint=asGame(points[0]);
  try{
    await world.readyAt(world.startPoint);assert(world.pointClear(world.startPoint),'Starting approach must be clear.');
    const state=Core.enableRealtime(createSoloGame(DEFAULT_BUILD,1947,'mount-dora',{tourWorld:world})),unit=hero(state);
    const pack=JSON.stringify(unit.pack);let segments=0;
    for(const end of points.slice(1)){
      const from={x:unit.x,y:unit.y},to=asGame(end),distance=Math.hypot(to.x-from.x,to.y-from.y),steps=Math.max(1,Math.ceil(distance/3));
      for(let i=1;i<=steps;i++){
        const target={x:from.x+(to.x-from.x)*i/steps,y:from.y+(to.y-from.y)*i/steps};
        await world.readyAt(target);
        const dx=target.x-unit.x,dy=target.y-unit.y,wanted=Math.hypot(dx,dy),walked=Core.travel(state,unit,dx,dy);
        assert(Math.abs(walked-wanted)<1e-5&&Math.hypot(unit.x-target.x,unit.y-target.y)<1e-5,
          'Production movement blocked before town '+end+'; actual town '+[unit.x+.5,unit.y+.5]);
        segments++;
      }
    }
    assert.equal(state.phase,'explore');assert.equal(JSON.stringify(unit.pack),pack);
    assert(world.stats.peakDecoded<=9&&world.stats.peakFetches<=2&&world.stats.peakQueued<=9);
    return {metres:state.solo.distance,segments,peakDecoded:world.stats.peakDecoded,peakFetches:world.stats.peakFetches,evicted:world.stats.evicted};
  }finally{world.dispose();assert.equal(world.cache.size,0);assert.equal(world.inFlight.size,0);}
}
for(const route of fixture.routes){
  if(route.id==='palm-island')continue; // Follow the actual lane below, rather than a pre-art grid route across its side rails.
  const points=route.turnPoints;
  const result=await run([...points,...points.slice(0,-1).reverse()]);
  report.routes.push({id:route.id,...result});console.log('PASS continuous approach and return: '+route.id);
}
for(const lane of fixture.boardwalkLanes){
  const points=lane.townPoints;
  const result=await run([...points,...points.slice(0,-1).reverse()]);
  report.boardwalks.push({sourceId:lane.sourceId,...result});console.log('PASS full mapped boardwalk and return: '+lane.sourceId);
}
const out=path.join(root,'artifacts/mount-dora-playable/integrated-travel.json');fs.mkdirSync(path.dirname(out),{recursive:true});
report.passed=true;fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
