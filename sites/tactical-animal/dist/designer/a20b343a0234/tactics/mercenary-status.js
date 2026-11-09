// Downed, stabilized and captured mercs are still alive.
export const isDeceased=u=>!!u&&(u.casualty==='dead'||u.hp<=0&&!['bleeding','stable','captured','quit'].includes(u.casualty));

export function defeatSummary(state){
 const roster=state.units.filter(u=>u.team==='squad'),dead=roster.filter(isDeceased),captured=roster.filter(u=>u.casualty==='captured');
 const allDead=roster.length>0&&dead.length===roster.length;
 return {title:allDead?'Your squad has died':'Squad defeated',text:allDead?'All mercenaries in this sector are deceased.':[
  dead.length?dead.length+' deceased.':'',captured.length?captured.length+' captured.':'','No mercenaries remain able to fight here.'
 ].filter(Boolean).join(' ')};
}
