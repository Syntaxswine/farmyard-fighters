import {unitBaseHeight} from './tower-geometry.js';
import {MAP_LEVELS} from './map-layers.js';

// Simulation facts only. Rendering and its random stream never enter this module.
export const BODY_IMPACT_VERSION=1;
export const IMPACT_COORDINATES='tactical-x-y-height-v1';
export const FATAL_HEAD_RULE=Object.freeze({remainingHpMultiplier:2,maxHpFloor:.5});
const point=p=>({x:p.x,y:p.y,h:p.h});
const casualty=u=>u.hp>0?'alive':['bleeding','stable'].includes(u.casualty)?u.casualty:'dead';
export function supportSnapshot(u){
 const level=u.cliffSupport&&!u.towerPost?u.cliffSupport.level:(u.z||0),baseHeight=unitBaseHeight(u);
 return {kind:u.towerPost?'tower':u.cliffSupport?'cliff':'layer',level,baseHeight,offset:baseHeight-level*3};
}
export function beginGunshotAction(state){
 const sequence=(state.gunshotSequence||0)+1;
 if(!Number.isSafeInteger(sequence))throw Error('Gunshot event sequence exhausted');
 state.gunshotSequence=sequence;
 return {id:`shot:${sequence}`,discharges:0,hp:new Map(state.units.map(u=>[u.id,u.hp]))};
}
export function stampGunshotEvent(event,action,shooter,units){
 event.impactVersion=BODY_IMPACT_VERSION;event.attackId=action.id;
 event.dischargeIndex=action.discharges++;event.dischargeId=`${action.id}/d:${event.dischargeIndex}`;
 event.bodyImpacts=[];
 const support=supportSnapshot(shooter);
 for(const [i,trajectory] of event.trajectories.entries()){
  trajectory.projectileIndex=i;trajectory.projectileId=`${event.dischargeId}/p:${i}`;
  trajectory.origin={...trajectory.origin,support:{...support}};
  const victim=trajectory.kind==='unit'&&units.find(u=>u.id===trajectory.unitId);
  if(victim)trajectory.support=supportSnapshot(victim);
 }
}
export function fatalHeadDecision({zone,damage,hpAtActionStart,maxHp,hpAfter,eligible=true,alreadyFatal=false}){
 const threshold=Math.max(FATAL_HEAD_RULE.remainingHpMultiplier*hpAtActionStart,FATAL_HEAD_RULE.maxHpFloor*maxHp);
 const reason=!eligible?'not-body-projectile':alreadyFatal?'already-fatal':zone!=='head'?'not-head':damage<=0?'no-injury':damage<threshold?'below-threshold':hpAfter>0?'survived':'qualified';
 return {fatalHead:reason==='qualified',threshold,qualificationReason:reason};
}
export function impactVisualSeed(id){let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h;}
export function prepareBodyImpact(event,action,trajectory,victim,damage){
 if(trajectory?.kind!=='unit'||trajectory.unitId!==victim.id||!(damage>0)||!event.dischargeId)return null;
 const hpAtActionStart=action.hp.get(victim.id)??victim.hp;
 const decision=fatalHeadDecision({zone:trajectory.zone,damage,hpAtActionStart,maxHp:victim.maxHp,hpAfter:Math.max(0,victim.hp-damage),alreadyFatal:!!victim.fatalHead});
 const id=`${trajectory.projectileId}/body:${victim.id}`;
 return {version:BODY_IMPACT_VERSION,id,attackId:event.attackId,dischargeId:event.dischargeId,
  projectileId:trajectory.projectileId,projectileIndex:trajectory.projectileIndex,victimId:victim.id,shooterId:event.shooter,
  coordinates:IMPACT_COORDINATES,contact:point(trajectory),incoming:point(trajectory.direction),origin:point(trajectory.origin),
  originSupport:{...trajectory.origin.support},zone:trajectory.zone,
  victim:{species:victim.species,stance:victim.stance||'standing',heading:victim.heading||0,x:victim.x,y:victim.y,z:victim.z||0,support:supportSnapshot(victim)},
  hpBefore:victim.hp,hpAtActionStart,maxHp:victim.maxHp,injuryDamage:damage,casualtyBefore:casualty(victim),
  ...decision,visualSeed:impactVisualSeed(id)};
}
export function commitBodyImpact(event,receipt,victim){
 if(!receipt)return;
 if(receipt.fatalHead){
  if(victim.hp!==0||victim.team==='squad'&&victim.casualty!=='dead')throw Error('Fatal head impact must commit death in the simulation');
  victim.casualty='dead';
  victim.fatalHead={version:BODY_IMPACT_VERSION,impactId:receipt.id};
 }
 receipt.hpAfter=victim.hp;receipt.casualtyAfter=casualty(victim);
 event.bodyImpacts.push(receipt);
}
export const validFatalHead=u=>u.fatalHead===undefined||u.fatalHead?.version===BODY_IMPACT_VERSION&&
 typeof u.fatalHead.impactId==='string'&&/^shot:\d+\/d:\d+\/p:\d+\/body:\d+$/.test(u.fatalHead.impactId)&&u.hp===0&&
 u.casualty==='dead';
export function validBodyImpact(r){
 const vec=p=>p&&[p.x,p.y,p.h].every(Number.isFinite);
 const support=p=>p&&['layer','tower','cliff'].includes(p.kind)&&Number.isInteger(p.level)&&p.level>=0&&p.level<MAP_LEVELS&&[p.baseHeight,p.offset].every(Number.isFinite);
 if(!r||r.version!==BODY_IMPACT_VERSION||r.coordinates!==IMPACT_COORDINATES||!Number.isInteger(r.victimId)||!Number.isInteger(r.shooterId)||!Number.isInteger(r.projectileIndex)||r.projectileIndex<0)return false;
 if(!/^shot:\d+$/.test(r.attackId)||!/^shot:\d+\/d:\d+$/.test(r.dischargeId)||r.dischargeId?.startsWith(r.attackId+'/d:')!==true||r.projectileId!==`${r.dischargeId}/p:${r.projectileIndex}`||r.id!==`${r.projectileId}/body:${r.victimId}`)return false;
 if(!vec(r.contact)||!vec(r.origin)||!vec(r.incoming)||Math.abs(Math.hypot(r.incoming.x,r.incoming.y,r.incoming.h)-1)>1e-6||!support(r.originSupport)||!support(r.victim?.support))return false;
 if(!['head','torso','legs','weapon'].includes(r.zone)||!['standing','kneeling','prone'].includes(r.victim.stance)||![r.victim.x,r.victim.y,r.victim.z,r.victim.heading].every(Number.isFinite)||typeof r.victim.species!=='string')return false;
 if(![r.hpBefore,r.hpAtActionStart,r.maxHp,r.hpAfter,r.injuryDamage,r.threshold].every(n=>Number.isFinite(n)&&n>=0)||!(r.injuryDamage>0)||!(r.maxHp>0)||r.hpAfter!==Math.max(0,r.hpBefore-r.injuryDamage))return false;
 if(!['alive','bleeding','stable'].includes(r.casualtyBefore)||!['alive','bleeding','stable','dead'].includes(r.casualtyAfter)||r.fatalHead&&r.casualtyAfter!=='dead')return false;
 const d=fatalHeadDecision({zone:r.zone,damage:r.injuryDamage,hpAtActionStart:r.hpAtActionStart,maxHp:r.maxHp,hpAfter:r.hpAfter});
 return r.fatalHead===d.fatalHead&&r.threshold===d.threshold&&r.qualificationReason===d.qualificationReason&&r.visualSeed===impactVisualSeed(r.id);
}
