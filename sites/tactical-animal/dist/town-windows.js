import {FLOOR_SPACING} from './town-levels.js';
import {WALL_DIMENSIONS} from './world-dimensions.js';

// Fictional open-shutter windows. The aperture and its visible timber use one
// metre contract; the sill is cover, never a walkable gap or a promise of glass.
export const TOWN_WINDOW=Object.freeze({width:1,sill:.65,head:1.75,frame:.055,depth:WALL_DIMENSIONS.thickness});
export function townWindowParts(w){
 const {width,sill,head,frame,depth}=TOWN_WINDOW,base=w.level*FLOOR_SPACING,parts=[];
 const box=(u0,n0,u1,n1,z0,top,role)=>{
  const [dx,dy]=w.outward,a=w.axis==='e'?{x:w.x+n0*dx,y:w.y+u0}:{x:w.x+u0,y:w.y+n0*dy},b=w.axis==='e'?{x:w.x+n1*dx,y:w.y+u1}:{x:w.x+u1,y:w.y+n1*dy};
  parts.push({x0:Math.min(a.x,b.x),y0:Math.min(a.y,b.y),x1:Math.max(a.x,b.x),y1:Math.max(a.y,b.y),z0:base+z0,height:base+top,kind:'wall',windowPart:true,windowId:w.id,role});
 };
 const half=width/2;
 box(-half,-depth/2,-half+frame,depth/2,sill,head,'frame');box(half-frame,-depth/2,half,depth/2,sill,head,'frame');
 box(-half,-depth/2,half,depth/2,sill,sill+frame,'frame');box(-half,-depth/2,half,depth/2,head-frame,head,'frame');
 return parts;
}

// Painted surface skins, deliberately outside the physical-parts contract.
// A half-millimetre drawing offset avoids z-fighting; it is not a solid leaf.
export function townWindowSkins(w){
 if(w.shutters===false)return [];
 const {sill,head,depth}=TOWN_WINDOW,[dx,dy]=w.outward,n=depth/2+.0005,base=w.level*FLOOR_SPACING;
 return [-.74,.74].map(u=>{
  const x=w.x+dx*n+(w.axis==='s'?u:0),y=w.y+dy*n+(w.axis==='e'?u:0);
  return {windowId:w.id,role:'shutter-skin',centre:[x,base+(sill+head)/2,y],width:.4,height:head-sill,yaw:Math.atan2(dx,dy),bounds:[x-(w.axis==='s'?.2:0),y-(w.axis==='e'?.2:0),x+(w.axis==='s'?.2:0),y+(w.axis==='e'?.2:0)]};
 });
}
