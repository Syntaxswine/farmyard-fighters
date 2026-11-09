import * as T from './vendor/three.module.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),ease=t=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};

// Shared worker sequence: clear the chest and shift left before the lead leg.
// Contacts are authored in ledge space; source proportions remain unchanged.
export function createWorkerMantleProfile(worker,profile,rest,named){
 const shape={
  horse:{height:1.36,lean:.20,hmg:.055},
  goat:{height:1.354,lean:.30,hmg:.065},
  bull:{height:1.37,lean:0,hmg:.055},
  cow:{height:1.36,lean:.20,hmg:.055},
  donkey:{height:1.37,lean:0,hmg:.055},
  sheep:{height:1.37,lean:0,hmg:.055},
  skunk:{height:1.357,lean:.30,hmg:.055},
  rabbit:{height:1.36,lean:.20,hmg:.085},
  dog:{height:1.37,lean:0,hmg:.055}
 }[profile.id];
 if(!shape)return null;
 const flatHeight=shape.height,flatLean=shape.lean;
 return {
  placeEquipment({index,w,gun}){
   if(worker.weapon.id!=='hmg')return;
   const flat=index===7?w:index===8||index===9?1:index===10?1-w:0;
   // Move around the skunk's plume as the torso turns, after the carry grip
   // has released. Syncing the sling later keeps it attached to this placement.
   const turn=index===5?w:index>=6&&index<=9?1:index===10?1-w:0;
   gun.position.add(V(-shape.hmg*flat,0,profile.id==='skunk'?.20*turn:0).applyQuaternion(named.spine.getWorldQuaternion(new T.Quaternion())));
  },
  keys:{
   6:{p:[-.19,1.46,.08],lean:-.50,sideLean:-.60,hipLean:-.25,hipPitch:-1.10,hipYaw:.65},
   7:{p:[-.19,1.46,.15],lean:-.50,sideLean:-.60,hipLean:-.25,hipPitch:-1.10,hipYaw:.65},
   8:{p:[.55,flatHeight,.35],lean:flatLean},9:{p:[.55,flatHeight,.35],lean:flatLean}
  },
  configureContacts({keys,feet,hands,body}){
   feet[6][0].set(-.34,1.52,-.05);feet[6][1].set(-.32,1.58,.35);
   feet[7][0].set(-.27,1.52,.10);
   for(const j of [6,7]){
    body(keys[j]);const shoulder=named.upperArm1.getWorldPosition(V());
    hands[j][1].set(shoulder.x+.10,shoulder.y-.40,shoulder.z);
   }
  },
  bodyPath({index,u,a,b,k}){
   if(index===9){k.p[1]+=.012*Math.sin(Math.PI*u);return;}
   if(index!==5)return;
   k.p[1]=T.MathUtils.lerp(a.p[1],b.p[1],ease(u/.75));
   k.p[0]=T.MathUtils.lerp(a.p[0],b.p[0],ease((u-.20)/.80))-.08*Math.sin(Math.PI*u);
   k.hipPitch=T.MathUtils.lerp(a.hipPitch||0,b.hipPitch,ease(u/.50));
   k.lean=T.MathUtils.lerp(a.lean,b.lean,ease(u/.50));
  },
  footPath({index,u,side,target}){
   if(index===5){target.y+=.33*(ease(u/.75)-ease(u))+.05*Math.sin(Math.PI*u);target.x+=.11*(ease((u-.20)/.80)-ease(u))-.08*Math.sin(Math.PI*u);}
  },
  footPole({index,u,side,pole}){
   if(index!==9)return;
   pole.copy(rest.get(named['shin'+side])).sub(rest.get(named['thigh'+side])).applyQuaternion(named.hips.getWorldQuaternion(new T.Quaternion())).lerp(V(-.1,1,side*.3),ease(u/.20));
  },
  handPath({index,u,side,i,target,hands}){
   if(index===5){const t=ease(u/.86);target.copy(hands[5][i]).lerp(hands[6][i],t);if(side===1)target.y+=.10*Math.sin(Math.PI*t);}
   if(index===7&&side===-1){const t=ease((u-.30)/.35);target.copy(hands[7][i]).lerp(hands[8][i],t);target.y+=.10*Math.sin(Math.PI*t);}
   if(index===7&&side===1){const first=ease(u/.30),second=ease((u-.65)/.35);target.copy(hands[7][i]).lerp(V(.50,2,.15),first).lerp(hands[8][i],second);target.y+=.10*Math.sin(Math.PI*first)+.06*Math.sin(Math.PI*second);}
  },
  plantedHand({index,u,side}){
   if(index===5)return side===-1||u===0;
   if(index===6)return side===-1;
   if(index===7)return side===-1?u<=.30||u>=.65:u>=.30&&u<=.65;
  }
 };
}
