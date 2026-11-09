import * as T from './aft/tactics/vendor/three.module.js';
import {flameMaskRect,flameFogMask} from './flame-event.js';

function texture(data,width,height){
  const fog=new T.DataTexture(data,width,height,T.RGBAFormat);
  fog.minFilter=fog.magFilter=T.NearestFilter;fog.generateMipmaps=false;fog.needsUpdate=true;return fog;
}
export function createFlameMask(){const data=new Uint8Array(4);return {data,fog:texture(data,1,1),rect:{origin:{x:0,y:0},width:1,height:1}};}
export function updateFlameMask(mask,shape,visible){
  const rect=flameMaskRect(shape);mask.data=flameFogMask(shape,visible,mask.data,rect);
  if(mask.rect.width!==rect.width||mask.rect.height!==rect.height){mask.fog.dispose();mask.fog=texture(mask.data,rect.width,rect.height);}
  else{mask.fog.image.data=mask.data;mask.fog.needsUpdate=true;}
  mask.rect=rect;
}
