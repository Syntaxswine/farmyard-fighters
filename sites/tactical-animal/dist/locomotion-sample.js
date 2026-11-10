// Keep the liked old Run cadence at the new physical Run pace without altering
// frozen native gait amplitude/reach. This is a visual cursor, never saved physics.
export function movementPresentation(unit,previous){
  const actual=unit.travelled||0,delta=previous?Math.max(0,actual-(previous.travelled??actual)):0;
  return {distance:(previous?.distance??0)+delta*(unit.running?.5:1),travelled:actual,moving:!!unit.isMoving||delta>1e-7};
}
export const visualTravelDistance=(unit,previous)=>movementPresentation(unit,previous).distance;

// The planted forearm and opposite toes follow accepted travel. A blocked
// input, stance change in place or restored travel counter advances no phase.
export function crawlTravel(unit,previous){
  if(unit.stance!=='prone'||!previous)return 0;
  const distance=previous.stance==='prone'?(previous.crawlDistance??0):0;
  const delta=Math.max(0,(unit.travelled??0)-(previous.travelled??unit.travelled??0));
  if(delta<1e-7)return distance;
  const angle=unit.heading*Math.PI/180;
  const forward=(unit.x-previous.x)*Math.cos(angle)+(unit.y-previous.y)*Math.sin(angle);
  return distance+(forward<0?-delta:delta);
}
