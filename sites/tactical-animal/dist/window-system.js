// Pure, metre-based rules shared by combat, saves and the editor adapter.
// The artist supplies describe(definitionId, joins); no renderer owns damage.
const EPS=1e-7,QUARTERS=[0,90,180,270];
export const WINDOW_SCHEMA=1;
export const SHATTER_LIMITS=Object.freeze({active:6,triangles:210,perPane:70,receipts:128});
const basis=p=>{const r=(p.rotation||0)*Math.PI/180;return {c:Math.round(Math.cos(r)),s:Math.round(Math.sin(r))};};
export function windowToWorld(p,v){const {c,s}=basis(p);return {x:p.x+c*v[0]+s*v[2],y:p.y-s*v[0]+c*v[2],h:v[1]};}
export function windowToLocal(p,v){const {c,s}=basis(p),x=v.x-p.x,y=v.y-p.y;return [c*x-s*y,v.h??0,s*x+c*y];}
export function windowBox(p,part,kind){
  const points=[];for(const x of [part.min[0],part.max[0]])for(const z of [part.min[2],part.max[2]])points.push(windowToWorld(p,[x,0,z]));
  return {x0:Math.min(...points.map(v=>v.x)),x1:Math.max(...points.map(v=>v.x)),y0:Math.min(...points.map(v=>v.y)),y1:Math.max(...points.map(v=>v.y)),z0:part.min[1],height:part.max[1],kind,windowId:p.id,windowPart:true,partId:part.id,role:part.role,...(kind==='glass'?{paneId:part.id}:{})};
}
export function windowEdges(p,width){
  const horizontal=(p.rotation||0)%180===0,along=horizontal?p.x:p.y,across=horizontal?p.y:p.x,start=along-(width-1)/2;
  if(!Number.isInteger(width)||width<1||width>240||!Number.isInteger(start)||!Number.isInteger(across-.5))throw Error('Windows must align with complete wall spans inside the 240 m sector.');
  return Array.from({length:width},(_,i)=>horizontal?`s:${start+i}:${across-.5}`:`e:${across-.5}:${start+i}`);
}
// Old wall meshes overhang by 6 cm. Clip only the end adjoining a placed
// window; remove every covered edge, including those across a render seam.
export function legacyWallSpan(edge,covered,length=1.12){
  if(covered.has(edge))return null;
  const [axis,x,y]=edge.split(':'),along=axis==='s'?+x:+y,across=axis==='s'?+y:+x;
  const key=n=>axis==='s'?`s:${n}:${across}`:`e:${across}:${n}`;
  return {min:along-(covered.has(key(along-1))?.5:length/2),max:along+(covered.has(key(along+1))?.5:length/2)};
}
export function clipLegacyWindowBox(box,covered,length=1.12){
  const edge=box.source?.edge,parts=edge?.split(':');
  if(!edge||(box.source.z||0)>0||parts.length===4&&parts[3]!=='0')return box;
  const normalized=parts.length===4?parts.slice(0,3).join(':'):edge,span=legacyWallSpan(normalized,covered,length);if(!span)return null;
  const along=parts[0]==='s'?0:2,coordinate=+(parts[0]==='s'?parts[1]:parts[2]);
  const left=span.min>coordinate-length/2+EPS,right=span.max<coordinate+length/2-EPS;if(!left&&!right)return box;
  const min=box.center[along]-box.size[along]/2,max=box.center[along]+box.size[along]/2,lo=left?Math.max(min,span.min):min,hi=right?Math.min(max,span.max):max;
  if(hi<=lo)return null;
  return {...box,center:box.center.map((n,i)=>i===along?(lo+hi)/2:n),size:box.size.map((n,i)=>i===along?hi-lo:n)};
}
// Bounds come from the asset contract, never a saved bounds object. Leave
// float-buffer headroom for rotated/ejected shards without a storey-height cap.
function validBounds(bounds){return bounds&&Array.isArray(bounds.min)&&Array.isArray(bounds.max)&&bounds.min.length===3&&bounds.max.length===3&&[...bounds.min,...bounds.max].every(n=>Number.isFinite(n)&&Number.isFinite(Math.fround(n*4)))&&bounds.min.every((n,i)=>n<=bounds.max[i])&&bounds.min[1]===0&&Math.fround(bounds.max[1])>0;}
function validPart(part,bounds){return part&&typeof part.id==='string'&&Array.isArray(part.min)&&Array.isArray(part.max)&&part.min.length===3&&part.max.length===3&&[...part.min,...part.max].every(Number.isFinite)&&part.min.every((n,i)=>n<part.max[i]&&n>=bounds.min[i]-EPS&&part.max[i]<=bounds.max[i]+EPS);}
export function makeWindowSystem(describe){
  const cache=new WeakMap();
  function compile(state){
    const previous=cache.get(state);if(previous&&previous.source===state.windows)return previous.records;
    const ids=new Set(),edges=new Set(),records=[];
    if(state.windows!==undefined&&!Array.isArray(state.windows))throw Error('Unsupported window placements.');
    if((state.windows?.length||0)>1024)throw Error('Too many placed windows.');
    for(const p of state.windows||[]){
      if(p?.finish!==undefined&&!['steel','sage','ivory'].includes(p.finish)||p?.wall!==undefined&&!['brick','concrete','corrugated'].includes(p.wall))throw Error('Unsupported window finish.');
      if(p?.dimensions!==undefined&&(!p.dimensions||typeof p.dimensions!=='object'||Array.isArray(p.dimensions)||Object.keys(p.dimensions).length!==2||Object.keys(p.dimensions).some(k=>!['width','height'].includes(k))||![p.dimensions.width,p.dimensions.height].every(n=>Number.isFinite(n)&&n>0)))throw Error('Unsupported window dimensions.');
      if(!p||typeof p.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/.test(p.id)||ids.has(p.id)||typeof p.definitionId!=='string'||![p.x,p.y].every(Number.isFinite)||(p.z??0)!==0||!QUARTERS.includes(p.rotation??0)||p.joins!==undefined&&(!p.joins||typeof p.joins!=='object'||Array.isArray(p.joins)||Object.entries(p.joins).some(([k,v])=>!['left','right'].includes(k)||typeof v!=='boolean')))throw Error('Unsupported window placement.');
      const spec=describe(p.definitionId,p.joins||{},p.dimensions);if(!spec||!validBounds(spec.bounds)||!Number.isFinite(spec.height)||spec.height!==spec.bounds.max[1]||Math.abs(spec.width-(spec.bounds.max[0]-spec.bounds.min[0]))>EPS||!Array.isArray(spec.panes)||!spec.panes.length||!Array.isArray(spec.solids)||!spec.panes.every(part=>validPart(part,spec.bounds))||!spec.solids.every(part=>validPart(part,spec.bounds))||spec.panes.some((v,i)=>spec.panes.findIndex(q=>q.id===v.id)!==i))throw Error('Unsupported window definition.');
      if(spec.requiresDimensions&&p.dimensions===undefined)throw Error('A custom sheet must retain its dimensions.');
      const covered=windowEdges(p,spec.width);for(const edge of covered){if(edges.has(edge))throw Error('Placed windows overlap.');edges.add(edge);}
      if(state.map||state.terrain){const rows=state.map||state.terrain,w=rows[0].length,h=rows.length,footprint=windowBox(p,spec.bounds,'prop');if(footprint.x0<-.61||footprint.y0<-.61||footprint.x1>w-.39||footprint.y1>h-.39)throw Error('Window is outside the map.');}
      ids.add(p.id);records.push({placement:p,spec,edges:covered});
    }
    cache.set(state,{source:state.windows,records});return records;
  }
  const broken=(s,id,pane)=>Object.hasOwn(s.windowBreaks||{},id)&&s.windowBreaks[id].includes(pane);
  function boxes(state){
    return compile(state).flatMap(({placement:p,spec})=>[
      // Existing wall windows are not walkable/vaultable. Keep that rule even
      // after breaking glass; this reservation never blocks sight or a bullet.
      windowBox(p,{id:'passage',role:'window-passage',min:[spec.bounds.min[0],0,-.08],max:[spec.bounds.max[0],spec.height,.08]},'prop'),
      ...spec.solids.map(part=>windowBox(p,part,'wall')),
      ...spec.panes.filter(part=>!broken(state,p.id,part.id)).map(part=>windowBox(p,part,'glass')),
    ]);
  }
  function restore(state){
    const records=compile(state),byId=new Map(records.map(r=>[r.placement.id,r]));
    if(state.windowBreaks!==undefined){
      if(!state.windowBreaks||typeof state.windowBreaks!=='object'||Array.isArray(state.windowBreaks))throw Error('Unsupported window damage save.');
      for(const [id,panes]of Object.entries(state.windowBreaks)){const record=byId.get(id);if(!record||!Array.isArray(panes)||new Set(panes).size!==panes.length||panes.some(pane=>!record.spec.panes.some(p=>p.id===pane)))throw Error('Unsupported window damage save.');}
    }
    if(state.windowSequence!==undefined&&(!Number.isSafeInteger(state.windowSequence)||state.windowSequence<0))throw Error('Unsupported window event counter.');
    delete state.windowEvents;return state;
  }
  function breakPane(state,instanceId,paneId,point,{cause='bullet',direction=1}={}){
    const record=compile(state).find(r=>r.placement.id===instanceId),pane=record?.spec.panes.find(p=>p.id===paneId);
    if(!pane||broken(state,instanceId,paneId))return null;
    state.windowBreaks??=Object.create(null);if(!Object.hasOwn(state.windowBreaks,instanceId))state.windowBreaks[instanceId]=[];state.windowBreaks[instanceId].push(paneId);
    const sequence=state.windowSequence=(state.windowSequence||0)+1;let seed=2166136261;for(const c of `${instanceId}/${paneId}/${sequence}`)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
    const event={sequence,instanceId,paneId,point:{...point},cause,direction:direction<0?-1:1,seed};(state.windowEvents??=[]).push(event);state.windowEvents=state.windowEvents.slice(-SHATTER_LIMITS.receipts);state.revision++;return event;
  }
  function blast(state,origin,radius,{occluded=()=>false,ignoreWalls=false}={}){
    const events=[];
    for(const {placement:p,spec}of compile(state))for(const pane of spec.panes){
      if(broken(state,p.id,pane.id))continue;
      const local=windowToLocal(p,{...origin,h:1.1}),x=Math.max(pane.min[0]+EPS,Math.min(pane.max[0]-EPS,local[0])),point=windowToWorld(p,[x,(pane.min[1]+pane.max[1])/2,0]);
      // Farmyard's existing flat-sector blast is a ground-plane radius. Its
      // wall-height cylinder can intersect several independent glass sections.
      if(Math.hypot(point.x-origin.x,point.y-origin.y)>radius+EPS||!ignoreWalls&&occluded(origin,point))continue;
      const event=breakPane(state,p.id,pane.id,point,{cause:'blast',direction:local[2]<0?1:-1});if(event)events.push(event);
    }
    return events;
  }
  return {compile,boxes,restore,broken,breakPane,blast};
}
