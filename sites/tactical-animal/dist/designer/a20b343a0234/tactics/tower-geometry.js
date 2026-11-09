export const IRON_LADDER_EXIT={width:.94,landingWidth:1.30,railSpan:1.24,doorHalf:.61,doorHeight:1.90};
export function ironTowerDoor(wide=false,H=TOWER_HEIGHT){const half=wide?IRON_LADDER_EXIT.doorHalf:.47,height=wide?IRON_LADDER_EXIT.doorHeight:1.72,parts=[];
 const add=(name,p,size)=>parts.push({name,p,size});
 for(const [z,length]of wide?[[(-1.5-.8-half)/2,1.5-.8-half],[(1.5-.8+half)/2,1.5+.8-half]]:[[-1.375,.25],[.575,1.85]])add('door-wall',[1.45,H+.99,z],[.10,1.98,length]);
 add('door-lintel',[1.45,H+(wide?2.00:1.88),-.8],[.16,wide?.20:.24,wide?2*half:.92]);
 for(const z of [-.8-half,-.8+half])add('door-jamb',[1.45,H+height/2,z],[.16,height,.065]);return parts;
}
// North-edge mount clears the northwest lookout while staying opposite the ladder.
export const WOODEN_LIGHT_MOUNT={x:-1.35,y:-1.90};
export const WOODEN_LADDER={z:1.55,width:.76,exitWidth:.94,railTop:7.28};
// Structural surfaces shared by beam, sight and projectile queries. Windows are gaps.
export const TOWER_HEIGHT=6.36;
export const TOWERS={
 'wooden-spotlight-tower':{w:5,h:5,open:true},
 'iron-searchlight-stair-tower':{w:6,h:5},
 'iron-searchlight-ladder-tower':{w:6,h:5,ladder:true}
};
export function towerCenter(p){const f=TOWERS[p.kind];return {x:p.x+((p.rotated?f.h:f.w)-1)/2,y:p.y+((p.rotated?f.w:f.h)-1)/2,z:p.z||0};}
export function towerLocal(p,q){const c=towerCenter(p),x=q.x-c.x,y=q.y-c.y;return [p.rotated?y:x,(q.h??0)-c.z*3,p.rotated?-x:y];}
export function towerPoint(p,x,y){const c=towerCenter(p);return {x:Math.round(c.x+(p.rotated?-y:x)),y:Math.round(c.y+(p.rotated?x:y)),z:c.z};}
export function towerSlots(p){const shift=TOWERS[p.kind].open?0:-.95;return [-.7,.7].flatMap(x=>[-.8,.8].map(y=>towerPoint(p,x+shift,y)));}
export function towerEntry(p){const f=TOWERS[p.kind];return f.open?towerPoint(p,0,3):f.ladder?towerPoint(p,3.5,-.8):towerPoint(p,1.04,-3);}
export function towerForUnit(s,u){const ref=u?.towerPost;if(!ref||![ref.dx,ref.dy].every(Number.isInteger))return null;return (s.props||[]).find(p=>TOWERS[p.kind]&&p.x===u.x+ref.dx&&p.y===u.y+ref.dy&&(p.z||0)===(u.z||0)&&p.kind===ref.kind&&towerSlots(p).some(q=>q.x===u.x&&q.y===u.y))||null;}
export function towerPost(p,q){return {dx:p.x-q.x,dy:p.y-q.y,kind:p.kind};}
export const unitBaseHeight=(u,spacing=3)=>(u.cliffSupport&&!u.towerPost?u.cliffSupport.level*spacing+u.cliffSupport.height:(u.z||0)*spacing)+(u.towerPost?TOWER_HEIGHT:0);
// One set of dimensions feeds both visible meshes and tactical blockers.
export function woodenTowerRails(H=TOWER_HEIGHT){const parts=[],add=(name,p,size,trim=false)=>parts.push({name,p,size,trim});
 for(const side of [-1,1]){
  for(const t of [-2.42,-1.21,0,1.21,2.42]){add('railing-post',[side*2.42,H+.48,t],[.12,.96,.12]);if(Math.abs(t)<2.4)add('railing-post',[t,H+.48,side*2.42],[.12,.96,.12]);}
  for(const y of [.10,.47,.94]){add('perimeter-rail',[side*2.42,H+y,0],[.13,.10,4.96],true);add('perimeter-rail',[0,H+y,side*2.42],[4.96,.10,.13],true);}
 }
 for(const x of [-.58,.58]){for(const z of [1.27,2.23])add('hatch-post',[x,H+.46,z],[.085,.92,.085]);for(const y of [.47,.91])add('hatch-side-rail',[x,H+y,1.75],[.085,.085,1.04],true);}
 for(const y of [.47,.91])add('hatch-back-rail',[0,H+y,2.23],[1.16,.085,.085],true);
 return parts;
}
const shells=new Map();
function shell(kind){if(shells.has(kind))return shells.get(kind);const parts=[],add=(x,h,y,w,t,d,angle=0)=>parts.push({c:[x,h,y],size:[w,t,d],angle}),H=TOWER_HEIGHT;
 if(TOWERS[kind].open){for(const [x,y,w,d]of [[0,-.625,5,3.75],[-1.5,1.75,2,1],[1.5,1.75,2,1],[0,2.375,5,.25]])add(x,H-.08,y,w,.16,d);for(const part of woodenTowerRails())add(...part.p,...part.size);}
 else{
  const box=(x,h,y,w,t,d,a=0)=>add(x-.95,h,y,w,t,d,a);
  box(0,H-.06,0,3,.12,3);
  for(const y of [-1.45,1.45]){box(0,H+.42,y,3,.84,.1);box(0,H+1.91,y,3,.22,.1);for(const x of [-1.43,0,1.43])box(x,H+1.32,y,.12,.96,.14);box(0,H+.86,y,3.04,.07,.18);}
  box(-1.45,H+.42,0,.1,.84,3);box(-1.45,H+1.91,0,.1,.22,3);for(const y of [-1.43,0,1.43])box(-1.45,H+1.32,y,.14,.96,.12);box(-1.45,H+.86,0,.18,.07,3.04);
  for(const part of ironTowerDoor(!!TOWERS[kind].ladder,H))box(...part.p,...part.size);
  for(const side of [-1,1])box(side*.8,H+2.25,0,1.68,.1,3.30,-side*.28);box(0,H+2.49,0,.16,.12,3.35);
 }
 shells.set(kind,parts);return parts;
}
export function towerShellParts(p,spacing=2.12){const c=towerCenter(p);return shell(p.kind).map(part=>({center:[c.x+(p.rotated?-part.c[2]:part.c[0]),c.z*spacing+part.c[1],c.y+(p.rotated?part.c[0]:part.c[2])],size:part.size,rotation:[0,p.rotated?-Math.PI/2:0,part.angle]}));}
function fraction(p,origin,end){const a=towerLocal(p,origin),b=towerLocal(p,end);let nearest=null;
 for(const part of shell(p.kind)){const cs=Math.cos(part.angle),sn=Math.sin(part.angle),local=v=>{const x=v[0]-part.c[0],h=v[1]-part.c[1];return [x*cs+h*sn,-x*sn+h*cs,v[2]-part.c[2]];},loPoint=local(a),hiPoint=local(b);let lo=0,hi=1,hit=true;
  for(let i=0;i<3;i++){const v=loPoint[i],d=hiPoint[i]-v,r=part.size[i]/2;if(Math.abs(d)<1e-9){if(v < -r||v>r){hit=false;break;}}else{const l=(-r-v)/d,h=(r-v)/d;lo=Math.max(lo,Math.min(l,h));hi=Math.min(hi,Math.max(l,h));if(lo>hi){hit=false;break;}}}
  if(hit&&hi>1e-6&&lo<1-1e-6&&(nearest===null||lo<nearest))nearest=Math.max(0,lo);
 }return nearest;
}
export function towerBlocksSegment(p,origin,end){return !!TOWERS[p.kind]&&fraction(p,origin,end)!==null;}
export function towerRayHit(props,origin,direction,reach){const length=Math.hypot(direction.x,direction.y,direction.h);if(!length)return null;const end={x:origin.x+direction.x/length*reach,y:origin.y+direction.y/length*reach,h:origin.h+direction.h/length*reach};let nearest=null;
 for(const p of props||[]){if(!TOWERS[p.kind])continue;const f=fraction(p,origin,end);if(f!==null&&(nearest===null||f*reach<nearest))nearest=f*reach;}return nearest;
}
