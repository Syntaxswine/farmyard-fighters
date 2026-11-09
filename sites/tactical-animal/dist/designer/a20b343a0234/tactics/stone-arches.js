import {isStoneArch,sceneryPoint,sceneryLocal,scenerySize} from './scenery-catalog.js';
import {stoneArchData,ARCH_FLOOR} from './stone-arch-geometry.js';
import {SceneryIndex} from './scenery-index.js';

const surfaces=new SceneryIndex(props=>{const index=new Map();for(const p of props){const d=stoneArchData(p.kind);for(let y=0;y<d.h;y++)for(let x=0;x<d.w;x++){const q=sceneryPoint(p,[x,y]);q.z=(p.z||0)+d.rise;index.set(`${q.x},${q.y},${q.z}`,p);}}return index;},isStoneArch);
export const archSurfaceAt=(map,x,y,z=0)=>z&&map.props?.length?surfaces.get(map).get(`${x},${y},${z}`):undefined;
export const archTerrainAt=(map,x,y,z=0)=>archSurfaceAt(map,x,y,z)?'ground-gravel':null;
export function archSurfaces(map){return [...surfaces.get(map)].map(([key,prop])=>{const [x,y,z]=key.split(',').map(Number);return {x,y,z,prop};});}

export function archPlacementErrors(map,extra=null,rules={},boundaries={}){
 const props=extra?[...(map.props||[]),extra]:map.props||[],errors=[];
 const levels=map.levels??map.definition?.levels??((map.upper?.length||2)+1);
 for(const p of props){if(!isStoneArch(p))continue;const data=stoneArchData(p.kind),base=p.z||0,{w,h}=scenerySize(p);
  if(base+data.rise>=levels)errors.push('The arch top must fit within the map’s playable layers.');
  const intersects=(min,max)=>{const a=sceneryLocal(p,{x:min[0],y:min[1],h:min[2]},'render'),b=sceneryLocal(p,{x:max[0],y:max[1],h:max[2]},'render');return data.intersects([Math.min(a.x,b.x),Math.min(a.y,b.y),Math.min(a.h,b.h)],[Math.max(a.x,b.x),Math.max(a.y,b.y),Math.max(a.h,b.h)]);};
  for(let z=base+1;z<=levels;z++)for(let y=p.y;y<p.y+h;y++)for(let x=p.x;x<p.x+w;x++){
   const t=z===levels?(map.canopies||[]).some(q=>x>=q.x&&y>=q.y&&x<q.x+2&&y<q.y+2):map.upper?.[z-1]?.[`${x},${y}`];
   if(t&&t!=='void'&&intersects([x-.49,y-.49,z*ARCH_FLOOR-.12],[x+.49,y+.49,z*ARCH_FLOOR-.001]))errors.push('Remove floors or roofs that intersect the solid arch. The arch supplies its own walkable top.');
  }
  for(const q of props){if(q===p)continue;const rule=rules[q.kind];if(!rule?.solid&&!isStoneArch(q))continue;const size=isStoneArch(q)?scenerySize(q):{w:q.rotated?rule.h:rule.w,h:q.rotated?rule.w:rule.h},height=isStoneArch(q)?stoneArchData(q.kind).top:rule.tall?2:rule.height??.8,z=q.z||0;
   if(intersects([q.x-.49,q.y-.49,z*ARCH_FLOOR+.01],[q.x+size.w-.51,q.y+size.h-.51,z*ARCH_FLOOR+height]))errors.push('The arch intersects another solid object.');
  }
  for(const [key,kind]of Object.entries(map.edges||{})){if(!boundaries[kind]?.solid)continue;const [axis,sx,sy,sz=0]=key.split(':'),x=+sx,y=+sy,z=+sz;
   if(intersects(axis==='e'?[x+.42,y-.5,z*ARCH_FLOOR+.01]:[x-.5,y+.42,z*ARCH_FLOOR+.01],axis==='e'?[x+.58,y+.5,z*ARCH_FLOOR+2]:[x+.5,y+.58,z*ARCH_FLOOR+2]))errors.push('The arch intersects a wall or solid boundary.');
  }
 }
 return [...new Set(errors)];
}
