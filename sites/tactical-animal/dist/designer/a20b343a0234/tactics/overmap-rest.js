export const REST_MINUTES=480;
export const mercMaxHp=u=>u.maxHp??50+Math.max(1,Math.min(100,u.stats?.strength??50));
export function startGroupRest(session,id){
 const g=session.groups.find(g=>g.id===id);
 if(session.logistics?.pending||!g||g.rest||g.firstAid||g.training||g.state.route.length||g.state.progress||g.waitMinutes)throw Error('Select an idle group in a sector to rest.');
 for(const u of g.state.members){u.maxHp=mercMaxHp(u);u.hp??=u.maxHp;}
 g.rest={startedAt:session.clock.minutes,sector:g.state.position,members:g.state.members.map(u=>({id:u.id,hp:u.hp,fatigue:u.social?.fatigue??0}))};
}
export function updateGroupRest(g,now){
 if(!g.rest)return;
 const fraction=Math.max(0,Math.min(1,(now-g.rest.startedAt)/REST_MINUTES));
 for(const initial of g.rest.members){const u=g.state.members.find(u=>u.id===initial.id);if(!u)continue;
  // Sleep cannot revive a casualty. Compute from the snapshot to avoid tick rounding drift.
  if(initial.hp>0&&u.hp>0)u.hp=Math.min(mercMaxHp(u),Math.max(u.hp,initial.hp+15*fraction));
  u.social??={};u.social.fatigue=initial.fatigue*(1-fraction);
 }
 if(g.state.members.every(u=>(u.social?.fatigue??0)<=60))g.state.restRequired=false;
 if(fraction===1)delete g.rest;
}
export function stopGroupRest(session,id){
 const g=session.groups.find(g=>g.id===id);if(!g?.rest)throw Error('This group is not resting.');
 updateGroupRest(g,session.clock.minutes);delete g.rest;
}
export function interruptRest(session,ids){for(const g of session.groups)if(ids.includes(g.id)&&g.rest)stopGroupRest(session,g.id);}
export function validateGroupRest(g,clock){
 const r=g.rest;if(!r)return;
 if(g.firstAid||g.training||g.state.route.length||g.state.progress||g.waitMinutes||r.sector!==g.state.position||!Number.isFinite(r.startedAt)||r.startedAt<0||r.startedAt>clock.minutes||clock.minutes-r.startedAt>=REST_MINUTES||!Array.isArray(r.members)||r.members.length!==g.state.members.length||new Set(r.members.map(u=>u.id)).size!==r.members.length)throw Error('Invalid saved rest assignment.');
 for(const u of r.members){const merc=g.state.members.find(m=>m.id===u.id);if(!merc||!Number.isFinite(u.hp)||u.hp<0||u.hp>mercMaxHp(merc)||!Number.isFinite(u.fatigue)||u.fatigue<0||u.fatigue>100)throw Error('Invalid saved rest recovery.');}
}
