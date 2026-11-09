import {MAP_LEVELS} from './map-layers.js';
import {landBrushCells} from './land-paint.js';
import {terrainAt,setTerrain,edgeCells,MAX_MAP_BYTES} from './core/maps.js';
import {GROUNDS,propCells} from './core/environment.js';
import {CLIFF_LIMIT} from './cliff-map.js';

const neighbors=[[1,0],[-1,0],[0,1],[0,-1]],key=p=>`${p.x},${p.y}`;
// Mutate the controller's disposable candidate, never the live document.
export function paintLand(map,command,size=240){
 const {start,end=start,options={},path}=command,height=options.landHeight??1,surface=options.groundKind||'ground-grass';
 if((!Number.isInteger(height)||height<0||height>=MAP_LEVELS))throw Error('Land height must be on layers 1–6.');
 if(!GROUNDS.includes(surface))throw Error('Choose a ground surface for the land.');
 const cells=landBrushCells(start,end,options,size,path),old=map.landPaint||{},land={...old},affected=new Set(),styles=new Map(),changed=new Set(cells.map(key));
 for(const p of cells){
  const k=key(p),previous=old[k],before=previous?.[0]||0;
  if(height>0&&!previous){
   if(!['yard','floor','woodland',...GROUNDS].includes(terrainAt(map,p.x,p.y,0)))throw Error('Paint land on dry ground; clear water or obstacles first.');
   if(Array.from({length:MAP_LEVELS-1},(_,i)=>i+1).some(z=>terrainAt(map,p.x,p.y,z)!=='void'))throw Error('An existing upper floor is here. The Land brush only reshapes land it created.');
  }
  if(height!==before){
   for(const u of [...map.starts,...map.guards,...map.exits])if(u.x===p.x&&u.y===p.y&&(u.z||0)<height)throw Error('Move the character or travel marker before raising land beneath it.');
  }
  for(let z=before+1;z<=height;z++)if(terrainAt(map,p.x,p.y,z)!=='void')throw Error('An existing upper floor is here. Move it before raising the land.');
  if(height)land[k]=[height,previous?.[1]||terrainAt(map,p.x,p.y,0)];else delete land[k];
  affected.add(k);for(const [dx,dy]of neighbors){const x=p.x+dx,y=p.y+dy;if(x>=0&&y>=0&&x<size&&y<size)affected.add(`${x},${y}`);}
 }
 const rim=(x,y,z)=>neighbors.some(([dx,dy])=>(land[`${x+dx},${y+dy}`]?.[0]||0)<=z);
 // Save top textures before clearing the old shape. Neighbors keep their hand-painted surface.
 for(const k of affected)if(old[k]){const [x,y]=k.split(',').map(Number);styles.set(k,terrainAt(map,x,y,old[k][0]));}
 const manual=map.props.filter(p=>!p.landAuto),occupied=new Map();
 for(const p of manual)for(const c of propCells(p))occupied.set(`${c.x},${c.y},${c.z||0}`,p);
 for(const k of affected){
  const [x,y]=k.split(',').map(Number),h=land[k]?.[0]||0;
  if(!old[k]&&!changed.has(k))continue;
  for(let z=0;z<h;z++){
   const p=occupied.get(`${x},${y},${z}`);
   if(p&&!(p.kind==='cliff-ledge'&&(p.cliffMask??15)===15&&rim(x,y,z)))throw Error('This terrain change would bury an object or a placed access route. Move it first.');
  }
 }
 for(const edge of Object.keys(map.edges))if(edgeCells(edge).some(p=>changed.has(key(p))&&(p.z||0)<(land[key(p)]?.[0]||0)))throw Error('This terrain change would bury a wall or door. Move it first.');
 map.props=map.props.filter(p=>!p.landAuto||!affected.has(key(p)));
 for(const k of affected){
  const [x,y]=k.split(',').map(Number),record=land[k],previous=old[k];
  if(!record&&!previous){if(changed.has(k))setTerrain(map,x,y,0,surface);continue;}
  if(previous){setTerrain(map,x,y,0,previous[1]);for(let z=1;z<=previous[0];z++)setTerrain(map,x,y,z,'void');}
  if(!record){setTerrain(map,x,y,0,surface);continue;}
  const [h,base]=record,top=changed.has(k)?surface:styles.get(k)||surface;
  if(top==='void')throw Error('The painted plateau floor is missing. Undo its removal before reshaping this land.');
  for(let z=0;z<h;z++){
   const boundary=rim(x,y,z);setTerrain(map,x,y,z,boundary?(z===0?base:top):'void');
   if(boundary&&!occupied.has(`${x},${y},${z}`))map.props.push({kind:'cliff-ledge',x,y,z,cliffMask:15,cliffVariant:0,cliffSand:top==='ground-sand'?1:0,landAuto:true});
  }
  setTerrain(map,x,y,h,top);
 }
 for(const edge of Object.keys(map.edges))if(edgeCells(edge).some(p=>changed.has(key(p))&&(p.z||0)===(old[key(p)]?.[0]||0)&&terrainAt(map,p.x,p.y,p.z||0)==='void'))throw Error('This terrain change would remove the floor beneath a wall or door. Move it first.');
 if(Object.keys(land).length)map.landPaint=land;else delete map.landPaint;
 if(map.props.filter(p=>p.kind.startsWith('cliff-')).length>CLIFF_LIMIT)throw Error(`This shape needs more than ${CLIFF_LIMIT} cliff tiles. Use a simpler outline or fewer separate plateaus.`);
 if(JSON.stringify(map,null,2).length>MAX_MAP_BYTES)throw Error('This stroke would exceed the 4 MB map save limit. Use a smaller painted area.');
 return {cells,edges:[]};
}
