import {BLOOD_DURATION,BLOOD_CARD_COUNT} from './painted-blood-spray-data.js';
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
export {BLOOD_DURATION};
// Canonical asset coordinates only. The builder maps +X to the entrance-spray
// direction; gravity remains a separate world-down term after that mapping.
export function createBloodSprayMotion({seed=1,strength=1,reduced=false,pooled=false}={}){
 if(!Number.isFinite(seed)||!Number.isFinite(strength))throw Error('Finite seed and strength required');
 const count=pooled?BLOOD_CARD_COUNT:reduced?5:BLOOD_CARD_COUNT,particles=Array.from({length:count},()=>({}));let activeCount;
 function reset(options){
  seed=options.seed??1;strength=options.strength??1;reduced=!!options.reduced;
  if(!Number.isFinite(seed)||!Number.isFinite(strength))throw Error('Finite seed and strength required');
  strength=Math.max(.7,Math.min(1.2,strength));activeCount=reduced?5:count;
  let state=seed>>>0;const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
  for(let i=0;i<count;i++){
   const fan=i<2;
   Object.assign(particles[i],{tile:fan?i:i%3===0?2:3,birth:fan?i*.024:.012+random()*.035,life:fan?(i===0?.16:.205):.23+random()*.18,
   vx:fan?0:(1.25+random()*1.55)*strength,vy:fan?0:(random()-.2)*1.4,vz:fan?0:(random()-.5)*.75,
   size:fan?(i===0?.40:.46)*strength:(.025+random()*.035)*strength,stretch:fan?1:i%3===0?1.9:1,spin:fan?0:(random()-.5)*.7});
  }
 }
 reset({seed,strength,reduced});if(!pooled)for(const p of particles)Object.freeze(p);
 const buffer={count,launch:new Float32Array(count*3),fall:new Float32Array(count),tangent:new Float32Array(count*3),gravityVelocity:new Float32Array(count),size:new Float32Array(count*2),alpha:new Float32Array(count),tile:new Float32Array(count),spin:new Float32Array(count)};
 for(let i=0;i<count;i++)buffer.tile[i]=particles[i].tile;
 function sample(time,{still=false}={}){
  if(!Number.isFinite(time))throw Error('Finite sample time required');
  for(let i=0;i<count;i++){
   const p=particles[i],age=time-p.birth,live=i<activeCount&&time>=0&&time<BLOOD_DURATION&&age>=0&&age<p.life,a=Math.min(p.life,Math.max(0,age)),drag=Math.exp(-4*a),travel=(1-drag)/4;
   buffer.alpha[i]=live?(p.tile<2?.78:.92)*ease(a/.012)*(1-ease((a-p.life*.43)/(p.life*.57))):0;
   const n=i*3,k=i*2;buffer.launch[n]=p.vx*travel;buffer.launch[n+1]=p.vy*travel;buffer.launch[n+2]=p.vz*travel;
   buffer.fall[i]=p.tile<2?0:-4.905*a*a;buffer.gravityVelocity[i]=p.tile<2?0:-9.81*a;
   buffer.tangent[n]=p.tile<2?1:p.vx*drag;buffer.tangent[n+1]=p.vy*drag;buffer.tangent[n+2]=p.vz*drag;
   const bloom=p.tile<2?.45+.55*ease(a/.045):1;
   buffer.size[k]=p.size*bloom*p.stretch;buffer.size[k+1]=p.size*bloom*(p.tile<2?.66:1);buffer.spin[i]=p.spin;
   if(still){buffer.launch[n]=buffer.launch[n+1]=buffer.launch[n+2]=buffer.fall[i]=0;buffer.alpha[i]=i===0&&time>=0&&time<.18?.62*(1-ease(time/.18)):0;buffer.size[k]=.26*strength;buffer.size[k+1]=.18*strength;}
  }
  return buffer;
 }
 return {particles:Object.freeze(particles),buffer,sample,duration:BLOOD_DURATION,...pooled&&{reset}};
}
