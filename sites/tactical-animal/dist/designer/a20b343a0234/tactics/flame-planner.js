import {previewAttack,groundTarget,WEAPONS,canControl} from './core/engine.js';
import {W,H,tileKey} from './core/maps.js';

// Planning owns no combat state. Confirming calls the normal attack pipeline;
// cancelling, rotating and inspecting the template never spend AP or fuel.
export class FlamePlanner {
 constructor(panel,{onChange,onFire}){
  this.panel=panel;this.onChange=onChange;this.onFire=onFire;this.plan=null;this.preview=null;
  panel.innerHTML='<h2>Flame template</h2><p class="flame-summary"></p><p class="flame-targets"></p><p class="flame-instruction" role="status"></p><div><button id="flame-fire">Fire spray</button><button id="flame-place">Reposition</button><button id="flame-cancel">Cancel · Esc</button></div>';
  panel.querySelector('#flame-cancel').onclick=()=>this.cancel();
  panel.querySelector('#flame-place').onclick=()=>{if(this.plan){this.plan.locked=false;this.onChange();}};
  panel.querySelector('#flame-fire').onclick=()=>{if(this.plan?.locked&&this.preview?.ok&&!this.blocked)this.onFire({...this.plan.point});};
 }
 get open(){return !!this.plan;}
 start(s,u,point=null){
  const w=WEAPONS[u?.weapon];if(!w?.incendiary)return false;
  const angle=(u.heading||0)*Math.PI/180;
  this.plan={id:u.id,point:point||{x:Math.max(0,Math.min(W-1,u.x+Math.cos(angle)*w.range)),y:Math.max(0,Math.min(H-1,u.y+Math.sin(angle)*w.range)),z:u.z||0},locked:!!point};
  this.panel.hidden=false;this.onChange();return true;
 }
 cancel(){if(!this.plan)return;this.plan=null;this.preview=null;this.panel.hidden=true;this.onChange();}
 aim(point,place=false){if(!this.plan||this.plan.locked&&!place)return;this.plan.point={...point};this.plan.locked=place;this.onChange();}
 refresh(s,u,{blocked=false,level=u?.z||0}={}){
  if(!this.plan)return;
  if(u?.id!==this.plan.id||!WEAPONS[u.weapon]?.incendiary||!canControl(s,u)||level!==(u.z||0)){this.cancel();return;}
  this.blocked=blocked||s.queue.length>0;
  this.preview=previewAttack(s,u,groundTarget(this.plan.point));
  const p=this.preview,known=p.affected.map(id=>s.units.find(v=>v.id===id)).filter(v=>v&&(v.team==='squad'||s.detected.has(v.id)));
  const friendlies=known.filter(v=>v.team===u.team);
  this.panel.querySelector('.flame-summary').textContent=p.cost+' AP · 1 fuel · '+p.range+' tiles long · '+(p.flame?.radius*2||6)+' wide · Lethal on contact';
  this.panel.querySelector('.flame-targets').textContent=known.length?'In the spray: '+known.map(v=>v.name).join(', ')+(friendlies.length?' — friendly fire!':''):'No visible characters in the spray.';
  this.panel.classList.toggle('friendly-risk',friendlies.length>0);
  this.panel.querySelector('.flame-instruction').textContent=!p.ok?p.reason:this.blocked?'Resume when ready to fire.':this.plan.locked?'Template placed. Confirm the spray or reposition it.':'Move over the battlefield; click to place the template.';
  this.panel.querySelector('#flame-fire').disabled=!this.plan.locked||!p.ok||this.blocked;
  this.panel.querySelector('#flame-place').disabled=!this.plan.locked;
 }
 draw(ctx,s,project,zoom){
  const shape=this.preview?.flame;if(!shape)return;
  const at=p=>project({...p,z:shape.z,towerElevation:shape.base-shape.z*3});
  // Do not reveal the silhouette of an obstacle in undiscovered terrain.
  const points=shape.rays.map(ray=>{
   let end=shape.origin;const n=Math.ceil(ray.distance*5);
   for(let i=1;i<=n;i++){
    const t=i/n,p={x:shape.origin.x+(ray.x-shape.origin.x)*t,y:shape.origin.y+(ray.y-shape.origin.y)*t};
    if(!s.seen.has(tileKey(Math.round(p.x),Math.round(p.y),shape.z)))break;end=p;
   }
   return end;
  });
  const origin=at(shape.origin),ok=this.preview.ok;
  ctx.save();ctx.lineWidth=2;ctx.strokeStyle=ok?'#ffd095':'#e66b61';ctx.fillStyle=ok?'#e778284a':'#ac38383f';ctx.setLineDash(this.plan.locked?[]:[6,4]);
  ctx.beginPath();ctx.moveTo(origin.x,origin.y);for(const p of points){const q=at(p);ctx.lineTo(q.x,q.y);}ctx.closePath();ctx.fill();ctx.stroke();ctx.setLineDash([]);
  for(const id of this.preview.affected){const u=s.units.find(v=>v.id===id);if(!u||u.team!=='squad'&&!s.detected.has(id))continue;const p=project(u);ctx.strokeStyle=u.team==='squad'?'#ff6c68':'#ffce79';ctx.beginPath();ctx.ellipse(p.x,p.y,19*zoom,10*zoom,0,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
 }
}
