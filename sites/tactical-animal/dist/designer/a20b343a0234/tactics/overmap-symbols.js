import {anchor,ROLES} from './overmap-model.js';
import {environmentMix,environmentColor} from './environment-regions.js';
const NS='http://www.w3.org/2000/svg';
export function svg(tag,attrs={},children=[]){const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);el.append(...children);return el;}
const inward={center:[0,0],north:[0,1],south:[0,-1],west:[1,0],east:[-1,0]};
export function curve(r){const a=anchor(r.from),b=anchor(r.to),u=inward[r.from.side],v=inward[r.to.side];return [a,[a[0]+u[0]*44,a[1]+u[1]*44],[b[0]+v[0]*44,b[1]+v[1]*44],b];}
export function point(r,t){const [a,b,c,d]=curve(r),s=1-t;return [0,1].map(i=>s*s*s*a[i]+3*s*s*t*b[i]+3*s*t*t*c[i]+t*t*t*d[i]);}
export function path(r){const [a,b,c,d]=curve(r);return `M${a} C${b} ${c} ${d}`;}
export function crossing(a,b){
 for(let i=0;i<40;i++)for(let j=0;j<40;j++){
  const p=point(a,i/40),q=point(a,(i+1)/40),r=point(b,j/40),s=point(b,(j+1)/40),u=[q[0]-p[0],q[1]-p[1]],v=[s[0]-r[0],s[1]-r[1]],den=u[0]*v[1]-u[1]*v[0];if(Math.abs(den)<1e-8)continue;
  const w=[r[0]-p[0],r[1]-p[1]],t=(w[0]*v[1]-w[1]*v[0])/den,k=(w[0]*u[1]-w[1]*u[0])/den;
  if(t>=0&&t<=1&&k>=0&&k<=1)return {x:p[0]+u[0]*t,y:p[1]+u[1]*t,angle:Math.atan2(u[1],u[0])*180/Math.PI};
 }return null;
}
const paths={
 village:'M-15 5V-5L-6-13 3-5V5Z M6 9V-1L13-8 20-1V9Z',
 town:'M-21 9V-7L-12-14-3-7V9Z M2 9V-17H13V9Z M17 9V-2H25V9 M6-12H9 M6-6H9',
 city:'M-23 12V-6H-13V12 M-8 12V-22H5V12 M10 12V-13H23V12 M-27 12H27 M-3-16H0 M-3-9H0 M15-7H18',
 fortress:'M-22 14V-16H-14V-8H-6V-16H3V-8H11V-16H21V14Z M-5 14V3Q0-5 5 3V14',
 tutorial:'M-17 14V-18L20-12-17-3 M-23 15H-9',
 factory:'M-19 12V-5L-6-12V-4L6-12V12Z M11 12V-20H18V12 M-14 3H-9 M-3 3H2',
 workshop:'M-15 12V-3L0-16 15-3V12Z M-5 12V2H5V12',
 forest:'M0-24-13-3H-7L-19 13H-3V21H3V13H19L7-3H13Z',
 plateau:'M-26 16-16-12H16L26 16 M-16-12-10-4H10L16-12',
 mountains:'M-26 15-8-19 10 15 M0 15 17-12 31 15 M-15-5-8-1-2-6',
 wetland:'M-23 11Q-12 4 0 11T23 11 M-16 1V-15 M-22-9-16-3-10-10 M10 2V-21 M4-14 10-8 17-16',
 countryside:'M-22 10Q-8-12 5 4T25 10 M-15 17H18',
 bridge:'M-17-11V11 M17-11V11 M-17-7H17 M-17 7H17',
 passage:'M-19-14-9 0-19 14 M19-14 9 0 19 14 M-8 0H8',
};
export function icon(kind,x=50,y=50,scale=1){return svg('path',{d:paths[kind]||paths.countryside,transform:`translate(${x} ${y}) scale(${scale})`,class:'symbol symbol-'+kind,'stroke-linejoin':'round','stroke-linecap':'round'});}
export function drawSector(s,{ports=false,overlay='difficulty',detail=false,rim=[],environments,index=0}={}){
 const g=svg('g',{'class':'sector-art'});
 g.append(svg('rect',{width:100,height:100,class:`ground ${overlay==='ownership'?'owner-'+s.owner:overlay==='difficulty'?'difficulty-'+s.difficulty:'natural'}`}));
 if(overlay==='environment'&&environments){
  const resolution=detail?20:4,step=100/resolution,paths=new Map();
  for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
   const mix=environmentMix(environments,index%environments.width+(x+.5)/resolution,Math.floor(index/environments.width)+(y+.5)/resolution),color='rgb('+environmentColor(mix).join(',')+')';
   paths.set(color,(paths.get(color)||'')+`M${x*step} ${y*step}h${step}v${step}h-${step}z`);
  }
  for(const [fill,d]of paths)g.append(svg('path',{fill,d,'shape-rendering':'crispEdges','pointer-events':'none',class:'environment-fill'}));
 }
 if(s.terrain!=='plain'&&s.terrain!=='plateau')g.append(icon(s.terrain,50,48,.7));
 for(const kind of ['river','cliff','road'])for(const r of s.routes.filter(r=>r.kind===kind)){
  g.append(svg('path',{d:path(r),class:'route '+kind}));
  if(kind==='road')g.append(svg('path',{d:path(r),class:'road-center'}));
  if(kind==='river')g.append(svg('path',{d:path(r),class:'river-center'}));
  if(kind==='cliff')for(let t=.08;t<.98;t+=.12){const p=point(r,t),q=point(r,t+.01),dx=q[0]-p[0],dy=q[1]-p[1],len=Math.hypot(dx,dy)||1;g.append(svg('path',{d:`M${p} l${-dy/len*7},${dx/len*7}`,class:'cliff-tick'}));}
 }
 if(s.gate!=='none'&&!(s.gate==='bridge'&&['town','village','city'].includes(s.role))){
  const obstacle=s.gate==='bridge'?'river':'cliff';let hit;
  for(const a of s.routes.filter(r=>r.kind==='road'))for(const b of s.routes.filter(r=>r.kind===obstacle))hit ||= crossing(a,b);
  if(hit){const gate=svg('g',{transform:`translate(${hit.x} ${hit.y}) rotate(${hit.angle})`});gate.append(svg('rect',{x:-15,y:-7,width:30,height:14,class:'gate-deck'}),icon(s.gate,0,0,.7));g.append(gate);}
  else g.append(icon(s.gate,76,77,.65));
 }
 for(const {side,opening}of rim){const edge=svg('g',{transform:`rotate(${{north:0,east:90,south:180,west:270}[side]} 50 50)`});edge.append(svg('path',{d:opening?'M0 5H40 M60 5H100':'M0 5H100',class:'plateau-rim'}));for(let x=5;x<100;x+=10)if(!opening||x<40||x>60)edge.append(svg('path',{d:`M${x} 5V0`,class:'plateau-rim'}));if(opening)edge.append(svg('path',{d:'M42 0H58 M44 3H56 M46 6H54',class:'plateau-rim'}));g.append(edge);}
 if(s.tutorialStep||s.role==='tutorial')g.append(svg('rect',{x:3,y:3,width:94,height:94,class:'tutorial-area',...(overlay==='environment'?{style:'fill:none'}:{})}));
 if(s.role!=='countryside'){g.append(svg('circle',{cx:50,cy:38,r:24,class:'site-disc'}),icon(s.role,50,38,.8));}
 if(s.tutorialStep){const label=svg('text',{x:50,y:78,class:'tutorial-label'});label.textContent=s.tutorialStep===1?'S · START':s.tutorialStep===5?'T · TOWN':'TUTORIAL';g.append(label);}
 s.facilities.forEach((f,i)=>{g.append(svg('circle',{cx:26+i*42,cy:79,r:16,class:'site-disc'}),icon(f,26+i*42,79,.55));});
 if(ports)for(const r of s.routes)for(const p of [r.from,r.to]){const [x,y]=anchor(p);g.append(svg('circle',{cx:x,cy:y,r:detail?2.4:3.4,class:'port port-'+r.kind}));}
 for(const side of s.travel){const [x,y]=anchor({side,offset:.5});const angle={north:-90,south:90,west:180,east:0}[side];g.append(svg('path',{d:'M-10-3H-3V-6L4 0-3 6V3H-10',transform:`translate(${x} ${y}) rotate(${angle})`,class:'travel-port'}));}
 return g;
}
export const LEGEND=[...ROLES,'factory','workshop','forest','mountains','wetland','plateau','bridge','passage'];
