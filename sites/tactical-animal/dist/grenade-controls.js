import {isTour} from './mount-dora-activity.js';

// Movement and weapon aiming use the same axes as the current field camera.
export const FIELD_CAMERA=Object.freeze({x:10,y:14,z:12});
const TOWN_CAMERA=Object.freeze({x:0,y:FIELD_CAMERA.y,z:Math.hypot(FIELD_CAMERA.x,FIELD_CAMERA.z)});
export const fieldCameraFor=state=>isTour(state)?TOWN_CAMERA:FIELD_CAMERA;
function basis({x,y,z}){
  const horizontal=Math.hypot(x,z),length=Math.hypot(horizontal,y);
  return {right:{x:z/horizontal,y:-x/horizontal},up:{x:-x*y/(horizontal*length),y:-z*y/(horizontal*length),z:horizontal/length}};
}
export function screenToGround(x,y,camera=FIELD_CAMERA){
  const {right}=basis(camera);
  return {x:right.x*x-right.y*y,y:right.y*x+right.x*y};
}

export class GrenadeAim {
  constructor(){this.cancel();}
  start(){this.active=true;this.point=null;this.offset={x:0,y:0};}
  cancel(){this.active=false;this.point=null;this.offset={x:0,y:0};}
  aim(origin,offset,range,camera){
    if(!this.active)return null;
    const n=Math.hypot(offset.x,offset.y),scale=Math.max(1,n);
    this.offset={x:offset.x/scale,y:offset.y/scale};
    // Returning to center or lifting a thumb holds the last intentional target.
    const deadZone=.12;
    if(n<=deadZone)return this.point;
    const distance=Math.max(0,(Math.min(1,n)-deadZone)/(1-deadZone))*range;
    const direction=screenToGround(offset.x/n,offset.y/n,camera);
    this.point={x:origin.x+direction.x*distance,y:origin.y+direction.y*distance};
    return this.point;
  }
  nudge(origin,direction,range,dt,camera){
    const n=Math.hypot(direction.x,direction.y);
    if(!this.active||!n)return this.point;
    return this.aim(origin,{x:this.offset.x+direction.x/n*dt*.85,y:this.offset.y+direction.y/n*dt*.85},range,camera);
  }
}

// Fit world points into the part of the screen left clear by the HUD and controls.
// Points use x/y for the ground and z for height, as the simulation does.
export function grenadeCameraFrame(points,{width,height,left=16,right:edge=width-16,top=100,bottom=height-220},minimumSpan,camera=FIELD_CAMERA){
  const {right,up}=basis(camera);
  const projected=points.map(p=>({x:p.x*right.x+p.y*right.y,y:p.x*up.x+p.y*up.y+(p.z||0)*up.z}));
  const xs=projected.map(p=>p.x),ys=projected.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const usableWidth=Math.max(40,edge-left),usableHeight=Math.max(60,bottom-top);
  const span=Math.max(minimumSpan,(maxX-minX)*height/usableWidth*1.08,(maxY-minY)*height/usableHeight*1.08);
  const x=(minX+maxX)/2-((left+edge-width)/2)/height*span;
  const y=(minY+maxY)/2-((height-top-bottom)/2)/height*span;
  const groundUp=up.x*up.x+up.y*up.y;
  return {span,target:{x:right.x*x+up.x*y/groundUp,y:right.y*x+up.y*y/groundUp}};
}
