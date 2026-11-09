import {mapGeometryRevision} from './map-geometry-cache.js';
// Pure geometric queries can repeat hundreds of times during one action. Never
// retain their answers across actions or cache detection, RNG or consequences.
const scopes=new WeakMap();
export function withCombatQueries(state,action){
 if(scopes.has(state))return action();
 scopes.set(state,{answers:new Map(),stamp:[]});
 try{return action();}finally{scopes.delete(state);}
}
// Reference path for deterministic regression and diagnostic comparisons.
export function withoutCombatQueries(state,action){
 const previous=scopes.get(state);scopes.set(state,{disabled:true});
 try{return action();}finally{if(previous)scopes.set(state,previous);else scopes.delete(state);}
}
export function combatQuery(state,kind,key,compute){
 const scope=scopes.get(state),revision=mapGeometryRevision(state);
 if(!scope||scope.disabled||revision===undefined)return compute();
 // Explicit geometry mutations increment the revision; replacement arrays and
 // temporary scenery must not share a result either. Untracked editor maps use
 // the uncached path. Unit-dependent values belong in each query's numeric key.
 const stamp=[revision,state.terrain||state.map,state.upper,state.edges,state.props,state.stairs,state.climbs,state.canopies,state.foliage,state.environment,state.breaches];
 if(stamp.some((v,i)=>scope.stamp[i]!==v)){scope.answers.clear();scope.stamp=stamp;}
 let answers=scope.answers.get(kind);if(!answers){answers=new Map();scope.answers.set(kind,answers);}
 if(!answers.has(key))answers.set(key,compute());
 return answers.get(key);
}
