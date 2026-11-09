import {resolveDialogue} from './dialogue-data.js';
import {dialogueReadiness,dialogueSpeaker} from './dialogue-rules.js';
import {dialogueActorId,getDialogueRecord,dialogueEntry,dialogueLine,choicePreview,stageDialogue} from './dialogue-state.js';
import {readDialogueVariables} from './dialogue-variables.js';

// No DOM, simulation tick or browser storage. The host supplies an atomic commit.
export class DialogueSession {
 constructor({source,catalog,commit,onChange=()=>{}}){Object.assign(this,{source,catalog,commit,onChange,open:false,busy:false,error:'',pending:null});}
 show(npc,speaker){if(this.busy&&!this.open)return;if(this.open){this.onChange();return;}this.npcId=dialogueActorId(npc);this.speakerId=dialogueActorId(speaker);this.presentationSequence=(this.presentationSequence||0)+1;this.nodeId=null;this.response=null;this.error='';this.pending=null;this.open=true;this.minute=this.source().state.clock.minutes;this.refresh();this.onChange();}
 close(){this.open=false;if(!this.busy)this.pending=null;this.onChange();}
 // The merc who completed the talk order owns this session. To use another
 // merc's skills or personality, leave and approach with that merc.
 actors(){const {state}=this.source();return {npc:state.units.find(u=>dialogueActorId(u)===this.npcId),speaker:state.units.find(u=>dialogueActorId(u)===this.speakerId)};}
 refresh(){
  const {state,dialogue,busy}=this.source(),{npc,speaker}=this.actors(),ready=dialogueReadiness(state,npc,speaker,{busy});
  const result={npc,speaker,ready,choices:[],line:'',diagnostics:[]};if(!ready.ok)return result;
  try{const d=resolveDialogue(state.definition,dialogue,npc.character.dialogueRef,this.catalog),record=getDialogueRecord(dialogue,this.npcId,d),variables=readDialogueVariables(d,this.source()),signature=JSON.stringify(variables);this.definition=d;
   if(this.nodeId===null||this.worldSignature!==signature){this.nodeId=dialogueEntry(d,record,variables);this.presentationSequence=(this.presentationSequence||0)+1;this.response=null;this.pending=null;}this.worldSignature=signature;result.variables=variables;
   if(!d.nodes[this.nodeId])throw Error('This conversation node is unavailable. Leave and try again.');
   result.line=this.response?.response||dialogueLine(d,this.nodeId,record,dialogue.initialSeed,this.minute);
   result.choices=(d.nodes[this.nodeId].choices||[]).map(c=>choicePreview(d,record,this.nodeId,c.id,dialogueSpeaker(speaker),dialogue.revision,variables));
   result.diagnostics=result.choices.filter(c=>c.diagnostic).map(c=>c.diagnostic);result.choices=result.choices.filter(c=>c.visible);
   result.nodeId=this.nodeId;result.presentationKey=[this.npcId,d.id,d.version,this.nodeId,this.presentationSequence,result.line].join('|');result.lastResponse=record.receipts.at(-1);result.receipt=this.response;result.definition=d;
  }catch(e){result.ready={ok:false,reason:e.message};}return result;
 }
 async choose(choiceId,token){
  if(!this.open||this.busy)return false;const view=this.refresh(),p=view.choices.find(c=>c.choice.id===choiceId);this.error='';
  if(!view.ready.ok||!p||p.token!==token){this.pending=null;this.error=view.ready.reason||'The conversation changed. Review the choices and select again.';this.onChange();return false;}
  const {state,dialogue}=this.source();let staged;
  try{staged=this.pending?.token===token?this.pending.result:stageDialogue(dialogue,view.definition,this.npcId,dialogueSpeaker(view.speaker),this.nodeId,choiceId,token,state.clock.minutes,view.variables);
   if(!staged.next){this.presentationSequence=(this.presentationSequence||0)+1;this.nodeId=staged.nodeId;this.response=staged.receipt||null;this.onChange();return true;}
   this.pending={token,choiceId,result:staged};this.busy=true;this.onChange();
   await this.commit(staged.next,dialogue.revision);
   // The host has installed the durable candidate; only now disclose the result.
   this.presentationSequence=(this.presentationSequence||0)+1;this.nodeId=staged.nodeId;this.response=staged.receipt;this.pending=null;return true;
  }catch(e){this.error=e.message;return false;}finally{this.busy=false;this.onChange();}
 }
 retry(){return this.pending?this.choose(this.pending.choiceId,this.pending.token):Promise.resolve(false);}
}
