import {canControl,navigationPath,moveGroup,pathCost} from './core/engine.js';
import {tileKey} from './core/maps.js';
import {CLIMBS,climbRiskText} from './climbing.js';

const key=p=>tileKey(p.x,p.y,p.z||0);
// Match the visible, live ground fire. Remembered terrain must not reveal a
// new fire inside an unseen room, and fire below a route is not on that route.
export function walkingHazards(state,path){
 const fires=new Set((state.fires||[]).filter(p=>p.turns>0&&state.visible.has(key(p))).map(key));
 return path.filter(p=>fires.has(key(p))).map(p=>({kind:'fire',x:p.x,y:p.y,z:p.z||0}));
}
export function walkingWarning(routes){
 const names=routes.filter(r=>r.hazards?.length).map(r=>r.name);
 const warnings=names.length?['⚠ Fire on route · '+names.join(', ')+' will catch fire.']:[];
 for(const route of routes)if(route.partial)warnings.push(route.name+' · Route blocked; will stop at the nearest reachable tile.');
 for(const route of routes){const climbs=(route.path||[]).filter(p=>p.climb&&!p.climb.legacy);if(climbs.length){const worst=climbs.reduce((a,b)=>a.climb.chance<b.climb.chance?a:b);warnings.push(`${route.name} · ${climbs.length} climb${climbs.length===1?'':'s'} · ${CLIMBS[worst.kind].label}: ${climbRiskText(worst.climb)} (per attempt)`);}}
 return warnings.join(' · ');
}

// Use the same known-map navigation and formation destinations as movement.
// A detached order simulation keeps previewing free of gameplay side effects.
export function walkingRoutes(state,ids,leader,goal){
 if(!canControl(state,leader))return [];
 let orders=state.queue[0]?.group;
 if(!orders&&state.queue.length){const last=state.queue.at(-1);orders=[{id:last.id,goal:last.goal||last}];}
 if(!orders){
  if(!goal)return [];
  if(ids.length>1){const copy={...state,units:state.units.map(u=>({...u})),queue:[],log:[...state.log]};if(!moveGroup(copy,ids,copy.units.find(u=>u.id===leader.id),goal.x,goal.y,goal.z))return [];orders=copy.queue[0].group;}
  else orders=[{id:leader.id,goal}];
 }
 return orders.flatMap(order=>{const unit=state.units.find(u=>u.id===order.id);if(!canControl(state,unit))return [];const path=navigationPath(state,unit,order.goal.x,order.goal.y,order.goal.z,{partial:true}),end=path?.at(-1);return end?[{id:unit.id,name:unit.name,start:unit,path,cost:pathCost(path),ap:unit.ap,partial:end.x!==order.goal.x||end.y!==order.goal.y||end.z!==(order.goal.z||0),hazards:walkingHazards(state,path)}]:[];});
}

export function drawWalkingRoutes(ctx,routes,project,level,zoom,combat){
 ctx.save();
 for(const route of routes){let previous=project(route.start);const hazards=new Set((route.hazards||[]).map(key));
  for(const tile of route.path){const p=project(tile),angle=Math.atan2(p.y-previous.y,p.x-previous.x)+Math.PI/2;previous=p;if((tile.z||0)!==level)continue;
   const danger=hazards.has(key(tile));
   if(danger){const corners=[[-.46,-.46],[.46,-.46],[.46,.46],[-.46,.46]].map(([x,y])=>project({...tile,x:tile.x+x,y:tile.y+y}));ctx.beginPath();corners.forEach((c,i)=>i?ctx.lineTo(c.x,c.y):ctx.moveTo(c.x,c.y));ctx.closePath();ctx.fillStyle='#ad302750';ctx.fill();ctx.strokeStyle='#ffd28a';ctx.lineWidth=2;ctx.stroke();}
   ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.scale(Math.max(.55,zoom),Math.max(.55,zoom));ctx.fillStyle=danger?'#ff7548':'#080a08';ctx.strokeStyle=danger?'#fff1ce':'#e6ddbc99';ctx.lineWidth=danger?1.2:.65;
   for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(side*3,-2,2,3.5,side*.15,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.ellipse(side*3,3,1.7,1.6,0,0,Math.PI*2);ctx.fill();}
   ctx.restore();
  }
  const first=route.hazards?.find(p=>p.z===level);if(first){const p=project(first);ctx.beginPath();ctx.moveTo(p.x,p.y-36);ctx.lineTo(p.x+11,p.y-17);ctx.lineTo(p.x-11,p.y-17);ctx.closePath();ctx.fillStyle='#ffd28a';ctx.fill();ctx.strokeStyle='#5b221d';ctx.lineWidth=2;ctx.stroke();ctx.font='bold 15px system-ui';ctx.textAlign='center';ctx.fillStyle='#3b1915';ctx.fillText('!',p.x,p.y-19);}
  const end=route.path.at(-1);if(combat&&(end.z||0)===level){const p=project(end),lift=hazards.has(key(end))?60:35,label=(routes.length>1?route.name+': ':'')+Number(route.cost.toFixed(1))+' AP'+(route.cost>route.ap?' · exceeds AP':'');ctx.font='bold 13px system-ui';ctx.textAlign='center';const w=ctx.measureText(label).width+14;ctx.fillStyle='#111b16ec';ctx.fillRect(p.x-w/2,p.y-lift,w,22);ctx.fillStyle=route.cost>route.ap?'#ffa990':'#fff0c9';ctx.fillText(label,p.x,p.y-lift+16);}
 }
 ctx.restore();
}
