import {activeState,syncCampaignEncounter,finishCampaignEncounter,retreatCampaign,retreatPreview} from './campaign-model.js';
import {loadCampaignSession,listCampaignSaves,CAMPAIGN_SLOTS} from './campaign-store.js';
import {canUseSectorInventory,sectorInventory} from './sector-inventory.js';
import {transferItem,transferPreview,itemName} from './battle-inventory.js';
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export async function campaignBattle(slot){
 let session=await loadCampaignSession(slot),s=activeState(session.campaign);if(!s)throw Error('Enter a sector from the campaign map first.');
 let paused=false,callbacks,bar,inventory,status,notice='',last='';
 const saveOptions={slots:CAMPAIGN_SLOTS,list:listCampaignSaves,title:'Campaign save / load'};
 const save=async id=>session.save(id==='auto'?'continue':id);
 function inventoryView(){
  inventory.replaceChildren();const close=el('button','Close');close.onclick=()=>inventory.close();inventory.append(el('h2','Sector inventory'),close);
  const selector=el('select');selector.setAttribute('aria-label','Receive items as');for(const u of s.units.filter(u=>u.team==='squad'&&u.hp>0&&!u.casualty)){const o=el('option',u.name);o.value=u.id;selector.append(o);}selector.value=s.selected;
  selector.onchange=()=>{s.selected=+selector.value;inventoryView();callbacks.changed();};inventory.append(selector);
  const u=s.units.find(u=>u.id===s.selected);
  if(!canUseSectorInventory(s,u)){inventory.append(el('p','The sector must be peaceful, and this merc must be physically here.'));return;}
  inventory.append(el('p','Loose supplies and searched containers on every floor. Unsearched contents are excluded. Collected ammo joins the shared squad supply.'));
  const piles=sectorInventory(s,u);if(!piles.length)inventory.append(el('p','No available items.'));
  for(const pile of piles){const section=el('section'),name=pile.container?.name||(pile.body===undefined?'Loose supplies':'Searched equipment');section.append(el('strong',name+' · '+pile.x+', '+pile.y+' · level '+((pile.z||0)+1)));
   for(const [index,item]of pile.items.entries()){const row=el('p',itemName(item)+(item.count?' × '+item.count:'')+(item.type==='weapon'?' · '+(item.condition??100)+'% condition · '+item.rounds+' loaded':'')),button=el('button',item.type==='ammo'?'Take for squad':'Take'),action={mode:'take',sector:true,target:pile,index},preview=transferPreview(s,u,action);button.disabled=!preview.ok;button.title=preview.reason;
    button.onclick=async()=>{if(session.busy)return;try{if(!transferItem(s,u,action))throw Error(transferPreview(s,u,action).reason||'Item unavailable.');syncCampaignEncounter(session.campaign);await save('continue');notice='Item taken and checkpoint saved.';callbacks.changed();}catch(e){notice=e.message;callbacks.failure(e);}inventoryView();};row.append(button);section.append(row);
   }inventory.append(section);
  }const result=el('p',notice);result.setAttribute('role','status');inventory.append(result);
 }
 async function leave(command){if(session.busy)return;paused=true;try{if(command)await session.transition(command);else await save('continue');location.href='campaign.html';}catch(e){callbacks.failure(e);paused=false;}}
 function mount(options){
  callbacks=options;const css=document.createElement('link');css.rel='stylesheet';css.href='campaign.css';document.head.append(css);
  // Campaign controls supplement the same tactical actions used by Quick Fight.
  document.querySelector('aside h1').textContent=s.definition.name;document.querySelector('#restart').hidden=true;document.querySelector('#difficulty').disabled=true;
  bar=el('section');bar.className='campaign-bar';bar.id='campaign-battle-controls';status=el('p');status.className='campaign-status';bar.append(status);
  const map=el('button','Campaign map');map.id='campaign-map-button';map.onclick=()=>leave();bar.append(map);
  const finish=el('button','Leave cleared sector');finish.id='campaign-finish';finish.onclick=()=>leave(c=>finishCampaignEncounter(c));bar.append(finish);
  const supplies=el('button','Sector inventory');supplies.id='sector-inventory-button';supplies.onclick=()=>{notice='';inventoryView();inventory.showModal();callbacks.changed();};bar.append(supplies);
  const retreats=el('div');retreats.id='campaign-retreats';bar.append(retreats);
  const mount=document.querySelector('#campaign-actions');if(!mount)throw Error('The tactical HUD is missing its campaign controls.');
  mount.replaceChildren(el('h2','Campaign'),bar);mount.hidden=false;
  // These controls live in the interactive drawer, never in the map overlay.
  for(const event of ['pointerdown','click'])bar.addEventListener(event,e=>e.stopPropagation());
  inventory=el('dialog');inventory.className='sector-inventory';inventory.id='sector-inventory';document.body.append(inventory);inventory.addEventListener('close',()=>callbacks.changed());update();
 }
 function update(){
  syncCampaignEncounter(session.campaign);if(!bar)return;
  const c=session.campaign,key=JSON.stringify([s.revision,s.phase,c.revision,session.busy]);if(last===key)return;last=key;
  status.textContent='Campaign · $'+c.money.toLocaleString()+' · Progress is kept when you leave.';
  document.querySelector('#campaign-finish').disabled=session.busy||!['won','lost'].includes(s.phase);document.querySelector('#campaign-finish').textContent=s.phase==='lost'?'Record defeat':'Leave cleared sector';
  const u=s.units.find(u=>u.id===s.selected);document.querySelector('#sector-inventory-button').disabled=session.busy||!canUseSectorInventory(s,u);
  const retreats=document.querySelector('#campaign-retreats');retreats.replaceChildren();
  for(const g of c.groups.filter(g=>g.faction==='player'&&g.travel.position===c.active?.sector&&g.memberIds.length))for(const index of Object.keys(c.assignments).map(Number).filter(i=>i!==c.active.sector)){
   const button=el('button','Retreat '+g.name+' to '+c.assignments[index].map.name);button.dataset.retreat=index;try{retreatPreview(c,g.id,index);}catch(e){button.disabled=true;button.title=e.message;}if(session.busy)button.disabled=true;button.onclick=()=>leave(c=>retreatCampaign(c,g.id,index));retreats.append(button);
  }
 }
 return {get state(){return s;},get campaign(){return session.campaign;},get busy(){return session.busy;},get paused(){return paused||session.busy||!!inventory?.open;},saveOptions,mount,update,save,
  async commitDialogue(expected,next){await session.transition(c=>{if(c.dialogue.revision!==expected)throw Error('The conversation changed. Load its latest checkpoint.');c.dialogue=structuredClone(next);});s=activeState(session.campaign);last='';return s;},
  async finishDefeat(){if(s.phase!=='lost')throw Error('The encounter is still in progress.');await session.transition(c=>finishCampaignEncounter(c));paused=true;},
  async load(id){session=await loadCampaignSession(id);s=activeState(session.campaign);if(!s){location.href='campaign.html';return null;}paused=false;last='';return s;}};
}
