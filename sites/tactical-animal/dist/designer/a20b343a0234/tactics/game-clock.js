// Game time is cumulative minutes from Day 1, 00:00. Wall/animation time is ms.
import {WALK_ROUND_MS} from './movement-timing.js';
export const MINUTES_PER_HOUR=60,MINUTES_PER_DAY=1440,START_MINUTES=480;
export const DAWN_START=300,DAY_START=360,DUSK_START=1080,NIGHT_START=1200;
export const COMBAT_ROUND_MINUTES=1;
export const PLAY_MINUTES_PER_SECOND=COMBAT_ROUND_MINUTES*1000/WALK_ROUND_MS;
export const turnBased=state=>state.phase==='player'||state.phase==='enemy';
const rounds=new WeakMap();
export function observeRoundTime(clock,state){
 const before=rounds.get(clock),combat=turnBased(state);
 rounds.set(clock,{state,round:state.round,combat});
 if(!before||before.state!==state||!before.combat)return 0;
 const completed=Math.max(0,state.round-before.round);
 // Entering combat opens a round; it does not complete one. A contact ending
 // mid-round (including victory/defeat) consumes that final round exactly once.
 return (completed||(!combat?1:0))*COMBAT_ROUND_MINUTES;
}
export function createClock(minutes=START_MINUTES){
 if(!Number.isFinite(minutes)||minutes<0)throw Error('Clock minutes must be finite and nonnegative.');
 return {minutes,incomeRemainder:0};
}
export const elapsedGameMinutes=ms=>Number.isFinite(ms)&&ms>0?ms/1000*PLAY_MINUTES_PER_SECOND:0;
export function advanceClock(clock,minutes){
 if(!Number.isFinite(minutes)||minutes<=0||!Number.isFinite(clock.minutes+minutes))return 0;
 clock.minutes+=minutes;return minutes;
}
export function timeOfDay(clock){
 const whole=Math.floor(clock.minutes+1e-9),minuteOfDay=whole%MINUTES_PER_DAY;
 return {day:Math.floor(whole/MINUTES_PER_DAY)+1,hour:Math.floor(minuteOfDay/MINUTES_PER_HOUR),minute:minuteOfDay%MINUTES_PER_HOUR,minuteOfDay,phase:minuteOfDay<DAWN_START||minuteOfDay>=NIGHT_START?'night':minuteOfDay<DAY_START?'dawn':minuteOfDay>=DUSK_START?'dusk':'day'};
}
export function formatClock(clock){const t=timeOfDay(clock);return `Day ${t.day} · ${String(t.hour).padStart(2,'0')}:${String(t.minute).padStart(2,'0')}`;}
export function mapStartMinutes(map){
 const value=map?.time?.startMinutes??START_MINUTES;
 if(!Number.isInteger(value)||value<0||value>=MINUTES_PER_DAY)throw Error('Map start time must be a whole minute from 00:00 to 23:59.');
 return value;
}
// Reset at visibility/menu transitions: a browser can suspend RAF entirely.
// The first frame after a pause establishes a baseline, never catches up.
export class FrameClock {
 constructor(){this.reset();}
 reset(){this.last=null;this.wasPaused=true;this.mode=null;}
 sample(now,{paused=false,mode=null}={}){
  if(!Number.isFinite(now)){this.reset();return 0;}
  const elapsed=this.last===null||now<this.last||paused||this.wasPaused||mode!==this.mode?0:now-this.last;
  this.last=now;this.wasPaused=paused;this.mode=mode;return elapsed;
 }
}
