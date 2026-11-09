import {roofNeighbors} from './core/maps.js';
import {traversalPreview} from './ladder-actions.js';
export function nearbyCliffClimbs(state,unit){
 if(!unit)return [];
 return roofNeighbors(state,unit).filter(p=>p.kind==='cliff').map(to=>{
  return {...traversalPreview(state,unit,to),label:to.z>(unit.z||0)?'Climb cliff':'Descend cliff'};
 });
}
