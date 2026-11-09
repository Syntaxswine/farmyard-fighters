import * as T from '../../aft/tactics/vendor/three.module.js';

// Converts kit.solidParts() entries into simulation boxes [x0,x1,y0,y1,z0,z1]:
// world x east, y south (three's z) and z up (three's y). Each primitive keeps
// its own box, so the air between a beam and its platform stays open. Rounding
// goes outward to the millimetre; the epsilon stops float noise adding one.
export function solidPartBoxes(parts){
  const box=new T.Box3(),down=v=>Math.floor(v*1000+1e-6)/1000,up=v=>Math.ceil(v*1000-1e-6)/1000;
  return parts.map(({geometry,matrixWorld})=>{
    if(!geometry.boundingBox)geometry.computeBoundingBox();
    box.copy(geometry.boundingBox).applyMatrix4(matrixWorld);
    return [down(box.min.x),up(box.max.x),down(box.min.z),up(box.max.z),down(box.min.y),up(box.max.y)];
  });
}
