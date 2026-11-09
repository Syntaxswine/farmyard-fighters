// node --test tests/maps/art-evidence.test.mjs
// The generated art placements follow the recorded building evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const features = new Map(JSON.parse(fs.readFileSync(path.join(root, 'maps/mount-dora/features.json'), 'utf8')).features.map(f => [f.id, f]));
const {PLACEMENTS} = await import(pathToFileURL(path.join(root, 'sites/tactical-animal/dist/mission-art/mount-dora/placements.js')).href);
const buildings = PLACEMENTS.filter(p => p.kind === 'building');
const curated = new Set(['osm-way-547799531', 'osm-way-556809468', 'osm-way-557494933', 'osm-way-558337885', ...Array.from({length: 10}, (_, i) => 'osm-way-' + (560095890 + i))]);
const ordinary = buildings.filter(p => !curated.has(p.id));

test('roof form, pitch and ridge axis come from confident lidar', () => {
  let checked = 0;
  for (const p of ordinary) {
    const {lidar, survey} = features.get(p.id).nativeProxy.evidence || {};
    // A survey answer outranks lidar; this test covers the lidar path.
    if (survey?.roofShape || !lidar || !['gable', 'hip', 'flat'].includes(lidar.roofForm) || lidar.roofConfidence < .7) continue;
    checked++;
    assert.equal(p.treatment.roofStyle, lidar.roofForm, p.id);
    if (lidar.roofForm === 'flat') { assert.equal(p.treatment.pitch, 0, p.id); continue; }
    assert.equal(p.treatment.pitch, Math.max(12, Math.min(40, Math.round(lidar.pitchDeg))), p.id);
    const b = (lidar.ridgeBearingDeg % 180 + 180) % 180;
    assert.equal(p.treatment.roofAxis, b >= 45 && b < 135 ? 'x' : 'y', p.id);
  }
  assert.ok(checked > 600, `${checked} lidar-driven roofs`);
});

test('wall class and roof cover follow the county record', () => {
  let walls = 0, metal = 0;
  for (const p of ordinary) {
    const np = features.get(p.id).nativeProxy;
    if (!np.materialSource.startsWith('unsurveyed')) {
      walls++;
      const expected = np.material === 'wood' ? /-siding$/ : np.material === 'brick' ? /^brick$/ : /^plaster$/;
      assert.match(p.treatment.wall, expected, p.id);
      assert.equal(p.provenance.evidence.wall, np.materialSource, p.id);
    }
    if (np.evidence?.county?.roofCover === 'metal') {
      metal++;
      assert.deepEqual([p.treatment.roof, p.treatment.roofFinish], ['blue-metal', 'silver'], p.id);
    }
  }
  assert.ok(walls > 700 && metal > 150, `${walls} walls, ${metal} metal roofs`);
});

test('storeys come from the generator, and curated landmarks keep their treatments', () => {
  for (const p of ordinary) assert.equal(p.treatment.stories, features.get(p.id).nativeProxy.stories, p.id);
  for (const p of buildings.filter(p => curated.has(p.id))) assert.equal(p.provenance.evidence, undefined, p.id);
  assert.equal(buildings.find(p => p.id === 'osm-way-547799531').treatment.type, 'donnelly-house');
  assert.ok(ordinary.every(p => p.provenance.evidence?.colour === 'seeded placeholder until surveyed'));
});
