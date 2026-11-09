// Placement reservations include rotor/debris overhang. Only the baked body
// clearance below standing height blocks walking, not the whole reservation.
import {STONE_ARCH_SPECS} from './stone-arch-geometry.js';
export const HELICOPTER_FOOTPRINT=Object.freeze({w:12,h:10,origin:[6.5,3.5]});
// Render metres and tactical heights use different floor intervals. Machines
// retain their authored scale; convert both their height AND floor offset.
export const SCENERY_FLOOR=2.12;
export const SCENERY_ROTATIONS=Object.freeze([0,90,180,270]);
const machine=(form,name,height)=>({w:2,h:3,origin:[.5,1],facing:[0,1],model:'machine',form,name,height,physical:true,heightScale:3/SCENERY_FLOOR,cover:0,solid:false});
export const SCENERY_PROPS=Object.freeze({
 ...Object.fromEntries(Object.entries(STONE_ARCH_SPECS).map(([kind,spec])=>[kind,{...spec,model:'stone-arch',form:kind,height:spec.rise*SCENERY_FLOOR,heightScale:3/SCENERY_FLOOR,physical:true,cover:0,solid:false}])),
 'machine-lathe':machine('lathe','Metalworking lathe',1.744),
 'machine-mill':machine('mill','Vertical milling machine',2.851601),
 'machine-press':machine('press','Power press',2.519001),
 'helicopter-utility':{...HELICOPTER_FOOTPRINT,name:'Utility helicopter',model:'helicopter',state:'intact',cover:0,solid:false},
 'helicopter-crash-smoke':{...HELICOPTER_FOOTPRINT,name:'Helicopter crash · survivors / smoke',model:'helicopter',state:'survivable',smoke:true,cover:0,solid:false},
 'helicopter-wreck':{...HELICOPTER_FOOTPRINT,name:'Helicopter wreck · destroyed',model:'helicopter',state:'crashed',cover:0,solid:false},
 ...Object.fromEntries([
  ['wingback','russet','Wingback chair · russet'],['wingback','teal','Wingback chair · teal'],
  ['wood','honey','Wooden chair · honey'],['wood','walnut','Wooden chair · walnut'],
  ['metal','sage','Metal chair · sage'],['metal','iron','Metal chair · iron'],
  ['desk','teal','Desk chair · teal'],['desk','russet','Desk chair · russet']
 ].map(([form,finish,name])=>['chair-'+form+'-'+finish,{w:1,h:1,name,model:'chair',form,finish,cover:25,solid:true}])),
 'guardhouse-computer':{w:1,h:1,name:'Computer terminal · green screen',model:'console',form:'computer',screen:'green',cover:25,solid:true},
 'guardhouse-computer-amber':{w:1,h:1,name:'Computer terminal · amber screen',model:'console',form:'computer',screen:'amber',cover:25,solid:true},
 'guardhouse-telephone':{w:1,h:1,name:'Telephone / radio console',model:'console',form:'telephone',cover:25,solid:true}
});
export const sceneryRule=p=>SCENERY_PROPS[p?.kind];
export const isScenery=p=>!!sceneryRule(p);
export const isHelicopter=p=>sceneryRule(p)?.model==='helicopter';
export const isMachine=p=>sceneryRule(p)?.model==='machine';
export const isStoneArch=p=>sceneryRule(p)?.model==='stone-arch';
export const isPhysicalScenery=p=>isHelicopter(p)||isMachine(p)||isStoneArch(p);
export const sceneryId=p=>`scenery:${p.x},${p.y},${p.z||0}`;
// Explicit rotation wins on import. Legacy rotated=true remains a 90° turn.
// Reject malformed authored angles; silently rounding would change collisions.
export function sceneryRotation(p){const n=p?.rotation??(p?.rotated?90:0);if(!SCENERY_ROTATIONS.includes(n))throw Error('Scenery orientation must be 0°, 90°, 180° or 270°.');return n;}
export function sceneryOrientation(p,turns=0){const rotation=(sceneryRotation(p)+90*(turns%4)+360)%360;return {rotation,rotated:rotation%180===90};}
export function scenerySize(p){const r=sceneryRule(p),odd=sceneryRotation(p)%180===90;return {w:odd?r.h:r.w,h:odd?r.w:r.h};}
export function sceneryFacing(p){const [x,y]=sceneryRule(p)?.facing||[1,0],a=sceneryRotation(p);return a===90?[-y,x]:a===180?[-x,-y]:a===270?[y,-x]:[x,y];}
export function sceneryPoint(p,[x,y,h=0],space='tactical'){
 const r=sceneryRule(p),angle=sceneryRotation(p),q=angle===90?[r.h-1-y,x]:angle===180?[r.w-1-x,r.h-1-y]:angle===270?[y,r.w-1-x]:[x,y];
 return {x:p.x+q[0],y:p.y+q[1],h:(p.z||0)*(space==='render'?SCENERY_FLOOR:3)+h*(space==='render'?1:r.heightScale||1),z:p.z||0};
}
export function sceneryLocal(p,q,space='tactical'){
 const r=sceneryRule(p),x=q.x-p.x,y=q.y-p.y,angle=sceneryRotation(p),a=angle===90?[y,r.h-1-x]:angle===180?[r.w-1-x,r.h-1-y]:angle===270?[r.w-1-y,x]:[x,y];
 return {x:a[0],y:a[1],h:((q.h??0)-(p.z||0)*(space==='render'?SCENERY_FLOOR:3))/(space==='render'?1:r.heightScale||1)};
}
export function sceneryDirection(p,d,space='tactical'){
 const r=sceneryRule(p),angle=sceneryRotation(p),q=angle===90?[d.y,-d.x]:angle===180?[-d.x,-d.y]:angle===270?[-d.y,d.x]:[d.x,d.y];
 return [q[0],q[1],d.h/(space==='render'?1:r.heightScale||1)];
}
