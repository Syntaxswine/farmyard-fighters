// Pure ray geometry in metres; callers own the hit-probability decision.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k),dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
export function seededShots(seed){let n=seed>>>0;return ()=>{n=(Math.imul(1664525,n)+1013904223)>>>0;return n/4294967296;};}
// Shared by the tuning study, live firearms and their forecast. The final
// probability includes the 5% natural success/failure bands, exactly once.
export const firearmHitChance=chance=>clamp(chance,5,95);
export function resolveShotRoll(chance,{die,accuracyRoll}){
 const critical=die===20?'success':die===1?'failure':'ordinary',ordinaryChance=(firearmHitChance(chance)-5)/90;
 return {die,critical,ordinaryChance,rolledHit:critical==='success'||critical==='ordinary'&&accuracyRoll<ordinaryChance};
}
export function rollFirearmShot(chance,random){return resolveShotRoll(chance,{die:1+Math.floor(random()*20),accuracyRoll:random()});}
// Conditional distribution of the D20 given a failed hit roll. In particular,
// every miss at 95% chance is a natural 1. Forecasts must use this distribution.
export function failedShotRoll(chance,random){
 const criticalShare=5/(100-firearmHitChance(chance)),roll=random();
 const die=roll<criticalShare?1:Math.min(19,2+Math.floor((roll-criticalShare)/(1-criticalShare)*18));
 return {die,critical:die===1?'failure':'ordinary',rolledHit:false};
}
export function rollMarginScatter({chance,precision=80,die,roll}){
 const modifier=Math.floor((clamp(chance,1,100)-50)/10),margin=die+modifier-11;
 const weapon=.0005+(1-clamp(precision,1,100)/100)*.008,shooter=.0105*clamp(1.2-margin*.12,.2,2.4),sigma=Math.hypot(shooter,weapon);
 const error=die===1?(28+roll*20)*Math.PI/180:Math.min(Math.PI/3,sigma*Math.sqrt(-2*Math.log(1-roll)));
 return {error,sigma,margin};
}
// Keep the sampled bearing and original spread where it already misses. A
// failed roll that lands on the selected region moves just beyond its outline.
// Callers supply only that region's collision query, without scenery/allies.
export function placeHelicoidMiss({origin,aim,error,rotation},strikesIntended){
 const make=error=>angularHelicoidShot({origin,aim,error,rotation}),shot=make(error);
 if(!strikesIntended(shot))return {...shot,missAdjusted:false};
 let low=error,high=Math.PI*.49,clear=make(high);
 if(strikesIntended(clear))throw Error('Cannot place miss outside target silhouette');
 for(let i=0;i<16;i++){const mid=(low+high)/2,candidate=make(mid);if(strikesIntended(candidate))low=mid;else{high=mid;clear=candidate;}}
 return {...clear,missAdjusted:true};
}
// Project an angular error onto a fixed helicoid section. Distance affects the
// target-plane offset exactly once: distance * tan(error). The section is one
// metre ahead of the muzzle; it is a construction point, not the bullet path.
export function angularHelicoidShot({origin,aim,error,rotation,twist=1}){
 if(!Array.isArray(origin)||origin.length!==3||!Array.isArray(aim)||aim.length!==3||![...origin,...aim,error,rotation,twist].every(Number.isFinite))throw Error('Invalid angular shot');
 if(error<0||error>=Math.PI/2)throw Error('Angular error must be between zero and 90 degrees');
 const delta=add(aim,origin,-1),distance=Math.hypot(...delta);if(distance<1e-6)throw Error('Aim point must differ from muzzle');
 const axis=norm(delta),right=norm(cross(axis,Math.abs(axis[2])>.99?[0,1,0]:[0,0,1])),up=cross(right,axis);
 const angle=(rotation+twist)*2*Math.PI,radius=Math.tan(error);
 const radial=add(right.map(v=>v*Math.cos(angle)),up,Math.sin(angle));
 const point=add(add(origin,axis),radial,radius),direction=norm(add(point,origin,-1));
 const targetPlane=add(aim,radial,distance*radius);
 return {origin,aim,point,direction,targetPlane,axis,right,up,distance,depth:1,radius,angle,error};
}
export function helicoidShot({origin,aim,accuracy=50,precision=80,adjustment=.08,twist=1,roll,rotation}){
 if(![...origin,...aim,accuracy,precision,adjustment,twist,roll,rotation].every(Number.isFinite))throw Error('Shot inputs must be finite');
 const delta=add(aim,origin,-1),distance=Math.hypot(...delta);if(distance<1e-6)throw Error('Aim point must differ from muzzle');
 const axis=norm(delta),right=norm(cross(axis,Math.abs(axis[2])>.99?[0,1,0]:[0,0,1])),up=cross(right,axis);
 const depth=1+clamp(adjustment,0,.2)*(1-2*clamp((distance-2)/58,0,1));
 // Provisional angular spread, not an empirically calibrated hit percentage.
 const sigma=Math.hypot(.001+(1-clamp(accuracy,1,100)/100)*.025,.0005+(1-clamp(precision,1,100)/100)*.008);
 // Aim-placement error does not shrink to zero at point-blank range.
 const placement=.085+(1-clamp(accuracy,1,100)/100)*.20;
 const spread=Math.hypot(placement,distance*sigma);
 const radius=spread*Math.sqrt(-2*Math.log(1-clamp(roll,0,1-1e-12)));
 const angle=rotation*2*Math.PI+twist*2*Math.PI*(depth-1);
 const point=add(add(add(origin,axis,distance*depth),right,radius*Math.cos(angle)),up,radius*Math.sin(angle));
 const direction=norm(add(point,origin,-1));
 const t=distance/dot(direction,axis),targetPlane=add(origin,direction,t);
 return {origin,aim,point,direction,targetPlane,axis,right,up,distance,depth,radius,angle,sigma,spread};
}
// Study proxies only: body-part ellipsoids. Nearest intersection wins.
export const studyBody=[{zone:'head',center:[0,20,1.65],radii:[.16,.16,.2]},{zone:'torso',center:[0,20,1.12],radii:[.29,.18,.36]},{zone:'legs',center:[-.14,20,.43],radii:[.105,.13,.42]},{zone:'legs',center:[.14,20,.43],radii:[.105,.13,.42]}];
export function traceStudy(shot,bodies,cover=false){
 let best={zone:'miss',distance:Infinity};
 for(const body of bodies){const o=shot.origin.map((v,i)=>(v-body.center[i])/body.radii[i]),d=shot.direction.map((v,i)=>v/body.radii[i]),a=dot(d,d),b=2*dot(o,d),c=dot(o,o)-1,disc=b*b-4*a*c;if(disc<0)continue;const near=(-b-Math.sqrt(disc))/(2*a),far=(-b+Math.sqrt(disc))/(2*a),t=near>=0?near:far;if(t>=0&&t<best.distance)best={zone:body.zone,distance:t};}
 if(cover&&shot.direction[1]>0){const plane=cover===true?{y:bodies[0].center[1]-1,halfWidth:.8,height:1.25}:cover;
  const t=(plane.y-shot.origin[1])/shot.direction[1],p=add(shot.origin,shot.direction,t);if(t>=0&&t<best.distance&&Math.abs(p[0])<plane.halfWidth&&p[2]>=0&&p[2]<=plane.height)best={zone:'cover',distance:t};}
 // Flat ground can intercept downward shots before the target.
 if(shot.direction[2]<0){const t=-shot.origin[2]/shot.direction[2];if(t>=0&&t<best.distance)best={zone:'ground',distance:t};}
 return best;
}
