import {invalidateMapGeometry} from './map-geometry-cache.js';
import {blastStrategicSites} from './strategic-site-damage.js';
import {inBounds,terrainAt,levelOf} from './core/maps.js';
import {unitBaseHeight} from './tower-geometry.js';
import {barrelId,isExplosiveBarrel} from './explosive-barrels.js';
import {planStructureBlast,commitStructureDamage} from './structure-damage.js';

export const FUEL_BLAST_RADIUS=5;
export const fuelBlastReaches=(origin,p)=>levelOf(p)===levelOf(origin)&&Math.hypot(p.x-origin.x,p.y-origin.y,unitBaseHeight(p)-unitBaseHeight(origin))<=FUEL_BLAST_RADIUS;
const present=u=>!u.away&&!['quit','captured','dead'].includes(u.casualty)&&(u.hp>0||['bleeding','stable'].includes(u.casualty));

// Tanks and barrels share this one rules path: lethal 3×3 centre, five-tile
// ignition radius, dry-cell fire for three rounds, and the existing height rules.
// The engine supplies the ordinary casualty, loot and panic operations.
export function applyFuelBlast(s,origin,{damage,ignite,burn},source=null,owner=null){
 const structuralOrigin={...origin,h:unitBaseHeight(origin)+.4},plans=planStructureBlast(s,structuralOrigin,FUEL_BLAST_RADIUS,d=>180*(1-d/FUEL_BLAST_RADIUS),{spacing:3});
 const z=levelOf(origin),fires=[];s.fires||=[];
 for(let y=origin.y-5;y<=origin.y+5;y++)for(let x=origin.x-5;x<=origin.x+5;x++){
  if(origin.towerPost||!inBounds(x,y,z)||Math.hypot(x-origin.x,y-origin.y)>FUEL_BLAST_RADIUS||['void','water'].includes(terrainAt(s,x,y,z)))continue;
  const old=s.fires.find(p=>p.x===x&&p.y===y&&p.z===z);
  if(old)old.turns=3;else{const cell={x,y,z,turns:3};s.fires.push(cell);fires.push({...cell});}
 }
 const victims=s.units.filter(u=>present(u)&&levelOf(u)===z&&Math.abs(unitBaseHeight(u)-unitBaseHeight(origin))<=1&&Math.max(Math.abs(u.x-origin.x),Math.abs(u.y-origin.y))<=1);
 for(const u of victims){damage(s,u,Math.max(u.hp,1),true,source);if(u!==owner)burn(s,u,'ash');}
 for(const u of s.units)if(fuelBlastReaches(origin,u))ignite(s,u);
 const sites=blastStrategicSites(s,{...origin,h:unitBaseHeight(origin)+.4},FUEL_BLAST_RADIUS);
 const structures=commitStructureDamage(s,plans);
 return {sites,fires,victims,structures:structures.receipts,before:structures.before,burns:s.units.filter(u=>victims.includes(u)||u.burningTurns&&fuelBlastReaches(origin,u)).map(u=>u.id)};
}

// Remove before expanding the queue: every barrel commits exactly once, even
// when several pellets, explosions or neighbouring barrels reach it together.
export function detonateBarrels(s,targets,hooks,source=null){
 const pending=targets.map(p=>typeof p==='string'?p:barrelId(p)),blasts=[];
 for(let i=0;i<pending.length;i++){
  const prop=s.props.find(p=>isExplosiveBarrel(p)&&barrelId(p)===pending[i]);if(!prop)continue;
  s.props=s.props.filter(p=>p!==prop);invalidateMapGeometry(s);
  const result=applyFuelBlast(s,prop,hooks,source),sequence=(s.fireAnimationSequence??0)+1;s.fireAnimationSequence=sequence;
  const receipt={sequence,kind:'barrel',prop:{...prop},route:[{x:prop.x,y:prop.y,z:prop.z||0}],fires:result.fires};
  (s.fireAnimations??=[]).push(receipt);if(s.fireAnimations.length>128)s.fireAnimations.splice(0,s.fireAnimations.length-128);
  blasts.push({x:prop.x,y:prop.y,z:prop.z||0,h:unitBaseHeight(prop)+.4,kind:'barrel',propId:barrelId(prop),fireSequence:sequence,burns:result.burns,structures:result.structures,before:result.before});
  for(const next of s.props)if(isExplosiveBarrel(next)&&fuelBlastReaches(prop,next))pending.push(barrelId(next));
 }
 return blasts;
}
