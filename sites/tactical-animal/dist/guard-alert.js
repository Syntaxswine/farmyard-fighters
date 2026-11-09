// Contact history is per operation. Camera order and a guard leaving sight do
// not turn the same opponent into another discovery.
export class GuardContactTracker {
  constructor(knownIds=[]){this.reset(knownIds);}
  reset(knownIds=[]){this.known=new Set(knownIds.filter(id=>id!==null&&id!==undefined));}
  ids(){return [...this.known];}
  observe(contacts){
    const fresh=[];
    for(const guard of contacts)if(guard.id!==null&&guard.id!==undefined&&!this.known.has(guard.id)){
      this.known.add(guard.id);fresh.push(guard);
    }
    return fresh;
  }
}

// One short radio chirp, unlocked by a real game gesture on mobile browsers.
// No file downloads, polling, or delayed replay of a previously blocked alert.
export class GuardAlertSound {
  constructor({target=globalThis.document,makeContext=()=>{
    const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
    return Context?new Context():null;
  }}={}){
    this.target=target;this.makeContext=makeContext;this.voices=new Set();this.disposed=false;
    this.gesture=()=>{void this.unlock();};
    target?.addEventListener('pointerdown',this.gesture,{capture:true,passive:true});
    target?.addEventListener('keydown',this.gesture,{capture:true});
  }
  unlock(){
    if(this.disposed)return Promise.resolve(false);
    if(this.unlocking)return this.unlocking;
    try{
      if(!this.context||this.context.state==='closed'){
        this.context=this.makeContext();if(!this.context)return Promise.resolve(false);
        this.master=this.context.createGain();this.master.gain.value=.12;this.master.connect(this.context.destination);
      }
      if(this.context.state==='running')return Promise.resolve(true);
      this.unlocking=Promise.resolve(this.context.resume()).then(()=>!this.disposed&&this.context?.state==='running').catch(()=>false).finally(()=>{this.unlocking=null;});
      return this.unlocking;
    }catch{return Promise.resolve(false);}
  }
  retire(voice){
    this.voices.delete(voice);voice.source.disconnect();voice.gain.disconnect();
  }
  play(){
    if(this.disposed||this.target?.hidden||this.context?.state!=='running')return false;
    this.stop();
    try{
      const now=this.context.currentTime;
      for(const [offset,frequency,duration]of [[0,740,.11],[.16,988,.15]]){
        const source=this.context.createOscillator(),gain=this.context.createGain(),voice={source,gain};
        source.type='triangle';source.frequency.setValueAtTime(frequency,now+offset);
        gain.gain.setValueAtTime(0,now+offset);gain.gain.linearRampToValueAtTime(1,now+offset+.008);
        gain.gain.setValueAtTime(1,now+offset+duration-.025);gain.gain.linearRampToValueAtTime(0,now+offset+duration);
        source.connect(gain);gain.connect(this.master);source.onended=()=>this.retire(voice);this.voices.add(voice);
        source.start(now+offset);source.stop(now+offset+duration+.01);
      }
      return true;
    }catch{this.stop();return false;}
  }
  stop(){
    for(const voice of [...this.voices]){voice.source.onended=null;try{voice.source.stop();}catch{}this.retire(voice);}
  }
  dispose(){
    if(this.disposed)return Promise.resolve();this.disposed=true;this.stop();
    this.target?.removeEventListener('pointerdown',this.gesture,true);this.target?.removeEventListener('keydown',this.gesture,true);
    const context=this.context;this.context=null;
    try{return Promise.resolve(context&&context.state!=='closed'?context.close():undefined).catch(()=>{});}catch{return Promise.resolve();}
  }
}

export class GuardAlertIndicator {
  constructor(button,status,sound=new GuardAlertSound()){
    this.button=button;this.status=status;this.sound=sound;this.timer=null;
  }
  notify(guards){
    if(!guards.length)return;
    clearTimeout(this.timer);this.button.classList.remove('guard-alert');
    // A second discovery starts a fresh, bounded pulse rather than extending a
    // flashing class forever. Reduced motion uses the same expiry, without blink.
    void this.button.offsetWidth;this.button.classList.add('guard-alert');
    const names=guards.map(guard=>guard.name||'Guard').join(', ');
    this.status.textContent=guards.length===1?'New guard spotted: '+names+'.':guards.length+' new guards spotted: '+names+'.';
    this.sound.play();this.timer=setTimeout(()=>this.stop(),2000);
  }
  stop(){
    clearTimeout(this.timer);this.timer=null;this.button.classList.remove('guard-alert');this.status.textContent='';this.sound.stop();
  }
  dispose(){this.stop();return this.sound.dispose();}
}
