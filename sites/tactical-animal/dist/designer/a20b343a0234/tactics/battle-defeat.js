import {defeatSummary} from './mercenary-status.js';

export const DEFEAT_DELAY_MS=3000,DEFEAT_NOTICE_MS=2500;

// Frame-driven rather than a detached timeout: a loaded/restarted encounter
// cannot inherit an old return, and hidden-tab time never skips the notice.
export class DefeatFlow{
 constructor({announce,complete,navigate,failed,clear=()=>{}}){Object.assign(this,{announce,complete,navigate,failed,clear});this.reset();}
 reset(){this.generation=(this.generation||0)+1;this.state=null;this.stage='idle';this.elapsed=0;this.last=null;this.pending=null;this.clear();}
 get active(){return this.stage!=='idle';}
 tick(state,now,{suspended=false,busy=false}={}){
  if(this.state!==state){this.reset();this.state=state;}
  if(state.phase!=='lost'){if(this.active){this.reset();this.state=state;}this.last=now;return;}
  if(this.stage==='idle'){this.stage='waiting';this.last=now;}
  const delta=this.last===null?0:Math.max(0,Math.min(250,now-this.last));this.last=now;
  if(suspended||busy)return;
  if(this.stage==='waiting'||this.stage==='notice')this.elapsed+=delta;
  if(this.stage==='waiting'&&this.elapsed>=DEFEAT_DELAY_MS){this.stage='notice';this.elapsed=0;this.announce(defeatSummary(state));}
  else if(this.stage==='notice'&&this.elapsed>=DEFEAT_NOTICE_MS)this.finish();
 }
 finish(){
  if(!['notice','error'].includes(this.stage))return this.pending;
  this.stage='leaving';const generation=this.generation,state=this.state;
  this.pending=Promise.resolve().then(()=>this.complete(state)).then(()=>{
   if(generation===this.generation){this.stage='done';this.navigate();}
  }).catch(error=>{if(generation===this.generation){this.stage='error';this.failed(error);}});
  return this.pending;
 }
}

export function createDefeatNotice({campaign,onRetry,onSaves}){
 const dialog=document.createElement('dialog');dialog.id='defeat-notice';dialog.className='defeat-notice';dialog.setAttribute('aria-labelledby','defeat-title');
 const kicker=document.createElement('p');kicker.className='defeat-kicker';kicker.textContent='Encounter ended';
 const title=document.createElement('h2');title.id='defeat-title';
 const text=document.createElement('p'),status=document.createElement('p'),actions=document.createElement('div');status.setAttribute('role','status');actions.className='defeat-actions';actions.hidden=true;
 const retry=document.createElement('button');retry.textContent='Retry return';retry.onclick=()=>{actions.hidden=true;status.textContent='Saving campaign…';onRetry();};
 const saves=document.createElement('button');saves.textContent='Save / Load';saves.onclick=()=>{dialog.close();onSaves();};actions.append(retry,saves);
 dialog.append(kicker,title,text,status,actions);document.body.append(dialog);dialog.addEventListener('cancel',e=>e.preventDefault());
 return {
  show(summary){for(const other of document.querySelectorAll('dialog[open]'))if(other!==dialog)other.close();title.textContent=summary.title;text.textContent=summary.text;status.textContent=campaign?'Returning to the campaign map. Time will be paused.':'Returning to the main menu.';actions.hidden=true;if(!dialog.open)dialog.showModal();},
  failed(error){status.textContent='Could not save the defeat: '+error.message+' Your encounter is still here. Retry or load another save.';actions.hidden=false;if(!dialog.open)dialog.showModal();},
  reopen(){if(!dialog.open)dialog.showModal();},
  clear(){dialog.close();}
 };
}
