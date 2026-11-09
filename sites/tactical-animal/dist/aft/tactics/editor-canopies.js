import {CANOPY_LEVEL} from './map-layers.js';
import {ROOF_KINDS,GAP_ROOF_KINDS,roofVisualKind} from './climbable-roofs.js';
export const canopyCells=p=>Array.from({length:4},(_,i)=>({x:p.x+i%2,y:p.y+Math.floor(i/2),z:p.z??CANOPY_LEVEL}));
export function canopyErrors(map,size=240){
 if(map.canopies===undefined)return [];if(!Array.isArray(map.canopies)||map.canopies.length>4096)return ['Invalid builder roof layer.'];
 const used=new Set();for(const p of map.canopies){
  // Keep legacy decorations at their original height; new fringe roofs use 6.
  if(!p||!Number.isInteger(p.x)||!Number.isInteger(p.y)||(!Number.isInteger(p.z)||p.z<3||p.z>CANOPY_LEVEL)||![...ROOF_KINDS,...GAP_ROOF_KINDS].includes(roofVisualKind(p.kind||''))||(p.rotated!==undefined&&typeof p.rotated!=='boolean'))return ['The fringe layer accepts roof modules only.'];
  for(const q of canopyCells(p)){const key=q.x+','+q.y+','+q.z;if(q.x<0||q.y<0||q.x>=size||q.y>=size||used.has(key))return ['Roof footprints overlap or leave the map.'];used.add(key);}
 }return [];
}
export function canopyPresentation(map){
 if(!map.canopies?.length)return map;const upper=[...map.upper];
 for(const p of map.canopies){while(upper.length<p.z)upper.push({});upper[p.z-1]={...upper[p.z-1]};for(const q of canopyCells(p))upper[p.z-1][q.x+','+q.y]='floor';}
 return {...map,props:[...(map.props||[]),...map.canopies],upper,canopies:[]};
}
export function previewCanopy(map,command,size){
 const {tool,start,options={}}=command,copy=structuredClone(map);copy.canopies||=[];
 const selected=copy.canopies.find(p=>canopyCells(p).some(q=>q.x===start.x&&q.y===start.y&&q.z===start.z));
 if(['erase-prop','erase-tile','erase-roof'].includes(tool)){copy.canopies=copy.canopies.filter(p=>p!==selected);return {ok:true,map:copy,cells:selected?canopyCells(selected):[start],edges:[]};}
 if(!['roof-tile','prop'].includes(tool)||![...ROOF_KINDS,...GAP_ROOF_KINDS].includes(roofVisualKind(options.propKind||'')))return {ok:false,error:'Choose a roof module for the decorative fringe layer.'};
 const p={x:start.x,y:start.y,z:start.z??CANOPY_LEVEL,kind:options.propKind,rotated:!!options.rotated};copy.canopies.push(p);const errors=canopyErrors(copy,size);
 return {ok:!errors.length,error:errors[0],map:copy,cells:canopyCells(p),edges:[],orientation:options.rotated?[0,1]:[1,0]};
}
