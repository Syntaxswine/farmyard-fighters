import {loadWeight} from './core/inventory.js';
import {carryCapacity} from './inventory-tools.js';
import {injuryMovement} from './combat-state.js';

export const CLIMBS=Object.freeze({
 ladder:{label:'Ladder',required:2.5,startAP:6,endAP:2},
 window:{label:'Window',required:20,startAP:4,endAP:2},
 roof:{label:'Roof',required:40,startAP:8,endAP:4},
 wall:{label:'Wall',required:90,startAP:12,endAP:8},
 // Authored cliff ledges retain their established eight-AP action.
 cliff:{label:'Cliff ledge',required:50,startAP:8,endAP:8}
});
export const climbingSkill=u=>Math.max(1,Math.min(100,u?.stats?.climbing??50));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function climbingPenalty(u){
 const exhausted=1-clamp((u.stamina??100)/Math.max(1,u.maxStamina??100),0,1);
 const fatigued=clamp((u.social?.fatigue??0)/100,0,1);
 const injured=1-clamp((u.hp??u.maxHp??100)/Math.max(1,u.maxHp??100),0,1);
 const overloaded=Math.max(0,loadWeight(u)/carryCapacity(u)-1);
 return Math.round(Math.max(exhausted,fatigued)*20+injured*10+Math.min(30,overloaded*20));
}
export function climbingPreview(u,route,combat=false){
 const rule=CLIMBS[route?.kind];if(!rule)return null;
 // Original, non-stat simulations keep their established movement rules.
 if(!u?.stats)return {ok:!['window','wall'].includes(route.kind),reason:'Climbing requires character skills.',cost:route.cost,chance:100,critical:0,automatic:true,legacy:true,required:rule.required};
 const skill=climbingSkill(u),penalty=climbingPenalty(u),effective=Math.max(0,skill-penalty);
 const critical=route.kind==='ladder'&&!route.rusty?0:1;
 const ratio=effective/rule.required;
 const chance=Math.min(100-critical,Math.max(effective>0?1:0,Math.floor((ratio<1?60*ratio*ratio:60+40*(ratio-1))+1e-8)));
 const progress=clamp((skill-rule.required)/(100-rule.required),0,1);
 const running=route.kind==='ladder'&&skill===100&&u.running&&!u.sneaking;
 const cost=Math.ceil(rule.startAP+(rule.endAP-rule.startAP)*progress-1e-8)*injuryMovement(u)*(running?.5:1);
 const ok=route.kind!=='ladder'||skill>1&&(!combat||skill>=rule.required);
 const reason=ok?'':skill<=1?'Climbing 1 cannot use ladders.':'Climbing 2 can only attempt ladders outside combat.';
 return {ok,reason,required:rule.required,skill,effective,penalty,chance:ok?chance:0,critical,cost,automatic:ok&&effective>=2*rule.required,running};
}
export function climbRiskText(preview){
 if(!preview||preview.legacy)return '';
 return preview.ok?`${preview.chance}% success${preview.critical?' · 1% critical failure':''}`:preview.reason;
}
// A separate saved stream prevents hovering/pathfinding from affecting shots.
// Roll 100 is a critical failure only on risky climbs, including rusty ladders.
export function rollClimb(state,unit,route){
 const combat=['player','enemy'].includes(state.phase)||['explore','won'].includes(state.phase)&&(!!state.engaged||!!state.alerted?.size);
 const p=climbingPreview(unit,route,combat);if(!p)return {success:true,checked:false};
 if(!p.ok)return {success:false,blocked:true,...p};
 if(p.chance===100)return {...p,success:true,checked:true,roll:null};
 state.climbSeed=(Math.imul((state.climbSeed??state.seed)>>>0,1664525)+1013904223)>>>0;
 const roll=1+Math.floor(state.climbSeed/4294967296*100),critical=!!p.critical&&roll===100;
 return {...p,roll,checked:true,success:!critical&&roll<=p.chance,criticalFailure:critical,fall:route.kind!=='window'&&(critical||roll>p.chance+25)};
}
export function climbingMapErrors(map){
 const errors=[];
 for(const p of [...(map.stairs||[]),...(map.props||[])])if(p.rusty!==undefined&&(typeof p.rusty!=='boolean'||!['ladder','wooden-spotlight-tower','iron-searchlight-ladder-tower'].includes(p.kind)))errors.push('Rust is a boolean ladder condition.');
 for(const p of [...(map.starts||[]),...(map.guards||[])])if(p.stats?.climbing!==undefined&&(!Number.isInteger(p.stats.climbing)||p.stats.climbing<1||p.stats.climbing>100))errors.push('Climbing must be a whole number from 1 to 100.');
 return errors;
}
