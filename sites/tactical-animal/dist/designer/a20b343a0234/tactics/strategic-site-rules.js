import {invalidateMapGeometry} from './map-geometry-cache.js';
import {SITE_DATA} from './strategic-site-data.js';

export const SITE_NAMES=Object.freeze({radio:'Radio tower',radar:'Radar tower',sam:'SAM site'});
export const SITE_PROPS=Object.freeze(Object.fromEntries(Object.entries(SITE_NAMES).flatMap(([id,name])=>['intact','destroyed'].map(state=>['site-'+id+(state==='destroyed'?'-destroyed':''),{w:8,h:8,cover:0,solid:false,strategicSite:id,state,name:name+(state==='destroyed'?' · wreck':'')}]))));
export const siteRule=p=>SITE_PROPS[p?.kind];
export const isStrategicSite=p=>!!siteRule(p);
export const siteId=p=>`site:${p.x},${p.y},${p.z||0}`;
export const siteData=p=>{const r=siteRule(p);return r?SITE_DATA[r.strategicSite+'-'+r.state]:null;};
export const intactSite=p=>siteRule(p)?.state==='intact';
export const siteLocal=(p,q)=>p.rotated?{x:q.y-p.y,y:7-(q.x-p.x),h:(q.h??0)-(p.z||0)*3}:{x:q.x-p.x,y:q.y-p.y,h:(q.h??0)-(p.z||0)*3};
export const sitePoint=(p,[x,y,h=0])=>({x:p.x+(p.rotated?7-y:x),y:p.y+(p.rotated?x:y),h:(p.z||0)*3+h,z:p.z||0});
const cell=(x,y)=>`${x},${y}`,cache=new WeakMap();
function index(map){const props=map.props||[];let i=cache.get(props);if(i)return i;i=new Map();for(const p of props)if(isStrategicSite(p))for(let y=0;y<8;y++)for(let x=0;x<8;x++)i.set(`${p.x+x},${p.y+y},${p.z||0}`,p);cache.set(props,i);return i;}
export const siteAt=(map,q)=>index(map).get(`${Math.round(q.x)},${Math.round(q.y)},${q.z||0}`);
export const siteSupportAt=(map,q)=>siteAt(map,q)?{level:q.z||0,height:.24}:null;
export function siteBlocked(p,q){if(!isStrategicSite(p))return false;const a=siteLocal(p,q);return siteData(p).clearance.rows[Math.round(a.y)]?.[Math.round(a.x)]!=='.';}
const passages=new WeakMap();
function passage(p){const data=siteData(p);let c=passages.get(data);if(c)return c;const links=new Set(),entries=new Set();for(const [x,y,u,v]of data.clearance.links){links.add(cell(x,y)+'>'+cell(u,v));links.add(cell(u,v)+'>'+cell(x,y));}for(const e of data.clearance.entries)entries.add(cell(...e.cell)+':'+e.edge);c={links,entries};passages.set(data,c);return c;}
export function siteMoveAllowed(map,a,b){
 const pa=siteAt(map,a),pb=siteAt(map,b);if(!pa&&!pb)return true;
 if((a.z||0)!==(b.z||0)||Math.abs(a.x-b.x)+Math.abs(a.y-b.y)!==1)return false;
 for(const p of new Set([pa,pb].filter(Boolean))){
  const x=siteLocal(p,a),y=siteLocal(p,b),inside=q=>q.x>=0&&q.x<8&&q.y>=0&&q.y<8,c=passage(p);
  if(inside(x)&&inside(y)){
   if(!c.links.has(cell(x.x,x.y)+'>'+cell(y.x,y.y)))return false;
  }else {const q=inside(x)?x:y,out=inside(x)?y:x,edge=out.x<0?'west':out.x>7?'east':out.y<0?'north':'south';if(!c.entries.has(cell(q.x,q.y)+':'+edge))return false;}
 }
 return true;
}
const escapeGraphs=new WeakMap();
// Collapse never teleports or charges survivors. Only a character caught in
// newly fallen debris may step outward through their former passage to safety,
// paying ordinary movement costs. Other characters cannot enter that debris.
export function siteEscapeSteps(map,unit,position=unit){
 const prop=siteAt(map,unit);if(siteRule(prop)?.state!=='destroyed'||!siteBlocked(prop,unit)||siteAt(map,position)!==prop||!siteBlocked(prop,position))return [];
 const intact={...prop,kind:prop.kind.replace('-destroyed','')};if(siteBlocked(intact,unit))return [];
 const data=siteData(prop);let graph=escapeGraphs.get(data);
 if(!graph){
  const links=new Map(),distance=new Map(),queue=[];const join=(a,b)=>{const k=cell(...a);if(!links.has(k))links.set(k,[]);links.get(k).push(b);};
  for(const [x,y,u,v]of siteData(intact).clearance.links){join([x,y],[u,v]);join([u,v],[x,y]);}
  const seed=q=>{const k=cell(...q);if(!distance.has(k)){distance.set(k,0);queue.push(q);}};
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(data.clearance.rows[y][x]==='.')seed([x,y]);
  for(const e of siteData(intact).clearance.entries){const [x,y]=e.cell,d={north:[0,-1],south:[0,1],east:[1,0],west:[-1,0]}[e.edge],out=[x+d[0],y+d[1]];join(e.cell,out);join(out,e.cell);seed(out);}
  for(let i=0;i<queue.length;i++){const q=queue[i],n=distance.get(cell(...q));for(const next of links.get(cell(...q))||[]){const k=cell(...next);if(!distance.has(k)){distance.set(k,n+1);queue.push(next);}}}
  graph={links,distance};escapeGraphs.set(data,graph);
 }
 const q=siteLocal(prop,position),k=cell(q.x,q.y),depth=graph.distance.get(k);
 return (graph.links.get(k)||[]).filter(next=>graph.distance.get(cell(...next))<depth).map(next=>({...sitePoint(prop,next),cost:1}));
}
export function strategicSiteErrors(map){
 const errors=[];
 for(const p of map.props||[])if(isStrategicSite(p)){
  if(!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x+8>(map.width??map.definition?.width??240)||p.y+8>(map.height??map.definition?.height??240))errors.push('The entire strategic site must fit inside the map.');
  if((p.z||0)!==0)errors.push('Strategic sites need ground level and an open sky.');
  if(p.sabotage!==undefined&&typeof p.sabotage!=='boolean')errors.push('Strategic site sabotage must be a checkbox value.');
  for(let y=p.y;y<p.y+8;y++)for(let x=p.x;x<p.x+8;x++)if((map.upper||[]).some(layer=>layer[`${x},${y}`])||(map.canopies||[]).some(q=>x>=q.x&&x<q.x+2&&y>=q.y&&y<q.y+2)) {errors.push('Clear the upper floors and roofs above the strategic site.');break;}
 }
 return [...new Set(errors)];
}

// Double-sided, physical triangles. Open lattice gaps are never full-tile cover.
function boxHit(o,d,b,reach){let near=0,far=reach;for(let k=0;k<3;k++){if(Math.abs(d[k])<1e-10){if(o[k]<b[k]||o[k]>b[k+3])return false;}else{const a=(b[k]-o[k])/d[k],c=(b[k+3]-o[k])/d[k];near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));if(near>far)return false;}}return far>1e-7;}
function triangleHit(o,d,t,i,reach){
 const ax=t[i],ay=t[i+1],az=t[i+2],ux=t[i+3]-ax,uy=t[i+4]-ay,uz=t[i+5]-az,vx=t[i+6]-ax,vy=t[i+7]-ay,vz=t[i+8]-az;
 const px=d[1]*vz-d[2]*vy,py=d[2]*vx-d[0]*vz,pz=d[0]*vy-d[1]*vx,det=ux*px+uy*py+uz*pz;if(Math.abs(det)<1e-10)return null;
 const sx=o[0]-ax,sy=o[1]-ay,sz=o[2]-az,u=(sx*px+sy*py+sz*pz)/det;if(u<0||u>1)return null;
 const qx=sy*uz-sz*uy,qy=sz*ux-sx*uz,qz=sx*uy-sy*ux,v=(d[0]*qx+d[1]*qy+d[2]*qz)/det;if(v<0||u+v>1)return null;
 const distance=(vx*qx+vy*qy+vz*qz)/det;return distance>1e-7&&distance<=reach?distance:null;
}
export function siteRayHit(props,origin,direction,reach){
 let nearest=null,limit=reach;
 for(const prop of props||[]){const data=siteData(prop);if(!data)continue;const p=siteLocal(prop,origin),o=[p.x,p.y,p.h],d=prop.rotated?[direction.y,-direction.x,direction.h]:[direction.x,direction.y,direction.h],stack=[0];
  while(stack.length){const b=data.nodes[stack.pop()];if(!boxHit(o,d,b,limit))continue;if(b[6]>=0){stack.push(b[6],b[7]);continue;}for(let j=-b[6]-1,end=j+b[7];j<end;j++){const hit=triangleHit(o,d,data.triangles,j*9,limit);if(hit!==null){limit=hit;nearest={prop,distance:hit};}}}
 }
 return nearest;
}
export const siteSamples=p=>siteData(p)?.samples.map(q=>sitePoint(p,q))||[];
// A trusted, named action; this never evaluates text stored in a map.
export function destroyStrategicSite(state,target,{cause='trigger'}={}){
 if(!['trigger','flame','explosive'].includes(cause))return null;
 const id=typeof target==='string'?target:target&&siteId(target),p=(state.props||[]).find(q=>intactSite(q)&&siteId(q)===id);if(!p)return null;
 const wreck={...p,kind:p.kind+'-destroyed'};state.props=state.props.map(q=>q===p?wreck:q);invalidateMapGeometry(state);
 return {id,name:siteRule(p).name,cause,before:{...p},after:{...wreck}};
}
// Interaction is at the actual control equipment, not any empty footprint tile.
export const siteControlPoint=p=>sitePoint(p,siteRule(p)?.strategicSite==='sam'?[1,6,.24]:siteRule(p)?.strategicSite==='radar'?[6,6,.24]:[6,1,.24]);
