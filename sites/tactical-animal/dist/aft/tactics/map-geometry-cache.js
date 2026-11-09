// Only live encounters opt into revision tracking. Authored/editor maps remain
// mutable, so they use the content check until their edits are committed to a
// new encounter. Keep this bookkeeping out of maps, saves and reusable blocks.
const revisions=new WeakMap();
const ground=m=>m.terrain||m.map;
export function trackMapGeometry(m){const key=ground(m);if(!revisions.has(key))revisions.set(key,0);return m;}
// Call after changing terrain, edges, props, stairs, climbs, canopies, foliage,
// environment or breach data, before the next geometry query/draw. Unit movement,
// HP, AP, clock, RNG and log revisions do not change the map.
export function invalidateMapGeometry(m){const key=ground(m);if(revisions.has(key))revisions.set(key,revisions.get(key)+1);}
export function mapGeometryRevision(m){return revisions.get(ground(m));}

function inputs(m){
 const d=m.definition||m;
 return [ground(m),m.upper,m.edges,m.stairs,m.climbs,m.canopies,m.foliage,m.environment,
  m.breaches,d.edges,d.upper,d.breaches,m.definition?.props,m.definition?.stairs,
  d.starts,d.guards,d.exits,m.width,m.height];
}
export class MapGeometryCache{
 constructor(build){this.build=build;this.clear();}
 clear(){this.entry=null;}
 get(m){
  const refs=inputs(m),key=refs[0],revision=revisions.get(key),old=this.entry;
  // The battle renderer adds/removes scenery while explosions are in flight.
  // It supplies a fresh props array each frame, even when its contents agree.
  // Compare that small list by value; never treat a live revision alone as proof
  // that a presentation view has the same geometry as its authoritative state.
  const props=JSON.stringify([m.props,m.coverOccupiedProps]);
  if(old&&revision!==undefined&&old.revision===revision&&old.props===props&&refs.every((v,i)=>v===old.refs[i]))return old.world;
  const signature=JSON.stringify([refs,props]);
  const world=old&&old.refs[0]===key&&old.signature===signature?old.world:this.build(m);
  this.entry={refs,revision,props,signature,world};return world;
 }
}
