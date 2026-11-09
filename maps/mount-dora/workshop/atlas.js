import {NAUTILUS_COMMIT,grid,sectorFile,neighbors,readiness,landmarksFor} from './model.js';
const $=id=>document.getElementById(id),say=text=>{$('status').textContent=text;};
const state={request:0,input:null,selected:null,active:null,busy:false,bridge:false};
async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('Cannot load '+new URL(url,location.href).pathname+' ('+r.status+').');return r.json();}
function api(){if(!state.bridge)return null;try{const w=$('workshop').contentWindow;return w.nautilus?.contract?.format==='aft-map-v2'&&w.nautilus.document&&!w.editor3d.loading?w.nautilus:null;}catch{return null;}}
function buttons(){$('download').disabled=!state.input||state.busy;$('open').disabled=!state.input||!state.readiness?.ready||!api()||state.busy;$('current').disabled=!api()||state.busy;}
function list(id,items,empty){$(id).replaceChildren(...(items.length?items:[empty]).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));}
function download(text,name){const u=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=name.replace(/[^a-z0-9_.-]/gi,'-');a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
async function select(s){
  const request=++state.request;state.selected=s;state.input=null;state.readiness=null;buttons();
  for(const b of $('grid').children)b.setAttribute('aria-pressed',String(b.dataset.id===s.id));
  $('title').textContent=s.name||s.id;$('bounds').textContent='Town metres: east '+s.origin.x+'–'+(s.origin.x+240)+'; south '+s.origin.y+'–'+(s.origin.y+240)+'. 240 × 240 m.';
  $('source').textContent='Reading the complete sector file…';$('readiness').textContent='Checking native import evidence…';$('reasons').replaceChildren();
  $('neighbors').replaceChildren(...neighbors(state.project,s).map(n=>{const b=document.createElement('button');b.textContent=n.direction+': '+n.sector.id;b.onclick=()=>select(n.sector);return b;}));
  list('landmarks',landmarksFor(state.project,s,state.features),'No named landmark recorded.');
  try{
    const r=await fetch(new URL(sectorFile(s.file),state.projectURL),{cache:'no-store'});if(!r.ok)throw Error('Sector download failed ('+r.status+').');
    const bytes=await r.arrayBuffer(),text=new TextDecoder().decode(bytes),map=JSON.parse(text);
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(request!==state.request)return;state.input=text;state.readiness=readiness(state.report,s,hash);
    $('source').textContent=(state.host?.sourceMode==='fixtures'?'Synthetic review fixture':'Geographic sector file available')+' · '+bytes.byteLength.toLocaleString()+' bytes · '+map.levels+' layers.';
    $('readiness').textContent=state.readiness.label;list('reasons',state.readiness.errors,'Pinned API import, history and export/reopen passed for these exact bytes.');buttons();
    say('Selection changed. The workshop document has not been replaced.');
  }catch(e){if(request===state.request){say(e.message);$('readiness').textContent='Sector unavailable';}}
}
$('download').onclick=()=>{if(state.input)download(state.input,state.selected.id+'.json');};
$('current').onclick=()=>{try{download(api().export(),(state.active||'workshop')+'-edited.json');}catch(e){say(e.message);}};
$('open').onclick=async()=>{
  const a=api();if(!a||!state.readiness?.ready||!state.input||state.busy)return;
  if(a.document.changed&&!confirm('Replace the current workshop design? Export or save your edits first.'))return;
  const selected=state.selected,input=state.input;state.busy=true;buttons();
  try{await a.open(input);state.active=selected.id;$('active').textContent='Open document: '+selected.id+'. Native Import, tools, Undo, Redo, saves and Export remain below.';say(selected.id+' opened in the existing Nautilus workshop.');}
  catch(e){say('Workshop rejected the sector: '+e.message);}finally{state.busy=false;buttons();}
};
window.addEventListener('beforeunload',e=>{if(api()?.document.changed){e.preventDefault();e.returnValue='';}});
async function start(){
  try{const r=await fetch('./host.json',{cache:'no-store'});if(r.ok){const h=await r.json();if(h.kind==='mount-dora-workshop-review-v1'&&h.nautilusCommit===NAUTILUS_COMMIT&&new URL(h.workshop,location.href).origin===location.origin)state.host=h;}}catch{}
  state.projectURL=new URL(state.host?.project||'../project.json',location.href);state.project=await json(state.projectURL);
  const sectors=grid(state.project);state.features=[];
  if(state.project.featuresFile){try{state.features=(await json(new URL(sectorFile(state.project.featuresFile),state.projectURL))).features||[];}catch(e){say('Landmark source unavailable: '+e.message);}}
  if(state.project.atlasFile&&/^[a-z0-9_-]+\.svg$/i.test(state.project.atlasFile)){const a=document.createElement('a');a.href=new URL(state.project.atlasFile,state.projectURL);a.target='_blank';a.rel='noopener';a.textContent='Open geographic overview ↗';$('grid').after(a);$('grid').classList.add('geographic');$('grid').style.backgroundImage='url("'+a.href+'")';}
  $('grid').style.aspectRatio=state.project.columns+'/'+state.project.rows;
  try{state.report=await json(new URL(state.host?.audit||'./audit.json',location.href));}catch{}
  $('summary').textContent=(state.project.name||'Mount Dora')+' · '+state.project.columns+' × '+state.project.rows+' sectors · '+state.project.columns*240+' × '+state.project.rows*240+' m. '+(state.host?.sourceMode==='fixtures'?'SYNTHETIC FIXTURES — not the town map.':'North up; one metre per tile.');
  $('grid').style.gridTemplateColumns='repeat('+state.project.columns+',minmax(0,1fr))';$('grid').style.gridTemplateRows='repeat('+state.project.rows+',minmax(0,1fr))';
  $('grid').replaceChildren(...sectors.map(s=>{const b=document.createElement('button');b.dataset.id=s.id;b.setAttribute('aria-pressed','false');b.style.gridColumn=s.column+1;b.style.gridRow=s.row+1;b.textContent=s.name||s.id;b.onclick=()=>select(s);return b;}));
  if(state.host){
    $('workshop-panel').hidden=false;
    $('workshop').addEventListener('load',()=>{const end=Date.now()+90000;const timer=setInterval(()=>{state.bridge=true;if(api()){clearInterval(timer);buttons();$('instructions').textContent='Direct opening calls window.nautilus.open in the actual pinned workshop ('+NAUTILUS_COMMIT.slice(0,7)+'). Only the selected sector loads.';}else if(Date.now()>end){clearInterval(timer);state.bridge=false;buttons();say('Workshop not ready. Download JSON and use native Import after it loads.');}},250);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});});
    $('workshop').src=state.host.workshop;
  }else{$('open').hidden=true;}
  if(sectors.length)await select(sectors[0]);
}
start().catch(e=>say(e.message));
