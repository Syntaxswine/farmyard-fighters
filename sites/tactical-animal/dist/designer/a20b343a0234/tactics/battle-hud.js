import {squadReadout} from './battle-hud-model.js';
import {createWeaponSprite,setWeaponSprite} from './weapon-icons.js';
import {selectable,selectionModifier} from './battle-selection.js';
import {STANCE_ICONS,BACKPACK_ICON} from './battle-control-icons.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const setText=(n,text)=>{if(n.textContent!==String(text))n.textContent=text;};
const button=(cls,text,label)=>{const n=el('button',cls,text);n.type='button';n.setAttribute('aria-label',label);return n;};
function meter(kind,label){const box=el('div','merc-meter '+kind),line=el('div','meter-label'),name=el('span','',label),value=el('span'),track=el('div','meter-track'),fill=el('span');line.append(name,value);track.append(fill);box.append(line,track);track.setAttribute('role','meter');track.setAttribute('aria-label',label);return {box,value,track,fill};}
export function createBattleHud(root,{onSelect,onInventory,onStance,onEquip,onReload}){
 const cards=new Map();
 function create(u){
  const card=el('article','merc-card');card.dataset.unit=u.id;
  const top=el('div','merc-top'),select=button('merc-select','','Select '+u.name),portrait=el('span','portrait-window merc-portrait'),image=el('img'),index=el('span','merc-index'),stamp=el('span','deceased-stamp','Deceased');stamp.hidden=true;image.alt='';portrait.append(image,index,stamp);select.append(portrait);
  const vitals=el('div','merc-vitals'),name=el('strong','merc-name'),ap=el('span','merc-ap'),heading=el('div','merc-heading'),hp=meter('health','Health'),stamina=meter('stamina','Stamina'),status=el('span','merc-status');heading.append(name,ap);vitals.append(heading,hp.box,stamina.box,status);top.append(select,vitals);
  const stance=button('merc-stance','','Stance for '+u.name),inventory=button('merc-inventory','','Inventory for '+u.name);inventory.innerHTML=BACKPACK_ICON;stance.setAttribute('aria-controls','stance-menu');stance.setAttribute('aria-expanded','false');inventory.title='Inventory · Free to look';top.append(stance,inventory);
  const gear=el('div','merc-gear'),rows=[0,1].map(slot=>{const row=el('div','weapon-row'),draw=button('weapon-select','',''),art=el('span','weapon-art'),sprite=createWeaponSprite(),symbol=el('span','weapon-symbol'),label=el('span','weapon-label'),amount=el('span','weapon-amount'),reload=button('weapon-reload','R','');art.append(sprite,symbol);draw.append(art,label,amount);row.append(draw,reload);gear.append(row);return {row,draw,sprite,symbol,label,amount,reload,kind:null};});
  const swap=button('merc-swap','⇅','Quick swap for '+u.name);swap.title='Quick swap';gear.append(swap);card.append(top,gear);root.append(card);
  select.onclick=e=>onSelect(u.id,selectionModifier(e));inventory.onclick=()=>onInventory(u.id);stance.onclick=()=>onStance(u.id,stance);swap.onclick=()=>{if(rows[1].kind)onEquip(u.id,rows[1].kind);};
  for(const r of rows){r.draw.onclick=()=>{if(r.kind)onEquip(u.id,r.kind);else onInventory(u.id);};r.reload.onclick=()=>onReload(u.id);}
  return {card,select,portrait,stamp,image,index,name,ap,hp,stamina,status,stance,inventory,rows,swap};
 }
 return {render(state,selectedIds,{blocked=false}={}){
  const roster=state.units.filter(u=>u.team==='squad'),ids=new Set(roster.map(u=>u.id));
  for(const [id,c]of cards)if(!ids.has(id)){c.card.remove();cards.delete(id);}
  for(const [i,u]of roster.entries()){
   if(!cards.has(u.id))cards.set(u.id,create(u));const c=cards.get(u.id),v=squadReadout(state,u,{blocked});
   c.card.classList.toggle('selected',selectedIds.has(u.id));c.card.classList.toggle('primary',state.selected===u.id);c.card.classList.toggle('casualty',u.hp<=0||!!u.away);c.select.setAttribute('aria-pressed',String(selectedIds.has(u.id)));c.select.disabled=!selectable(u);c.select.setAttribute('aria-label','Select '+u.name+(state.selected===u.id?', primary merc':''));
   if(c.image.getAttribute('src')!==v.portrait)c.image.src=v.portrait;setText(c.index,String(i+1).padStart(2,'0'));setText(c.name,v.name);setText(c.ap,v.ap.value+' AP');c.ap.title='Action points: '+v.ap.value+' / '+v.ap.max;
   c.portrait.classList.toggle('deceased',v.deceased);c.stamp.hidden=!v.deceased;if(v.deceased)c.select.setAttribute('aria-label',u.name+', deceased');
   for(const key of ['hp','stamina']){const m=c[key],r=v[key];setText(m.value,r.value+' / '+r.max);m.fill.style.width=r.percent+'%';m.track.setAttribute('aria-valuemin','0');m.track.setAttribute('aria-valuemax',r.max);m.track.setAttribute('aria-valuenow',r.value);}
   setText(c.status,v.status||v.stance+' · '+v.movement);c.stance.disabled=blocked||!selectable(u);c.stance.title='Stance for '+v.name+': '+v.stance;c.stance.setAttribute('aria-label',c.stance.title);if(c.stance.dataset.stance!==v.stance){c.stance.innerHTML=STANCE_ICONS[v.stance]||STANCE_ICONS.standing;c.stance.dataset.stance=v.stance;}c.inventory.setAttribute('aria-label','Inventory for '+u.name);
   for(const [slot,w]of v.weapons.entries()){
    const r=c.rows[slot];r.kind=w.kind;r.row.classList.toggle('held',!!w.held);r.sprite.style.display=w.image?'flex':'none';r.symbol.hidden=!!w.image;setWeaponSprite(r.sprite,w.kind,w.image);setText(r.symbol,w.kind==='hands'?'✊':w.kind==='knife'?'╱':'—');setText(r.label,w.short);setText(r.amount,w.amount===null?'':w.amount);r.amount.hidden=w.amount===null;r.amount.title=w.amount===null?'':w.amount+' '+w.unit+' loaded · '+w.reserve+' squad reserve';
    r.draw.setAttribute('aria-label',(w.held?'Equipped ':w.paired?'Use ':w.kind?'Draw ':'')+w.name+(w.amount===null?'':', '+w.amount+' '+w.unit));r.draw.title=w.reason;r.draw.disabled=!!w.kind&&!w.canEquip;r.reload.hidden=!w.capacity;r.reload.disabled=!w.canReload;r.reload.setAttribute('aria-label',w.reloadLabel+' '+w.name+' for '+v.name);r.reload.title=w.held?w.reloadLabel+(w.reloadCost?' · '+w.reloadCost+' AP':' · Free'):'Equip this weapon before reloading';
   }
   const next=v.weapons[1];c.swap.disabled=!next.canEquip;c.swap.title=next.kind?'Quick swap to '+next.name+(next.cost?' · '+next.cost+' AP':' · Free'):'Choose a second weapon in Inventory';c.swap.setAttribute('aria-label',c.swap.title+' for '+v.name);
  }
 }};
}
