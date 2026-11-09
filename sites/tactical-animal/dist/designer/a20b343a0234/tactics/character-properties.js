import {mergeDialogueDefinitions} from './dialogue-schema.js';
// Data-only hooks. No field is evaluated as code or changes allegiance implicitly.
export const FACTIONS=['player','red-hats','civilians','unaffiliated'];
export const COMBAT_BEHAVIORS=['fight','cower','flee'];
export const ATTITUDES=['friendly','neutral','hostile'];
export const RESOURCE_TYPES=['dialogues','shopInventories','shopPricing'];
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const token=/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/;
export const newCharacterId=()=> 'char_'+crypto.randomUUID();
export const characters=map=>[...(map.starts||[]).map((p,index)=>({p,index,field:'starts'})),...(map.guards||[]).map((p,index)=>({p,index,field:'guards'}))];
export function characterDefaults(field='guards',category=field==='starts'?'squad':'combat'){
 return {id:newCharacterId(),displayName:'',scriptId:'',category,faction:field==='starts'?'player':'unaffiliated',attitude:field==='starts'?'friendly':category==='npc'?'neutral':'hostile',combatBehavior:category==='npc'?'cower':'fight',canTalk:false,dialogueRef:'',canSell:false,shopInventoryRef:'',shopPricingRef:'',references:[]};
}
export function ensureCharacterIdentities(map){for(const {p,field}of characters(map))if(p.character===undefined)p.character=characterDefaults(field);return map;}
export const characterName=(p,fallback='Unnamed character')=>p.character?.displayName||p.character?.scriptId||fallback;
export function characterErrors(map){
 const errors=[],ids=new Set(),scripts=new Set();
 for(const {p,field,index}of characters(map)){
  const c=p.character;if(c===undefined)continue;const label=`${field==='starts'?'Squad':'Character'} ${index+1}`;
  if(!plain(c)){errors.push(label+': invalid character properties.');continue;}
  if(typeof c.id!=='string'||!/^char_[a-zA-Z0-9_-]{1,80}$/.test(c.id)||ids.has(c.id))errors.push(label+': missing, invalid or duplicate internal character ID.');ids.add(c.id);
  if(typeof c.displayName!=='string'||c.displayName.length>100)errors.push(label+': display name must be at most 100 characters.');
  if(typeof c.scriptId!=='string'||c.scriptId&&!token.test(c.scriptId))errors.push(label+': Script ID must start with a letter and use letters, numbers, underscores or hyphens (80 characters maximum).');
  if(c.scriptId&&scripts.has(c.scriptId))errors.push(label+': duplicate Script ID '+c.scriptId+'.');if(c.scriptId)scripts.add(c.scriptId);
  if(c.combatBehavior!==undefined&&!COMBAT_BEHAVIORS.includes(c.combatBehavior))errors.push(label+': choose fight, cower or flee.');
  if(!FACTIONS.includes(c.faction)||!ATTITUDES.includes(c.attitude)||!['squad','combat','npc'].includes(c.category))errors.push(label+': choose a listed faction, attitude and placement category.');
  if(typeof c.canTalk!=='boolean'||typeof c.canSell!=='boolean')errors.push(label+': capability flags must be checkboxes.');
  for(const key of ['dialogueRef','shopInventoryRef','shopPricingRef'])if(typeof c[key]!=='string'||c[key]&&!token.test(c[key]))errors.push(label+': invalid '+key+'. Use a readable resource identifier, not code or a URL.');
  if(!Array.isArray(c.references)||c.references.length>64||c.references.some(r=>!plain(r)||typeof r.role!=='string'||!token.test(r.role)||typeof r.targetId!=='string'||r.targetId.length>90))errors.push(label+': character links require a role and an internal target ID (maximum 64 links).');
  if(c.model!==undefined&&c.model!==(p.species||['horse','goat','donkey','sheep'][index])+'-10k')errors.push(label+': unsupported model for this species.');
  if(c.visualVariant!==undefined&&c.visualVariant!=='default')errors.push(label+': unsupported visual variant.');
 }
 if(map.characterResources!==undefined){if(!plain(map.characterResources))errors.push('Invalid character resource catalog.');else for(const type of RESOURCE_TYPES){const list=map.characterResources[type]||[];if(!Array.isArray(list)||list.length>2048||list.some(id=>typeof id!=='string'||!token.test(id))||new Set(list).size!==list.length)errors.push('Invalid or duplicate '+type+' resource identifiers.');}}
 return errors;
}
export function characterDiagnostics(map){
 const rows=characters(map),ids=new Set(rows.map(r=>r.p.character?.id)),out=[];
 for(const {p,index}of rows){const c=p.character;if(!plain(c))continue;const name=characterName(p,'Character '+(index+1));
  for(const [on,key,type]of [[c.canTalk,'dialogueRef','dialogues'],[c.canSell,'shopInventoryRef','shopInventories'],[c.canSell,'shopPricingRef','shopPricing']])if(on&&!map.characterResources?.[type]?.includes(c[key]))out.push(name+': missing '+type+' reference '+(c[key]||'(not set)')+'.');
  for(const r of c.references||[])if(!ids.has(r.targetId))out.push(name+': missing character for link '+r.role+'.');
 }return out;
}
export function knownCharacterReferences(map,id){return characters(map).flatMap(({p,index})=>(p.character?.references||[]).filter(r=>r.targetId===id).map(r=>({name:characterName(p,'Character '+(index+1)),role:r.role})));}
export function copyCharacters(rows,destination){
 const ids=new Map(rows.filter(p=>p.character).map(p=>[p.character.id,newCharacterId()])),used=new Set(characters(destination).map(r=>r.p.character?.scriptId).filter(Boolean));
 return rows.map(p=>{const copy=structuredClone(p),c=copy.character;if(!c)return copy;c.id=ids.get(c.id);if(c.scriptId){const base=c.scriptId;let n=2;while(used.has(c.scriptId))c.scriptId=base.slice(0,70)+'_'+n++;used.add(c.scriptId);}c.references=c.references.map(r=>({...r,targetId:ids.get(r.targetId)||r.targetId}));return copy;});
}
export function copyBlockCharacters(block,destination){const d=structuredClone(block);ensureCharacterIdentities(d);d.guards=copyCharacters(d.guards,destination);return d;}
export function mergeCharacterResources(map,source){mergeDialogueDefinitions(map,source);if(!source.characterResources)return;map.characterResources??={};for(const type of RESOURCE_TYPES)map.characterResources[type]=[...new Set([...(map.characterResources[type]||[]),...(source.characterResources[type]||[])])];}
export function applyRuntimeCharacter(unit,source){if(source?.patrol?.length)unit.patrol=structuredClone(source.patrol);if(!source?.character)return;unit.character=structuredClone(source.character);unit.characterId=source.character.id;if(source.character.displayName)unit.name=source.character.displayName;}

// Allegiance does not change controller ownership: NPCs remain autonomous.
export const combatBehavior=u=>u.character?.combatBehavior||(u.character?.category==='npc'?'cower':'fight');
export function hostileToPlayer(s,u){
 if(u.team!=='guard')return false;
 if(u.hostileToPlayer)return true;
 if(!u.character)return true;
 const faction=u.character.faction;
 if(faction!=='unaffiliated'&&s.units.some(p=>p.team==='squad'&&(p.character?.faction||'player')===faction))return false;
 return u.character.attitude==='hostile';
}
export const playerThreat=(s,u)=>hostileToPlayer(s,u)&&combatBehavior(u)==='fight';
export function provokeCharacter(s,u,source){if(u?.team==='guard'&&u.character&&source?.team==='squad'){u.hostileToPlayer=true;u.character.attitude='hostile';}}

// Shared readiness hook for the future dialogue interaction system.
export function characterTalkStatus(s,u){
 if(!u?.character?.canTalk)return {ok:false,reason:'This character has no dialogue configured'};
 if(u.npcFrightened||s.engaged||['player','enemy'].includes(s.phase)||s.units.some(g=>g.hp>0&&playerThreat(s,g)&&(g.alert||['alert','searching','suspicious','broken'].includes(g.state))))return {ok:false,reason:'Too frightened to talk until the fighting is over'};
 if(hostileToPlayer(s,u))return {ok:false,reason:'This character is hostile toward the player'};
 return {ok:true,dialogueRef:u.character.dialogueRef};
}
