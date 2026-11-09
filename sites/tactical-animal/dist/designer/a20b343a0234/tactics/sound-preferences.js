import {readSettings,saveSettings} from './settings-3d.js';
export function createSoundPreferences({onChange=()=>{}}={}){
 const root=document.createElement('fieldset'),legend=document.createElement('legend'),label=document.createElement('label'),input=document.createElement('input'),output=document.createElement('output');
 root.className='dialogue-preferences';legend.textContent='Game sound';label.append('Sound effects volume ');input.type='range';input.min=0;input.max=1;input.step=.05;input.setAttribute('aria-label','Sound effects volume');label.append(input,output);root.append(legend,label);
 function refresh(settings=readSettings()){input.value=settings.effectsVolume;output.textContent=settings.effectsVolume===0?'Off':Math.round(settings.effectsVolume*100)+'%';}
 function value(){return {effectsVolume:+input.value};}
 input.oninput=()=>{const next={...readSettings(),...value()};saveSettings(next);refresh(next);onChange(next.effectsVolume);};refresh();return {root,value,refresh};
}
