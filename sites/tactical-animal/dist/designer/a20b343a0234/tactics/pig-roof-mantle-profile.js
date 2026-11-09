import * as T from './vendor/three.module.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),ease=t=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};

// The pigs retain their authored short legs and deep barrel-shaped torso.
// They press the upper chest over the lip and shift left before lifting the
// right leg, settle onto the belly, then replant the palms in turn to gather.
// This is pose data only: no dimensions, vertices or source skinning are changed.
export function createPigMantleProfile(worker,profile,rest,named){
 if(!['pig-foreman','pig-director'].includes(profile.id))return null;
 const foreman=profile.id==='pig-foreman';
 return {
  edgeSpan:.34,
  tuckGun({index,w}){return index===5?.06*w:index===6?.06:index===7?T.MathUtils.lerp(.06,.10,w):index===8||index===9?.10:index===10?.10*(1-w):0;},
  keys:{
   3:{p:[-.40,.59,0]},4:{p:[-.40,.59,0]},5:{p:[-.40,1.18,0],lean:-.08},
   6:{p:[foreman?-.20:-.18,foreman?1.61:1.54,.08],lean:-.6,sideLean:-.60,hipLean:-.25,hipPitch:-1.15,hipYaw:.65},
   7:{p:[foreman?-.20:-.18,foreman?1.61:1.54,.15],lean:-.6,sideLean:-.60,hipLean:-.25,hipPitch:-1.15,hipYaw:.65},
   8:{p:[.55,foreman?1.642:1.585,.35],hipPitch:-1.4,hipYaw:1.15,hipLean:-.08,lean:-.50,sideLean:-.40},
   9:{p:[.55,foreman?1.642:1.585,.35],hipPitch:-1.4,hipYaw:1.15,hipLean:-.08,lean:-.50,sideLean:-.40},
   10:{p:[.58,foreman?1.57:1.53,.35],hipPitch:-1.05,hipYaw:1.15,lean:-.50}
  },
  configureContacts({keys,feet,hands,body}){
   // Free hanging feet follow the lifted root; the supporting right boot stays
   // close enough to the shorter foreman's hip to keep the knee bent naturally.
   for(const j of [3,4,5,6])for(const i of [0,1]){
    feet[j][i].x+=keys[j].p[0]-[-.34,-.33,-.30,-.29][j-3];
    feet[j][i].y+=keys[j].p[1]-[.48,.45,1.13,1.18][j-3];
   }
   feet[6][0].set(-.28,foreman?1.65:1.62,-.05);feet[6][1].set(-.24,foreman?1.72:1.68,.35);
   feet[7][0].set(-.28,1.62,.10);feet[7][1].x=.25;feet[7][1].z=.48;
   // Keep the right palm beneath its shoulder while relaxing the left arm.
   // Wide shoulders cannot use the horse's narrower palm placements.
   for(const j of [8,9]){
    worker.pose('neutral');body(keys[j]);
    for(const [i,side]of [-1,1].entries()){
     const shoulder=named['upperArm'+side].getWorldPosition(V());
     hands[j][i].set(shoulder.x+(side===-1?-.05:.10),side===-1?2.075:2,shoulder.z);
     if(side===1){feet[j][i].x+=.15;feet[j][i].z-=.15;feet[j][i].y-=.02;}
     else{feet[j][i].x+=.07;feet[j][i].z-=.10;feet[j][i].y-=.11;}
    }
   }
   // Keep the left palm fixed through the early turn. The right arm relaxes
   // with the raised shoulder instead of stretching back down to the roof.
   for(const j of [6,7]){
    hands[j][0].x=0;body(keys[j]);const shoulder=named.upperArm1.getWorldPosition(V());
    hands[j][1].set(shoulder.x+.10,shoulder.y-.40,shoulder.z);
   }
   hands[10]=hands[9].map(v=>v.clone());hands[10][0].y=2;hands[10][0].x+=.15;body(keys[10]);const shoulder=named.upperArm1.getWorldPosition(V());hands[10][1].set(shoulder.x+.10,2,shoulder.z);
  },
  bodyPath({index,u,a,b,k}){
   if(index===5){k.p[1]=T.MathUtils.lerp(a.p[1],b.p[1],ease(u/.75))+.05*Math.sin(Math.PI*u)*(1-ease((u-.5)/.3))-.008*Math.sin(Math.PI*u)*ease((u-.5)/.15);k.p[0]=T.MathUtils.lerp(a.p[0],b.p[0],ease((u-.20)/.80))-.10*Math.sin(Math.PI*u);k.hipPitch=T.MathUtils.lerp(a.hipPitch||0,b.hipPitch,ease(u/.50));k.lean=T.MathUtils.lerp(a.lean,b.lean,ease(u/.50));return;}
   if(index!==7)return;
   // Raise the belly clear before sliding forward; flatten the pelvis while
   // the two-stage palm replant provides continuous support.
   k.hipPitch=T.MathUtils.lerp(a.hipPitch,b.hipPitch,ease(u/.60));
   k.lean=T.MathUtils.lerp(a.lean,b.lean,ease((u-.3)/.7));
   // Clear the lip high, then visibly settle onto the belly during the last part of the slide.
   k.p[1]=T.MathUtils.lerp(a.p[1],b.p[1],ease(u/.45))+.035*Math.sin(Math.PI*u);k.headLift=.20*Math.sin(Math.PI*u);
  },
  footPath({index,u,side,target}){
   if(index===5){target.y+=(foreman?.43:.36)*(ease(u/.75)-ease(u))+.10*Math.sin(Math.PI*u);target.x+=.22*(ease((u-.20)/.80)-ease(u))-.10*Math.sin(Math.PI*u);return;}
   if(index!==7)return;
   const t=side===-1?ease((u-.05)/.95):ease(u),lift=side===-1?(foreman?.52:.62):.22;
   // The common controller supplies .32; this adds only the pig-specific
   // difference. Keep the long toe outside the face until it clears the lip.
   target.y+=(lift-.32)*Math.sin(Math.PI*t)+.035*Math.sin(Math.PI*u);
   if(side===-1)target.x-=.06*Math.sin(Math.PI*t);
  },
  footPole({index,u,side,pole}){
   const t=index===7?ease(u):index===8?1:index===9?1-ease(u/.12):0;pole.lerp(V(-.1,-1,side*.3),t);
  },
  handPath({index,u,side,i,target,hands}){
   if(index===5){const t=ease(u/.86);target.copy(hands[5][i]).lerp(hands[6][i],t);if(side===1)target.y+=.18*Math.sin(Math.PI*t);}
   if(index===7&&side===-1){const t=ease((u-.30)/.35);target.copy(hands[7][i]).lerp(hands[8][i],t);target.y+=.10*Math.sin(Math.PI*t);}
   if(index===7&&side===1){
    const first=ease(u/.30),second=ease((u-.65)/.35);
    target.copy(hands[7][i]).lerp(V(.65,2,.10),first).lerp(hands[8][i],second);
    target.y+=.15*Math.sin(Math.PI*first)+.06*Math.sin(Math.PI*second);
   }
   if(index===9){target.copy(hands[9][i]);if(side===-1)target.lerp(hands[10][i],ease(u/.25));else{const t=ease((u-.25)/.35);target.lerp(hands[10][i],t);target.y+=.05*Math.sin(Math.PI*t);}}
  },
  plantedHand({index,u,side}){
   if(index===5)return side===-1||u===0;
   if(index===6)return side===-1;
   if(index===7)return side===-1?u<=.30:u>=.30&&u<=.65;
   if(side===-1&&(index===8||index===9&&u<.25))return false;
   if(index===9&&side===1)return u<=.25||u>=.60;
   return index===9?true:undefined;
  }
 };
}
