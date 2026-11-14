import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Sites accepts conventional static output roots. Keep the authored prototype
// in its project folder and copy its exact files to an owned deployment output.
const workspace=fs.realpathSync(process.cwd());
const source=path.resolve(workspace,'sites/tactical-animal/dist');
const destination=path.resolve(workspace,'dist');
const marker='.tactical-animal-generated';
if(path.dirname(destination)!==workspace||destination===source)throw Error('Unsafe build destination.');
if(fs.existsSync(destination)){
  if(fs.lstatSync(destination).isSymbolicLink()||!fs.existsSync(path.join(destination,marker)))throw Error('Existing dist is not a verified Tactical Animal build output.');
  fs.rmSync(destination,{recursive:true});
}
fs.cpSync(source,destination,{recursive:true,dereference:false});
// Version application modules together so returning players receive updated
// rules immediately and every importer shares the same simulation instance.
const modules=fs.readdirSync(source).filter(file=>file.endsWith('.js'));
// Mission art changes independently of the frozen AFT snapshots. Include its
// nested modules in the same release so old kit/manifest pairs cannot be mixed
// with a newly registered collision table on returning browsers.
function ownedFiles(directory,prefix=''){
  if(!fs.existsSync(directory))return [];
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const name=prefix+entry.name;
    return entry.isDirectory()?ownedFiles(path.join(directory,entry.name),name+'/'):[name];
  });
}
const missionFiles=[...ownedFiles(path.join(source,'mission-art'),'mission-art/'),...ownedFiles(path.join(source,'art/windows'),'art/windows/')];
modules.push(...missionFiles.filter(file=>file.endsWith('.js')));modules.sort();
const moduleSet=new Set(modules);
const moduleHash=createHash('sha256');
for(const file of modules)moduleHash.update(file).update(fs.readFileSync(path.join(source,file)));
const moduleVersion=moduleHash.digest('hex').slice(0,12);
function versionImports(code,file){
  return code.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.\.?\/[^'"]+\.js)\2/g,(match,prefix,quote,specifier)=>moduleSet.has(path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier)))?`${prefix}${quote}${specifier}?v=${moduleVersion}${quote}`:match);
}
for(const file of modules){
  const target=path.join(destination,file);
  const code=versionImports(fs.readFileSync(target,'utf8'),file);
  fs.writeFileSync(target,code);
}
// Give changed styles and the game icon fresh URLs on static hosts.
for(const file of [...fs.readdirSync(source).filter(file=>file.endsWith('.html')),...missionFiles.filter(file=>file.endsWith('.html'))]){
  const entry=path.join(destination,file);
  let html=versionImports(fs.readFileSync(entry,'utf8'),file).replace('src="app.js"',`src="app.js?v=${moduleVersion}"`);
  html=html.replace(/\bsrc="([^"?#]+\.js)"/g,(match,specifier)=>moduleSet.has(path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier)))?`src="${specifier}?v=${moduleVersion}"`:match);
  for(const asset of ['style.css','touch-controls.css','original-art.css','title-screen.css','map-frame.css','industrial-switches.css','field-hardware.css','realtime.css','game-start.css','overmap.css','icon.svg']){
    if(!html.includes(`href="${asset}"`))continue;
    const version=createHash('sha256').update(fs.readFileSync(path.join(destination,asset))).digest('hex').slice(0,12);
    html=html.replace(`href="${asset}"`,`href="${asset}?v=${version}"`);
  }
  // SVG symbol sheets can gain controls while keeping their filename. Version
  // before the fragment so returning phones receive the new button symbols.
  html=html.replace(/\bhref="(assets\/[^"#?]+)(#[^"]*)?"/g,(match,asset,fragment='')=>{
    const version=createHash('sha256').update(fs.readFileSync(path.join(destination,asset))).digest('hex').slice(0,12);
    return `href="${asset}?v=${version}${fragment}"`;
  });
  fs.writeFileSync(entry,html);
}
// Publish the geographic authoring atlas separately from playable operations.
// The static atlas downloads native documents; only an explicitly matching
// local review host supplies the existing Nautilus workshop bridge.
const townSource=path.join(workspace,'maps/mount-dora');
const townDestination=path.join(destination,'maps/mount-dora');
if(fs.existsSync(path.join(townSource,'project.json'))){
  if(JSON.parse(fs.readFileSync(path.join(townSource,'workshop/host.json'),'utf8')).kind!=='mount-dora-static-atlas-v1')throw Error('Publish only the static atlas host configuration.');
  for(const file of ['project.json','features.json','authored-buildings.json','atlas.svg','source','sectors','interiors',
    'workshop/index.html','workshop/atlas.css','workshop/atlas.js',
    'workshop/model.js','workshop/audit.json','workshop/host.json']){
    const target=path.join(townDestination,file);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.cpSync(path.join(townSource,file),target,{recursive:true,dereference:false});
  }
}
fs.writeFileSync(path.join(destination,marker),'Generated by sites/tactical-animal/tools/build.mjs\n');
console.log('Prepared the verified static prototype in dist/.');
