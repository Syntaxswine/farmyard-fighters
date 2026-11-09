import {recoverStamina} from './stamina.js';
import {refresh} from './core/engine.js';
import {createClock,mapStartMinutes,elapsedGameMinutes,advanceClock,observeRoundTime,turnBased} from './game-clock.js';
import {settleMorale,settleContracts} from './core/world.js';

export function startEncounterClock(state){state.clock=createClock(mapStartMinutes(state.definition));observeRoundTime(state.clock,state);return state.clock;}
export function settleEncounterRounds(state){return advanceEncounterTime(state,observeRoundTime(state.clock,state),false);}
export function advanceEncounterTime(state,delta,recovery=true){
 const minutes=advanceClock(state.clock,delta);
 if(minutes){if(recovery)recoverStamina(state,minutes);const context={clock:state.clock,current:'encounter'};settleMorale(context,state,minutes);settleContracts(context,state);}
 return minutes;
}
export function tickEncounterClock(state,elapsedMs,{paused=false}={}){
 if(paused)return 0;
 const rounds=settleEncounterRounds(state);
 if(state.rules?.awareness&&!turnBased(state)&&state.phase!=='lost'){
  let remaining=elapsedGameMinutes(elapsedMs)*60,total=rounds;
  while(remaining>1e-8&&!turnBased(state)&&state.phase!=='lost'){
   const step=Math.min(remaining,5-(state.awarenessPending||0));
   total+=advanceEncounterTime(state,step/60);remaining-=step;state.awarenessPending=(state.awarenessPending||0)+step;
   if(state.awarenessPending>=5-1e-8){state.awarenessSeconds=5;state.awarenessPending=0;refresh(state);}
  }
  return total;
 }
 return rounds+(state.phase==='lost'||turnBased(state)?0:advanceEncounterTime(state,elapsedGameMinutes(elapsedMs)));
}
