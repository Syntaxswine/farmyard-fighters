import {intactSite,siteId,siteSamples,destroyStrategicSite,siteRule} from './strategic-site-rules.js';
import {traceProjectile} from './core/projectiles.js';
import {insideFlame} from './flame-cone.js';

function exposed(world,origin,end,id){
 const d={x:end.x-origin.x,y:end.y-origin.y,h:end.h-origin.h},range=Math.hypot(d.x,d.y,d.h);
 if(range<.06)return true;
 const hit=traceProjectile(world,null,origin,d,range+.01);
 return hit.propId===id||hit.kind==='range'||hit.distance>=range-.015;
}
function commit(s,props,cause){
 const receipts=props.map(p=>destroyStrategicSite(s,p,{cause})).filter(Boolean);
 for(const r of receipts)s.log?.unshift(r.name+' destroyed'+(cause==='flame'?' by flame.':'.'));
 return receipts;
}
export function blastStrategicSites(s,impact,radius){
 if(!(radius>0))return [];
 const world={...s,units:[]},origin={x:impact.x,y:impact.y,h:Math.max(.03,impact.h??(impact.z||0)*3+.4)};
 const targets=(s.props||[]).filter(p=>intactSite(p)&&(impact.propId===siteId(p)&&origin.h>(p.z||0)*3+.32||siteSamples(p).some(q=>Math.hypot(q.x-origin.x,q.y-origin.y,q.h-origin.h)<radius&&exposed(world,origin,q,siteId(p)))));
 return commit(s,targets,'explosive');
}
export function flameStrategicSites(s,shape){
 if(!shape)return [];
 const world={...s,units:[]};
 const targets=(s.props||[]).filter(p=>intactSite(p)&&siteSamples(p).some(q=>q.h>=shape.base+.32&&q.h<=shape.base+2&&insideFlame(shape,q)&&exposed(world,shape.origin,q,siteId(p))));
 return commit(s,targets,'flame');
}
export function strategicTarget(p){
 // Use an occupied, integral cell, so ordinary explosive range checks apply.
 const point=siteRule(p).strategicSite==='sam'?[3,3]:[0,5];
 const x=p.x+(p.rotated?7-point[1]:point[0]),y=p.y+(p.rotated?point[0]:point[1]);
 return {x,y,z:p.z||0,id:siteId(p),name:siteRule(p).name,team:'scenery',hp:1,weapon:'hands',structure:true};
}
