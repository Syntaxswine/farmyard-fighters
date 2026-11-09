// Map knowledge is a presentation preference, never a change to perception.
export const terrainKnown=(state,key)=>!state.concealedInteriors?.has(key)&&(state.difficulty==='easy'||state.seen.has(key));
export function personVisible(state,unit){
 if(unit.corpseOmitted||unit.away||['captured','quit'].includes(unit.casualty))return false;
 if(unit.team==='squad')return true;
 if(unit.hp>0)return state.detected.has(unit.id);
 const key=unit.z?`${unit.x},${unit.y},${unit.z}`:`${unit.x},${unit.y}`;
 return state.visible.has(key);
}
