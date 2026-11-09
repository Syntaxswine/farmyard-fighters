import {MAP_LEVELS} from './map-layers.js';
import {previewAttack,groundTarget,WEAPONS,canControl} from './core/engine.js';
import {grenadeBase} from './grenade-geometry.js';

export class GrenadePlanner {
 constructor(panel,{onChange,onThrow}){
  this.panel=panel;this.onChange=onChange;this.onThrow=onThrow;this.plan=null;this.preview=null;
  panel.innerHTML='<h2>◌ Lob grenade</h2><p class="grenade-summary"></p><p class="grenade-result" role="status"></p><p class="grenade-risk"></p><p class="grenade-key"><span>● Aim point</span> <span>↗ Lob</span> <span>↪ Rebound / blast</span></p><div><button id="grenade-throw">Throw grenade</button><button id="grenade-place">Reposition</button><button id="grenade-cancel">Cancel · Esc</button></div>';
  panel.querySelector('#grenade-cancel').onclick=()=>this.cancel();
  panel.querySelector('#grenade-place').onclick=()=>{if(this.plan){this.plan.locked=false;this.onChange();}};
  panel.querySelector('#grenade-throw').onclick=()=>{if(this.plan?.locked&&this.preview?.ok&&!this.blocked)this.onThrow({...this.plan.point});};
 }
 get open(){return !!this.plan;}
 start(s,u,p=null){if(!WEAPONS[u?.weapon]?.thrown)return false;this.plan={id:u.id,point:p||{x:u.x+Math.cos((u.heading||0)*Math.PI/180)*5,y:u.y+Math.sin((u.heading||0)*Math.PI/180)*5,z:u.z||0},locked:!!p};this.cacheKey='';this.panel.hidden=false;this.onChange();return true;}
 cancel(){if(!this.plan)return;this.plan=null;this.preview=null;this.panel.hidden=true;this.onChange();}
 aim(p,lock=false){if(!this.plan||this.plan.locked&&!lock)return;this.plan.point={...p,x:Math.round(p.x),y:Math.round(p.y)};this.plan.locked=lock;this.onChange();}
 refresh(s,u,{blocked=false}={}){
  if(!this.plan)return;if(u?.id!==this.plan.id||!WEAPONS[u.weapon]?.thrown||!canControl(s,u)){this.cancel();return;}
  this.blocked=blocked||s.queue.length>0;
  const key=JSON.stringify([s.revision,s.phase,u.ap,u.ammo.grenade,u.stats,this.plan.point]);
  if(this.cacheKey!==key){this.cacheKey=key;this.preview=previewAttack(s,u,groundTarget(this.plan.point));}
  const p=this.preview,end=p.trajectory,near=s.units.filter(v=>v.hp>0&&!v.away&&(v.team==='squad'||s.detected.has(v.id))&&end&&Math.hypot(v.x-end.x,v.y-end.y,grenadeBase(v)+.8-end.h)<=p.blastRadius),friends=near.filter(v=>v.team===u.team);
  this.panel.querySelector('.grenade-summary').textContent=`${p.cost} AP · ${p.chance}% on aim · ${p.maxRange.toFixed(1)} tiles range · 4-second fuse`;
  this.panel.querySelector('.grenade-result').textContent=!p.ok?p.reason:this.blocked?'Resume when ready to throw.':(p.blocked?'Blocked aim: the grenade will rebound. Orange marks the predicted explosion. ':'')+(this.plan.locked?'Confirm this throw or reposition.':'Move over the map, then click to place the aim point.');
  this.panel.querySelector('.grenade-risk').textContent=(friends.length?'Friendly fire risk: '+friends.map(v=>v.name).join(', ')+'. ':'')+'5-tile blast; damage falls sharply with distance. Dashed ring shows miss uncertainty.';
  this.panel.classList.toggle('friendly-risk',friends.length>0);
  this.panel.querySelector('#grenade-throw').disabled=!p.ok||this.blocked||!this.plan.locked;
  this.panel.querySelector('#grenade-place').disabled=!this.plan.locked;
 }
 draw(ctx,s,project,zoom){
  const p=this.preview,shot=p?.trajectory;if(!shot)return;
  const at=q=>project({x:q.x,y:q.y,z:0,h:q.h}),known=q=>Array.from({length:MAP_LEVELS},(_,z)=>z).some(z=>s.seen.has(z?`${Math.round(q.x)},${Math.round(q.y)},${z}`:`${Math.round(q.x)},${Math.round(q.y)}`));
  const ring=(q,r,color,dash=[])=>{ctx.strokeStyle=color;ctx.setLineDash(dash);ctx.beginPath();for(let i=0;i<=64;i++){const a=i/64*Math.PI*2,v={...q,x:q.x+Math.cos(a)*r,y:q.y+Math.sin(a)*r},v2=at(v);if(i===0)ctx.moveTo(v2.x,v2.y);else ctx.lineTo(v2.x,v2.y);}ctx.stroke();ctx.setLineDash([]);};
  ctx.save();ctx.lineWidth=2;let before=null;const contact=shot.collisions[0]?.t??Infinity;
  for(const q of shot.path){if(!known(q))break;const v=at(q);if(before){ctx.strokeStyle=q.t>contact?'#eda652':'#88dce0';ctx.beginPath();ctx.moveTo(before.x,before.y);ctx.lineTo(v.x,v.y);ctx.stroke();}before=v;}
  for(const q of shot.collisions.slice(0,4)){if(!known(q))continue;const v=at(q);ctx.strokeStyle='#ffc879';ctx.strokeRect(v.x-4,v.y-4,8,8);}
  const dest=p.requested,aim=at(dest),red=p.blocked||!p.ok;
  ring(dest,.28,red?'#ff6d60':'#fff4d2');ctx.strokeStyle=red?'#ff6d60':'#fff4d2';ctx.beginPath();ctx.moveTo(aim.x-10,aim.y);ctx.lineTo(aim.x+10,aim.y);ctx.moveTo(aim.x,aim.y-10);ctx.lineTo(aim.x,aim.y+10);ctx.stroke();ring(dest,p.spread,'#b9b69b',[3,5]);
  if(known(shot)){ring(shot,p.blastRadius,'#e5a05d',[6,4]);ring(shot,1,'#e5a05d');const v=at(shot);ctx.fillStyle='#ffe6ac';ctx.font='bold 12px sans-serif';ctx.fillText('BLAST',v.x+7,v.y-7);}
  ctx.restore();
 }
}
