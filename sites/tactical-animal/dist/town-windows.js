import {FLOOR_SPACING} from './town-levels.js';

// Fictional open-shutter windows. The aperture and its visible timber use one
// metre contract; the sill is cover, never a walkable gap or a promise of glass.
export const TOWN_WINDOW=Object.freeze({width:1,sill:.65,head:1.75,frame:.055,depth:.22});
export function townWindowParts(w){
 const {width,sill,head,frame,depth}=TOWN_WINDOW,base=w.level*FLOOR_SPACING,parts=[];
 const box=(u0,n0,u1,n1,z0,top,role)=>{
  const [dx,dy]=w.outward,a=w.axis==='e'?{x:w.x+n0*dx,y:w.y+u0}:{x:w.x+u0,y:w.y+n0*dy},b=w.axis==='e'?{x:w.x+n1*dx,y:w.y+u1}:{x:w.x+u1,y:w.y+n1*dy};
  parts.push({x0:Math.min(a.x,b.x),y0:Math.min(a.y,b.y),x1:Math.max(a.x,b.x),y1:Math.max(a.y,b.y),z0:base+z0,height:base+top,kind:'wall',windowPart:true,windowId:w.id,role});
 };
 const half=width/2;
 box(-half,-depth/2,-half+frame,depth/2,sill,head,'frame');box(half-frame,-depth/2,half,depth/2,sill,head,'frame');
 box(-half,-depth/2,half,depth/2,sill,sill+frame,'frame');box(-half,-depth/2,half,depth/2,head-frame,head,'frame');
 // Both leaves are folded against the exterior piers, clear of the aperture.
 if(w.shutters!==false){box(-.94,.115,-.54,.155,sill,head,'shutter');box(.54,.115,.94,.155,sill,head,'shutter');}
 return parts;
}
