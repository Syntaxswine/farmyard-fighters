export const TOOLS={lockpicks:{name:'Lockpick set',weight:.5},repairKit:{name:'Repair supplies',weight:2},largeMedicalKit:{name:'Large medical chest',weight:5},demolitionCharge:{name:'Demolition explosives',weight:2}};
export const isMedicalChest=i=>i?.type==='tool'&&i.kind==='largeMedicalKit';
export const medicalChest=()=>({type:'tool',kind:'largeMedicalKit',count:1,charges:10});
export const validMedicalChest=i=>!isMedicalChest(i)||i.count===1&&Number.isInteger(i.charges)&&i.charges>=1&&i.charges<=10;
export const sectorMedicalCharges=u=>(Number.isInteger(u.medkits)?u.medkits:0)+(u.pack||[]).filter(i=>isMedicalChest(i)&&validMedicalChest(i)).reduce((n,i)=>n+i.charges,0);
export function consumeSectorMedical(u){const chest=(u.pack||[]).find(i=>isMedicalChest(i)&&validMedicalChest(i));if(chest){if(--chest.charges===0)u.pack.splice(u.pack.indexOf(chest),1);return true;}if(u.medkits>0){u.medkits--;return true;}return false;}
export const toolCount=(u,kind)=>(u.pack||[]).filter(i=>i.type==='tool'&&i.kind===kind).reduce((n,i)=>n+i.count,0);
export function consumeTool(u,kind){const item=u.pack.find(i=>i.type==='tool'&&i.kind===kind&&i.count>0);if(!item)return false;item.count--;if(!item.count)u.pack.splice(u.pack.indexOf(item),1);return true;}
export function starterTools(u){if(u.team!=='squad'||!u.pack)return;if(u.name==='Vera'&&!u.pack.some(isMedicalChest))u.pack.push(medicalChest());if(u.name==='Anya'&&!toolCount(u,'lockpicks'))u.pack.push({type:'tool',kind:'lockpicks',count:1});if(u.name==='Misha'&&!toolCount(u,'repairKit'))u.pack.push({type:'tool',kind:'repairKit',count:3});}
export const carryCapacity=u=>u.stats?10+.4*u.stats.strength:Infinity;
export const loadMultiplier=(u,weight)=>u.stats?Math.max(1,weight/carryCapacity(u)):1;
