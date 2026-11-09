import {MAP_LEVELS} from './map-layers.js';
import {foliageAt} from './foliage-data.js';
import {TREE_COVER,treeCoverOf} from './foliage-tree-cover.js';
import {canopyCells} from './editor-canopies.js';
import {expandPlaceholder} from './sector-placeholder.js';
import {parseMap,terrainAt,edgeKey} from './core/maps.js';
import {isBlock,openBlock} from './core/blocks.js';
import {propAt,propCells} from './core/environment.js';
import {CARGO_FORMS} from './painted-cargo.js';

export const PREVIEW_FOOTPRINTS=[{id:'truck',name:'Canvas truck',tiles:[2,3]},...CARGO_FORMS.map(({id,name,tiles})=>({id,name,tiles:[...tiles]}))];
const at=(p,x,y,z)=>p.x===x&&p.y===y&&(p.z||0)===z;
export class InspectionDocument {
 open(text){
  if(typeof text!=='string'||text.length>4*1024*1024)throw Error('Choose a map or block JSON file under 4 MB.');
  let original=JSON.parse(text);if(original?.kind==='sector-placeholder'){original=expandPlaceholder(original);text=JSON.stringify(original);}const block=isBlock(original);
  // Keep the portable document intact, including extension fields. Legacy map
  // migration is deliberately deferred until the editable milestone.
  if(!block&&original?.version!==2)throw Error('Inspection supports version 2 maps and version 1 blocks. Convert legacy maps with the existing editor first.');
  const map=block?openBlock(original):parseMap(text,{allowDisconnected:true});
  map.props??=[];
  if(block){map.terrain=map.terrain.slice(0,24).map(row=>row.slice(0,24));map.starts=[];map.exits=[];}
  this.original=structuredClone(original);this.map=map;this.size=block?24:240;this.block=block;
  this.units=[...map.starts.map((p,i)=>({...p,id:'start-'+i,species:p.species||['horse','goat','donkey','sheep'][i],weapon:p.weapon||'rifle',heading:p.heading??0,role:'Squad start '+(i+1)})),...map.guards.map((p,i)=>({...p,id:'guard-'+i,role:'Guard '+(i+1)}))];
  return this;
 }
 export(){return JSON.stringify(this.original,null,2);}
 inspect(px,py,z,{mode='auto',roofs=true,walls=true}={}){
  if(!Number.isFinite(px)||!Number.isFinite(py)||(!Number.isInteger(z)||z<0||z>=MAP_LEVELS))return null;
  const x=Math.floor(px+.5),y=Math.floor(py+.5);
  if(x<0||y<0||x>=this.size||y>=this.size)return null;
  const canopy=roofs&&this.map.canopies?.find(p=>canopyCells(p).some(q=>q.x===x&&q.y===y&&q.z===z));if(canopy)return {x,y,z,type:'prop',label:canopy.kind,data:canopy,cells:canopyCells(canopy)};const base={x,y,z},terrain=terrainAt(this.map,x,y,z),unit=this.units.find(p=>at(p,x,y,z));
  const prop=propAt(this.map,x,y,z),availableProp=prop&&(roofs||!prop.kind.startsWith('roof-'));
  const dx=px-x,dy=py-y,axis=Math.abs(dx)>Math.abs(dy)?'e':'s';
  const edge=edgeKey(axis,x-(axis==='e'&&dx<0?1:0),y-(axis==='s'&&dy<0?1:0),z);
  const nearEdge=Math.max(Math.abs(dx),Math.abs(dy))>.35;
  if(walls&&(mode==='edge'||mode==='auto'&&nearEdge)&&this.map.breaches?.edges[edge])return {...base,type:'edge',edge,label:'Broken '+this.map.breaches.edges[edge].replaceAll('-',' ')+' opening',data:{edge,kind:this.map.breaches.edges[edge],broken:true},cells:[base]};
  if(walls&&(mode==='edge'||mode==='auto'&&nearEdge)&&this.map.edges[edge])return {...base,type:'edge',edge,label:this.map.edges[edge]+(this.map.edgeLocks?.[edge]?' · Locked / difficulty '+this.map.edgeLocks[edge]:''),data:{edge,kind:this.map.edges[edge]},cells:[base]};
  if(unit&&['auto','unit'].includes(mode))return {...base,type:'unit',label:unit.role,data:unit,cells:[base]};
  if(availableProp&&['auto','prop'].includes(mode))return {...base,type:'prop',label:prop.kind,data:prop,cells:propCells(prop)};
  const access=[...this.map.stairs.map(p=>({...p,kind:p.kind||'stairs'})),...(this.map.climbs||[]).map(p=>({...p,kind:p.kind==='cliff'?'cliff climb':'roof climb'})),...this.map.exits.map(p=>({...p,kind:'Travel marker'}))].find(p=>p.x===x&&p.y===y&&((p.z||0)===z||(p.kind==='stairs'||p.kind==='ladder')&&(p.z||0)+1===z));
  if(access&&['auto','access'].includes(mode))return {...base,type:'access',label:(access.rusty?'Rusty ':'')+access.kind,data:access,cells:[base]};
  if(z&&this.map.breaches?.upper[z-1]?.[`${x},${y}`])return {...base,type:'tile',label:'Broken floor opening',data:{...base,terrain,broken:true,originalTerrain:this.map.breaches.upper[z-1][`${x},${y}`]},cells:[base]};
  return {...base,type:'tile',label:terrain==='void'?'Empty floor cell':terrain,data:{...base,terrain,...foliageAt(this.map,x,y,z)?{foliage:foliageAt(this.map,x,y,z),treeCover:TREE_COVER[treeCoverOf(foliageAt(this.map,x,y,z))].label}:{}},cells:[base]};
 }
}
