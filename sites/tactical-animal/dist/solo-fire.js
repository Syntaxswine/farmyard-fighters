// Farmyard's continuous-coordinate adapter for the pinned AFT 3D fire rules.
// Only simulation commands write these receipts. Presentation never advances it.
export const firePending=s=>(s.fires?.length||0)>0||s.units.some(u=>u.hp>0&&u.burningTurns>0);
export const firePoint=u=>({x:u.x,y:u.y,z:u.z||0,heading:u.heading||0});
export function recordBurn(s,u,kind,route=[firePoint(u)]){
  if(kind==='ash'||kind==='tank')u.burnedRemains=true;
  const event={sequence:s.fireAnimationSequence=(s.fireAnimationSequence||0)+1,unitId:u.id,kind,weapon:u.weapon,route};
  (s.fireAnimations??=[]).push(event);s.fireAnimations=s.fireAnimations.slice(-128);return event;
}
export function createFireRules({kill,walkSegment,random,key,log,onIgnite=()=>{}}){
  function ignite(s,u){
    if(!u||u.hp<=0||u.burningTurns>0)return false;
    onIgnite(s,u);u.burningTurns=3;u.ap=0;u.stance='standing';u.running=u.sneaking=u.isMoving=false;
    u.alert=true;s.queue=[];s.panicDelay=3;recordBurn(s,u,'ignite');log(s,u.name+' is on fire / 3 panic turns.');return true;
  }
  function enterFire(s,u){if(s.fires?.some(p=>p.turns>0&&key(p.x,p.y)===key(u.x,u.y)))return ignite(s,u);return false;}
  function panicRun(s,u){
    if(u.hp<=0||!u.burningTurns||u.fireActedRound===s.round)return false;
    const route=[firePoint(u)],heading=Math.floor(random(s)*8)*Math.PI/4;
    for(let step=0;step<3;step++){
      const choices=[];
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if(dx||dy){const p={x:u.x+dx,y:u.y+dy};if(walkSegment(s,u,p,u.id))choices.push(p);}
      choices.sort((a,b)=>Math.cos(Math.atan2(b.y-u.y,b.x-u.x)-heading)-Math.cos(Math.atan2(a.y-u.y,a.x-u.x)-heading));
      const p=choices[0];if(!p)break;
      const d=Math.hypot(p.x-u.x,p.y-u.y);u.heading=Math.atan2(p.y-u.y,p.x-u.x)*180/Math.PI;u.x=p.x;u.y=p.y;u.travelled+=d;
      if(u.team==='squad')s.solo.distance+=d;
      route.push(firePoint(u));
    }
    u.ap=0;u.isMoving=false;u.fireActedRound=s.round;recordBurn(s,u,'panic',route);return true;
  }
  function finishRound(s){
    for(const u of s.units)if(u.burningTurns>0&&u.fireActedRound===s.round){
      u.burningTurns--;if(!u.burningTurns&&u.hp>0){kill(s,u);recordBurn(s,u,'ash');log(s,u.name+' burned to ash.');}
    }
    if(s.fires)s.fires=s.fires.map(p=>({...p,turns:p.turns-1})).filter(p=>p.turns>0);
  }
  function restore(s,inside){
    if(s.fires!==undefined&&(!Array.isArray(s.fires)||s.fires.some(p=>!p||!Number.isInteger(p.x)||!Number.isInteger(p.y)||!inside(p)||!Number.isInteger(p.turns)||p.turns<1||p.turns>3||(p.z??0)!==0)))throw Error('Unsupported fire save.');
    const cells=new Set();for(const p of s.fires||[]){const k=key(p.x,p.y);if(cells.has(k))throw Error('Duplicate fire cell.');cells.add(k);}
    for(const u of s.units){
      if(u.burningTurns!==undefined&&(!Number.isInteger(u.burningTurns)||u.burningTurns<0||u.burningTurns>3)||u.fireActedRound!==undefined&&(!Number.isInteger(u.fireActedRound)||u.fireActedRound<0||u.fireActedRound>s.round)||u.burnedRemains!==undefined&&typeof u.burnedRemains!=='boolean'||u.burnedRemains&&u.hp>0||u.burningTurns&&(u.hp<=0||u.ap!==0||u.stance!=='standing'||u.running||u.sneaking))throw Error('Unsupported burn save.');
    }
    if(s.panicDelay!==undefined&&(!Number.isFinite(s.panicDelay)||s.panicDelay<0||s.panicDelay>3))throw Error('Unsupported panic clock.');
    // Receipts are transient; positions/countdowns are already committed.
    delete s.fireAnimations;delete s.effect;return s;
  }
  return {ignite,enterFire,panicRun,finishRound,restore};
}
