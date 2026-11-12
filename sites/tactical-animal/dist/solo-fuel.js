import {gridDimensions} from './world-grid.js';
export const FUEL_BLAST_RADIUS=5;
export function tankExplosionChance(unit,zone){
  const carrying=unit.weapon==='flamethrower'||unit.pack?.some(i=>i.type==='weapon'&&i.kind==='flamethrower');
  if(!carrying||unit.tanksExploded||(unit.ammo?.flamethrower??0)<=0)return 0;
  return zone==='torso'?.25:zone==='weapon'&&unit.weapon==='flamethrower'?.9:0;
}
export function createFuelRules({kill,ignite,recordBurn,inside,log,windowBlast=()=>{}}){
  function blast(s,origin,wearer=null){
    windowBlast(s,origin,FUEL_BLAST_RADIUS,{ignoreWalls:true});
    s.fires??=[];const fires=[],{width,height}=gridDimensions(s);
    for(let y=Math.max(0,Math.ceil(origin.y-5));y<=Math.min(height-1,Math.floor(origin.y+5));y++)for(let x=Math.max(0,Math.ceil(origin.x-5));x<=Math.min(width-1,Math.floor(origin.x+5));x++){
      if(!inside(s,{x,y})||Math.hypot(x-origin.x,y-origin.y)>5||['void','water'].includes(s.map[y][x]))continue;
      const old=s.fires.find(p=>p.x===x&&p.y===y&&(p.z||0)===origin.z);
      if(old)old.turns=3;else{const p={x,y,z:origin.z,turns:3};s.fires.push(p);fires.push({...p});}
    }
    // Three integer-centred AFT cells span a physical 3 m square. Keep that
    // square centred on the actual fractional blast position; never snap actors.
    const victims=s.units.filter(u=>u.hp>0&&(u.z||0)===origin.z&&Math.abs(u.x-origin.x)<=1.5&&Math.abs(u.y-origin.y)<=1.5);
    for(const u of victims){kill(s,u);if(u!==wearer)recordBurn(s,u,'ash');}
    for(const u of s.units)if((u.z||0)===origin.z&&Math.hypot(u.x-origin.x,u.y-origin.y)<=5)ignite(s,u);
    return {fires,burns:s.units.filter(u=>victims.includes(u)||u.burningTurns&&Math.hypot(u.x-origin.x,u.y-origin.y)<=5).map(u=>u.id)};
  }
  function explode(s,wearer){
    const weapon=wearer.weapon,origin={x:wearer.x,y:wearer.y,z:wearer.z||0};
    wearer.tanksExploded=true;wearer.ammo.flamethrower=0;wearer.ammoPouch.flamethrower=0;
    wearer.pack=(wearer.pack||[]).filter(i=>i.kind!=='flamethrower');wearer.slots=(wearer.slots||[]).filter(id=>id!=='flamethrower');
    if(wearer.weapon==='flamethrower')wearer.weapon='hands';
    const {fires,burns}=blast(s,origin,wearer);
    const receipt=recordBurn(s,wearer,'tank');receipt.weapon=weapon;receipt.fires=fires;receipt.worn=weapon==='flamethrower';
    log(s,wearer.name+"'s fuel tanks exploded.");
    return {...origin,h:.8,kind:'tank',unitId:wearer.id,fireSequence:receipt.sequence,burns};
  }
  function barrel(s,prop){
    const origin={x:prop.x,y:prop.y,z:prop.z||0},result=blast(s,origin);
    const sequence=s.fireAnimationSequence=(s.fireAnimationSequence||0)+1;
    (s.fireAnimations??=[]).push({sequence,kind:'barrel',prop:{...prop},route:[origin],fires:result.fires});
    s.fireAnimations=s.fireAnimations.slice(-128);
    return {...origin,h:.4,kind:'barrel',fireSequence:sequence,burns:result.burns};
  }
  function restore(s){
    for(const u of s.units)if(u.tanksExploded!==undefined&&(typeof u.tanksExploded!=='boolean'||u.tanksExploded&&(u.ammo?.flamethrower>0||u.ammoPouch?.flamethrower>0||u.weapon==='flamethrower'||u.pack?.some(i=>i.kind==='flamethrower')||u.slots?.includes('flamethrower'))))throw Error('Unsupported destroyed-tank save.');
  }
  return {explode,barrel,restore};
}
