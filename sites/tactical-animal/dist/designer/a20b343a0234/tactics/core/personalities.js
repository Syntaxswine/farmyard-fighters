// Authored people, independent of species bonuses. Social rolls never consume ballistic RNG.
import {ARCHETYPES,rungOf,retaliationScale,describeArchetype} from './archetypes.js';
import {initHappiness} from './happiness.js';
export const PERSONALITIES={
 Yakov:{archetype:'Ruler',background:'A former shift foreman who still counts heads before leaving a room.',motivation:'Bring everyone home. Earn authority by taking responsibility.',temperament:'Protective, disciplined, dry; repeated carelessness breaks his patience.',aggression:35,pride:40,discipline:85,forgiveness:60,loyalty:90,humor:65,bonds:{Misha:30,Anya:5,Vera:25},quip:['Check your lane. I am still using this body.','We discussed which side of me the enemy stands on.'],repeat:['Same mistake twice. Start paying attention.'],retaliate:['You want my attention? You have it.'],thanks:'Good hands. I owe you another shift.'},
 Anya:{archetype:'Rebel',background:'A courier who carried strike messages through checkpoints and learned never to look frightened.',motivation:'Keep her freedom, and never let anyone mistake trust for obedience.',temperament:'Quick, proud, irreverent; warm with friends and touchy about disrespect.',aggression:80,pride:90,discipline:35,forgiveness:25,loyalty:55,humor:85,bonds:{Yakov:5,Misha:-10,Vera:40},quip:['Lovely. Shall I wear a target next time?','Wrong uniform, genius.'],repeat:['Again? Tell me that was an accident.'],retaliate:['Try that again. Actually, let me.'],thanks:'Stay close, all right? Just this once.'},
 Misha:{archetype:'Creator',background:'A maintenance fitter who remembers every broken promise as clearly as every missing tool.',motivation:'Build something that lasts, with people who do what they say.',temperament:'Methodical, deadpan, slow to anger; keeps a long account of injuries.',aggression:45,pride:65,discipline:75,forgiveness:20,loyalty:70,humor:40,bonds:{Yakov:35,Anya:-10,Vera:20},quip:['That repair is coming out of your share.','Noted. In permanent ink.'],repeat:['That is another entry in the ledger.'],retaliate:['Account settled.'],thanks:'I remember who fixes things, too.'},
 Vera:{archetype:'Caregiver',background:'An infirmary worker who used to hide injured strikers from the factory police.',motivation:'Protect people who cannot protect themselves, even when they make it difficult.',temperament:'Compassionate, stubborn, quietly fierce; forgiveness has limits.',aggression:25,pride:45,discipline:70,forgiveness:85,loyalty:95,humor:25,bonds:{Yakov:25,Anya:35,Misha:20},quip:['Breathe. Then aim. In that order.','I cannot bandage everyone and dodge you.'],repeat:['I forgave the first one. Do not ask again.'],retaliate:['Enough. You are endangering everyone.'],thanks:'Thank you. It is strange being on this side of the bandage.'}
};
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));
export const personality=u=>PERSONALITIES[u.personalityId];
// G4: a guard under the campaign knob keeps the same ledger as a merc (stress, bonds, incidents); its bonds start at the archetype matrix, filled in when first needed.
export function initGuardSocial(g){g.social={stress:0,fatigue:0,bonds:{},incidents:{},memories:[],voice:0};}
// The social stream: never the ballistic one, so no social roll moves a bullet.
export function socialRoll(s){s.socialSeed=(Math.imul(s.socialSeed??(s.seed^0x9e3779b9),1664525)+1013904223)>>>0;return s.socialSeed/4294967296;}
// What the friendly-fire formula reads: the authored personality for a merc, the archetype's traits and hit lines for a guard.
export function disposition(u){const p=personality(u);if(p)return p;const a=ARCHETYPES[u?.archetype];if(!a)return null;const [quip,repeat,retaliate]=a.hit;return {...a.traits,quip:[quip],repeat:[repeat],retaliate:[retaliate],thanks:a.thanks};}
export function initPersonality(u,social=false){if(!PERSONALITIES[u.name])return;u.personalityId=u.name;u.archetype=personality(u).archetype;u.social={stress:0,fatigue:0,bonds:{...personality(u).bonds},resting:{...personality(u).bonds},incidents:{},memories:[],voice:0};if(social)initHappiness(u);} // the happiness meter (G5) exists only in the campaign, so a plain game stays G4 to the byte
// Rest pulls every bond 10% of the way back toward its resting level per 8 hours (G3 "Levels of getting along"); returns the rungs crossed.
export function driftBonds(u,hours){const m=u.social;if(!m?.resting)return [];const f=1-Math.pow(.9,hours/8),crossed=[]; // 10% of the remaining distance per 8 hours, compounding
 for(const [name,rest] of Object.entries(m.resting)){const b=m.bonds[name]??rest;const next=b+(rest-b)*f;m.bonds[name]=next;const was=rungOf(b).name,now=rungOf(next).name;if(was!==now)crossed.push(`${u.name}'s regard for ${name} ${next>b?'rises':'falls'} to ${now}.`);}
 return crossed;}
function remember(u,text){u.social.memories.unshift(text);u.social.memories.length=Math.min(8,u.social.memories.length);}
export function retaliationChance(u,attacker,damage){const p=disposition(u),m=u.social;if(!p||!m)return 0;const incident=m.incidents[attacker.name];return clamp(p.aggression*.0035+p.pride*.0015-p.discipline*.003-p.forgiveness*.002-p.loyalty*.001+(damage/u.maxHp)*.5+m.stress*.003+(incident?.grudge||0)*.004+Math.min(4,Math.max(0,(incident?.hits||0)-1))*.07-(m.bonds[attacker.name]||0)*.003,0,.95);}
export function friendlyReaction(s,u,attacker,damage,canShoot){
 const p=disposition(u),m=u.social;if(!p||!m)return null;
 const rung=s.rules?.social?retaliationScale(m.bonds[attacker.name]||0):1; // G3: the rung BEFORE this hit's bond loss answers it (bonded never, trusted half, strained 1.5x, resented and feud 2x)
 const incident=m.incidents[attacker.name]||={hits:0,damage:0,grudge:0};incident.hits++;incident.damage+=damage;incident.grudge=clamp(incident.grudge+8+(100-p.forgiveness)*.12);m.stress=clamp(m.stress+10);m.bonds[attacker.name]=clamp((m.bonds[attacker.name]||0)-8-damage/u.maxHp*20,-100,100);
 remember(u,`${attacker.name} hit me for ${damage} damage (incident ${incident.hits}).`);
 const roll=socialRoll(s); // drawn whether or not it can shoot, so the stream is the one G3 pinned
 const retaliate=canShoot&&roll<Math.min(.95,retaliationChance(u,attacker,damage)*rung);
 const lines=retaliate?p.retaliate:incident.hits>1?p.repeat:p.quip;
 const line=lines[(m.voice+++(p.humor>=60?1:0))%lines.length];
 return {speaker:u.name,line,retaliate};
}
export function helped(patient,medic){if(!patient.social)return null;patient.social.bonds[medic.name]=clamp((patient.social.bonds[medic.name]||0)+20,-100,100);patient.social.stress=clamp(patient.social.stress-20);remember(patient,`${medic.name} stopped my bleeding.`);return disposition(patient)?.thanks;}
// Injury uses actual HP lost, so overkill cannot inflate either meter.
export function injuryStrain(u,hpLost){if(!u.social||hpLost<=0)return;const fraction=hpLost/u.maxHp;u.social.stress=clamp(u.social.stress+10+fraction*35);u.social.fatigue=clamp((u.social.fatigue||0)+5+fraction*25);}
// Being shot down is total collapse: the rest debt maxes out and only real rest (restStrain) works it off.
export function collapse(u){if(u.social)u.social.fatigue=100;}
export function killRelief(killer,victim){if(killer?.social&&killer.hp>0&&killer.team!==victim.team)settleStress(killer,15);}
export function restStrain(u,hours){if(!u.social)return;settleStress(u,hours*5);u.social.fatigue=clamp((u.social.fatigue||0)-hours*10);}
export function settleStress(u,amount){if(u.social)u.social.stress=clamp(u.social.stress-amount);}
export function personalityDescription(u){const p=personality(u);if(!u.social||!p&&!u.archetype)return [];return [...(p?[p.background,p.motivation,p.temperament]:[]),`Stress: ${Math.round(u.social.stress)}/100 · Fatigue: ${Math.round(u.social.fatigue||0)}/100.${Number.isFinite(u.social.happiness)?` Happiness: ${Math.round(u.social.happiness)}/100.`:''}`,...(u.archetype?[describeArchetype(u.archetype)]:[]),...Object.entries(u.social.bonds).map(([name,bond])=>`${name}: ${rungOf(bond).name} (${Math.round(bond)}).`),...u.social.memories];}
