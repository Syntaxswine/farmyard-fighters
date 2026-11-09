export const AUTOSAVE_INTERVAL_MS=30000;
const stamp=s=>({revision:s.revision,round:s.round,minutes:s.clock?.minutes,phase:s.phase});
// The deadline belongs to the last completed checkpoint. Movement/awareness
// make it dirty without restarting that deadline, so long walks cannot starve it.
export class AutosaveSchedule {
 constructor(state,now){this.saved(stamp(state),now);}
 snapshot(state){return stamp(state);}
 saved(snapshot,now){this.checkpoint={...snapshot};this.lastSave=now;}
 reset(state,now){this.saved(stamp(state),now);}
 dirty(state){const next=stamp(state);return Object.keys(next).some(k=>next[k]!==this.checkpoint[k]);}
 due(state,now,{hidden=false}={}){
  return this.dirty(state)&&(hidden||state.round!==this.checkpoint.round||['won','lost'].includes(state.phase)&&state.phase!==this.checkpoint.phase||now-this.lastSave>=AUTOSAVE_INTERVAL_MS);
 }
}
