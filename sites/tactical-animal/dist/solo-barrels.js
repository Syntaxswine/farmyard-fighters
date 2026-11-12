// Continuous-coordinate adapter for AFT3D's fuel-blast/barrel receipt contract.
import {barrelId,isExplosiveBarrel} from './aft/tactics/explosive-barrels.js';
export function createBarrelRules({explode,clearGeometry,log}){
  function present(s,id){return (s.props||[]).find(p=>isExplosiveBarrel(p)&&barrelId(p)===id);}
  function remove(s,ids){
    const removed=(s.props||[]).filter(p=>ids.has(barrelId(p))&&isExplosiveBarrel(p));
    s.props=(s.props||[]).filter(p=>!removed.includes(p));
    s.obstacles=(s.obstacles||[]).filter(box=>box.sourceKind!=='barrel-explosive'||!removed.some(p=>p.x>=box.x0&&p.x<=box.x1&&p.y>=box.y0&&p.y<=box.y1));
    clearGeometry(s);
  }
  function detonate(s,targets,event){
    const pending=targets.map(p=>typeof p==='string'?p:barrelId(p)),blasts=[];
    for(let i=0;i<pending.length;i++){
      const prop=present(s,pending[i]);if(!prop)continue;
      // Remove first so overlapping blasts and pellets cannot commit it twice.
      remove(s,new Set([barrelId(prop)]));
      (s.solo.destroyedBarrels??=[]).push(barrelId(prop));
      const blast=explode(s,prop);blasts.push(blast);(event.explosions??=[]).push(blast);event.hit=true;
      for(const next of s.props)if(isExplosiveBarrel(next)&&(next.z||0)===(prop.z||0)&&Math.hypot(next.x-prop.x,next.y-prop.y)<=5)pending.push(barrelId(next));
      log(s,'Explosive barrel detonated.');s.revision++;
    }
    return blasts;
  }
  function restore(s){
    const ids=s.solo.destroyedBarrels;if(ids===undefined)return;
    const source=(s.props||[]).filter(isExplosiveBarrel).map(barrelId);
    if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!source.includes(id)))throw Error('Unsupported destroyed barrel state.');
    remove(s,new Set(ids));
  }
  return {present,detonate,restore};
}
