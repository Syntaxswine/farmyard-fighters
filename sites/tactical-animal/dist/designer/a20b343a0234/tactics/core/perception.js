// Sight lobes. Angles in degrees, ranges in tiles. See docs/tactics/SIGHT.md for the sources.
export const headingTo=(a,b)=>a.x===b.x&&a.y===b.y?(a.heading??0):Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
// Absolute bearing offset from a's heading to b, 0..180. Omnidirectional or co-located observers report 0.
export const bearingOffset=(a,b)=>{if(!Number.isFinite(a.heading)||(b.x===a.x&&b.y===a.y))return 0;return Math.abs(((headingTo(a,b)-a.heading+540)%360+360)%360-180);};
// Inside the total field. `cone` is the field width in degrees (120 when absent).
export function inCone(a,b){return bearingOffset(a,b)<=(a.cone??120)/2+1e-8;}

// Johnson criteria: resolvable cycles across the target's critical dimension for each task.
export const JOHNSON={detect:1,recognize:4,identify:6.4};
// field: total visual field; bino: binocular overlap; e2: eccentricity beyond the binocular edge at which
// ground-plane acuity halves; floor: peripheral identification fraction; range: species range multiplier.
export const SIGHT={
 horse:{field:350,bino:60,e2:60,floor:.4},
 donkey:{field:350,bino:60,e2:60,floor:.4},
 goat:{field:330,bino:50,e2:60,floor:.4},
 cow:{field:330,bino:40,e2:60,floor:.4},
 sheep:{field:300,bino:35,e2:60,floor:.4},
 hen:{field:300,bino:26,e2:45,floor:.35},
 'pig-foreman':{field:310,bino:42,e2:30,floor:.35},
 'pig-director':{field:310,bino:42,e2:30,floor:.35},
 skunk:{field:240,bino:40,e2:15,floor:.3,range:.5}
};
export const DEFAULT_SIGHT={field:200,bino:120,e2:15,floor:.3,range:1};
// A unit without a roster species keeps a flat cone of its `cone` width (fully binocular), matching the old rule.
export const sightOf=u=>{const t=SIGHT[u?.species];if(t)return {range:1,...t};const field=Number.isFinite(u?.cone)?u.cone:DEFAULT_SIGHT.field;return {...DEFAULT_SIGHT,field,bino:Math.min(DEFAULT_SIGHT.bino,field)};};
// Relative acuity at bearing offset e: 1 inside the binocular core, hyperbolic fall-off outside, 0 beyond the field.
export function acuity(e,t){if(e>t.field/2+1e-8)return 0;const b=t.bino/2;if(e<=b)return 1;return Math.max(t.floor,1/(1+(e-b)/t.e2));}
// Range at which a can identify (full contact) or merely detect (a moving target) b, given a range cap R.
export function identifyRange(a,b,R){const t=sightOf(a);return R*t.range*acuity(bearingOffset(a,b),t);}
export function detectRange(a,b,R){const t=sightOf(a),f=acuity(bearingOffset(a,b),t);return f?R*t.range*Math.min(1,JOHNSON.identify*f):0;}
