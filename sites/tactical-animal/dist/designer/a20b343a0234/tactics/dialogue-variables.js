import {tutorialMissionValues} from './tutorial-mission.js';
// Named read-only providers, never executable author expressions.
export const DIALOGUE_VARIABLES=Object.freeze(['has_explosives','radio_destroyed','sam_destroyed']);
export function validateDialogueVariables(d,values={}){
 if(Object.keys(values).some(k=>!d.variables?.includes(k))||(d.variables||[]).some(k=>typeof values[k]!=='boolean'))throw Error('Dialogue world variables are missing or invalid.');
 return values;
}
export const variablesMatch=(condition,values)=>!condition||Object.entries(condition).every(([k,v])=>values[k]===v);
export function readDialogueVariables(d,{state,campaign}){
 if(!d.variables?.length)return {};
 const values=tutorialMissionValues(state,campaign,d.variables);
 return validateDialogueVariables(d,Object.fromEntries(d.variables.map(k=>[k,values[k]])));
}
