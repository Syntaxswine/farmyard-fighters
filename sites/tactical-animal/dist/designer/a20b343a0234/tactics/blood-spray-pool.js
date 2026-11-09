import * as T from './vendor/three.module.js';
import {BLOOD_CELLS,BLOOD_CARD_COUNT,BLOOD_DURATION} from './painted-blood-spray-data.js';
import {createBloodSprayMotion} from './painted-blood-spray-motion.js';
import {createPaintedBloodCards} from './painted-blood-spray.js';

export const BLOOD_EMITTER_LIMIT=12,BLOOD_PARTICLE_LIMIT=BLOOD_EMITTER_LIMIT*BLOOD_CARD_COUNT;
// One instanced draw with fixed buffers and reusable motion slots. Particle
// records, geometry, material and texture are retained across projectile hits.
export class BloodSprayPool {
 constructor(scene,texture,{cardCount=BLOOD_CARD_COUNT,slotCount=BLOOD_EMITTER_LIMIT,duration=BLOOD_DURATION,motion=createBloodSprayMotion,cells=BLOOD_CELLS}={}){
  this.cardCount=cardCount;this.duration=duration;
  this.slots=Array.from({length:slotCount},()=>({active:false,motion:motion({pooled:true}),matrix:new T.Matrix4(),basis:new T.Matrix3(),floor:0,start:0,still:false,level:0,planes:[]}));
  const count=slotCount*cardCount;this.buffer={count,launch:new Float32Array(count*3),fall:new Float32Array(count),tangent:new Float32Array(count*3),gravityVelocity:new Float32Array(count),size:new Float32Array(count*2),alpha:new Float32Array(count),tile:new Float32Array(count),spin:new Float32Array(count)};
  const point=new T.Vector3(),velocity=new T.Vector3(),buffer=this.buffer;
  for(let i=0;i<count;i++)buffer.tile[i]=this.slots[Math.floor(i/cardCount)].motion.buffer.tile[i%cardCount];
  const sample=time=>{
   buffer.alpha.fill(0);
   for(const [slotIndex,slot]of this.slots.entries()){
    if(!slot.active)continue;const age=time-slot.start;if(age>=duration){slot.active=false;continue;}
    const b=slot.motion.sample(age,{still:slot.still});
    for(let i=0;i<cardCount;i++){
     const n=slotIndex*cardCount+i,k=n*3,s=n*2,local=i*3,size=i*2;
     point.fromArray(b.launch,local).applyMatrix4(slot.matrix);velocity.fromArray(b.tangent,local).applyMatrix3(slot.basis);
     point.toArray(buffer.launch,k);velocity.toArray(buffer.tangent,k);buffer.fall[n]=b.fall[i];buffer.gravityVelocity[n]=b.gravityVelocity[i];buffer.size[s]=b.size[size];buffer.size[s+1]=b.size[size+1];buffer.spin[n]=b.spin[i];buffer.alpha[n]=b.alpha[i];
    }
   }
   return buffer;
  };
  this.effect=createPaintedBloodCards(texture,{buffer,sample},cells);scene.add(this.effect.mesh);this.effect.mesh.visible=false;this.dropped=0;
 }
 spawn(placement,now,{seed=placement.visualSeed,strength=1,reduced=false,still=false,planes=[]}={}){
  const slot=this.slots.find(s=>!s.active||now/1000-s.start>=this.duration);if(!slot){this.dropped++;return false;}
  slot.motion.reset({seed,strength,reduced});slot.active=true;slot.start=now/1000;slot.still=still;slot.matrix.copy(placement.matrix);slot.basis.setFromMatrix4(slot.matrix);slot.floor=placement.floor;slot.level=placement.contact.shotLevel;slot.planes=planes;return true;
 }
 update(now,camera,visibleAt=()=>true){
  if(!this.slots.some(s=>s.active)){this.effect.mesh.visible=false;return {liveCards:0,capacity:this.buffer.count,drawCalls:0};}
  return this.effect.update(now/1000,camera,{floorAt:i=>this.slots[Math.floor(i/this.cardCount)].floor,
   visibleAt:(p,i)=>{const slot=this.slots[Math.floor(i/this.cardCount)];p.shotLevel=slot.level;return slot.active&&visibleAt(p,slot)&&slot.planes.every(plane=>plane.normal.dot(p)-plane.constant>=-.015);}});
 }
 expire(now){for(const slot of this.slots)if(now/1000-slot.start>=this.duration)slot.active=false;}
 get active(){return this.slots.filter(s=>s.active).length;}
 clear(){for(const s of this.slots){s.active=false;s.planes=[];}this.buffer.alpha.fill(0);this.effect.mesh.visible=false;}
 dispose(){this.clear();this.effect.dispose();}
}
