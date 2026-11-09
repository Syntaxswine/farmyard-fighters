import {breachesOf} from './breach-data.js';
// Damage history already lives in the encounter: definition keeps the original
// map while edges keeps surviving structures. Ordinary authoring maps have no
// definition and therefore never acquire accidental blast damage when edited.
export function wallFamily(kind){
 if(kind==='wall')return 'brick';
 const match=/^(?:wall|window)-(brick|concrete|corrugated)$/.exec(kind||'');
 return match?(match[1]==='corrugated'?'metal':match[1]):null;
}
const frame=kind=>!!wallFamily(kind)||['door','doorway-concrete-open','door-steel-closed','door-wood-closed'].includes(kind);
export function wallEdge(key){
 const m=/^([es]):(-?\d+):(-?\d+)(?::([0-3]))?$/.exec(key);if(!m)return null;
 const [,axis,sx,sy,sz='0']=m,x=+sx,y=+sy,z=+sz;
 return {key,axis,x,y,z,id:`${axis}:${x}:${y}:${z}`,ends:axis==='e'?[[2*x+1,2*y-1,z],[2*x+1,2*y+1,z]]:[[2*x-1,2*y+1,z],[2*x+1,2*y+1,z]]};
}
export function wallBreachEnds(map){
 const authored=breachesOf(map)?.edges;if(!map.definition?.edges&&!authored)return new Map();
 const original={...map.definition?.edges,...authored};
 const current=new Map(),vertices=new Map(),broken=new Set();
 for(const [key,kind]of Object.entries(map.edges||{})){const edge=wallEdge(key);if(!edge)continue;current.set(edge.id,kind);if(!frame(kind))continue;
  for(const [end,p]of edge.ends.entries()){const id=p.join(',');if(!vertices.has(id))vertices.set(id,[]);vertices.get(id).push({edge,end,kind});}
 }
 for(const [key,kind]of Object.entries(original)){const edge=wallEdge(key);if(edge&&frame(kind)&&!current.has(edge.id))for(const p of edge.ends)broken.add(p.join(','));}
 const result=new Map();
 for(const id of broken){const parts=vertices.get(id);if(parts?.length!==1||!wallFamily(parts[0].kind))continue;const {edge,end}=parts[0];result.set(edge.key,(result.get(edge.key)||0)|(1<<end));}
 return result;
}
export function damagedWallVisuals(boxes,map){
 const ends=wallBreachEnds(map);if(!ends.size)return boxes;
 return boxes.map(b=>{
  const mask=ends.get(b.source?.edge),family=wallFamily(b.material),section=b.id.split(':').at(-1);
  if(!mask||!family||!['wall','sill','lintel'].includes(section))return b;
  const edge=wallEdge(b.source.edge),seed=((edge.x*17+edge.y*31+edge.z*13)%3+3)%3;
  return {...b,shape:`breach-${family}-${mask}-${seed}-${edge.axis}-${section}`,material:'breach-'+family,breachEnds:mask};
 });
}
