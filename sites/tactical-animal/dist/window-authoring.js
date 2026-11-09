import {windowSystem,windowDefinition} from './window-catalogue.js';
import {windowEdges} from './window-system.js';
import {WINDOW_METRICS} from './art/windows/catalog.js';
export function authoredWindowDimensions(width,height,unit='metres'){
  if(!['metres','storeys'].includes(unit))throw Error('Choose metres or storeys for height.');
  const converted=Number(height)*(unit==='storeys'?WINDOW_METRICS.storeyHeight:1),dimensions={width:Number(width)*WINDOW_METRICS.tile,height:unit==='storeys'?Number(converted.toPrecision(12)):converted};
  if(!Number.isInteger(dimensions.width)||dimensions.width<1||dimensions.width>240||!Number.isFinite(dimensions.height)||dimensions.height<=0||!Number.isFinite(Math.fround(dimensions.height*4))||Math.fround(dimensions.height)===0)throw Error('Use 1–240 whole metre tiles and a positive, representable height.');
  return dimensions;
}
export function placedWindows(map){
  const extension=map.farmyardWindows;if(extension===undefined)return [];
  if(extension?.version!==1||!Array.isArray(extension.instances))throw Error('Unsupported Farmyard window extension.');
  windowSystem.compile({map:map.terrain,windows:extension.instances});return extension.instances;
}
export function placeWindow(map,selection,definitionId,{id,finish='steel',wall='brick',dimensions}={}){
  if(!selection||selection.type!=='edge'||selection.z)throw Error('Select a wall boundary on the ground floor.');
  const match=/^([es]):(\d+):(\d+)(?::0)?$/.exec(selection.edge);if(!match)throw Error('Select a ground-floor wall boundary.');
  const [,axis,xs,ys]=match,x=+xs,y=+ys,width=windowDefinition(definitionId,{},dimensions).width;
  const p={id:id||'window-'+crypto.randomUUID(),definitionId,x:x+(axis==='s'?(width-1)/2:.5),y:y+(axis==='e'?(width-1)/2:.5),rotation:axis==='s'?0:90,finish,wall,...(dimensions!==undefined?{dimensions:structuredClone(dimensions)}:{})};
  const next=structuredClone(map),instances=structuredClone(placedWindows(map)),edges=windowEdges(p,width);p.underlay={};
  for(const edge of edges){const value=next.edges[edge]??next.edges[edge+':0'];if(value?.startsWith('door'))throw Error('A window cannot replace a door.');if(value){p.underlay[edge]=value;delete next.edges[edge];delete next.edges[edge+':0'];}}
  instances.push(p);next.farmyardWindows={version:1,instances};placedWindows(next);return next;
}
export function removeWindow(map,id){
  const instances=placedWindows(map),p=instances.find(p=>p.id===id);if(!p)throw Error('Select a placed window.');
  const next=structuredClone(map);for(const [edge,value]of Object.entries(p.underlay||{}))if(!next.edges[edge])next.edges[edge]=value;
  next.farmyardWindows={version:1,instances:structuredClone(instances.filter(p=>p.id!==id))};return next;
}
export function selectedWindow(map,selection){
  if(!selection||selection.z)return null;const records=windowSystem.compile({map:map.terrain,windows:placedWindows(map)});
  const edge=selection.edge?.split(':').length===4?selection.edge.slice(0,-2):selection.edge;
  return records.find(r=>r.edges.includes(edge)||r.edges.some(edge=>{const [axis,x,y]=edge.split(':');return Math.abs(selection.x-(+x+(axis==='e'?.5:0)))<=.55&&Math.abs(selection.y-(+y+(axis==='s'?.5:0)))<=.55;}))?.placement||null;
}
