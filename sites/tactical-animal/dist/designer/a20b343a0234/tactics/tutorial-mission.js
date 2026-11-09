// Stable, authored roles survive relocation, rotation and conversion to wrecks.
// The objects and inventory are the source of truth; dialogue never sets progress.
export const INTRO_DIALOGUE='plateau_intro';
export const DEMOLITION_CHARGE='demolitionCharge';
export const TUTORIAL_ROLES=Object.freeze({
 'plateau-radio':{label:'Tutorial radio tower',kinds:['site-radio','site-radio-destroyed']},
 'plateau-sam':{label:'Tutorial SAM site',kinds:['site-sam','site-sam-destroyed']},
 'plateau-explosives':{label:'Crash-sector explosives crate',kinds:['crate-wood','crate-steel','wooden-crate-closed','supply-chest-closed']}
});
export const demolitionCount=u=>(u?.pack||[]).filter(i=>i.type==='tool'&&i.kind===DEMOLITION_CHARGE&&Number.isInteger(i.count)&&i.count>0).reduce((n,i)=>n+i.count,0);
export const tutorialObjective=p=>['plateau-radio','plateau-sam'].includes(p?.tutorialRole)&&TUTORIAL_ROLES[p.tutorialRole].kinds.includes(p.kind);
export function tutorialRoleErrors(map){
 const errors=[],seen=new Set();
 for(const p of Array.isArray(map.props)?map.props:[])if(p&&p.tutorialRole!==undefined){
  const role=Object.hasOwn(TUTORIAL_ROLES,p.tutorialRole)?TUTORIAL_ROLES[p.tutorialRole]:null;
  if(!role||!role.kinds.includes(p.kind))errors.push('Tutorial role does not match this object.');
  if(seen.has(p.tutorialRole))errors.push('Duplicate tutorial role: '+p.tutorialRole+'. Assign each role to one object.');
  seen.add(p.tutorialRole);
 }
 return errors;
}
export function tutorialCrateLoot(map){
 return (map.props||[]).filter(p=>p.tutorialRole==='plateau-explosives').map(p=>({
  id:'plateau-explosives',x:p.x,y:p.y,z:p.z||0,container:{id:'plateau-explosives',name:'Tutorial explosives crate',locked:false},searched:false,
  items:[{type:'tool',kind:DEMOLITION_CHARGE,count:2}]
 }));
}
export function tutorialMissionValues(state,campaign,requested=['has_explosives','radio_destroyed','sam_destroyed']){
 const maps=campaign?Object.entries(campaign.assignments).map(([index,a])=>campaign.sectors[index]?.state||a.map):[state];
 const objective=role=>{
  const props=maps.flatMap(m=>(m.props||[]).filter(p=>p.tutorialRole===role));
  if(props.length!==1||!tutorialObjective(props[0]))throw Error('Tutorial setup: assign exactly one '+TUTORIAL_ROLES[role].label+' in the editor.');
  return props[0].kind.endsWith('-destroyed');
 };
 const result={};for(const key of requested){
  if(key==='has_explosives')result[key]=state.units.some(u=>u.team==='squad'&&u.hp>0&&!u.casualty&&!u.away&&demolitionCount(u)>0);
  else if(key==='radio_destroyed'||key==='sam_destroyed')result[key]=objective(key==='radio_destroyed'?'plateau-radio':'plateau-sam');
 }
 return result;
}
