import {BATTLE_SOUNDS,GUN_SOUND} from './battle-sound-data.js';
import {burnStart} from './battle-combat.js';

export const SOUND_VOICES=12,SOUND_DECODED_BYTES=12*1024*1024;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const events=state=>state.effect?.sequence||(state.effect?[state.effect]:[]);
const point=event=>({x:event.ax,y:event.ay,z:event.az||0});
const identity=event=>event.dischargeId||event.attackId;
// Explicit surface identities, not the structural HP tier or intended target.
// Current windows have open apertures and masonry/metal frames, not glass panes.
const materialSounds=new Map([
 ...['glass'].map(k=>[k,'glass']),
 ...['tin','sheet-metal','corrugated-metal','wall-corrugated','window-corrugated','roof-corrugated-flat','roof-corrugated-sloped'].map(k=>[k,'tin']),
 ...['metal','steel','iron','door-steel-closed','jail-bars','jail-door-closed','crate-steel','table-steel','workbench-metal','barrel-single','barrels-cluster','barrel-explosive'].map(k=>[k,'metal']),
 ...['masonry','brick','concrete','stone','wall','wall-brick','wall-concrete','window-brick','window-concrete','ground-concrete','ground-tiles','roof-flat-parapet'].map(k=>[k,'rock-debris'])
]);
const materialSound=kind=>typeof kind==='string'?materialSounds.get(kind.replace('roof-climbable-','roof-')):undefined;
const structureId=p=>p.structure&&(p.structure.edge!==undefined?'edge:'+p.structure.edge:`tile:${p.structure.x},${p.structure.y},${p.structure.z||0}`);
function structurePoint(receipt){
 if(receipt.id?.startsWith('edge:')){const [,axis,x,y,z='0']=receipt.id.split(':');return {x:+x+(axis==='e'?.5:0),y:+y+(axis==='s'?.5:0),z:+z};}
 if(/^(tile|roof):/.test(receipt.id||'')){const [x,y,z]=receipt.id.split(':')[1].split(',').map(Number);return {x,y,z};}
 return null;
}

// A cosmetic listener. It reads committed events; it never detects a shooter,
// consumes simulation RNG, creates an order, or holds the combat queue busy.
export class BattleAudio {
 constructor({urls=BATTLE_SOUNDS,fetcher=(...args)=>fetch(...args),makeContext=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),target=globalThis.document,volume=.7,onError=()=>{}}={}){
  Object.assign(this,{urls,makeContext,target,onError,volume:clamp(volume,0,1),buffers:new Map(),encoded:new Map(),decoding:new Map(),voices:[],seen:new Set(),pending:new Map(),errors:new Set(),right:{x:1,y:0},serial:0,played:0,paused:false,disposed:false});
  this.abort=new AbortController();this.gesture=()=>{this.unlock();};target?.addEventListener('pointerdown',this.gesture,{capture:true,passive:true});target?.addEventListener('keydown',this.gesture,{capture:true});
  this.ready=Promise.allSettled(Object.entries(urls).map(async([id,url])=>{try{const response=await fetcher(url,{signal:this.abort.signal});if(!response.ok)throw Error('HTTP '+response.status);const bytes=await response.arrayBuffer();if(bytes.byteLength>2*1024*1024)throw Error('Encoded clip exceeds its budget');if(!this.disposed){this.encoded.set(id,bytes);if(this.context)await this.decode(id,bytes);}}catch(error){if(!this.disposed)this.error(id+': '+error.message);}}));
 }
 error(message){if(this.errors.has(message))return;this.errors.add(message);this.onError('Sound effects unavailable: '+message);}
 async decode(id,bytes){
  if(this.decoding.has(id)||this.buffers.has(id))return this.decoding.get(id);
  const task=this.context.decodeAudioData(bytes.slice(0)).then(buffer=>{if(this.disposed)return;const used=[...this.buffers.values()].reduce((n,b)=>n+b.length*b.numberOfChannels*4,0);if(used+buffer.length*buffer.numberOfChannels*4>SOUND_DECODED_BYTES)throw Error('Decoded clips exceed their budget');this.buffers.set(id,buffer);}).catch(error=>{if(!this.disposed)this.error(id+': '+error.message);}).finally(()=>this.encoded.delete(id));this.decoding.set(id,task);return task;
 }
 async unlock(){
  if(this.disposed||this.volume===0)return false;
  if(this.unlocked){if(!this.paused&&this.context.state!=='running')try{await this.context.resume();}catch(error){if(!this.disposed)this.error(error.message);}return true;}
  try{if(!this.context){this.context=this.makeContext();this.master=this.context.createGain();this.master.gain.value=this.volume;this.master.connect(this.context.destination);this.compressor=this.context.createDynamicsCompressor?.();if(this.compressor){for(const [key,value]of Object.entries({threshold:-9,knee:3,ratio:20,attack:.002,release:.18}))this.compressor[key].value=value;this.compressor.connect(this.master);}}await this.context.resume();this.unlocked=true;if(this.paused)await this.context.suspend();await Promise.all([...this.encoded].map(([id,bytes])=>this.decode(id,bytes)));return true;}
  catch(error){if(!this.disposed)this.error(error.message);return false;}
 }
 setVolume(value){this.volume=Number.isFinite(value)?clamp(value,0,1):.7;if(this.master)this.master.gain.value=this.volume;if(this.volume===0)this.stopAll();}
 setPaused(value){if(this.paused===!!value)return;this.paused=!!value;if(this.context&&this.unlocked)(this.paused?this.context.suspend():this.context.resume()).catch(error=>{if(!this.disposed)this.error(error.message);});}
 setCamera(camera){const e=camera?.matrixWorld?.elements;if(e)this.right={x:e[0],y:e[2]};}
 hearing(state,p,range=60){
  if(!p||![p.x,p.y,p.z||0].every(Number.isFinite))return null;
  const squad=state.units.filter(u=>u.team==='squad'&&u.hp>0&&!u.away);if(!squad.length)return null;
  const distance=u=>Math.hypot(p.x-u.x,p.y-u.y,((p.z||0)-(u.z||0))*2.12),nearest=squad.reduce((a,b)=>distance(a)<distance(b)?a:b),d=distance(nearest);if(d>range)return null;
  const listener=squad.find(u=>u.id===state.selected)||nearest,dx=p.x-listener.x,dy=p.y-listener.y;
  return {gain:1/(1+d/12),pan:clamp((dx*this.right.x+dy*this.right.y)/16,-.85,.85)};
 }
 play(id,p,state,{delay=0,priority=1,range=60}={}){
  const hearing=this.hearing(state,p,range),buffer=this.buffers.get(id);if(this.disposed||!this.unlocked||this.paused||!this.volume||!buffer||!hearing)return false;
  if(this.voices.length>=SOUND_VOICES){const oldest=this.voices.reduce((a,b)=>a.priority<b.priority||a.priority===b.priority&&a.serial<b.serial?a:b);if(oldest.priority>priority)return false;this.retire(oldest);}
  const source=this.context.createBufferSource(),gain=this.context.createGain(),pan=this.context.createStereoPanner?.(),voice={source,gain,pan,priority,serial:++this.serial},bus=this.compressor||this.master;source.buffer=buffer;gain.gain.value=hearing.gain*(priority<1?.45:1);source.connect(gain);if(pan){pan.pan.value=hearing.pan;gain.connect(pan);pan.connect(bus);}else gain.connect(bus);
  source.onended=()=>this.retire(voice,false);this.voices.push(voice);try{source.start(this.context.currentTime+delay);this.played++;this.lastCue={id,point:{...p},...hearing};return true;}catch(error){this.retire(voice);this.error(error.message);return false;}
 }
 mark(key){if(this.seen.has(key))return false;this.seen.add(key);if(this.seen.size>1024)this.seen.delete(this.seen.values().next().value);return true;}
 bindEvents(state,combat){
  const shots=[combat.active,...combat.queue].filter(Boolean),unbound=new Set();
  for(const e of events(state)){
   const key=identity(e)||'sound:'+ ++this.eventSerial;this.bindings.set(e,key);
   // Explosives predate the firearm receipt IDs. Bind the queued presentation
   // copy by source order and launch fields, without adding IDs to game saves.
   const shot=shots.find(s=>!this.bindings.has(s.event)&&['shooter','target','weapon','ax','ay','az','bx','by','bz'].every(k=>s.event[k]===e[k]));
   if(shot)this.bindings.set(shot.event,key);else unbound.add(e);
  }
  return unbound;
 }
 attack(event,state){
  const key=this.bindings.get(event)||identity(event);if(!key||!this.mark(key))return;
  const gun=GUN_SOUND[event.weapon];if(gun){this.play(gun,point(event),state);if(event.weapon==='shotgun')this.play('shotgun-pump',point(event),state,{delay:.35,priority:.5,range:24});}
  // Shotgun pellets striking one surface produce one material cue, not six.
  const materials=new Set(),emit=(kind,p)=>{const id=materialSound(kind);if(!id||!p||materials.has(id))return;materials.add(id);this.play(id,p,state,{delay:id==='rock-debris'?.12:0,priority:.5,range:id==='rock-debris'?36:24});};
  for(const p of event.trajectories||[]){
   // New contacts retain the surface before destruction. Older receipts can
   // join the exact struck structure; never look up a now-changed map cell.
   const id=structureId(p),receipt=id&&event.structures?.find(r=>r.id===id);
   emit(p.surfaceKind||p.propKind||receipt?.kind||(typeof p.material==='string'?p.material:p.material?.kind),p);
  }
  for(const blast of event.explosions||[]){if(['tank','barrel'].includes(blast.kind))continue;const p={x:blast.x??event.bx,y:blast.y??event.by,z:blast.z??event.bz??0};this.play(blast.kind==='grenade'?'explosion-large':'explosion-deep',p,state,{priority:2,range:96});}
  // A blast's structure receipts carry their own identities and coordinates.
  // Ordinary bullet contacts above already emitted once per material.
  if(event.explosions?.length)for(const r of event.structures||[])emit(r.kind,structurePoint(r));
 }
 observe(state,combat,now){
  if(this.disposed)return;
  if(this.state!==state){this.reset();this.state=state;this.lastEffect=state.effect;this.bindEvents(state,combat);for(const e of events(state))this.mark(this.bindings.get(e));this.fireSequence=Math.max(0,...(state.fireAnimations||[]).map(e=>e.sequence));return;}
  if(this.lastEffect!==state.effect){this.lastEffect=state.effect;for(const e of this.bindEvents(state,combat))this.attack(e,state);}
  const active=combat.active;if(active?.phase.discharged)this.attack(active.event,state);
  for(const e of state.fireAnimations||[]){if(e.sequence<=this.fireSequence)continue;this.fireSequence=e.sequence;if(['tank','barrel'].includes(e.kind))this.pending.set(e.sequence,e);}
  for(const [key,e]of this.pending){const start=burnStart(e,combat,now);if(start===null||now<start)continue;this.pending.delete(key);const p=e.route?.[0]||e.prop;if(p)this.play(e.kind==='barrel'?'explosion-large':'explosion-deep',p,state,{priority:2,range:96});}
 }
 retire(voice,stop=true){const i=this.voices.indexOf(voice);if(i<0)return;this.voices.splice(i,1);voice.source.onended=null;if(stop)try{voice.source.stop();}catch{}voice.source.disconnect();voice.gain.disconnect();voice.pan?.disconnect();}
 stopAll(){for(const voice of [...this.voices])this.retire(voice);}
 reset(){this.stopAll();this.seen.clear();this.pending.clear();this.bindings=new WeakMap();this.eventSerial=0;this.lastEffect=null;this.fireSequence=0;}
 dispose(){if(this.disposed)return;this.disposed=true;this.abort.abort();this.target?.removeEventListener('pointerdown',this.gesture,true);this.target?.removeEventListener('keydown',this.gesture,true);this.reset();this.compressor?.disconnect();this.master?.disconnect();this.context?.close().catch(()=>{});this.buffers.clear();this.encoded.clear();this.decoding.clear();}
}
