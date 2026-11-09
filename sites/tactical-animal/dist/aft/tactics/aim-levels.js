export const AIM_LEVELS={hip:{label:'Hip shot',multiplier:1,accuracy:0},aimed:{label:'Aimed shot',multiplier:1.5,accuracy:10},full:{label:'Full aim',multiplier:2,accuracy:20}};
export const supportsAim=w=>!!w?.mag&&!w.blast&&!w.incendiary;
export function shotAim(w,level='hip',burst=false){
 if(!Object.hasOwn(AIM_LEVELS,level))return null;
 const aim=AIM_LEVELS[supportsAim(w)?level:'hip'],base=burst&&w.dual?Math.ceil(w.cost*1.5):w.cost+(burst&&w.burstRounds>1?2:0);
 return {level:supportsAim(w)?level:'hip',cost:Math.ceil(base*aim.multiplier),accuracy:aim.accuracy};
}
