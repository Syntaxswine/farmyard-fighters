import {isHedge,HEDGE_VERSION,HEDGE_SEED} from '../hedge-data.js';
import {isScenery,sceneryOrientation} from '../scenery-catalog.js';
import {sceneryPlacementErrors} from '../scenery-placement.js';
import {isStrategicSite} from '../strategic-site-rules.js';
import {ensureCharacterIdentities,characterDefaults} from '../character-properties.js';
import {isCliff} from '../cliff-map.js';
import {GROUNDS,PROPS,EDGES,propAt,propCells,floorTerrain} from './environment.js';
import {LEVELS,W,H,stampRoom,tileKey,levelOf,terrainAt,setTerrain,addStairs,MAX_GUARDS,roofTop,roofValid,roofEndpoint,edgeCells,passable,blockedEdge,inBounds} from './maps.js';
export function createEditor(map){return {map:ensureCharacterIdentities(structuredClone(map)),undo:[],redo:[],before:null};}
export function beginStroke(editor){if(!editor.before)editor.before=structuredClone(editor.map);}
export function endStroke(editor){if(!editor.before)return false;const before=editor.before;editor.before=null;if(JSON.stringify(before)===JSON.stringify(editor.map))return false;editor.undo.push(before);if(editor.undo.length>50)editor.undo.shift();editor.redo=[];return true;}
export function replaceMap(editor,map){beginStroke(editor);editor.map=ensureCharacterIdentities(structuredClone(map));endStroke(editor);}
export function undo(editor){endStroke(editor);if(!editor.undo.length)return false;editor.redo.push(editor.map);editor.map=editor.undo.pop();return true;}
export function redo(editor){endStroke(editor);if(!editor.redo.length)return false;editor.undo.push(editor.map);editor.map=editor.redo.pop();return true;}
export function applyBrush(editor,tool,x,y,edge,options={}) {
 const m=editor.map,z=options.level??0;if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=W||y>=H)return 'Choose a tile inside the map.';
 const guard=m.guards.find(g=>g.x===x&&g.y===y&&levelOf(g)===z),start=m.starts.findIndex(p=>p.x===x&&p.y===y&&levelOf(p)===z),exit=m.exits.some(p=>p.x===x&&p.y===y&&levelOf(p)===z);
 if(['wall','door','erase-edge'].includes(tool)){
  if(!/^(e|s):-?\d+:-?\d+(?::[1-5])?$/.test(edge))return 'Choose a tile edge.';
  if(tool==='erase-edge')delete m.edges[edge];else m.edges[edge]=tool==='wall'?(Object.hasOwn(EDGES,options.edgeKind)?options.edgeKind:'wall'):tool;return '';
 }
 if(tool==='roof'||tool==='cliff-climb'){if(z>=LEVELS-1)return 'A climb needs an upper landing layer.';if(!/^(e|s):-?\d+:-?\d+(?::[1-5])?$/.test(edge))return 'Choose a tile edge.';const cells=edgeCells(edge),other=cells.find(p=>p.x!==x||p.y!==y);if(!other||!cells.some(p=>p.x===x&&p.y===y&&p.z===z))return 'Choose the edge beside the lower foothold.';const p={x,y,z,dx:other.x-x,dy:other.y-y,...(tool==='cliff-climb'?{kind:'cliff'}:{})};if(!roofValid(m,p))return 'Paint an adjacent upper roof first. Keep the foothold overhead empty and the upper edge open.';if((m.climbs||[]).length>=4096)return 'Maximum roof climbs reached.';m.climbs=[...(m.climbs||[]).filter(q=>!(q.x===x&&q.y===y&&q.z===z&&q.dx===p.dx&&q.dy===p.dy)),p];return '';}
 if(tool==='erase-roof'){m.climbs=(m.climbs||[]).filter(p=>![p,roofTop(p)].some(q=>q.x===x&&q.y===y&&q.z===z));return '';}
 if(tool==='stairs'||tool==='ladder'||tool==='ladder-rusty'){if(roofEndpoint(m,{x,y,z})||roofEndpoint(m,{x,y,z:z+1}))return 'Remove the roof climb before adding stairs here.';if(z>=LEVELS-1)return 'Stairs need an upper landing layer.';if([z,z+1].some(l=>terrainAt(m,x,y,l)==='crate'||propAt(m,x,y,l)))return 'Remove crates from both stair endpoints first.';addStairs(m,x,y,z,tool.startsWith('ladder')?'ladder':'stairs');if(tool==='ladder-rusty')m.stairs.find(p=>p.x===x&&p.y===y&&p.z===z).rusty=true;return '';}
 if(tool==='erase-stairs'){m.stairs=m.stairs.filter(p=>!(p.x===x&&p.y===y&&(p.z===z||p.z+1===z)));return '';}
 if(tool==='erase-prop'){const p=propAt(m,x,y,z);m.props=(m.props||[]).filter(q=>q!==p);if(terrainAt(m,x,y,z)==='crate')setTerrain(m,x,y,z,z?'floor':'yard');return '';}
 if(tool==='erase-tile'){if(roofEndpoint(m,{x,y,z})||guard||start>=0||exit||m.stairs.some(p=>p.x===x&&p.y===y&&(p.z===z||p.z+1===z)))return 'Move starts, travel markers, stairs or roof climbs before deleting their floor.';const p=propAt(m,x,y,z);m.props=(m.props||[]).filter(q=>q!==p);setTerrain(m,x,y,z,z?'void':'yard');return '';}
 if(tool==='roof-tile'){if(z===0)return 'Select an upper layer for a roof.';if(!options.propKind?.startsWith('roof-')||!PROPS[options.propKind])return 'Choose a roof module.';const cells=propCells({x,y,z,kind:options.propKind,rotated:!!options.rotated});if(cells.some(q=>!inBounds(q.x,q.y,q.z)))return 'The whole roof must fit inside the map.';const prior=cells.map(q=>terrainAt(m,q.x,q.y,z));cells.forEach((q,i)=>{if(prior[i]==='void')setTerrain(m,q.x,q.y,z,'floor');});const result=applyBrush(editor,'prop',x,y,edge,options);if(result)cells.forEach((q,i)=>setTerrain(m,q.x,q.y,z,prior[i]));return result;}
 if(tool==='prop'){const kind=options.propKind;if(!Object.hasOwn(PROPS,kind))return 'Choose an environment prop.';const p={x,y,z,kind,rotated:!!options.rotated,...isScenery({kind})?sceneryOrientation(options):{}},cells=propCells(p);if(isHedge(p))Object.assign(p,{hedgeVersion:HEDGE_VERSION,hedgeSeed:options.hedgeSeed??HEDGE_SEED});if(isStrategicSite(p))p.sabotage=!!options.sabotage;if((m.props||[]).length>=4096)return 'The map supports at most 4096 props.';for(const q of cells){if(!inBounds(q.x,q.y,q.z)||!(floorTerrain(terrainAt(m,q.x,q.y,q.z))||isCliff(p)&&terrainAt(m,q.x,q.y,q.z)==='water')||propAt(m,q.x,q.y,q.z))return 'The entire prop footprint needs free, supported floor.';if(roofEndpoint(m,q)||[...m.starts,...m.guards,...m.exits].some(a=>a.x===q.x&&a.y===q.y&&levelOf(a)===z)||m.stairs.some(a=>a.x===q.x&&a.y===q.y&&(a.z===z||a.z+1===z)))return 'Move starts, travel markers and stairs before placing a prop.';}if(cells.some(a=>cells.some(b=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1&&blockedEdge(m,a,b))))return 'Props cannot straddle a wall or fence.';const sceneryError=sceneryPlacementErrors(m,p,PROPS,EDGES)[0];if(sceneryError)return sceneryError;m.props=[...(m.props||[]),p];return '';}
 if(tool==='texture'){if(!GROUNDS.includes(options.groundKind))return 'Choose a ground texture.';setTerrain(m,x,y,z,options.groundKind);return '';}
 if(['yard','floor','crate','void','water','bridge','woodland','woodland-dense'].includes(tool)){if(tool==='water'&&z!==0)return 'Water belongs on the ground level.';if(['crate','void','water','woodland-dense'].includes(tool)&&(roofEndpoint(m,{x,y,z})||guard||start>=0||exit||propAt(m,x,y,z)||m.stairs.some(p=>p.x===x&&p.y===y&&(p.z===z||p.z+1===z))))return 'Move starts, travel markers and stairs before blocking this tile.';setTerrain(m,x,y,z,tool);return '';}
 if(tool==='room'){const width=options.rotated?options.height:options.width,height=options.rotated?options.width:options.height;return stampRoom(m,x,y,width||6,height||5,z)?'':'The whole room must fit inside the map.';}
 if(tool==='remove-guard'){m.guards=m.guards.filter(g=>g!==guard);return '';}
 if(!passable(m,{x,y,z}))return 'Place a floor before placing a start or travel marker.';
 if(tool==='squad'){const id=Number(options.slot);if(!Number.isInteger(id)||id<0||id>3)return 'Choose squad member 1–4.';if(guard||(start>=0&&start!==id))return 'Another unit starts here.';m.starts[id]={...m.starts[id],x,y,z};delete m.starts[id].towerPost;return '';}
 if(tool==='guard'){if(start>=0)return 'A squad member starts here.';if(!guard&&m.guards.length>=MAX_GUARDS)return 'Maximum 46 guards (50 characters total). Remove one before placing another.';const next={x,y,z,species:options.species||'pig-foreman',weapon:options.weapon||'pistol',heading:Number(options.heading??guard?.heading??225)};if(options.outfit==='red-hats'||next.species==='donkey'&&options.outfit==='blue-hawaiian')next.outfit=options.outfit;else if(guard)delete guard.outfit;if(guard)Object.assign(guard,next);else {next.character=characterDefaults('guards',options.category||'combat');m.guards.push(next);}return '';}
 if(tool==='exit'){m.exits=[{x,y,z}];return '';}
 return 'Choose a placement tool.';
}

// A gesture is previewed without changing the map, then committed as one stroke.
export function brushShape(tool){return ['wall','door','erase-edge'].includes(tool)?'line':['yard','floor','texture','water','bridge','woodland','woodland-dense','void','erase-tile'].includes(tool)?'rectangle':null;}
export function brushPoints(tool,start,end,size=W){
 const shape=brushShape(tool),points=[],clamp=n=>Math.max(0,Math.min(size-1,n));
 if(!shape||start.x<0||start.y<0||start.x>=size||start.y>=size)return points;
 if(shape==='rectangle'){const x0=Math.min(start.x,clamp(end.x)),x1=Math.max(start.x,clamp(end.x)),y0=Math.min(start.y,clamp(end.y)),y1=Math.max(start.y,clamp(end.y));for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)points.push({x,y});}
 else {const [axis,xs,ys,zs]=start.edge.split(':'),x=Number(xs),y=Number(ys),from=axis==='e'?y:x,to=clamp(axis==='e'?end.y:end.x);for(let n=Math.min(from,to);n<=Math.max(from,to);n++){const ex=axis==='e'?x:n,ey=axis==='e'?n:y;points.push({x:clamp(ex),y:clamp(ey),edge:axis+':'+ex+':'+ey+(zs?':'+zs:'')});}}
 return points;
}
