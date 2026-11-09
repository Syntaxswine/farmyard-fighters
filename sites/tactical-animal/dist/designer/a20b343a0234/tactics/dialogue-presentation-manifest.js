// Cosmetic sidecar: never changes pinned dialogue content or a campaign checkpoint.
// English (tongue 0) is deliberate; the probe's tongue 7 is not an approved language.
export const PRESENTATION_VERSION='dialogue-voices-1';
export const VOICES={
 guide:{version:1,label:'Plateau guide · warm and worn',language:{tongue:0,syllabary:null},voice:{preset:'narrator',name:'plateau-guide',pitch:132,tract:.94,rate:.94,range:5.5,lilt:.13,tilt:.38,oq:.69,breath:.13,rough:.16,nasal:.07,pauses:1.18,wordGap:.023,seed:419}},
 nadia:{version:1,label:'Nadia · firm and measured',language:{tongue:0,syllabary:null},voice:{preset:'narrator',name:'yard-warden',pitch:205,tract:1.07,rate:1.04,range:4.2,lilt:.06,tilt:.55,oq:.45,breath:.025,rough:.035,nasal:.14,pauses:.92,wordGap:.014,articulation:1,seed:527}},
 hen:{version:1,label:'Bright hen · reference',language:{tongue:0,syllabary:null},voice:{preset:'narrator',name:'bright-hen',pitch:350,tract:1.28,range:7,lilt:.2,tilt:.57,oq:.5,breath:.04,rough:.07,nasal:.2}},
 neutral:{version:1,label:'Quiet worker',language:{tongue:0,syllabary:null},voice:{preset:'narrator',name:'quiet-worker',pitch:166,tract:1.02,range:4.5,breath:.08,oq:.63,rough:.05,lilt:.1,seed:263}}
};
export const CHARACTER_VOICES={'char_plateau_intro_guide':'guide','char_762dfca8-0d52-44a3-b19a-73edc239eff4':'nadia','char_dialogue_hen':'hen'};
export const DIALOGUE_VOICES={plateau_intro:'guide',yard_bomb_permission:'nadia',hen_voice_audition:'hen'};
export function textHash(text){let h=2166136261;for(const c of new TextEncoder().encode(text))h=Math.imul(h^c,16777619)>>>0;return h.toString(16);}
// Optional entries: "resource/node/lineIndex": {textHash, voice, ...delivery knobs}.
// Stale entries are ignored. Names, appearance and clothes are never voice keys.
export const LINE_DELIVERY={};
export function resolvePresentation(npc,definition,nodeId,text,lineIndex=0){
 const identity=npc.campaignId||npc.characterId||npc.character?.id||definition.id;
 const id=[npc.campaignId,npc.characterId,npc.character?.id].map(id=>CHARACTER_VOICES[id]).find(Boolean)||DIALOGUE_VOICES[definition.id]||'neutral',profile=VOICES[id];
 const entry=LINE_DELIVERY[definition.id+'/'+nodeId+'/'+lineIndex],delivery=entry?.textHash===textHash(text)?entry:null;
 return {id,version:profile.version,label:profile.label,voice:{...profile.voice,...profile.language,...(id==='neutral'?{seed:parseInt(textHash(identity),16)%9999}:{}),...(delivery?.voice||{})},language:profile.language,revision:PRESENTATION_VERSION};
}
export function resolveMercPresentation(merc){
 // A reply must never inherit the NPC's dialogue-resource voice. Give uncast
 // mercs a repeatable voice from their persistent identity, not their name/skin.
 const identity=merc.characterId||merc.character?.id||merc.campaignId;
 const profile=resolvePresentation(merc,{id:''},'',''),seed=parseInt(textHash(identity||'merc'),16);
 return profile.id!=='neutral'?profile:{...profile,id:'merc-'+textHash(identity||'merc'),version:1,
  voice:{...profile.voice,seed:seed%9999,pitch:140+seed%71,tract:.96+(seed%13)/100},label:'Merc voice'};
}
// Collarbone-up framing in authored model units, with room for ears and hats.
// Lower edges sit near 1.2 rather than the old armpit-height 1.0.
export const PORTRAIT_FRAMES={horse:{center:[.06,1.46,0],height:.52},donkey:{center:[.02,1.51,0],height:.62},sheep:{center:[.03,1.46,0],height:.52},hen:{center:[.03,1.34,0],height:.52},goat:{center:[.03,1.46,0],height:.54},bull:{center:[.03,1.48,0],height:.60},cow:{center:[.03,1.45,0],height:.54},rabbit:{center:[.02,1.50,0],height:.62},dog:{center:[.02,1.48,0],height:.56},skunk:{center:[.03,1.46,0],height:.52},'pig-foreman':{center:[.04,1.40,0],height:.50},'pig-director':{center:[.04,1.47,0],height:.54}};
export function portraitSpecies(npc){return npc.species==='donkey-guide'?'donkey':npc.species;}
