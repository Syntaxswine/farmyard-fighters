import {DIMENSIONS,GAME_CAMERA,toWorld} from './hybrid-world.js';

export const FLOOR_PIXELS=DIMENSIONS.floorSpacing*28*Math.sqrt(2)*Math.cos(GAME_CAMERA.elevation);
export const quarterTurn=n=>((n%4)+4)%4;
const axes=turn=>[[1,0],[0,1],[-1,0],[0,-1]][quarterTurn(turn||0)];

// Keep the renderer, overlays and ground picking on the same camera axes.
export function projectBattlePoint(point,view,level=0){
 const [x,h,y]=toWorld({...point,h:point.h??point.towerElevation??0}),[c,s]=axes(view.turn),rx=c*x-s*y,ry=s*x+c*y;
 return {x:view.x+(rx-ry)*28*view.zoom,y:view.y+(rx+ry)*14*view.zoom-(h/DIMENSIONS.floorSpacing-level)*FLOOR_PIXELS*view.zoom};
}
export function battleFloorPoint(view,x,y,level=0,lift=0){
 const px=(x-view.x)/(28*view.zoom),py=(y-view.y+lift/DIMENSIONS.floorSpacing*FLOOR_PIXELS*view.zoom)/(14*view.zoom),rx=(px+py)/2,ry=(py-px)/2,[c,s]=axes(view.turn);
 return {x:c*rx+s*ry,y:-s*rx+c*ry,z:level};
}
export function rotateBattleView(view,delta,width,height,level=0){
 const anchor=battleFloorPoint(view,width/2,height/2,level);
 view.turn=quarterTurn((view.turn||0)+delta);
 const p=projectBattlePoint(anchor,view,level);view.x+=width/2-p.x;view.y+=height/2-p.y;
}
export function focusBattleView(view,x,y,width,height){
 view.zoom=1.15;
 const p=projectBattlePoint({x,y},{...view,x:0,y:0});view.x=width/2-p.x;view.y=height*.55-p.y;
}
export function overviewBattleView(view,mapWidth,mapHeight,width,height){
 const points=[[-.5,-.5],[mapWidth-.5,-.5],[-.5,mapHeight-.5],[mapWidth-.5,mapHeight-.5]].map(([x,y])=>projectBattlePoint({x,y},{...view,x:0,y:0,zoom:1}));
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
 view.zoom=Math.min(Math.max(1,width-50)/(right-left),Math.max(1,height-60)/(bottom-top));
 view.x=width/2-(left+right)/2*view.zoom;view.y=height/2-(top+bottom)/2*view.zoom;
}
export function setBattleCamera(camera,view,width,height,level=0){
 const scale=28*Math.sqrt(2)*view.zoom,baseY=view.y+level*FLOOR_PIXELS*view.zoom,a=GAME_CAMERA.azimuth+quarterTurn(view.turn||0)*Math.PI/2;
 camera.left=-view.x/scale;camera.right=(width-view.x)/scale;camera.top=baseY/scale;camera.bottom=(baseY-height)/scale;camera.near=.1;camera.far=1600;
 camera.up.set(0,1,0);camera.position.set(Math.sin(a)*Math.cos(GAME_CAMERA.elevation)*800,Math.sin(GAME_CAMERA.elevation)*800,Math.cos(a)*Math.cos(GAME_CAMERA.elevation)*800);
 camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
}
