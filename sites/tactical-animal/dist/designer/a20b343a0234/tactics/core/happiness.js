// G5 happiness and quitting (GUARDS.md). A merc's happiness is a 0..100 meter apart from stress (combat) and fatigue (rest debt).
// It is settled whenever the campaign clock advances, pro rata: opposing partners (rung resented or feud) on the same local map cost
// 5 per 24 clock hours each; with none present the merc recovers 5 a day, or 10 when every opposing partner is deployed elsewhere;
// liked partners present add 5 (bonded) or 2 (trusted) a day. Twenty-four consecutive hours at exactly zero and the merc quits at the
// next safe moment. Guards have no meter. This module is pure: units in, log lines out; the clock is the campaign clock in minutes.
import {rungOf,opposing,RUNGS} from './archetypes.js';

export const DAY=1440,DECAY_PER_DAY=5,CALM_PER_DAY=5,APART_PER_DAY=10,LIKED_PER_DAY={bonded:5,trusted:2},QUIT_HOURS=24,CLEAN_WIN=5,RUNG_UP=5;
// A partner's loss, by the rung in force at that moment (decision 4: cautious 10 stress, strained 5, resented none, feud relief).
export const PARTNER_DEATH={bonded:{happiness:75,stress:25},trusted:{happiness:35,stress:15},'cautious trust':{happiness:0,stress:10},strained:{happiness:0,stress:5},resented:{happiness:0,stress:0},feud:{happiness:0,stress:-10}};
export const PARTNER_CAPTURED={bonded:20,trusted:10},PARTNER_RESCUED={bonded:15,trusted:5},PARTNER_QUIT={bonded:15,trusted:5},STABILIZED_RELIEF={bonded:5,trusted:3};
export const KILLER_GRUDGE={bonded:2,trusted:1.5},KILLER_BOND={bonded:40,trusted:20},GRUDGE_STEP=20;

const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));
export const onContract=u=>u.team==='squad'&&!['dead','captured','quit'].includes(u.casualty);
export const hasMeter=u=>!!u?.social&&Number.isFinite(u.social.happiness);
export const bondTo=(u,p)=>u.social?.bonds?.[p.name]??0;
const rungIndex=b=>RUNGS.findIndex(r=>r.name===rungOf(b).name);
// The other mercs still on contract. Guards never carry a meter, so they are never partners.
export const partners=(u,units)=>units.filter(p=>p!==u&&hasMeter(p)&&onContract(p));
function change(u,delta){const before=u.social.happiness;u.social.happiness=clamp(before+delta);return u.social.happiness-before;}
function remember(u,text){if(!u.social.memories)return;u.social.memories.unshift(text);u.social.memories.length=Math.min(8,u.social.memories.length);}

// Per partner: the best rung the pair has reached, the rung it stands at, and since when (campaign minutes). A rise pays when it is new ground or
// the pair held the lower rung for a day or more, so a wobble across one boundary pays nothing and a real fall followed by reconciliation pays again.
export const RECONCILE_MINUTES=DAY;
export const rungMemory=(idx,now=0)=>({best:idx,at:idx,since:now});
export function initHappiness(u){u.social.happiness=100;u.social.zeroSince=null;u.social.rungSeen=Object.fromEntries(Object.entries(u.social.bonds||{}).map(([n,b])=>[n,rungMemory(rungIndex(b))]));}
export const quitHoursLeft=(u,now)=>u?.social?.zeroSince==null?null:Math.max(0,QUIT_HOURS-(now-u.social.zeroSince)/60);

// One settlement covering `minutes` of campaign clock that ends at `now`. mapOf(u) names the local map the merc counts as on (a waiting
// crosser: its destination). The rung bonus is instantaneous at the start of the interval; the rest is a constant rate over it, so the
// moment the meter empties is the crossing of that line, stamped where it falls inside the interval: a 48-hour rest and two 24-hour rests
// agree to the minute (Codex's review). A meter an event emptied before the interval is stamped at the interval's start; zero minutes
// stamps `now`.
export function settleHappiness(units,minutes,now,mapOf=()=>'here'){
 const lines=[],quitting=[],days=Math.max(0,minutes||0)/DAY;
 for(const u of units){if(!hasMeter(u)||!onContract(u))continue;const m=u.social,here=mapOf(u),ps=partners(u,units);
  const opp=ps.filter(p=>opposing(bondTo(u,p))),oppHere=opp.filter(p=>mapOf(p)===here);
  let rate=-DECAY_PER_DAY*oppHere.length,bonus=0; // rate per day, bonus at the start
  if(!oppHere.length)rate+=opp.length?APART_PER_DAY:CALM_PER_DAY; // one rate, two tiers (decision 2)
  for(const p of ps)if(mapOf(p)===here){const r=rungOf(bondTo(u,p)).name;if(LIKED_PER_DAY[r])rate+=LIKED_PER_DAY[r];}
  const delta=rate*days;
  // A partner's rung rising lifts the meter when the rise is new ground for the pair, or ends a day or more at the lower rung (reconciliation);
  // the rise itself came from a hand-over, a rescue or rest. A wobble across one boundary pays nothing.
  for(const p of ps){if(!m.rungSeen)continue;const idx=rungIndex(bondTo(u,p)),st=m.rungSeen[p.name];
   if(!st||typeof st!=='object'){m.rungSeen[p.name]=rungMemory(idx,now);continue;}
   if(idx===st.at)continue;
   if(idx<st.at&&(idx<st.best||now-st.since>=RECONCILE_MINUTES)){bonus+=RUNG_UP;lines.push(`${u.name} is glad of ${p.name}: ${RUNGS[idx].name}.`);}
   if(idx<st.best)st.best=idx;st.at=idx;st.since=now;}
  const start=now-Math.max(0,minutes||0),h0=clamp(m.happiness+bonus);let h=clamp(h0+delta);
  if(h0>0&&rate<0&&h0+delta<=0){h=0;m.zeroSince=start+h0/(-rate)*DAY;} // emptied inside the interval: the crossing, to the minute
  else if(h===0)m.zeroSince??=start;                                    // emptied before it (an event), or still empty: the earliest moment this settle can know
  m.happiness=h;
  if(m.happiness>0){m.zeroSince=null;u.quitPending=false;} // the timer resets the moment the meter rises, and so does the decision to walk
  else if(now-m.zeroSince>=QUIT_HOURS*60&&!u.quitPending){u.quitPending=true;const names=oppHere.map(p=>p.name).join(' and ')||'the squad';lines.push(`${u.name} has had enough of ${names} (${Math.round((now-m.zeroSince)/60)} hours at zero).`);quitting.push(u);}
 }
 return {lines,quitting};
}

// A partner lost to death, capture or quitting: the survivors settle at the rung in force now, resting level ignored (a feud partner's
// death is relief). A squadmate's bullet as the cause: the survivor's grudge against the killer rises at 2x (trusted 1.5x) and its bond
// toward the killer drops a further 40 (trusted 20), decision 4.
export function partnerLost(units,lost,cause,killer=null){const lines=[];
 for(const u of partners(lost,units)){const r=rungOf(bondTo(u,lost)).name,m=u.social;
  if(cause==='dead'){const d=PARTNER_DEATH[r];change(u,-d.happiness);m.stress=clamp(m.stress+d.stress);remember(u,`${lost.name} died.`);
   if(d.happiness>=75)lines.push(`${u.name} has not spoken since ${lost.name} died.`);else if(d.happiness)lines.push(`${u.name} takes ${lost.name}'s death hard.`);else if(d.stress<0)lines.push(`${u.name} will not mourn ${lost.name}.`);
   if(killer&&killer.team==='squad'&&killer!==u&&killer!==lost&&KILLER_BOND[r]){const inc=m.incidents[killer.name]||={hits:0,damage:0,grudge:0};inc.grudge=clamp(inc.grudge+GRUDGE_STEP*KILLER_GRUDGE[r]);m.bonds[killer.name]=clamp((m.bonds[killer.name]??0)-KILLER_BOND[r],-100,100);lines.push(`${u.name} holds ${killer.name} responsible for ${lost.name}.`);}}
  else if(cause==='captured'){if(PARTNER_CAPTURED[r]){change(u,-PARTNER_CAPTURED[r]);remember(u,`${lost.name} was taken.`);lines.push(`${u.name} cannot stop thinking about ${lost.name}.`);}}
  else if(cause==='quit'){if(PARTNER_QUIT[r]){change(u,-PARTNER_QUIT[r]);remember(u,`${lost.name} walked out.`);}}
 }
 return lines;}
// The rescue facility is not built; the hook is here for when it is (decision 3: net -5 after a rescue).
export function partnerRescued(units,rescued){const lines=[];for(const u of partners(rescued,units)){const r=rungOf(bondTo(u,rescued)).name;if(PARTNER_RESCUED[r]){change(u,PARTNER_RESCUED[r]);lines.push(`${u.name} has ${rescued.name} back.`);}}return lines;}
// The medic who stabilizes a liked partner feels the relief (on top of the patient's bond gain).
export function stabilizedPartner(medic,patient){if(!hasMeter(medic))return 0;const r=rungOf(bondTo(medic,patient)).name;return STABILIZED_RELIEF[r]?change(medic,STABILIZED_RELIEF[r]):0;}
// A contact won with no squad casualty lifts everyone still on contract.
export function cleanWin(units){let n=0;for(const u of units)if(hasMeter(u)&&onContract(u)){change(u,CLEAN_WIN);n++;}return n;}
