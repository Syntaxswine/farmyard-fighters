// How pier decks run on past the joints where their lines meet (used by build-playable.mjs).
//
// Each deck piece is a rectangle. Where two lines meet, both run on past the joint by the
// mitre length, half the width times tan(turn / 2) (the turn is 0 straight on), so their outer
// corners meet exactly. Up to a square turn nothing else sticks out. Past it, each run-on's
// inner corner pokes out past the other deck's outer edge by width * |cos turn|. The rule
// accepts that up to MAX_EAR_M and stops the build beyond it, since a sharper corner needs a
// cut mitre. At a joint of three or more lines the straightest pair mitres and the others (a T's
// stem) end at the joint, inside that pair's deck; a junction whose straightest pair turns more
// than MAX_THROUGH_TURN also stops the build.
export const MAX_EAR_M=.1;
export const MAX_THROUGH_TURN=Math.PI/6;
const same=(p,q)=>p[0]===q[0]&&p[1]===q[1];
// The direction leaving `joint` along a line that ends there.
const leaving=(line,joint)=>{const q=same(line[0],joint)?line[1]:line[0],w=[q[0]-joint[0],q[1]-joint[1]],l=Math.hypot(...w);return [w[0]/l,w[1]/l];};
// The turn between two lines through a joint, from the directions leaving it: 0 straight on.
export const turnBetween=(s,t)=>Math.PI-Math.acos(Math.max(-1,Math.min(1,s[0]*t[0]+s[1]*t[1])));
// How far past the inner corner of a run-on pokes out of the other deck, for a turn.
export const earFor=(turn,widthM)=>turn>Math.PI/2?widthM*Math.abs(Math.cos(turn)):0;
// The run past `joint` of each of `lines` (the [a,b] deck lines that end there), in order.
export function runOns(joint,lines,widthM){
 if(lines.length<2)throw Error('A joint needs two or more lines.');
 if(!lines.every(l=>same(l[0],joint)||same(l[1],joint)))throw Error('Every line must end at the joint.');
 const dirs=lines.map(l=>leaving(l,joint));let best=null;
 for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){const turn=turnBetween(dirs[i],dirs[j]);if(!best||turn<best.turn)best={i,j,turn};}
 const degrees=(best.turn*180/Math.PI).toFixed(1),ear=earFor(best.turn,widthM);
 if(ear>MAX_EAR_M)throw Error(`A pier turns ${degrees} degrees at ${joint}: mitred rectangles would stick out ${ear.toFixed(3)} m there; add a cut mitre.`);
 if(lines.length>2&&best.turn>MAX_THROUGH_TURN)throw Error(`A pier junction at ${joint} has no pair of lines within 30 degrees of straight (the straightest turns ${degrees}); add a corner rule.`);
 const run=widthM/2*Math.tan(best.turn/2);
 return lines.map((l,k)=>k===best.i||k===best.j?run:0);
}
