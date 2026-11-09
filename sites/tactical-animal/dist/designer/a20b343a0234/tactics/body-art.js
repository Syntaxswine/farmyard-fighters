import {BODY_FRAMES} from './body-frames.js';
export {BODY_FRAMES};
const frames=new Map(BODY_FRAMES.map(f=>[f.outfit+'/'+f.species,f]));
export function bodyArt(unit){
 const outfit=unit.outfit==='red-hats'&&unit.species!=='pig-foreman'?'red-hats':'normal';
 return frames.get(outfit+'/'+unit.species)||null;
}
export function drawBody(ctx,load,unit,p,zoom){
 const frame=bodyArt(unit);if(!frame)return false;
 const img=load(frame.src);if(!img.complete||!img.naturalWidth)return false;
 const scale=zoom/4;
 ctx.save();ctx.translate(p.x,p.y);ctx.scale(unit.facing===-1?-1:1,1);
 ctx.drawImage(img,-frame.anchor[0]*scale,-frame.anchor[1]*scale,frame.width*scale,frame.height*scale);
 ctx.restore();return true;
}
