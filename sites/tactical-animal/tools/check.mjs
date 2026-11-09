import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve('sites/tactical-animal/dist');
const own=["app.js","solo-game.js","missions.js","checkpoint-approaches.js","operation-storage.js","field-view.js","mobile-controls.js","grenade-controls.js","shooting-controls.js","targeting-monitor.js","target-sprites.js","original-art.js","weapon-artwork.js","world-dimensions.js","world-grid.js","render-residency.js","aft-sector.js","aft-checkpoint-data.js","interactions.js","interaction-view.js","mission-scenery.js","mission-art-view.js","guard-alert.js","button-study.js","flame-event.js","flame-mask-view.js","flame-effects.js","flame-pose.js","flame-controls.js","flame-aim-view.js"];
own.push('window-system.js','window-catalogue.js','window-authoring.js','window-editor.js','window-editor-controls.js','window-review-map.js','window-yard.js','window-shatter.js','window-view.js');
execFileSync(process.execPath,[path.resolve('sites/tactical-animal/tools/import-aft-sector.mjs'),'--check'],{stdio:'inherit'});
for(const file of own)execFileSync(process.execPath,['--check',path.join(root,file)]);
const visited=new Set();
function check(file){if(visited.has(file))return;visited.add(file);const source=fs.readFileSync(file,'utf8');for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)){const dependency=path.resolve(path.dirname(file),match[1]);if(!dependency.startsWith(root+path.sep)||!fs.existsSync(dependency))throw Error(`Missing import in ${file}: ${match[1]}`);if(dependency.endsWith('.js'))check(dependency);}}
for(const file of own)check(path.join(root,file));
for(const file of ['index.html','game.html','button-study.html','style.css','touch-controls.css','original-art.css','title-screen.css','industrial-switches.css','field-hardware.css','map-frame.css','icon.svg','assets/ui/industrial-switches/switch-skins-v2.webp','assets/ui/industrial-switches/shooting-switch-skins-v1.webp','assets/ui/industrial-switches/shooting-switches-v1.json','assets/ui/industrial-switches/map-frame-v1.webp','assets/ui/industrial-switches/symbols.svg','assets/ui/industrial-switches/manifest.json','aft/assets/ui/dialogue-terminal/crt-green-v1.webp','aft/assets/ui/dialogue-terminal/field-terminal.webp'])if(!fs.existsSync(path.join(root,file)))throw Error('Missing '+file);
const app=fs.readFileSync(path.join(root,'app.js'),'utf8'),game=fs.readFileSync(path.join(root,'game.html'),'utf8');
const ids=new Set([...game.matchAll(/\bid="([^"]+)"/g),...app.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
for(const match of app.matchAll(/\$\('([^']+)'\)/g))if(!ids.has(match[1]))throw Error('Game markup is missing application control: '+match[1]);
console.log(`${own.length} application modules pass syntax checks; ${visited.size} module imports resolve.`);
const designer=JSON.parse(fs.readFileSync(path.resolve('sites/tactical-animal/designer-provenance.json'),'utf8'));
const designerRoot=path.dirname(path.dirname(path.resolve(root,designer.entry)));
if(!designerRoot.startsWith(path.join(root,'designer')+path.sep))throw Error('Unsafe designer provenance root.');
for(const file of designer.files){
  const target=path.resolve(designerRoot,file.path);
  if(!target.startsWith(designerRoot+path.sep))throw Error('Unsafe designer dependency: '+file.path);
  const bytes=fs.readFileSync(target);
  if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Designer snapshot changed: '+file.path);
  if(target.endsWith('.js'))check(target);
}
for(const entry of ['index.html','game.html','button-study.html','map-designer.html','window-yard.html',designer.entry]){
  const file=path.join(root,entry),html=fs.readFileSync(file,'utf8');
  for(const match of html.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)){
    if(/^(?:https?:|data:|blob:)/.test(match[1]))continue;
    if(!fs.existsSync(path.resolve(path.dirname(file),match[1])))throw Error(`Missing page dependency in ${entry}: ${match[1]}`);
  }
}
console.log(`${designer.files.length} designer files match their recorded hashes; title, game, button study, and designer entry points resolve.`);
