import {MINUTES_PER_DAY,DAY_START,DUSK_START,NIGHT_START,DAWN_START} from './game-clock.js';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
// Map east is +X; map north is -Z. Camera rotation never changes the sun.
export function daylightAt(minutes){
 const minute=((minutes%MINUTES_PER_DAY)+MINUTES_PER_DAY)%MINUTES_PER_DAY;
 const strength=minute<DAY_START?smooth((minute-DAWN_START)/(DAY_START-DAWN_START)):1-smooth((minute-DUSK_START)/(NIGHT_START-DUSK_START));
 const noon=12*60,progress=minute<=noon?.5*(minute-DAWN_START)/(noon-DAWN_START):.5+.5*(minute-noon)/(NIGHT_START-noon);
 const arc=Math.max(0,Math.min(1,progress))*Math.PI;
 const elevation=.12+.88*Math.sin(arc);
 return {minute,strength,direction:[Math.cos(arc),elevation,.25],warmth:1-smooth((elevation-.12)/.65),sunIntensity:2.2*strength,ambientIntensity:.55+.74*strength};
}
