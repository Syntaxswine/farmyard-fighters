import {refreshStats} from './aft/tactics/character-stats.js';
export const CAREER_SAVE='farmyard-fighters:careers-v1';
export const CAREER_SKILLS=['firearms','heavyWeapons','explosives','dexterity','sneak'];
const zeros=()=>Object.fromEntries(CAREER_SKILLS.map(k=>[k,0]));
const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e9;
export function createRealtimeCareers(backend,presets){
  function read(){
    const text=backend.getItem(CAREER_SAVE),data=text?JSON.parse(text):{version:1,animals:{}};
    if(data?.version!==1||!data.animals||typeof data.animals!=='object'||Array.isArray(data.animals))throw Error('Unsupported real-time careers.');
    for(const [id,runs]of Object.entries(data.animals)){
      if(!presets.some(p=>p.id===id)||!runs||typeof runs!=='object'||Array.isArray(runs)||Object.keys(runs).length>10000)throw Error('Unsupported animal career.');
      for(const [id,run]of Object.entries(runs))if(!/^[a-zA-Z0-9-]{1,64}$/.test(id)||!count(run.kills)||!run.earned||!CAREER_SKILLS.every(k=>count(run.earned[k])))throw Error('Unsupported career checkpoint.');
    }return data;
  }
  function totals(data,animal){
    const result={kills:0,earned:zeros(),gains:zeros(),xp:zeros()},base=presets.find(p=>p.id===animal)?.stats;
    if(!base)throw Error('Unknown animal career.');
    for(const run of Object.values(data.animals[animal]||{})){result.kills+=run.kills;for(const k of CAREER_SKILLS)result.earned[k]+=run.earned[k];}
    for(const k of CAREER_SKILLS){const n=Math.min(100-base[k],Math.floor(Math.sqrt(result.earned[k]+1)-1));result.gains[k]=n;result.xp[k]=result.earned[k]-n*(n+2);}
    return result;
  }
  function apply(s,total){
    const u=s.units.find(u=>u.team==='squad'),base=presets.find(p=>p.id===s.solo.build.animal).stats;
    for(const k of CAREER_SKILLS)u.stats[k]=Math.min(100,base[k]+total.gains[k]);
    s.realtime.gains={...total.gains};s.realtime.xp={...total.xp};s.realtime.careerKills=total.kills;refreshStats(u);
  }
  function sync(s){
    if(!s.realtime)return;
    const data=read(),r=s.realtime,animal=s.solo.build.animal,runs=data.animals[animal]??={};
    const previous=runs[r.runId]||{kills:0,earned:zeros()};
    runs[r.runId]={kills:Math.max(previous.kills,r.kills),earned:Object.fromEntries(CAREER_SKILLS.map(k=>[k,Math.max(previous.earned[k],r.earned[k])]))};
    const total=totals(data,animal);backend.setItem(CAREER_SAVE,JSON.stringify(data));apply(s,total);return total;
  }
  // Old operation checkpoints cannot award the same run's kills again. A new
  // operation uses a new run id, so genuine later kills continue the career.
  return {sync,inspect:animal=>totals(read(),animal)};
}
