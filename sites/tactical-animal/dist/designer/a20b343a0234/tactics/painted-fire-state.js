// Presentation clocks and recorded paths only. No damage or target selection.
export const FIRE_TIME=Object.freeze({ignite:.32,cutoff:1.02,travel:.56,recover:2.1,hit:.64,duration:5.4});
const FIRE_SPECIES=new Set(['horse','goat','bull','cow','donkey','sheep','skunk','pig-foreman','pig-director','rabbit','dog','hen']);
export const paintedBurnSupported=u=>FIRE_SPECIES.has(u?.species)&&(u.stance||'standing')==='standing';
export const paintedOperatorSupported=u=>paintedBurnSupported(u)&&u.species!=='hen'&&u.outfit!=='blue-hawaiian'&&u.weapon==='flamethrower';
export const paintedFlamePhase=(elapsed,reduced=false)=>({duration:reduced?180:2100,discharged:reduced||elapsed>=FIRE_TIME.hit*1000,aim:0,recoil:0,elapsed,flame:!reduced&&elapsed>=320&&elapsed<1580});
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export function fireState(seconds){
 const t=Math.max(0,Number.isFinite(seconds)?seconds:0),brace=smooth(t/.30)*(1-smooth((t-(FIRE_TIME.cutoff+FIRE_TIME.travel))/.52));
 return {time:t,brace,emitting:t>=FIRE_TIME.ignite&&t<FIRE_TIME.cutoff,head:Math.max(0,(t-FIRE_TIME.ignite)/FIRE_TIME.travel),tail:Math.max(0,(t-FIRE_TIME.cutoff)/FIRE_TIME.travel),phase:t<.30?'Brace':t<1.02?'Spray':t<1.58?'Cutoff':t<FIRE_TIME.recover?'Recover':'Ready'};
}
export function makeBurnRoute(points){
 if(!Array.isArray(points)||points.length<1||points.length>4)throw Error('Burn route needs a source and at most three supplied steps');
 const route=points.map(p=>{if(!p||![p.x,p.z,p.y??0].every(Number.isFinite))throw Error('Invalid burn route point');return {x:p.x,y:p.y??0,z:p.z};});
 const lengths=[0];for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i],dx=Math.abs(b.x-a.x),dz=Math.abs(b.z-a.z);
  if(Math.abs(a.y-b.y)>1e-7||Math.max(dx,dz)>1.00001||Math.hypot(dx,dz)<.00001)throw Error('Burn route must contain adjacent, same-height steps');
  lengths.push(lengths.at(-1)+Math.hypot(dx,dz));
 }
 return {points:route,lengths,length:lengths.at(-1),steps:route.length-1};
}
export function routePoint(route,distance){
 const d=clamp(distance,0,route.length);let i=1;while(i<route.points.length-1&&d>route.lengths[i])i++;
 if(route.points.length===1)return {...route.points[0],heading:route.heading||0};
 const a=route.points[i-1],b=route.points[i],u=clamp((d-route.lengths[i-1])/(route.lengths[i]-route.lengths[i-1]));
 return {x:a.x+(b.x-a.x)*u,y:a.y,z:a.z+(b.z-a.z)*u,heading:Math.atan2(b.z-a.z,b.x-a.x)};
}
export function burnState(seconds,route,{terminal=true}={}){
 const t=Math.max(0,Number.isFinite(seconds)?seconds:0),local=t-FIRE_TIME.hit,runStart=.30,runDuration=Math.max(.28,route.length*.54),runEnd=runStart+runDuration;
 const run=clamp((local-runStart)/runDuration),distance=route.length*smooth(run),collapse=terminal?smooth((local-runEnd)/.62):0,dissolve=terminal?smooth((local-runEnd-.68)/.50):0,ash=terminal?smooth((local-runEnd-.75)/.45):0;
 const fireTail=terminal?smooth((local-runEnd-1.18)/.40):0;
 return {time:t,terminal,local,run,distance,runStart,runEnd,runDuration,point:routePoint(route,distance),collapse,dissolve,ash,fireTail,bodyVisible:dissolve<1,active:local>=0,engulf:smooth(local/.18)*(1-fireTail),phase:local<0?'Waiting':local<runStart?'Engulfed':local<runEnd?'Panic run':!terminal?'Burning':dissolve<1?'Collapse':'Ash'};
}
// A planned footfall is fixed in world distance while planted. Each swing
// explicitly releases, lifts, advances and lands; root motion cannot drag it.
export function panicFeet(state,route,{restX=-.035,restZ=.232,stepLength=.30}={}){
 if(route.length===0)return Object.fromEntries([-1,1].map(side=>[side,{x:restX,y:0,z:side*restZ,planted:true,worldDistance:restX}]));
 const count=Math.max(2,Math.ceil(route.length/stepLength)),feet={},beats=[0];
 // Short, uneven catching steps rather than a parade cadence. Landing targets
 // are still planned in world space; speeding up the body cannot drag a sole.
 const rhythm=[.82,1.10,.91,1.16,.86,1.05];
 for(let i=0;i<count;i++)beats.push(beats.at(-1)+rhythm[i%rhythm.length]);
 const duration=beats.at(-1);for(let i=0;i<beats.length;i++)beats[i]/=duration;
 for(const side of [-1,1]){
  let x=restX,lift=0,planted=true;
  for(let i=0;i<count;i++){
   if((i%2===0?1:-1)!==side)continue;
   const start=beats[i],end=beats[i+1];
   const endDistance=route.length*smooth(end),next=i>=count-2?route.length+restX:endDistance+.09;
   if(state.run>=end){x=next;continue;}
   if(state.run>start){const u=clamp((state.run-start)/(end-start));x+=(next-x)*smooth(u);lift=(.20+.035*Math.sin(i*1.7))*Math.sin(Math.PI*u)**2;planted=false;}
   break;
  }
  feet[side]={x:x-state.distance,y:lift,z:side*restZ,planted,worldDistance:x};
 }
 return feet;
}
