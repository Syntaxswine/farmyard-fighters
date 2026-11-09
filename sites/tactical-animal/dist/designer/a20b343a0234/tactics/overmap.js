import {ENVIRONMENTS,environmentSummary} from './environment-regions.js';
import {ENVIRONMENT_PREVIEW_KEY,environmentPreviewKey} from './environment-preview.js';
import {travelPanel} from './overmap-travel-panel.js';
import {validateGenerated} from './overmap-generator.js';
import {WIDTH,HEIGHT,SIDES,ROLES,TERRAINS,slots,fraction,route,blank,demo,validate,warnings,SketchDocument,plateauRim,placeTutorial,tutorialCells} from './overmap-model.js';
import {svg,drawSector,icon,LEGEND,crossing} from './overmap-symbols.js';
const $=id=>document.getElementById(id),doc=new SketchDocument(),STORAGE='farmyard-commando-overmap-sketch-v1';
let selected=7*WIDTH+7,worldWorker=null,controlsMap=null;const generationReports=new WeakMap(),environmentReports=new WeakMap();
function environmentReport(){const field=doc.map.environments;if(!field)return [];let report=environmentReports.get(field);if(!report){report=environmentSummary(field);environmentReports.set(field,report);}return report;}
const status=text=>{$('status').textContent=text;};
const attempt=fn=>{try{fn();}catch(e){status(e.message);}};
const option=(v,label=v)=>new Option(label.replaceAll('-',' '),v);
for(const [id,values]of [['terrain',TERRAINS],['role',ROLES],['difficulty',['unassigned','easy','medium','hard']],['owner',['unassigned','player','red-hats','neutral']]])for(const v of values)$(id).add(option(v));
function edit(fn){attempt(()=>{doc.edit(selected,fn);render();status('Sector updated. Save to keep this sketch; Undo restores the previous change.');});}
function textNode(text,attrs){const n=svg('text',attrs);n.textContent=text;return n;}
function drawGrid(){
 const host=$('overmap');host.replaceChildren();
 for(let x=0;x<WIDTH;x++)host.append(textNode(x+1,{x:x*100+50,y:-8,class:'coord'}));
 for(let y=0;y<HEIGHT;y++)host.append(textNode(y+1,{x:-13,y:y*100+54,class:'coord'}));
 doc.map.sectors.forEach((s,i)=>{
  const x=i%WIDTH,y=Math.floor(i/WIDTH),g=svg('g',{transform:`translate(${x*100} ${y*100})`,class:'sector-cell',role:'button',tabindex:i===selected?0:-1,'aria-label':`Sector ${x+1}, ${y+1}: ${s.name||s.role}, ${s.difficulty}`,'aria-pressed':String(i===selected),'data-sector':i});
  const title=svg('title');title.textContent=`${x+1},${y+1} · ${s.name||s.role}\n${s.routes.map(r=>r.kind+': '+r.from.side+' '+fraction(r.from.offset)+' → '+r.to.side+' '+fraction(r.to.offset)).join('\n')}`;
  g.append(title,drawSector({...s,owner:travelUI.owner(i)||s.owner},{ports:$('ports').checked,overlay:$('overlay').value,rim:plateauRim(doc.map,i),environments:doc.map.environments,index:i}),svg('rect',{width:100,height:100,class:'cell-border'}));
  if(i===selected)g.append(svg('rect',{x:2,y:2,width:96,height:96,class:'selection'}));
  const choose=()=>{selected=i;travelUI.chooseDestination(i);render();};g.onclick=choose;
  g.onkeydown=e=>{let next=i;if(e.key==='ArrowRight')next=y*WIDTH+Math.min(WIDTH-1,x+1);else if(e.key==='ArrowLeft')next=y*WIDTH+Math.max(0,x-1);else if(e.key==='ArrowUp')next=Math.max(0,y-1)*WIDTH+x;else if(e.key==='ArrowDown')next=Math.min(HEIGHT-1,y+1)*WIDTH+x;else if(e.key!=='Enter'&&e.key!==' ')return;else {e.preventDefault();choose();return;}e.preventDefault();selected=next;render();$('overmap').querySelector(`[data-sector="${selected}"]`).focus();};
  host.append(g);
 });
 const defs=svg('defs'),arrow=svg('marker',{id:'red-route-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto'});arrow.append(svg('path',{d:'M0 0L10 5L0 10Z',fill:'#b32721'}));defs.append(arrow);host.append(defs);
 const drawings=travelUI.drawing,palette=['#275f76','#a3422a','#536b24','#713e80'];
 for(const [n,g]of drawings.entries())if(g.route.length)host.append(svg('polyline',{points:[g.position,...g.route.map(i=>({x:i%WIDTH+.5,y:Math.floor(i/WIDTH)+.5}))].map(p=>p.x*100+','+p.y*100).join(' '),fill:'none',stroke:g.kind==='raiders'?'#b32721':g.kind==='convoy'?'#80612e':palette[n%4],'marker-end':g.kind==='raiders'?'url(#red-route-arrow)':'','stroke-width':g.selected?9:5,'stroke-dasharray':g.selected?'':'12 7','pointer-events':'none'}));
 for(const [n,g]of drawings.entries()){const same=drawings.filter(d=>d.position.x===g.position.x&&d.position.y===g.position.y),offset=(same.indexOf(g)-(same.length-1)/2)*32,marker=svg('g',{transform:`translate(${g.position.x*100+offset} ${g.position.y*100})`,role:'button',tabindex:0,'aria-label':(g.kind?'Intercept ':'Select ')+g.name,class:'travel-marker'});if(g.kind==='raiders'){marker.append(svg('ellipse',{rx:17,ry:20,fill:'#cfa97a',stroke:'#442d22','stroke-width':3}),svg('path',{d:'M-22 -9L-14 -25L15 -25L23 -9Z',fill:'#b32721',stroke:'#442d22','stroke-width':3}),svg('path',{d:'M-8 0h3M6 0h3M-5 11h10',stroke:'#442d22','stroke-width':4}));}else if(g.kind==='convoy'){marker.append(svg('rect',{x:-18,y:-14,width:36,height:28,fill:'#a98347',stroke:'#442d22','stroke-width':4}),svg('path',{d:'M-13 -10L13 10M13 -10L-13 10',stroke:'#442d22','stroke-width':3}));}else marker.append(svg('circle',{r:g.selected?22:17,fill:palette[n%4],stroke:'#fff4d6','stroke-width':5}));const choose=e=>{e.stopPropagation();if(g.kind)travelUI.chooseDestination(g.route[0]??Math.floor(g.position.y)*WIDTH+Math.floor(g.position.x));else travelUI.chooseGroup(g.id);};marker.onclick=choose;marker.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(e);}};host.append(marker);}
 const colors=$('overlay').value==='environment'?environmentReport().map(p=>[ENVIRONMENTS[p.family].name+' · '+p.percent.toFixed(1)+'%',ENVIRONMENTS[p.family].color]):$('overlay').value==='difficulty'?[['Easy','#dbe0c1'],['Medium','#ebd7ad'],['Hard','#e2bbb0'],['Unassigned','#ece4cf']]:$('overlay').value==='ownership'?[['Player','#c3d9d5'],['Red Hats','#e4b6a7'],['Neutral','#d7d3c1'],['Unassigned','#ece4cf']]:[['Landscape','#ece4cf']];
 $('overlay-key').replaceChildren(...colors.map(([label,color])=>{const span=document.createElement('span'),chip=document.createElement('i');chip.className='swatch';chip.style.background=color;span.append(chip,label);return span;}));
 const tutorial=doc.map.sectors.filter(s=>s.tutorialStep||s.role==='tutorial');$('tutorial-summary').textContent=`Tutorial: ${tutorial.length} / 5 sectors. Town + three tutorial sectors + start. Footprint: TOO / XXO / XSO; any quarter-turn.`;$('find-start').disabled=!tutorial.length;
 $('counts').textContent=`450 sectors · ${doc.map.sectors.filter(s=>s.routes.some(r=>r.kind==='river')).length} river sectors · ${doc.map.sectors.filter(s=>s.gate==='bridge'&&!['town','village','city'].includes(s.role)).length} bridges · ${doc.map.sectors.filter(s=>s.gate==='bridge'&&['town','village','city'].includes(s.role)).length} settlement crossings`;
}
function drawDetail(s){
 const el=$('detail');el.replaceChildren(drawSector(s,{ports:true,overlay:$('overlay').value,detail:true,rim:plateauRim(doc.map,selected),environments:doc.map.environments,index:selected}),svg('rect',{width:100,height:100,class:'detail-outline'}));
 for(const n of [1/3,.5,2/3]){const v=n*100,t=fraction(n);el.append(textNode(t,{x:v,y:-3,class:'edge-label'}),textNode(t,{x:v,y:106,class:'edge-label'}),textNode(t,{x:-6,y:v+1.5,class:'edge-label'}),textNode(t,{x:107,y:v+1.5,class:'edge-label'}));}
 for(const [t,x,y]of [['N',50,-11],['S',50,114],['W',-13,52],['E',114,52]])el.append(textNode(t,{x,y,class:'side-label'}));
}
function pathEditor(r,index){
 const root=document.createElement('div');root.className='route-editor';const heading=document.createElement('div');heading.className='route-heading';const name=document.createElement('b');name.textContent=r.kind;const remove=document.createElement('button');remove.textContent='Remove';remove.setAttribute('aria-label',`Remove ${r.kind} path ${index+1}`);remove.onclick=()=>edit(s=>s.routes.splice(index,1));heading.append(name,remove);root.append(heading);
 for(const key of ['from','to']){const row=document.createElement('div');row.className='endpoint';const label=document.createElement('span');label.textContent=key==='from'?'From':'To';const side=document.createElement('select'),offset=document.createElement('select');side.setAttribute('aria-label',`${r.kind} ${index+1} ${key} edge`);offset.setAttribute('aria-label',`${r.kind} ${index+1} ${key} offset`);(r.kind==='road'?[...SIDES,'center']:SIDES).forEach(v=>side.add(option(v)));slots(r.kind).forEach(v=>offset.add(option(String(v),fraction(v))));side.value=r[key].side;offset.value=String(r[key].offset);side.onchange=()=>edit(s=>s.routes[index][key].side=side.value);offset.onchange=()=>edit(s=>s.routes[index][key].offset=Number(offset.value));row.append(label,side,offset);root.append(row);}
 return root;
}
function render(){
 travelUI.render();
 const s=doc.map.sectors[selected];const placement=doc.map.tutorialPlacement;if(placement){$('tutorial-x').value=placement.x+1;$('tutorial-y').value=placement.y+1;$('tutorial-rotation').value=placement.rotation;}$('map-name').value=doc.map.name;$('map-caption').textContent=doc.map.name;$('sector-title').textContent=`${String(selected%WIDTH+1).padStart(2,'0')} / ${String(Math.floor(selected/WIDTH)+1).padStart(2,'0')}`;
 drawGrid();drawDetail(s);showGenerationReport();
 const field=doc.map.environments;$('preview-environment').disabled=!field;$('environment-detail').textContent=field?environmentSummary(field,selected%WIDTH,Math.floor(selected/WIDTH),1,1,20).map(p=>ENVIRONMENTS[p.family].name+' '+p.percent.toFixed(1)+'%').join(' · '):'No environment regions in this older sketch. Generate a fresh world to preview them.';
 $('environment-summary').textContent=field?field.families.length+' environment '+(field.families.length===1?'family':'families')+' · '+environmentReport().map(p=>ENVIRONMENTS[p.family].name+' '+p.percent.toFixed(1)+'%').join(' · '):'';
 $('tutorial-step-label').hidden=!['tutorial','town'].includes(s.role);$('tutorial-step').value=s.tutorialStep||'';
 $('sector-name').value=s.name;for(const id of ['terrain','role','difficulty','owner','gate'])$(id).value=s[id];for(const id of ['factory','workshop'])$(id).checked=s.facilities.includes(id);
 $('routes').replaceChildren(...s.routes.map(pathEditor));if(!s.routes.length)$('routes').textContent='No paths in this sector.';
 for(const side of SIDES)$('travel-'+side).checked=s.travel.includes(side);
 const issues=warnings(doc.map,selected);
 if(s.gate!=='none'){const obstacle=s.gate==='bridge'?'river':'cliff';if(s.routes.some(r=>r.kind==='road')&&s.routes.some(r=>r.kind===obstacle)&&!s.routes.filter(r=>r.kind==='road').some(a=>s.routes.filter(r=>r.kind===obstacle).some(b=>crossing(a,b))))issues.push('The paths do not intersect. Crossing symbol is shown provisionally in the corner.');}
 $('warnings').replaceChildren(...(issues.length?issues:['All drawn attachments match their neighbors.']).map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
 $('undo').disabled=!doc.past.length;$('redo').disabled=!doc.future.length;
}
function showGenerationReport(){
 const g=doc.map.generation;if(controlsMap!==doc.map){controlsMap=doc.map;if(g){$('world-seed').value=g.seed;for(const key of ['villages','towns','cities'])if(g.options?.[key]!==undefined)$('world-'+key).value=({villages:3,towns:4,cities:5})[key];}}if(!g){$('generation-report').textContent='Drawing study · no generated-world record. Use Generate seed to build a world.';$('generation-checks').textContent='No generation validation has been run for this drawing.';return;}
 let result=generationReports.get(doc.map);if(!result){result=validateGenerated(doc.map);generationReports.set(doc.map,result);}
 const c=result.counts;$('generation-report').textContent=(result.valid?'Strategic checks pass':'World needs attention')+' · Seed '+g.seed+' · Attempt '+g.attempt+' · Easy '+c.easy+' / Medium '+c.medium+' / Hard '+c.hard;
 $('generation-checks').textContent=result.valid?`Villages ${c.villages}; towns ${c.towns}; cities ${c.cities}. Bridges ${c.bridges}; settlement crossings ${c.settlementCrossings}; cliff passages ${c.passages}.\n`+Object.entries(c.zones||{}).map(([zone,z])=>zone+': '+z.towns+' towns, '+z.villages+' villages; city sectors '+z.cities.join(', ')).join('\n')+'\n'+'450 sectors; 150 per difficulty. Tutorial and interior town checked. 4 river exits; 2 cliff exits. Fortresses: 1 easy, 2 medium, 2 hard. Settlements and roads connected. Bridge counts and spacing checked. All land regions connected through gates. Local templates unassigned.':result.errors.join('\n');
}
function generateWorldUI(seed){
 if(worldWorker)return;const before=doc.map,options={villages:Number($('world-villages').value),towns:Number($('world-towns').value),cities:Number($('world-cities').value)};
 const states=new Map([...document.querySelectorAll('button,input,select')].map(el=>[el,el.disabled]));for(const el of states.keys())el.disabled=true;$('cancel-generation').disabled=false;
 const finish=()=>{worldWorker?.terminate();worldWorker=null;for(const [el,disabled]of states)el.disabled=disabled;$('cancel-generation').disabled=true;render();};
 let worker;try{worker=new Worker(new URL('./overmap-generator-worker.js',import.meta.url),{type:'module'});worldWorker=worker;}catch(e){finish();status('Could not start generation: '+e.message);return;}
 $('generation-report').textContent='Preparing seed '+seed+'…';status('Generating a world in the background. Cancel preserves your current map.');
 $('cancel-generation').onclick=()=>{finish();status('Generation canceled. Current map preserved.');};
 worker.onerror=e=>{finish();status('Generation worker failed: '+e.message);};
 worker.onmessage=({data})=>{if(data.progress){$('generation-report').textContent='Seed '+seed+' · Attempt '+data.progress.attempt+' / 40 · '+data.progress.stage;return;}
  let message;if(data.error)message=data.error;else if(doc.map!==before)message='The drawing changed while generation was running. Generated result was not applied.';else{try{const result=validateGenerated(data.map);if(!result.valid)throw Error(result.errors.join(' '));doc.replace(data.map);generationReports.set(doc.map,result);selected=tutorialCells(doc.map.tutorialPlacement.x,doc.map.tutorialPlacement.y,doc.map.tutorialPlacement.rotation)[0].index;message='World generated from seed '+seed+' after '+doc.map.generation.attempt+' attempt(s). Undo restores the previous map.';}catch(e){message='Generated world rejected: '+e.message;}}
  finish();status(message);
 };
 worker.postMessage({seed,options});
}
$('preview-environment').onclick=()=>attempt(()=>{const key=environmentPreviewKey(doc.map.environments,selected);localStorage.setItem(ENVIRONMENT_PREVIEW_KEY+':'+key,JSON.stringify({field:doc.map.environments,index:selected}));window.open('editor-3d.html?editing=1&environmentPreview='+key,'_blank','noopener');status('Opened a ground and foliage sample. This is a preview, not an assigned tactical sector.');});
$('generate-world').onclick=()=>generateWorldUI(Number($('world-seed').value));
$('randomize-world').onclick=()=>{let seed=crypto.getRandomValues(new Uint32Array(1))[0];if(seed===Number($('world-seed').value))seed=(seed+1)>>>0;$('world-seed').value=seed;generateWorldUI(seed);};
$('validate-world').onclick=()=>{const result=validateGenerated(doc.map);generationReports.set(doc.map,result);$('generation-checks').textContent=result.errors.join('\n')||'All strategic checks pass. Local map templates are not assigned.';$('generation-checks').parentElement.open=true;status(result.valid?'All strategic layout checks pass.':result.errors.length+' world validation issue(s). See generation checks.');};
for(const side of SIDES){const l=document.createElement('label');l.className='check';const input=document.createElement('input');input.type='checkbox';input.id='travel-'+side;input.onchange=()=>edit(s=>{s.travel=SIDES.filter(v=>$('travel-'+v).checked);});l.append(input,side);$('travel').append(l);}
for(const id of ['terrain','role','difficulty','owner','gate'])$(id).onchange=()=>edit(s=>{s[id]=$(id).value;if(!['tutorial','town'].includes(s.role))delete s.tutorialStep;});
$('tutorial-step').onchange=()=>edit(s=>{if($('tutorial-step').value)s.tutorialStep=Number($('tutorial-step').value);else delete s.tutorialStep;});
$('randomize-tutorial').onclick=$('randomize-world').onclick;
$('place-tutorial').onclick=()=>attempt(()=>{const x=Number($('tutorial-x').value)-1,y=Number($('tutorial-y').value)-1,rotation=Number($('tutorial-rotation').value);doc.replace(placeTutorial(doc.map,x,y,rotation));selected=tutorialCells(x,y,rotation)[0].index;render();status('Tutorial group placed. Its town is inside the map boundary. Undo restores the previous placement.');});
$('find-start').onclick=()=>{selected=doc.map.sectors.findIndex(s=>s.role==='tutorial'&&s.tutorialStep===1);if(selected<0)selected=doc.map.sectors.findIndex(s=>s.role==='tutorial');if(selected<0)return;render();$('overmap').querySelector(`[data-sector="${selected}"]`).scrollIntoView({block:'nearest',inline:'nearest'});status('Tutorial plateau selected. Stage order and descent location are editable; local cliff geometry is not connected yet.');};
$('sector-name').onchange=()=>edit(s=>s.name=$('sector-name').value.trim());
for(const id of ['factory','workshop'])$(id).onchange=()=>edit(s=>s.facilities=['factory','workshop'].filter(v=>$(v).checked));
$('map-name').onchange=()=>attempt(()=>{doc.replace({...doc.map,name:$('map-name').value.trim()});render();status('Overmap renamed.');});
$('add-route').onclick=()=>edit(s=>{const kind=$('new-kind').value;s.routes.push(route(kind,'north','south',slots(kind)[0],slots(kind).at(-1)));});
for(const id of ['ports','overlay'])$(id).onchange=render;
$('zoom').onchange=()=>{$('overmap').style.width=(Number($('zoom').value)*100)+'%';};
for(const id of ['undo','redo'])$(id).onclick=()=>{doc[id]();render();status(id==='undo'?'Change undone.':'Change restored.');};
$('blank').onclick=()=>{doc.replace(blank());selected=0;render();status('Blank overmap ready. Undo restores the previous sketch.');};
$('demo').onclick=()=>{doc.replace(demo());selected=7*WIDTH+7;render();status('Illustrative layout loaded. This is not a validated campaign. Undo restores your sketch.');};
$('save').onclick=()=>attempt(()=>{localStorage.setItem(STORAGE,JSON.stringify(doc.map));status('Sketch saved in this browser. Export JSON for a portable copy.');});
$('load').onclick=()=>attempt(()=>{const data=localStorage.getItem(STORAGE);if(!data)throw Error('No saved overmap sketch in this browser.');doc.replace(JSON.parse(data));render();status('Saved sketch loaded. Undo restores the previous sketch.');});
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(doc.map,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='animal-factory-overmap.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Overmap sketch exported.');};
$('export-svg').onclick=async()=>{try{const response=await fetch('overmap.css');if(!response.ok)throw Error('Could not load map styles.');const drawing=$('overmap').cloneNode(true);drawing.setAttribute('xmlns','http://www.w3.org/2000/svg');drawing.setAttribute('width','3000');drawing.setAttribute('height','1500');drawing.removeAttribute('style');drawing.style.fontFamily='system-ui, sans-serif';drawing.querySelectorAll('.selection').forEach(n=>n.remove());drawing.querySelectorAll('[tabindex]').forEach(n=>n.removeAttribute('tabindex'));const style=svg('style');style.textContent=await response.text();drawing.prepend(style);const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(drawing)],{type:'image/svg+xml'})),a=document.createElement('a');a.href=url;a.download='animal-factory-overmap.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Map graphic exported as a standalone SVG with the current overlay and attachment marks.');}catch(e){status(e.message);}};
$('import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2_000_000)throw Error('Sketch files must be smaller than 2 MB.');const data=validate(JSON.parse(await file.text()));doc.replace(data);render();status('Sketch imported. Undo restores the previous sketch.');}catch(err){status('Import failed: '+err.message);}finally{e.target.value='';}};
for(const kind of [...LEGEND,'road','river','cliff','travel']){const item=document.createElement('div');item.className='legend-item';const drawing=svg('svg',{viewBox:'0 0 100 100','aria-hidden':'true'});if(['road','river','cliff'].includes(kind))drawing.append(drawSector({...blank().sectors[0],routes:[route(kind,'west','east')]},{ports:true,overlay:'none'}));else if(kind==='travel')drawing.append(svg('path',{d:'M20 45H63V30L85 50 63 70V55H20Z',class:'travel-port'}));else drawing.append(icon(kind,50,50,1.15));item.append(drawing,kind==='travel'?'Travel declaration':kind);$('legend').append(item);}
const travelUI=travelPanel({getMap:()=>doc.map,getSelected:()=>selected,onLoadMap:map=>{doc.replace(map);},onChange:render});
render();

generateWorldUI(Number($('world-seed').value));
