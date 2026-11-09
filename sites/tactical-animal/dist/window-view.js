import * as T from './aft/tactics/vendor/three.module.js';
import {createWindowLibrary} from './art/windows/geometry.js';
import {windowSystem} from './window-catalogue.js';
import {windowBox,SHATTER_LIMITS} from './window-system.js';
import {createWindowShatter} from './window-shatter.js';
const cell=p=>`${Math.round(p.x)},${Math.round(p.y)}`;
const key=e=>`${e.instanceId}/${e.paneId}`;
export function windowResident(record,rect){
  const box=windowBox(record.placement,record.spec.bounds,'prop');
  return box.x1>=rect.x-.5&&box.x0<rect.x+rect.w-.5&&box.y1>=rect.y-.5&&box.y0<rect.y+rect.h-.5;
}
function windowKnown(s,record){return record.edges.some(edge=>{const [axis,x,y]=edge.split(':'),a={x:+x,y:+y};return s.seen.has(cell(a))||s.seen.has(cell({x:a.x+(axis==='e'?1:0),y:a.y+(axis==='s'?1:0)}));});}
export class WindowScenery{
  constructor(state){this.root=new T.Group();this.root.name='Placed breakable windows';this.records=windowSystem.compile(state);this.library=createWindowLibrary();this.assets=new Map();this.picks=[];}
  update(state,rect,holds=()=>false){
    this.picks=[];
    for(const record of this.records){const {placement:p,spec}=record;let asset=this.assets.get(p.id);
      if(!windowResident(record,rect)){asset?.dispose();this.assets.delete(p.id);continue;}
      if(!asset){asset=this.library.build(p.definitionId,{joins:p.joins,dimensions:p.dimensions,finish:p.finish,wall:p.wall,rotation:p.rotation||0});asset.root.position.set(p.x,0,p.y);this.root.add(asset.root);this.assets.set(p.id,asset);asset.root.traverse(mesh=>{if(mesh.isMesh)mesh.userData.windowId=p.id;});}
      asset.root.visible=windowKnown(state,record);if(!asset.root.visible)continue;
      for(const pane of spec.panes)asset.setPaneVisible(pane.id,!windowSystem.broken(state,p.id,pane.id)||holds(p.id,pane.id));
      asset.root.traverse(mesh=>{if(mesh.isMesh&&(!mesh.userData.windowPaneId||asset.isPaneVisible(mesh.userData.windowPaneId)))this.picks.push(mesh);});
    }
    this.root.updateMatrixWorld(true);
  }
  dispose(){this.library.dispose();this.assets.clear();this.picks=[];this.root.removeFromParent();this.root.clear();}
}
export class WindowEffects{
  constructor(scene,state,{reduced=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false}={}){this.scene=scene;this.last=state.windowSequence||0;this.records=windowSystem.compile(state);this.pending=new Map();this.active=[];this.reduced=reduced;this.voices=new Set();this.disposed=false;this.muted=false;}
  unlock(){
    if(this.disposed||this.muted||!this.records.length)return;
    const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return;
    this.audio??=new Audio();const resumed=this.audio.resume().catch(()=>{});
    if(!this.audioLoad){this.abort=new AbortController();this.audioLoad=fetch(new URL('./assets/audio/glass-smash-rubberduck-cc0.ogg',import.meta.url),{signal:this.abort.signal}).then(r=>r.ok?r.arrayBuffer():Promise.reject()).then(b=>this.audio.decodeAudioData(b)).then(b=>{if(!this.disposed)this.buffer=b;}).catch(()=>{});}
    this.audioReady=Promise.all([resumed,this.audioLoad]);
  }
  sound(defer=true){if(this.disposed||this.muted)return;if(!this.buffer||this.audio?.state!=='running'){if(defer&&this.audioReady)this.audioReady.then(()=>this.sound(false));return;}if(this.voices.size>=3)return;const source=this.audio.createBufferSource(),gain=this.audio.createGain();source.buffer=this.buffer;gain.gain.value=.24;source.connect(gain).connect(this.audio.destination);this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();};source.start();}
  observe(state,now,rect,start=()=>now){
    for(const event of state.windowEvents||[]){if(event.sequence<=this.last)continue;this.last=event.sequence;
      const record=this.records.find(r=>r.placement.id===event.instanceId),pane=record?.spec.raw.panes.find(p=>p.id===event.paneId);
      if(record&&pane&&windowResident(record,rect)&&state.visible.has(cell(event.point)))this.pending.set(key(event),{event,record,pane,start});
    }
    this.active=this.active.filter(fx=>{if(!windowResident(fx.record,rect)||(now-fx.at)/1000>=fx.effect.duration){fx.effect.dispose();return false;}fx.effect.sample((now-fx.at)/1000);return true;});
    const ready=[];for(const [id,cue]of this.pending){if(!windowResident(cue.record,rect)){this.pending.delete(id);continue;}const at=cue.start(cue.event);if(at!==null&&now>=at)ready.push([id,cue]);}
    let budget=SHATTER_LIMITS.triangles-this.active.reduce((n,fx)=>n+fx.effect.pieces.length,0),slots=Math.min(ready.length,SHATTER_LIMITS.active-this.active.length,Math.floor(budget/4));
    for(const [id,cue]of ready){this.pending.delete(id);this.sound();if(this.reduced()||slots<=0)continue;
      // Share a simultaneous blast budget before building its first mesh, so
      // all six divided cells can animate rather than the first three taking it.
      const effect=createWindowShatter({kind:cue.record.placement.definitionId,seed:cue.event.seed,direction:cue.event.direction,bounds:cue.pane.bounds,maxShards:Math.min(SHATTER_LIMITS.perPane,Math.floor(budget/slots)),includePane:false});budget-=effect.pieces.length;slots--;
      const p=cue.record.placement;effect.group.position.set(p.x,0,p.y);effect.group.rotation.y=(p.rotation||0)*Math.PI/180;effect.sample(0);this.scene.add(effect.group);this.active.push({effect,record:cue.record,at:now});
    }
  }
  holds(instanceId,paneId){return this.pending.has(`${instanceId}/${paneId}`);}
  stats(){return {pending:this.pending.size,active:this.active.length,triangles:this.active.reduce((n,fx)=>n+fx.effect.pieces.length,0),voices:this.voices.size};}
  dispose(){if(this.disposed)return;this.disposed=true;for(const fx of this.active)fx.effect.dispose();this.active=[];this.pending.clear();this.abort?.abort();for(const voice of this.voices)voice.stop();this.voices.clear();this.audio?.close().catch(()=>{});}
}
