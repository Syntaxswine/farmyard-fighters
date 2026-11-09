// Keep the liked old Run cadence at the new physical Run pace without altering
// frozen native gait amplitude/reach. This is a visual cursor, never saved physics.
export function movementPresentation(unit,previous){
  const actual=unit.travelled||0,delta=previous?Math.max(0,actual-(previous.travelled??actual)):0;
  return {distance:(previous?.distance??0)+delta*(unit.running?.5:1),travelled:actual,moving:!!unit.isMoving||delta>1e-7};
}
export const visualTravelDistance=(unit,previous)=>movementPresentation(unit,previous).distance;
