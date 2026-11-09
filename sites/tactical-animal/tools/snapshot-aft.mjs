import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

// A deliberate, read-only snapshot of the original game. Never modify its checkout.
const source = process.argv[2];
if (!source) throw Error('Pass the Animal Factory Tactics 3D dist directory.');
const destination = path.resolve('sites/tactical-animal/dist');
const manifestPath=path.resolve('sites/tactical-animal/aft-provenance.json');
const previous=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')).files:[];
const files = new Map();
function copy(relative) {
  relative = path.posix.normalize(relative);
  if (files.has(relative)) return;
  const input = path.join(source, relative);
  const bytes = fs.readFileSync(input);
  files.set(relative, {path: relative, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length});
  const output = path.join(destination, 'aft', relative);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, bytes);
  if (!relative.endsWith('.js')) return;
  const text = bytes.toString('utf8');
  const imports = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g;
  for (const match of text.matchAll(imports)) copy(path.posix.join(path.posix.dirname(relative), match[1]));
  for (const match of text.matchAll(/new URL\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url/g)) {
    copy(path.posix.join(path.posix.dirname(relative), match[1]));
  }
}
for (const entry of ['core/perception.js','aim-levels.js','quickplay-presets.js', 'character-stats.js', 'animal-motion-catalog.js', 'animal-motion-paint.js', 'weapon-models.js', 'worker-locomotion.js', 'battle-posture.js']) copy('tactics/' + entry);
// Keep the parent game's complete visual library available to this mobile game.
// Only modules actually imported by the mobile renderer enter its runtime graph.
const visualEntries = [
  'weapon-icons.js', 'battle-control-icons.js', 'hybrid-materials.js',
  'hybrid-room-art.js', 'environment-models.js', 'environment-geometry.js',
  'environment-paint.js', 'environment-visuals.js', 'prop-art.js',
  'painted-environment-scene.js', 'painted-cargo.js', 'painted-furniture.js',
  'painted-chairs.js', 'painted-conveyor.js', 'painted-grass.js', 'painted-sand.js',
  'painted-hedges.js', 'foliage-materials.js', 'foliage-models.js',
  'biome-scene.js', 'scenery-scene.js', 'strategic-site-scene.js',
  'cliff-map-scene.js', 'lighting-scene.js', 'battle-environment.js',
  'factory-machine-library.js', 'factory-machine-model.js', 'factory-machine-paint.js',
  'canvas-truck.js', 'canvas-truck-paint.js', 'utility-helicopter.js',
  'daylight-rig.js', 'isometric-camera.js', 'painted-blast-effects.js',
  'battle-flame-effects.js', 'battle-shot-effects.js', 'rpg-flight-effects.js',
  'painted-blood-spray.js', 'painted-blood-stain.js', 'red-hat-model.js',
  'animal-prone-motion.js', 'idle-motion.js', 'armed-idle-motion.js', 'rifle-firing.js',
];
for (const entry of visualEntries) copy('tactics/' + entry);
for (const entry of fs.readdirSync(path.join(source, 'tactics')).sort()) {
  if (entry.endsWith('-10k-data.json') || entry.endsWith('.css')) copy('tactics/' + entry);
}
function copyVisualAssets(relative) {
  for (const entry of fs.readdirSync(path.join(source, relative), {withFileTypes: true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    // Source-control rules are not artwork and must not override this snapshot's
    // byte-preserving Git attributes on another machine.
    if (entry.name.startsWith('.git')) continue;
    const file = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) { if (file !== 'assets/audio') copyVisualAssets(file); }
    else copy(file);
  }
}
copyVisualAssets('assets');
copy('tactics/vendor/THREE-LICENSE.txt');
// Preserve the original numeric catalogs without importing the original grid
// simulation into the new continuous simulation's runtime dependency graph.
const engine=fs.readFileSync(path.join(source,'tactics/core/engine.js'),'utf8');
const weaponStart=engine.indexOf('export const WEAPONS='),weaponEnd=engine.indexOf('\n};',weaponStart)+3;
const zones=engine.match(/^export const AIM_ZONES=.*;$/m)?.[0];
if(weaponStart<0||weaponEnd<weaponStart||!zones)throw Error('Original weapon catalog changed; review before importing.');
const catalog=engine.slice(weaponStart,weaponEnd)+'\n'+zones+'\n';
const catalogPath='tactics/solo-weapon-data.js';
fs.mkdirSync(path.join(destination,'aft/tactics'),{recursive:true});
fs.writeFileSync(path.join(destination,'aft',catalogPath),catalog);
files.set(catalogPath,{path:catalogPath,sha256:createHash('sha256').update(catalog).digest('hex'),bytes:Buffer.byteLength(catalog),source:'tactics/core/engine.js: WEAPONS and AIM_ZONES'});
for (const species of ['horse', 'goat', 'donkey', 'sheep', 'cow', 'skunk', 'pig-foreman']) {
  copy(`tactics/${species}-10k-data.json`);
  copy(`assets/characters/armed/${species}-rifle.png`);
}
const paints = [
  'horse-worker-model-paint-v1.png', 'goat-worker-model-paint-v1.png',
  'donkey-worker-model-paint-v1.png', 'sheep-worker-model-paint-v1.png', 'sheep-underlay-paint-v1.png',
  'cow-worker-model-paint-v1.png', 'cow-neck-paint-v1.png',
  'skunk-worker-model-paint-v1.png', 'skunk-tail-paint-v1.png',
  'pig-foreman-worker-model-paint-v1.png'
];
// Resolve the exact paint names from the source instead of manufacturing assets.
for (const relative of [...files.keys()].filter(p => p.endsWith('.js'))) {
  if(relative===catalogPath)continue;
  const text = fs.readFileSync(path.join(source, relative), 'utf8');
  for (const match of text.matchAll(/['"](\.\.\/assets\/[^'"]+\.(?:png|webp|jpg))['"]/g)) {
    const target = path.posix.join(path.posix.dirname(relative), match[1]);
    if (fs.existsSync(path.join(source, target))) copy(target);
  }
}
for (const name of paints) {
  const relative = 'assets/characters/lowpoly-proof/' + name;
  if (fs.existsSync(path.join(source, relative))) copy(relative);
}
let sourceCommit = null;
try { const repo = path.dirname(source); sourceCommit = execFileSync('git', ['-c', 'safe.directory=' + repo.replaceAll('\\', '/'), '-C', repo, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(); } catch {}
for(const old of previous){if(files.has(old.path))continue;const target=path.resolve(destination,'aft',old.path),base=path.resolve(destination,'aft')+path.sep;if(!target.startsWith(base))throw Error('Unsafe obsolete snapshot path.');if(fs.existsSync(target)){const hash=createHash('sha256').update(fs.readFileSync(target)).digest('hex');if(hash!==old.sha256)throw Error('Locally edited snapshot file: '+old.path);fs.unlinkSync(target);}}
const assetGroups = {};
for (const file of files.values()) if (file.path.startsWith('assets/')) {
  const group = file.path.split('/')[1];
  assetGroups[group] ??= {files: 0, bytes: 0};
  assetGroups[group].files++; assetGroups[group].bytes += file.bytes;
}
fs.writeFileSync(manifestPath, JSON.stringify({source: 'AnimalFactory3D/game/dist', sourceCommit, snapshotAt: new Date().toISOString(), visualEntryPoints: visualEntries, assetGroups, files: [...files.values()]}, null, 2) + '\n');
console.log(JSON.stringify({files: files.size, bytes: [...files.values()].reduce((sum, p) => sum + p.bytes, 0), sourceCommit}));
