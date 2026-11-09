import {MAP_LEVELS} from './map-layers.js';
import {trellisSegment} from './bridge-trellis.js';
// Four-cell ramps join ground to a full ledge's authored upper floor.
export const RAMP_RUN=4,RAMP_RISE=2;
export const RAMP_DIRECTIONS={north:[0,-1],east:[1,0],south:[0,1],west:[-1,0]};
export const RAMP_PROPS=Object.fromEntries(['grass','sand','road','concrete','wood','woodsupport','woodgold'].flatMap(surface=>Object.entries(RAMP_DIRECTIONS).map(([direction,[dx]])=>['ramp-'+surface+'-'+direction,{w:dx?(surface.startsWith('wood')?3:4):1,h:dx?1:(surface.startsWith('wood')?3:4),solid:false,cover:0,ramp:true}])));
export const isRamp=p=>!!RAMP_PROPS[p?.kind];
export function rampInfo(p){if(!isRamp(p))return null;const [_,surface,direction]=p.kind.split('-'),[dx,dy]=RAMP_DIRECTIONS[direction],z=p.z||0,run=surface.startsWith('wood')?3:4,low={x:p.x+(dx<0?run-1:0),y:p.y+(dy<0?run-1:0),z};return {p,surface,direction,dx,dy,z,run,low,high:{x:low.x+dx*(run-1),y:low.y+dy*(run-1),z},entry:{x:low.x-dx,y:low.y-dy,z},exit:{x:low.x+dx*run,y:low.y+dy*run,z:z+1}};}
export function rampAt(map,q){return (map.props||[]).find(p=>isRamp(p)&&(p.z||0)===(q.z||0)&&q.x>=p.x-.5&&q.y>=p.y-.5&&q.x<p.x+RAMP_PROPS[p.kind].w-.5&&q.y<p.y+RAMP_PROPS[p.kind].h-.5);}
export function rampHeight(p,q){const r=rampInfo(p);return Math.max(0,Math.min(2,((q.x-r.low.x)*r.dx+(q.y-r.low.y)*r.dy+.5)*2/r.run));}
export function rampSupportAt(map,q){const p=rampAt(map,q);return p?{level:p.z||0,height:rampHeight(p,q)}:null;}
export function rampMoveAllowed(map,a,b){for(const q of [a,b]){const p=rampAt(map,q);if(!p)continue;const r=rampInfo(p);if((a.z||0)!==(b.z||0))continue;if(r.dx?a.y!==b.y:a.x!==b.x){if(r.surface==='wood')return false;const pa=rampAt(map,a),pb=rampAt(map,b);if(!pa||!pb||rampInfo(pa).direction!==rampInfo(pb).direction||Math.abs(rampHeight(pa,a)-rampHeight(pb,b))>1e-6)return false;continue;}const other=q===a?b:a;if(!rampAt(map,other)&&!(other.x===r.entry.x&&other.y===r.entry.y))return false;}return true;}
export function rampLinks(map,q){const links=[];for(const p of map.props||[]){if(!isRamp(p))continue;const r=rampInfo(p),same=(a,b)=>a.x===b.x&&a.y===b.y&&(a.z||0)===(b.z||0);if(same(q,r.high))links.push({...r.exit,cost:1,kind:'ramp'});if(same(q,r.exit))links.push({...r.high,cost:1,kind:'ramp'});}return links;}
export function rampErrors(map){const errors=[],terrain=q=>(q.z?map.upper?.[q.z-1]?.[q.x+','+q.y]:(map.terrain||map.map)?.[q.y]?.[q.x]);for(const p of map.props||[]){if(!isRamp(p))continue;const r=rampInfo(p);if(p.rotated)errors.push('Choose a cardinal ramp direction instead of rotating the prop.');if(r.z>=MAP_LEVELS-1)errors.push('Ramps need an upper level.');if(!terrain(r.entry)||['void','water'].includes(terrain(r.entry)))errors.push('Ramp needs a walkable lower approach.');if(!terrain(r.exit)||['void','water'].includes(terrain(r.exit)))errors.push('Ramp needs an upper landing floor.');if(!r.surface.startsWith('wood')&&!(map.props||[]).some(c=>c.kind==='cliff-ledge'&&(c.cliffMask??15)===15&&c.x===r.exit.x&&c.y===r.exit.y&&(c.z||0)===r.z))errors.push('Ramp upper landing needs a full ledge tile.');}return errors;}
// Exact intersection against the sloping solid, using convex half-space clipping.
export function rampRayHit(props,origin,direction,limit,spacing=3){let hit=null;for(const p of props||[]){if(!isRamp(p))continue;const r=rampInfo(p),rule=RAMP_PROPS[p.kind],base=r.z*spacing;if(r.surface.startsWith('wood')){const start=[origin.x,origin.h,origin.y],end=[origin.x+direction.x*limit,origin.h+direction.h*limit,origin.y+direction.y*limit];for(const part of woodenRampParts(p,spacing)){const t=trellisSegment(start,end,part);if(t!==null)hit=hit===null?t*limit:Math.min(hit,t*limit);}continue;}let lo=0,hi=limit;const constraints=[[origin.x-(p.x-.5),direction.x],[(p.x+rule.w-.5)-origin.x,-direction.x],[origin.y-(p.y-.5),direction.y],[(p.y+rule.h-.5)-origin.y,-direction.y],[origin.h-base,direction.h],[base+.5*((origin.x-r.low.x)*r.dx+(origin.y-r.low.y)*r.dy+.5)-origin.h,.5*(direction.x*r.dx+direction.y*r.dy)-direction.h]];for(const [a,b]of constraints){if(Math.abs(b)<1e-9){if(a<0){hi=-1;break;}}else if(b>0)lo=Math.max(lo,-a/b);else hi=Math.min(hi,-a/b);}if(lo<=hi&&hi>1e-6&&lo<=limit)hit=hit===null?Math.max(1e-6,lo):Math.min(hit,Math.max(1e-6,lo));}return hit;}

// Authored timber structure: crosswise decking and three X-braced side panels.
// Boxes are shared by the renderer and projectile intersection tests.
export function woodenRampParts(p,spacing=2.12){
 const r=rampInfo(p),parts=[],alongX=!!r.dx,sign=r.dx||r.dy;
 const point=(u,h,v)=>[r.low.x+r.dx*(u-.5)-r.dy*v,r.z*spacing+h,r.low.y+r.dy*(u-.5)+r.dx*v];
 const beam=(u1,h1,u2,h2,v,width=.08)=>{let a=point(u1,h1,v),b=point(u2,h2,v);if(sign<0)[a,b]=[b,a];parts.push({center:a.map((n,i)=>(n+b[i])/2),size:[Math.hypot(u2-u1,h2-h1),width,.10],rotation:[0,alongX?0:-Math.PI/2,Math.atan2(b[1]-a[1],alongX?b[0]-a[0]:b[2]-a[2])]});};
 const slope=2/3;
 // One smooth deck; grain and board seams belong to the painted skin.
 parts.push({center:point(1.5,1-.035,0),size:[Math.sqrt(13),.07,1],rotation:[0,alongX?0:-Math.PI/2,Math.atan(slope)*sign]});
 if(r.surface==='woodsupport'||r.surface==='woodgold'){
  for(const side of [-.46,.46]){
   beam(.3,.3*slope-.12,3,2-.12,side,.10);
   beam(.3,.08,3,.08,side,.10);
   for(const u of [1,2,3])beam(u,.08,u,u*slope-.14,side,.10);
   for(const [a,b] of [[.35,.94],[1.06,1.94],[2.06,2.94]]){
    beam(a,.14,b,b*slope-.22,side,.075);
    beam(a,Math.max(.14,a*slope-.22),b,.14,side,.075);
   }
  }
  return parts;
 }
 for(const side of [-.46,.46]){beam(0,.04,3,2.04,side,.12);beam(0,.88,3,2.88,side,.10);for(let i=0;i<=3;i++)beam(i,i*slope,i,i*slope+.88,side,.09);for(let i=0;i<3;i++){beam(i+.06,i*slope+.14,i+.94,(i+.94)*slope+.78,side);beam(i+.06,(i+.06)*slope+.78,i+.94,(i+.94)*slope+.14,side);}}
 return parts;
}
