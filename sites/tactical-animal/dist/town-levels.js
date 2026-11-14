// Explicit adapter for Nautilus's pinned 2.12 m storeys. Coordinates stay in
// Fighters metres; authored geographic floors and the frozen engine stay intact.
export const FLOOR_SPACING=2.12;
export const floorLevel=p=>p?.level??0;
export const baseHeight=p=>p?.elevation??(p?.level??0)*FLOOR_SPACING;
export const surfacePosition=p=>({x:p.x,y:p.y,...(floorLevel(p)||p.stairId?{level:floorLevel(p),elevation:baseHeight(p),...(p.stairId?{stairId:p.stairId}:{})}:{})});
export const floorKey=(building,room,level=0)=>building+(level?':L'+level:'')+':'+room;
export const buildingFloors=b=>[{level:0,rooms:b.rooms,doors:b.doors,walls:b.walls,furniture:b.furniture},...(b.upperFloors||[])];
export function stairLocal(stair,p){const dx=p.x-stair.x,dy=p.y-stair.y;return stair.rotated?{u:dy,v:dx}:{u:dx,v:dy};}
export function stairPoint(stair,u,v){return stair.rotated?{x:stair.x+v,y:stair.y+u}:{x:stair.x+u,y:stair.y+v};}
export const stairTurn=s=>(s.runCells??2)+.5;
export function stairCoreContains(s,p,radius=0){const {u,v}=stairLocal(s,p);return u>=-.5+radius&&u<=1.5-radius&&v>.5&&v<stairTurn(s)+1-radius;}
export function stairHeight(s,p){const {u,v}=stairLocal(s,p),half=FLOOR_SPACING/2,run=s.runCells??2;return s.level*FLOOR_SPACING+(v>=stairTurn(s)?half:u<.5?Math.max(0,Math.min(1,(v-.5)/run))*half:half+Math.max(0,Math.min(1,(stairTurn(s)-v)/run))*half);}
export function stairPosition(s,p,radius=.23){
 const {u,v}=stairLocal(s,p),turn=stairTurn(s);
 if(u<-.5+radius+.04||u>1.5-radius-.04||v>turn+1-radius-.04)return null;
 // The central handrail cannot be crossed until the turning landing.
 if(v>.5-radius&&v<turn+radius&&Math.abs(u-.5)<radius+.04)return null;
 const elevation=stairHeight(s,p);
 if(v<=.5)return {...p,level:s.level+(u>.5?1:0),elevation:s.level*FLOOR_SPACING+(u>.5?FLOOR_SPACING:0),stairId:undefined};
 return {...p,level:Math.round(elevation/FLOOR_SPACING),elevation,stairId:s.id};
}
export function stairBoxes(s){
 const boxes=[],run=s.runCells??2,steps=6,base=s.level*FLOOR_SPACING,half=FLOOR_SPACING/2;
 const box=(u0,v0,u1,v1,z0,height,kind='wall')=>{const a=stairPoint(s,u0,v0),b=stairPoint(s,u1,v1);boxes.push({x0:Math.min(a.x,b.x),y0:Math.min(a.y,b.y),x1:Math.max(a.x,b.x),y1:Math.max(a.y,b.y),z0,height,kind,windowPart:true,stairId:s.id,...(height-z0<.3?{stairTread:true}:{})});};
 for(let i=0;i<steps;i++){
  const v=.5+i*run/steps,top=base+(i+1)/steps*half;
  box(-.46,v,.46,v+run/steps,Math.max(base,top-.18),top);
  const rightTop=base+FLOOR_SPACING-i/steps*half;box(.54,v,1.46,v+run/steps,rightTop-.18,rightTop);
  // Rail segments use the same rise as their visible treads.
  box(-.5,v,-.46,v+run/steps,top,top+.85);box(.46,v,.54,v+run/steps,top,top+.85);
  const other=base+FLOOR_SPACING-i/steps*half;box(1.46,v,1.5,v+run/steps,other,other+.85);
 }
 const turn=stairTurn(s);box(-.46,turn,1.46,turn+1,base+half-.12,base+half);box(-.5,turn+1-.04,1.5,turn+1,base+half,base+half+.85);
 return boxes;
}

class Frontier{
 constructor(){this.items=[];this.sequence=0;}
 push(p){p.order=this.sequence++;let i=this.items.length;this.items.push(p);while(i){const n=(i-1)>>1,a=this.items[n];if(a.f<p.f||a.f===p.f&&a.order<p.order)break;this.items[i]=a;i=n;}this.items[i]=p;}
 pop(){const first=this.items[0],last=this.items.pop();if(this.items.length){let i=0;while(i*2+1<this.items.length){let n=i*2+1;if(n+1<this.items.length&&this.items[n+1].f<this.items[n].f)n++;if(this.items[n].f>=last.f)break;this.items[i]=this.items[n];i=n;}this.items[i]=last;}return first;}
}
const nodeKey=p=>[Math.round(p.x),Math.round(p.y),floorLevel(p),p.stairId||''].join(',');
const sameSurface=(a,b)=>floorLevel(a)===floorLevel(b)&&(a.stairId||'')===(b.stairId||'');
// A bounded 3-D graph of walkable surfaces. Every edge uses production swept
// movement, including rail clearance, doors, furniture, slabs and living units.
export function levelNavigation(world,unit,target,{clear=()=>true,rate=1,limit=16384}={}){
 const goal={...target,level:target.level??floorLevel(unit)},end=world.locationAt(goal);
 if(!end||!clear(end))return null;
 const trace=(a,b)=>world.traceWalk(a,b,.23,clear);
 const direct=trace(unit,end);if(direct&&sameSurface(direct,end))return [{...end,cost:Math.hypot(end.x-unit.x,end.y-unit.y)*rate}];
 const open=new Frontier(),cost=new Map(),points=new Map(),parents=new Map();
 const heuristic=p=>Math.hypot(p.x-end.x,p.y-end.y)+Math.abs(baseHeight(p)-baseHeight(end))*1.5;
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  const q=trace(unit,{x:Math.round(unit.x)+dx,y:Math.round(unit.y)+dy});if(!q)continue;const k=nodeKey(q),g=Math.hypot(q.x-unit.x,q.y-unit.y);if(g>=(cost.get(k)??Infinity))continue;points.set(k,q);cost.set(k,g);open.push({...q,g,f:g+heuristic(q)});
 }
 let found=null,expanded=0;
 while(open.items.length&&expanded++<limit){const p=open.pop(),pk=nodeKey(p);if(p.g>(cost.get(pk)??Infinity))continue;
  if(Math.hypot(p.x-end.x,p.y-end.y)<=1.5&&sameSurface(p,end)&&trace(p,end)){found=pk;break;}
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){if(!dx&&!dy)continue;const q=trace(p,{x:p.x+dx,y:p.y+dy});if(!q)continue;const k=nodeKey(q),g=p.g+Math.hypot(dx,dy);if(g>=(cost.get(k)??Infinity))continue;cost.set(k,g);points.set(k,q);parents.set(k,pk);open.push({...q,g,f:g+heuristic(q)});}
 }
 if(!found)return null;
 const raw=[end];for(let k=found;k;k=parents.get(k))raw.unshift(points.get(k));
 const result=[];let at={...unit},i=0;
 while(i<raw.length){let far=i;for(let j=raw.length-1;j>=i;j--){const q=trace(at,raw[j]);if(q&&sameSurface(q,raw[j])){far=j;break;}}const q=raw[far];result.push({...q,cost:Math.hypot(q.x-at.x,q.y-at.y)*rate});at=q;i=far+1;}
 return result;
}
