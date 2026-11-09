import {blankMap} from './core/maps.js';
import {characterDefaults} from './character-properties.js';
import {loadDialogueCatalog,embedMapDialogues} from './dialogue-data.js';
import {INTRO_DIALOGUE} from './tutorial-mission.js';
// Compact rehearsal of the authored roles. It does not replace the user's plateau.
export async function tutorialIntroFixture(fetcher=fetch){
 const m=blankMap('Plateau tutorial · intro mission rehearsal');
 m.starts=[{x:12,y:13,z:0},{x:13,y:12,z:0},{x:11,y:12,z:0},{x:12,y:11,z:0}].map((p,i)=>({...p,heading:90,character:{...characterDefaults('starts'),id:'char_plateau_rehearsal_merc_'+i}}));
 m.guards=[{x:12,y:12,z:0,species:'donkey',weapon:'hands',heading:90,outfit:'blue-hawaiian',character:{...characterDefaults('guards','npc'),id:'char_plateau_intro_guide',displayName:'Plateau guide',canTalk:true,dialogueRef:INTRO_DIALOGUE}}];
 m.props=[{x:14,y:13,z:0,kind:'supply-chest-closed',tutorialRole:'plateau-explosives'},{x:17,y:8,z:0,kind:'site-radio',tutorialRole:'plateau-radio'},{x:17,y:19,z:0,kind:'site-sam',tutorialRole:'plateau-sam'}];
 m.exits=[{x:12,y:16,z:0}];m.characterResources={dialogues:[INTRO_DIALOGUE]};
 return embedMapDialogues(m,await loadDialogueCatalog(fetcher));
}
