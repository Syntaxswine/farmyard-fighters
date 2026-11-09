import {sectorMedicalCharges} from './inventory-tools.js';
import {startFirstAid,stopFirstAid} from './overmap-first-aid.js';
import {startGroupRest,stopGroupRest,mercMaxHp} from './overmap-rest.js';
import {logisticsPanel} from './overmap-logistics-panel.js';
import {ensureLogistics,advanceLogistics,validateLogistics} from './overmap-logistics.js';
import {createGroups,splitGroup,destinationPreview,orderGroup,advanceGroups,arrival,validateGroups} from './overmap-groups.js';
import {travelPreview,groupPace,fatigue} from './overmap-travel.js';
import {formatClock} from './game-clock.js';
const STORAGE='farmyard-commando-overmap-travel-v1';
const duration=n=>`${Math.floor(Math.round(n)/60)}h ${Math.round(n)%60}m`;
const coord=i=>`${i%30+1}, ${Math.floor(i/30)+1}`;
export function travelPanel({getMap,onLoadMap,onChange}){
 const $=id=>document.getElementById(id);let session=null,key=null,note='',pending=null;
 const dialog=document.createElement('dialog');dialog.id='travel-confirm';dialog.setAttribute('aria-labelledby','travel-confirm-title');
 dialog.innerHTML='<h2 id="travel-confirm-title">Confirm group travel</h2><p id="travel-confirm-people"></p><p id="travel-confirm-time"></p><p id="travel-confirm-others"></p><label id="travel-sync-label"><input id="travel-sync" type="checkbox"> Arrive together</label><p id="travel-confirm-sync-time"></p><p class="note">Required fatigue rests are included. Coordinating groups hold position to match arrival; waiting is separate from rest.</p><div class="generation-controls"><button id="travel-confirm-go">Send group</button><button id="travel-confirm-cancel">Cancel</button></div>';
 document.body.append(dialog);
 const restControls=document.createElement('div');restControls.className='generation-controls';restControls.innerHTML='<button id="group-rest">Rest · 8 hours</button><button id="group-wake">Wake group</button><button id="group-rest-finish">Advance to rest completion</button><p id="group-rest-status"></p><button id="group-first-aid">First Aid · 1 treatment charge</button><button id="group-aid-stop">Stop first aid</button><button id="group-aid-finish">Advance to treatment completion</button><p id="group-aid-status"></p>';$('travel-note').before(restControls);
 $('group-rest').onclick=()=>action(()=>startGroupRest(session,selected()?.id));
 $('group-wake').onclick=()=>action(()=>stopGroupRest(session,selected()?.id));
 $('group-rest-finish').onclick=()=>action(()=>{const g=selected();if(g?.rest)advanceLogistics(session,getMap(),g.rest.startedAt+480-session.clock.minutes);});
 $('group-first-aid').onclick=()=>action(()=>startFirstAid(session,selected()?.id));
 $('group-aid-stop').onclick=()=>action(()=>stopFirstAid(session,selected()?.id));
 $('group-aid-finish').onclick=()=>action(()=>{const a=selected()?.firstAid;if(a)advanceLogistics(session,getMap(),a.startedAt+a.duration-session.clock.minutes);});
 const selected=()=>session.groups.find(g=>g.id===session.selectedId);
 function sync(){const next=JSON.stringify(getMap());if(next!==key){key=next;session=createGroups(getMap());pending=null;note='Select a group, then click its destination on the map.';}}
 function save(){try{localStorage.setItem(STORAGE,JSON.stringify({map:getMap(),state:session}));}catch(e){note='Travel changed, but could not save: '+e.message;}}
 function action(fn){try{sync();fn();save();}catch(e){note=e.message;}onChange();}
 function chooseGroup(id){sync();session.selectedId=id;pending=null;note='Click a destination tile to preview travel. Deselect the group to edit sectors.';onChange();}
 function chooseDestination(destination){sync();if(!selected())return;
  try{const plan=destinationPreview(session,getMap(),session.selectedId,destination);pending={id:session.selectedId,destination,plan};
   $('travel-confirm-people').textContent=`${selected().name} → sector ${coord(destination)}: ${selected().state.members.map(u=>u.name).join(', ')}.`;
   $('travel-confirm-time').textContent=`Travel ${duration(plan.preview.travelMinutes)} · Rest ${duration(plan.preview.restMinutes)} · Arrival ${formatClock({minutes:plan.ownArrival})}`;
   $('travel-confirm-others').textContent=plan.others.length?plan.others.map(g=>`${g.name} is headed here, arriving ${formatClock({minutes:g.arrival})}.`).join(' '):'No other group is currently heading here.';
   $('travel-sync-label').hidden=!plan.others.length;$('travel-sync').checked=false;
   const timing=()=>{$('travel-confirm-sync-time').textContent=$('travel-sync').checked?`Shared arrival ${formatClock({minutes:plan.sharedArrival})}. ${selected().name} waits ${duration(plan.sharedArrival-plan.ownArrival)}. `+plan.others.map(g=>`${g.name} adds ${duration(plan.sharedArrival-g.arrival)} waiting.`).join(' '):'Travel independently at normal pace.';};$('travel-sync').onchange=timing;timing();onChange();dialog.showModal();
  }catch(e){note=e.message;onChange();}
 }
 function cancel(){pending=null;dialog.close();onChange();}
 $('travel-confirm-cancel').onclick=cancel;dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});
 $('travel-confirm-go').onclick=()=>action(()=>{if(!pending)return;orderGroup(session,getMap(),pending.id,pending.destination,$('travel-sync').checked);pending=null;dialog.close();note='Travel orders confirmed. Advance time to move all groups together.';});
 $('travel-go').onclick=()=>action(()=>{const elapsed=advanceLogistics(session,getMap(),60);note=session.logistics.pending?'Encounter reached; time paused.':`All groups advanced ${Math.round(elapsed)} minutes, including scheduled rests.`;});
 $('travel-next').onclick=()=>action(()=>{const moving=session.groups.filter(g=>g.state.route.length);if(moving.length)advanceLogistics(session,getMap(),Math.min(...moving.map(g=>arrival(session,g)))-session.clock.minutes);note=session.logistics.pending?'Encounter reached before travel could continue.':'Advanced to the next group arrival.';});
 $('travel-deselect').onclick=()=>{session.selectedId=null;pending=null;note='Sector editing selected. Choose a group to issue travel orders.';onChange();};
 $('travel-split').onclick=()=>action(()=>{const g=selected();if(!g)throw Error('Select a group first.');const ids=[...$('travel-members').querySelectorAll('input[type=checkbox]:checked')].map(el=>g.state.members[Number(el.value)].id);splitGroup(session,g.id,ids);note='New group created at the same position. Select it and click a destination.';});
 $('travel-reset').onclick=()=>action(()=>{session=createGroups(getMap());note='Groups reset. Select Group 1 to issue orders.';});
 $('travel-save').onclick=()=>action(()=>{note='Groups, orders, waiting time and shared clock saved.';});
 $('travel-load').onclick=()=>{try{const raw=localStorage.getItem(STORAGE);if(!raw)throw Error('No saved travel session.');const saved=JSON.parse(raw),restored=validateGroups(saved.state,saved.map);validateLogistics(restored,saved.map);onLoadMap(saved.map);key=JSON.stringify(getMap());session=restored;pending=null;note='Saved groups restored.';}catch(e){note=e.message;}onChange();};
 const logisticsUI=logisticsPanel({session:()=>session,map:getMap,selected,action,destination:chooseDestination});
 function render(){sync();logisticsUI.render();const group=selected();$('travel-clock').textContent=formatClock(session.clock);
  $('travel-groups').replaceChildren(...session.groups.map(g=>{const button=document.createElement('button');button.textContent=`${g.name} · ${g.state.members.map(u=>u.name).join(', ')} · ${g.firstAid?'First aid':g.rest?'Sleeping':g.training?'Training militia':g.waitMinutes>0?'Waiting':g.state.route.length?(g.state.restRequired?'Resting':'Travelling'):'Stationary'}`;button.setAttribute('aria-pressed',String(g.id===session.selectedId));button.onclick=()=>chooseGroup(g.id);return button;}));
  $('travel-position').textContent=group?`${group.name}: sector ${coord(group.state.position)}`+(group.state.progress?` → ${coord(group.state.route[0].to)} (${duration(group.state.progress)} into crossing)`:''):'No group selected. Map clicks edit sectors.';
  $('travel-pace').textContent=group?`Pace set by ${groupPace(group.state.members).name}: ${duration(groupPace(group.state.members).minutes)} land / ${duration(groupPace(group.state.members,true).minutes)} road per sector.`:'';
  if(group?.state.route.length){const preview=travelPreview(group.state);$('travel-preview').textContent=`Destination ${coord(group.state.route.at(-1).to)} · Travel ${duration(preview.travelMinutes)} · Rest ${duration(preview.restMinutes)} · Wait ${duration(group.waitMinutes)} · Arrival ${formatClock({minutes:arrival(session,group)})}`;}else $('travel-preview').textContent=group?'Click a destination tile to see who will move and confirm the journey.':'';
  $('group-first-aid').disabled=!group||!!group.firstAid||!!group.training||!!group.rest||!!group.state.route.length||!!session.logistics?.pending;
 $('group-aid-stop').disabled=!group?.firstAid||!!session.logistics?.pending;$('group-aid-finish').disabled=$('group-aid-stop').disabled;
 $('group-aid-status').textContent=group?.firstAid?'First aid until '+formatClock({minutes:group.firstAid.startedAt+group.firstAid.duration})+' · Medical '+group.firstAid.skill+'.':'First aid heals wounded mercs present in this sector. Medical 1: 48h · 50: 24h · 100: 8h. Uses one kit or one medical-chest charge; attacks interrupt treatment.';
  $('group-rest').disabled=!group||!!group.firstAid||!!group.rest||!!group.training||!!group.state.route.length||!!session.logistics?.pending;
 $('group-wake').disabled=!group?.rest||!!session.logistics?.pending;$('group-rest-finish').disabled=$('group-wake').disabled;
 $('group-rest-status').textContent=group?.rest?'Sleeping until '+formatClock({minutes:group.rest.startedAt+480})+'. An attack wakes this group.':'Sleep heals up to 15 HP and clears fatigue in 8 hours. Interrupted rest gives proportional recovery (5 HP per 160 minutes).';
  $('travel-note').textContent=note;const moving=session.groups.some(g=>g.state.route.length);$('travel-go').disabled=!!session.logistics?.pending;$('travel-next').disabled=!moving||!!session.logistics?.pending;$('travel-split').disabled=!group||!!group.firstAid||!!group.rest||!!group.training||!!session.logistics?.pending||!!group.state.route.length||group.state.members.length<2;
  $('travel-members').replaceChildren();if(group)for(const [i,u]of group.state.members.entries()){const label=document.createElement('label'),input=document.createElement('input');label.className='travel-person';input.type='checkbox';input.value=i;input.disabled=!!group.firstAid||!!group.rest||!!group.training||!!group.state.route.length;label.append(input,`${u.name} · HP ${Math.round((u.hp??mercMaxHp(u))*10)/10}/${mercMaxHp(u)} · Medical ${u.stats.medical??1} · Kits ${u.medkits??0} · Sector treatments ${sectorMedicalCharges(u)} · Agility ${u.stats.agility} · Fatigue ${Math.round(fatigue(u)*10)/10}/100`);$('travel-members').append(label);}
 }
 return {render,chooseDestination,chooseGroup,owner:index=>session?.logistics?.forts.find(f=>f.index===index)?.owner,get state(){sync();return selected()?.state??session.groups[0].state;},get drawing(){sync();const l=ensureLogistics(session,getMap());return [...session.groups,...l.convoys.map(g=>({...g,kind:'convoy',name:'Weapons convoy'})),...l.raiders.map(g=>({...g,kind:'raiders',name:'Red Hat squad'}))].map(g=>{const s=pending?.id===g.id?pending.plan.state:g.state,position={x:g.state.position%30+.5,y:Math.floor(g.state.position/30)+.5};if(g.state.progress&&g.state.route.length){const edge=g.state.route[0],f=g.state.progress/groupPace(g.state.members,edge.road).minutes;position.x+=(edge.to%30-edge.from%30)*f;position.y+=(Math.floor(edge.to/30)-Math.floor(edge.from/30))*f;}return {id:g.id,name:g.name,kind:g.kind,selected:g.id===session.selectedId,position,route:s.route.map(e=>e.to)};});}};
}
