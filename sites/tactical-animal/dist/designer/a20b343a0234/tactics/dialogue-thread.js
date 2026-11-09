// Presentation-only message history. It never rolls, checkpoints or changes a node.
export class DialogueThread {
 constructor(limit=80){this.limit=limit;this.serial=0;this.clear();}
 clear(){this.entries=[];this.lineKey=null;}
 line(key,who,text){
  if(key===this.lineKey)return null;
  this.lineKey=key;
  return this.append({side:'npc',who,text,key,state:'received'});
 }
 reply(who,text){return this.append({side:'merc',who,text,state:'pending'});}
 append(entry){const message={...entry,id:++this.serial};this.entries.push(message);this.entries=this.entries.slice(-this.limit);return message;}
 settle(id,accepted,retryable=false){const entry=this.entries.find(e=>e.id===id);if(entry?.side==='merc')entry.state=accepted?'sent':retryable?'unsaved':'failed';}
 retry(id){const entry=this.entries.find(e=>e.id===id);if(entry?.state==='unsaved')entry.state='pending';}
}

// Hold the incoming response until both the outgoing performance and its
// command have finished. This never commits or retries a dialogue choice.
export class DialogueReplyGate {
 start(id){if(this.pending)return false;this.pending={id,spoken:false,settled:false};return true;}
 speech(id,status){if(this.pending?.id===id&&['done','fallback'].includes(status))this.pending.spoken=true;}
 settle(id){if(this.pending?.id===id)this.pending.settled=true;}
 release(){if(!this.pending?.spoken||!this.pending.settled)return false;this.pending=null;return true;}
 clear(){this.pending=null;}
 get active(){return !!this.pending;}
}

// Hand over the visual floor to the replying merc after the NPC's line ends.
// Pause/failure never masquerades as ongoing speech, including with muted voices.
export function dialogueTurn({status,side='npc',busy=false,hasReplies=false}={}){
 if(status==='playing')return {side,npc:side==='npc'?'Speaking':'Listening',merc:side==='merc'?'Speaking':'Listening',label:'Speaking'};
 if(status==='loading')return {side,npc:side==='npc'?'Preparing to speak':'Listening',merc:side==='merc'?'Preparing to speak':'Listening',label:side==='npc'?'Incoming message':'Your reply'};
 if(status==='paused')return {side:null,npc:'Paused',merc:'Paused',label:'Conversation paused'};
 if(busy)return {side:'merc',npc:'Listening',merc:'Sending reply',label:'Sending your reply…'};
 if(hasReplies)return {side:'merc',npc:'Listening',merc:'Your reply',label:'Choose a reply'};
 return {side:null,npc:'Finished speaking',merc:'Listening',label:'Conversation complete'};
}
