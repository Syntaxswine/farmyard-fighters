import {STAT_DEFINITIONS} from './character-stats.js';
import {DialogueSession} from './dialogue-session.js';
import {DIALOGUE_COLOURS} from './dialogue-rules.js';
import {hudPortrait} from './battle-hud-model.js';
import {readSettings,motionPreference} from './settings-3d.js';
import {createDialoguePreferences} from './dialogue-preferences.js';
import {resolvePresentation,resolveMercPresentation} from './dialogue-presentation-manifest.js';
import {DialoguePerformance,dialogueAudio} from './dialogue-performance.js';
import {DialogueThread,DialogueReplyGate,dialogueTurn} from './dialogue-thread.js';

const el=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
const messageStatus={pending:'Sending…',sent:'Sent',unsaved:'Not saved · retry below',failed:'Not sent'};

export function createBattleDialogue(options){
 const css=el('link');css.rel='stylesheet';css.href=new URL('./battle-dialogue.css',import.meta.url).href;document.head.append(css);
 const dialog=el('dialog',undefined,'battle-dialogue');dialog.id='dialogue-popup';dialog.setAttribute('aria-labelledby','dialogue-title');document.body.append(dialog);
 const session=new DialogueSession({...options,onChange:()=>{render();options.onChange?.();}}),thread=new DialogueThread(),replyGate=new DialogueReplyGate(),portraits={npc:null,merc:null};
 let player,generation=0,lineKey=null,words=[],lastState,lastView,settings=readSettings(),context,pendingReply=null,lastTurn=null,activeMessage=null,speechSide='npc';

 const header=el('header',undefined,'dialogue-header'),heading=el('div'),eyebrow=el('small','AF / FIELD TERMINAL','dialogue-eyebrow'),title=el('h2','Conversation');title.id='dialogue-title';
 const close=button('×',leave);close.setAttribute('aria-label','Leave dialogue');heading.append(eyebrow,title);header.append(heading,close);

 const stage=el('div',undefined,'dialogue-stage'),npcCard=el('section',undefined,'dialogue-participant dialogue-participant-npc'),mercCard=el('section',undefined,'dialogue-participant dialogue-participant-merc');
 const face=el('div',undefined,'dialogue-face'),fallback=el('img'),faceStatus=el('small');fallback.alt='';face.append(fallback,faceStatus);
 const npcName=el('h3'),npcRole=el('small','Speaking','dialogue-role');npcCard.append(face,npcName,npcRole);
 const mercFace=el('div',undefined,'dialogue-face dialogue-merc-face'),mercImage=el('img'),mercFaceStatus=el('small');mercImage.alt='';mercFace.append(mercImage,mercFaceStatus);
 for(const frame of [face,mercFace]){
  const light=el('span',undefined,'dialogue-face-light');light.setAttribute('aria-hidden','true');frame.append(light);
 }
 const mercName=el('h3'),mercRole=el('small','Listening','dialogue-role');mercName.id='dialogue-speaker';mercCard.append(mercFace,mercName,mercRole);
 const turnLabel=el('span','Local conversation','dialogue-accessible');

 const transcript=el('section',undefined,'dialogue-transcript');transcript.setAttribute('aria-label','Conversation messages');transcript.tabIndex=0;
 const currentMessage=el('article',undefined,'dialogue-message dialogue-message-npc dialogue-message-current'),messageName=el('small',undefined,'dialogue-message-name');
 const speech=el('p',undefined,'dialogue-speech'),accessible=el('span',undefined,'dialogue-accessible'),visible=el('span');accessible.setAttribute('aria-live','polite');visible.setAttribute('aria-hidden','true');speech.append(accessible,visible);
 const playback=el('div',undefined,'dialogue-playback'),skip=button('Show full line',()=>player?.skip()),replay=button('Replay',()=>{context=readSettings().dialogueVolume>0?dialogueAudio():null;if(player){player.context=context;player.replay(readSettings());}}),resume=button('Continue',()=>{context=readSettings().dialogueVolume>0?dialogueAudio():null;if(player){player.context=context;player.resume();}}),playbackStatus=el('small');
 playbackStatus.setAttribute('role','status');playbackStatus.className='dialogue-playback-status';playback.append(skip,replay,resume);
 const response=el('p',undefined,'dialogue-result'),currentStatus=el('small',undefined,'dialogue-message-state');currentMessage.append(messageName,speech,response,currentStatus);
 stage.append(npcCard,transcript,mercCard,turnLabel);
 const composer=el('section',undefined,'dialogue-composer'),composerTitle=el('h3','Choose a reply'),choices=el('div',undefined,'dialogue-choices'),notes=el('div');composerTitle.id='dialogue-reply-title';composer.setAttribute('aria-labelledby',composerTitle.id);composer.append(composerTitle,choices,notes);
 const last=el('details',undefined,'dialogue-last'),lastText=el('p');last.append(el('summary','Last saved response'),lastText);
 const prefsPane=el('section',undefined,'dialogue-options-panel'),prefs=createDialoguePreferences({onChange:next=>{settings=next;if(next.dialogueVolume>0){context=dialogueAudio();if(player)player.context=context;}player?.settingsChanged(next);paintFrame(lastState);}});prefsPane.id='dialogue-preferences';prefsPane.hidden=true;prefsPane.setAttribute('aria-label','Conversation options');prefsPane.append(prefs.root);
 const prefsToggle=button('Conversation options',()=>setPreferences(prefsPane.hidden));prefsToggle.className='dialogue-options-button';prefsToggle.setAttribute('aria-controls',prefsPane.id);prefsToggle.setAttribute('aria-expanded','false');
 function setPreferences(open){prefsPane.hidden=!open;prefsToggle.setAttribute('aria-expanded',String(open));if(open)player?.pause();else if(prefsPane.contains(document.activeElement))prefsToggle.focus();paintFrame(lastState);}
 const footer=el('footer',undefined,'dialogue-footer'),meta=el('small','Time paused · No AP cost','dialogue-time'),exit=button('Leave',leave);exit.className='dialogue-leave';footer.append(meta,playback,prefsToggle,exit,playbackStatus,prefsPane);
 dialog.append(header,stage,composer,last,footer);

 function stopPresentation(){generation++;for(const side of ['npc','merc']){portraits[side]?.dispose();portraits[side]=null;}player?.dispose();player=null;replyGate.clear();lineKey=null;lastState=lastView=null;pendingReply=activeMessage=null;lastTurn=null;}
 function leave(){session.close();}
 function endSession(){stopPresentation();if(dialog.open)dialog.close();prefsPane.hidden=true;prefsToggle.setAttribute('aria-expanded','false');}
 const guard=e=>{if(session.busy&&!dialog.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}};
 for(const type of ['pointerdown','pointerup','click','contextmenu','keydown'])document.addEventListener(type,guard,true);
 dialog.addEventListener('cancel',e=>{e.preventDefault();leave();});
 for(const type of ['pointerdown','pointerup','click','contextmenu'])dialog.addEventListener(type,e=>{e.stopPropagation();if(type==='contextmenu')e.preventDefault();});
 dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();leave();}e.stopPropagation();});
 const hidden=()=>{if(document.hidden)player?.pause();};document.addEventListener('visibilitychange',hidden);

 async function preparePortraits(view){
  const mine=generation,participants=[['npc',view.npc,face,fallback,faceStatus],['merc',view.speaker,mercFace,mercImage,mercFaceStatus]];
  for(const [,actor,,image,status]of participants){image.src=actor?hudPortrait(actor):'';image.hidden=false;status.textContent='Preparing portrait…';}
  try{
   const {DialoguePortrait}=await import('./dialogue-portrait.js');
   // Prepare sequentially to bound shader/texture uploads. Both keep their own
   // rigs; only the current speaker needs subsequent animation frames.
   for(const [side,actor,host,image,status]of participants){
    if(mine!==generation||!session.open)return;if(!actor)continue;
    try{const portrait=new DialoguePortrait(host,{onStatus:value=>{
      if(mine!==generation)return;image.hidden=['ready','static'].includes(value);status.textContent=value==='loading'?'Preparing portrait…':value==='fallback'?'Static portrait':value==='static'?'Static portrait · mouth unavailable':'';
     }});portraits[side]=portrait;await portrait.setCharacter(actor);
    }catch{if(mine===generation)status.textContent='Static portrait';}
   }
  }catch{if(mine===generation)for(const [,,,,status]of participants)status.textContent='Static portrait';}
 }

 function speak(entry,profile,key){
  activeMessage=entry.id;speechSide=entry.side;lastState=null;accessible.textContent=entry.text;messageName.textContent=entry.who;visible.replaceChildren();words=[];
  currentMessage.className='dialogue-message dialogue-message-'+entry.side+' dialogue-message-current';response.hidden=true;
  // Reserve bold widths before playback; message bubbles never reflow on a cue.
  for(const match of entry.text.matchAll(/\S+|\s+/g)){
   if(/^\s+$/.test(match[0])){visible.append(document.createTextNode(match[0]));continue;}
   const wrap=el('span',undefined,'dialogue-word'),space=el('strong',match[0],'dialogue-word-space'),ink=el('span',match[0],'dialogue-word-ink');wrap.append(space,ink);visible.append(wrap);words.push({wrap,ink,c0:match.index,c1:match.index+match[0].length});
  }
  updateTranscript(true);
  player??=new DialoguePerformance({context,onFrame:paintFrame});
  player.begin({key,text:entry.text,profile,settings});if(document.hidden||!prefsPane.hidden)player.pause();
 }
 function newLine(view){
  lineKey=view.presentationKey;const entry=thread.line(lineKey,view.npc.name,view.line);
  const lineIndex=Array.isArray(view.definition.nodes[view.nodeId]?.npc)?view.definition.nodes[view.nodeId].npc.indexOf(view.line):0;
  speak(entry,resolvePresentation(view.npc,view.definition,view.nodeId,view.line,lineIndex),lineKey);
 }

 function updateTurn(){
  const turn=dialogueTurn({status:lastState?.status,side:speechSide,busy:session.busy,hasReplies:!!lastView?.choices.length});
  const reduced=settings.dialoguePortraits==='static'||!!motionPreference()?.matches,signature=JSON.stringify([turn,reduced]);if(signature===lastTurn)return;lastTurn=signature;
  npcCard.classList.toggle('is-active',turn.side==='npc');mercCard.classList.toggle('is-active',turn.side==='merc');
  npcRole.textContent=turn.npc;mercRole.textContent=turn.merc;turnLabel.textContent=turn.label;
  dialog.classList.toggle('dialogue-reduced-motion',reduced);
 }

 function paintFrame(frame){
  if(!frame||!session.open)return;lastState=frame;
  for(const w of words){const shown=!settings.dialogueTextAnimation||frame.revealed>w.c0||['done','fallback'].includes(frame.status);w.ink.style.visibility=shown?'visible':'hidden';const active=settings.dialogueTextAnimation&&frame.active&&w.c0<frame.active.c1&&w.c1>frame.active.c0;w.ink.classList.toggle('active',!!active);}
  const animate=settings.dialoguePortraits!=='static'&&!motionPreference()?.matches;
  for(const side of ['npc','merc'])portraits[side]?.draw(animate&&side===speechSide?frame.opening:0);
  skip.hidden=['done','fallback','idle'].includes(frame.status);resume.hidden=frame.status!=='paused';replay.disabled=session.busy||replyGate.active;resume.disabled=!prefsPane.hidden;
  const message=frame.error||(frame.status==='loading'?'Preparing voice; the full line is available.':frame.status==='paused'?'Paused · Continue or Replay when ready.':'');if(playbackStatus.textContent!==message)playbackStatus.textContent=message;
  updateTurn();
  if(speechSide==='merc'&&replyGate.active&&['done','fallback'].includes(frame.status)){replyGate.speech(activeMessage,frame.status);const mine=generation;queueMicrotask(()=>{if(mine===generation)finishReply();});}
 }
 function finishReply(){if(session.open&&replyGate.release())render();}

 function updateTranscript(follow=false){
  const atEnd=transcript.scrollHeight-transcript.scrollTop-transcript.clientHeight<40,offset=transcript.scrollTop;
  transcript.replaceChildren();
  for(const entry of thread.entries){
   if(entry.id===activeMessage){
    currentStatus.hidden=entry.side!=='merc';currentStatus.textContent=entry.side==='merc'?messageStatus[entry.state]:'';currentMessage.dataset.state=entry.state;transcript.append(currentMessage);continue;
   }
   const row=el('article',undefined,'dialogue-message dialogue-message-'+entry.side),name=el('small',entry.who,'dialogue-message-name'),text=el('p',entry.text,'dialogue-message-text');row.append(name,text);
   if(entry.side==='merc'){const status=el('small',messageStatus[entry.state],'dialogue-message-state');row.dataset.state=entry.state;row.append(status);}
   transcript.append(row);
  }
  // A long incoming message starts at its first line, not at its last word.
  // Follow only new messages and explicit replies, never individual word frames.
  if(follow){
   const latest=transcript.lastElementChild;
   if(latest&&latest.offsetHeight>transcript.clientHeight-32)transcript.scrollTop+=latest.getBoundingClientRect().top-transcript.getBoundingClientRect().top-16;
   else transcript.scrollTop=transcript.scrollHeight;
  }else transcript.scrollTop=atEnd?transcript.scrollHeight:offset;
 }

 async function sendReply(view,p,retry=false){
  if(session.busy||replyGate.active)return;
  player?.pause();const mine=generation;
  if(retry)thread.retry(pendingReply);else pendingReply=thread.reply(view.speaker.name,p.choice.text).id;
  const id=pendingReply,entry=thread.entries.find(e=>e.id===id);if(!entry)return;replyGate.start(id);
  if(retry){replyGate.speech(id,'done');updateTranscript();}
  else speak(entry,resolveMercPresentation(view.speaker),'reply/'+generation+'/'+id);
  const accepted=await (retry?session.retry():session.choose(p.choice.id,p.token));
  if(mine!==generation||!session.open)return;
  thread.settle(id,accepted,!!session.pending);if(accepted||!session.pending)pendingReply=null;
  replyGate.settle(id);updateTranscript();updateTurn();finishReply();
 }

 function render(){
  if(!session.open){endSession();return;}
  const focus=document.activeElement?.dataset?.choice,live=session.refresh();
  if(!live.ready.ok)replyGate.clear();
  // The engine can checkpoint immediately, but its NPC response must wait for
  // the merc's voice. Replay/Skip never calls choose() or repeats a check.
  const view=replyGate.active&&lastView?lastView:live;lastView=view;settings=readSettings();npcName.textContent=view.npc?.name||'Unavailable';mercName.textContent=view.speaker?.name||'Unavailable';
  if(!session.busy&&!session.pending&&thread.entries.find(e=>e.id===pendingReply)?.state==='unsaved'){thread.settle(pendingReply,false);pendingReply=null;updateTranscript();}
  if(!dialog.open){thread.clear();generation++;prefs.refresh();dialog.showModal();close.focus();preparePortraits(view);}
  if(view.ready.ok&&!replyGate.active&&lineKey!==view.presentationKey)newLine(view);
  else if(!view.ready.ok){player?.skip();accessible.textContent=view.ready.reason;visible.textContent=view.ready.reason;messageName.textContent=view.npc?.name||'Conversation';words=[];if(!currentMessage.isConnected)transcript.append(currentMessage);}
  const receipt=view.receipt;response.hidden=!receipt||speechSide!=='npc';response.textContent=receipt?.roll?'Rolled '+receipt.roll+'; needed '+receipt.check.chance+' or less — '+receipt.outcome+(receipt.roll===1?' · Natural 1':receipt.roll===100?' · Natural 100':''):receipt?'Response remembered.':'';
  choices.replaceChildren();notes.replaceChildren();
  for(const p of view.choices){
   const c=p.choice,row=el('div',undefined,'dialogue-choice'),b=button('',()=>sendReply(view,p));b.dataset.choice=c.id;b.disabled=session.busy||replyGate.active;
   if(c.requires?.archetype){const badge=el('span',c.requires.archetype+(c.check?'':' · no roll'),'dialogue-badge');badge.style.backgroundColor=DIALOGUE_COLOURS[c.requires.archetype];b.append(badge);}b.append(el('span',c.text));
   const sendIcon=el('span','↵','dialogue-send-icon');sendIcon.setAttribute('aria-hidden','true');b.append(sendIcon);
   if(p.check){
    b.append(el('strong',(STAT_DEFINITIONS.find(([id])=>id===c.check.skill)?.[1]||c.check.skill)+' · '+p.check.chance+'%','dialogue-odds'));
    const details=el('details');details.append(el('summary','How this chance is calculated'),el('p','Skill '+p.check.skill+' · Minimum '+p.check.minimum+' · Difficulty '+p.check.difficulty+(p.check.modifiers.length?' · '+p.check.modifiers.map(m=>m.id.replace(/[_-]+/g,' ')+': '+(m.add>0?'+':'')+m.add).join(', '):'')+' · One attempt for the team.'));row.append(b,details);
   }else row.append(b);choices.append(row);
  }
  composerTitle.textContent=view.choices.length?'Choose a reply':'End of conversation';composerTitle.hidden=!view.choices.length;
  if(view.ready.ok&&!view.choices.length)notes.append(el('p','No further replies. You can leave whenever you are ready.','dialogue-meta'));
  last.hidden=!view.lastResponse;lastText.textContent=view.lastResponse?.response||'';
  for(const text of view.diagnostics)notes.append(el('p',text,'dialogue-error'));
  if(session.busy)notes.append(el('p','Saving the conversation…','dialogue-meta'));
  if(session.error){
   const error=el('p',session.error,'dialogue-error');error.setAttribute('role','alert');notes.append(error);
   if(session.pending){const retry=button('Retry checkpoint',()=>sendReply(view,null,true));retry.disabled=session.busy||replyGate.active;notes.append(retry);}
   if(/Another tab|latest checkpoint/i.test(session.error))notes.append(button('Load latest checkpoint',()=>{leave();options.onLoadLatest?.();}));
  }
  composer.hidden=view.ready.ok&&!view.choices.length&&!view.diagnostics.length&&!session.busy&&!session.error&&!replyGate.active;
  dialog.classList.toggle('dialogue-thread-complete',composer.hidden);
  // A removed choice never hands a held Space/Enter to the next choice.
  if(focus){const next=[...choices.querySelectorAll('[data-choice]')].find(b=>b.dataset.choice===focus);(next&&!next.disabled?next:close).focus();}
  paintFrame(lastState);updateTurn();
 }
 const cleanup=()=>{endSession();document.removeEventListener('visibilitychange',hidden);for(const type of ['pointerdown','pointerup','click','contextmenu','keydown'])document.removeEventListener(type,guard,true);};
 addEventListener('pagehide',cleanup,{once:true});
 return {get open(){return session.open;},get busy(){return session.busy;},session,unlock:()=>{context=readSettings().dialogueVolume>0?dialogueAudio():null;},show:(npc,speaker)=>{context=readSettings().dialogueVolume>0?dialogueAudio():null;session.show(npc,speaker);},close:leave,refresh:render,get presentationResources(){return {audio:player?.resources||null,portraits:{npc:portraits.npc?.resources||null,merc:portraits.merc?.resources||null}};}};
}
