// Tree crowns and roofs over the water from the 2018 lidar: the rules on made-up
// canopies and point clouds, then the committed crowns.json and water-roofs.json
// against their inputs and their own rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {findCrowns, CROWNS} from '../../tools/maps/lidar/crowns.mjs';
import {closeMask, findWaterRoofs, largestRectangle, minAreaRectangle, outlinePart, rectangleAround, WATER_ROOFS} from '../../tools/maps/lidar/water-roofs.mjs';
import {featuresPin} from '../../tools/maps/house-reference/features-digest.mjs';

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

const grid = text => { const r = text.trim().split('\n').map(s => s.trim()); return {mask: Uint8Array.from(r.join('').split(''), c => c === '#' ? 1 : 0), cols: r[0].length, rows: r.length}; };

test('rectangles: smallest around points, largest of set cells, the closing, the fit to returns', () => {
  const t = Math.PI / 6, turn = ([u, v]) => [u * Math.cos(t) - v * Math.sin(t), u * Math.sin(t) + v * Math.cos(t)];
  const pts = [];
  for (let u = 0; u <= 16; u += .5) for (let v = 0; v <= 6; v += .5) pts.push(turn([u, v]));
  const rect = minAreaRectangle(pts);
  assert.ok(Math.abs(rect.area - 96) < 1e-6);
  assert.ok(Math.abs(((rect.angleDeg % 90) + 90) % 90 - 30) < 1e-6);
  const around = rectangleAround(rect.corners, pts), side = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  assert.ok(Math.abs(side(around[0], around[1]) * side(around[0], around[3]) - 96) < 1e-6);
  const l = grid(`
    ......
    .####.
    .####.
    .##...
    ......`);
  assert.deepEqual(largestRectangle(l.mask, l.cols, l.rows), {i0: 1, j0: 1, i1: 5, j1: 3, area: 8});
  assert.deepEqual(largestRectangle(l.mask, l.cols, l.rows, 2), {i0: 1, j0: 1, i1: 5, j1: 3, area: 8});
  assert.equal(largestRectangle(l.mask, l.cols, l.rows, 3), null);
  const holed = grid(`
    .......
    .#####.
    .##.##.
    .#####.
    .......`);
  assert.equal([...closeMask(holed.mask, holed.cols, holed.rows)].join(''), '00000000111110011111001111100000000');
});

test('a part is one rectangle unless that would roof open water: a comb splits into its rows', () => {
  const C = .5, cols = 40, comb = [];
  for (let j = 0; j < 3; j++) for (let i = 2; i < 22; i++) comb.push(j * cols + i);
  // A middle row with one cell that returned nothing: the closing fills it.
  for (const f of [2, 10, 18]) for (let j = 3; j < 15; j++) for (let i = f; i < f + 4; i++) if (!(f === 10 && j === 8 && i === 11)) comb.push(j * cols + i);
  const o = outlinePart(comb, {x0: 0, y0: 0, cols, C});
  const round = q => q.map(p => p.map(v => +v.toFixed(6) + 0));
  assert.deepEqual(o.pieces.map(p => round(p.corners)), [
    [[1, 0], [11, 0], [11, 1.5], [1, 1.5]], [[1, 1.5], [3, 1.5], [3, 7.5], [1, 7.5]],
    [[5, 1.5], [7, 1.5], [7, 7.5], [5, 7.5]], [[9, 1.5], [11, 1.5], [11, 7.5], [9, 7.5]]]);
  assert.equal(o.covered, comb.length); assert.equal(o.total, comb.length);
  assert.deepEqual(o.pieces.map(p => p.filled), [60, 48, 47, 48]);
  // A 4 m body with a 25 m walkway a cell wide running off at 45 degrees: the smallest
  // rectangle turns with the walkway, the piece keeps the body's own frame.
  const tailed = [];
  for (let j = 10; j < 18; j++) for (let i = 10; i < 18; i++) tailed.push(j * 100 + i);
  for (let k = 0; k < 50; k++) tailed.push((18 + k) * 100 + 18 + k);
  const turns = minAreaRectangle(tailed.flatMap(c => { const i = c % 100, j = (c - i) / 100; return [[i * C, j * C], [(i + 1) * C, (j + 1) * C], [(i + 1) * C, j * C], [i * C, (j + 1) * C]]; }));
  assert.ok(Math.abs(((turns.angleDeg % 90) + 90) % 90 - 45) < 10, `${turns.angleDeg}`);
  const body = outlinePart(tailed, {x0: 0, y0: 0, cols: 100, C});
  assert.deepEqual(body.pieces.map(p => round(p.corners)), [[[5, 5], [9, 5], [9, 9], [5, 9]]]);
  // A 16 x 6 m roof turned 30 degrees: its staircase on the grid is not open water.
  const turned = [];
  for (let j = 0; j < 60; j++) for (let i = 0; i < 60; i++) {
    const x = (i + .5) * C - 15, y = (j + .5) * C - 15, a = Math.PI / 6;
    if (Math.abs(x * Math.cos(a) + y * Math.sin(a)) < 8 && Math.abs(-x * Math.sin(a) + y * Math.cos(a)) < 3) turned.push(j * 60 + i);
  }
  const whole = outlinePart(turned, {x0: 0, y0: 0, cols: 60, C});
  assert.equal(whole.pieces.length, 1);
  const [a, b, , d] = whole.pieces[0].corners;
  assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(d[0] - a[0], d[1] - a[1]) >= 96, 'the whole 16 x 6 m roof, not a rectangle inside its staircase');
  // A walkway a cell (0.5 m) wide running 14 m off the comb's walkway is no piece.
  const tail = Array.from({length: 28}, (_, k) => cols + 22 + k);
  const tailedComb = outlinePart(comb.concat(tail), {x0: 0, y0: 0, cols, C});
  assert.deepEqual(tailedComb.pieces.map(p => round(p.corners)), o.pieces.map(p => round(p.corners)));
});

// A made-up shore: Lake Dora's outline is x < 100 (0 <= y < 100); returns on a 0.25 m
// lattice: roofs (class 6), ground (2) on land, water (9) on the lake, and none on a calm
// bay east of the outline (x 100-118, y 40-56). Heights are NAVD88 metres, the lake at
// LEVEL; a roof's `z` is its height above the lake.
const LEVEL = 18.82;
const box = (x0, y0, x1, y1, z = 3) => ({has: (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1, z: () => LEVEL + z});
function shore(roofs) {
  const x = [], y = [], z = [], cls = [];
  for (let gy = -20; gy < 120; gy += .25) for (let gx = -20; gx < 120; gx += .25) {
    const px = gx + .125, py = gy + .125, roof = roofs.find(r => r.has(px, py));
    const lake = px >= 0 && px < 100 && py >= 0 && py < 100, bay = px >= 100 && px < 118 && py >= 40 && py < 56;
    if (roof) { x.push(px); y.push(py); z.push(roof.z(px, py)); cls.push(6); }
    else if (bay) continue;
    else { x.push(px); y.push(py); z.push(lake ? LEVEL : LEVEL + .7); cls.push(lake ? 9 : 2); }
  }
  return {total: x.length, x: Float64Array.from(x), y: Float64Array.from(y), z: Float64Array.from(z), cls: Uint8Array.from(cls)};
}
const lake = [[[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]]];
const square = (x0, y0, x1, y1) => [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]];
const extentOf = r => { const xs = r.pieces.flatMap(p => p.outline.map(q => q[0])), ys = r.pieces.flatMap(p => p.outline.map(q => q[1])); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const near = (a, b, tol = .3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

test('water roofs on a made-up shore: what is kept, what is left to an outline or the land', () => {
  const roofs = [
    box(20, 20, 30, 26),                                                               // a boathouse
    box(90, 56, 115, 66, 6),                                                           // a house across the shore, drawn but for a 6 m wing over the water
    box(40, 40, 60, 43), box(40, 43, 44, 55), box(48, 43, 52, 55), box(56, 43, 60, 55), // covered slips: a walkway and three rows
    box(80, 80, 99.5, 90), box(99.5, 70, 112, 100),                                    // a slip joined to a deeper shed on land
    box(10, 60, 40, 70),                                                               // a slip roof its first 5 m drawn
    box(70, 20, 71.5, 22),                                                             // a 3 m2 scrap
    box(105, 20, 115, 30),                                                             // a shed on land, off the lake
    box(98, 44, 112, 50),                                                              // a boathouse on the calm bay
    box(60, 70, 64, 74), box(64, 74, 68, 78),                                          // two roofs touching at a corner: one, eight ways
    box(99.75, 52, 108, 53.5)];                                                        // over the calm bay, touching the lake by 0.75 m2
  const drawn = [square(96, 56, 115, 66), square(10, 60, 15, 70)];
  const found = findWaterRoofs(shore(roofs), {lake, drawn, reg: {dx: 0, dy: 0}, level: LEVEL, extent: [-20, -20, 120, 120]});
  const at = b => found.find(r => near(extentOf(r), b, 1.5));
  assert.equal(found.length, 6, JSON.stringify(found.map(extentOf)));
  assert.equal(at([60, 70, 68, 78]).pieces.length, 2);
  const boathouse = at([20, 20, 30, 26]);
  assert.equal(boathouse.pieces.length, 1);
  assert.ok(near(extentOf(boathouse), [20, 20, 30, 26], .2), `${extentOf(boathouse)}`);
  assert.ok(Math.abs(boathouse.pieces[0].eaveM - 3) < .05);
  assert.equal(boathouse.pieces[0].form, 'flat');
  const slips = at([40, 40, 60, 55]);
  assert.equal(slips.pieces.length, 4);
  // Each piece fits its own returns, which lie half the lattice (0.125 m) inside each edge:
  // the 20 x 3 m walkway reads 19.75 x 2.75 m, each 4 x 12 m row 3.75 x 11.75 m.
  assert.deepEqual(slips.pieces.map(p => +p.areaM2.toFixed(2)), [54.31, 44.06, 44.06, 44.06]);
  // The shed on land is left out; the slip stays.
  const slip = at([80, 80, 99.5, 90]);
  assert.equal(slip.pieces.length, 1);
  assert.ok(near(extentOf(slip), [80, 80, 99.5, 90], .2), `${extentOf(slip)}`);
  assert.equal(slip.onLand.pieces, 1);
  assert.ok(slip.pieces[0].lakeShare === 1);
  // A fifth drawn: the drawn part and a metre past it stay with their outline.
  const partly = at([16, 60, 40, 70]);
  assert.ok(Math.abs(partly.drawnShare - 1 / 6) < .01);
  assert.ok(Math.abs(partly.leftToOutlinesM2 - 60) <= 5, `${partly.leftToOutlinesM2}`);
  assert.ok(near(extentOf(partly), [16, 60, 40, 70], .3), `${extentOf(partly)}`);
  // Mostly outside the lake's outline, but the lidar sees calm water all round it.
  const bay = at([98, 44, 112, 50]);
  assert.ok(bay.pieces[0].lakeShare < WATER_ROOFS.pieceLakeMin);
  assert.ok(bay.pieces[0].ringRead >= WATER_ROOFS.ringReadMin && bay.pieces[0].ringWater === 1);
  // Ordered by position.
  const keys = found.map(r => extentOf(r)[1]);
  assert.deepEqual(keys, [...keys].sort((a, b) => a - b));
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

test('water-roofs.json is current with its inputs and keeps its own rules', () => {
  const doc = json('reference/lidar/water-roofs.json');
  assert.equal(doc.kind, 'mount-dora-lidar-water-roofs');
  assert.deepEqual(doc.inputs.features, featuresPin(fs.readFileSync(path.join(town, 'features.json'))));
  assert.equal(doc.inputs.lidar.sha256, hash(fs.readFileSync(path.join(town, 'reference/lidar/source.json'))));
  assert.deepEqual(doc.method.rules, WATER_ROOFS);
  const pieces = doc.roofs.flatMap(r => r.pieces), forms = new Set(['flat', 'gable', 'hip', 'other', 'unknown']);
  assert.equal(doc.metrics.roofs, doc.roofs.length); assert.equal(doc.metrics.pieces, pieces.length);
  assert.ok(Math.abs(doc.metrics.piecesAreaM2 - pieces.reduce((s, p) => s + p.areaM2, 0)) < .1);
  assert.deepEqual(doc.roofs.map(r => r.id), doc.roofs.map((r, i) => `lidar-water-roof-${i}`));
  for (const r of doc.roofs) {
    assert.ok(r.drawnShare <= WATER_ROOFS.drawnShareMax && r.areaM2 >= WATER_ROOFS.minAreaM2, r.id);
    assert.ok(r.pieces.length > 0, r.id);
    for (const p of r.pieces) {
      assert.equal(p.outline.length, 5); assert.deepEqual(p.outline[0], p.outline[4]);
      const [a, b, , d] = p.outline, u = [b[0] - a[0], b[1] - a[1]], v = [d[0] - a[0], d[1] - a[1]];
      assert.ok(Math.abs(u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v)) < .01, `${r.id}: a rectangle`);
      assert.ok(Math.abs(Math.hypot(...u) * Math.hypot(...v) - p.areaM2) < .2, r.id);
      assert.ok(p.areaM2 >= WATER_ROOFS.pieceMinM2 * .8, `${r.id}: ${p.areaM2}`);
      assert.ok(p.lakeShare >= WATER_ROOFS.pieceLakeMin || p.ringRead >= WATER_ROOFS.ringReadMin && p.ringWater >= WATER_ROOFS.ringWaterMin, r.id);
      assert.ok(forms.has(p.form) && p.eaveM > 0 && p.eaveM <= p.ridgeM + .01, r.id);
      if (['gable', 'hip'].includes(p.form)) assert.ok(p.ridgeBearingDeg >= 0 && p.ridgeBearingDeg < 180, r.id);
    }
  }
});
