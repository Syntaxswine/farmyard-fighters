// node --test tests/maps/lidar.test.mjs
// Runs without the 448 MB lidar cache: the decoder is checked on one committed
// 3DEP node, the roof rules on synthetic roofs, and the committed outputs for
// consistency with their inputs and with their own recorded validation.
// The full rebuild is `node tools/maps/lidar/build-lidar.mjs --check`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {checkAgainstHeader, decodeLaz, readHeader} from '../../tools/maps/lidar/laz.mjs';
import {classifyRoof, ROOF} from '../../tools/maps/lidar/roofs.mjs';
import {decodePng, encodePng, fillGaps, maskOf} from '../../tools/maps/lidar/raster.mjs';
import {auc, CONTROLS, GATE, kappa, storeysFromWall, validate} from '../../tools/maps/lidar/build-lidar.mjs';
import {nodeBounds} from '../../tools/maps/lidar/fetch-lidar.mjs';
import {featuresPin, isOsm} from '../../tools/maps/house-reference/features-digest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const town = path.join(root, 'maps/mount-dora'), ref = path.join(town, 'reference');
const hash = data => createHash('sha256').update(data).digest('hex');
const json = file => JSON.parse(fs.readFileSync(path.join(town, file), 'utf8'));
const fixture = path.join(root, 'tests/maps/fixtures/lidar-ept-11-1070-1042-1017.laz');
const roofs = json('reference/lidar-roofs.json'), terrain = json('reference/lidar/bare-earth.json'), source = json('reference/lidar/source.json');

const fields = d => hash(Buffer.concat([d.x, d.y, d.z, d.flags, d.cls, d.source, d.gps, d.extraBytes].map(a => Buffer.from(a.buffer, a.byteOffset, a.byteLength))));

test('the LAZ decoder reproduces a committed 3DEP node exactly', () => {
  const buf = fs.readFileSync(fixture), d = decodeLaz(buf);
  const entry = source.nodes.list.find(n => n[0] === '11-1070-1042-1017');
  assert.equal(hash(buf), entry[3], 'fixture is the cached node listed in source.json');
  assert.equal(d.x.length, entry[1]);
  assert.deepEqual(checkAgainstHeader(d, nodeBounds({bounds: [-9147072, 3292754, -55615, -9035034, 3404792, 56423]}, entry[0])), []);
  // Recorded from this decoder after it matched laz-perf 0.0.7 on all 1,724 nodes (90,878,212 points).
  assert.equal(fields(d), FIXTURE_FIELDS_SHA256);
});

test('the header check refuses lost returns and points outside the node', () => {
  const d = decodeLaz(fs.readFileSync(fixture)), cube = nodeBounds({bounds: [-9147072, 3292754, -55615, -9035034, 3404792, 56423]}, '11-1070-1042-1017');
  const flags = Uint8Array.from(d.flags);
  let moved = 0;
  for (let i = 0; i < flags.length && moved < 50; i++) if ((flags[i] & 7) === 1) { flags[i] = (flags[i] & ~7) | 3; moved++; }
  assert.match(checkAgainstHeader({...d, flags}, cube).join(), /returns/);
  // Wrapped late returns may add to a count (see laz.mjs), but only by a little.
  const extra = Uint8Array.from(d.flags);
  for (let i = 0; i < extra.length; i++) if ((extra[i] & 7) === 0 || (extra[i] & 7) > 5) extra[i] = (extra[i] & ~7) | 1;
  const x = Int32Array.from(d.x), s = d.header.scale[0], o = d.header.offset[0];
  x[0] = Math.round((cube[0] - 5 - o) / s);
  assert.match(checkAgainstHeader({...d, x}, cube).join(), /outside node|axis x/);
  assert.deepEqual(checkAgainstHeader({...d, flags: extra}, cube), []);
});

test('a corrupted LAZ stream is caught', () => {
  const buf = Buffer.from(fs.readFileSync(fixture)), h = readHeader(buf);
  buf[h.pointOffset + 8 + 29 + 200] ^= 0x40; // inside the first chunk's arithmetic-coded data
  let caught = false;
  try { const d = decodeLaz(buf); caught = checkAgainstHeader(d).length > 0 || fields(d) !== FIXTURE_FIELDS_SHA256; } catch { caught = true; }
  assert.ok(caught);
});

let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
// A w×h roof in its own frame (u along w, v along h), turned so that u points
// `turn` degrees clockwise from east; town y runs south.
function synthetic(w, h, f, turn = 0) {
  const t = turn * Math.PI / 180, place = (u, v) => [100 + u * Math.cos(t) - v * Math.sin(t), 200 + u * Math.sin(t) + v * Math.cos(t)];
  const ring = [[0, 0], [w, 0], [w, h], [0, h], [0, 0]].map(([u, v]) => place(u, v)), polygon = [[ring]];
  const p = {x: [], y: [], z: []};
  for (let i = 0; i < Math.round(w * h * 27); i++) {
    const u = rnd() * w, v = rnd() * h, z = f(u, v);
    if (z !== null) { const [x, y] = place(u, v); p.x.push(x); p.y.push(y); p.z.push(z + (rnd() - .5) * .04); }
  }
  const xs = ring.map(q => q[0]), ys = ring.map(q => q[1]);
  return classifyRoof(polygon, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], p, w * h);
}
const t30 = Math.tan(Math.PI / 6);
const bearingOff = (a, b) => Math.min(Math.abs(a - b) % 180, 180 - Math.abs(a - b) % 180);

test('roof rules on synthetic roofs (town y runs south, bearings from north)', () => {
  seed = 7;
  const ew = synthetic(10, 8, (x, y) => 3 + .5 * (4 - Math.abs(y - 4)));
  assert.equal(ew.form, 'gable'); assert.ok(bearingOff(ew.ridge.bearingDeg, 90) < 2); assert.ok(Math.abs(ew.pitchDeg - 26.57) < 1.5);
  const ns = synthetic(8, 12, (x) => 3 + .5 * (4 - Math.abs(x - 4)));
  assert.equal(ns.form, 'gable'); assert.ok(bearingOff(ns.ridge.bearingDeg, 0) < 2);
  const hip = synthetic(12, 8, (x, y) => 3 + t30 * Math.min(x, 12 - x, y, 8 - y));
  assert.equal(hip.form, 'hip'); assert.ok(bearingOff(hip.ridge.bearingDeg, 90) < 2); assert.ok(Math.abs(hip.pitchDeg - 30) < 1.5);
  // Turned 30° clockwise from east, the ridge bears 120°, not 60°.
  const turned = synthetic(10, 8, (x, y) => 3 + .5 * (4 - Math.abs(y - 4)), 30);
  assert.equal(turned.form, 'gable'); assert.ok(bearingOff(turned.ridge.bearingDeg, 120) < 2, `${turned.ridge.bearingDeg}`);
  const steep = synthetic(12, 9, (x, y) => 3 + Math.tan(50 * Math.PI / 180) * Math.min(x, 12 - x, y, 9 - y), -15);
  assert.equal(steep.form, 'hip'); assert.ok(bearingOff(steep.ridge.bearingDeg, 75) < 2); assert.ok(Math.abs(steep.pitchDeg - 50) < 1.5);
  assert.equal(synthetic(15, 10, () => 4).form, 'flat');
  const shed = synthetic(10, 6, (x, y) => 3 + .3 * y);
  assert.equal(shed.form, 'other'); assert.match(shed.basis, /rises/);
  const clutter = synthetic(10, 8, () => 3 + rnd() * 3);
  assert.equal(clutter.form, 'other'); assert.match(clutter.basis, /not explained/);
  const sparse = synthetic(10, 8, (x, y) => (x < 1.5 && y < 1.5 ? 4 : null));
  assert.equal(sparse.form, 'unknown'); assert.equal(sparse.confidence, 0);
  for (const r of [ew, ns, hip]) assert.ok(r.confidence > .9);
});

test('PNG, mask and gap-fill helpers', () => {
  const w = 37, h = 23, a = Uint16Array.from({length: w * h}, (_, i) => (i * 7919) % 65536), b = Uint8Array.from({length: w * h}, (_, i) => i % 3);
  assert.deepEqual(decodePng(encodePng(w, h, 16, a)).samples, a);
  assert.deepEqual(decodePng(encodePng(w, h, 8, b, {Title: 'x'})).samples, b);
  const mask = maskOf([[[[1, 1], [4, 1], [4, 3], [1, 3], [1, 1]]]], 0, 0, 6, 5);
  assert.equal(mask.reduce((s, v) => s + v, 0), 6);
  assert.equal(mask[1 * 6 + 1], 1); assert.equal(mask[0], 0);
  // A plane with a hole: known cells unchanged, the hole filled close to the plane.
  const n = 40, v = Float64Array.from({length: n * n}, (_, i) => 10 + .1 * (i % n) + .05 * Math.floor(i / n));
  const holed = Float64Array.from(v, (x, i) => (Math.abs(i % n - 20) < 6 && Math.abs(Math.floor(i / n) - 20) < 6 ? NaN : x));
  const filled = fillGaps(holed, n, n);
  for (let i = 0; i < v.length; i++) {
    if (!Number.isNaN(holed[i])) assert.equal(filled[i], v[i]);
    else assert.ok(Math.abs(filled[i] - v[i]) < .05, `cell ${i}: ${filled[i]} vs ${v[i]}`);
  }
});

test('statistics: AUC, kappa and the storey rule', () => {
  assert.equal(auc([3, 4, 5], [1, 2]), 1);
  assert.equal(auc([1, 2], [3, 4, 5]), 0);
  assert.equal(auc([1, 2], [1, 2]), .5);
  const k = kappa([[1, 1], [1, 1], [2, 2], [2, 1]], [1, 2]);
  assert.equal(k.agreement, .75); assert.ok(Math.abs(k.kappa - .5) < 1e-12);
  assert.deepEqual([2.9, 4.59, 4.6, 7.79, 7.8, 11.1].map(storeysFromWall), [1, 1, 2, 2, 3, 4]);
});

test('lidar-roofs.json covers every OSM game building and is current with its inputs', () => {
  const all = json('features.json').features.filter(f => f.category === 'building');
  assert.deepEqual(roofs.buildings.map(b => b.id), all.filter(isOsm).map(f => f.id).sort());
  // The rest are the county buildings, measured in county-buildings.json.
  assert.deepEqual(all.filter(f => !isOsm(f)).map(f => f.id).sort(), json('reference/county-buildings.json').buildings.map(b => b.id));
  assert.deepEqual(roofs.inputs.features, featuresPin(fs.readFileSync(path.join(town, 'features.json'))));
  assert.equal(roofs.inputs.lidar.sha256, hash(fs.readFileSync(path.join(ref, 'lidar/source.json'))));
  assert.equal(roofs.inputs.county.sha256, hash(fs.readFileSync(path.join(ref, 'house-reference.json'))));
  const forms = new Set(['flat', 'gable', 'hip', 'other', 'unknown']);
  for (const b of roofs.buildings) {
    assert.ok(forms.has(b.roof.form), b.id);
    assert.ok(b.roof.confidence >= 0 && b.roof.confidence <= 1, b.id);
    assert.ok(b.coverage >= 0 && b.coverage <= 1, b.id);
    if (b.roof.form === 'unknown') assert.equal(b.roof.confidence, 0, b.id);
    if (['gable', 'hip'].includes(b.roof.form)) assert.ok(b.roof.ridgeBearingDeg >= 0 && b.roof.ridgeBearingDeg < 180, b.id);
    else assert.equal(b.roof.ridgeBearingDeg, null, b.id);
    if (b.roofPoints) assert.ok(b.eaveM <= b.ridgeM, b.id);
  }
  assert.deepEqual(Object.values(roofs.metrics.forms).reduce((s, v) => s + v, 0), roofs.buildings.length);
});

test('the recorded validation recomputes, passes its gate, and both shifted controls fail it', () => {
  const county = new Map(json('reference/house-reference.json').buildings.map(b => [b.id, {stories: b.suggested.stories, halfStory: b.suggested.halfStory}]));
  const again = validate(roofs.buildings, county);
  assert.deepEqual(again.gate, roofs.validation.gate);
  assert.equal(roofs.validation.gate.pass, true);
  assert.ok(roofs.validation.gate.coveredShare >= GATE.minCoveredShare && roofs.validation.gate.auc >= GATE.minAuc && roofs.validation.gate.kappa >= GATE.minKappa);
  assert.deepEqual(roofs.validation.controls.map(c => c.id), CONTROLS.map(c => c.id));
  for (const c of roofs.validation.controls) assert.equal(c.gate.pass, false, c.id);
  assert.equal(roofs.validation.controlsFail, true);
});

test('bare-earth grid: dimensions, encoding and recorded hashes', () => {
  const e = decodePng(fs.readFileSync(path.join(ref, 'lidar/bare-earth.png'))), s = decodePng(fs.readFileSync(path.join(ref, 'lidar/bare-earth-source.png')));
  const project = json('project.json');
  for (const png of [e, s]) { assert.equal(png.width, project.extent.widthM); assert.equal(png.height, project.extent.depthM); }
  assert.equal(e.depth, 16); assert.equal(s.depth, 8);
  assert.equal(hash(Buffer.from(e.samples.buffer)), terrain.elevation.samplesSha256);
  assert.equal(hash(Buffer.from(s.samples.buffer)), terrain.source.samplesSha256);
  assert.equal(terrain.grid.columns, project.extent.widthM); assert.equal(terrain.grid.rows, project.extent.depthM);
  const level = Math.round(terrain.stats.lakeLevelM * 100);
  let water = 0;
  for (let i = 0; i < s.samples.length; i++) {
    assert.ok(s.samples[i] <= 2);
    if (s.samples[i] === 2) { water++; assert.ok(Math.abs(e.samples[i] - level) <= 1); }
  }
  assert.ok(water > 0);
  assert.ok(terrain.stats.minM > 10 && terrain.stats.maxM < 80, `${terrain.stats.minM}..${terrain.stats.maxM}`);
});

test('source.json records the coverage query and every cached node', () => {
  assert.deepEqual(source.coverage.collections.map(c => c.collection), ['FL_LAKECO_2007', 'FL_Peninsular_2018_D18']);
  assert.equal(source.tiles.length, 4);
  assert.equal(source.nodes.list.length, source.nodes.count);
  assert.equal(source.nodes.list.reduce((s, n) => s + n[1], 0), source.nodes.points);
  assert.equal(source.nodes.list.reduce((s, n) => s + n[2], 0), source.nodes.bytes);
  assert.equal(new Set(source.nodes.list.map(n => n[0])).size, source.nodes.count);
});

const FIXTURE_FIELDS_SHA256 = '943d78facbd5f7b2a0546ac50332d70e83e73802e3843bfe438d8b89beff612a';
