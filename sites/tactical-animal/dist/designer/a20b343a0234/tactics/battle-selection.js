import {alive,setStance,stanceOf,canControl,combatCosts,STANCES,MOVEMENT_MODES,movementModeOf,setMovementMode} from './core/engine.js';
export const selectable=u=>u.team==='squad'&&alive(u)&&u.casualty!=='captured';
export const selectionModifier=event=>!!(event.shiftKey||event.ctrlKey||event.metaKey);
export function rectangleMembers(units,level,a,b,project){
 const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);
 return units.filter(u=>{if(!selectable(u)||(u.z||0)!==level)return false;const p=project(u);return p.x>=left&&p.x<=right&&p.y>=top&&p.y<=bottom;}).map(u=>u.id);
}
export function pruneSelection(state,ids){
 const next=new Set([...ids].filter(id=>state.units.some(u=>u.id===id&&selectable(u))));
 if(!next.size){const primary=state.units.find(u=>u.id===state.selected&&selectable(u))||state.units.find(selectable);if(primary)next.add(primary.id);}
 return next;
}
export function toggleSelection(ids,id){const next=new Set(ids);if(next.has(id)&&next.size>1)next.delete(id);else next.add(id);return next;}

export function stanceSelection(state,ids,stance){
 const members=state.units.filter(u=>ids.has(u.id)&&selectable(u));
 const ready=members.filter(u=>Object.hasOwn(STANCES,stance)&&stanceOf(u)!==stance&&canControl(state,u)&&!state.queue.length&&(!combatCosts(state)||u.ap>=2));
 return {members,ready,all:members.length>0&&members.every(u=>stanceOf(u)===stance)};
}
export function setSelectionStance(state,ids,stance){
 const members=stanceSelection(state,ids,stance).members,changed=[],skipped=[];
 for(const u of members){if(stanceOf(u)===stance)continue;if(setStance(state,u,stance))changed.push(u.name);else skipped.push(u.name);}
 return {changed,skipped};
}

export function movementSelection(state,ids,mode){
 const members=state.units.filter(u=>ids.has(u.id)&&selectable(u));
 return {members,ready:members.filter(u=>Object.hasOwn(MOVEMENT_MODES,mode)&&movementModeOf(u)!==mode&&canControl(state,u)&&!state.queue.length),all:members.length>0&&members.every(u=>movementModeOf(u)===mode)};
}
export function setSelectionMovement(state,ids,mode){
 const changed=[],skipped=[];
 for(const u of movementSelection(state,ids,mode).members){if(movementModeOf(u)===mode)continue;if(setMovementMode(state,u,mode))changed.push(u.name);else skipped.push(u.name);}
 return {changed,skipped};
}
