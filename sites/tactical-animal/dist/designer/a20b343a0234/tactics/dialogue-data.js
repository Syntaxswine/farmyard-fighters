import {dialogueToken,plain,validateDialogue,mergeDialogueDefinitions} from './dialogue-schema.js';
export function validateDialogueManifest(m){if(!plain(m)||m.schemaVersion!==1||!Array.isArray(m.dialogues)||m.dialogues.length>2048||new Set(m.dialogues.map(d=>d.id)).size!==m.dialogues.length||m.dialogues.some(d=>!plain(d)||!dialogueToken.test(d.id)||!Number.isSafeInteger(d.version)||d.version<1||Object.keys(d).some(k=>!['id','version'].includes(k))))throw Error('Invalid dialogue manifest.');return m;}
export async function loadDialogueCatalog(fetcher=fetch){
 const read=async name=>{const r=await fetcher(new URL('./dialogues/'+name,import.meta.url));if(!r.ok)throw Error('Dialogue content could not load (HTTP '+r.status+').');return r.json();};
 const manifest=validateDialogueManifest(await read('manifest.json')),definitions={},errors={};
 await Promise.all(manifest.dialogues.map(async entry=>{try{const d=validateDialogue(await read(entry.id+'.json'));if(d.id!==entry.id||d.version!==entry.version)throw Error('Dialogue manifest version mismatch.');definitions[d.id]=d;}catch(e){errors[entry.id]=e.message;}}));
 return {definitions,errors};
}
export function resolveDialogue(map,state,id,catalog){
 const d=state?.definitions[id]?.content||map.dialogueDefinitions?.[id]||catalog?.definitions[id];
 if(!d)throw Error(catalog?.errors[id]||'Missing dialogue reference: '+(id||'(not set)')+'.');return validateDialogue(d);
}
export function embedMapDialogues(map,catalog,{strict=true}={}){
 const out=structuredClone(map),definitions={};
 for(const p of [...(map.starts||[]),...(map.guards||[])]){const c=p.character;if(c?.canTalk&&c.dialogueRef){try{definitions[c.dialogueRef]=resolveDialogue(map,null,c.dialogueRef,catalog);}catch(e){if(strict)throw e;}}}
 if(Object.keys(definitions).length)mergeDialogueDefinitions(out,{dialogueDefinitions:definitions});return out;
}
