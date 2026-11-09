// Recorded before the simulation commits movement. Presentation never spends AP.
export function recordRoofTraversal(state,unit,to){
 if(to.kind!=='roof')return;
 const point=p=>({x:p.x,y:p.y,z:p.z||0}),id=(state.roofTraversalSequence||0)+1;
 state.roofTraversalSequence=id;state.roofTraversals=[...(state.roofTraversals||[]).slice(-63),{id,unitId:unit.id,kind:'roof',direction:(to.z||0)>(unit.z||0)?'up':'down',from:point(unit),to:point(to)}];
}
