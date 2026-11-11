import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {STEALTH_SCENARIO,runStealthTrial,trialSeed} from './stealth-scenarios.mjs';

const options={trials:1000,seed:1947,output:'artifacts/stealth-metrics/latest.json'};
const args=process.argv.slice(2);
for(let i=0;i<args.length;i+=2){
  const key=args[i]?.slice(2),value=args[i+1];
  if(!args[i]?.startsWith('--')||!Object.hasOwn(options,key)||value===undefined)
    throw Error('Usage: node tools/benchmark-stealth.mjs [--trials 1000] [--seed 1947] [--output FILE]');
  options[key]=key==='output'?value:Number(value);
}
if(!Number.isSafeInteger(options.trials)||options.trials<1||options.trials>100000||
  !Number.isSafeInteger(options.seed)||options.seed<0||options.seed>0xffffffff)
  throw Error('Trials must be 1–100000 and the base seed must be a uint32.');

function interval(successes,total){
  const p=successes/total,z=1.95996398454,denominator=1+z*z/total;
  const center=(p+z*z/(2*total))/denominator;
  const half=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/denominator;
  return [center-half,center+half];
}
const mean=values=>values.length?values.reduce((sum,v)=>sum+v,0)/values.length:null;
const sourceFiles=[
  'tools/stealth-scenarios.mjs','tools/benchmark-stealth.mjs','maps/mount-dora/project.json',
  ...['solo-game.js','realtime-combat.js','frame-timing.js','mount-dora-world.js',
    'aft/tactics/character-stats.js','aft/tactics/solo-weapon-data.js','aft/tactics/quickplay-presets.js',
    'aft/tactics/aim-levels.js','aft/tactics/core/perception.js',
    'designer/a20b343a0234/tactics/ballistic-shot.js','designer/a20b343a0234/tactics/helicoid-shot.js',
    'designer/a20b343a0234/tactics/core/woodland.js','designer/a20b343a0234/tactics/foliage-data.js'
  ].map(file=>'sites/tactical-animal/dist/'+file)
];
const report={version:1,createdAt:new Date().toISOString(),
  commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),
  sourceSha256:Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(new URL('../'+file,import.meta.url))).digest('hex')])),
  scenario:STEALTH_SCENARIO,options,routes:{}};
const start=performance.now();
for(const [id,route] of Object.entries(STEALTH_SCENARIO.routes)){
  const trials=[];
  for(let i=0;i<options.trials;i++){
    trials.push(runStealthTrial(id,trialSeed(i,options.seed)));
    if((i+1)%250===0)console.log(id+' '+(i+1)+'/'+options.trials+' trials');
  }
  const wins=trials.filter(t=>t.win);
  const result={targetWinRate:route.targetWinRate,trials:trials.length,wins:wins.length,
    winRate:wins.length/trials.length,confidence95:interval(wins.length,trials.length),
    outcomes:Object.fromEntries(['victory','dead','timeout'].map(o=>[o,trials.filter(t=>t.outcome===o).length])),
    meanWinningHp:mean(wins.map(t=>t.hp)),meanWinningHpFraction:mean(wins.map(t=>t.hp/t.maxHp)),
    lowHealthVictories:wins.filter(t=>t.hp/t.maxHp<=.25).length,
    oneHitFromDeathVictories:wins.filter(t=>t.hp<=t.maximumGuardTorsoDamage).length,
    meanSeconds:mean(trials.map(t=>t.seconds)),
    spottedBeforeAttack:trials.filter(t=>t.spottedBeforeAttack).length/trials.length,
    meanPlayerShots:mean(trials.map(t=>t.shots)),meanGuardShots:mean(trials.map(t=>t.guardShots)),
    collateralHits:trials.reduce((sum,t)=>sum+t.collateralHits,0),runs:trials};
  report.routes[id]=result;
  const percent=value=>(value*100).toFixed(1)+'%';
  console.log(id+' '+result.wins+'/'+result.trials+' victories ('+percent(result.winRate)+
    ', 95% interval '+result.confidence95.map(percent).join('–')+'), winning health '+
    (result.meanWinningHpFraction===null?'n/a':percent(result.meanWinningHpFraction))+
    ', one hit from death '+result.oneHitFromDeathVictories+'/'+result.wins+
    ', spotted before attack '+percent(result.spottedBeforeAttack)+', collateral hits '+result.collateralHits);
}
const frontal=report.routes.frontal.runs,flank=report.routes.flank.runs;
report.pairedOutcomes={
  bothWin:frontal.filter((t,i)=>t.win&&flank[i].win).length,
  frontalOnly:frontal.filter((t,i)=>t.win&&!flank[i].win).length,
  flankOnly:frontal.filter((t,i)=>!t.win&&flank[i].win).length,
  neitherWin:frontal.filter((t,i)=>!t.win&&!flank[i].win).length
};
report.runtimeSeconds=(performance.now()-start)/1000;
const destination=path.resolve(options.output);
fs.mkdirSync(path.dirname(destination),{recursive:true});
fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
console.log('Wrote '+options.output+' in '+report.runtimeSeconds.toFixed(1)+' seconds.');
