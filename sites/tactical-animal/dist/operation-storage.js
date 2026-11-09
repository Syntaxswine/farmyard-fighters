import {MISSIONS,DEFAULT_MISSION_ID,getMission} from './missions.js';

export const OPERATION_SAVE='tactical-animal-operation-v2';
export const OPERATION_SLOT='tactical-animal-operation-v3:';
export const PREPARATION_SAVE='tactical-animal-first-shift-v1';
const LEGACY_BUILD='tactical-animal-build-v1';

// Preparation preferences and completion records never replace an active save.
// Each operation also owns a slot, so starting the other one preserves a resume.
export function createOperationStorage(backend,{normalizeBuild,encodeSave,decodeSave,missions=MISSIONS,namespace='',defaultMissionId=DEFAULT_MISSION_ID}){
  const OPERATION_SAVE=namespace+'tactical-animal-operation-v2',OPERATION_SLOT=namespace+'tactical-animal-operation-v3:',PREPARATION_SAVE=namespace+'tactical-animal-first-shift-v1',LEGACY_BUILD=namespace+'tactical-animal-build-v1';
  function preferences(){
    const text=backend.getItem(PREPARATION_SAVE),saved=text?JSON.parse(text):null;
    if(saved&&(saved.version!==1||saved.campaignId!=='first-shift'))throw Error('Unsupported operation preferences.');
    const selectedMissionId=getMission(saved?.selectedMissionId??defaultMissionId).id;
    const builds=Object.fromEntries(missions.map(mission=>[mission.id,normalizeBuild(saved?.builds?.[mission.id])]));
    if(!saved){try{builds[DEFAULT_MISSION_ID]=normalizeBuild(JSON.parse(backend.getItem(LEGACY_BUILD)||'null'));}catch{}}
    return {version:1,campaignId:'first-shift',selectedMissionId,builds,completed:(saved?.completed||[]).filter(id=>missions.some(mission=>mission.id===id))};
  }
  function savePreparation(id,build){
    getMission(id);const data=preferences();data.selectedMissionId=id;data.builds[id]=normalizeBuild(build);
    backend.setItem(PREPARATION_SAVE,JSON.stringify(data));
    if(id===DEFAULT_MISSION_ID)backend.setItem(LEGACY_BUILD,JSON.stringify(data.builds[id]));
  }
  function read(id){
    getMission(id);const slot=backend.getItem(OPERATION_SLOT+id);if(slot)return slot;
    const legacy=backend.getItem(OPERATION_SAVE);if(!legacy)return null;
    const mission=getMission(JSON.parse(legacy)?.solo?.missionId??DEFAULT_MISSION_ID);
    return mission.id===id?legacy:null;
  }
  function load(id){
    const text=read(id);if(!text)throw Error('No saved '+getMission(id).title+' operation.');
    const state=decodeSave(text);
    if(state.solo.missionId!==id)throw Error('The saved operation belongs to a different mission.');
    return state;
  }
  function write(state){
    const definition=getMission(state.solo.missionId);if(definition.exploration)throw Error('Walking tour progress uses its separate storage slot.');
    const id=definition.id,text=encodeSave(state);
    // A player may select the new operation before ever resuming an old
    // single-slot save. Preserve that save before updating the legacy slot.
    const previous=backend.getItem(OPERATION_SAVE);let previousId=null;
    if(previous){try{const saved=JSON.parse(previous);if(saved?.solo?.version===2)previousId=getMission(saved.solo.missionId??DEFAULT_MISSION_ID).id;}catch{}}
    if(previousId&&previousId!==id&&!backend.getItem(OPERATION_SLOT+previousId))backend.setItem(OPERATION_SLOT+previousId,previous);
    backend.setItem(OPERATION_SLOT+id,text);backend.setItem(OPERATION_SAVE,text);
    if(state.solo.status==='extracted'){
      const data=preferences();if(!data.completed.includes(id))data.completed.push(id);
      backend.setItem(PREPARATION_SAVE,JSON.stringify(data));
    }
  }
  return {preferences,savePreparation,read,load,write};
}
