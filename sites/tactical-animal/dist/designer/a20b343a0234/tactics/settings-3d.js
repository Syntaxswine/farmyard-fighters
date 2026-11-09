import {normalizeQuickPlayTeam} from './quickplay-presets.js';
const KEY='farmyard-commando-designer:options:v1';
const bounded=(n,a,b,fallback)=>typeof n==='number'&&Number.isFinite(n)?Math.min(b,Math.max(a,n)):fallback;
export function normalizeSettings(value){return {difficulty:['easy','standard'].includes(value?.difficulty)?value.difficulty:'easy',motion:['system','reduced','full'].includes(value?.motion)?value.motion:'system',blood:['full','reduced','off'].includes(value?.blood)?value.blood:'full',quickPlayTeam:normalizeQuickPlayTeam(value?.quickPlayTeam),effectsVolume:bounded(value?.effectsVolume,0,1,.7),dialogueSpeed:Math.round(bounded(value?.dialogueSpeed,.5,2,1)*100)/100,dialogueTextAnimation:value?.dialogueTextAnimation!==false,dialogueVolume:bounded(value?.dialogueVolume,0,1,.7),dialoguePortraits:value?.dialoguePortraits==='static'?'static':'motion'};}
export function readSettings(){try{return normalizeSettings(JSON.parse(localStorage.getItem(KEY)));}catch{return normalizeSettings(null);}}
export function saveSettings(value){try{localStorage.setItem(KEY,JSON.stringify(normalizeSettings(value)));return true;}catch{return false;}}
export function motionPreference(){const {motion}=readSettings();return motion==='system'?globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'):{matches:motion==='reduced'};}
