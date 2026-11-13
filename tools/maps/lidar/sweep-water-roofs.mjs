// Where the grid and the registration fall: rebuilds the water roofs (water-roofs.mjs, as
// build-lidar.mjs calls it) at grid phases and registration offsets, and reports what each
// run keeps. A review tool, not part of the build; it needs the lidar cache.
//
//   node --max-old-space-size=12288 tools/maps/lidar/sweep-water-roofs.mjs [--follow x0,y0,x1,y1 ...]
//
// Runs: 100 grid phases (0.05 m steps in x and y), 24 registration offsets (dx and dy each
// -0.2..0.2 m in 0.1 m steps) and 0.3, 0.5 and 0.7 m north. A roof of the first run is
// matched in another run by a roof whose box overlaps its box by half. Each --follow box (town
// metres) is reported kept, left out, or absent per run: kept where a kept piece covers half
// of it. Lake Dora's outline, the drawn outlines (OSM buildings, the county buildings of
// county-buildings.json, the generator's structures) and the lake level are taken as the
// build takes them; on the base grid this reproduces water-roofs.json.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {findWaterRoofs} from './water-roofs.mjs';
import {loadPoints} from './points.mjs';
import {cacheDir, MARGIN_M} from './fetch-lidar.mjs';
import {maskOf} from './raster.mjs';
import {median} from './roofs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'), town = path.join(root, 'maps/mount-dora');
const read = f => JSON.parse(fs.readFileSync(path.join(town, f), 'utf8'));
const follow = process.argv.flatMap((a, i) => a === '--follow' ? [process.argv[i + 1].split(',').map(Number)] : []);
const project = read('project.json'), source = read('reference/lidar/source.json'), fj = read('features.json'), features = fj.features;
const reg = read('reference/lidar-roofs.json').registration, county = read('reference/county-buildings.json'), doc = read('reference/lidar/water-roofs.json');
const files = source.nodes.list.map(([key]) => path.join(cacheDir, 'ept-data', `${key}.laz`));
const W = project.extent.widthM, D = project.extent.depthM, box = [-MARGIN_M, -MARGIN_M, W + MARGIN_M, D + MARGIN_M];
const index = await loadPoints(files, project.projection, box, [0, 0, W, D]);
const lake = features.find(f => f.category === 'water' && f.tags.name === 'Lake Dora').geometry.coordinates;
const {cols, rows, start} = index, inLake = maskOf(lake, box[0], box[1], cols, rows), wz = [];
for (let c = 0; c < cols * rows; c++) if (inLake[c]) for (let k = start[c]; k < start[c + 1]; k++) if (index.cls[k] === 9) wz.push(index.z[k]);
const level = median(wz);
const houses = features.filter(f => f.category === 'building' && f.osm).sort((a, b) => a.id.localeCompare(b.id));
const drawn = [...houses.map(f => f.geographicGeometry.coordinates), ...county.buildings.map(b => b.geometry.coordinates),
  ...(fj.authoredStructures ?? []).map(st => (st.geographicGeometry ?? st.geometry).coordinates)];
const ext = o => { const xs = o.map(p => p[0]), ys = o.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const boxOf = r => { const e = r.pieces.map(p => ext(p.outline)); return [Math.min(...e.map(b => b[0])), Math.min(...e.map(b => b[1])), Math.max(...e.map(b => b[2])), Math.max(...e.map(b => b[3]))]; };
const area = b => (b[2] - b[0]) * (b[3] - b[1]), overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const runs = [];
for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) runs.push({name: `grid ${(i * .05).toFixed(2)},${(j * .05).toFixed(2)}`, ox: i * .05, oy: j * .05, rdx: 0, rdy: 0});
for (const rdx of [-.2, -.1, 0, .1, .2]) for (const rdy of [-.2, -.1, 0, .1, .2]) if (rdx || rdy) runs.push({name: `registration ${rdx},${rdy}`, ox: 0, oy: 0, rdx, rdy});
for (const rdy of [.3, .5, .7]) runs.push({name: `registration 0,${rdy}`, ox: 0, oy: 0, rdx: 0, rdy});
let base = null;
const missing = new Map(), extra = [], stats = [], fates = follow.map(() => ({kept: [], out: [], absent: []}));
for (const run of runs) {
  const res = findWaterRoofs(index, {lake, drawn, reg: {dx: reg.dx + run.rdx, dy: reg.dy + run.rdy}, level, extent: [run.ox, run.oy, W + run.ox, D + run.oy]});
  const boxes = res.roofs.map(boxOf), pieces = res.roofs.flatMap(r => r.pieces);
  if (!base) {
    base = boxes;
    const same = res.roofs.length === doc.metrics.roofs && pieces.length === doc.metrics.pieces && Math.abs(pieces.reduce((s, p) => s + p.areaM2, 0) - doc.metrics.piecesAreaM2) < .1;
    console.log(same ? 'The base run reproduces water-roofs.json.' : 'WARNING: the base run differs from water-roofs.json; is it current?');
  }
  for (const [k, b] of base.entries()) if (!boxes.some(q => overlap(b, q) > .5 * Math.min(area(b), area(q)))) missing.set(k, [...(missing.get(k) || []), run.name]);
  if (boxes.some(q => !base.some(b => overlap(b, q) > 0))) extra.push(run.name);
  stats.push({roofs: res.roofs.length, pieces: pieces.length, areaM2: pieces.reduce((s, p) => s + p.areaM2, 0)});
  for (const [k, f] of follow.entries()) {
    const covers = q => overlap(f, q) > .5 * area(f);
    fates[k][pieces.some(p => covers(ext(p.outline))) ? 'kept' : res.leftOut.some(p => covers(ext(p.outline))) ? 'out' : 'absent'].push(run.name);
  }
}
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {})).map(([v, n]) => `${v} (${n})`).join(', ');
console.log(`${runs.length} runs. Roofs per run: ${tally(stats.map(s => s.roofs))}. Pieces per run: ${tally(stats.map(s => s.pieces))}.`);
console.log(`Pieces' area: ${Math.min(...stats.map(s => s.areaM2)).toFixed(1)}-${Math.max(...stats.map(s => s.areaM2)).toFixed(1)} m².`);
console.log(missing.size ? `Base roofs missing in some run: ${JSON.stringify([...missing].map(([k, r]) => ({roof: base[k].map(v => +v.toFixed(1)), runs: r})))}` : 'Every base roof is found in every run.');
console.log(extra.length ? `Runs with a roof the base run lacks: ${extra.join('; ')}` : 'No run has a roof the base run lacks.');
for (const [k, f] of follow.entries()) console.log(`Box ${f.join(',')}: kept ${fates[k].kept.length}, left out ${fates[k].out.length} (${fates[k].out.join('; ') || '-'}), absent ${fates[k].absent.length} (${fates[k].absent.join('; ') || '-'}).`);
