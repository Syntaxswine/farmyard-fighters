import {blankMap} from './core/maps.js';
import {characterDefaults} from './character-properties.js';
import {loadDialogueCatalog,embedMapDialogues} from './dialogue-data.js';
export async function dialogueFixture(fetcher=fetch){
 const m=blankMap('Dialogue rehearsal · invented bomb conversation');
 m.starts=[{x:12,y:13,z:0},{x:13,y:12,z:0},{x:11,y:12,z:0},{x:12,y:11,z:0}].map((p,i)=>({...p,heading:90,character:{...characterDefaults('starts'),id:'char_dialogue_merc_'+i}}));
 m.guards=[{x:12,y:12,z:0,species:'sheep',weapon:'hands',heading:90,character:{...characterDefaults('guards','npc'),id:'char_762dfca8-0d52-44a3-b19a-73edc239eff4',displayName:'Nadia — Yard warden',scriptId:'yard_bomb_warden',faction:'civilians',canTalk:true,dialogueRef:'yard_bomb_permission'}},
 {x:15,y:12,z:0,species:'goat',weapon:'hands',heading:180,outfit:'red-hats',character:{...characterDefaults('guards','npc'),id:'char_yard_worker',displayName:'Yard worker',faction:'red-hats',attitude:'friendly',canTalk:true,dialogueRef:'yard_worker_flavour'}}];
 m.exits=[{x:12,y:15,z:0}];m.characterResources={dialogues:['yard_bomb_permission','yard_worker_flavour']};return embedMapDialogues(m,await loadDialogueCatalog(fetcher));
}
