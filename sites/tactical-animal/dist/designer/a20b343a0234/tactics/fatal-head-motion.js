import {createPaintedBloodCards} from './painted-blood-spray.js';
import {FATAL_HEAD_CELLS} from './fatal-head-data.js';
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
export const FATAL_HEAD_DURATION=.9;
export function createFatalHeadMotion({seed=1,reduced=false,pooled=false}={}){
 const count=reduced?8:48,particles=Array.from({length:count},()=>({}));
 function reset({seed=1}={}){if(!Number.isFinite(seed))throw Error('Finite presentation seed required');let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 for(let i=0;i<count;i++){const fan=i<3,fragment=i>=3&&i<10;Object.assign(particles[i],{tile:i===0?0:fan?1:2,birth:fan?i*.012:random()*.035,life:fan?(i===0?.14:.23):fragment?.5+random()*.25:.24+random()*.22,vx:fan?0:1.5+random()*2.3,vy:fan?0:(random()-.30)*(fragment?2.8:2),vz:fan?0:(random()-.5)*2.3,size:fan?(i===0?.56:.52):fragment?.06+random()*.04:.018+random()*.03,spin:(random()-.5)*(fan?.4:2)});}}
 reset({seed});if(!pooled)particles.forEach(Object.freeze);
 const buffer={count,launch:new Float32Array(count*3),fall:new Float32Array(count),tangent:new Float32Array(count*3),gravityVelocity:new Float32Array(count),size:new Float32Array(count*2),alpha:new Float32Array(count),tile:new Float32Array(count),spin:new Float32Array(count)};for(let i=0;i<count;i++)buffer.tile[i]=particles[i].tile;
 function sample(time,{still=false}={}){
  if(!Number.isFinite(time))throw Error('Finite sample time required');
  for(let i=0;i<count;i++){const p=particles[i],fan=i<3,a=Math.min(p.life,Math.max(0,time-p.birth)),live=time>=0&&time<FATAL_HEAD_DURATION&&time>=p.birth&&time<p.birth+p.life,drag=Math.exp(-3.5*a),travel=(1-drag)/3.5,k=i*3,s=i*2;
   buffer.launch[k]=p.vx*travel;buffer.launch[k+1]=p.vy*travel;buffer.launch[k+2]=p.vz*travel;buffer.fall[i]=fan?0:-4.905*a*a;buffer.gravityVelocity[i]=fan?0:-9.81*a;buffer.tangent[k]=fan?1:p.vx*drag;buffer.tangent[k+1]=p.vy*drag;buffer.tangent[k+2]=p.vz*drag;const bloom=fan?.55+.45*ease(a/.022):1;buffer.size[s]=p.size*bloom;buffer.size[s+1]=p.size*bloom*(i===0?1:fan?.7:.8);buffer.spin[i]=p.spin;buffer.alpha[i]=live?(fan?.90:.84)*ease(a/.008)*(1-ease((a-p.life*.4)/(p.life*.6))):0;
   if(still){buffer.launch[k]=buffer.launch[k+1]=buffer.launch[k+2]=buffer.fall[i]=0;buffer.alpha[i]=i===0&&time>=0&&time<.18?.7*(1-ease(time/.18)):0;buffer.size[s]=buffer.size[s+1]=.32;}
  }return buffer;
 }
 return {particles:Object.freeze(particles),buffer,duration:FATAL_HEAD_DURATION,sample,...pooled&&{reset}};
}
export function createFatalHeadBurst(texture,options={}){return createPaintedBloodCards(texture,createFatalHeadMotion(options),FATAL_HEAD_CELLS);}
