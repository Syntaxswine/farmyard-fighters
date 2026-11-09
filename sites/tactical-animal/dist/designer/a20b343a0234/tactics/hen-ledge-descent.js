import * as T from './vendor/three.module.js';
import {createHenLadderMotion} from './hen-ladder-motion.js';
import {LADDER_PRESETS} from './ladder-motion.js';
import {guardHenConstruction} from './hen-rig-transaction.js';
import {createHenLedgeDescentPaint} from './hen-ledge-descent-paint.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion(),ease=t=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
export const HEN_LEDGE_DESCENT_PHASES=Object.freeze([['Prepare · unarmed',.65],['Crouch at edge',.55],['Brace left wing tip',.35],['Hop off holding edge',.38],['Lower on left wing',.30],['Release and wing-assisted drop',.28],['Absorb landing',.22],['Stand',.40],['Settle · unarmed',.65]].map(([label,seconds],i,all)=>Object.freeze({label,start:all.slice(0,i).reduce((n,p)=>n+p[1],0),end:all.slice(0,i+1).reduce((n,p)=>n+p[1],0)})));
// Roof x>=0, y=2; ground y=0. The authored feather tip bears the left brace.
export function createHenLedgeDescent(worker,profile){return guardHenConstruction(worker,()=>build(worker,profile));}
function build(worker,profile){
 if(profile.id!=='hen'||worker.weapon)throw Error('Hen ledge descent requires an unarmed hen');
 const root=worker.root,entry=[];root.updateMatrixWorld(true);root.traverse(o=>entry.push({o,parent:o.parent,world:o.matrixWorld.clone(),p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone(),visible:o.visible}));
 const feather=worker.parts.find(p=>p.name==='feathered body'),featherIndices=feather.geometry.attributes.skinIndex.clone(),featherWeights=feather.geometry.attributes.skinWeight.clone();
 const rig=createHenLadderMotion(worker,LADDER_PRESETS.tower),bones=rig.skeleton.bones,named=Object.fromEntries(bones.map(b=>[b.name,b])),paint=createHenLedgeDescentPaint(worker);
 const soft=worker.parts.filter(p=>/apron|layered wing|feathered body/.test(p.name)).map(p=>({p,position:p.geometry.attributes.position.clone(),normal:p.geometry.attributes.normal.clone(),workingPosition:p.geometry.attributes.position.clone(),workingNormal:p.geometry.attributes.normal.clone()}));
 const phases=HEN_LEDGE_DESCENT_PHASES,duration=phases.at(-1).end,turn=Q().setFromAxisAngle(V(0,1,0),Math.PI),edge=V(.005,2,-rig.rest.get(rig.limbs.find(l=>l.id==='wing-1').c).z);let disposed=false,result=null;
 const keys=[{p:[.20,2,0]},{p:[.20,2,0]},{p:[-.17,1.45,0],pitch:.55},{p:[-.17,1.45,0],pitch:.55},{p:[-.52,1.10,0]},{p:[-.59,.78,0]},{p:[-.72,0,0]},{p:[-.72,-.16,0],pitch:-.16},{p:[-.72,0,0]},{p:[-.72,0,0]}];
 // Both lowest toe tips remain inside the roof while the crouch folds outward.
 const feet=keys.map((k,i)=>[-1,1].map(s=>i<=3?V(.11,2,-s*.157):i===4?V(-.61,1.25,-s*.157):i===5?V(-.68,.90,-s*.157):V(-.81,0,-s*.157)));
 function body(k){root.position.fromArray(k.p);named.pelvis.rotation.set(0,Math.PI,k.pitch||0);named.head.rotation.z=-(k.pitch||0)*.55;root.updateMatrixWorld(true);}
 function apply(progress,{heading=0,origin=[0,0,0]}={}){
  if(disposed)throw Error('Hen ledge descent disposed');if(!Number.isFinite(progress)||!Number.isFinite(heading)||!Array.isArray(origin)||origin.length!==3||!origin.every(Number.isFinite))throw Error('Invalid hen ledge descent playback');if(worker.weapon)throw Error('Equipment changed during hen ledge descent');root.parent?.updateMatrixWorld(true);if(root.scale.distanceTo(V(1,1,1))>1e-8||(root.parent&&!root.parent.matrixWorld.elements.every((v,i)=>Math.abs(v-(i%5===0?1:0))<1e-8)))throw Error('Hen ledge descent requires an unscaled actor under an identity parent');
  for(const r of soft){r.workingPosition.array.set(r.position.array);r.workingNormal.array.set(r.normal.array);r.p.geometry.setAttribute('position',r.workingPosition);r.p.geometry.setAttribute('normal',r.workingNormal);}rig.reset();feather.geometry.setAttribute('skinIndex',featherIndices);feather.geometry.setAttribute('skinWeight',featherWeights);
  const value=T.MathUtils.clamp(progress,0,1),time=value*duration,i=Math.max(0,phases.findIndex(p=>time<=p.end)),ph=phases[i],u=T.MathUtils.clamp((time-ph.start)/(ph.end-ph.start),0,1),w=ease(u),a=keys[i],b=keys[i+1],k={p:a.p.map((v,j)=>T.MathUtils.lerp(v,b.p[j],w)),pitch:T.MathUtils.lerp(a.pitch||0,b.pitch||0,w)};

  if(i===5){k.p[1]=T.MathUtils.lerp(a.p[1],b.p[1],u*u);k.p[0]=T.MathUtils.lerp(a.p[0],b.p[0],u);}

  rig.tail(ease((time-.65)/.55)*(1-ease((time-2.51)/.62)));body(k);paint.set(ease(time/.65)*(1-ease((time-3.13)/.65)));const contacts=[];
  for(const l of rig.limbs){const wing=l.id.startsWith('wing'),j=l.side<0?0:1;let target=l.c.localToWorld(l.offset.clone()),q=turn.clone(),planted=false;
   if(wing){
    const free=target.clone(),spread=i===3?w:i===4?1:i===5?1-w:0;
    free.add(V(-.08,.16,-l.side*.10).multiplyScalar(spread));
    target.copy(free);
    if(l.side===-1){if(i===2)target.lerp(edge,w);if(i===3||i===4){target.copy(edge);planted=true;}if(i===5)target.copy(edge).lerp(free,ease(u/.60));}
    l.pole.set(.30,.25,-l.side*.45);
   }else{
    target.copy(feet[i][j]).lerp(feet[i+1][j],w);planted=i<=2||i>=6;
    if(i===3){target.x=T.MathUtils.lerp(feet[3][j].x,feet[4][j].x,ease((u-.12)/.68));target.y=T.MathUtils.lerp(2,2.16,ease(u/.30))+(feet[4][j].y-2.16)*ease((u-.55)/.45);}
    if(i===5){target.x=T.MathUtils.lerp(feet[5][j].x,feet[6][j].x,u);target.y=T.MathUtils.lerp(feet[5][j].y,0,u*u);}
    // The avian knee folds above the lip; the rigid toes retain their bind shape.
    l.pole.set(-.4,1,-l.side*.15);
   }
   if(!planted){const offset=l.offset.clone().applyQuaternion(q),start=l.a.getWorldPosition(V()),axis=target.clone().sub(offset).sub(start),length=axis.length(),reach=T.MathUtils.clamp(length,Math.abs(l.la-l.lb)+.012,l.la+l.lb-.00001);if(length!==reach)target.copy(start).addScaledVector(axis,reach/length).add(offset);}
   rig.solve(l,target,q);contacts.push({id:l.id,side:l.side,point:target.toArray(),planted,kind:planted?(i>=6?'floor':'roof'):'free',error:l.c.localToWorld(l.offset.clone()).distanceTo(target)});
  }
  // Only flexible feather fringes and cloth receive contact deflection.
  const clothDeflection={};root.updateMatrixWorld(true);rig.skeleton.update();for(const {p}of soft){const g=p.geometry,a=g.attributes,position=a.position,matrix=new T.Matrix4(),boneMatrix=new T.Matrix4();for(let j=0;j<position.count;j++){const world=p.getVertexPosition(j,V()).applyMatrix4(p.matrixWorld),pad=p.name==='continuous apron'?.002:0,across=world.x+pad,depth=2+pad-world.y;if(across<=0||depth<=0||world.y<0)continue;const fixed=world.clone(),up=ease(.5+(across-depth)/.16),push=Math.min(across/Math.max(1e-12,1-up),depth/Math.max(1e-12,up));fixed.x-=push*(1-up);fixed.y+=push*up;clothDeflection[p.name]=Math.max(clothDeflection[p.name]||0,fixed.distanceTo(world));matrix.elements.fill(0);for(let n=0;n<4;n++){boneMatrix.fromArray(rig.skeleton.boneMatrices,a.skinIndex.getComponent(j,n)*16);const weight=a.skinWeight.getComponent(j,n);for(let e=0;e<16;e++)matrix.elements[e]+=boneMatrix.elements[e]*weight;}matrix.premultiply(p.bindMatrixInverse).multiply(p.bindMatrix).premultiply(p.matrixWorld);fixed.applyMatrix4(matrix.invert());position.setXYZ(j,fixed.x,fixed.y,fixed.z);}position.needsUpdate=true;g.computeVertexNormals();}
  const local=root.position.clone(),yaw=Q().setFromAxisAngle(V(0,1,0),-heading*Math.PI/180);root.quaternion.copy(yaw);root.position.copy(local).applyQuaternion(yaw).add(V(...origin));root.updateMatrixWorld(true);rig.skeleton.update();for(const c of contacts)c.worldPoint=V(...c.point).applyQuaternion(yaw).add(V(...origin)).toArray();return result={phase:ph.label,phaseIndex:i,index:i,progress:value,time,duration,root:local.toArray(),worldRoot:root.position.toArray(),contacts,unarmed:true,clothDeflection,airborne:i===5,supported:contacts.some(c=>c.planted)};
 }
 function restore(){if(disposed)return;paint.set(0);rig.restore();for(const e of entry){if(e.o.parent===e.parent){e.o.position.copy(e.p);e.o.quaternion.copy(e.q);e.o.scale.copy(e.s);}else{e.o.parent.updateMatrixWorld(true);new T.Matrix4().copy(e.o.parent.matrixWorld).invert().multiply(e.world).decompose(e.o.position,e.o.quaternion,e.o.scale);}e.o.visible=e.visible;e.o.updateMatrixWorld(true);}root.updateMatrixWorld(true);rig.skeleton.update();result=null;}
 restore();return{duration,phases,limbs:rig.limbs,skeleton:rig.skeleton,apply,restore,diagnostics:()=>result,dispose(){if(disposed)return;paint.dispose();rig.dispose();for(const e of entry){e.o.position.copy(e.p);e.o.quaternion.copy(e.q);e.o.scale.copy(e.s);e.o.visible=e.visible;}root.updateMatrixWorld(true);worker.skeleton.update();disposed=true;result=null;}};
}
