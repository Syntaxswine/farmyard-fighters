import {createPartsDocument,compileParts} from '../parts-core/index.js';
import {createWorld} from '../world-core/state.js';
import {planOpenPorch,planRisers,planGableTrim,planProfiledCap} from './exterior-parts.js';
import {HOUSE,HOUSE_ROOMS,HOUSE_DOORS,HOUSE_WINDOWS,HOUSE_STAIR,HOUSE_TURRET} from './donnelly-layout.js';
import {clone} from './data.js';
import {donnellyFurnishings} from './donnelly-furnishing.js';
import {createSlopedRoof} from '../roof-core/index.js';
export {HOUSE,HOUSE_STAIR,HOUSE_TURRET} from './donnelly-layout.js';
const E=1e-7,rect=b=>[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]],inside=(p,b)=>p[0]>b[0]+E&&p[0]<b[2]-E&&p[1]>b[1]+E&&p[1]<b[3]-E;
const polygon=Array.from({length:6},(_,i)=>[HOUSE_TURRET.centre[0]+1.5*Math.cos(i*Math.PI/3),HOUSE_TURRET.centre[1]+1.5*Math.sin(i*Math.PI/3)]);
function inHex([x,y]){return polygon.every((p,i)=>{const q=polygon[(i+1)%6];return (q[0]-p[0])*(y-p[1])-(q[1]-p[1])*(x-p[0])>=-E;});}
const localRooms=level=>[...HOUSE_ROOMS.filter(r=>r.level===level),...(level?[{id:'U02',label:'Front chamber bay',bounds:[16,1,18,6],level}]:[])];
const roomAt=(rooms,p)=>rooms.find(r=>inside(p,r.bounds))?.id||null;
// Atomic, deduplicated wall axes. Shared room edges produce one wall; the bay
// and the attached hexagon remove their actual shared exterior boundaries.
function walls(level){
 const rooms=localRooms(level),result=[];
 for(const axis of ['x','y']){
  const fixedIndex=axis==='x'?1:0,along=1-fixedIndex,lines=[...new Set(rooms.flatMap(r=>[r.bounds[fixedIndex],r.bounds[fixedIndex+2]]))].sort((a,b)=>a-b);
  for(const fixed of lines){
   const values=rooms.flatMap(r=>[r.bounds[along],r.bounds[along+2]]);
   for(let i=0;i<6;i++){const p=polygon[i],q=polygon[(i+1)%6];if((fixed-p[fixedIndex])*(fixed-q[fixedIndex])<=0&&Math.abs(p[fixedIndex]-q[fixedIndex])>E)values.push(p[along]+(q[along]-p[along])*(fixed-p[fixedIndex])/(q[fixedIndex]-p[fixedIndex]));}
   const ticks=[...new Set(values)].sort((a,b)=>a-b);let previous=null;
   for(let i=0;i<ticks.length-1;i++){
    const lo=ticks[i],hi=ticks[i+1];if(hi-lo<E)continue;const at=axis==='x'?[(lo+hi)/2,fixed]:[fixed,(lo+hi)/2],a=[...at],b=[...at];a[fixedIndex]-=.0001;b[fixedIndex]+=.0001;
    const left=roomAt(rooms,a),right=roomAt(rooms,b);if(left===right||!left&&!right||(!left||!right)&&inHex(at)){previous=null;continue;}
    const key=[left,right].join('/');if(previous&&previous.key===key&&Math.abs(previous.hi-lo)<E)previous.hi=hi;else {previous={axis,fixed,lo,hi,key,exterior:!left||!right};result.push(previous);}
   }
  }
 }
 return result;
}
const worldPoint=([x,y])=>[x+HOUSE.origin[0],y+HOUSE.origin[1]],hFor=level=>level?HOUSE.upperH:HOUSE.groundH;
const box=(id,b,minH,topH,material,extra={})=>({id,kind:'box',points:rect(b).map(worldPoint),minH,topH,material,collider:true,...extra});
function segmentPart(id,a,b,minH,topH,material,extra={}){
 const length=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=-(b[1]-a[1])/length*.08,ny=(b[0]-a[0])/length*.08;
 return {id,kind:'prism',points:[[a[0]+nx,a[1]+ny],[a[0]-nx,a[1]-ny],[b[0]-nx,b[1]-ny],[b[0]+nx,b[1]+ny]].map(worldPoint),minH,topH,material,collider:true,...extra};
}
function outerHexParts(parts){
 for(let level=0;level<3;level++){
  const floor=HOUSE.groundH+level*HOUSE.storyM;
  if(level<2)parts.push({id:'house:turret-floor:'+level,kind:'prism',points:polygon.map(worldPoint),minH:floor-.12,topH:floor,material:'porch-floor',support:true,collider:true,floorId:level?'md-donnelly-upper':'md-donnelly-ground',level,role:'floor'});
  for(let i=0;i<6;i++){
   const p=polygon[i],q=polygon[(i+1)%6],ticks=[0,1];for(const [axis,value]of [[0,16],[1,12]])if(Math.abs(q[axis]-p[axis])>E){const t=(value-p[axis])/(q[axis]-p[axis]);if(t>E&&t<1-E)ticks.push(t);}
   ticks.sort((a,b)=>a-b);for(let j=0;j<ticks.length-1;j++){
    const at=t=>[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t],a=at(ticks[j]),b=at(ticks[j+1]);if(level<2&&inside(at((ticks[j]+ticks[j+1])/2),[6,0,16,12]))continue;
    const id='house:turret-wall:'+level+':'+i+':'+j,length=Math.hypot(b[0]-a[0],b[1]-a[1]),extra={level,role:'wall',floorId:level?'md-donnelly-upper':'md-donnelly-ground'};
    if(level===2||length<.85)parts.push(segmentPart(id,a,b,floor,floor+2,'yellow-siding',extra));
    else {
     const s=(length-.62)/2/length,t=1-s,u=[a[0]+(b[0]-a[0])*s,a[1]+(b[1]-a[1])*s],v=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
     parts.push(segmentPart(id+':a',a,u,floor,floor+2,'yellow-siding',extra),segmentPart(id+':b',v,b,floor,floor+2,'yellow-siding',extra),segmentPart(id+':sill',u,v,floor,floor+.55,'yellow-siding',extra),segmentPart(id+':head',u,v,floor+1.73,floor+2,'yellow-siding',extra));
     const centre=worldPoint([(u[0]+v[0])/2,(u[1]+v[1])/2]);parts.push({id:id+':window',kind:'window',centre:[centre[0],floor+1.14,centre[1]],normal:[(b[1]-a[1])/length,-(b[0]-a[0])/length],widthM:.62,heightM:1.18,material:'recessed-window',level,role:'detail'});
     parts.push(segmentPart(id+':glass',u,v,floor+.55,floor+1.73,'recessed-window',{...extra,role:'glass'}));
    }
   }
  }
 }
 parts.push({id:'house:turret-ceiling',kind:'prism',points:polygon.map(worldPoint),minH:HOUSE.atticH-.12,topH:HOUSE.atticH,material:'ivory',collider:true,level:2,role:'floor'});
 const c=worldPoint(HOUSE_TURRET.centre);parts.push(planProfiledCap({id:'house:turret-cap',centre:c,baseH:HOUSE.groundH+3*2.12,sides:6,rings:[[0,1.65],[.18,1.65],[.5,1.53],[1.2,1.3],[1.9,.95],[2.4,.55],[2.6,.18],[2.8,0]]}));
}
let cached;
/** An authored native-parts assembly plus explicit convex/faceted adapters.
 * No renderer bounds, hidden ramps, scaling or second controller supply truth. */
export function planDonnellyHouse(){
 if(cached)return {...clone(cached),scene:cached.scene};
 const world=createWorld({id:'mount-dora',name:'Donnelly interpreted house',widthM:1440,depthM:1680,floorCount:1,storyHeightM:2.12,groundHeightM:0,heightM:30});
 world.floors=[['md-ground',0],['md-donnelly-ground',HOUSE.groundH],['md-donnelly-upper',HOUSE.upperH],['md-donnelly-attic',HOUSE.atticH]].map(([id,elevationM],index)=>({id,index,label:['Town ground','House ground','House upper','Attic ceiling'][index],elevationM}));
 const definitions=[],instances=[],windowBindings=[],doorLabels={},furnishings=donnellyFurnishings();
 for(const level of [0,1,2]){
  const floor=hFor(level),elevation=level===2?HOUSE.atticH:floor,floorId=level===2?'md-donnelly-attic':level?'md-donnelly-upper':'md-donnelly-ground',parts=[];
  const rooms=localRooms(level===2?1:level);
  for(const [index,r]of rooms.entries())parts.push({id:'floor-'+index,type:level===2?'solid':'slab',floorId:'level',material:level===2?'ivory':'porch-floor',bounds:{min:{x:r.bounds[0],y:r.bounds[1],h:elevation-.12},max:{x:r.bounds[2],y:r.bounds[3],h:elevation}},...(level===2?{}:{holes:r.id==='U05'&&level===1?[{id:'main-stair-hole',enabled:true,rect:{min:{x:HOUSE_STAIR.hole[0],y:HOUSE_STAIR.hole[1]},max:{x:HOUSE_STAIR.hole[2],y:HOUSE_STAIR.hole[3]}}}]:[]})});
  if(level<2)for(const [index,w]of walls(level).entries()){
   const along=w.axis==='x'?0:1,fixed=1-along,origin=w.axis==='x'?{x:w.lo,y:w.fixed,h:floor}:{x:w.fixed,y:w.lo,h:floor},openings=[];
   for(const o of [...HOUSE_DOORS.filter(d=>d.level===level),...HOUSE_WINDOWS.filter(d=>d.level===level)])if(o.axis===w.axis&&Math.abs(o.at[fixed]-w.fixed)<E&&o.at[along]-o.widthM/2>=w.lo-E&&o.at[along]+o.widthM/2<=w.hi+E){
    const door=Object.hasOwn(o,'open'),offsetM=o.at[along]-o.widthM/2-w.lo,id='opening-'+o.id;openings.push({id,enabled:true,offsetM,widthM:o.widthM,heightM:door?2:o.heightM,bottomM:door?0:o.bottomM});
    if(door&&o.swing){const doorOrigin={...origin,[w.axis]:origin[w.axis]+offsetM},partId='door-'+o.id;parts.push({id:partId,type:'door',floorId:'level',material:'door-wood',portalId:id,axis:w.axis,origin:doorOrigin,hand:o.hand,hingeInsetM:.03,leaf:{widthM:o.widthM-.06,heightM:1.94,thicknessM:.04,offsetM:0,bottomM:.02},swing:o.swing,reachM:1.15,initial:{open:o.open,locked:false}});doorLabels[partId]=o.id==='front'?'front door':o.id==='rear'?'kitchen outside door':HOUSE_ROOMS.find(r=>r.id===(['G05','G10','G11','U05','U09'].includes(o.to)?o.from:o.to))?.label+' door';}
    if(!door)windowBindings.push({...o,h:floor+o.bottomM+o.heightM/2,exterior:w.exterior});
   }
   parts.push({id:'wall-'+index,type:'wall',floorId:'level',material:w.exterior?'yellow-siding':'plaster',axis:w.axis,origin,lengthM:w.hi-w.lo,heightM:2,thicknessM:.16,openings});
  }
  const id='house-level-'+level;
  if(parts.length>128)throw Error('HOUSE_NATIVE_PART_BUDGET');
  definitions.push({kind:'nautilus-part-definition',version:1,id,contentVersion:'1',label:'Donnelly '+level,profileId:'native-aabb-parts-v1',parameters:[],floors:[{id:'level',elevationM:elevation}],parts,source:{project:'Nautilus Engine',commit:null,path:'packages/mount-dora-core/donnelly-house.js',notice:'packages/mount-dora-core/NOTICE.md',guide:'docs/projects/donnelly-house-interior.md'}});
  instances.push({id,definition:{id,version:'1'},transform:{x:HOUSE.origin[0],y:HOUSE.origin[1],h:0,quarterTurns:0},parameters:{},initial:[],mode:'functional',children:[]});
 }
 for(const level of [0,1,2]){const id='house-furniture-'+level,parts=furnishings.filter(p=>p.level===level).map(p=>({id:p.id,type:'solid',floorId:'level',material:p.material,bounds:p.bounds}));definitions.push({kind:'nautilus-part-definition',version:1,id,contentVersion:'1',label:'Donnelly solid anchors '+level,profileId:'native-aabb-parts-v1',parameters:[],floors:[{id:'level',elevationM:HOUSE.groundH+level*2.12}],parts,source:{project:'Nautilus Engine',commit:null,path:'packages/mount-dora-core/donnelly-furnishing.js',notice:'packages/mount-dora-core/NOTICE.md',guide:'docs/projects/donnelly-house-interior.md'}});instances.push({id,definition:{id,version:'1'},transform:{x:HOUSE.origin[0],y:HOUSE.origin[1],h:0,quarterTurns:0},parameters:{},initial:[],mode:'functional',children:[]});}
 const document=createPartsDocument({world,instances}),compiled=compileParts(document,{definitions,bodyProfile:HOUSE.body});if(!compiled.ok)throw Error('HOUSE_COMPILE '+JSON.stringify(compiled.diagnostics));const scene=compiled.scene,parts=[];
 const surfaces=new Map(scene.world.surfaces.map(s=>[s.id,s]));
 for(const p of scene.renderBindings)if(p.type==='box'){
  const s=surfaces.get(p.surfaceId),b=p.bounds,level=p.floorId==='md-donnelly-ground'?0:p.floorId==='md-donnelly-upper'?1:2;
  parts.push({id:p.id,kind:'box',points:rect([b.min.x,b.min.y,b.max.x,b.max.y]),minH:b.min.h,topH:b.max.h,material:p.material,support:s.supports,collider:true,floorId:p.floorId,level,role:p.partId.startsWith('floor-')?'floor':p.partId.startsWith('furn-')?'furniture':'wall',nativePartId:p.partId});
 }
 for(const w of windowBindings){const [x,y]=worldPoint(w.at),normal=w.axis==='y'?[1,0]:[0,1];parts.push({id:'house:'+w.id,kind:w.id==='window-9'?'round-window':'window',centre:[x,w.h,y],normal,widthM:w.widthM,heightM:w.heightM,...(w.id==='window-9'?{radiusM:.78}:{}),material:'recessed-window',level:w.level,role:'detail'});const b=w.axis==='x'?[w.at[0]-w.widthM/2,w.at[1]-.015,w.at[0]+w.widthM/2,w.at[1]+.015]:[w.at[0]-.015,w.at[1]-w.widthM/2,w.at[0]+.015,w.at[1]+w.widthM/2];parts.push(box('house:'+w.id+':glass',b,w.h-w.heightM/2,w.h+w.heightM/2,'recessed-window',{level:w.level,role:'glass'}));}
 outerHexParts(parts);
 const s=HOUSE_STAIR,rise=s.riseM;
 for(let i=0;i<5;i++){
  parts.push(box('house:main-stair:lower:'+i,[s.x0+i*.3,s.y0,s.x0+(i+1)*.3,s.y1],HOUSE.groundH,HOUSE.groundH+(i+1)*rise,'stair-wood',{support:true,floorId:'md-donnelly-stair-'+(i+1),level:0,role:'stairs'}));
  parts.push(box('house:main-stair:upper:'+i,[s.turnX-(i+1)*.3,s.y2,s.turnX-i*.3,s.y3],HOUSE.groundH,HOUSE.groundH+(i+7)*rise,'stair-wood',{support:true,floorId:'md-donnelly-stair-'+(i+7),level:0,role:'stairs'}));
 }
 parts.push(box('house:main-stair:turn',[s.turnX,s.y0,s.endX,s.y3],HOUSE.groundH,HOUSE.groundH+6*rise,'stair-wood',{support:true,floorId:'md-donnelly-stair-6',level:0,role:'stairs'}));
 // Real sloping handrails/guards, all sharing these physical beam segments.
 const rail=(id,a,b)=>parts.push({id:'house:stair-rail:'+id,kind:'beam',from:[a[0]+HOUSE.origin[0],a[2],a[1]+HOUSE.origin[1]],to:[b[0]+HOUSE.origin[0],b[2],b[1]+HOUSE.origin[1]],widthM:.06,material:'ivory',collider:true,level:0,role:'stairs'});
 for(const [id,y,h0,h1]of [['north',s.y0-.03,HOUSE.groundH+rise,HOUSE.groundH+6*rise],['inner-lower',(s.y1+s.y2)/2,HOUSE.groundH+rise,HOUSE.groundH+6*rise],['inner-upper',(s.y1+s.y2)/2,HOUSE.upperH,HOUSE.groundH+6*rise],['south',s.y3+.03,HOUSE.upperH,HOUSE.groundH+6*rise]]){
  rail(id,[s.x0,y,h0+.88],[s.turnX,y,h1+.88]);for(let i=0;i<=5;i++){const x=s.x0+i*.3,h=h0+(h1-h0)*i/5;rail(id+'-post-'+i,[x,y,h],[x,y,h+.88]);}
 }
 rail('turn-east',[s.endX,s.y0,HOUSE.groundH+6*rise+.88],[s.endX,s.y3,HOUSE.groundH+6*rise+.88]);
 for(const y of [s.y0,s.y3])rail('turn-post-'+y,[s.endX,y,HOUSE.groundH+6*rise],[s.endX,y,HOUSE.groundH+6*rise+.88]);
 // Upper gallery guards stop before the actual top landing; no invisible rail
 // is stretched across the intended final step.
 parts.push({id:'house:upper-hole-north',kind:'rail',points:[[s.x0,s.y0+.04],[s.endX-.04,s.y0+.04]].map(worldPoint),minH:HOUSE.upperH+.1,topH:HOUSE.upperH+.9,radiusM:.035,material:'ivory',collider:true,level:1,role:'guard'},
  {id:'house:upper-hole-east',kind:'rail',points:[[s.endX-.04,s.y0+.04],[s.endX-.04,s.y3-.04]].map(worldPoint),minH:HOUSE.upperH+.1,topH:HOUSE.upperH+.9,radiusM:.035,material:'ivory',collider:true,level:1,role:'guard'});
 for(const [id,a,b]of [['south',[s.x0,s.y3-.04],[s.endX-.04,s.y3-.04]],['west-lower',[s.x0+.04,s.y0+.04],[s.x0+.04,s.y2-.04]]])parts.push({id:'house:upper-hole-'+id,kind:'rail',points:[a,b].map(worldPoint),minH:HOUSE.upperH+.1,topH:HOUSE.upperH+.9,radiusM:.035,material:'ivory',collider:true,level:1,role:'guard'});
 for(const [id,b]of [['front-north',[16,.8,18,7]],['front-south',[16,8.8,18,12]],['landing',[16,7,18,8.8]],['south',[6,12,18,14]]]){
  const q=planOpenPorch({id:'house:porch:'+id,bounds:[b[0]+HOUSE.origin[0],b[1]+HOUSE.origin[1],b[2]+HOUSE.origin[0],b[3]+HOUSE.origin[1]],floorH:HOUSE.groundH,railEdges:id==='landing'?[]:id==='south'?['south']:['east'],upperEnclosures:[{bounds:[402.5,470.5,404.5,475.5],minH:HOUSE.upperH}],openings:[[404.2,476.3,406.8,478.5]]});
  for(const p of q){p.level=p.minH>=HOUSE.upperH-.13?1:0;if(p.id.endsWith(':deck')){p.floorId='md-donnelly-ground';p.role='floor';}if(p.id.endsWith(':balcony')){p.floorId='md-donnelly-upper';p.support=true;p.role='floor';p.level=1;}if(p.id.endsWith(':roof')||p.id.includes(':eave:'))p.level=2;}parts.push(...q);
 }
 parts.push(...planRisers({id:'house:approach',bounds:[404.5,476.5,406,478.3],topH:HOUSE.groundH,riseM:HOUSE.groundH/5}).map(p=>({...p,floorId:p.topH===HOUSE.groundH?'md-donnelly-ground':'md-donnelly-approach-'+Math.round(p.topH/(HOUSE.groundH/5)),level:0,role:'stairs'})));
 for(const y of [476.465,478.335]){
  parts.push({id:'house:approach-hand-rail:'+y,kind:'beam',from:[406,HOUSE.groundH/5+.88,y],to:[404.5,HOUSE.groundH+.88,y],widthM:.07,material:'ivory',collider:true,level:0,role:'stairs'});
  for(const [x,h]of [[406,HOUSE.groundH/5],[404.5,HOUSE.groundH]])parts.push({id:'house:approach-rail-post:'+y+':'+x,kind:'beam',from:[x,h,y],to:[x,h+.88,y],widthM:.07,material:'ivory',collider:true,level:0,role:'stairs'});
 }
 // The interpreted kitchen outside door needs its own real approach; it does
 // not open onto an .848m drop or use a special exit/scene transition.
 parts.push(box('house:rear-landing',[-1.2,10.4,0,11.6],0,HOUSE.groundH,'porch-floor',{support:true,floorId:'md-donnelly-ground',level:0,role:'floor'}));
 for(let i=0;i<5;i++)parts.push(box('house:rear-step:'+i,[-2.7+i*.3,10.4,-2.4+i*.3,11.6],0,i===4?HOUSE.groundH:(i+1)*(HOUSE.groundH/5),'ivory',{support:true,floorId:i===4?'md-donnelly-ground':'md-donnelly-rear-step-'+(i+1),level:0,role:'stairs'}));
 for(const y of [10.365,11.635]){const a=worldPoint([-2.7,y]),b=worldPoint([-1.2,y]),c=worldPoint([0,y]);parts.push({id:'house:rear-hand-rail:'+y,kind:'beam',from:[a[0],HOUSE.groundH/5+.88,a[1]],to:[b[0],HOUSE.groundH+.88,b[1]],widthM:.07,material:'ivory',collider:true,level:0,role:'stairs'},{id:'house:rear-landing-rail:'+y,kind:'rail',points:[b,c],minH:HOUSE.groundH+.1,topH:HOUSE.groundH+.88,radiusM:.035,material:'ivory',collider:true,level:0,role:'guard'});}
 for(const y of [10.365,11.635]){const a=worldPoint([-2.7,y]);parts.push({id:'house:rear-bottom-post:'+y,kind:'beam',from:[a[0],HOUSE.groundH/5,a[1]],to:[a[0],HOUSE.groundH/5+.88,a[1]],widthM:.07,material:'ivory',collider:true,level:0,role:'stairs'});}
 parts.push({...planGableTrim({id:'house:entry-canopy',x0:402.5,x1:406.15,y0:476.35,y1:478.45,eaveH:HOUSE.upperH,riseM:.7}),level:1,collider:true});
 for(const [id,x,y,width,depth,style,axis,pitch]of [['main',6,0,10,12,'hip','y',42],['front-large',12,1,6,5,'gable','x',53],['front-small',12.5,7.8,3.8,2.4,'gable','x',50],['rear',0,4,6,9,'hip','y',36]]){
  const spec={id:'donnelly-'+id,x:x+2,y:y+2,width,depth,z:2,style,axis,pitch,overhang:.18,material:'metal',seed:1401},data=createSlopedRoof(spec),translation=[HOUSE.origin[0]-2,HOUSE.groundH,HOUSE.origin[1]-2];
  // The consumer deliberately closes the entire unplayable attic envelope at
  // its real eave underside. It does not advertise a walkable pitched roof.
  parts.push({id:'house:roof:'+id,kind:'sloped-roof',spec,translation,points:rect([x-.18,y-.18,x+width+.18,y+depth+.18]).map(worldPoint),minH:HOUSE.atticH-.12,topH:data.bounds.max[1]+HOUSE.groundH,collider:true,level:2,role:'roof',collisionProfile:'closed-attic-eave-v1'});
  if(style==='gable'){
   const base=HOUSE.atticH,edgeH=base+.18*Math.tan(pitch*Math.PI/180),frontX=HOUSE.origin[0]+x+width,y0=HOUSE.origin[1]+y,y1=y0+depth;
   parts.push({id:'house:gable-end:'+id,kind:'gable-end',x:frontX,outline:[[y0,base],[y1,base],[y1,edgeH],[(y0+y1)/2,base+data.rise],[y0,edgeH]],windows:id==='front-large'?[2.7,4.3].map((cy,i)=>({id:'house:attic-window:'+i,centre:[frontX,base+.76,HOUSE.origin[1]+cy],widthM:.55,heightM:1.22})):[],level:2,role:'roof',material:'yellow-siding'});
  }
 }
 const doors=scene.renderBindings.filter(p=>p.type==='door-leaf').map(p=>({...p,label:doorLabels[p.partId]||p.partId}));
 cached={kind:'nautilus-donnelly-house',version:1,profile:'interior-v1',evidence:'User-approved domestic interpretation; inferred axes and roof massing, not surveyed or code-certified',floorH:HOUSE.groundH,storyM:2.12,rooms:clone(HOUSE_ROOMS),doorAxes:clone(HOUSE_DOORS),furnishings:clone(furnishings),stair:clone(HOUSE_STAIR),turret:clone(HOUSE_TURRET),parts,doors,scene,document,definitions};
 return {...clone(cached),scene:cached.scene};
}
