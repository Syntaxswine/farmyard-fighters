import {injuryMovement} from './combat-state.js';
// Presentation consumes these committed events; it never moves units or spends AP.
export const CLIFF_AP=8;
export function recordCliffTraversal(state,unit,to){
 if(to.kind!=='cliff')return;
 const point=p=>({x:p.x,y:p.y,z:p.z||0});
 const event={id:(state.cliffTraversalSequence||0)+1,unitId:unit.id,
  kind:'cliff',direction:(to.z||0)>(unit.z||0)?'up':'down',
  from:point(unit),to:point(to),cost:CLIFF_AP*injuryMovement(unit)};
 state.cliffTraversalSequence=event.id;
 state.cliffTraversals=[...(state.cliffTraversals||[]).slice(-63),event];
}
