// Saved one-tile placements. Adjacent cells join; an omitted cell is a gate.
export const HEDGE_VERSION=1,HEDGE_SEED=173;
export const HEDGE_PROPS=Object.freeze({
 'hedge-short':{name:'Hedge · short / clipped',w:1,h:1,solid:true,cover:0,hedge:true},
 'hedge-tall':{name:'Hedge · tall / screening',w:1,h:1,solid:true,cover:0,hedge:true}
});
export const isHedge=p=>Object.hasOwn(HEDGE_PROPS,p?.kind);
export function hedgeErrors(map){
 const errors=[];
 for(const p of map.props||[])if(isHedge(p)){
  if(p.hedgeVersion!==undefined&&p.hedgeVersion!==HEDGE_VERSION)errors.push('Unsupported hedge version at '+p.x+','+p.y+'.');
  if(p.hedgeSeed!==undefined&&(!Number.isSafeInteger(p.hedgeSeed)||p.hedgeSeed<0||p.hedgeSeed>0xffffffff))errors.push('Invalid hedge seed at '+p.x+','+p.y+'.');
 }
 return errors;
}
// Simulation floors are 3 units apart; presentation floors are 2.12. A full
// cliff ledge ends at +2 in both spaces, rather than at the next floor datum.
export function hedgeGroups(map){
 const props=map.coverOccupiedProps||map.props||[],ledges=new Set(props.filter(p=>p.kind==='cliff-ledge'&&(p.cliffMask??15)===15).map(p=>`${p.x},${p.y},${(p.z||0)+1}`)),groups=new Map();
 for(const p of props)if(isHedge(p)){
  const level=p.z||0,ledge=ledges.has(`${p.x},${p.y},${level}`),base=ledge?(level-1)*2.12+2:level*2.12,simBase=ledge?(level-1)*3+2:level*3;
  if(!groups.has(level))groups.set(level,{level,cells:[],bases:new Map()});
  const group=groups.get(level);group.cells.push({x:p.x,z:p.y,kind:p.kind==='hedge-tall'?'tall':'short',base,seed:p.hedgeSeed??HEDGE_SEED});group.bases.set(`${p.x},${p.y}`,{base,simBase});
 }
 for(const group of groups.values())group.cells.sort((a,b)=>a.z-b.z||a.x-b.x);
 return [...groups.values()];
}
