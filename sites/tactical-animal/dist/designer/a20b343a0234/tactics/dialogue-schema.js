import {STAT_DEFINITIONS} from './character-stats.js';
import {WHEEL} from './core/archetypes.js';
import {DIALOGUE_VARIABLES} from './dialogue-variables.js';

export const dialogueToken=/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/;
export const plain=v=>!!v&&Object.getPrototypeOf(v)===Object.prototype;
export const canonicalJSON=v=>JSON.stringify(sort(v));
function sort(v){return Array.isArray(v)?v.map(sort):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
// Synchronous SHA-256 lets the existing synchronous save validator verify pinned
// content too. Input is canonical UTF-8 JSON; test vectors use node:crypto.
export function dialogueHash(value){
 const bytes=new TextEncoder().encode(canonicalJSON(value)),length=Math.ceil((bytes.length+9)/64)*64,b=new Uint8Array(length);b.set(bytes);b[bytes.length]=128;
 const view=new DataView(b.buffer);view.setUint32(length-4,bytes.length*8);const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
 const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 const r=(v,n)=>(v>>>n)|(v<<(32-n)),w=new Uint32Array(64);
 for(let p=0;p<length;p+=64){for(let i=0;i<16;i++)w[i]=view.getUint32(p+i*4);for(let i=16;i<64;i++){const a=w[i-15],c=w[i-2];w[i]=(r(a,7)^r(a,18)^(a>>>3))+w[i-16]+(r(c,17)^r(c,19)^(c>>>10))+w[i-7];}
  let [a,c,d,e,f,g,j,l]=h;for(let i=0;i<64;i++){const t=(l+(r(f,6)^r(f,11)^r(f,25))+((f&g)^(~f&j))+k[i]+w[i])>>>0,u=((r(a,2)^r(a,13)^r(a,22))+((a&c)^(a&d)^(c&d)))>>>0;l=j;j=g;g=f;f=(e+t)>>>0;e=d;d=c;c=a;a=(t+u)>>>0;}
  [a,c,d,e,f,g,j,l].forEach((v,i)=>h[i]=(h[i]+v)>>>0);
 }return h.map(v=>v.toString(16).padStart(8,'0')).join('');
}
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function dialogueDiagnostics(d){try{return inspectDialogue(d);}catch{return {errors:['Malformed dialogue data.'],warnings:[]};}}
function inspectDialogue(d){
 const errors=[],warnings=[],bad=s=>errors.push(s),keys=(v,allowed,label)=>{if(!plain(v)){bad(label+' must be an object.');return false;}for(const k of Object.keys(v))if(!allowed.includes(k)||['__proto__','constructor','prototype'].includes(k))bad(label+': unknown field '+k+'.');return true;};
 const token=(v,label)=>{if(typeof v!=='string'||!dialogueToken.test(v)||['constructor','prototype','__proto__'].includes(v))bad(label+': invalid identifier.');};
 const line=(s,label)=>{if(typeof s!=='string'||!s.trim()||s.length>2000)bad(label+': expected 1–2000 characters.');};
 if(!keys(d,['schemaVersion','id','version','facts','variables','entry','nodes'],'Dialogue'))return {errors,warnings};
 try{if(new TextEncoder().encode(JSON.stringify(d)).length>262144)bad('Dialogue exceeds 256 KiB.');}catch{bad('Dialogue must be JSON data.');return {errors,warnings};}
 token(d.id,'Dialogue ID');if(d.schemaVersion!==1||!integer(d.version,1,Number.MAX_SAFE_INTEGER))bad('Unsupported dialogue schema or content version.');
 if(d.variables!==undefined&&(!Array.isArray(d.variables)||!d.variables.length||new Set(d.variables).size!==d.variables.length||d.variables.some(k=>!DIALOGUE_VARIABLES.includes(k))))bad('Variables must name supported read-only world values.');
 if(d.facts!==undefined&&(!plain(d.facts)||Object.entries(d.facts).some(([k,v])=>!dialogueToken.test(k)||typeof v!=='boolean'||['constructor','prototype'].includes(k))))bad('Facts must be declared boolean values.');
 const facts=plain(d.facts)?d.facts:{},nodes=plain(d.nodes)?d.nodes:{},nodeKeys=Object.keys(nodes),choices=new Set(),attempts=new Set(),targets=[];
 if(!nodeKeys.length||nodeKeys.length>256)bad('A dialogue needs 1–256 nodes.');
 const fact=f=>{if(keys(f,['id','is'],'Fact condition')&&(!Object.hasOwn(facts,f.id)||typeof f.is!=='boolean'))bad('Unknown fact or non-boolean condition.');};
 const variables=v=>{if(!plain(v)||!Object.keys(v).length||Object.entries(v).some(([k,b])=>!d.variables?.includes(k)||typeof b!=='boolean'))bad('Conditions must use declared boolean world variables.');};
 const sets=v=>{if(!plain(v)||!Object.keys(v).length||Object.entries(v).some(([k,b])=>!Object.hasOwn(facts,k)||typeof b!=='boolean'))bad('Effects must assign declared boolean facts.');};
 const target=t=>{token(t,'Destination');targets.push(t);};
 for(const [id,n]of Object.entries(nodes)){
  token(id,'Node');if(!keys(n,['npc','choices'],'Node '+id))continue;
  if(Array.isArray(n.npc)){if(!n.npc.length||n.npc.length>32)bad('Flavour needs 1–32 lines.');n.npc.forEach(s=>line(s,'Flavour'));}else line(n.npc,'NPC line');
  if(n.choices!==undefined&&(!Array.isArray(n.choices)||n.choices.length>32)){bad('Node choices must be an array of at most 32.');continue;}
  for(const c of n.choices||[]){
   if(!keys(c,['id','text','requires','to','set','check','outcomes','rollText'],'Choice'))continue;
   token(c.id,'Choice');if(choices.has(c.id))bad('Duplicate choice '+c.id);choices.add(c.id);line(c.text,'Choice text');
   if(c.requires!==undefined&&keys(c.requires,['archetype','fact','variables'],'Requirements')){if(c.requires.archetype!==undefined&&!WHEEL.includes(c.requires.archetype))bad('Unknown archetype.');if(c.requires.fact!==undefined)fact(c.requires.fact);if(c.requires.variables!==undefined)variables(c.requires.variables);}
   if(c.check!==undefined){
    if(c.to!==undefined||c.set!==undefined)bad('Checked choices use outcomes, not to/set.');
    const ch=c.check;if(keys(ch,['attemptId','skill','minimum','difficulty','modifiers'],'Check')){
     token(ch.attemptId,'Attempt');if(attempts.has(ch.attemptId))bad('Duplicate attempt '+ch.attemptId);attempts.add(ch.attemptId);
     if(!STAT_DEFINITIONS.some(([s])=>s===ch.skill)||!integer(ch.minimum??1,1,100)||!integer(ch.difficulty??50,0,100))bad('Invalid skill, minimum or difficulty.');
     const ids=new Set();if(ch.modifiers!==undefined&&(!Array.isArray(ch.modifiers)||ch.modifiers.length>32))bad('Invalid modifiers.');else for(const m of ch.modifiers||[]){if(!keys(m,['id','fact','add'],'Modifier'))continue;token(m.id,'Modifier');if(ids.has(m.id)||!integer(m.add,-20,20))bad('Duplicate modifier or invalid adjustment.');ids.add(m.id);fact(m.fact);}
    }
    if(keys(c.outcomes,['success','failure'],'Outcomes'))for(const result of ['success','failure']){const o=c.outcomes[result];if(keys(o,['to','set'],result)){target(o.to);if(o.set!==undefined)sets(o.set);}}
    if(c.rollText!==undefined&&keys(c.rollText,['1','100'],'Critical text'))Object.values(c.rollText).forEach(s=>line(s,'Critical text'));
   }else{target(c.to);if(c.set!==undefined)sets(c.set);if(c.outcomes!==undefined||c.rollText!==undefined)bad('Outcomes and critical text require a check.');}
  }
 }
 if(!Array.isArray(d.entry)||!d.entry.length||d.entry.length>256)bad('Entry requires routes and a final unconditional node.');else d.entry.forEach((e,i)=>{if(!keys(e,['when','node'],'Entry'))return;target(e.node);if(i===d.entry.length-1){if(e.when!==undefined)bad('Last entry must be unconditional.');}else if(e.when===undefined)bad('Only final entry can be unconditional.');if(e.when!==undefined&&keys(e.when,['attempt','is','variables'],'Entry condition')){if(e.when.variables!==undefined){variables(e.when.variables);if(e.when.attempt!==undefined||e.when.is!==undefined)bad('Use either a world condition or an attempt condition.');}else if(!attempts.has(e.when.attempt)||!['success','failure'].includes(e.when.is))bad('Unknown entry attempt or result.');}});
 for(const t of targets)if(!Object.hasOwn(nodes,t))bad('Missing branch destination '+t+'.');
 const reached=new Set(),visit=id=>{if(reached.has(id)||!nodes[id])return;reached.add(id);for(const c of nodes[id].choices||[])if(c.check){visit(c.outcomes?.success?.to);visit(c.outcomes?.failure?.to);}else visit(c.to);};for(const e of d.entry||[])visit(e.node);for(const id of nodeKeys)if(!reached.has(id))warnings.push('Unreachable node '+id+'.');
 return {errors,warnings};
}
export function validateDialogue(d){const {errors}=dialogueDiagnostics(d);if(errors.length)throw Error('Dialogue '+(d?.id||'(unnamed)')+': '+errors.join(' '));return d;}
export function dialogueMapErrors(map){
 if(map.dialogueDefinitions===undefined)return [];if(!plain(map.dialogueDefinitions)||Object.keys(map.dialogueDefinitions).length>2048)return ['Invalid dialogue definitions.'];
 return Object.entries(map.dialogueDefinitions).flatMap(([id,d])=>[...(id!==d?.id?['Dialogue definition ID does not match its key.']:[]),...dialogueDiagnostics(d).errors]);
}
export function mergeDialogueDefinitions(map,source){
 const errors=dialogueMapErrors(source);if(errors.length)throw Error(errors.join(' '));
 for(const [id,d]of Object.entries(source.dialogueDefinitions||{})){const old=map.dialogueDefinitions?.[id];if(old&&canonicalJSON(old)!==canonicalJSON(d))throw Error('Conflicting dialogue '+id+'. Rename the imported dialogue and its references, or explicitly replace the resource before importing.');}
 if(source.dialogueDefinitions)map.dialogueDefinitions={...map.dialogueDefinitions,...structuredClone(source.dialogueDefinitions)};
}
