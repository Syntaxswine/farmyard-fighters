import {BREAKABLE_WALLS} from './designer/a20b343a0234/tactics/breach-data.js';
import {damageStructure,validStructureHealth} from './designer/a20b343a0234/tactics/structure-health.js';
import {windowSystem} from './window-catalogue.js';

const materialLayouts=new WeakMap();
export function bindWallMaterials(state,materials){
  if(materials)materialLayouts.set(state.map,materials);
}
export function wallMaterial(state,edge){
  const kind=state.edges[edge];
  return kind==='wall'?materialLayouts.get(state.map)?.[edge]??kind:kind;
}

// Use the same trimmed span for collision and art at windows and breaches.
export function wallGaps(state){
  return new Set([...windowSystem.compile(state).flatMap(record=>record.edges),...Object.keys(state.wallBreaches??{})]);
}

export function damageWall(state,edge,amount){
  const kind=wallMaterial(state,edge);
  if(!state.realtime||!BREAKABLE_WALLS.has(kind))return null;
  // AFT uses material names as edge kinds. The host keeps its wall/door enum.
  const structure={edges:{[edge]:kind},structureHealth:state.structureHealth};
  const receipt=damageStructure(structure,{edge},amount);
  if(!receipt)return null;
  state.structureHealth=structure.structureHealth;
  if(receipt.destroyed){
    delete state.edges[edge];
    state.wallBreaches={...state.wallBreaches,[edge]:receipt.kind};
  }
  return receipt;
}

export function restoreWallDamage(state,layout){
  if(state.structureHealth!==undefined){
    const edges=Object.fromEntries(Object.keys(state.edges).map(edge=>[edge,wallMaterial(state,edge)]));
    if(!validStructureHealth({...state,edges})||Object.keys(state.structureHealth).some(id=>!id.startsWith('edge:')||state.edges[id.slice(5)]!=='wall'))throw Error('Unsupported wall health save.');
  }
  const breaches=state.wallBreaches;
  if(breaches!==undefined&&(!breaches||typeof breaches!=='object'||Array.isArray(breaches)||Object.entries(breaches).some(([edge,kind])=>layout.edges[edge]!=='wall'||kind!==(layout.wallMaterials?.[edge]??'wall')||Object.hasOwn(state.edges,edge))))throw Error('Unsupported wall breach save.');
}
