import {chooseLibrary,createLibrary,rememberedLibrary,readLibraryFile} from './sector-folder.js';
import {MAP_ROLES} from './sector-variant.js';
import {presetCatalog,filterPresets} from './sector-presets.js';

const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
export function installSectorPresets({openPreset,guardReplace,getCurrent}){
 const button=element('button','▤ Sector presets');button.id='sector-presets';button.title='Open a modular sector and make a new variant';document.querySelector('.remote-top').after(button);
 const dialog=element('dialog');dialog.id='sector-presets-dialog';dialog.setAttribute('aria-labelledby','sector-presets-title');
 dialog.innerHTML='<div class="sector-dialog-heading"><div><p class="eyebrow">MODULAR MAP WORKSHOP</p><h1 id="sector-presets-title">Sector presets</h1></div><button id="sector-presets-close" aria-label="Close sector presets">✕</button></div><p>Choose a starting layout or an existing map. After editing, Save creates a new variant in that configuration’s folder.</p><div class="sector-source-actions"><button id="presets-bundled">Bundled presets</button><button id="presets-folder">Choose map folder</button><button id="presets-create">Create map folder</button></div><p id="presets-source" class="muted"></p><div class="sector-filters"><label>Search<input id="presets-search" type="search" placeholder="Town, river, tutorial, workshop…"></label><label>Role<select id="presets-role"><option value="">All roles</option></select></label><label>Feature<select id="presets-feature"><option value="">All terrain</option><option value="land">Land</option><option value="river">River</option><option value="cliff">Cliff</option></select></label></div><p id="presets-status" role="status"></p><div id="presets-cards"></div>';
 document.body.append(dialog);const $=id=>dialog.querySelector('#'+id);for(const role of MAP_ROLES)$('presets-role').add(new Option(role[0].toUpperCase()+role.slice(1),role));
 let entries=[],source='bundled',busy=false,generation=0;
 function lock(value){busy=value;dialog.setAttribute('aria-busy',String(value));for(const b of dialog.querySelectorAll('button'))b.disabled=value;}
 function render(){
  const ticket=++generation,shown=filterPresets(entries,{query:$('presets-search').value,role:$('presets-role').value,feature:$('presets-feature').value});
  $('presets-status').textContent=`${shown.length} of ${entries.length} configurations · ${entries.reduce((n,e)=>n+e.variants.filter(v=>v!=='placeholder.json').length,0)} saved variants`;
  $('presets-cards').replaceChildren();const current=getCurrent();
  for(const entry of shown){
   const card=element('article',null,'sector-preset-card');card.dataset.preset=entry.id;
   const img=element('img');img.alt=entry.id+' layout';img.loading='lazy';
   const title=element('h2',entry.id.replaceAll('--',' · ').replaceAll('-',' '));
   const detail=element('p',`${entry.role} · ${entry.config?.feature?.kind||'land'} · ${entry.variants.filter(v=>v!=='placeholder.json').length} saved variants`,'muted');
   const variants=element('select');variants.setAttribute('aria-label','Variant for '+entry.id);for(const name of entry.variants)variants.add(new Option(name==='placeholder.json'?'Base layout (placeholder)':name.replace(/\.json$/,''),name));
   if(current?.id===entry.id&&entry.variants.includes(current.variant))variants.value=current.variant;
   const orientation=element('select');orientation.setAttribute('aria-label','Orientation for '+entry.id);entry.allowedTransforms.forEach((t,i)=>orientation.add(new Option((t.mirror?'Mirror + ':'')+t.turns*90+'°',i)));
   const note=element('p','','muted'),open=element('button','Open in editor');open.className='open-sector-preset';
   function update(){
    const authored=variants.value!=='placeholder.json';orientation.disabled=authored;if(authored)orientation.value='0';
    const transform=authored?null:entry.allowedTransforms[Number(orientation.value)];img.style.transform=transform?`rotate(${transform.turns*90}deg) scaleX(${transform.mirror?-1:1})`:'';
    const name=entry.variantDetails?.[variants.value]?.preview||(authored?entry.preview:'preview.svg')||'preview.svg',preview=/^[a-zA-Z0-9_-]+\.svg$/.test(name)?name:'preview.svg';
    if(source==='folder'){const variant=variants.value;readLibraryFile(entry.id,preview,entry.collectionRole).then(svg=>{if(ticket===generation&&variants.value===variant)img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);}).catch(()=>{if(ticket===generation)img.removeAttribute('src');});}
    else img.src='./sector-library/'+entry.id+'/'+preview;
    note.textContent=authored?'Opens a copy; Save makes a new variant.':Number(orientation.value)?'Rotated preview. Use 0° to save into this preset folder.':'Road and river entrances stay aligned. Save makes a new variant.';
   }
   variants.onchange=orientation.onchange=update;update();
   open.onclick=async()=>{if(busy||!guardReplace())return;lock(true);$('presets-status').textContent='Opening '+entry.id+'…';try{await openPreset({id:entry.id,variant:variants.value,orientation:Number(orientation.value),source});dialog.close();}catch(error){$('presets-status').textContent='Cannot open preset: '+error.message;}finally{lock(false);}};
   card.append(img,title,detail,variants,orientation,note,open);$('presets-cards').append(card);
  }
 }
 async function load(next){lock(true);source=next;$('presets-status').textContent='Loading sector presets…';try{entries=await presetCatalog({source});$('presets-source').textContent=source==='folder'?'Map folder: '+(await rememberedLibrary()).name:'Bundled layouts and maps · connect a map folder to save directly, or use the local authoring workspace.';render();}catch(error){entries=[];$('presets-cards').replaceChildren();$('presets-status').textContent=error.message;}finally{lock(false);}}
 $('presets-bundled').onclick=()=>load('bundled');
 for(const [id,choose]of [['presets-folder',chooseLibrary],['presets-create',createLibrary]])$(id).onclick=async()=>{lock(true);$('presets-status').textContent=id==='presets-create'?'Choose an empty folder. Copying all starter maps…':'Choose the root of your map library.';try{await choose();await load('folder');}catch(error){$('presets-status').textContent=error.message;}finally{lock(false);}};
 for(const id of ['presets-search','presets-role','presets-feature'])$(id).oninput=()=>{if(!busy)render();};
 $('sector-presets-close').onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 button.onclick=async()=>{dialog.showModal();await load(await rememberedLibrary()?'folder':'bundled');$('presets-search').focus();};
 return {show:()=>button.click()};
}
