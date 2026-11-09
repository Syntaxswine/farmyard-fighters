import {terrainAt,tileKey,inBounds} from './core/maps.js';
import {propCells} from './core/environment.js';
import {visibleLoot} from './battle-inventory.js';
import {structureInfo} from './structure-health.js';

const label=kind=>({yard:'Grass',floor:'Floor',road:'Road',void:'Empty space'}[kind]||kind.replace(/^ground-/,'').replaceAll('-',' ').replace(/^./,c=>c.toUpperCase()));
export function inspectBattleTile(s,p){
 const point={x:Math.round(p.x),y:Math.round(p.y),z:p.z||0,...p.towerPost&&{towerPost:p.towerPost},...p.cliffSupport&&{cliffSupport:p.cliffSupport}};if(!inBounds(point.x,point.y,point.z))return null;
 const known=s.seen.has(tileKey(point.x,point.y,point.z)),visible=s.visible.has(tileKey(point.x,point.y,point.z));
 const props=known?(s.props||[]).filter(p=>propCells(p).some(q=>q.x===point.x&&q.y===point.y&&(q.z||0)===point.z)):[];
 const {x,y,z}=point,suffix=z?':'+z:'',surfaces=known?[structureInfo(s,point),...['e:'+x+':'+y,'e:'+(x-1)+':'+y,'s:'+x+':'+y,'s:'+x+':'+(y-1)].map(k=>structureInfo(s,{edge:k+suffix}))].filter(Boolean):[];
 return {point,known,title:known?label(terrainAt(s,point.x,point.y,point.z)):'Unexplored tile',
  location:`Column ${point.x+1} · Row ${point.y+1} · Level ${point.z+1}`,
  props:visible?props:[],structures:surfaces.map(p=>({id:p.id,kind:p.kind,hp:p.hp,maxHp:p.maxHp})),objects:[...props.map(p=>label(p.kind)),...surfaces.map(p=>`${label(p.kind)} ${p.hp}/${p.maxHp} HP`)],loot:visible?s.loot.filter(p=>p.x===point.x&&p.y===point.y&&(p.z||0)===point.z&&visibleLoot(s,p)):[]};
}

// A small keyboard-accessible popup with drill-in submenus. Labels come from
// map data, so use text nodes throughout; never interpret names as markup.
export class BattleContextMenu {
 constructor({onChange,onAction,surfaceId='battle',label='Battlefield actions'}){
  this.onChange=onChange;this.onAction=onAction;this.stack=[];
  this.element=document.createElement('section');this.element.id='battle-context';this.element.hidden=true;this.element.setAttribute('aria-label',label);document.body.append(this.element);
  this.element.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('pointerdown',e=>{if(!this.open||this.element.contains(e.target)||e.button!==0)return;this.close();if(e.target.id===surfaceId){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('keydown',e=>{
   if(!this.open)return;
   if(['Escape','ArrowLeft'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();if(e.key==='ArrowLeft'&&this.stack.length>1){this.stack.pop();this.render();}else this.close(true);return;}
   if(['ArrowDown','ArrowUp','Home','End','ArrowRight','Tab'].includes(e.key)){
    e.preventDefault();e.stopImmediatePropagation();const buttons=[...this.element.querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(document.activeElement);
    if(e.key==='ArrowRight'){if(document.activeElement?.getAttribute('aria-haspopup')==='menu')document.activeElement.click();return;}
    const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowUp'||e.shiftKey?-1:1)+buttons.length)%buttons.length;buttons[next]?.focus();
   }
  },true);
  window.addEventListener('blur',()=>this.close());window.addEventListener('resize',()=>this.close());
 }
 get open(){return !this.element.hidden;}
 show({title,location,detail,entries},x,y){this.anchor={x,y};this.source=document.activeElement;this.stack=[{title,location,detail,entries}];this.element.hidden=false;this.render();this.onChange();}
 close(focus=false){if(!this.open)return;this.element.hidden=true;this.stack=[];if(focus)this.source?.focus({preventScroll:true});this.onChange();}
 render(){
  const page=this.stack.at(-1),el=this.element;el.replaceChildren();
  const top=document.createElement('div');top.className='context-top';const title=document.createElement('strong');title.textContent=page.title;
  const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','Close actions');close.onclick=()=>this.close(true);top.append(title,close);el.append(top);
  const location=document.createElement('p');location.className='context-location';location.textContent=page.location;el.append(location);
  if(page.detail){const detail=document.createElement('p');detail.className='context-detail';detail.textContent=page.detail;el.append(detail);}
  const list=document.createElement('div');list.setAttribute('role','menu');list.setAttribute('aria-label',page.title);el.append(list);
  if(this.stack.length>1){const back=document.createElement('button');back.setAttribute('role','menuitem');back.textContent='← Back';back.onclick=()=>{this.stack.pop();this.render();};list.append(back);}
  for(const entry of page.entries){
   const b=document.createElement('button');b.setAttribute('role',entry.checked===undefined?'menuitem':'menuitemcheckbox');if(entry.checked!==undefined)b.setAttribute('aria-checked',String(entry.checked));b.dataset.action=entry.id;b.disabled=!!entry.disabled;b.title=entry.reason||'';
   const icon=document.createElement('span');icon.className='context-icon';icon.textContent=entry.icon||'·';icon.setAttribute('aria-hidden','true');
   const text=document.createElement('span'),name=document.createElement('span');name.textContent=entry.label;text.append(name);
   if(entry.reason||entry.note){const note=document.createElement('small');note.textContent=entry.reason||entry.note;text.append(note);}b.append(icon,text);
   if(entry.children){const arrow=document.createElement('span');arrow.textContent='›';arrow.className='context-arrow';b.append(arrow);b.setAttribute('aria-haspopup','menu');b.onclick=()=>{this.stack.push({...page,title:entry.label,detail:'',entries:entry.children});this.render();};}
   else b.onclick=()=>{this.close();this.onAction(entry.action);};list.append(b);
  }
  el.style.left='0px';el.style.top='0px';const box=el.getBoundingClientRect();el.style.left=Math.max(8,Math.min(this.anchor.x,innerWidth-box.width-8))+'px';el.style.top=Math.max(8,Math.min(this.anchor.y,innerHeight-box.height-8))+'px';
  list.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
 }
}
