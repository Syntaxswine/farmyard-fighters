import {captureCampaign,restoreCampaign,checkpointTransition} from './campaign-save.js';
import {bindCampaign,syncCampaignEncounter} from './campaign-model.js';

export const CAMPAIGN_SLOTS=[['slot-1','Campaign slot 1'],['slot-2','Campaign slot 2'],['slot-3','Campaign slot 3'],['quick','Campaign quicksave'],['continue','Campaign checkpoint']];
const database=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('farmyard-commando-designer-campaigns-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('saves',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('Campaign storage is unavailable.'));r.onblocked=()=>reject(Error('Close other campaign tabs and retry.'));});
export async function campaignRecord(mode,id,record,expected){
 if(id!==null&&!CAMPAIGN_SLOTS.some(([key])=>key===id))throw Error('Choose a campaign save slot.');
 const db=await database();try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('saves',mode),store=tx.objectStore('saves');let result,error;
  const r=id===null?store.getAll():store.get(id);r.onsuccess=()=>{result=r.result;if(record){if(expected&&(!result||result.campaignId!==expected.id||result.revision!==expected.revision)){error=Error('Another tab changed this campaign. Load its latest checkpoint before continuing.');tx.abort();return;}store.put({...record,id});result=record;}};
  tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(error||tx.error||Error('Campaign save failed.'));tx.onabort=()=>reject(error||tx.error||Error('Campaign save cancelled.'));
 });}finally{db.close();}
}
export const getCampaignSave=id=>campaignRecord('readonly',id);
export const listCampaignSaves=()=>campaignRecord('readonly',null);
export const putCampaignSave=(id,record,expected)=>campaignRecord('readwrite',id,record,expected);
export async function loadCampaignSession(slot='continue'){
 const record=await getCampaignSave(slot);if(!record)throw Error('No campaign save exists in that slot.');const c=restoreCampaign(record);
 // Loading a named save deliberately establishes it as the current campaign.
 if(slot!=='continue')await putCampaignSave('continue',captureCampaign(c));
 return new CampaignSession(c);
}
export class CampaignSession {
 constructor(c,persist=putCampaignSave){this.campaign=bindCampaign(c);this.persist=persist;this.savedRevision=c.revision;this.busy=false;}
 async save(slot='continue'){
  if(this.busy)throw Error('A campaign checkpoint is already in progress.');this.busy=true;
  try{syncCampaignEncounter(this.campaign);const revision=Math.max(this.campaign.revision,this.savedRevision)+1,record=captureCampaign(this.campaign);record.revision=record.data.revision=revision;
   await this.persist('continue',record,{id:this.campaign.id,revision:this.savedRevision});this.savedRevision=revision;this.campaign.revision=Math.max(this.campaign.revision,revision);
   if(slot!=='continue')await this.persist(slot,record);return record;
  }finally{this.busy=false;}
 }
 async transition(command){
  if(this.busy)throw Error('A campaign checkpoint is already in progress.');this.busy=true;
  try{syncCampaignEncounter(this.campaign);const next=await checkpointTransition(this.campaign,command,(record)=>this.persist('continue',record,{id:this.campaign.id,revision:this.savedRevision}));this.campaign=next;this.savedRevision=next.revision;return next;}finally{this.busy=false;}
 }
}
