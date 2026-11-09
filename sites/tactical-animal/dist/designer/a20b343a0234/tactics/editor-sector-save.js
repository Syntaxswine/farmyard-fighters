import {chooseLibrary,rememberedLibrary,requireLibrary,saveFolderVariant,downloadText} from './sector-folder.js';
import {prepareVariant} from './sector-variant.js';
import {presetEntry,nextVariantName,variantPath} from './sector-presets.js';

export function installSectorSave({getDocument,status,getCurrent=()=>null,onSaved=()=>{},isLoading=()=>false}){
 const button=document.createElement('button');button.id='save-sector-variant';button.textContent='Save as new sector variant';document.querySelector('.remote-view').append(button);
 const dialog=document.createElement('dialog');dialog.id='sector-save-dialog';dialog.setAttribute('aria-labelledby','sector-save-title');
 dialog.innerHTML='<form><h1 id="sector-save-title">Save a new sector variant</h1><p id="sector-save-location"></p><div class="sector-source-actions"><button type="button" id="sector-choose-folder">Choose map library folder</button><button type="button" id="sector-download-mode">Download instead</button></div><p id="sector-folder-location"></p><label>New variant name<input id="sector-variant-name" required pattern="[a-z0-9](?:[a-z0-9]|-){0,119}" placeholder="town-west-market" autocomplete="off"></label><p id="sector-variant-path" class="sector-path"></p><label>Progress<select id="sector-variant-status"><option value="in-progress">In progress</option><option value="authored">Ready for review</option></select></label><p class="muted">Each save creates a new map in this configuration. Existing maps and the base layout are kept. Ready for review does not certify campaign compatibility.</p><p id="sector-save-result" role="status"></p><div class="sector-save-actions"><button type="submit" id="sector-save-submit">Save new variant</button><button type="button" id="sector-save-close">Close</button></div></form>';
 document.body.append(dialog);const $=id=>dialog.querySelector('#'+id);let current=null,entry=null,target='download',token=null,busy=false;
 const path=()=>{if(entry)$('sector-variant-path').textContent='Folder / file: '+variantPath(entry,$('sector-variant-name').value||'your-variant');};
 function lock(value){busy=value;dialog.setAttribute('aria-busy',String(value));for(const el of dialog.querySelectorAll('button,input,select'))el.disabled=value;}
 async function destination(download=false){
  lock(true);entry=null;token=null;$('sector-save-result').textContent='Finding the map folder…';
  try{
   const folder=!download&&await rememberedLibrary();target=folder?'folder':'download';
   if(folder){await requireLibrary();$('sector-folder-location').textContent='Map folder: '+folder.name;}
   else if(!download){try{const r=await fetch('/api/sector-authoring',{cache:'no-store'}),data=r.ok?await r.json():null;if(data?.token){token=data.token;target='workspace';$('sector-folder-location').textContent='Workspace map folder: '+data.source;}}catch{/* Static hosts use a portable download. */}}
   entry=await presetEntry(current.id,{source:target==='folder'?'folder':'bundled'});
   if(target==='download')$('sector-folder-location').textContent='Download a portable JSON map, then place it in the folder shown below. Connect a map folder to save and register variants directly.';
   if(!$('sector-variant-name').value)$('sector-variant-name').value=nextVariantName(entry,getCurrent()?.id===current.id?getCurrent().variant:'placeholder.json');
   $('sector-save-submit').textContent=target==='download'?'Download variant JSON':'Save new variant';
   $('sector-save-result').textContent=target==='download'?'The download can be reopened with Import JSON. To add it to the library, connect a map folder and save it there.':'Ready to save a new variant.';path();
  }catch(error){$('sector-save-result').textContent=error.message+' Choose the map folder again or download a copy.';}
  finally{lock(false);$('sector-save-submit').disabled=!entry;}
 }
 async function show(){
  if(busy||isLoading())return status('Wait for the current operation to finish.');
  const doc=getDocument(),id=doc?.map.sectorTemplate?.id;if(!doc||doc.block||!id)return status('Open Sector presets and choose a configuration before saving a variant.');
  const transform=doc.map.sectorTemplate.transform;if(transform&&(transform.turns||transform.mirror))return status('Open this configuration at 0° to save a variant with matching entrances. Export JSON is available for rotated layouts.');
  current={doc,id};$('sector-save-location').textContent='Configuration: '+id;$('sector-variant-name').value='';$('sector-variant-status').value='in-progress';dialog.showModal();await destination();$('sector-variant-name').focus();$('sector-variant-name').select();
 }
 $('sector-variant-name').oninput=path;
 $('sector-choose-folder').onclick=async()=>{lock(true);try{await chooseLibrary();await destination();}catch(error){$('sector-save-result').textContent=error.message;}finally{lock(false);$('sector-save-submit').disabled=!entry;}};
 $('sector-download-mode').onclick=()=>destination(true);
 dialog.querySelector('form').onsubmit=async event=>{
  event.preventDefault();if(busy||!entry||!$('sector-variant-name').reportValidity())return;
  const name=$('sector-variant-name').value,progress=$('sector-variant-status').value,doc=current.doc,revision=doc.revision;lock(true);
  try{
   if(entry.variants.includes(name+'.json'))throw Error('That variant already exists. Choose a new name.');
   const request={id:current.id,name,status:progress,map:JSON.parse(doc.export())};
   if(target==='download'){const prepared=prepareVariant(entry,request);downloadText(JSON.stringify(prepared.map)+'\n',prepared.filename);$('sector-save-result').textContent='Downloaded: '+prepared.filename+'. Intended location: '+variantPath(entry,name)+'. Connect a map folder to add it to the library.';status('Sector variant downloaded as '+prepared.filename+'.');return;}
   let result;
   if(target==='folder')result=await saveFolderVariant(await requireLibrary(true),request);
   else {const response=await fetch('/api/sector-authoring/variants',{method:'POST',headers:{'Content-Type':'application/json','X-Sector-Token':token},body:JSON.stringify(request)});result=await response.json();if(!response.ok)throw Error(result.error||'Variant save failed.');}
   entry.variants.unshift(result.variant);$('sector-save-result').textContent='Saved: '+result.path;
   onSaved(result,{source:target==='folder'?'folder':'bundled',document:doc,revision});status('New sector variant saved: '+result.path+'. Open Sector presets to continue with another piece.');
  }catch(error){$('sector-save-result').textContent=error.message;}
  finally{lock(false);}
 };
 $('sector-save-close').onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});button.onclick=show;
 return {show};
}
