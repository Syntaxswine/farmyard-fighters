// World units: each ground tile is 1 x 1; walls are 2 high.
export const WALL_HEIGHT=2;
export function roomBoxes({doorClosed=false,roof=false}={}){
 const boxes=[];
 const box=(name,x,y,z,w,h,d)=>boxes.push({name,center:[x,y,z],size:[w,h,d],min:[x-w/2,y-h/2,z-d/2],max:[x+w/2,y+h/2,z+d/2]});
 box('Left pier',-2.5,1,0,1,2,.16);
 box('Center wall',0,1,0,2,2,.16);
 box('Right pier',2.5,1,0,1,2,.16);
 box('Door lintel',-1.5,1.825,0,1,.35,.16);
 box('Window sill',1.5,.425,0,1,.85,.16);
 box('Window lintel',1.5,1.775,0,1,.45,.16);
 box('Rear wall',0,1,-4,6,2,.16);
 box('Left wall',-3,1,-2,.16,2,4);
 box('Right wall',3,1,-2,.16,2,4);
 if(doorClosed)box('Closed door',-1.5,.825,0,1,1.65,.12);
 if(roof)box('Roof',0,2.06,-2,6.2,.12,4.2);
 return boxes;
}
export function segmentBox(start,end,box){
 let near=0,far=1;
 for(let axis=0;axis<3;axis++){
  const d=end[axis]-start[axis];
  if(Math.abs(d)<1e-9){if(start[axis]<box.min[axis]||start[axis]>box.max[axis])return null;continue;}
  let a=(box.min[axis]-start[axis])/d,b=(box.max[axis]-start[axis])/d;
  if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return null;
 }
 return near;
}
export function traceShot(start,end,boxes){
 let hit=null;
 for(const box of boxes){const t=segmentBox(start,end,box);if(t!==null&&(!hit||t<hit.t))hit={name:box.name,t,point:start.map((v,i)=>v+(end[i]-v)*t)};}
 return hit;
}
export const SHOT_PRESETS={
 door:{label:'Open doorway',x:-1.5,height:1.2},
 window:{label:'Through window',x:1.5,height:1.2},
 wall:{label:'Solid wall',x:0,height:1.2},
 sill:{label:'Below window',x:1.5,height:.5}
};
