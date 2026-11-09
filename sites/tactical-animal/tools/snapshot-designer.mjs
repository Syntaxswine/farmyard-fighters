import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

// Read the original checkout; write only the imported designer in this project.
const sourceArg=process.argv.find((arg,i)=>i>1&&!arg.startsWith('--'));
if(!sourceArg)throw Error('Pass the Animal Factory Tactics 3D dist directory.');
const source=fs.realpathSync(sourceArg),dryRun=process.argv.includes('--dry-run');
const repo=path.dirname(source),sourceCommit=execFileSync('git',['-c','safe.directory='+repo.replaceAll('\\','/'),'-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const version=sourceCommit.slice(0,12),root=path.resolve('sites/tactical-animal/dist'),destination=path.join(root,'designer',version);
const entries=['tactics/editor-3d.html','tactics/battle-3d.html','tactics/overmap.html','tactics/sector-library.html'];
const extensions=/\.(?:js|css|html|json|png|webp|jpe?g|svg|gif|glb|gltf|bin|wasm|ogg|wav|mp3|woff2?|ttf|txt)$/i;
const files=new Map(),missing=new Set(),patterns=new Set();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Storage names change; portable map/save formats and folder layouts stay intact.
const storageNames=new Map([
  ['animal-factory-tactics-3d-designs-v1','farmyard-commando-3d-designs-v1'],
  ['animal-factory-tactics-3d-saves-v1','farmyard-commando-designer-playtests-v1'],
  ['animal-factory-campaign-saves-v1','farmyard-commando-designer-campaigns-v1'],
  ['animal-factory-tactics-3d:options:v1','farmyard-commando-designer:options:v1'],
  ['animal-factory-environment-preview-v1','farmyard-commando-environment-preview-v1'],
  ['animal-factory-overmap-sketch-v1','farmyard-commando-overmap-sketch-v1'],
  ['animal-factory-overmap-travel-v1','farmyard-commando-overmap-travel-v1'],
  ['aft-map-library-folder','farmyard-commando-map-library-folder'],
  ['animal-factory-maps','farmyard-commando-maps']
]);
const all=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.isFile())all.push(path.relative(source,full).replaceAll('\\','/'));}}
walk(source);
function resolve(from,value){
  const clean=value.split(/[?#]/)[0];
  if(!clean||/^(?:https?:|data:|blob:|\/|#)/.test(clean))return null;
  const relative=path.posix.normalize(path.posix.join(path.posix.dirname(from),clean));
  if(relative.startsWith('../')||relative==='tactics-3d.html')return null;
  return relative;
}
function candidate(from,value,required=false){
  if(value==='./'||value==='../')return;
  const relative=resolve(from,value);if(!relative)return;
  if(relative.endsWith('.html')&&!entries.includes(relative))return;
  const full=path.join(source,relative);
  if(fs.existsSync(full)&&fs.statSync(full).isFile()){include(relative);return;}
  if(value.endsWith('/')&&relative.replace(/\/$/,'')!==path.posix.dirname(from)){
    const matches=all.filter(file=>file.startsWith(relative.replace(/\/$/,'')+'/')&&extensions.test(file));
    for(const file of matches)include(file);return;
  }
  if(value.includes('${')){
    patterns.add(from+': '+value);
    const pattern=new RegExp('^'+relative.split(/\$\{[^}]+\}/).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^/]+')+'$');
    for(const file of all)if(pattern.test(file))include(file);
  }else if(required)missing.add(from+': '+value);
}
function include(relative){
  if(files.has(relative))return;
  const bytes=fs.readFileSync(path.join(source,relative));files.set(relative,bytes);
  if(!/\.(?:js|css|html|gltf)$/.test(relative))return;
  const text=bytes.toString('utf8');
  if(relative.endsWith('.js'))for(const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g))candidate(relative,m[1],true);
  for(const m of text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g))if(extensions.test(m[1].split(/[?#]/)[0]))candidate(relative,m[1],true);
  for(const m of text.matchAll(/(?:url\(\s*|@import\s*)["']?([^\s"')]+)["']?\s*\)?/g))candidate(relative,m[1]);
  for(const m of text.matchAll(/(['"`])([^'"`\r\n]+?)\1/g)){
    const value=m[2];
    if(extensions.test(value)||/^\.\.?\//.test(value)&&value.includes('${')||value.startsWith('./')&&value.endsWith('/'))candidate(relative,value);
  }
}
for(const entry of entries)include(entry);
// Model filenames are constructed from catalog species names at runtime.
for(const file of all)if(/^tactics\/[^/]+-10k-data\.json$/.test(file))include(file);
// animal-motion-paint.js joins this directory with per-species layer names.
// These paths are constructed at runtime rather than written as full literals.
for(const file of all)if(/^assets\/characters\/lowpoly-proof\/[^/]+-(?:underlay|tail|red-hat)-paint-v1\.png$/.test(file))include(file);
// The bundled preset loader constructs directory and variant paths at runtime.
for(const file of all)if(file.startsWith('tactics/sector-library/')&&extensions.test(file))include(file);
for(const file of all)if(file.startsWith('tactics/vendor/')&&/(?:license|notice)(?:\.[^/]*)?$/i.test(file))include(file);
const summary={sourceCommit,files:files.size,bytes:[...files.values()].reduce((sum,bytes)=>sum+bytes.length,0),missing:[...missing],patterns:[...patterns]};
if(dryRun){console.log(JSON.stringify(summary,null,2));process.exit(0);}
if(missing.size)throw Error('Unresolved designer dependencies: '+[...missing].join(', '));
const manifest=[];
for(const [relative,bytes] of [...files].sort(([a],[b])=>a.localeCompare(b))){
  let output=bytes;
  if(/\.(?:html|js)$/.test(relative)){
    let text=bytes.toString('utf8').replaceAll('../tactics-3d.html','../../../index.html');
    if(relative.endsWith('.js'))for(const [original,local] of storageNames)text=text.replaceAll(original,local);
    output=Buffer.from(text);
  }
  if(relative==='tactics/editor-3d.html')output=Buffer.from(output.toString('utf8').replace('3D map editor · Animal Factory','Map Designer · Farmyard Commando').replace('>Animal Factory</a>','>Farmyard Commando</a>').replace(/<a href="editor\.html"[^>]*>.*?<\/a>/,''));
  const target=path.join(destination,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,output);
  manifest.push({path:relative,sha256:hash(output),sourceSha256:hash(bytes),bytes:output.length});
}
const entry='designer/'+version+'/tactics/editor-3d.html';
fs.writeFileSync(path.resolve('sites/tactical-animal/designer-provenance.json'),JSON.stringify({source:'AnimalFactory3D/game/dist',sourceCommit,entry,snapshotAt:new Date().toISOString(),adaptations:['Farmyard title navigation','Designer page title','Separate browser storage namespaces; original portable formats retained','Omit legacy sprite-editor navigation'],files:manifest},null,2)+'\n');
const titlePath=path.join(root,'index.html');
if(fs.existsSync(titlePath))fs.writeFileSync(titlePath,fs.readFileSync(titlePath,'utf8').replace(/href="designer\/[^"\s]+\/tactics\/editor-3d.html"/,`href="${entry}"`));
console.log(JSON.stringify(summary));
