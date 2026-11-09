import {INTRO_DIALOGUE,TUTORIAL_ROLES} from './tutorial-mission.js';
import {loadDialogueCatalog,resolveDialogue} from './dialogue-data.js';
export function installTutorialProperties({getDocument,getSelection,run}){
 const host=document.createElement('section');host.id='tutorial-properties';host.hidden=true;
 host.innerHTML='<h2>Plateau tutorial</h2><p class="muted">Assign these roles to your existing objects. Use one radio tower, one SAM site and one explosives crate across the tutorial sectors.</p><div data-object><label>Mission role<select aria-label="Tutorial mission role"></select></label><button type="button" data-apply>Apply mission role</button><p class="muted">The crash-sector crate starts with two demolition charges in a new game. Radio and SAM objectives offer Plant explosives beside their controls. Other destructive weapons count too.</p></div><div data-guide><button type="button" data-bind>Use as intro guide</button><p class="muted">Enables talking and assigns plateau_intro. Keep this character friendly. The guide checks carried explosives and both sites across the campaign. A standalone playtest needs both sites on its map.</p></div>';
 document.querySelector('.properties').append(host);
 const select=host.querySelector('select'),object=host.querySelector('[data-object]'),guide=host.querySelector('[data-guide]');
 host.querySelector('[data-apply]').onclick=()=>{const d=getDocument(),s=getSelection(),role=select.value;run(()=>d.tutorialObject(s,role),'Tutorial mission role saved.');};
 host.querySelector('[data-bind]').onclick=()=>{const d=getDocument(),id=getSelection()?.data?.character?.id;run(async()=>{const catalog=d.dialogueCatalog?.definitions?.[INTRO_DIALOGUE]?d.dialogueCatalog:await loadDialogueCatalog();d.tutorialGuide(id,resolveDialogue(d.map,null,INTRO_DIALOGUE,catalog));},'Intro guide connected. Dialogue follows explosives, radio tower and SAM site.');};
 function sync(){
  const d=getDocument(),s=getSelection(),p=s?.data,roles=s?.type==='prop'?Object.entries(TUTORIAL_ROLES).filter(([,r])=>r.kinds.includes(p.kind)):[],isGuide=s?.type==='unit'&&d?.map.guards.some(q=>q.character?.id===p.character?.id);
  host.hidden=!roles.length&&!isGuide;object.hidden=!roles.length;guide.hidden=!isGuide;
  if(roles.length){select.replaceChildren(new Option('None',''),...roles.map(([id,r])=>new Option(r.label,id)));select.value=d.map.props.find(q=>q.x===p.x&&q.y===p.y&&(q.z||0)===(p.z||0))?.tutorialRole||'';}
 }
 return {sync};
}
