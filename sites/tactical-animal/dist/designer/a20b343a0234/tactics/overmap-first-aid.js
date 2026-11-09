import {sectorMedicalCharges,consumeSectorMedical} from './inventory-tools.js';
import {mercMaxHp} from './overmap-rest.js';
export function firstAidMinutes(skill){const n=Math.max(1,Math.min(100,Number(skill)||1));return Math.round(n<=50?2880-(n-1)*1440/49:1440-(n-50)*960/50);}
const present=(g,sector)=>g.state.position===sector&&!g.state.progress&&!g.state.route.length;
const living=u=>(u.hp??mercMaxHp(u))>0&&!u.casualty;
export function startFirstAid(session,id){
 const g=session.groups.find(g=>g.id===id);
 if(!g||g.firstAid||g.rest||g.training||g.state.route.length||g.state.progress||g.waitMinutes||session.logistics?.pending)throw Error('Select an idle group in a sector for first aid.');
 const sector=g.state.position;
 if(session.groups.some(q=>q.firstAid?.sector===sector))throw Error('First aid is already underway in this sector.');
 const doctor=g.state.members.filter(u=>living(u)&&sectorMedicalCharges(u)>0).sort((a,b)=>(b.stats?.medical??1)-(a.stats?.medical??1))[0];
 if(!doctor)throw Error('A conscious mercenary with a medical kit is required.');
 const patients=session.groups.filter(q=>present(q,sector)).flatMap(q=>q.state.members).filter(u=>living(u)&&(u.hp??mercMaxHp(u))<mercMaxHp(u)).map(u=>({id:u.id,hp:u.hp,maxHp:mercMaxHp(u)}));
 if(!patients.length)throw Error('No wounded mercenaries in this sector need first aid.');
 const skill=Math.max(1,Math.min(100,doctor.stats?.medical??1));
 consumeSectorMedical(doctor);g.firstAid={sector,doctorId:doctor.id,skill,startedAt:session.clock.minutes,duration:firstAidMinutes(skill),patients};
}
export function updateFirstAid(session){
 for(const g of session.groups){const a=g.firstAid;if(!a)continue;
  const doctor=g.state.members.find(u=>u.id===a.doctorId);
  if(!doctor||!living(doctor)||!present(g,a.sector)){delete g.firstAid;continue;}
  const fraction=Math.max(0,Math.min(1,(session.clock.minutes-a.startedAt)/a.duration));
  a.patients=a.patients.filter(p=>{
   const u=session.groups.filter(q=>present(q,a.sector)).flatMap(q=>q.state.members).find(u=>u.id===p.id);
   if(!u||!living(u))return false;
   u.hp=Math.min(mercMaxHp(u),Math.max(u.hp,p.hp+(p.maxHp-p.hp)*fraction));return true;
  });
  if(fraction===1||!a.patients.length)delete g.firstAid;
 }
}
export function stopFirstAid(session,id){const g=session.groups.find(g=>g.id===id);if(!g?.firstAid)throw Error('This group is not providing first aid.');delete g.firstAid;}
export function interruptFirstAid(session,ids){for(const g of session.groups)if(ids.includes(g.id))delete g.firstAid;}
export function validateFirstAid(session){
 const sectors=new Set();
 for(const g of session.groups){const a=g.firstAid;if(!a)continue;
  if(g.rest||g.training||g.waitMinutes||!present(g,a.sector)||sectors.has(a.sector)||!g.state.members.some(u=>u.id===a.doctorId&&living(u))||!Number.isFinite(a.skill)||a.skill<1||a.skill>100||a.duration!==firstAidMinutes(a.skill)||!Number.isFinite(a.startedAt)||a.startedAt<0||a.startedAt>session.clock.minutes||session.clock.minutes-a.startedAt>=a.duration||!Array.isArray(a.patients)||!a.patients.length||a.patients.length>1024||new Set(a.patients.map(p=>p.id)).size!==a.patients.length)throw Error('Invalid saved first aid assignment.');
  sectors.add(a.sector);
  for(const p of a.patients)if(!session.groups.some(q=>q.state.members.some(u=>u.id===p.id))||!Number.isFinite(p.hp)||p.hp<=0||!Number.isFinite(p.maxHp)||p.maxHp<=p.hp)throw Error('Invalid saved first aid patient.');
 }
}
