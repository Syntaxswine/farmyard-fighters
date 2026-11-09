import {readSettings,saveSettings,normalizeSettings} from './settings-3d.js';
export const speedLabel=rate=>(rate===1?'Normal':rate<1?'Slower':'Faster')+' · '+rate.toFixed(2)+'×';
// Shared by title Options and conversation Options. Updates preserve unrelated preferences.
export function createDialoguePreferences({onChange=()=>{}}={}){
 const root=document.createElement('fieldset');root.className='dialogue-preferences';
 const legend=document.createElement('legend');legend.textContent='Conversation';root.append(legend);
 const controls={},status=document.createElement('p');status.setAttribute('role','status');
 function add(key,text,type,min,max,step){const label=document.createElement('label'),name=document.createElement('span'),input=document.createElement('input');name.textContent=text;input.type=type;input.setAttribute('aria-label',text);if(min!==undefined){input.min=min;input.max=max;input.step=step;}
  const output=document.createElement('output');output.setAttribute('aria-live','off');label.append(name,output,input);root.append(label);controls[key]={input,output};input.addEventListener('input',()=>{const next={...readSettings(),...value()};status.textContent=saveSettings(next)?'':'Could not save preferences on this device.';refresh(next);onChange(normalizeSettings(next));});return input;}
 add('dialogueSpeed','Text and speech speed','range',.5,2,.05);
 add('dialogueTextAnimation','Animate text','checkbox');
 add('dialogueVolume','Dialogue voice','range',0,1,.05);
 add('dialoguePortraits','Static portrait','checkbox');
 const note=document.createElement('small');note.textContent='Speech follows text speed. Speed changes apply to the next line or Replay. Portrait motion follows your motion preference.';root.append(note,status);
 function value(){return {dialogueSpeed:+controls.dialogueSpeed.input.value,dialogueTextAnimation:controls.dialogueTextAnimation.input.checked,dialogueVolume:+controls.dialogueVolume.input.value,dialoguePortraits:controls.dialoguePortraits.input.checked?'static':'motion'};}
 function refresh(settings=readSettings()){for(const [key,c]of Object.entries(controls)){if(c.input.type==='checkbox')c.input.checked=key==='dialoguePortraits'?settings[key]==='static':settings[key];else c.input.value=settings[key];}controls.dialogueSpeed.output.textContent=speedLabel(settings.dialogueSpeed);controls.dialogueVolume.output.textContent=settings.dialogueVolume===0?'Off':Math.round(settings.dialogueVolume*100)+'%';}
 refresh();return {root,value,refresh};
}
