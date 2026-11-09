import * as T from './vendor/three.module.js';
import {createHenLadderMotion} from './hen-ladder-motion.js';
import {LADDER_PRESETS} from './ladder-motion.js';
import {createHenRoofMantlePaint} from './hen-roof-mantle-paint.js';
import {guardHenConstruction} from './hen-rig-transaction.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion(),ease=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
export const HEN_ROOF_MANTLE_PHASES=Object.freeze([['Prepare · unarmed',.65],['Crouch to jump',.2],['Wing-assisted jump',.4],['Brace wing tips',.15],['Press breast above lip',.8],['Lean forward and left',.5],['Right leg over',.65],['Slide belly onto roof',.65],['Lie flat',.3],['Gather legs underneath',.65],['Stand',.65],['Settle · unarmed',.65]].map(([label,seconds],i,all)=>Object.freeze({label,start:all.slice(0,i).reduce((n,p)=>n+p[1],0),end:all.slice(0,i+1).reduce((n,p)=>n+p[1],0)})));
// A separate avian study: feather tips brace; no invented hands or weapon grips.
export function createHenRoofMantle(worker,profile){return guardHenConstruction(worker,()=>build(worker,profile));}
function build(worker,profile){
 if(profile.id!=='hen'||worker.weapon)throw Error('Hen roof mantle requires an unarmed hen');
 const root=worker.root,entry=[];root.updateMatrixWorld(true);root.traverse(o=>entry.push({o,parent:o.parent,world:o.matrixWorld.clone(),p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone(),visible:o.visible}));
 const feather=worker.parts.find(p=>p.name==='feathered body'),featherIndices=feather.geometry.attributes.skinIndex.clone(),featherWeights=feather.geometry.attributes.skinWeight.clone();
 const rig=createHenLadderMotion(worker,LADDER_PRESETS.tower),bones=rig.skeleton.bones,named=Object.fromEntries(bones.map(b=>[b.name,b]));
 const soft=worker.parts.filter(p=>/apron|layered wing|feathered body/.test(p.name)).map(p=>({p,position:p.geometry.attributes.position.clone(),normal:p.geometry.attributes.normal.clone(),workingPosition:p.geometry.attributes.position.clone(),workingNormal:p.geometry.attributes.normal.clone()}));
 const legs=worker.parts.filter(p=>p.name.includes('scaly leg')).map(p=>({p,position:p.geometry.attributes.position.clone(),workingPosition:p.geometry.attributes.position.clone()}));
 const paint=createHenRoofMantlePaint(worker);
 const phases=HEN_ROOF_MANTLE_PHASES,duration=phases.at(-1).end;let disposed=false,result=null;
 // The breast and left wing take the load before either foot clears the lip.
 const keys=[{p:[-.65,0,0]},{p:[-.65,0,0]},{p:[-.65,-.10,0],pitch:-.12},{p:[-.42,.48,0]},{p:[-.42,.48,0]},{p:[-.40,1.15,0],pitch:-.12},{p:[-.19,1.47,.08],pitch:-1.00,roll:-.55,yaw:.60},{p:[-.19,1.47,.13],pitch:-1.00,roll:-.55,yaw:.60},{p:[.85,1.53,.22],pitch:-1.45,roll:-.12,yaw:.60},{p:[.85,1.53,.22],pitch:-1.45,roll:-.12,yaw:.60},{p:[.85,1.70,.22],pitch:-.85},{p:[.85,2,.22]},{p:[.85,2,.22]}];
 function body(k){root.position.fromArray(k.p);named.pelvis.rotation.set(k.roll||0,k.yaw||0,k.pitch||0);named.head.rotation.z=-(k.pitch||0)*.65;root.updateMatrixWorld(true);}
 const free=keys.map(k=>{rig.reset();body(k);return Object.fromEntries(rig.limbs.map(l=>[l.id,{p:l.c.localToWorld(l.offset.clone()),q:l.c.getWorldQuaternion(Q())}]));});
 const wings=keys.map((k,i)=>[-1,1].map(s=>i<3||i>10?free[i]['wing'+s].p:i<=7?V(0,2,s*.34):V(1.05,2,.22+s*.44)));
 free[7].foot1.q.identity();
 // Let the raised right wing relax during the left-sided press.
 wings[6][1]=free[6].wing1.p.clone();wings[7][1]=free[7].wing1.p.clone();
 wings[9][0].y=2.06;
 const feet=keys.map((k,i)=>[-1,1].map(s=>i<=2?V(-.56,0,s*.157):i===7&&s===1?V(.20,2,.40):i>=10?V(.94,2,.22+s*.157):free[i]['foot'+s].p.clone().add(V(0,i===8||i===9?.05:0,0))));
 // Keep the free legs hanging during the press; settle the toes low on
 // the roof instead of suspending both feet behind a wing-supported body.
 for(const i of [6,7]){feet[i][0].set(-.55,1.65,.23);free[i]['foot-1'].q.identity();}feet[6][1].set(-.35,1.75,.48);free[6].foot1.q.identity();
 for(const i of [8,9]){feet[i][0].set(.32,2,.40);feet[i][1].set(.55,2.06,.70);free[i]['foot-1'].q.identity();free[i].foot1.q.identity();}
 function apply(progress,{heading=0,origin=[0,0,0]}={}){
  if(disposed)throw Error('Hen roof mantle disposed');root.parent?.updateMatrixWorld(true);if(root.scale.distanceTo(V(1,1,1))>1e-8||(root.parent&&!root.parent.matrixWorld.elements.every((v,i)=>Math.abs(v-(i%5===0?1:0))<1e-8)))throw Error('Hen roof mantle requires an unscaled actor under an identity parent');if(!Number.isFinite(progress)||!Number.isFinite(heading)||origin.length!==3||!origin.every(Number.isFinite))throw Error('Invalid hen roof mantle playback');
  for(const row of legs){row.workingPosition.array.set(row.position.array);row.p.geometry.setAttribute('position',row.workingPosition);}for(const row of soft){row.workingPosition.array.set(row.position.array);row.workingNormal.array.set(row.normal.array);row.p.geometry.setAttribute('position',row.workingPosition);row.p.geometry.setAttribute('normal',row.workingNormal);}rig.reset();for(const row of legs){const a=row.p.geometry.attributes.position;for(let j=0;j<a.count;j++){const y=row.position.getY(j);a.setY(j,y+.25*ease((y-.20)/.11)*ease((T.MathUtils.clamp(progress,0,1)*duration-.85)/.4)*(1-ease((T.MathUtils.clamp(progress,0,1)*duration-4.95)/.65)));}a.needsUpdate=true;}feather.geometry.setAttribute('skinIndex',featherIndices);feather.geometry.setAttribute('skinWeight',featherWeights);const value=T.MathUtils.clamp(progress,0,1),time=value*duration,index=phases.findIndex(p=>time<=p.end),i=index<0?phases.length-1:index,ph=phases[i],u=ease((time-ph.start)/(ph.end-ph.start)),a=keys[i],b=keys[i+1],k={p:a.p.map((n,j)=>T.MathUtils.lerp(n,b.p[j],u))};for(const key of['pitch','roll','yaw'])k[key]=T.MathUtils.lerp(a[key]||0,b[key]||0,i===9?ease((u-.42)/.58):u);
  if(i===7)k.p[1]+=.10*Math.sin(Math.PI*u);
  // Gather the right foot underneath before lifting the pelvis off the apron.
  if(i===9)k.p[1]=T.MathUtils.lerp(a.p[1],b.p[1],ease((u-.48)/.52));
  body(k);paint.set(ease(time/.65)*(1-ease((time-5.6)/.65)));const contacts=[];
  // Let the apron hang outside the feathered flank, then drape its free
  // hem on the roof. Folding it inward would intersect the round torso.
  const apron=soft.find(row=>row.p.name==='continuous apron'),fold=ease(time/.65)*(1-ease((time-5.6)/.65));if(fold){const a=apron.p.geometry.attributes;for(let j=0;j<a.position.count;j++){const p=V().fromBufferAttribute(apron.position,j);p.x*=1+.14*fold;p.z*=1+.14*fold;a.position.setXYZ(j,p.x,p.y,p.z);}}
  for(const l of rig.limbs){const side=l.side,j=side<0?0:1,wing=l.id.startsWith('wing');let target=(wing?wings:feet)[i][j].clone().lerp((wing?wings:feet)[i+1][j],u),q=Q(),planted=false,kind='moving';
   if(wing){
    if(i<2||i>=11)target=l.c.localToWorld(l.offset.clone());
    if(i===2)target=free[2][l.id].p.clone().lerp(wings[3][j],u);
    if(i>=3&&i<=6){target=wings[i][j].clone();planted=true;}
    if(i===5&&side===1){target=wings[5][j].clone().lerp(wings[6][j],u);planted=u===0;}
    if(i===6&&side===1){target=wings[6][j].clone().lerp(wings[7][j],u);planted=false;}
    if(i===7){const shift=side===1?(u<.25?ease(u/.25):u<.70?1:ease((u-.70)/.30)):ease((u-.25)/.45),middle=V(.68,2,.50);target=side===1?(u<.70?wings[7][j].clone().lerp(middle,shift):middle.clone().lerp(wings[8][j],shift)):wings[7][j].clone().lerp(wings[8][j],shift);target.y+=.035*Math.sin(Math.PI*shift);planted=side===1?(u>=.25&&u<=.70)||u===1:shift===0||shift===1;}
    if(i===8){target=wings[8][j].clone().lerp(wings[9][j],u);planted=side===1||u===0;}if(i===9){const release=side===1?ease((u-.48)/.26):ease((u-.74)/.26);target=wings[9][j].clone();if(side===-1)target.y=T.MathUtils.lerp(2.06,2,ease(u/.25));target.lerp(l.c.localToWorld(l.offset.clone()),release);planted=release===0&&(side===1||u>=.25);}
    if(i===10){target=l.c.localToWorld(l.offset.clone());planted=false;}
   }else{
    q.copy(free[i][l.id].q).slerp(free[i+1][l.id].q,u);
    if(i<=1||i>=10){q.identity();planted=true;}
    if(i===2){q.identity();}
    if(i===6&&side===1){const t=ease((u-.32)/.68);target.copy(feet[6][j]).lerp(feet[7][j],t);target.y=T.MathUtils.lerp(feet[6][j].y,2,ease(u/.35))+.12*Math.sin(Math.PI*u);q.slerp(Q(),u);}
    if(i===7){target.y+=(side===-1?.30:.18)*Math.sin(Math.PI*u);}
    if(i===8&&side===-1)planted=true;
    if(i===9){const t=side===1?ease(u/.48):ease((u-.48)/.52);target.copy(feet[9][j]).lerp(feet[10][j],t);target.y+=.015*Math.sin(Math.PI*t);q.copy(free[9][l.id].q).slerp(Q(),t);planted=t===1||(side===-1&&t===0);}
   }
   if(wing)l.pole.set(-.4,1,-side*.15);
   if(!wing){const fold=i===6?(side===1?u:0):i===7?(side===1?1:u):i===8?1:i===9?1-u:0;l.pole.set(-1,0,side*.15).lerp(V(.2,1,side*.7),fold);}
   if(!planted){const offset=l.offset.clone().applyQuaternion(q),start=l.a.getWorldPosition(V()),axis=target.clone().sub(offset).sub(start),length=axis.length(),reach=T.MathUtils.clamp(length,Math.abs(l.la-l.lb)+.012,l.la+l.lb-.002);if(length!==reach)target.copy(start).addScaledVector(axis,reach/length).add(offset);}rig.solve(l,target,q);contacts.push({id:l.id,side,point:target.toArray(),planted,kind:planted?(target.y<.1?'floor':'roof'):'moving',error:l.c.localToWorld(l.offset.clone()).distanceTo(target)});
  }
  // Flexible hems and feather fringes settle against the roof. Rigid feet and
  // the fixed-length skeleton are never projected or rescaled.
  const clothDeflection={};root.updateMatrixWorld(true);rig.skeleton.update();for(const {p}of soft){const g=p.geometry,a=g.attributes,position=a.position,matrix=new T.Matrix4(),boneMatrix=new T.Matrix4();for(let j=0;j<position.count;j++){const world=p.getVertexPosition(j,V()).applyMatrix4(p.matrixWorld);const pad=p.name==='continuous apron'?.002:0,across=world.x+pad,depth=2+pad-world.y;if(across<=0||depth<=0||world.y<0)continue;const fixed=world.clone(),up=ease(.5+(across-depth)/.16),push=Math.min(across/Math.max(1e-12,1-up),depth/Math.max(1e-12,up));fixed.x-=push*(1-up);fixed.y+=push*up;clothDeflection[p.name]=Math.max(clothDeflection[p.name]||0,fixed.distanceTo(world));matrix.elements.fill(0);for(let k=0;k<4;k++){boneMatrix.fromArray(rig.skeleton.boneMatrices,a.skinIndex.getComponent(j,k)*16);const weight=a.skinWeight.getComponent(j,k);for(let e=0;e<16;e++)matrix.elements[e]+=boneMatrix.elements[e]*weight;}matrix.premultiply(p.bindMatrixInverse).multiply(p.bindMatrix).premultiply(p.matrixWorld);const adjusted=fixed.applyMatrix4(matrix.invert());position.setXYZ(j,adjusted.x,adjusted.y,adjusted.z);}position.needsUpdate=true;g.computeVertexNormals();}
  const local=root.position.clone(),yaw=Q().setFromAxisAngle(V(0,1,0),-heading*Math.PI/180);root.quaternion.copy(yaw);root.position.copy(local).applyQuaternion(yaw).add(V(...origin));root.updateMatrixWorld(true);rig.skeleton.update();for(const c of contacts)c.worldPoint=V(...c.point).applyQuaternion(yaw).add(V(...origin)).toArray();
  return result={phase:ph.label,phaseIndex:i,progress:value,time,duration,root:local.toArray(),worldRoot:root.position.toArray(),contacts,unarmed:true,clothDeflection,airborne:i===2,supported:contacts.some(c=>c.planted),prone:i===8};
 }
 function restore(){paint.set(0);rig.restore();for(const e of entry){if(e.o.parent===e.parent){e.o.position.copy(e.p);e.o.quaternion.copy(e.q);e.o.scale.copy(e.s);}else {e.o.parent.updateMatrixWorld(true);new T.Matrix4().copy(e.o.parent.matrixWorld).invert().multiply(e.world).decompose(e.o.position,e.o.quaternion,e.o.scale);}e.o.visible=e.visible;e.o.updateMatrixWorld(true);}root.updateMatrixWorld(true);rig.skeleton.update();result=null;}
 restore();return{duration,phases,limbs:rig.limbs,skeleton:rig.skeleton,apply,restore,diagnostics:()=>result,dispose(){if(disposed)return;paint.dispose();rig.dispose();for(const e of entry){e.o.position.copy(e.p);e.o.quaternion.copy(e.q);e.o.scale.copy(e.s);e.o.visible=e.visible;}root.updateMatrixWorld(true);worker.skeleton.update();disposed=true;result=null;}};
}
