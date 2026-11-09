import {folderCatalog,requireLibrary,readLibraryFile} from './sector-folder.js';
import {validSectorId,MAP_ROLES} from './sector-variant.js';
import {expandPlaceholder} from './sector-placeholder.js';

export const validVariant=name=>typeof name==='string'&&/^[a-zA-Z0-9_-]+\.json$/.test(name);
async function bundledFile(id,file,fetcher){
 const response=await fetcher('./sector-library/'+(id?id+'/':'')+file,{cache:'no-store'});
 if(!response.ok)throw Error('Map file unavailable: '+file+' (HTTP '+response.status+').');
 return response.json();
}
export async function presetEntry(id,{source='bundled',fetcher=globalThis.fetch}={}){
 if(!validSectorId(id))throw Error('Invalid sector configuration.');
 const entry=source==='folder'?JSON.parse(await readLibraryFile(id,'placeholder.json')):await bundledFile(id,'placeholder.json',fetcher);
 if(entry.id!==id||!MAP_ROLES.includes(entry.role)||!Array.isArray(entry.variants)||!entry.variants.every(validVariant)||!entry.allowedTransforms?.length)throw Error('Invalid sector preset: '+id);
 return entry;
}
export async function presetCatalog({source='bundled',fetcher=globalThis.fetch}={}){
 if(source==='folder')return folderCatalog(await requireLibrary());
 const index=await bundledFile('','index.json',fetcher);
 return Promise.all(index.entries.map(row=>presetEntry(row.id,{fetcher}).then(entry=>({...entry,collectionRole:row.collectionRole||entry.role}))));
}
export function filterPresets(entries,{query='',role='',feature=''}={}){
 const words=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 return entries.filter(e=>(!role||e.role===role||role==='tutorial'&&e.tutorialStep)&&(!feature||(e.config?.feature?.kind||'land')===feature)&&words.every(word=>[e.id,e.role,...(e.facilities||[]),...(e.variants||[])].join(' ').replaceAll('-',' ').toLowerCase().includes(word.replaceAll('-',' '))));
}
export function nextVariantName(entry,from='placeholder.json'){
 const stem=from==='placeholder.json'?'variant':from.replace(/\.json$/,'').replace(/-\d+$/,'').toLowerCase();
 const base=validSectorId(stem)?stem.slice(0,112):'variant';
 for(let n=1;;n++){const name=base+'-'+String(n).padStart(2,'0');if(!entry.variants.includes(name+'.json'))return name;}
}
export function variantPath(entry,name){return (entry.collectionRole||entry.role)+'/'+entry.id+'/'+name+'.json';}
export async function loadPreset({id,variant='placeholder.json',orientation=0,source='bundled'},{fetcher=globalThis.fetch}={}){
 if(!validSectorId(id)||!validVariant(variant))throw Error('Invalid sector map path.');
 const entry=await presetEntry(id,{source,fetcher});
 if(!entry.variants.includes(variant))throw Error('This variant is not registered with the preset.');
 const map=variant==='placeholder.json'?entry:source==='folder'?JSON.parse(await readLibraryFile(id,variant)):await bundledFile(id,variant,fetcher);
 if(map.kind==='sector-placeholder'){
  if(!Number.isInteger(orientation)||!entry.allowedTransforms[orientation])throw Error('Unsupported orientation.');
  return expandPlaceholder(map,entry.allowedTransforms[orientation]);
 }
 if(orientation!==0)throw Error('Authored maps open in their saved orientation.');
 if(map.sectorTemplate?.id&&map.sectorTemplate.id!==id)throw Error('The map belongs to a different sector preset.');
 return {...map,sectorTemplate:{...map.sectorTemplate,id,role:entry.role,config:map.sectorTemplate?.config||entry.config,transform:map.sectorTemplate?.transform||{turns:0,mirror:false}}};
}
export function presetSearch({id,variant='placeholder.json',orientation=0,source='bundled'}){
 const params=new URLSearchParams({editing:'1',sectorTemplate:id,orientation:String(orientation),variant});
 if(source==='folder')params.set('library','folder');
 return '?'+params;
}
