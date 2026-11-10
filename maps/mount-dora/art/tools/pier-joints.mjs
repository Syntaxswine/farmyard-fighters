// How pier decks run on past the joints where their lines meet (used by build-playable.mjs).
//
// Each deck piece is a rectangle. Where two lines meet, both run on past the joint by the
// mitre length, half the width times tan(turn / 2) (the turn is 0 straight on), so their outer
// corners meet exactly. Up to a square turn nothing else sticks out, as long as each line is at
// least a deck width long (shorter, the other deck's run-on would show past its end; such a
// line stops the build). Past a square turn each run-on's inner corner pokes out past the other
// deck's outer edge by width * |cos turn|. The rule accepts that up to MAX_EAR_M and stops the
// build beyond it, since a sharper corner needs a cut mitre. At a joint of three or more lines
// the straightest pair mitres and the others (a T's stem) end at the joint, inside that pair's
// deck; a junction whose straightest pair turns more than MAX_THROUGH_TURN also stops the build.
export const MAX_EAR_M=.1;
export const MAX_THROUGH_TURN=Math.PI/6;
const same=(p,q)=>p[0]===q[0]&&p[1]===q[1];
// The direction leaving `joint` along a line that ends there.
const leaving=(line,joint)=>{const q=same(line[0],joint)?line[1]:line[0],w=[q[0]-joint[0],q[1]-joint[1]],l=Math.hypot(...w);return [w[0]/l,w[1]/l];};
// The turn between two lines through a joint, from the directions leaving it: 0 straight on.
export const turnBetween=(s,t)=>Math.PI-Math.acos(Math.max(-1,Math.min(1,s[0]*t[0]+s[1]*t[1])));
// For a turn past square, how far each mitred run-on's inner corner pokes out past the other
// deck's outer edge; 0 up to a square turn.
export const earFor=(turn,widthM)=>turn>Math.PI/2?widthM*Math.abs(Math.cos(turn)):0;
// The run past `joint` of each of `lines` (the [a,b] deck lines that end there), in order.
// `label` names the pier in any error, which stops the build.
export function runOns(joint,lines,widthM,label='A pier'){
 if(lines.length<2)throw Error(`${label}: a joint needs two or more lines.`);
 if(!lines.every(l=>same(l[0],joint)||same(l[1],joint)))throw Error(`${label}: every line must end at the joint ${joint}.`);
 const short=lines.find(l=>Math.hypot(l[1][0]-l[0][0],l[1][1]-l[0][1])<widthM);
 if(short)throw Error(`${label}: a deck line at ${joint} is shorter than the deck is wide, so a mitred run-on would show past its end; add a corner rule.`);
 const dirs=lines.map(l=>leaving(l,joint));let best=null;
 for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){const turn=turnBetween(dirs[i],dirs[j]);if(!best||turn<best.turn)best={i,j,turn};}
 const degrees=(best.turn*180/Math.PI).toFixed(1),ear=earFor(best.turn,widthM);
 if(ear>MAX_EAR_M)throw Error(`${label} turns ${degrees} degrees at ${joint}: mitred rectangles would stick out ${ear.toFixed(3)} m there; add a cut mitre.`);
 if(lines.length>2&&best.turn>MAX_THROUGH_TURN)throw Error(`${label}: the junction at ${joint} has no pair of lines within ${(MAX_THROUGH_TURN*180/Math.PI).toFixed(0)} degrees of straight (the straightest turns ${degrees}); add a corner rule.`);
 const run=widthM/2*Math.tan(best.turn/2);
 return lines.map((l,k)=>k===best.i||k===best.j?run:0);
}
