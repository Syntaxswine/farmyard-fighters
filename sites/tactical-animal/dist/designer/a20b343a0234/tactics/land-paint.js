import {MAP_LEVELS,mapLevelCount} from './map-layers.js';
// Editor ownership only. Gameplay uses the ordinary floors and cliff props baked by the brush.
// Each sparse column records [plateau height, original ground] to support boundary rebuilding.
export function landErrors(map,size=240,grounds=[]){
 if(map.landPaint===undefined)return (map.props||[]).some(p=>p.landAuto)?['Automatic cliffs need their painted-land footprint.']:[];
 const land=map.landPaint;
 if(!land||typeof land!=='object'||Array.isArray(land))return ['Invalid painted-land footprint.'];
 for(const [key,value]of Object.entries(land)){
  const [x,y]=key.split(',').map(Number);
  if(key!==`${x},${y}`||!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=size||y>=size||!Array.isArray(value)||value.length!==2||(!Number.isInteger(value[0])||value[0]<1||value[0]>=Math.min(MAP_LEVELS,mapLevelCount(map)))||!['yard','floor','woodland',...grounds].includes(value[1]))return ['Invalid painted-land column: '+key];
 }
 for(const p of map.props||[])if(p.landAuto!==undefined&&(p.landAuto!==true||p.kind!=='cliff-ledge'||(p.cliffMask??15)!==15||!land[`${p.x},${p.y}`]||!Number.isInteger(p.z??0)||(p.z??0)<0||(p.z??0)>=land[`${p.x},${p.y}`][0]))return ['Invalid automatic cliff ownership.'];
 return [];
}
export function extractLand(map,x,y,size=24){
 const land={};for(const [key,value]of Object.entries(map.landPaint||{})){const [a,b]=key.split(',').map(Number);if(a>=x&&b>=y&&a<x+size&&b<y+size)land[`${a-x},${b-y}`]=[...value];}return Object.keys(land).length?{landPaint:land}:{};
}
export function placeLand(map,block,x,y,size=24){
 const land={...map.landPaint};for(const key of Object.keys(land)){const [a,b]=key.split(',').map(Number);if(a>=x&&b>=y&&a<x+size&&b<y+size)delete land[key];}
 for(const [key,value]of Object.entries(block.landPaint||{})){const [a,b]=key.split(',').map(Number);land[`${a+x},${b+y}`]=[...value];}
 if(Object.keys(land).length)map.landPaint=land;else delete map.landPaint;
}
export function landBrushCells(start,end=start,options={},size=240,path){
 const diameter=options.landSize??9,shape=options.landShape??'round';
 if(!Number.isInteger(diameter)||diameter<1||diameter>63||!['round','square'].includes(shape))throw Error('Choose a round or square brush, 1–63 tiles wide.');
 const points=path?.length?path:[start,end],cells=new Map(),lo=-Math.floor((diameter-1)/2),hi=lo+diameter-1,center=(lo+hi)/2;
 if(points.length>4096||points.some(p=>!p||!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x>=size||p.y>=size))throw Error('Keep the land brush inside the map.');
 const stamp=(x,y)=>{for(let dy=lo;dy<=hi;dy++)for(let dx=lo;dx<=hi;dx++){
  if(shape==='round'&&(dx-center)**2+(dy-center)**2>(diameter/2)**2)continue;
  const a=x+dx,b=y+dy;if(a>=0&&b>=0&&a<size&&b<size)cells.set(`${a},${b}`,{x:a,y:b,z:options.landHeight??1});
 }};
 for(let i=0;i<points.length;i++){const p=points[i],a=points[Math.max(0,i-1)],steps=Math.max(Math.abs(p.x-a.x),Math.abs(p.y-a.y));if(!steps)stamp(p.x,p.y);else for(let t=1;t<=steps;t++)stamp(Math.round(a.x+(p.x-a.x)*t/steps),Math.round(a.y+(p.y-a.y)*t/steps));}
 return [...cells.values()];
}
