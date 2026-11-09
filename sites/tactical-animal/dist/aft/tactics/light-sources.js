import {towerBlocksSegment,WOODEN_LIGHT_MOUNT} from './tower-geometry.js';
import {MINUTES_PER_DAY,DAY_START,DUSK_START} from './game-clock.js';
import {MAX_SPOTLIGHT_POINTS,spotlightAimPoints,spotlightPathError,spotlightPathPhase} from './spotlight-path.js';
export {SPOT_LEG_SECONDS} from './spotlight-path.js';
// Shared authored bulb positions in tile units: X, height, map Y.
const towerLight=(w,h,pivot,tilt,forward=[0,1],scale=1)=>({w,h,spot:true,tower:true,angle:Math.PI/8,pivot,forward,offset:.34*scale,emitters:[[pivot[0]+forward[0]*.34*scale*Math.cos(tilt),pivot[1]-.34*scale*Math.sin(tilt),pivot[2]+forward[1]*.34*scale*Math.cos(tilt)]]});
export const LIGHT_FORMS={
 'wooden-spotlight-tower':towerLight(5,5,[WOODEN_LIGHT_MOUNT.x,7.97,WOODEN_LIGHT_MOUNT.y],.22,[0,-1]),
 'iron-searchlight-stair-tower':towerLight(6,5,[-.95,6.92,1.99],.35),
 'iron-searchlight-ladder-tower':towerLight(6,5,[-2.7195,6.668,0],.35,[-1,0],.55),
 'spotlight':{w:1,h:1,spot:true,emitters:[[0,2.6,0]]},
 'campfire':{w:1,h:1,fire:true,emitters:[[0,.32,0]]},
 'cooking-fire':{w:2,h:2,fire:true,emitters:[[0,.32,0]]},
 'standing-torch':{w:1,h:1,fire:true,emitters:[[0,1.36,0]]},
 'wall-torch':{w:1,h:1,fire:true,wall:true,emitters:[[0,2.06,.27]]},
 'floor-lamp':{w:1,h:1,emitters:[[0,1.48,0]]},
 'bedside-table-lamp':{w:1,h:1,emitters:[[0,.605+1.48*.48,-.045]]},
 'gooseneck-sconce':{w:1,h:1,wall:true,emitters:[[0,1.62,.55]]},
 'streetlight':{w:1,h:1,emitters:[[.24,2.51,0]]},
 'streetlight-double':{w:2,h:1,emitters:[[-.66,2.51,0],[.66,2.51,0]]}
};
export const LIGHT_PROPS=Object.fromEntries(Object.entries(LIGHT_FORMS).map(([kind,f])=>[kind,{w:f.w,h:f.h,solid:!f.wall,cover:kind==='bedside-table-lamp'?25:0}]));
export const LIGHT_RANGE=30;
export function lightBrightness(distance){return !Number.isFinite(distance)||distance<0||distance>LIGHT_RANGE?0:2**-Math.max(0,Math.ceil(distance/5)-1);}
export function lightEnabled(prop,minutes){const form=LIGHT_FORMS[prop.kind];if(!form||prop.lightMode==='off'||(prop.condition??100)<100)return false;if(prop.lightMode==='on'||form.fire)return true;const m=((minutes%MINUTES_PER_DAY)+MINUTES_PER_DAY)%MINUTES_PER_DAY;return m<DAY_START||m>=DUSK_START;}
export function fixturePlacement(p){const f=LIGHT_FORMS[p.kind],w=p.rotated?f.h:f.w,h=p.rotated?f.w:f.h;return {x:p.x+(w-1)/2+(f.wall&&p.rotated?.48:0),y:p.y+(h-1)/2-(f.wall&&!p.rotated?.48:0),z:p.z||0};}
export function placedEmitters(p,floorHeight=3){const f=LIGHT_FORMS[p.kind];if(!f)return [];const center=fixturePlacement(p);
 return f.emitters.map(([x,h,y],index)=>({x:center.x+(p.rotated?-y:x),y:center.y+(p.rotated?x:y),h:center.z*floorHeight+h,prop:p,index,color:f.fire?0xffae55:0xffe5b2}));
}
// Relative map offsets survive block capture/placement. Z is a relative floor.
export const SPOT_ANGLE=Math.PI/6,SPOT_PENUMBRA=.2;
export function spotlightErrors(map,size=240){
 const errors=[];
 for(const p of map.props||[]){
  if(p.lightTargets===undefined)continue;
  const error=!LIGHT_FORMS[p.kind]?.spot?'Only spotlights can have aim points.':!Array.isArray(p.lightTargets)?'Spotlight aim points must be a list.':spotlightPathError(spotlightAimPoints(p),size);
  if(error)errors.push(`${p.kind} at ${p.x+1}, ${p.y+1}: ${error}`);
 }
 return errors;
}
export function spotlightTarget(prop,minutes,floorHeight=3){
 const points=(Array.isArray(prop.lightTargets)?prop.lightTargets:[]).filter(p=>p&&[p.x,p.y,p.z??0].every(Number.isFinite)).slice(0,MAX_SPOTLIGHT_POINTS);
 if(!points.length){
  const f=LIGHT_FORMS[prop.kind];if(f?.tower){const c=fixturePlacement(prop),x=f.pivot[0]+20*f.forward[0],y=f.pivot[2]+20*f.forward[1];points.push({x:c.x-prop.x+(prop.rotated?-y:x),y:c.y-prop.y+(prop.rotated?x:y),z:0});}
  else points.push({x:0,y:8,z:0});
 }
 const {a,b,t}=spotlightPathPhase(points,minutes*60);
 return {x:prop.x+a.x+(b.x-a.x)*t,y:prop.y+a.y+(b.y-a.y)*t,h:((prop.z||0)+(a.z||0)+((b.z||0)-(a.z||0))*t)*floorHeight+.1};
}
export function lightConeFactor(source,target){
 if(!source.aim)return 1;
 const a=source.aim,d=[a.x-source.x,a.y-source.y,a.h-source.h],r=[target.x-source.x,target.y-source.y,target.h-source.h],length=Math.hypot(...d)*Math.hypot(...r);
 if(length<1e-9)return 1;
 const cosine=d.reduce((v,n,i)=>v+n*r[i],0)/length,outer=Math.cos(source.angle??SPOT_ANGLE),inner=Math.cos((source.angle??SPOT_ANGLE)*(1-SPOT_PENUMBRA));
 const t=Math.max(0,Math.min(1,(cosine-outer)/(inner-outer)));return t*t*(3-2*t);
}
// The tower emitter sits ahead of its swivel pivot and moves with the head.
export function sampledEmitters(prop,minutes,floorHeight=3){
 const f=LIGHT_FORMS[prop.kind],sources=placedEmitters(prop,floorHeight);if(!f?.spot)return sources;
 const aim=spotlightTarget(prop,minutes,floorHeight),c=fixturePlacement(prop);
 return sources.map(source=>{
  if(f.pivot){const [x,h,y]=f.pivot,pivot={x:c.x+(prop.rotated?-y:x),y:c.y+(prop.rotated?x:y),h:c.z*floorHeight+h},d={x:aim.x-pivot.x,y:aim.y-pivot.y,h:aim.h-pivot.h},length=Math.hypot(d.x,d.y,d.h)||1;
   source={...source,x:pivot.x+d.x/length*f.offset,y:pivot.y+d.y/length*f.offset,h:pivot.h+d.h/length*f.offset};
  }
  return {...source,aim,angle:f.angle??SPOT_ANGLE};
 });
}
// Keep the public beam helper; all physical ray queries use these open-window surfaces.
export const towerBlocksLight=(source,target,p=source.prop)=>towerBlocksSegment(p,source,target);
export function lightSources(props,minutes){return (props||[]).filter(p=>lightEnabled(p,minutes)).flatMap(p=>sampledEmitters(p,minutes));}
