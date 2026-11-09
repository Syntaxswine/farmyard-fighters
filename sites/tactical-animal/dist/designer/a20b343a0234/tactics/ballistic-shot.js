import {angularHelicoidShot,placeHelicoidMiss,rollMarginScatter,failedShotRoll} from './helicoid-shot.js';
import {unitBaseHeight} from './tower-geometry.js';
import {barrelIntersection} from './explosive-barrels.js';

const EPS=1e-7;
const vector=p=>[p.x,p.y,p.h],point=v=>({x:v[0],y:v[1],h:v[2]});

// Tactical actor collider shared with core/projectiles.js. Scenery and team
// membership do not enter this query. Direction is normalized by the caller.
export function bodyIntersection(unit,origin,d,reach,height){
 const ox=origin.x-unit.x,oy=origin.y-unit.y,a=d.x*d.x+d.y*d.y,b=2*(ox*d.x+oy*d.y),c=ox*ox+oy*oy-.34*.34;
 let horizontal;
 if(a<EPS){if(c>0)return null;horizontal=[0,reach];}
 else {const disc=b*b-4*a*c;if(disc<0)return null;const root=Math.sqrt(disc);horizontal=[(-b-root)/(2*a),(-b+root)/(2*a)];}
 const base=unitBaseHeight(unit),lo=base+.05,hi=base+height;
 let vertical;
 if(Math.abs(d.h)<EPS){if(origin.h<lo||origin.h>hi)return null;vertical=[-Infinity,Infinity];}
 else {const x=(lo-origin.h)/d.h,y=(hi-origin.h)/d.h;vertical=[Math.min(x,y),Math.max(x,y)];}
 const distance=Math.max(EPS,horizontal[0],vertical[0]),end=Math.min(reach,horizontal[1],vertical[1]);
 if(distance>end)return null;
 const relative=(origin.h+d.h*distance-base)/height;
 return {distance,zone:relative>.85?'head':relative<.38?'legs':'torso'};
}

function shotFrame(shooter,target,zone,geometry){
 const origin={x:shooter.x,y:shooter.y,h:unitBaseHeight(shooter)+geometry.muzzleHeight(shooter)};
 const aim={x:target.x,y:target.y,h:unitBaseHeight(target)+geometry.targetHeight(target,zone)};
 return {origin,aim};
}
function strikesSelected(target,zone,origin,geometry){
 if(target.ground)return ()=>false;
 if(target.barrel)return ray=>!!barrelIntersection(target,origin,point(ray.direction));
 return ray=>bodyIntersection(target,origin,point(ray.direction),Infinity,geometry.bodyHeight(target))?.zone===zone;
}
function traceRay(state,shooter,ray,options,geometry){
 const origin=point(ray.origin),direction=point(ray.direction),result=geometry.trace(state,shooter,origin,direction,options.reach);
 // Preserve the existing accurate zone targeting. Incidental hits use the
 // body region at the actual impact, even on the originally intended character.
 if(options.accurate&&result.unitId===options.target.id)result.zone=options.zone;
 return {...result,origin,direction,accurate:!!options.accurate,trajectoryModel:'roll-margin',
  angularError:ray.error,rotation:ray.angle/(Math.PI*2)-1,missAdjusted:!!ray.missAdjusted,
  ...(options.shotRoll?{shotRoll:{...options.shotRoll}}:{})};
}
function prepareRay(shooter,target,options,random,geometry){
 const zone=options.zone||'torso',chance=options.chance??50,{origin,aim}=shotFrame(shooter,target,zone,geometry);
 const shotRoll=options.shotRoll||(!options.accurate?failedShotRoll(chance,random):null);
 let error=0,rotation=0;
 if(!options.accurate){error=rollMarginScatter({chance,precision:options.precision??80,die:shotRoll.die,roll:random()}).error;rotation=random();}
 const frame={origin:vector(origin),aim:vector(aim),error,rotation};
 const excludes=strikesSelected(target,zone,origin,geometry);
 const ray=options.accurate?angularHelicoidShot(frame):placeHelicoidMiss(frame,excludes);
 return {ray,excludes,options:{...options,zone,target,shotRoll}};
}

export function firearmTrajectory(state,shooter,target,options,random,geometry){
 const prepared=prepareRay(shooter,target,options,random,geometry);
 return traceRay(state,shooter,prepared.ray,prepared.options,geometry);
}

// One probability roll per shell. Its central pellet follows that outcome;
// remaining pellets spread around the same ray. A failed shell cannot turn
// back into a selected-region hit, but its pellets may strike anything else.
export function pelletTrajectories(state,shooter,target,options,random,geometry){
 const {ray,excludes,options:shot}=prepareRay(shooter,target,options,random,geometry),pellets=options.pellets??6;
 const x=Math.tan(ray.error)*Math.cos(ray.angle),y=Math.tan(ray.error)*Math.sin(ray.angle);
 return Array.from({length:pellets},(_,i)=>{
  let pellet=ray;
  if(i){
   const phase=random()*Math.PI*2,radius=Math.tan(Math.sqrt(random())*.11),dx=x+Math.cos(phase)*radius,dy=y+Math.sin(phase)*radius;
   const frame={origin:ray.origin,aim:ray.aim,error:Math.atan(Math.hypot(dx,dy)),rotation:Math.atan2(dy,dx)/(Math.PI*2)};
   pellet=shot.accurate?angularHelicoidShot(frame):placeHelicoidMiss(frame,excludes);
  }
  // Only the centered pellet inherits an accurate selected-region result.
  // Other pellets receive their actual physical body-region classification.
  const hit=traceRay(state,shooter,pellet,{...shot,accurate:shot.accurate&&i===0},geometry);
  return {...hit,accurate:!!shot.accurate,pellet:true};
 });
}
