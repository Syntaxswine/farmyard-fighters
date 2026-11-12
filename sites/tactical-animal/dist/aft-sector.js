import {CHECKPOINT_DATA,CHECKPOINT_PROVENANCE} from './aft-checkpoint-data.js';
import {WORLD_SECTOR_SIZE} from './world-grid.js';
import {windowSystem} from './window-catalogue.js';

export {CHECKPOINT_PROVENANCE};
const terrainKinds=new Set(['yard','floor','ground-asphalt','ground-grass','ground-gravel','ground-concrete','crate']);
const edgeKinds=new Set(['wall','wall-brick','wall-concrete','wall-corrugated','window-brick','window-concrete','door-wood-closed','door-steel-closed','doorway-concrete-open']);
const propHeights={sandbags:.92,'barrel-explosive':.8,'barrel-single':1.05,'crate-wood':.92};

export function unpackSector(data){
  const {terrainRLE,...source}=structuredClone(data),size=source.width*source.height,cells=[];
  if(!Array.isArray(terrainRLE)||!Number.isInteger(size)||size!==WORLD_SECTOR_SIZE**2)throw Error('Invalid packed sector.');
  for(const run of terrainRLE){
    if(!Array.isArray(run)||run.length!==2||typeof run[0]!=='string'||!Number.isInteger(run[1])||run[1]<1||cells.length+run[1]>size)throw Error('Invalid packed terrain run.');
    for(let i=0;i<run[1];i++)cells.push(run[0]);
  }
  if(cells.length!==size)throw Error('Incomplete packed terrain.');
  source.terrain=Array.from({length:source.height},(_,y)=>cells.slice(y*source.width,(y+1)*source.width));
  return source;
}

// The first adapter accepts ground-level sectors only. Reject unsupported
// features instead of silently turning water, stairs or upper floors into yard.
export function adaptAftSector(source,{provenance=null}={}){
  if(source?.version!==2||source.width!==WORLD_SECTOR_SIZE||source.height!==WORLD_SECTOR_SIZE||!Array.isArray(source.terrain)||source.terrain.length!==WORLD_SECTOR_SIZE||source.terrain.some(row=>!Array.isArray(row)||row.length!==WORLD_SECTOR_SIZE||row.some(t=>!terrainKinds.has(t))))throw Error('Unsupported AFT sector terrain or dimensions.');
  if((source.upper??[]).some(layer=>!layer||typeof layer!=='object'||Object.keys(layer).length)||(source.stairs??[]).length||(source.climbs??[]).length||(source.canopies??[]).length)throw Error('This sector requires unsupported vertical traversal.');
  const edges={},wallMaterials={},doors=[];
  for(const [edge,kind]of Object.entries(source.edges??{})){
    const match=/^([es]):(\d+):(\d+)$/.exec(edge);
    if(!match||+match[2]>=WORLD_SECTOR_SIZE||+match[3]>=WORLD_SECTOR_SIZE||!edgeKinds.has(kind))throw Error('Unsupported AFT edge: '+edge+' / '+kind);
    if(kind==='doorway-concrete-open')continue;
    if(kind.startsWith('door-')){
      const axis=match[1],x=+match[2]+(axis==='e'?.5:0),y=+match[3]+(axis==='s'?.5:0);
      edges[edge]='wall';doors.push({id:'aft-door-'+edge.replaceAll(':','-'),kind:'door',name:kind==='door-steel-closed'?'Steel door':'Wooden door',x,y,edge,swing:1,range:1.65,open:false,inventory:[],interactive:true});
    }else{
      edges[edge]='wall';
      if(kind.startsWith('wall-'))wallMaterials[edge]=kind;
    }
  }
  const props=structuredClone(source.props??[]),obstacles=[];
  for(const prop of props){
    const height=propHeights[prop.kind];
    if(!height||!Number.isInteger(prop.x)||!Number.isInteger(prop.y)||prop.x<0||prop.y<0||prop.x>=WORLD_SECTOR_SIZE||prop.y>=WORLD_SECTOR_SIZE||(prop.z??0)!==0)throw Error('Unsupported AFT prop: '+prop.kind);
    obstacles.push({x0:prop.x-.48,x1:prop.x+.48,y0:prop.y-.48,y1:prop.y+.48,height,kind:'crate',sourceKind:prop.kind});
  }
  for(const position of [...source.starts??[],...source.guards??[],...source.exits??[]])if((position.z??0)!==0)throw Error('This sector requires an upper-floor actor.');
  let windows;
  if(source.farmyardWindows!==undefined){
    if(source.farmyardWindows?.version!==1||!Array.isArray(source.farmyardWindows.instances))throw Error('Unsupported Farmyard window extension.');
    windows=structuredClone(source.farmyardWindows.instances);
    for(const record of windowSystem.compile({map:source.terrain,windows}))for(const edge of record.edges){if(doors.some(d=>d.edge===edge))throw Error('A window cannot replace a door.');delete edges[edge];delete wallMaterials[edge];}
  }
  return {name:source.name,terrain:source.terrain.map(row=>row.slice()),edges,wallMaterials,props,obstacles,doors,...(windows?{windows}:{}),worldBounds:{x:0,y:0,w:WORLD_SECTOR_SIZE,h:WORLD_SECTOR_SIZE},groundPalette:'aft-sector',...(provenance?{source:structuredClone(provenance)}:{})};
}

export const checkpointSource=()=>unpackSector(CHECKPOINT_DATA);
export const checkpointMap=()=>adaptAftSector(checkpointSource(),{provenance:CHECKPOINT_PROVENANCE});
