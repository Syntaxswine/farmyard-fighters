import {woodenTowerRails,WOODEN_LADDER} from './tower-geometry.js';
import {DIMENSIONS} from './hybrid-world.js';
export const TOWER_DECK_HEIGHT=3*DIMENSIONS.floorSpacing;
// Open, walk-through ladder aperture: x[-.5,.5], z[1.25,2.25].
export function buildWoodenGuardTower(root,{box,wood,iron,skin}){
 const H=TOWER_DECK_HEIGHT,m=wood(skin),alt=wood(skin,1);
 const b=(name,mat,p,s,r)=>{const o=box(root,mat,p,s,r);o.name=name;return o;};
 function beam(name,a,c,width=.13){const dx=c[0]-a[0],dy=c[1]-a[1],dz=c[2]-a[2],length=Math.hypot(dx,dy,dz),o=b(name,alt,a.map((v,i)=>(v+c[i])/2),[width,length,width]);o.quaternion.setFromUnitVectors(o.up.clone(),o.up.clone().set(dx,dy,dz).normalize());return o;}
 for(const x of [-1.36,1.36])for(const z of [-1.36,1.36]){b('support-post',m,[x,H/2,z],[.26,H,.26]);for(const y of [.17,2.12,4.24,H-.24])b('iron-post-band',iron,[x,y,z],[.28,.045,.28]);}
 for(let story=0;story<3;story++){
  const low=story*DIMENSIONS.floorSpacing+.18,high=(story+1)*DIMENSIONS.floorSpacing-.20;
  for(const z of [-1.36,1.36]){b('frame-tie',m,[0,high,z],[2.72,.18,.18]);beam('cross-brace',[-1.30,low,z],[1.30,high,z]);beam('cross-brace',[1.30,low,z],[-1.30,high,z]);}
  for(const x of [-1.36,1.36]){b('frame-tie',m,[x,high,0],[.18,.18,2.72]);beam('cross-brace',[x,low,-1.30],[x,high,1.30]);beam('cross-brace',[x,low,1.30],[x,high,-1.30]);}
 }
 // Main beams and joists stop around the opening; no hidden slab under it.
 for(const x of [-1.36,1.36])b('deck-beam',m,[x,H-.24,0],[.22,.30,4.9]);
 for(const z of [-2.35,-1.25,0,1.15,2.35])b('deck-joist',alt,[0,H-.15,z],[4.9,.18,.15]);
 for(const x of [-.58,.58])b('hatch-header',m,[x,H-.15,1.75],[.16,.18,1.12]);
 for(let i=0;i<20;i++){const z=-2.5+(i+.5)*.25,segments=i>=15&&i<=18?[[-2.5,-.5],[.5,2.5]]:[[-2.5,2.5]];for(const [a,c]of segments)b('deck-plank',wood(skin,i%4),[(a+c)/2,H-.055,z],[c-a,.11,.242]);}
 for(const side of [-1,1]){
  // Knee braces support the platform's overhang on each face.
  for(const t of [-1.36,1.36]){beam('cantilever-brace',[t,H-1,side*1.36],[t,H-.25,side*2.30],.16);beam('cantilever-brace',[side*1.36,H-1,t],[side*2.30,H-.25,t],.16);}
 }
 for(const side of [-1,1]){const levels=[0,H,H+.35,H+.92];for(let i=1;i<levels.length;i++){const a=levels[i-1],c=levels[i],x=y=>side*(y<=H?WOODEN_LADDER.width:WOODEN_LADDER.exitWidth)/2;beam('ladder-stile',[x(a),a,WOODEN_LADDER.z],[x(c),c,WOODEN_LADDER.z],.085).scale.z=.10/.085;}}
 for(let y=.22;y<H-.08;y+=.28)b('ladder-rung',alt,[0,y,WOODEN_LADDER.z],[WOODEN_LADDER.width,.062,.082]);
 for(const part of woodenTowerRails(H))b(part.name,part.trim?alt:m,part.p,part.size);
 root.userData.tower={supportTiles:[3,3],platformTiles:[5,5],stories:3,deckHeight:H,opening:{min:[-.5,1.25],max:[.5,2.25]},ladderSide:'+Z'};
}
