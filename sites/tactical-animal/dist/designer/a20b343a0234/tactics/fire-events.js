// Presentation receipts for already committed rules. No rolls, movement, damage,
// time, inventory changes or extra AP charges are performed here.
export const firePoint=u=>({x:u.x,y:u.y,z:u.z||0,heading:u.heading||0,...(u.towerPost?{towerPost:structuredClone(u.towerPost)}:{}),...(u.cliffSupport?{cliffSupport:structuredClone(u.cliffSupport)}:{})});
export function recordBurn(s,u,kind,route=[firePoint(u)]){
 if(kind==='ash'||kind==='tank')u.burnedRemains=true;
 const event={sequence:s.fireAnimationSequence=(s.fireAnimationSequence||0)+1,unitId:u.id,kind,weapon:u.weapon,route};
 (s.fireAnimations??=[]).push(event);s.fireAnimations=s.fireAnimations.slice(-128);return event;
}
