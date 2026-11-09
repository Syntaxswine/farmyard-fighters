import {dogPaintLayers} from './dog-paint-layers.js';
export function dogMotionPaint(cloth,renderer,eye){
 const layers=dogPaintLayers(cloth,renderer,eye);
 layers.application+=`
 // Kneeling exposes the inner trouser seam hidden behind the tail/other leg
 // in all four neutral projections. Continue the same brown cloth through it.
 if(abs(vPaintPart-2.)<.1){
  float inner=(1.-smoothstep(.08,.16,abs(p.z)))*smoothstep(.48,.61,p.y)*(1.-smoothstep(.87,.93,p.y))*smoothstep(.28,.50,diffuseColor.r);
  vec3 brown=dogPatch(vec2(137.+p.x*95.,555.+(p.y-.67)*220.+p.z*70.));
  diffuseColor.rgb=mix(diffuseColor.rgb,brown*(.90+.10*abs(n.z)),inner);coverage*=1.-inner;filled=max(filled,inner);
 }
 `;
 return layers;
}
