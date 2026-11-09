import {BattleContextMenu} from './battle-context-menu.js';
import {PATROL_WAIT_STEP,MAX_PATROL_WAIT} from './character-patrol.js';

const $=id=>document.getElementById(id),svgNS='http://www.w3.org/2000/svg';
function svg(tag,attrs){const el=document.createElementNS(svgNS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;}
function button(label,action){const el=document.createElement('button');el.type='button';el.textContent=label;el.onclick=action;return el;}

export class EditorWaypointPath {
 constructor(options){
  Object.assign(this,options);
  const {canvas,scene,status,prefix,menuLabel,help,detail}=options;
  this.editing=null;this.press=null;this.flagHits=[];
  this.menu=options.menu||new BattleContextMenu({surfaceId:canvas.id,label:menuLabel,onChange:()=>{},onAction:action=>action()});
  this.overlay=svg('svg',{id:prefix+'-flags',class:'waypoint-flags','aria-hidden':'true'});canvas.parentElement.append(this.overlay);
  this.panel=document.createElement('section');this.panel.id=prefix+'-options';this.panel.className='waypoint-options';this.panel.hidden=true;document.querySelector('.properties').prepend(this.panel);
  this.panel.innerHTML='<h2></h2><p class="waypoint-help"></p><p class="muted"></p><div class="patrol-actions"></div><ol class="waypoint-points"></ol><p class="waypoint-count"></p>';
  this.panel.querySelector('.waypoint-help').textContent=help;this.panel.querySelector('.muted').textContent=detail;
  this.list=this.panel.querySelector('ol');this.list.id=prefix+'-points';
  const done=button('Done pathing',()=>this.finish());done.id=prefix+'-done';
  this.panel.querySelector('.patrol-actions').append(done,button('Clear path',()=>this.write([])));
  // Capture only clicks while pathing. Right-drag, zoom and camera keys remain available.
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0||!this.editing)return;e.preventDefault();e.stopImmediatePropagation();if(this.isBusy())return;this.press={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);canvas.focus();},true);
  canvas.addEventListener('pointermove',e=>{if(!this.editing||e.buttons===2)return;e.stopImmediatePropagation();if(this.press&&Math.hypot(e.clientX-this.press.x,e.clientY-this.press.y)>5)this.press.moved=true;},true);
  canvas.addEventListener('pointerup',e=>{if(e.button!==0||!this.editing)return;e.preventDefault();e.stopImmediatePropagation();const press=this.press;this.press=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(!press||press.id!==e.pointerId||press.moved||this.isBusy())return;
   const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
   const hit=this.flagHits.filter(h=>(h.point.z||0)===scene.options.level&&x>=h.x-5&&x<=h.x+36&&y>=h.y-43&&y<=h.y+8).sort((a,b)=>Math.hypot(x-a.x,y-a.y)-Math.hypot(x-b.x,y-b.y))[0];
   const picked=hit?.point||scene.pick(x,y,rect.width,rect.height);if(!picked)return;
   const point=hit?hit.point:{x:Math.round(picked.x),y:Math.round(picked.y),z:scene.options.level};
   try{this.write(this.clickPoint(this.getPoints(this.row()?.p),point));}catch(error){status(error.message);}
  },true);
  canvas.addEventListener('pointercancel',()=>this.press=null,true);
  document.addEventListener('keydown',e=>{if(!this.editing||e.defaultPrevented||e.target.closest?.('input,textarea,select')||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.finish();}},true);
 }
 bindTools(){
  // Workbench changes are deliberately non-bubbling.
  $('edit-tool').addEventListener('change',()=>{if($('edit-tool').value!=='inspect')this.finish();});
  $('floor').addEventListener('change',()=>{this.menu.close();this.sync();});
 }
 startEditing(editing){if(this.isBusy())return;this.onStart?.();this.menu.close();this.editing=editing;this.panel.parentElement.prepend(this.panel);this.sync();this.panel.scrollIntoView({block:'nearest'});this.canvas.dataset.pathing=this.prefix;this.canvas.classList.add('pathing');this.canvas.focus();this.status('Pathing: click tiles to add flags; click a flag for +15 seconds. Done or Escape finishes.');}
 finish(focus=true){this.editing=null;this.press=null;this.panel.hidden=true;if(this.canvas.dataset.pathing===this.prefix){delete this.canvas.dataset.pathing;this.canvas.classList.remove('pathing');}if(focus)this.canvas.focus();}
 reset(){this.menu.close();this.finish(false);this.flagHits=[];this.overlay.replaceChildren();this.drawKey=null;}
 sync(){
  const row=this.row();if(!row){this.finish(false);return;}this.panel.hidden=false;this.panel.querySelector('h2').textContent=this.routeTitle(row);
  const list=this.list;list.replaceChildren();const points=this.getPoints(row.p);
   points.forEach((p,i)=>{const li=document.createElement('li'),name=document.createElement('span');name.textContent=`${i+1}. (${p.x+1}, ${p.y+1}) · L${(p.z||0)+1} · ${p.waitSeconds}s`;
   const edit=fn=>{const next=structuredClone(points);fn(next);this.write(next);};
   const minus=button('−15s',()=>edit(next=>next[i].waitSeconds-=PATROL_WAIT_STEP));minus.disabled=!p.waitSeconds;minus.setAttribute('aria-label',`Reduce ${this.pointNoun} ${i+1} wait by 15 seconds`);
   const plus=button('+15s',()=>edit(next=>next[i].waitSeconds+=PATROL_WAIT_STEP));plus.disabled=p.waitSeconds>=MAX_PATROL_WAIT;plus.setAttribute('aria-label',`Add 15 seconds at ${this.pointNoun} ${i+1}`);
   const remove=button('×',()=>edit(next=>next.splice(i,1)));remove.setAttribute('aria-label',`Remove ${this.pointNoun} ${i+1}`);li.append(name,minus,plus,remove);list.append(li);
  });this.panel.querySelector('.waypoint-count').textContent=points.length?`${points.length} ${this.pointNoun}s · ${points.reduce((sum,p)=>sum+p.waitSeconds,0)} seconds waiting per loop`:this.emptyMessage;
 }
 draw(){
  const unit=this.row()?.p||this.getSelection()?.data,points=this.getPoints(unit),width=this.canvas.clientWidth,height=this.canvas.clientHeight;
  const projected=points.map(point=>({point,...this.scene.projectTile(point,width,height)}));
  const key=JSON.stringify([width,height,this.scene.options.level,projected,!!this.editing]);if(key===this.drawKey)return;this.drawKey=key;
  this.overlay.setAttribute('viewBox',`0 0 ${width} ${height}`);this.overlay.replaceChildren();this.flagHits=[];
  if(!points.length)return;
  if(points.length>1)this.overlay.append(svg('polyline',{points:[...projected,projected[0]].map(p=>`${p.x},${p.y}`).join(' '),fill:'none',stroke:'#bb372a','stroke-width':2,'stroke-dasharray':'6 5',opacity:'.8'}));
  for(const [i,p]of projected.entries()){
   if(!p.visible||p.x<0||p.x>width||p.y<-5||p.y>height+50)continue;
   const active=(p.point.z||0)===this.scene.options.level,g=svg('g',{transform:`translate(${p.x},${p.y})`,opacity:active?1:.4});
   g.append(svg('path',{d:'M0 1V-39 M0 -39H34L28 -27L34 -15H0',fill:'#b73124',stroke:'#ffdda0','stroke-width':1.5}));
   if(p.point.waitSeconds){const wait=svg('text',{x:16,y:-23,'text-anchor':'middle',fill:'#fff5d7','font-size':p.point.waitSeconds>999?9:12,'font-weight':700});wait.textContent=p.point.waitSeconds;g.append(wait);}
   const index=svg('text',{x:0,y:16,'text-anchor':'middle',fill:'#fff2d4',stroke:'#23312b','stroke-width':3,'paint-order':'stroke','font-size':12,'font-weight':700});index.textContent=i+1;g.append(index);this.overlay.append(g);if(this.editing&&active)this.flagHits.push(p);
  }
 }
}
