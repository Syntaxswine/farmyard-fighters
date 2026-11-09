import {projectWorld,DIMENSIONS,GAME_CAMERA} from './hybrid-world.js';
import {bodyRegions,physicalHeight,muzzlePoint} from './hybrid-combat.js';
export function alphaBounds(pixels,width,height){
 let left=width,right=0,top=height,bottom=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>=102){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
 return left<right?{left,right,top,bottom}:{left:0,right:width,top:0,bottom:height};
}
// Architect's visual preview: one uniform scale and a horizontal reflection only.
// This intentionally exposes missing directional/aiming art instead of deforming it.
// Existing calibrated presentation remains available for numerical comparison.
export function rigidSpriteVertex(unit,art,bounds,px,py,camera=GAME_CAMERA){
 const scale=DIMENSIONS.standing*Math.cos(GAME_CAMERA.elevation)/236;
 const flip=Math.cos((unit.heading||0)*Math.PI/180+camera.azimuth)>=0?1:-1;
 return [(px-art.anchor[0])*scale*flip,(bounds.bottom-py)*scale,0];
}
// Presentation only. Stance/body geometry is never changed to fit artwork.
function baseSpriteVertex(unit,art,bounds,px,py,camera){
 const height=physicalHeight({geometryMode:'hybrid'},unit),heading=(unit.heading||0)*Math.PI/180;
 if(unit.stance!=='prone'){
  const scale=height/(bounds.bottom-bounds.top),flip=Math.cos(heading+camera.azimuth)>=0?1:-1;
  return [(px-art.anchor[0])*scale*flip,(bounds.bottom-py)*scale*Math.cos(camera.elevation),0];
 }
 // Fit the opaque prone card to the projected body's oriented bounds. This lets
 // its long axis rotate through ALL world headings instead of a binary flip.
 const body=bodyRegions({geometryMode:'hybrid'},unit),c=Math.cos(heading),s=Math.sin(heading);
 const direction=projectWorld([c,0,s],camera),length=Math.hypot(...direction),f=direction.map(v=>v/length);
 let v=[-f[1],f[0]];if(v[1]<-1e-8||Math.abs(v[1])<1e-8&&v[0]<0)v=v.map(x=>-x);
 const points=[];
 for(const r of body.regions)for(const x of [r.min[0],r.max[0]])for(const y of [r.min[1],r.max[1]])for(const z of [r.min[2],r.max[2]])points.push(projectWorld([x*c-z*s,y,x*s+z*c],camera));
 const along=points.map(p=>p[0]*f[0]+p[1]*f[1]),across=points.map(p=>p[0]*v[0]+p[1]*v[1]);
 const a=Math.min(...along)+(px-bounds.left)/(bounds.right-bounds.left)*(Math.max(...along)-Math.min(...along));
 const b=Math.min(...across)+(bounds.bottom-py)/(bounds.bottom-bounds.top)*(Math.max(...across)-Math.min(...across));
 return [a*f[0]+b*v[0],a*f[1]+b*v[1],0];
}
export function weaponLandmarks(pixels,width,height,bounds,anchorX){
 // The exposed barrel at the right edge supplies its own slope, including the
 // angled normal-uniform rifle. Use opaque column centroids, not guessed rows.
 const columns=[];for(let x=Math.max(bounds.left,bounds.right-28);x<bounds.right;x++){let sum=0,count=0;for(let y=bounds.top;y<bounds.bottom;y++)if(pixels[(y*width+x)*4+3]>=102){sum+=y+.5;count++;}if(count)columns.push([x+.5,sum/count]);}
 if(columns.length<2)return null;
 const mx=columns.reduce((n,p)=>n+p[0],0)/columns.length,my=columns.reduce((n,p)=>n+p[1],0)/columns.length;
 const slope=columns.reduce((n,p)=>n+(p[0]-mx)*(p[1]-my),0)/columns.reduce((n,p)=>n+(p[0]-mx)**2,0),muzzle=columns.at(-1),grip=[Math.min(anchorX,muzzle[0]-12),my+slope*(Math.min(anchorX,muzzle[0]-12)-mx)];
 return {muzzle,grip};
}
export function spriteVertex(unit,art,bounds,px,py,camera){
 const base=baseSpriteVertex(unit,art,bounds,px,py,camera),landmark=art.weaponLandmarks;if(!landmark)return base;
 const {muzzle,grip}=landmark,t=Math.max(0,Math.min(1,(px-grip[0])/(muzzle[0]-grip[0]))),lineY=grip[1]+(muzzle[1]-grip[1])*(px-grip[0])/(muzzle[0]-grip[0]);
 const weight=t*Math.max(0,Math.min(1,(32-Math.abs(py-lineY))/12));if(!weight)return base;
 const source=baseSpriteVertex(unit,art,bounds,...muzzle,camera),tip=muzzlePoint({geometryMode:'hybrid'},unit),target=projectWorld([tip.x-unit.x,tip.h-(unit.z||0)*2.12,tip.y-unit.y],camera);
 return [base[0]+(target[0]-source[0])*weight,base[1]+(target[1]-source[1])*weight,0];
}
