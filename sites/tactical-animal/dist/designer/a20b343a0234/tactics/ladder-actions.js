import {roofNeighbors,neighbors} from './core/maps.js';
import {canControl,combatCosts,movementNeighbors,occupant} from './core/engine.js';
import {canMoveStamina} from './stamina.js';
import {climbTower,towerClimbPreview} from './tower-actions.js';
import {climbingPreview,climbRiskText} from './climbing.js';
import {boundaryClimbs} from './climbing-routes.js';
export function traversalPreview(state,unit,to){
 const step=movementNeighbors(state,unit).find(q=>q.x===to.x&&q.y===to.y&&q.z===to.z&&q.kind===to.kind);
 const climb=climbingPreview(unit,to,combatCosts(state)),cost=step?.cost??climb?.cost??to.cost;
 const reason=!canControl(state,unit)||state.queue.length?'Cannot climb now.':unit.stance!=='standing'?'Stand up to climb.':climb&&!climb.ok?climb.reason:!step?'Landing is blocked.':occupant(state,to.x,to.y,to.z)?'Landing is occupied.':!canMoveStamina(unit,step)?'Not enough stamina.':combatCosts(state)&&unit.ap<cost?'Not enough AP.':'';
 const name=to.kind==='ladder'?(to.rusty?'rusty ladder':'ladder'):to.kind;
 const label=to.kind==='window'?'Climb through window':to.kind==='wall'?'Climb over wall':((to.z||0)>(unit.z||0)?'Climb ':'Descend ')+name;
 return {ok:!reason,reason,kind:to.kind,destination:to,to,cost,climb,risk:climbRiskText(climb),label};
}
export function climbPreview(state,unit,preferredLevel){
 const tower=towerClimbPreview(state,unit);
 if(tower.tower)return {...tower,kind:'tower',label:tower.descending?'Descend tower':'Climb tower'};
 if(!unit)return {...tower,label:'Climb ladder',kind:'ladder'};
 const z=unit.z||0,connections=(state.stairs||[]).filter(p=>p.x===unit.x&&p.y===unit.y&&(p.z===z||p.z+1===z));
 const candidates=(connections.length?connections.map(p=>({x:p.x,y:p.y,z:p.z===z?z+1:z-1,kind:p.kind||'stairs',rusty:!!p.rusty,cost:p.kind==='ladder'?3:2})):roofNeighbors(state,unit).filter(p=>p.kind==='roof')).sort((a,b)=>(b.z===preferredLevel)-(a.z===preferredLevel)||b.z-a.z);
 if(!candidates.length)return {...tower,kind:'ladder',label:'Climb ladder',reason:'Stand beside a roof edge, on a ladder tile or at a tower entrance.'};
 return traversalPreview(state,unit,candidates[0]);
}
export const nearbyBoundaryClimbs=(state,unit)=>unit?boundaryClimbs(state,unit).map(to=>traversalPreview(state,unit,to)):[];
export function performTraversal(state,unit,to){const live=neighbors(state,unit).find(p=>p.x===to.x&&p.y===to.y&&p.z===to.z&&p.kind===to.kind);if(!live)return false;const p=traversalPreview(state,unit,live);if(!p.ok)return false;unit.overwatch=null;state.queue=[{id:unit.id,...live,cost:p.cost}];return true;}
export function performClimb(state,unit,preferredLevel){const p=climbPreview(state,unit,preferredLevel);if(!p.ok)return false;if(p.kind==='tower')return climbTower(state,unit);return performTraversal(state,unit,p.destination);}
