import * as T from './aft/tactics/vendor/three.module.js';
import {visibleShotSegments} from './aft/tactics/battle-shot-effects.js';
import {BattleAudio} from './designer/a20b343a0234/tactics/battle-audio.js';
import {GUN_SOUND} from './designer/a20b343a0234/tactics/battle-sound-data.js';
import {projectileSegmentClear} from './solo-game.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const shotPoint=point=>({x:point.x,y:point.z,h:point.y});
const clipIds=[...new Set(Object.values(GUN_SOUND)),'shotgun-pump','explosion-large','explosion-deep','flame-ignite','melee-swing'];
const urls=Object.fromEntries(clipIds.map(id=>[id,new URL('./assets/audio/weapon-sfx/'+id+'.wav',import.meta.url).href]));
export const GRENADE_IMPACT_MS=500;
export const ballistic=weapon=>Object.hasOwn(GUN_SOUND,weapon)||weapon==='rpg'||weapon==='launcher';

export function createWeaponAudio(){
  return new BattleAudio({urls,target:null,volume:.55});
}

export function playWeaponSound(audio,event,state,delay=0){
  if(!audio||!state||globalThis.document?.hidden)return;
  const origin={x:event.ax,y:event.ay};
  if(event.weapon==='grenade'||event.weapon==='rpg'||event.weapon==='launcher'){
    const thrown=event.weapon==='grenade';
    audio.play(thrown?'explosion-large':'explosion-deep',{x:event.bx,y:event.by},state,{delay:thrown?GRENADE_IMPACT_MS/1000:0,priority:2,range:64});
    return;
  }
  const clip=GUN_SOUND[event.weapon]||(event.weapon==='flamethrower'?'flame-ignite':'melee-swing');
  audio.play(clip,origin,state,{delay,range:clip==='melee-swing'?8:48});
  if(event.weapon==='shotgun')audio.play('shotgun-pump',origin,state,{delay:.35,priority:.5,range:18});
}

export function tracerMesh(weapon,incoming=false){
  const color=incoming?0xff8066:weapon==='rpg'||weapon==='launcher'?0xffae58:0xffdf90;
  const beam=new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial({
    color,side:T.DoubleSide,transparent:true,depthWrite:false,toneMapped:false
  }));
  beam.name='Weapon tracer';
  return beam;
}

export function traceEnd(event){
  const end=event.traceEnd??{x:event.bx,y:event.by,h:event.bh??.9};
  return V(end.x,end.h,end.y);
}

export function traceStart(event,muzzle,end,state){
  const start=V(event.ax,event.ah??1.1,event.ay);
  const direction=end.clone().sub(start),distance=direction.length();
  if(!distance)return start;
  if(event.sourceVisible===false)return start.addScaledVector(direction,Math.min(.9/distance,1));
  if(!(muzzle&&muzzle.distanceToSquared(start)<1.8&&muzzle.clone().sub(start).dot(direction)<distance*distance))return start;
  const bore=shotPoint(muzzle);
  if(state&&(!projectileSegmentClear(state,shotPoint(start),bore)||!projectileSegmentClear(state,bore,shotPoint(end))))return start;
  return muzzle;
}

// Crossed world-space ribbons remain legible on mobile GPUs where line width
// is fixed to one pixel. Reuse AFT's fog clipping before filling the ribbons.
export function setTracer(beam,start,end,state,weapon){
  start.shotLevel=end.shotLevel=0;
  const points=state?.visible?visibleShotSegments(state,[start,end]):[start,end];
  const tapered=!!state?.realtime&&Object.hasOwn(GUN_SOUND,weapon);
  const positions=[],colors=[],length=start.distanceTo(end);
  const width=weapon==='rpg'?.082:weapon==='launcher'?.062:.044;
  // Measure along the whole shot so a visible run past fog does not grow a new tail.
  const progress=p=>length?Math.min(1,start.distanceTo(p)/length):0;
  const widthAt=t=>{
    if(tapered)return width*T.MathUtils.lerp(.28,1,t);
    return state?.realtime&&length?width*(1+.6*(1-t)):width;
  };
  for(let i=0;i<points.length;i+=2){
    const a=points[i];let b=points[i+1];
    while(points[i+2]?.equals(b)){i+=2;b=points[i+1];}
    const direction=b.clone().sub(a).normalize();
    const side=V().crossVectors(direction,Math.abs(direction.y)>.95?V(1,0,0):V(0,1,0)).normalize();
    const from=progress(a),to=progress(b),startWidth=widthAt(from),endWidth=widthAt(to);
    for(const offset of [side,V().crossVectors(direction,side)]){
      const p=a.clone().addScaledVector(offset,startWidth),q=a.clone().addScaledVector(offset,-startWidth);
      const r=b.clone().addScaledVector(offset,-endWidth),s=b.clone().addScaledVector(offset,endWidth);
      positions.push(...p.toArray(),...q.toArray(),...r.toArray(),...p.toArray(),...r.toArray(),...s.toArray());
      if(tapered){
        const tail=[1,1,1,T.MathUtils.lerp(.10,1,from)],head=[1,1,1,T.MathUtils.lerp(.10,1,to)];
        colors.push(...tail,...tail,...head,...tail,...head,...head);
      }
    }
  }
  beam.geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  if(tapered)beam.geometry.setAttribute('color',new T.Float32BufferAttribute(colors,4));
  else beam.geometry.deleteAttribute('color');
  if(beam.material.vertexColors!==tapered){beam.material.vertexColors=tapered;beam.material.needsUpdate=true;}
  beam.geometry.computeBoundingSphere();
  return positions.length>0;
}

export function surfaceImpactFlash(end){
  // The cover and ground marker from AFT's BattleShotEffects.
  const flash=new T.Mesh(new T.OctahedronGeometry(.07),new T.MeshBasicMaterial({
    color:0xd5b78a,opacity:.8,transparent:true,depthWrite:false,toneMapped:false
  }));
  flash.name='Surface impact';
  flash.position.copy(end);flash.position.shotLevel=end.shotLevel;
  return flash;
}

export function muzzleFlash(origin,end,weapon){
  const heavy=weapon==='rpg'||weapon==='launcher'||weapon==='backblast';
  const flash=new T.Mesh(new T.IcosahedronGeometry(1,0),new T.MeshBasicMaterial({
    color:weapon==='backblast'?0xfba46a:heavy?0xffb653:0xffefa8,transparent:true,depthWrite:false,toneMapped:false
  }));
  flash.name=weapon==='backblast'?'RPG exhaust':'Weapon muzzle flash';
  flash.position.copy(origin);
  flash.scale.set(heavy?.30:.19,heavy?.15:.105,heavy?.15:.105);
  flash.quaternion.setFromUnitVectors(V(1,0,0),end.clone().sub(origin).normalize());
  return flash;
}
