import {canAimAt} from './core/engine.js';
import {personality} from './core/personalities.js';
import {characterTalkStatus} from './character-properties.js';
import {unitBaseHeight} from './tower-geometry.js';
import {dialogueActorId} from './dialogue-state.js';
export const DIALOGUE_COLOURS={Ruler:'#F2C66D',Rebel:'#E89C91',Creator:'#8AD0C2',Caregiver:'#D0AFE0',Innocent:'#F2E9B7',Sage:'#A8C7EB',Explorer:'#C0D58D',Magician:'#B9AFF0',Hero:'#EFB780',Lover:'#ECAEC7',Jester:'#D9CF84',Everyman:'#C7C4BB'};
export const dialogueSpeaker=u=>({id:dialogueActorId(u),archetype:u?.archetype||(u&&personality(u)?.archetype)||null,stats:u?.stats});
const available=u=>u&&u.hp>0&&!u.away&&!u.casualty&&!u.burningTurns&&!u.departing&&!u.unconscious;
export const TALK_RANGE=12;
export function dialogueParticipants(s,npc,speaker){
 const no=reason=>({ok:false,reason});
 if(!available(npc)||!s.units.includes(npc))return no('This character cannot talk now.');
 if(!s.detected.has(npc.id)&&npc.team!=='squad')return no('This character has not been identified.');
 const status=characterTalkStatus(s,npc);if(!status.ok)return status;
 if(!available(speaker)||speaker.team!=='squad'||!s.units.includes(speaker)||!dialogueActorId(speaker))return no('Choose a conscious merc in this sector.');
 if(!dialogueActorId(npc))return no('This character is missing a stable identity.');
 return {ok:true};
}
export function dialoguePosition(s,npc,speaker,{sight=canAimAt}={}){
 if(Math.hypot(speaker.x-npc.x,speaker.y-npc.y)>TALK_RANGE)return {ok:false,reason:'Move within '+TALK_RANGE+' tiles to talk.'};
 if(Math.abs(unitBaseHeight(speaker)-unitBaseHeight(npc))>.3)return {ok:false,reason:'Move onto the same level to talk.'};
 if(!sight(s,speaker,npc))return {ok:false,reason:'No clear sightline to this character.'};
 return {ok:true};
}
export function dialogueReadiness(s,npc,speaker,{busy=false,sight=canAimAt}={}){
 const participants=dialogueParticipants(s,npc,speaker);if(!participants.ok)return participants;
 // Traversal records are historical presentation events, not in-flight flags.
 // The caller supplies the renderer/action coordinator's current busy state.
 if(busy||s.queue?.length)return {ok:false,reason:'Finish movement or the current action first.'};
 return dialoguePosition(s,npc,speaker,{sight});
}
