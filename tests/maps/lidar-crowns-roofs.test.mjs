// Tree crowns from the 2018 lidar: the rules on made-up canopies, then the committed
// crowns.json against its inputs and its own rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {findCrowns, CROWNS} from '../../tools/maps/lidar/crowns.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const town = path.join(root, 'maps/mount-dora');
const hash = data => createHash('sha256').update(data).digest('hex');
const json = file => JSON.parse(fs.readFileSync(path.join(town, file), 'utf8'));

// A canopy of 0.5 m cells from (0, 0): heights from f at each cell's centre, building
// cells where `building` says so.
function canopy(cols, rows, f, building = () => false) {
  const heights = new Float32Array(cols * rows), b = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = (i + .5) * .5, y = (j + .5) * .5;
    heights[j * cols + i] = f(x, y); b[j * cols + i] = building(x, y) ? 1 : 0;
  }
  return {heights, building: b, cols, rows, cellM: .5, origin: [0, 0]};
}
const cone = (cx, cy, h, r) => (x, y) => Math.max(0, h * (1 - Math.hypot(x - cx, y - cy) / r));
const highest = (...fs) => (x, y) => Math.max(...fs.map(f => f(x, y)));

test('crowns: separate trees, a bumpy crown merged, a deep saddle kept', () => {
  const two = findCrowns(canopy(80, 40, highest(cone(10.25, 10.25, 12, 5), cone(30.25, 10.25, 8, 4))));
  assert.equal(two.length, 2);
  assert.deepEqual(two.map(c => c.top), [[10.25, 10.25], [30.25, 10.25]]);
  // The cells 2.5 m or more up: a disc of radius r(1 - 2.5/h).
  for (const [c, h, r] of [[two[0], 12, 5], [two[1], 8, 4]]) {
    const disc = Math.PI * (r * (1 - CROWNS.tallM / h)) ** 2;
    assert.ok(Math.abs(c.areaM2 - disc) / disc < .1, `${c.areaM2} vs ${disc}`);
    assert.ok(c.heightM <= h && c.heightM > h - 1);
    assert.ok(Math.abs(c.widthM - 2 * r * (1 - CROWNS.tallM / h)) < .6, `${c.widthM}`);
  }
  // A second top 2.5 m along, its saddle about 1.3 m under it: one bumpy crown.
  assert.equal(findCrowns(canopy(80, 40, highest(cone(10.25, 10.25, 12, 8), cone(12.75, 10.25, 11, 8)))).length, 1);
  // Six metres apart, the lower top stands about 6 m over the saddle: two trees.
  const pair = findCrowns(canopy(80, 40, highest(cone(10.25, 10.25, 12, 5), cone(16.25, 10.25, 11, 5))));
  assert.equal(pair.length, 2);
  assert.ok(pair.every(c => c.areaM2 < 50));
  // Prominence is the LOWER top's height over the saddle: two domed mesas, 14 m and 11 m,
  // on a 10 m ridge are one crown (the lower stands 1 m over it, the higher 4 m); on an
  // 8 m ridge, two.
  const mesa = (cx, h) => (x, y) => { const d = Math.hypot(x - cx, y - 10); return d < 3 ? h - .05 * d : 0; };
  const ridge = h => (x, y) => (Math.abs(y - 10) < 1 && x > 8 && x < 20 ? h : 0);
  assert.equal(findCrowns(canopy(60, 40, highest(mesa(8, 14), mesa(20, 11), ridge(10)))).length, 1);
  assert.equal(findCrowns(canopy(60, 40, highest(mesa(8, 14), mesa(20, 11), ridge(8)))).length, 2);
});

test('crowns: never merged past the area cap; wires, scraps and roofs are no trees', () => {
  // A 30 m rippled canopy whose ripples merge freely: the cap splits it.
  const field = findCrowns(canopy(60, 60, (x, y) => 10 + .5 * Math.sin(x) * Math.sin(y)));
  assert.ok(field.length >= 3, `${field.length}`);
  assert.ok(field.every(c => c.areaM2 <= CROWNS.maxAreaM2));
  assert.ok(Math.abs(field.reduce((s, c) => s + c.areaM2, 0) - 900) < 1e-6);
  // A wire half a metre wide and 30 m long; a 3 m2 scrap of canopy.
  const wire = canopy(80, 40, (x, y) => (Math.abs(y - 10.25) < .25 && x > 5 && x < 35 ? 7 : 0));
  assert.deepEqual(findCrowns(wire), []);
  const scrap = canopy(80, 40, (x, y) => (x > 10 && x < 11.5 && y > 10 && y < 12 ? 7 : 0));
  assert.deepEqual(findCrowns(scrap), []);
  // A tree standing on building cells is not one.
  assert.deepEqual(findCrowns(canopy(80, 40, cone(10.25, 10.25, 12, 5), () => true)), []);
});

test('crowns: a top on a cell outside the canopy still holds its crown', () => {
  // The apex cell holds a building return: it is no canopy, but the canopy climbs to it.
  const apex = [10.25, 10.25], grid = canopy(80, 40, cone(...apex, 12, 5), (x, y) => x === apex[0] && y === apex[1]);
  const crowns = findCrowns(grid);
  assert.equal(crowns.length, 1);
  assert.deepEqual(crowns[0].top, apex);
  const canopyCells = grid.heights.filter((h, i) => h >= CROWNS.tallM && !grid.building[i]).length;
  assert.equal(crowns[0].areaM2, canopyCells * .25);
  assert.ok(crowns[0].heightM < 12, 'the apex height itself is the building cell\'s');
  assert.deepEqual(findCrowns(grid), crowns, 'deterministic');
});

test('crowns.json is current with its inputs and keeps its own rules', () => {
  const doc = json('reference/lidar/crowns.json');
  assert.equal(doc.kind, 'mount-dora-lidar-crowns');
  assert.equal(doc.inputs.sha256, hash(fs.readFileSync(path.join(town, 'reference/lidar/source.json'))));
  assert.deepEqual(doc.method.rules, CROWNS);
  assert.deepEqual(doc.columns, ['topX', 'topY', 'centreX', 'centreY', 'areaM2', 'heightM', 'widthM']);
  assert.equal(doc.crowns.length, doc.metrics.crowns);
  const {widthM, depthM} = json('project.json').extent;
  for (const [tx, ty, cx, cy, area, height, width] of doc.crowns) {
    for (const [x, y] of [[tx, ty], [cx, cy]]) assert.ok(x > -2 && y > -2 && x < widthM + 2 && y < depthM + 2);
    assert.ok(area >= CROWNS.minAreaM2 && width >= CROWNS.minWidthM && height >= CROWNS.tallM);
  }
  assert.ok(Math.abs(doc.crowns.reduce((s, c) => s + c[4], 0) / 1e4 - doc.metrics.canopyAreaHa) < .01);
  // The generator's pin of it.
  const record = json('project.json').generation.vegetation.lidarCrowns;
  assert.equal(record.sha256, hash(fs.readFileSync(path.join(town, 'reference/lidar/crowns.json'))));
  assert.equal(record.crowns, doc.crowns.length);
});
