import {parseMap} from './core/maps.js';
export const MAP_LIBRARY_FILE='animal-factory-map-library.json';
export const MAP_LIBRARY_KIND='animal-factory-map-library';
export const MAP_ROLES=['countryside','town','village','city','fortress','tutorial','special'];
export const validSectorId=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,119}$/.test(s);
export function checkLibraryMarker(m){if(m?.kind!==MAP_LIBRARY_KIND||m.version!==1)throw Error('Choose the map library root containing '+MAP_LIBRARY_FILE+'.');return m;}
export function prepareVariant(entry,{id,name,status='in-progress',map}){
 if(!validSectorId(id)||!validSectorId(name)||name==='placeholder')throw Error('Use a unique lowercase name with letters, numbers and hyphens.');if(!['in-progress','authored'].includes(status))throw Error('Invalid progress status.');
 if(entry.id!==id||!MAP_ROLES.includes(entry.role))throw Error('Configuration identity mismatch.');const valid=parseMap(JSON.stringify(map),{allowDisconnected:status!=='authored'});
 if(valid.terrain.length!==240||valid.terrain.some(r=>r.length!==240))throw Error('Save a full 240 × 240 sector.');const t=map.sectorTemplate?.transform;if(t&&(t.turns||t.mirror))throw Error('Open the configuration at 0° before saving a variant.');if(map.sectorTemplate?.id&&map.sectorTemplate.id!==id)throw Error('Map belongs to a different configuration.');
 valid.sectorTemplate={...map.sectorTemplate,id,role:entry.role,config:entry.config,transform:{turns:0,mirror:false},status,scope:'authored map; campaign compatibility still requires review'};
 const filename=name+'.json',metadata=structuredClone(entry);delete metadata.folder;delete metadata.collectionRole;metadata.variants=[filename,...(metadata.variants||['placeholder.json'])];metadata.variantDetails={...metadata.variantDetails,[filename]:{status,preview:name+'.svg'}};metadata.preview=name+'.svg';metadata.status=Object.values(metadata.variantDetails).some(v=>v.status==='authored')?'authored':'in-progress';return {filename,map:valid,metadata,preview:sectorPreview(valid)};
}
export function sectorPreview(map){const colors={water:'#558b9e',bridge:'#a09072','ground-asphalt':'#575854','ground-wood-planks':'#b08b54','ground-sand':'#c5b788','ground-concrete':'#a4a598',void:'#263b34'};let shapes='';for(let y=0;y<240;y+=3)for(let x=0;x<240;x+=3){let z=0,t=map.terrain[y][x];for(let level=0;level<(map.upper||[]).length;level++){const u=map.upper[level][x+','+y];if(u&&u!=='void'){z=level+1;t=u;}}shapes+=`<rect x="${x}" y="${y}" width="3" height="3" fill="${colors[t]||(z?'#a1b477':'#71865a')}"/>`;}
 for(const p of map.props||[])shapes+=`<rect x="${p.x}" y="${p.y}" width="2" height="2" fill="#705641"/>`;for(const p of map.starts||[])shapes+=`<circle cx="${p.x}" cy="${p.y}" r="2" fill="#f7d878"/>`;return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" shape-rendering="crispEdges">'+shapes+'</svg>';
}
