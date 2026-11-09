export const MILITIA_WEAPONS={basic:['pistol','rifle'],medium:['smg','assault'],high:['sniper','hmg']};
export function militiaMinutes(leadership){
 const n=Math.max(1,Math.min(100,Number(leadership)||1));
 return Math.round(1440*(n<=50?4-(n-1)/49:3-(n-50)/50));
}
export function militiaKey(map,sector){
 const id=map.sectors[sector]?.settlementId;
 return id?map.sectors.findIndex(s=>s.settlementId===id):sector;
}
export const emptyMilitia=()=>({basic:0,medium:0,high:0,rounds:0});
export const militiaCount=r=>r?r.basic+r.medium+r.high:0;
export function militiaAt(session,map,sector){return session.logistics?.militia[militiaKey(map,sector)]||emptyMilitia();}
export function trainMilitia(roster){
 if(roster.rounds>=6)throw Error('This town has completed its six training batches.');
 const recruited=Math.min(4,8-militiaCount(roster));
 let left=4-recruited;
 const medium=Math.min(left,roster.basic);left-=medium;
 const high=Math.min(left,roster.medium);
 if(recruited+medium+high===0)throw Error('All eight militia are already highly trained.');
 return {basic:roster.basic+recruited-medium,medium:roster.medium+medium-high,high:roster.high+high,rounds:roster.rounds+1};
}
export function militiaLoadout(roster){
 return Object.keys(MILITIA_WEAPONS).flatMap(tier=>Array.from({length:roster[tier]},(_,i)=>({tier,weapon:MILITIA_WEAPONS[tier][i%2],playerTrainedMilitia:true})));
}
export function sectorLeadership(session,sector){
 return Math.max(1,...session.groups.filter(g=>g.state.position===sector&&!g.state.progress).flatMap(g=>g.state.members.map(u=>Math.max(1,Math.min(100,Number(u.stats?.leadership)||1)))));
}
export function normalizeMilitia(session,map){
 const l=session.logistics;
 for(const [key,value] of Object.entries(l.militia)){
  if(!map.sectors[key])throw Error('Militia references a missing sector.');
  if(typeof value==='number'){
   if(!Number.isInteger(value)||value<0||value>8)throw Error('Legacy militia count exceeds the new eight-person limit or is invalid.');
   l.militia[key]={basic:value,medium:0,high:0,rounds:Math.ceil(value/4)};
  }
  const r=l.militia[key];
  if(!r||!['basic','medium','high','rounds'].every(k=>Number.isInteger(r[k])&&r[k]>=0)||militiaCount(r)>8||r.rounds>6)throw Error('Invalid militia roster.');
  const canonical=militiaKey(map,Number(key));
  if(String(canonical)!==key){
   if(l.militia[canonical])throw Error('Duplicate militia rosters for the same settlement.');
   l.militia[canonical]=r;delete l.militia[key];
  }
 }
}
