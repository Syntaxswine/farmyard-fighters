import {phrases,wordState} from './dialogue-timeline.js';
import {mouthAt} from './vendor/babble/timing.mjs';
import {SpeechClient} from './dialogue-speech-client.js';
let sharedContext;
// Unlock from the right-click/Replay gesture. This context is shared only by dialogue.
export function dialogueAudio(){try{sharedContext??=new (globalThis.AudioContext||globalThis.webkitAudioContext)();sharedContext.resume().catch(()=>{});return sharedContext;}catch{return null;}}
export class DialoguePerformance {
 constructor({client=new SpeechClient(),context=null,now=()=>performance.now()/1000,request=callback=>requestAnimationFrame(callback),cancel=id=>cancelAnimationFrame(id),onFrame=()=>{},readableDelay=300}={}){Object.assign(this,{client,context,now,request,cancel,onFrame,readableDelay,serial:0,frame:0,status:'idle',offset:0,source:null,gain:null,buffer:null,key:null,revealed:0,active:null,opening:0,closed:false});}
 begin({key,text,profile,settings}){if(key===this.key)return false;this.stop();this.key=key;this.text=text;this.profile=profile;this.settings={...settings};this.rate=settings.dialogueSpeed;this.chunks=phrases(text,Math.floor(140*Math.min(1,this.rate)));this.index=0;this.revealed=settings.dialogueTextAnimation?0:text.length;this.status='loading';this.emit();
  if(!settings.dialogueTextAnimation&&settings.dialogueVolume===0){this.status='done';this.emit();return true;}
  // A slow worker must not hold the line hostage. Once shown, never hide words again.
  this.readableTimer=setTimeout(()=>{if(!this.closed&&['loading','paused'].includes(this.status)){this.revealed=text.length;this.emit();}},this.readableDelay);
  this.load(this.serial);return true;}
 async load(mine){
  const chunk=this.chunks[this.index];if(!chunk){this.finish();return;}
  try{const clip=await (this.nextClip||this.client.prepare(chunk.text,this.profile,this.rate));if(this.closed||mine!==this.serial)return;this.nextClip=null;
   if(clip.samples.byteLength>2*1024*1024)throw Error('Voice phrase exceeds the audio budget.');
   clearTimeout(this.readableTimer);this.clip=clip;this.offset=0;this.clipStart=chunk.c0;
   // Only current and next phrase are prepared. No speculative branch audio.
   const next=this.chunks[this.index+1];if(next){this.nextClip=this.client.prepare(next.text,this.profile,this.rate);this.nextClip.catch(()=>{});}
   if(this.status==='paused'){this.emit();return;}
   this.startSource();
  }catch(error){if(this.closed||mine!==this.serial)return;this.error=error.message;this.status='fallback';this.revealed=this.text.length;this.active=null;this.opening=0;this.releaseSource();this.emit();}
 }
 startSource(){
  this.releaseSource();this.clock=this.now;this.audioClock=false;
  if(this.settings.dialogueVolume>0&&this.context){
   if(this.context.state!=='running'){this.status='paused';this.error='Press Continue to enable dialogue audio.';this.emit();return;}
   try{this.buffer=this.context.createBuffer(1,this.clip.samples.length,this.clip.sampleRate);this.buffer.copyToChannel(this.clip.samples,0);this.client.reserve(this.clip.samples.byteLength);this.source=this.context.createBufferSource();this.gain=this.context.createGain();this.source.buffer=this.buffer;this.gain.gain.value=this.settings.dialogueVolume;this.source.connect(this.gain);this.gain.connect(this.context.destination);this.source.start(0,this.offset);this.clock=()=>this.context.currentTime;this.audioClock=true;
   }catch(error){this.error='Audio unavailable. The full line is shown.';this.releaseSource();this.status='fallback';this.revealed=this.text.length;this.opening=0;this.emit();return;}
  }else if(this.settings.dialogueVolume>0&&!this.context){this.status='fallback';this.error='Audio unavailable. The full line is shown.';this.revealed=this.text.length;this.emit();return;}
  this.startedAt=this.clock();this.status='playing';this.error='';this.emit();this.schedule();
 }
 schedule(){if(!this.frame&&this.status==='playing')this.frame=this.request(t=>{this.frame=0;if(this.closed||this.status!=='playing')return;this.tick();this.schedule();});}
 position(){return this.offset+(this.status==='playing'?Math.max(0,this.clock()-this.startedAt):0);}
 tick(){if(this.status!=='playing'||!this.clip)return;
  if(this.audioClock&&this.context.state!=='running'){this.pause();return;}
  const t=this.position(),plan=this.clip.plan,current=wordState(plan,t),word=plan.words[current.active];
  this.revealed=this.settings.dialogueTextAnimation?Math.max(this.revealed,this.clipStart+current.revealed):this.text.length;
  this.active=this.settings.dialogueTextAnimation&&word?{c0:this.clipStart+word.c0,c1:this.clipStart+word.c1}:null;this.opening=mouthAt(plan,t);
  this.emit();
  if(t>=Math.max(plan.duration,this.clip.samples.length/this.clip.sampleRate)){this.releaseSource();this.revealed=Math.max(this.revealed,this.chunks[this.index].c1);this.index++;this.clip=null;this.offset=0;this.status='loading';this.active=null;this.opening=0;this.emit();this.load(this.serial);}
 }
 emit(){this.onFrame({status:this.status,revealed:this.revealed,active:this.active,opening:this.opening,error:this.error||'',rate:this.rate,text:this.text,key:this.key,chunk:this.index,cueStart:this.active?this.clip?.plan.words.find(w=>w.c0===this.active.c0-this.clipStart)?.t0:null,clipTime:this.clip?this.position():0});}
 settingsChanged(settings){this.settings={...settings};if(!settings.dialogueTextAnimation&&settings.dialogueVolume===0){this.skip();return;}if(this.gain)this.gain.gain.value=settings.dialogueVolume;if(!settings.dialogueTextAnimation){this.revealed=this.text.length;this.active=null;}
  if(settings.dialogueVolume>0&&!this.source&&this.status==='playing'){this.offset=this.position();this.startSource();return;}this.emit();}
 pause(){if(!['loading','playing'].includes(this.status))return;if(this.status==='playing')this.offset=this.position();this.status='paused';this.releaseSource();this.active=null;this.opening=0;this.emit();}
 resume(){if(this.status!=='paused')return;this.error='';if(this.context&&this.context.state!=='running'&&this.settings.dialogueVolume>0){const mine=this.serial;this.context.resume().then(()=>{if(mine!==this.serial||this.closed||this.status!=='paused')return;if(this.context.state==='running')this.resume();else{this.error='Audio is unavailable. Mute voice to continue, or show the full line.';this.emit();}}).catch(()=>{if(mine!==this.serial||this.closed)return;this.error='Audio is unavailable. Mute voice to continue, or show the full line.';this.emit();});return;}
  if(this.clip)this.startSource();else {this.status='loading';this.emit();}}
 skip(){this.stop();this.status='done';this.revealed=this.text?.length||0;this.emit();}
 replay(settings=this.settings){const data={key:this.key,text:this.text,profile:this.profile,settings};this.key=null;this.begin(data);}
 finish(){this.status='done';this.revealed=this.text.length;this.active=null;this.opening=0;this.releaseSource();this.emit();}
 releaseSource(){if(this.frame)this.cancel(this.frame);this.frame=0;if(this.source){try{this.source.stop();}catch{}this.source.disconnect();}this.gain?.disconnect();this.source=this.gain=this.buffer=null;this.client.reserve(0);}
 stop(){this.serial++;clearTimeout(this.readableTimer);this.releaseSource();this.client.cancel();this.nextClip=null;this.clip=null;this.active=null;this.opening=0;this.offset=0;}
 dispose(){this.closed=true;this.stop();this.client.dispose();this.status='closed';}
 get resources(){return {...this.client.resources,sources:this.source?1:0,frames:this.frame?1:0,audioBytes:this.buffer?this.buffer.length*4:0,status:this.status};}
}
