import * as T from './vendor/three.module.js';
import {createHenMotion} from './hen-motion.js';
import {createGrenadeThrow} from './grenade-throw-motion.js';

// The feather tips cup and flick the prop. This is a wing-specific animation
// rig, not a claim that the hen now supports mammalian firearm grips.
export function createHenGrenadeThrow(worker,grenade,{preparedBalance=null}={}){
 const locomotion=createHenMotion(worker),root=worker.root;
 const base=locomotion.skeleton.bones,bones=[...base],named=Object.fromEntries(base.map(b=>[b.name,b]));
 const saved=worker.parts.map(p=>({p,si:p.geometry.attributes.skinIndex.clone(),sw:p.geometry.attributes.skinWeight.clone(),paintNormal:p.geometry.attributes.paintNormal.clone()}));
 const added=[],aliases={pelvis:'hips',breast:'spine'};
 let skeleton,motion,disposed=false;
 function dispose(){if(disposed)return;disposed=true;motion?.dispose();grenade.root.removeFromParent();
  for(const {p,si,sw,paintNormal} of saved){p.geometry.setAttribute('skinIndex',si);p.geometry.setAttribute('skinWeight',sw);p.geometry.setAttribute('paintNormal',paintNormal);p.bind(locomotion.skeleton);}
  for(const b of added)b.removeFromParent();skeleton?.dispose();locomotion.dispose();
 }
 try{
  for(const s of [-1,1]){
   for(const [from,to] of [['wing ','upperArm'],['wing tip ','forearm'],['thigh ','thigh'],['shank ','shin'],['foot ','hoof']])aliases[from+s]=to+s;
   const tip=named['wing tip '+s],hand=new T.Bone();hand.name='hand'+s;tip.add(hand);
   root.updateMatrixWorld(true);hand.position.copy(tip.worldToLocal(new T.Vector3(-.111,.60,s*.398)));bones.push(hand);added.push(hand);
   const fingers=new T.Bone();fingers.name='fingers'+s;fingers.position.set(.03,-.07,0);hand.add(fingers);bones.push(fingers);
  }
  root.updateMatrixWorld(true);skeleton=new T.Skeleton(bones);skeleton.calculateInverses();
  for(const p of worker.parts){
   if(['continuous apron','apron waist tie','fitted waistcoat'].includes(p.name)){
    const a=p.geometry.attributes;
    for(let i=0;i<a.position.count;i++){
     const chest=T.MathUtils.smoothstep(a.position.getY(i),.80,1.06);
     a.skinIndex.setXYZW(i,bones.indexOf(named.pelvis),bones.indexOf(named.breast),0,0);a.skinWeight.setXYZW(i,1-chest,chest,0,0);
    }
   }
   if(p.name.includes('layered wing')){
    const side=p.name.endsWith(' -1')?-1:1,a=p.geometry.attributes;
    for(let i=0;i<a.position.count;i++){
     const y=a.position.getY(i),lower=1-T.MathUtils.smoothstep(y,.79,1.02),cup=1-T.MathUtils.smoothstep(y,.63,.75),curl=(1-T.MathUtils.smoothstep(y,.515,.585))*.9;
     a.skinIndex.setXYZW(i,bones.indexOf(named['wing '+side]),bones.indexOf(named['wing tip '+side]),bones.findIndex(b=>b.name==='hand'+side),bones.findIndex(b=>b.name==='fingers'+side));
     a.skinWeight.setXYZW(i,1-lower,lower*(1-cup),lower*cup*(1-curl),lower*cup*curl);
     // The turnaround shows the folded wing's outer feathers. Use that painted
     // surface on the newly exposed inside too, instead of projecting the apron.
     if(a.paintNormal.getZ(i)*side<.5)a.paintNormal.setXYZ(i,0,0,side);
    }
    a.paintNormal.needsUpdate=true;
   }
   p.bind(skeleton);p.geometry.attributes.skinIndex.needsUpdate=p.geometry.attributes.skinWeight.needsUpdate=true;
  }
  const adapter={...worker,bones,skeleton,equipWeapon:prop=>root.add(prop.root),pose(){locomotion.restore();for(const b of bones)b.quaternion.identity();root.updateMatrixWorld(true);skeleton.update();}};
  motion=createGrenadeThrow(adapter,grenade,{animal:'hen',boneNames:aliases,wing:true,releaseArc:[92,66,.43],preparedBalance});
  return {...motion,worker,kind:'wing toss',dispose};
 }catch(error){dispose();throw error;}
}
