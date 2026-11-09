import {canonicalJSON,dialogueHash,plain,validateDialogue} from './dialogue-schema.js';
import {validateDialogueVariables,variablesMatch} from './dialogue-variables.js';

export const DIALOGUE_FORMULA='dialogue-percentile-1';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const uint=n=>Number.isInteger(n)&&n>=0&&n<=4294967295;
export function createDialogueState(seed){const initialSeed=(seed^0x4449414c)>>>0;return {version:1,initialSeed,checkSeed:initialSeed,revision:0,definitions:{},records:{}};}
export function initializeDialogue(owner,seed=owner.seed){owner.dialogue??=createDialogueState(seed);return owner.dialogue;}
export function ensureDialogueUnitIds(s){for(const u of s.units||[])u.characterId??=u.character?.id||'char_dialogue_'+s.dialogue.initialSeed+'_'+u.team+'_'+u.id;}
export const dialogueActorId=u=>u?.campaignId||u?.characterId;
export const dialogueRecordKey=(npcId,dialogueId)=>JSON.stringify([npcId,dialogueId]);
export const getDialogueRecord=(state,npcId,d)=>state.records[dialogueRecordKey(npcId,d.id)]||{npcId,dialogueId:d.id,facts:{...d.facts},attempts:{},receipts:[]};
export function pinDialogue(state,d){
 validateDialogue(d);const old=state.definitions[d.id];if(old)return old.content;
 state.definitions[d.id]={hash:dialogueHash(d),content:structuredClone(d)};return state.definitions[d.id].content;
}
export const dialogueEntry=(d,record,variables={})=>d.entry.find(e=>!e.when||(e.when.variables?variablesMatch(e.when.variables,variables):record.attempts[e.when.attempt]?.outcome===e.when.is)).node;
export function flavourHash(value){let h=2166136261;for(const byte of new TextEncoder().encode(JSON.stringify(value)))h=Math.imul(h^byte,16777619)>>>0;return h;}
export function dialogueLine(d,nodeId,record,initialSeed,minutes){const n=d.nodes[nodeId];if(!n)return 'Dialogue unavailable.';return Array.isArray(n.npc)?n.npc[flavourHash([initialSeed,record.npcId,d.id,d.version,nodeId,Math.floor(minutes/1440)])%n.npc.length]:n.npc;}
export const factMatches=(f,facts)=>!f||facts[f.id]===f.is;
export function checkChance(check,stats,facts={}){
 const skill=stats?.[check.skill],minimum=check.minimum??1,difficulty=check.difficulty??50;
 if(!Number.isInteger(skill)||skill<1||skill>100)return {valid:false,reason:'Missing or invalid '+check.skill+' skill.'};
 const modifiers=(check.modifiers||[]).filter(m=>factMatches(m.fact,facts)).map(({id,add})=>({id,add})),modifier=clamp(modifiers.reduce((n,m)=>n+m.add,0),-20,20);
 const chance=clamp(Math.floor(50+skill-difficulty+modifier+.5),1,99);
 return {valid:true,skill,minimum,difficulty,modifiers,modifier,chance,eligible:skill>=minimum&&chance>=20};
}
export function choicePreview(d,record,nodeId,choiceId,speaker,revision,variables={}){
 validateDialogueVariables(d,variables);
 const c=d.nodes[nodeId]?.choices?.find(c=>c.id===choiceId);if(!c)return {visible:false,reason:'Unknown choice.'};
 const receipt=record.receipts.find(r=>r.choiceId===c.id),attempt=c.check&&record.attempts[c.check.attemptId];
 const result={visible:false,choice:c,nodeId,revision,speakerId:speaker.id,archetype:speaker.archetype||null};
 if(attempt||c.set&&receipt)return {...result,remembered:attempt||receipt};
 if(c.requires?.archetype&&speaker.archetype!==c.requires.archetype||!factMatches(c.requires?.fact,record.facts)||!variablesMatch(c.requires?.variables,variables))return result;
 const check=c.check?checkChance(c.check,speaker.stats,record.facts):null;
 if(check&&!check.valid)return {...result,diagnostic:check.reason};
 result.visible=!check||check.eligible;result.check=check;
 // Includes author content, NPC, speaker, facts, all inputs and revision. Nothing
 // in inspection advances RNG or writes the saved conversation.
 result.token=canonicalJSON([d,record.npcId,record.facts,nodeId,c.id,speaker.id,speaker.archetype||null,check,revision,variables]);return result;
}
export function percentile(seed){
 if(!uint(seed))throw Error('Invalid dialogue seed.');let value=seed;
 do{value=(Math.imul(value,1664525)+1013904223)>>>0;}while(value>=4294967200);
 return {seed:value,roll:1+value%100};
}
export function percentileOutcome(chance,roll){if(!Number.isInteger(chance)||chance<1||chance>99||!Number.isInteger(roll)||roll<1||roll>100)throw Error('Invalid percentile inputs.');return roll<=chance?'success':'failure';}
// Pure command staging. Caller persists next before installing it. Information-only
// navigation returns no next state. Repeated commands return the recorded receipt.
export function stageDialogue(state,d,npcId,speaker,nodeId,choiceId,token,minutes=0,variables={}){
 return reduceChoice(state,d,npcId,speaker,nodeId,choiceId,token,minutes,true,variables);
}
function reduceChoice(state,d,npcId,speaker,nodeId,choiceId,token,minutes,copy,variables={}){
 d=state.definitions[d.id]?.content||validateDialogue(d);const record=getDialogueRecord(state,npcId,d),preview=choicePreview(d,record,nodeId,choiceId,speaker,state.revision,variables);
 if(preview.remembered)return {receipt:preview.remembered,nodeId:preview.remembered.to,repeated:true};
 if(!preview.visible||preview.token!==token)throw Error('The conversation changed. Review the choices and select again.');
 const c=preview.choice;
 if(!c.check&&!c.set)return {nodeId:c.to};
 const next=copy?structuredClone(state):state;pinDialogue(next,d);const key=dialogueRecordKey(npcId,d.id),r=next.records[key]??=structuredClone(record);let outcome=null,roll=null,to=c.to,set=c.set||{},check=preview.check;
 if(c.check){const draw=percentile(next.checkSeed);next.checkSeed=draw.seed;roll=draw.roll;outcome=percentileOutcome(check.chance,roll);({to,set={}}=c.outcomes[outcome]);}
 const response=c.rollText?.[roll]||dialogueLine(d,to,r,state.initialSeed,minutes);
 const receipt={revision:++next.revision,formula:DIALOGUE_FORMULA,speakerId:speaker.id,archetype:speaker.archetype||null,choiceId:c.id,nodeId,attemptId:c.check?.attemptId||null,contentVersion:d.version,check,roll,outcome,to,set:{...set},response,minutes};
 if(d.variables)receipt.variables={...variables};
 Object.assign(r.facts,set);r.receipts.push(receipt);if(c.check)r.attempts[c.check.attemptId]=receipt;
 return {next,receipt,nodeId:to};
}
export function validateDialogueState(state){
 const fail=()=>{throw Error('Dialogue save is damaged or inconsistent.');};
 if(!plain(state)||state.version!==1||!uint(state.initialSeed)||!uint(state.checkSeed)||!Number.isSafeInteger(state.revision)||state.revision<0||!plain(state.definitions)||!plain(state.records)||Object.keys(state.records).length>10000||Object.keys(state.definitions).length>2048)fail();
 for(const [id,p]of Object.entries(state.definitions)){if(!plain(p)||!plain(p.content)||p.content.id!==id)fail();validateDialogue(p.content);if(p.hash!==dialogueHash(p.content))fail();}
 const replay={version:1,initialSeed:state.initialSeed,checkSeed:state.initialSeed,revision:0,definitions:state.definitions,records:{}},events=[];
 for(const [key,r]of Object.entries(state.records)){
  if(!plain(r)||typeof r.npcId!=='string'||!r.npcId||r.npcId.length>256||key!==dialogueRecordKey(r.npcId,r.dialogueId)||!state.definitions[r.dialogueId]||!plain(r.facts)||!plain(r.attempts)||!Array.isArray(r.receipts)||r.receipts.length>8192)fail();
  for(const receipt of r.receipts)events.push({r,receipt});
 }if(events.length!==state.revision||events.length>100000)fail();events.sort((a,b)=>a.receipt?.revision-b.receipt?.revision);
 let current=replay;
 for(const {r,receipt}of events){
  if(!plain(receipt)||receipt.revision!==current.revision+1||typeof receipt.speakerId!=='string'||!receipt.speakerId||receipt.speakerId.length>256||!Number.isFinite(receipt.minutes)||receipt.minutes<0)fail();
  const d=current.definitions[r.dialogueId].content,c=d.nodes[receipt.nodeId]?.choices?.find(c=>c.id===receipt.choiceId);if(!c)fail();
  const speaker={id:receipt.speakerId,archetype:receipt.archetype,stats:c.check?{[c.check.skill]:receipt.check?.skill}:{}};
  const variables=validateDialogueVariables(d,receipt.variables),rec=getDialogueRecord(current,r.npcId,d),p=choicePreview(d,rec,receipt.nodeId,c.id,speaker,current.revision,variables);
  // Replay owns a disposable accumulator; avoid copying all prior conversations
  // for every receipt as a campaign's history grows.
  const result=reduceChoice(current,d,r.npcId,speaker,receipt.nodeId,c.id,p.token,receipt.minutes,false,variables);
  if(!result.next||canonicalJSON(result.receipt)!==canonicalJSON(receipt))fail();current=result.next;
 }
 if(current.checkSeed!==state.checkSeed||canonicalJSON(current.records)!==canonicalJSON(state.records))fail();return state;
}
export function validateDialogueActors(state,actors){
 const ids=new Set(actors.map(dialogueActorId));
 for(const r of Object.values(state.records))if(!ids.has(r.npcId)||r.receipts.some(receipt=>!ids.has(receipt.speakerId)))throw Error('Dialogue save references a missing character.');
}
