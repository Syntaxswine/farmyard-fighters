// Mercenary hiring (ECONOMY.md, "Mercenary contracts"). Pure: no DOM and no RNG stream. Every draw is a hash of the campaign's
// roster seed, the campaign day and the slot, so a day's slate is reproducible and nothing here moves a bullet or a social roll.
// A candidate's grade (0..1) sets its daily rate on a log scale from $100 to $10,000 and, monotonically, everything it is worth:
// base health, action points, accuracy, medical and stealth; level and the skill points spent by an archetype profile; the kit it
// arrives with. The $100 merc is next to useless; the $10,000 merc is meant to clear a map alone.
import {ARCHETYPES,NAMES,bond,rungOf,opposing,liked} from './archetypes.js';
import {SKILLS,SPECIES_TRAITS,recalculate} from './progression.js';
import {initHappiness} from './happiness.js';

export const RATE_MIN=100,RATE_MAX=10000,SLATE=6,ROSTER_MAX=8,MERC_ID_BASE=1000,DAY_MINUTES=1440,PAY_DAY=10,SURCHARGE=1.2;
// Contract terms: a week is priced about five days, a month about twelve (the boss's ratios); each archetype's commitment shifts that a little.
export const TERMS={day:{label:'Day',minutes:DAY_MINUTES,days:1},week:{label:'Week',minutes:7*DAY_MINUTES,days:5},month:{label:'Month',minutes:30*DAY_MINUTES,days:12}};
// Days added to the week's five (and twice that to the month's twelve): types that want to belong or to keep order discount a long contract; free spirits charge for one.
export const COMMITMENT={Ruler:-.5,Innocent:-.5,Everyman:-.5,Caregiver:-.5,Lover:-.5,Creator:0,Sage:0,Hero:0,Magician:.5,Jester:.5,Explorer:.5,Rebel:.5};
export const RECRUIT_SPECIES=['horse','goat','donkey','sheep','cow','hen','skunk'];
// None of the four comrades, none of the twelve guard names.
export const RECRUIT_NAMES=['Arkady','Bogdan','Darya','Dmitri','Fyodor','Galina','Gleb','Ilya','Inna','Irina','Kirill','Klara','Larisa','Lyudmila','Maksim','Marina','Matvei','Natasha','Nadia','Nikita','Oksana','Olga','Polina','Raisa','Roman','Semyon','Sonya','Stepan','Svetlana','Tamara','Timur','Valentin','Varvara','Yelena','Zhenya','Zoya'];
// What the candidate says across the table, in the archetype's register.
export const PITCH={Innocent:'I do what I am told and I do not complain. Mostly.',Everyman:'I turn up, I do the shift, I go home. That is the whole offer.',Hero:'Point me at the hardest door you have.',Caregiver:'Somebody has to bring them all back. That is me.',Explorer:'I will take the job if it goes somewhere I have not been.',Rebel:'I do not salute. I do shoot. Decide which matters.',Lover:'Keep me close to the others and I will not let one of them fall.',Creator:'Show me the plan. I will show you where it breaks.',Jester:'I am cheaper than a funeral and funnier than one.',Sage:'I have read the ground. Ask me before you walk it.',Magician:'You do not need more guns. You need the guards moving where you want.',Ruler:'You will want someone who keeps the count when it goes wrong.'};

const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
// FNV-style, like drawArchetype: a string per draw, folded, mixed, unsigned.
export function hash(...parts){let h=0x811c9dc5;for(const c of parts.join('|'))h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;h^=h>>>16;h=Math.imul(h,0x45d9f3b)>>>0;return (h^(h>>>16))>>>0;}
const unit=h=>h/4294967296;

// The daily rate: $100 x 100^grade, on a clean figure (tens under a thousand, hundreds under ten thousand).
export function rateFor(grade){const raw=RATE_MIN*Math.pow(RATE_MAX/RATE_MIN,clamp(grade)),step=raw<1000?10:raw<10000?100:1000;return Math.min(RATE_MAX,Math.max(RATE_MIN,Math.round(raw/step)*step));}
// The three prices for a daily rate and an archetype's commitment: the day, the week (about five days), the month (about twelve).
export function pricesFor(rate,archetype){const c=COMMITMENT[archetype]??0,week=TERMS.week.days+c,month=TERMS.month.days+2*c;return {day:{...TERMS.day,price:Math.round(rate)},week:{...TERMS.week,days:week,price:Math.round(rate*week)},month:{...TERMS.month,days:month,price:Math.round(rate*month)}};}

// What the rate buys. The base stats a grade-0 recruit is built on, and a grade-1 recruit's; the four comrades (100 / 12 / 85 / 20) sit between grades .40 and .45.
export const BASE_LOW={hp:60,ap:9,accuracy:55,medical:0,stealth:10},BASE_HIGH={hp:160,ap:16,accuracy:115,medical:60,stealth:60};
export const baseFor=grade=>Object.fromEntries(Object.keys(BASE_LOW).map(k=>[k,Math.round(BASE_LOW[k]+(BASE_HIGH[k]-BASE_LOW[k])*clamp(grade))]));
export const levelFor=grade=>1+Math.round(9*clamp(grade));
// How each archetype spends its points (weights); the greedy spread below keeps every skill near its share.
export const PROFILES={Hero:{shooting:3,vitality:2,mobility:1},Ruler:{shooting:2,mobility:2,vitality:1,medical:1},Caregiver:{medical:3,vitality:2,shooting:1},Sage:{shooting:3,stealth:2,medical:1},Explorer:{mobility:3,stealth:2,shooting:1},Rebel:{shooting:2,mobility:2,vitality:2},Magician:{stealth:3,shooting:2,mobility:1},Creator:{shooting:2,medical:2,vitality:2},Jester:{mobility:2,stealth:2,shooting:2},Lover:{medical:2,vitality:2,shooting:2},Innocent:{vitality:3,medical:2,stealth:1},Everyman:{shooting:2,vitality:2,medical:1,mobility:1}};
export function skillsFor(grade,archetype,species,base=baseFor(grade)){
 const skills=Object.fromEntries(Object.keys(SKILLS).map(k=>[k,0])),profile=PROFILES[archetype]||PROFILES.Everyman,total=Object.values(profile).reduce((n,w)=>n+w,0),t=SPECIES_TRAITS[species]||{stealth:0};
 const capped=k=>skills[k]>=20||k==='medical'&&base.medical+skills.medical*5>=100||k==='stealth'&&base.stealth+t.stealth+skills.stealth*5>=100; // the same caps train() enforces
 for(let points=3*(levelFor(grade)-1);points>0;points--){const open=Object.keys(profile).filter(k=>!capped(k));if(!open.length)break;
  open.sort((a,b)=>(profile[b]/total-skills[b]/(3*9))-(profile[a]/total-skills[a]/(3*9))||a.localeCompare(b));skills[open[0]]++;}
 return skills;}
// The kit ladder: what the candidate walks in with, by grade. Slot weapons arrive loaded; `reserve` is the ammunition in the pack.
export const KITS=[
 {min:0,weapon:'knife',slots:['knife',null],reserve:{},medkits:0,cutters:false},
 {min:.15,weapon:'pistol',slots:['pistol','knife'],reserve:{pistol:8},medkits:1,cutters:false},
 {min:.35,weapon:'rifle',slots:['rifle','pistol'],reserve:{rifle:10,pistol:8},medkits:1,cutters:true},
 {min:.55,weapon:'assault',slots:['assault','pistol'],reserve:{assault:60,pistol:16},medkits:2,cutters:true},
 {min:.75,weapon:'sniper',slots:['sniper','assault'],reserve:{sniper:10,assault:60},medkits:2,cutters:true},
 {min:.9,weapon:'sniper',slots:['sniper','assault'],extra:['grenade'],reserve:{sniper:15,assault:90,grenade:3},medkits:3,cutters:true}];
export const kitFor=grade=>[...KITS].reverse().find(k=>clamp(grade)>=k.min);

// A candidate from a spec: the same builder serves the day's slate (hashed) and the balance instrument (a chosen grade).
export function build({name,species,archetype,grade,key=null,day=null,index=null}){
 grade=clamp(grade);const base=baseFor(grade),rate=rateFor(grade);
 return {key,day,index,name,species,archetype,grade,rate,base,level:levelFor(grade),skills:skillsFor(grade,archetype,species,base),kit:kitFor(grade),commitment:COMMITMENT[archetype]??0};}
// Slot `index` of a day's slate: grades are stratified (slot i draws inside [i/6,(i+1)/6)), so every day offers a cheap hand and a dear one.
export function candidate(seed,day,index,names=RECRUIT_NAMES){
 const h=salt=>hash(seed>>>0,day,index,salt);
 return build({key:`${day}:${index}`,day,index,grade:(index+unit(h('grade')))/SLATE,archetype:NAMES[h('archetype')%NAMES.length],species:RECRUIT_SPECIES[h('species')%RECRUIT_SPECIES.length],name:names[h('name')%names.length]});}
// The day's slate, names unique among themselves and against `taken` (the roster): a taken name walks forward through the pool, and when the
// pool has run dry (every name once on the roster stays taken: the ledger is keyed by name) the name takes a numeral (Marina II). The caller
// leaves today's own hires out of `taken`, so signing one candidate never renames another card on the same day (review round 1).
const ROMAN=['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'],numeral=k=>ROMAN[k]||String(k);
export function slate(seed,day,{taken=new Set(),count=SLATE}={}){
 const used=new Set(taken),out=[];
 for(let i=0;i<count;i++){const c=candidate(seed,day,i);let n=RECRUIT_NAMES.indexOf(c.name);for(let tries=0;used.has(RECRUIT_NAMES[n])&&tries<RECRUIT_NAMES.length;tries++)n=(n+1)%RECRUIT_NAMES.length;let name=RECRUIT_NAMES[n];for(let k=2;used.has(name);k++)name=RECRUIT_NAMES[n]+' '+numeral(k);c.name=name;used.add(name);out.push(c);}
 return out;}

// Getting along. Types this archetype works well with: liked both ways at the resting level. Types it does not: opposing either way.
export function compatibility(archetype){
 const others=NAMES.filter(t=>t!==archetype);
 return {works:others.filter(t=>liked(bond(archetype,t))&&liked(bond(t,archetype))),clashes:others.filter(t=>opposing(bond(archetype,t))||opposing(bond(t,archetype)))};}
// The predicted rung with each member of the current squad, as labels (GUARDS.md, Recruitment): the lower of the two directions decides the words.
export function fit(archetype,members){
 const rows=members.map(m=>{const mine=bond(archetype,m.archetype),theirs=bond(m.archetype,archetype),low=Math.min(mine,theirs);
  return {name:m.name,mine,theirs,rung:rungOf(low).name,label:liked(low)?`would get on with ${m.name}`:opposing(low)?`would clash with ${m.name}`:low<0?`would grate on ${m.name}`:`would take time with ${m.name}`};});
 const trouble=rows.filter(r=>opposing(r.mine)||opposing(r.theirs)).map(r=>r.name);
 return {rows,trouble,surcharge:trouble.length?SURCHARGE:1};} // a candidate who expects trouble with someone on the roster asks more
export const dailyRate=(c,f)=>Math.round(c.rate*(f?.surcharge??1));

// Apply a candidate to a spawned squad unit (after initInventory and initProgression): base stats, level and skills, the kit.
export function buildRecruit(u,c,weapons){
 u.base={hp:c.base.hp,ap:c.base.ap,accuracy:c.base.accuracy,stealth:c.base.stealth};u.baseMedical=c.base.medical;
 u.level=c.level;u.xp=(c.level-1)*100;u.skillPoints=0;u.skills={...c.skills};recalculate(u);u.hp=u.maxHp;u.ap=u.maxAp;
 const k=c.kit;u.weapon=k.weapon;u.slots=[...k.slots];u.ammo=Object.fromEntries(Object.entries(weapons).map(([n,w])=>[n,w.mag]));
 u.pack=[...new Set([...k.slots.filter(Boolean),...(k.extra||[])])].map(kind=>({type:'weapon',kind,rounds:weapons[kind].mag}));
 for(const [kind,count] of Object.entries(k.reserve))u.pack.push({type:'ammo',kind,count});
 u.medkits=k.medkits;u.wireCutters=k.cutters;u.archetype=c.archetype;u.grade=c.grade;return u;}
// A recruit's ledger: bonds both ways at the archetype matrix's resting level (authored beats derived only where an authored value exists: never for a recruit).
export function recruitSocial(u,members,social=false){
 u.social={stress:0,fatigue:0,bonds:{},resting:{},incidents:{},memories:[],voice:0};
 for(const m of members){if(!m.archetype||m===u)continue;const mine=bond(u.archetype,m.archetype),theirs=bond(m.archetype,u.archetype);u.social.bonds[m.name]=mine;u.social.resting[m.name]=mine;
  if(m.social){m.social.bonds[u.name]=theirs;m.social.resting??={};m.social.resting[u.name]=theirs;}}
 if(social)initHappiness(u);return u;}
// A unit-shaped preview for the card: the numbers a hire would have, without a state to spawn into.
export function previewRecruit(c,weapons){
 const u={name:c.name,species:c.species,stance:'standing',hp:Infinity,ap:Infinity,skills:{},baseMedical:0,cone:0};
 return buildRecruit(u,c,weapons);}
// What the kit reads as on the card.
export function describeKit(c,weapons){
 const parts=[];for(const kind of [...c.kit.slots.filter(Boolean),...(c.kit.extra||[])]){const w=weapons[kind],r=c.kit.reserve[kind];parts.push(w.mag?`${w.name} (${w.mag} loaded${r?`, ${r} reserve`:''})`:w.name);}
 if(c.kit.medkits)parts.push(`${c.kit.medkits} medkit${c.kit.medkits===1?'':'s'}`);if(c.kit.cutters)parts.push('wire cutters');return parts.join(', ')||'nothing';}

// The portrait: the head and shoulders of the standing sprite, a 128-pixel square centred on the figure's axis at the top of its content box.
export const PORTRAIT=128;
export function portraitCrop(frame){return {x:Math.max(0,Math.round(frame.anchor[0]-PORTRAIT/2)),y:Math.max(0,frame.anchor[1]-frame.contentHeight-4),w:PORTRAIT,h:PORTRAIT};}

// Contracts. `until` is a campaign-clock minute; an expired contract walks the merc at the next safe moment (world.js settleContracts).
export const contractMinutesLeft=(u,now)=>u?.contract?Math.max(0,u.contract.until-now):null;
export const contractPrices=u=>u?.hired?pricesFor(u.hired.rate,u.archetype):null;
export function payDay(u){if(!u?.social||!Number.isFinite(u.social.happiness))return 0;const before=u.social.happiness;u.social.happiness=Math.min(100,before+PAY_DAY);return u.social.happiness-before;}
export const describeArchetypeShort=name=>{const a=ARCHETYPES[name];return a?`wants ${a.wants}; fears ${a.fears}; speaks ${a.speaks}`:'';};
