// Failed animation preparation must leave an existing hen/locomotion owner intact.
export function guardHenConstruction(worker,build){
 const nodes=new Set();worker.root.traverse(o=>nodes.add(o));
 const transforms=[...nodes].map(o=>({o,parent:o.parent,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}));
 const parts=worker.parts.map(p=>({p,skeleton:p.skeleton,bind:p.bindMatrix.clone(),attributes:Object.fromEntries(Object.entries(p.geometry.attributes).map(([k,a])=>[k,a.clone()]))}));
 try{return build();}catch(error){
  const temporarySkeletons=new Set(worker.parts.map(p=>p.skeleton).filter(s=>!parts.some(p=>p.skeleton===s)));
  const added=[];worker.root.traverse(o=>{if(!nodes.has(o))added.push(o);});
  for(const row of transforms){if(row.o.parent!==row.parent){row.o.removeFromParent();row.parent?.add(row.o);}row.o.position.copy(row.p);row.o.quaternion.copy(row.q);row.o.scale.copy(row.s);}
  for(const o of added)o.removeFromParent();
  for(const {p,skeleton,bind,attributes}of parts){for(const k of Object.keys(p.geometry.attributes))if(!attributes[k])p.geometry.deleteAttribute(k);for(const[k,a]of Object.entries(attributes))p.geometry.setAttribute(k,a);p.bind(skeleton,bind);}
  temporarySkeletons.forEach(s=>s.dispose());worker.root.updateMatrixWorld(true);new Set(parts.map(p=>p.skeleton)).forEach(s=>s.update());throw error;
 }
}
