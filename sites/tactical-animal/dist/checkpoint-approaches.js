import {checkpointSource,adaptAftSector,CHECKPOINT_PROVENANCE} from './aft-sector.js';

// Keep the editor export immutable. This operation stages its original office,
// sandbags and road 96 metres farther into the sector, then builds the approach
// lanes around them. A render block never defines a combat or mission boundary.
export const CHECKPOINT_OFFSET=96;
export function checkpointApproachMap(){
  const source=checkpointSource(),dx=CHECKPOINT_OFFSET;
  source.name='Road Checkpoint / Valley approaches';
  source.terrain=source.terrain.map(row=>Array.from({length:240},(_,x)=>x>=dx?row[x-dx]:'yard'));
  source.edges=Object.fromEntries(Object.entries(source.edges).map(([edge,kind])=>{
    const [axis,x,y]=edge.split(':');return [`${axis}:${+x+dx}:${y}`,kind];
  }));
  for(const key of ['props','starts','guards','exits'])for(const point of source[key])point.x+=dx;
  const paint=(kind,x,y,w,h)=>{for(let cy=y;cy<y+h;cy++)for(let cx=x;cx<x+w;cx++)source.terrain[cy][cx]=kind;};
  paint('ground-gravel',49,101,5,40);
  paint('ground-asphalt',40,117,163,6);
  paint('ground-gravel',49,99,104,5);
  paint('ground-gravel',49,137,105,5);
  paint('ground-gravel',98,142,52,13);
  paint('ground-grass',42,106,16,10);
  // The wall ends allow flanking; crossing a render seam grants no cover.
  for(let x=65;x<=111;x++)source.edges[`s:${x}:104`]='wall-brick';
  for(let x=65;x<=111;x++)source.edges[`s:${x}:135`]='wall-brick';
  // A walled confiscation bay interrupts long southern firing lines.
  for(let y=144;y<=151;y++)source.edges[`e:119:${y}`]='wall-brick';
  for(let x=120;x<=133;x++)source.edges[`s:${x}:151`]='wall-brick';
  return adaptAftSector(source,{provenance:CHECKPOINT_PROVENANCE});
}
