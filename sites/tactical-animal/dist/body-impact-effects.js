import {TextureLoader} from './aft/tactics/vendor/three.module.js';
import {shotVisible} from './aft/tactics/shot-coordinates.js';
import {BLOOD_ATLAS,BLOOD_DURATION} from './designer/a20b343a0234/tactics/painted-blood-spray-data.js';
import {BloodSprayPool,BLOOD_EMITTER_LIMIT} from './designer/a20b343a0234/tactics/blood-spray-pool.js';
import {gunshotSprayFrame} from './designer/a20b343a0234/tactics/gunshot-spray-frame.js';
import {DIMENSIONS} from './designer/a20b343a0234/tactics/hybrid-world.js';

const atlas=new URL(BLOOD_ATLAS,new URL('./designer/a20b343a0234/tactics/',import.meta.url)).href;
const support={level:0,baseHeight:0,offset:0};
const artPoint=(x,y,h)=>({x,y,h:h*1.8/DIMENSIONS.standing});
const maxAge=BLOOD_DURATION*1000;

// Adapt committed Fighters contacts to the pinned Commando entrance spray.
// The transient effect is independent of tracers, damage, and casualty poses.
export class BodyImpactEffects{
  constructor(scene,{loadTexture=url=>new TextureLoader().loadAsync(url),reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false,
    onError=error=>console.warn('Painted bullet impacts unavailable.',error)}={}){
    Object.assign(this,{pending:[],reducedMotion,disposed:false,failed:false});
    this.ready=Promise.resolve().then(()=>loadTexture(atlas)).then(texture=>{
      if(this.disposed){texture.dispose();return;}
      this.texture=texture;
      this.pool=new BloodSprayPool(scene,texture);
    }).catch(error=>{
      this.failed=true;this.pending=[];
      if(!this.disposed)onError(error);
    });
  }
  present(event,state,now){
    const impact=event.bodyImpact;
    if(!impact||this.disposed||this.failed||this.pending.length>=BLOOD_EMITTER_LIMIT)return;
    const {x,y,h}=impact.contact;
    const placement=gunshotSprayFrame({contact:artPoint(x,y,h),origin:artPoint(event.ax,event.ay,event.ah),
      incoming:artPoint(x-event.ax,y-event.ay,h-event.ah),originSupport:support,victim:{support},visualSeed:impact.seed});
    if(shotVisible(state,placement.contact))this.pending.push({placement,strength:impact.strength,at:now});
  }
  draw(state,camera,now){
    this.pending=this.pending.filter(impact=>now-impact.at<maxAge);
    if(!this.pool)return;
    const visible=point=>shotVisible(state,point),still=this.reducedMotion();
    for(const {placement,strength} of this.pending.splice(0)){
      // Start with the first visible bloom even when the next frame is late.
      if(visible(placement.contact))this.pool.spawn(placement,now-(still?0:32),{strength,still});
    }
    this.pool.update(now,camera,visible);
  }
  dispose(){
    if(this.disposed)return;
    this.disposed=true;this.pending=[];this.pool?.dispose();this.texture?.dispose();
  }
}
