import {unitBaseHeight} from './tower-geometry.js';

export const EXPLOSIVE_BARREL='barrel-explosive';
export const BARREL_RADIUS=.328,BARREL_HEIGHT=.8;
export const EXPLOSIVE_BARREL_RULE={w:1,h:1,cover:25,solid:true,explosive:true};
export const isExplosiveBarrel=p=>p?.kind===EXPLOSIVE_BARREL;
export const barrelId=p=>`barrel:${p.x},${p.y},${p.z||0}`;
export const barrelKey=p=>p.z?`${p.x},${p.y},${p.z}`:`${p.x},${p.y}`;
export const barrelTarget=p=>({...p,id:barrelId(p),name:'Explosive barrel',team:'scenery',hp:1,weapon:'hands',barrel:true});
export const presentBarrel=(s,b)=>(s.props||[]).find(p=>isExplosiveBarrel(p)&&barrelId(p)===b.id);

// Match the drum, rather than intercepting bullets in the empty tile corners.
// This cylinder also excludes the intended barrel from failed probability rolls.
export function barrelIntersection(p,origin,d,reach=Infinity,spacing=3){
 const eps=1e-7,ox=origin.x-p.x,oy=origin.y-p.y,a=d.x*d.x+d.y*d.y,b=2*(ox*d.x+oy*d.y),c=ox*ox+oy*oy-BARREL_RADIUS**2;
 let horizontal;
 if(a<eps){if(c>0)return null;horizontal=[0,reach];}
 else{const disc=b*b-4*a*c;if(disc<0)return null;const root=Math.sqrt(disc);horizontal=[(-b-root)/(2*a),(-b+root)/(2*a)];}
 const base=unitBaseHeight(p,spacing);let vertical;
 if(Math.abs(d.h)<eps){if(origin.h<base||origin.h>base+BARREL_HEIGHT)return null;vertical=[-Infinity,Infinity];}
 else{const lo=(base-origin.h)/d.h,hi=(base+BARREL_HEIGHT-origin.h)/d.h;vertical=[Math.min(lo,hi),Math.max(lo,hi)];}
 const distance=Math.max(eps,horizontal[0],vertical[0]);
 return distance<=Math.min(reach,horizontal[1],vertical[1])?{distance}:null;
}
export function barrelRayHit(props,origin,d,reach){
 let nearest=null;for(const p of props||[]){if(!isExplosiveBarrel(p))continue;const hit=barrelIntersection(p,origin,d,nearest?.distance??reach);if(hit)nearest={...hit,prop:p};}return nearest;
}
