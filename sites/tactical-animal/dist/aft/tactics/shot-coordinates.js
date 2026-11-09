import * as T from './vendor/three.module.js';
import {DIMENSIONS} from './hybrid-world.js';
import {TOWERS,TOWER_HEIGHT,unitBaseHeight} from './tower-geometry.js';
import {MAP_LEVELS} from './map-layers.js';

function visualTower(state,p){return state?.props?.find(t=>{const f=TOWERS[t.kind];if(!f)return false;const h=p.y-(t.z||0)*DIMENSIONS.floorSpacing;return h>=TOWER_HEIGHT-.2&&h<=TOWER_HEIGHT+3&&p.x>=t.x-.5&&p.x<t.x+(t.rotated?f.h:f.w)-.5&&p.z>=t.y-.5&&p.z<t.y+(t.rotated?f.w:f.h)-.5;});}
export function shotPoint(p,state){
 const ratio=DIMENSIONS.standing/1.8,support=p.support;
 let height,level;
 if(support){level=support.level;height=level*DIMENSIONS.floorSpacing+support.offset+(p.h-support.baseHeight)*ratio;}
 else {
  const victim=state?.units?.find(u=>u.id===p.unitId);
  if(victim?.towerPost||victim?.cliffSupport){level=victim.cliffSupport&&!victim.towerPost?victim.cliffSupport.level:victim.z||0;height=unitBaseHeight(victim,DIMENSIONS.floorSpacing)+(p.h-unitBaseHeight(victim))*ratio;}
  else {const tower=visualTower(state,{x:p.x,y:p.h,z:p.y});
   if(tower){level=tower.z||0;height=level*DIMENSIONS.floorSpacing+p.h-level*3;}
   else {level=Math.max(0,Math.floor((p.h||0)/3));height=level*DIMENSIONS.floorSpacing+((p.h||0)-level*3)*ratio;}
  }
 }
 const v=new T.Vector3(p.x,height,p.y);v.shotLevel=level;return v;
}
export function shotVisible(state,p){
 const tower=p.shotLevel===undefined?visualTower(state,p):null;
 const z=p.shotLevel??(tower?(tower.z||0):Math.max(0,Math.min(MAP_LEVELS-1,Math.floor(p.y/DIMENSIONS.floorSpacing))));
 const key=z?`${Math.round(p.x)},${Math.round(p.z)},${z}`:`${Math.round(p.x)},${Math.round(p.z)}`;
 return !!state.visible?.has(key)&&!state.concealedInteriors?.has(key);
}
export function impactFrame(receipt){
 const contact=shotPoint({...receipt.contact,support:receipt.victim.support});
 const origin=shotPoint({...receipt.origin,support:receipt.originSupport});
 // Transform the final local incoming segment by the same local height scale.
 const incoming=new T.Vector3(receipt.incoming.x,receipt.incoming.h*DIMENSIONS.standing/1.8,receipt.incoming.y).normalize();
 return {contact,origin,incoming};
}
export function canPresentBodyImpact(receipt,active,state){
 const victim=state.units.find(u=>u.id===receipt.victimId);
 const known=victim?.team==='squad'||active.knownUnitIds?.includes(receipt.victimId);
 return !!known&&shotVisible(state,impactFrame(receipt).contact);
}
