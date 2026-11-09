// Solo coordinates are metres: (x,y) on the ground, h above it. The inherited
// painted renderer consumes these as Three (x,h,y), without AFT floor scaling.
export const FLAME_RAY_COUNT=37,FLAME_HALF_ANGLE=24*Math.PI/180;
const cell=(x,y)=>`${Math.round(x)},${Math.round(y)}`;
const gap=(a,b)=>a.kind==='hidden'||a.kind!==b.kind||Math.abs(a.distance-b.distance)>1.05;

function wallEntry(a,b,box){
  let low=0,high=1;
  for(const [key,min,max] of [['x',box.x0,box.x1],['y',box.y0,box.y1]]){
    const delta=b[key]-a[key];
    if(Math.abs(delta)<1e-9){if(a[key]<min||a[key]>max)return null;continue;}
    const p=(min-a[key])/delta,q=(max-a[key])/delta;low=Math.max(low,Math.min(p,q));high=Math.min(high,Math.max(p,q));
    if(low>high)return null;
  }
  return high>1e-7?low:null;
}

export function recordFlame(source,range,geometry,visible){
  const heading=source.heading*Math.PI/180,h=source.stance==='prone'?.3:source.stance==='kneeling'?.75:1.1;
  const origin={x:source.x,y:source.y,h},walls=geometry.filter(box=>(box.kind==='wall'||box.kind==='glass')&&(!box.windowPart||h>=(box.z0??0)&&h<=box.height)),sourceVisible=visible.has(cell(source.x,source.y));
  const rays=Array.from({length:FLAME_RAY_COUNT},(_,i)=>{
    const angle=heading-FLAME_HALF_ANGLE+2*FLAME_HALF_ANGLE*i/(FLAME_RAY_COUNT-1),dx=Math.cos(angle),dy=Math.sin(angle),end={x:source.x+dx*range,y:source.y+dy*range};
    let reach=range,kind=sourceVisible?'range':'hidden';
    for(const box of walls){const entry=wallEntry(source,end,box);if(entry!==null&&entry*range<=reach){reach=Math.max(0,entry*range-.025);kind='wall';}}
    if(!sourceVisible){reach=0;kind='hidden';}
    else for(let d=0;d<=reach+.08;d+=.08){const at=Math.min(reach,d);if(!visible.has(cell(source.x+dx*at,source.y+dy*at))){reach=Math.max(0,at-.08);kind='fog';break;}}
    return {x:source.x+dx*reach,y:source.y+dy*reach,h,distance:reach,kind};
  });
  const visibleCells=[...visible].filter(key=>{const [x,y]=key.split(',').map(Number);return Math.hypot(x-source.x,y-source.y)<=range+1;});
  return {origin,heading,range,halfAngle:FLAME_HALF_ANGLE,rays,visibleCells,sourceVisible,source:{id:source.id,species:source.species,stance:source.stance,heading:source.heading,x:source.x,y:source.y}};
}

// Same conservative wedge contract as the inherited sheets, also enforced on
// every painted fragment so billboards cannot spill beyond a clipped endpoint.
export function pointInFlame(shape,point){
  const x=point.x-shape.origin.x,y=point.y-shape.origin.y,angle=Math.atan2(Math.sin(Math.atan2(y,x)-shape.heading),Math.cos(Math.atan2(y,x)-shape.heading));
  if(!shape.sourceVisible||Math.abs(angle)>shape.halfAngle+1e-8)return false;
  const i=Math.max(0,Math.min(35,Math.floor((angle+shape.halfAngle)/(2*shape.halfAngle)*36))),a=shape.rays[i],b=shape.rays[i+1];
  return !gap(a,b)&&(b.x-a.x)*(point.y-a.y)-(b.y-a.y)*(point.x-a.x)>=-1e-8;
}

// A distant wall/range transition removes that decorative wedge, but must not
// suppress the entire jet when its real muzzle is in the clear shared prefix.
// Fragment and sheet clipping still leave the distant discontinuity unbridged.
export function flameMuzzleInReach(shape,point){
  if(pointInFlame(shape,point))return true;
  const x=point.x-shape.origin.x,y=point.y-shape.origin.y,angle=Math.atan2(Math.sin(Math.atan2(y,x)-shape.heading),Math.cos(Math.atan2(y,x)-shape.heading));
  if(!shape.sourceVisible||Math.abs(angle)>shape.halfAngle||!shape.visibleCells.includes(cell(point.x,point.y)))return false;
  const i=Math.max(0,Math.min(35,Math.floor((angle+shape.halfAngle)/(2*shape.halfAngle)*36))),a=shape.rays[i],b=shape.rays[i+1];
  return gap(a,b)&&a.kind!=='hidden'&&b.kind!=='hidden'&&Math.hypot(x,y)<Math.min(a.distance,b.distance)*Math.cos(shape.halfAngle/36);
}

// Integer cell origin, texture dimensions and row-major RGBA indexing are shared
// by the aim cone and the discharge. This rectangle follows the recorded cone,
// never the renderer's resident blocks or the world's absolute coordinate size.
export function flameMaskRect(shape){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const key of shape.visibleCells){const [x,y]=key.split(',').map(Number);if(!Number.isInteger(x)||!Number.isInteger(y))continue;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  if(x0===Infinity)return {origin:{x:Math.round(shape.origin.x),y:Math.round(shape.origin.y)},width:1,height:1};
  return {origin:{x:x0,y:y0},width:x1-x0+1,height:y1-y0+1};
}

// Reuse an exactly sized buffer when available. Consumers must use the returned
// buffer and rect for their texture: UV=(floor(world+.5)-origin+.5)/size.
export function flameFogMask(shape,visible,bytes,rect=flameMaskRect(shape)){
  const size=rect.width*rect.height*4;if(!(bytes instanceof Uint8Array)||bytes.length!==size)bytes=new Uint8Array(size);
  bytes.fill(0);
  for(const key of shape.visibleCells){if(!visible.has(key))continue;const [wx,wy]=key.split(',').map(Number),x=wx-rect.origin.x,y=wy-rect.origin.y;if(Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<rect.width&&y>=0&&y<rect.height){const at=(y*rect.width+x)*4;bytes[at]=bytes[at+1]=bytes[at+2]=bytes[at+3]=255;}}
  return bytes;
}

// Preserve a visible expanding front and cutoff even if a first texture load
// or a slow frame spans the entire nominal 2.1-second presentation.
export function advanceFlameClock(active,now,reduced=false){
  if(active.last===null){active.last=now;active.elapsed=0;return 0;}
  let next=active.elapsed+Math.max(0,now-active.last)/1000;active.last=now;
  if(!reduced&&!active.shown&&next>=.32){next=Math.min(next,.56);active.shown=true;}
  else if(!reduced&&!active.tailShown&&next>=1.02){next=Math.min(next,1.24);active.tailShown=true;}
  active.elapsed=next;return next;
}
