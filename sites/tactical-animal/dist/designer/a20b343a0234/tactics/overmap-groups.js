import {validateFirstAid} from './overmap-first-aid.js';
import {updateGroupRest,validateGroupRest} from './overmap-rest.js';
import {createTravel,setDestination,travelPreview,validateTravel,groupPace,fatigue,FATIGUE_PER_HOUR,REST_PER_HOUR,REST_AT,RESUME_AT} from './overmap-travel.js';
import {advanceClock} from './game-clock.js';
export function createGroups(map){const state=createTravel(map);return {version:2,clock:{...state.clock},selectedId:null,nextId:2,groups:[{id:'group-1',name:'Group 1',state,waitMinutes:0}]};}
export const arrival=(session,g)=>session.clock.minutes+g.waitMinutes+travelPreview(g.state).travelMinutes+travelPreview(g.state).restMinutes;
export function splitGroup(session,id,memberIds){
 if(session.logistics?.pending)throw Error('Resolve the encounter first.');const group=session.groups.find(g=>g.id===id);if(!group||group.firstAid||group.rest||group.training||group.state.route.length||group.state.progress)throw Error('Split a group while it is stationary.');
 const chosen=new Set(memberIds),members=group.state.members.filter(u=>chosen.has(u.id));
 if(!members.length||members.length===group.state.members.length)throw Error('Choose some members, leaving at least one in the original group.');
 const number=session.nextId++,state=structuredClone(group.state);state.members=members;group.state.members=group.state.members.filter(u=>!chosen.has(u.id));state.restRequired=state.restRequired&&members.some(u=>fatigue(u)>RESUME_AT)||members.some(u=>fatigue(u)>=REST_AT);group.state.restRequired=group.state.restRequired&&group.state.members.some(u=>fatigue(u)>RESUME_AT);
 const next={id:`group-${number}`,name:`Group ${number}`,state,waitMinutes:0};session.groups.push(next);session.selectedId=next.id;return next;
}
export function destinationPreview(session,map,id,destination){
 const group=session.groups.find(g=>g.id===id);if(!group)throw Error('Select a group first.');if(group.firstAid)throw Error('Stop first aid before moving.');if(group.rest)throw Error('Wake this group before moving.');if(group.training)throw Error('This group is training militia. Cancel the assignment before moving.');
 const state=structuredClone(group.state);setDestination(state,map,destination);if(!state.route.length)throw Error('This group is already in that sector.');
 const preview=travelPreview(state),others=session.groups.filter(g=>g.id!==id&&g.state.route.at(-1)?.to===destination);
 const ownArrival=session.clock.minutes+preview.travelMinutes+preview.restMinutes;
 return {state,preview,others:others.map(g=>({id:g.id,name:g.name,arrival:arrival(session,g)})),ownArrival,sharedArrival:Math.max(ownArrival,...others.map(g=>arrival(session,g)))};
}
export function orderGroup(session,map,id,destination,synchronize=false){
 const plan=destinationPreview(session,map,id,destination),group=session.groups.find(g=>g.id===id);
 group.state=plan.state;group.waitMinutes=synchronize?plan.sharedArrival-plan.ownArrival:0;
 if(synchronize)for(const other of plan.others){const g=session.groups.find(g=>g.id===other.id);g.waitMinutes+=plan.sharedArrival-other.arrival;}
 return plan;
}
function strain(state,amount){for(const u of state.members){u.social??={};u.social.fatigue=Math.max(0,Math.min(100,fatigue(u)+amount));}}
// Every group advances over the same interval. Waiting is a coordination hold,
// not recovery; required rest is accounted separately in the arrival forecast.
export function advanceGroups(session,minutes){
 if(!Number.isFinite(minutes)||minutes<=0)throw Error('Choose a positive time interval.');
 for(const group of session.groups){const s=group.state;let left=minutes;
  while(left>1e-8&&s.route.length){
   if(group.waitMinutes>1e-8){const step=Math.min(left,group.waitMinutes);group.waitMinutes-=step;left-=step;continue;}
   const high=Math.max(...s.members.map(fatigue));if(high>=REST_AT-1e-8)s.restRequired=true;
   if(s.restRequired){const needed=Math.max(0,high-RESUME_AT)*60/REST_PER_HOUR,step=Math.min(left,needed);strain(s,-step*REST_PER_HOUR/60);left-=step;if(step>=needed-1e-8)s.restRequired=false;continue;}
   const edge=s.route[0],remaining=groupPace(s.members,edge.road).minutes-s.progress;
   const step=Math.min(left,remaining,(REST_AT-high)*60/FATIGUE_PER_HOUR);strain(s,step*FATIGUE_PER_HOUR/60);s.progress+=step;left-=step;
   if(step>=remaining-1e-8){s.position=edge.to;s.progress=0;s.route.shift();}
   if(Math.max(...s.members.map(fatigue))>=REST_AT-1e-8)s.restRequired=true;
  }
 }
 advanceClock(session.clock,minutes);for(const g of session.groups){g.state.clock={...session.clock};updateGroupRest(g,session.clock.minutes);}
}
export function validateGroups(value,map){
 // Migrate the first travel prototype without dropping its partial journey.
 if(value.version===1){validateTravel(value,map);return {version:2,clock:{...value.clock},selectedId:null,nextId:2,groups:[{id:'group-1',name:'Group 1',state:value,waitMinutes:0}]};}
 const fail=()=>{throw Error('Invalid saved travel groups.');};
 if(value.version!==2||!Array.isArray(value.groups)||!value.groups.length||value.groups.length>32||!Number.isInteger(value.nextId)||value.nextId<2||!Number.isFinite(value.clock?.minutes)||value.clock.minutes<0)fail();
 const ids=new Set(),people=new Set();for(const g of value.groups){if(typeof g.id!=='string'||ids.has(g.id)||typeof g.name!=='string'||g.name.length>100||!Number.isFinite(g.waitMinutes)||g.waitMinutes<0)fail();ids.add(g.id);validateTravel(g.state,map);validateGroupRest(g,value.clock);if(g.state.clock.minutes!==value.clock.minutes)fail();for(const u of g.state.members){if(people.has(u.id))fail();people.add(u.id);}}
 if(value.selectedId!==null&&!ids.has(value.selectedId))fail();if(ids.has(`group-${value.nextId}`))fail();validateFirstAid(value);return value;
}
