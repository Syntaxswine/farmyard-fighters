import {AIM_LEVELS,supportsAim,shotAim} from './aft/tactics/aim-levels.js';

const symbols=new URL('./assets/ui/industrial-switches/symbols.svg',import.meta.url);
symbols.search=new URL(import.meta.url).search;
export function switchSymbol(id){const url=new URL(symbols);url.hash=id;return url.href;}

const feedbackTimers=new WeakMap();
export function flashAPShortage(button){
  clearTimeout(feedbackTimers.get(button));
  button.classList.remove('is-ap-short');
  // Restart all three light pulses even when the same switch is pressed again.
  void button.offsetWidth;
  button.classList.add('is-ap-short');
  feedbackTimers.set(button,setTimeout(()=>{
    button.classList.remove('is-ap-short');feedbackTimers.delete(button);
  },1500));
}

// Use the simulation's aim prices, including its burst surcharge and rounding.
export function aimOptions(weapon,ap,burst=false){
  return (supportsAim(weapon)?Object.keys(AIM_LEVELS):['hip']).map(id=>{
    const shot=shotAim(weapon,id,burst);
    return {id,label:id==='hip'?'Quick shot':AIM_LEVELS[id].label,cost:shot.cost,accuracy:shot.accuracy,available:ap+1e-7>=shot.cost};
  });
}

// Keep a deliberate choice while affordable; otherwise fall back to the best fit.
export function availableAim(weapon,ap,burst=false,preferred){
  const options=aimOptions(weapon,ap,burst);
  return options.find(option=>option.id===preferred&&option.available)?.id
    ||options.findLast(option=>option.available)?.id||'hip';
}
