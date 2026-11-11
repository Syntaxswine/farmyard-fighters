import {elementById,GUARD_KITS,GUARD_BEHAVIORS,GUARD_TYPES,buildingForElement,weakApproachDirection} from './overmap-elements.js';
import {assertOvermap,validateOvermap,compatibleElements,replaceElement,sectorBlueprint} from './overmap-model.js';
import {drawWorld,worldCell,drawRegion,regionElement,drawDetail} from './overmap-view.js';

const $=id=>document.getElementById(id);
let map,selectedRegion,selectedElement,worker,request=0,timer;
const status=(message,error=false)=>{$('status').textContent=message;$('status').dataset.error=String(error);};
const region=()=>map?.regions.find(item=>item.id===selectedRegion);
const instance=()=>region()?.elements.find(item=>item.id===selectedElement);
function options(select,values,selected){
  select.replaceChildren();
  for(const item of values){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;select.append(option);}
  if(values.some(item=>item.id===selected))select.value=selected;
}
function controls(busy){
  for(const id of ['generate','check','export','export-sector','replace','import','sector','element'])$(id).disabled=busy||!map&&!['generate','import'].includes(id);
  $('cancel').hidden=!busy;
}
function cancel(){
  request++;clearTimeout(timer);worker?.terminate();worker=null;controls(false);
}
function redraw(){
  if(!map)return;
  drawWorld($('world'),map,selectedRegion);
  drawRegion($('region'),region(),selectedElement);
  if(instance())drawDetail($('detail'),instance());
}
function inspect(){
  const item=instance();if(!item)return;
  const element=elementById(item.element,item.revision),fort=element.kind==='fortification';
  options($('variation'),compatibleElements(item),item.element);
  options($('guard-type'),GUARD_TYPES,item.guardType);
  options($('equipment'),GUARD_KITS,item.kit);
  options($('behavior'),GUARD_BEHAVIORS,item.behavior);
  $('guard-settings').hidden=!fort;
  $('element-description').textContent=element.trick||'Open ground between authored encounters.';
  const properties=[['Footprint',element.footprint.map(n=>n*24+' m').join(' × ')],['Design',element.id],['Revision',String(item.revision)]];
  const building=buildingForElement(element);
  if(building)properties.push(['Nautilus design',building.source.name],['Style',building.source.style],
    ['Building',building.compiled.width+' × '+building.compiled.depth+' m · '+building.compiled.stories+' storeys']);
  if(fort)properties.push(['Weak approach',weakApproachDirection(item)],['Orientation',item.rotation+'°']);
  $('element-properties').replaceChildren();
  for(const [name,value]of properties){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value;$('element-properties').append(dt,dd);}
  redraw();
}
function selectRegion(id,keepElement=false){
  selectedRegion=id;const current=region();
  if(!current)return;
  if(!keepElement||!current.elements.some(item=>item.id===selectedElement))
    selectedElement=current.elements.find(item=>elementById(item.element,item.revision).kind==='fortification')?.id||current.elements[0].id;
  const ordered=[...current.elements].sort((a,b)=>{
    const af=elementById(a.element,a.revision).kind==='fortification',bf=elementById(b.element,b.revision).kind==='fortification';
    return Number(bf)-Number(af)||a.y-b.y||a.x-b.x;
  });
  options($('element'),ordered.map(item=>({id:item.id,name:elementById(item.element,item.revision).name+' · block '+(item.x+1)+','+(item.y+1)})),selectedElement);
  $('sector').value=id;
  const posts=current.elements.filter(item=>elementById(item.element,item.revision).kind==='fortification').length;
  $('sector-summary').textContent=posts+' guard posts · route enters '+current.entry+' and leaves '+current.exit;
  inspect();
}
function apply(next,{keep=false}={}){
  assertOvermap(next);map=next;
  options($('sector'),map.route.map(id=>{const r=map.regions.find(item=>item.id===id);return {id,name:r.name};}),selectedRegion);
  $('seed').value=map.seed;$('columns').value=map.width;$('rows').value=map.height;
  $('posts').value=map.settings?.encounters||3;
  $('world-summary').textContent=map.regions.length+' sectors · seed '+map.seed+(map.revision?' · edited':'');
  selectRegion(keep&&map.regions.some(r=>r.id===selectedRegion)?selectedRegion:map.route[0],keep);
  controls(false);
}
function generate(event){
  event?.preventDefault();if(!$('generate-form').reportValidity())return;
  cancel();const id=++request;
  controls(true);status('Generating connected approaches…');
  const url=new URL('./overmap-worker.js'+new URL(import.meta.url).search,import.meta.url);
  worker=new Worker(url,{type:'module'});
  timer=setTimeout(()=>{if(id===request){cancel();status('Generation timed out. Adjust the settings and generate again.',true);}},20000);
  worker.onmessage=event=>{
    const data=event.data;if(data.id!==request)return;
    if(data.progress){status(data.progress.stage+' · '+data.progress.completed+'/'+data.progress.total+' sectors');return;}
    clearTimeout(timer);worker.terminate();worker=null;
    try{if(data.error)throw Error(data.error);apply(data.map);status('Connected world and weak approaches checked. Select a sector to inspect its variations.');}
    catch(error){controls(false);status(error.message,true);}
  };
  worker.onerror=event=>{if(id===request){cancel();status(event.message||'The generator could not start.',true);}};
  worker.postMessage({id,seed:Number($('seed').value),settings:{width:Number($('columns').value),height:Number($('rows').value),encounters:Number($('posts').value)}});
}
function download(value,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);
}
$('generate-form').onsubmit=generate;
$('cancel').onclick=()=>{cancel();status('Generation cancelled.');};
$('check').onclick=()=>{
  const result=validateOvermap(map);
  status(result.valid?'World connections, every guard approach, patrol clearances and occupied footprints passed.':result.errors.slice(0,6).join('\n'),!result.valid);
};
$('export').onclick=()=>{try{download(assertOvermap(map),'farmyard-overmap-'+map.seed+'.json');}catch(error){status(error.message,true);}};
$('export-sector').onclick=()=>{try{download(sectorBlueprint(map,selectedRegion),'farmyard-sector-'+selectedRegion+'.blueprint.json');}catch(error){status(error.message,true);}};
$('import').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try{
    if(file.size>16000000)throw Error('Choose an overmap blueprint smaller than 16 MB.');
    const next=assertOvermap(JSON.parse(await file.text()));
    cancel();apply(next);status('Imported the authored arrangement and checked its connections.');
  }catch(error){status(error.message,true);}
  event.target.value='';
};
$('sector').onchange=()=>selectRegion($('sector').value);
$('element').onchange=()=>{selectedElement=$('element').value;inspect();};
$('world').onclick=event=>{if(map){const selected=worldCell($('world'),event,map);if(selected)selectRegion(selected.id);}};
$('region').onclick=event=>{if(map){const selected=regionElement($('region'),event,region());if(selected){selectedElement=selected.id;$('element').value=selected.id;inspect();}}};
$('replace').onclick=()=>{
  try{
    const item=instance(),element=elementById(item.element,item.revision);
    const changes=element.kind==='fortification'?{kit:$('equipment').value,behavior:$('behavior').value,guardType:$('guard-type').value}:{};
    const next=replaceElement(map,selectedRegion,selectedElement,$('variation').value,changes);
    apply(next,{keep:true});status('Variation applied. Connected approaches and clearances passed.');
  }catch(error){status(error.message,true);}
};
const resize=new ResizeObserver(redraw);
for(const id of ['world','region','detail'])resize.observe($(id));
window.addEventListener('pagehide',()=>{cancel();resize.disconnect();});
const seed=new URLSearchParams(location.search).get('seed');
if(seed!==null&&/^\d+$/.test(seed)&&Number(seed)<=0xffffffff)$('seed').value=seed;
controls(false);generate();
// Read-only diagnostics used by native browser acceptance.
export function inspectOvermap(includePlan=false){
  return {ready:!!map&&!worker,seed:map?.seed,revision:map?.revision,sectors:map?.regions.length,
    selectedRegion,selectedElement,status:$('status').textContent,
    ...(includePlan&&map?{map:structuredClone(map)}:{})};
}
