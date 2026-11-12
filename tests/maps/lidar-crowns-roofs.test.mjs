// Tree crowns and roofs over the water from the 2018 lidar: the rules on made-up
// canopies and point clouds, then the committed crowns.json and water-roofs.json
// against their inputs and their own rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {canopyHeights, findCrowns, roofCrowns, CROWNS} from '../../tools/maps/lidar/crowns.mjs';
import {closeMask, findWaterRoofs, largestRectangle, minAreaRectangle, nearBar, outlinePart, rectangleAround, WATER_ROOFS, waterOutcome} from '../../tools/maps/lidar/water-roofs.mjs';
import {featuresPin} from '../../tools/maps/house-reference/features-digest.mjs';
import {contains} from '../../tools/maps/house-reference/geometry.mjs';

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

test('crowns: foliage lets the scanner through; a crown that stops it is no tree', () => {
  // The same cone three times: its canopy returns all single, a tenth multiple, none counted.
  const grid = canopy(80, 40, cone(10.25, 10.25, 12, 5)), n = grid.cols * grid.rows;
  const returns = Uint16Array.from({length: n}, (_, i) => (grid.heights[i] >= CROWNS.tallM ? 10 : 0));
  assert.deepEqual(findCrowns({...grid, returns, multi: new Uint16Array(n)}), []);
  const tenth = findCrowns({...grid, returns, multi: Uint16Array.from(returns, r => r / 10)});
  assert.equal(tenth.length, 1); assert.equal(tenth[0].multiShare, .1);
  const below = Uint16Array.from(returns, (r, i) => (r && i % 11 ? 1 : 0));  // under a tenth of the cells' 10 returns
  assert.ok(below.reduce((a, b) => a + b, 0) < returns.reduce((a, b) => a + b, 0) / 10);
  assert.deepEqual(findCrowns({...grid, returns, multi: below}), []);
  assert.equal(findCrowns(grid)[0].multiShare, null, 'no counts, no rule');
});

test('crowns: the share at the top, and the roofs a drawn outline holds', () => {
  // The cone once more, 20 canopy returns a cell: 3 of them multiple in every cell but those
  // within topM of its top (a flat roof with foliage at its edge), or in every cell; 2 in
  // every cell, with no returns at all near the top; 6 near the top and 1 elsewhere.
  const grid = canopy(80, 40, cone(10.25, 10.25, 12, 5)), n = grid.cols * grid.rows;
  const nearTop = i => Math.hypot((i % grid.cols + .5) * .5 - 10.25, (Math.floor(i / grid.cols) + .5) * .5 - 10.25) <= CROWNS.topM;
  const returns = Uint16Array.from({length: n}, (_, i) => (grid.heights[i] >= CROWNS.tallM ? 20 : 0));
  const [roof] = findCrowns({...grid, returns, multi: Uint16Array.from(returns, (r, i) => (r && !nearTop(i) ? 3 : 0))});
  assert.ok(roof.multiShare >= CROWNS.minMultiShare && roof.multiShare < CROWNS.roofShare, `${roof.multiShare}`);
  assert.equal(roof.topShare, 0);
  const [leafy] = findCrowns({...grid, returns, multi: Uint16Array.from(returns, r => (r ? 3 : 0))});
  assert.equal(leafy.topShare, .15);
  const bare = Uint16Array.from(returns, (r, i) => (nearTop(i) ? 0 : r));
  const [unread] = findCrowns({...grid, returns: bare, multi: Uint16Array.from(bare, r => (r ? 2 : 0))});
  assert.equal(unread.topShare, null, 'no returns near the top: no share, not a solid top');
  assert.ok(unread.multiShare >= CROWNS.minMultiShare && unread.multiShare < CROWNS.roofShare);
  const [leafyTop] = findCrowns({...grid, returns, multi: Uint16Array.from(returns, (r, i) => (r ? (nearTop(i) ? 6 : 1) : 0))});
  assert.ok(leafyTop.multiShare < CROWNS.roofShare && leafyTop.topShare === .3, `${leafyTop.multiShare} ${leafyTop.topShare}`);
  // A tree over a roof lets the scanner through across its crown, though its top is solid.
  const [overhang] = findCrowns({...grid, returns, multi: Uint16Array.from(returns, (r, i) => (r && !nearTop(i) ? 6 : 0))});
  assert.ok(overhang.multiShare >= CROWNS.roofShare && overhang.topShare === 0);
  // Only the solid top centred inside a drawn outline is a roof: not one beside it whose
  // box holds the centre (an L), nor one away from it.
  const under = [[[[5, 5], [16, 5], [16, 16], [5, 16], [5, 5]]]], away = [[[[30, 30], [36, 30], [36, 36], [30, 36], [30, 30]]]];
  const ell = [[[[5, 5], [8, 5], [8, 13], [16, 13], [16, 16], [5, 16], [5, 5]]]];
  assert.deepEqual(roofCrowns([roof, leafy, unread, overhang, leafyTop], [away, under]), [roof]);
  assert.deepEqual(roofCrowns([roof], [away, ell]), []);
  assert.deepEqual(roofCrowns(findCrowns(grid), [under]), [], 'no counts, no rule');
});

test('the canopy model: highest unclassified return, building cells, and multi-return counts', () => {
  // LAS packs a return's number in bits 0-2 and its pulse's return count in bits 3-5.
  const pt = (x, y, z, cls, number, count) => ({x, y, z, cls, ret: count << 3 | number});
  const points = [
    pt(.2, .2, 9, 1, 1, 3), pt(.3, .1, 6, 1, 2, 3), pt(.4, .4, 2, 1, 3, 3),  // one pulse through a crown: two up high, one under 2.5 m
    pt(.1, .3, 7, 1, 1, 1),                                                  // a single return: something solid
    pt(.7, .2, 5, 6, 1, 1),                                                  // a roof
    pt(.2, .7, 4, 2, 1, 1),                                                  // ground is not canopy
    pt(1.2, 1.2, 8, 1, 1, 2)];                                               // outside the box
  const index = {total: points.length, ...Object.fromEntries(['x', 'y', 'z', 'cls', 'ret'].map(k => [k, points.map(p => p[k])]))};
  const grid = canopyHeights(index, () => 0, [0, 0, 1, 1]);
  assert.equal(grid.cols, 2); assert.equal(grid.rows, 2);
  assert.deepEqual([...grid.heights], [9, 0, 0, 0]);
  assert.deepEqual([...grid.building], [0, 1, 0, 0]);
  assert.deepEqual([...grid.returns], [3, 0, 0, 0], 'returns 2.5 m or more up');
  assert.deepEqual([...grid.multi], [2, 0, 0, 0], 'from pulses that returned more than once');
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
// Docks east of the outline (x 100-110, y 28-40): unclassified returns 0.7 m over the lake
// and no ground under them. A grove south of it (x 66-80, y 100-108): a canopy 8 m up that
// returned no ground, which is no dock.
function shore(roofs) {
  const x = [], y = [], z = [], cls = [];
  for (let gy = -20; gy < 120; gy += .25) for (let gx = -20; gx < 120; gx += .25) {
    const px = gx + .125, py = gy + .125, roof = roofs.find(r => r.has(px, py));
    const lake = px >= 0 && px < 100 && py >= 0 && py < 100, bay = px >= 100 && px < 118 && py >= 40 && py < 56;
    const dock = px >= 100 && px < 110 && py >= 28 && py < 40, grove = px >= 66 && px < 80 && py >= 100 && py < 108;
    if (roof) { x.push(px); y.push(py); z.push(roof.z(px, py)); cls.push(6); }
    else if (bay) continue;
    else if (dock) { x.push(px); y.push(py); z.push(LEVEL + .7); cls.push(1); }
    else if (grove) { x.push(px); y.push(py); z.push(LEVEL + 8); cls.push(1); }
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
    box(99.75, 52, 108, 53.5),                                                         // over the calm bay, touching the lake by 0.75 m2
    box(99, 32, 106, 36),                                                              // a boathouse among docks, outside the outline
    box(70, 98, 76, 104)];                                                             // a shed by the grove, two-thirds past the outline
  const drawn = [square(96, 56, 115, 66), square(10, 60, 15, 70)];
  const {roofs: found, leftOut} = findWaterRoofs(shore(roofs), {lake, drawn, reg: {dx: 0, dy: 0}, level: LEVEL, extent: [-20, -20, 120, 120]});
  const at = b => found.find(r => near(extentOf(r), b, 1.5));
  assert.equal(found.length, 7, JSON.stringify(found.map(extentOf)));
  // Its docks read as water: the boathouse among them stays though six-sevenths lie past the outline.
  const docked = at([99, 32, 106, 36]);
  assert.ok(docked.pieces[0].lakeShare < WATER_ROOFS.pieceLakeMin && docked.pieces[0].ringRead >= WATER_ROOFS.ringReadMin && docked.pieces[0].ringWater >= WATER_ROOFS.ringWaterMin);
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
  // The sheds left out are recorded, with what was measured: the one on land behind the
  // slip, its ring read and dry ('not over water'), and the one by the grove, whose canopy
  // reads as nothing ('too little read around it').
  assert.equal(leftOut.length, 2);
  assert.ok(leftOut.every(p => p.lakeShare < WATER_ROOFS.pieceLakeMin));
  const shed = leftOut.find(p => near(extentOf({pieces: [p]}), [99.5, 70, 112, 100], .3)), byGrove = leftOut.find(p => near(extentOf({pieces: [p]}), [70, 98, 76, 104], .3));
  assert.ok(shed && shed.reason === 'not over water' && shed.ringWater < WATER_ROOFS.ringWaterMin, JSON.stringify(leftOut.map(p => extentOf({pieces: [p]}))));
  // The grove's canopy hides most of the shed's ring; what is read is the lake.
  assert.ok(byGrove && byGrove.reason === 'too little read around it' && byGrove.ringRead < WATER_ROOFS.ringReadMin && byGrove.ringWater === 1, `${byGrove && [byGrove.ringRead, byGrove.ringWater, byGrove.reason]}`);
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

// A second made-up shore: Lake Dora's outline is x < 100 (water returns). East of it, five
// bands 20 m deep (y 0-100) each hold a shed reaching 2 m into the outline (x 98-112, 6 m
// deep). East of the outline their ground reads:
//   (0) docks, 2 m fingers every 6 m with calm water between; the shed has an arm over them;
//   (1) a lot of unclassified returns 0.7 m over the lake, no ground under them;
//   (2) a shore of ignored ground (class 20) with low plants, two returns of each a cell;
//   (3) unclassified returns a metre under the lake's level;
//   (4) a canopy 8 m up with one return in four 0.7 m up, under it.
// In bands 2-4 that ground lies in 4 m strips between 1 m channels of calm water, so each
// cell stands within reach of water and the dock rule turns on the returns alone.
// South of them, from y 110, calm water runs 5 m past the outline to land. A shed on the
// land (x 103-115, y 114-132) hangs a slip over the water (x 98-103, y 120-126) joined to
// nothing else. Another (x 103-115, y 158-176) hangs one (x 98-103, y 152-160) that also
// meets, corner to corner, a boathouse in the lake (x 90-98, y 140-152). A third (x 106-118,
// y 186-204) hangs a slip over the calm water (x 101-106, y 190-196) whose narrower west end
// (x 99.5-101, y 191-195) reaches the outline: the two make separate pieces, both under
// half in the outline. From y 212 calm water runs 12 m past the outline. There a boathouse
// in the lake (x 90-99.5, y 220-232) joins, by a roofed strip a metre wide, a shed on land
// (x 107.5-119.5, y 240-258) that hangs a slip (x 100.5-107.5, y 230-242) whose cells'
// centres stand 1.5 m from the boathouse's (offset, so no one rectangle spans the two);
// and a shed (x 112-124, y 268-286) hangs a slip (x 101-112, y 266-272) whose stub
// (x 98.5-101, y 267.5-270.5) lies 60% in the outline. From y 290 calm water runs 16 m
// past the outline: a slip there (x 98-111, y 296-302) joins a shed south of it (x 104-108,
// y 302-310) that stands in a thicket 8 m up (x 101-111, y 302-311), so the lidar reads
// little round the shed, and what it reads is water; a shed north of the slip (x 105-107,
// y 290-296) stands in a thicket (x 101-111, y 287-296) that hides its ring: nothing round
// it is read. From y 320 calm water runs 8 m past the
// outline to land: a shed on the land (x 109-117, y 324-336) stands in a thicket (x 108-118,
// y 321-339) with ground read east of it, and hangs a slip over the water (x 99-109,
// y 328-332): little of the shed's ring is read, and what is read is mostly dry. From y 350 calm water
// runs 16 m past the outline: a slip (x 98-111, y 356-362) joins a shed south of it
// (x 104-108, y 362-370) that a separate roof hems in a metre off (x 101-103 and 109-111,
// y 363-373; x 101-111, y 371-373), never joined to it: that roof is no part of the shed's
// own, so it hides the shed's ring.
function bands() {
  const x = [], y = [], z = [], cls = [], at = (px, py, h, c) => { x.push(px); y.push(py); z.push(LEVEL + h); cls.push(c); };
  const box = (px, py, x0, y0, x1, y1) => px >= x0 && px < x1 && py >= y0 && py < y1;
  for (let k = 0; k < 1560; k++) for (let m = 0; m < 200; m++) {
    const px = 80.125 + m * .25, py = -9.875 + k * .25, band = Math.floor(py / 20), local = py - band * 20, even = m % 2 === 0, oddRow = k % 2 === 1;
    const shed = band >= 0 && band < 5 && px >= 98 && px < 112 && local >= 7 && local < 13, arm = band === 0 && px >= 106 && px < 112 && local >= 13 && local < 17;
    const roofed = shed || arm || [[98, 120, 103, 126], [103, 114, 115, 132], [90, 140, 98, 152], [98, 152, 103, 160], [103, 158, 115, 176],
      [106, 186, 118, 204], [101, 190, 106, 196], [99.5, 191, 101, 195],
      [90, 220, 99.5, 232], [99.5, 219, 120, 220], [119, 219, 120, 240], [100.5, 230, 107.5, 242], [107.5, 240, 119.5, 258],
      [112, 268, 124, 286], [101, 266, 112, 272], [98.5, 267.5, 101, 270.5],
      [98, 296, 111, 302], [104, 302, 108, 310], [105, 290, 107, 296], [109, 324, 117, 336], [99, 328, 109, 332],
      [98, 356, 111, 362], [104, 362, 108, 370], [101, 363, 103, 373], [109, 363, 111, 373], [101, 371, 111, 373]].some(b => box(px, py, ...b));
    const thicket = box(px, py, 101, 302, 111, 311) || box(px, py, 101, 287, 111, 296) || box(px, py, 108, 321, 118, 339);
    const channel = (px - 100) % 5 >= 4;
    if (roofed) at(px, py, 3, 6);
    else if (thicket) at(px, py, 8, 1);
    else if (px < 100) at(px, py, 0, 9);
    else if (py >= 110) { if (px >= (py >= 350 ? 116 : py >= 320 ? 108 : py >= 290 ? 116 : py >= 212 ? 112 : 105)) at(px, py, .7, 2); }
    else if (band < 0 || band > 4) at(px, py, .7, 2);
    else if (band === 0) { if ((px - 100) % 6 < 2) at(px, py, .7, 1); }
    else if (band === 1) at(px, py, .7, 1);
    else if (channel) continue;
    else if (band === 2) at(px, py, even ? .3 : .6, even ? 20 : 1);
    else if (band === 3) at(px, py, -1, 1);
    else at(px, py, even && !oddRow ? .7 : 8, 1);
  }
  return {total: x.length, x: Float64Array.from(x), y: Float64Array.from(y), z: Float64Array.from(z), cls: Uint8Array.from(cls)};
}

test('water roofs: a dock is low, has no ground and stands by water; a slip joined only to a shed on land goes with it', () => {
  // The same at five grid phases: what is kept and why does not hang on where the grid falls.
  // A piece's rectangle is built on the grid's cells, so at other phases its edges may move a
  // cell and a scrap may come or go: those phases are compared to 0.6 m, and the count of
  // pieces left out is checked on the first.
  const bay = [[[[60, -10], [100, -10], [100, 380], [60, 380], [60, -10]]]], points = bands();
  for (const [ox, oy] of [[0, 0], [.2, 0], [.25, 0], [.3, 0], [0, .25]]) bandsAt(points, bay, [80 + ox, -10 + oy, 130 + ox, 380 + oy], !ox && !oy);
});

function bandsAt(points, bay, extent, first) {
  const {roofs: found, leftOut} = findWaterRoofs(points, {lake: bay, drawn: [], reg: {dx: 0, dy: 0}, level: LEVEL, extent});
  const tol = first ? .3 : .6, at = b => found.find(r => near(extentOf(r), b, tol)), out = b => leftOut.find(p => near(extentOf({pieces: [p]}), b, tol));
  assert.equal(found.length, 5, JSON.stringify(found.map(extentOf)));
  // Among the docks the shed stands over water, and so does its arm, though wholly past the
  // outline: it is joined to the shed. (The shed's roof is no part of the arm's ring.)
  const docks = at([98, 7, 112, 17]);
  assert.ok(docks && docks.pieces.length === 2, JSON.stringify(found.map(extentOf)));
  const arm = docks.pieces.find(p => p.lakeShare === 0);
  assert.ok(arm && arm.ringRead === 1 && arm.ringWater === 1, JSON.stringify(docks.pieces.map(p => [p.lakeShare, p.ringRead, p.ringWater])));
  // The other four sheds are left out. The lot's returns read as water only within
  // dockReachM of water. Ignored ground is ground, and a cell with ground is no dock though
  // low plants stand on it. Returns under the lake are no dock, nor are returns under a
  // canopy, most of them high: with the channels between, all four would read as water.
  const [lot, ignored, sunk, canopied] = [1, 2, 3, 4].map(band => out([98, 20 * band + 7, 112, 20 * band + 13]));
  assert.ok(lot && lot.ringRead < WATER_ROOFS.ringReadMin && lot.ringRead > .3, `the lot within reach of the water reads as water: ${lot && lot.ringRead}`);
  assert.ok(ignored && ignored.ringRead >= WATER_ROOFS.ringReadMin && ignored.ringWater < WATER_ROOFS.ringWaterMin, `${ignored && [ignored.ringRead, ignored.ringWater]}`);
  for (const p of [sunk, canopied]) assert.ok(p && p.ringRead < WATER_ROOFS.ringReadMin && p.ringWater === 1, `${p && p.ringRead}`);
  // The lot, the sunk returns and the canopy leave too little of the ring read; the ignored
  // ground reads, and is dry.
  for (const p of [lot, sunk, canopied]) assert.equal(p.reason, 'too little read around it', `${extent}`);
  assert.equal(ignored.reason, 'not over water');
  // The sheds on land are left out. The slip that touches nothing else, under half in the
  // outline, goes with its shed, though the lidar sees water around it.
  const slip = out([98, 120, 103, 126]);
  assert.ok(out([103, 114, 115, 132]) && out([103, 158, 115, 176]), JSON.stringify(leftOut.map(p => [extentOf({pieces: [p]}), p.reason])));
  assert.ok(slip && slip.reason === 'joined only to pieces left out' && slip.lakeShare < WATER_ROOFS.pieceLakeMin, JSON.stringify(slip));
  assert.ok(slip.ringRead >= WATER_ROOFS.ringReadMin && slip.ringWater >= WATER_ROOFS.ringWaterMin, 'over water by the lidar');
  // The slip that also meets the boathouse in the lake stays with it.
  const moored = at([90, 140, 103, 160]);
  assert.ok(moored && moored.pieces.length === 2, JSON.stringify(found.map(extentOf)));
  const hung = moored.pieces.find(p => p.lakeShare < WATER_ROOFS.pieceLakeMin);
  assert.ok(hung && near(extentOf({pieces: [hung]}), [98, 152, 103, 160], tol), JSON.stringify(moored.pieces.map(p => extentOf({pieces: [p]}))));
  assert.equal(moored.onLand.pieces, 1);
  // A slip split in two is judged whole: body and stub touch each other and the shed, and
  // nothing at least half in the outline, so both go with the shed, though each alone
  // stands over water by the lidar. (Where the grid falls moves the cut between them.)
  const inSlip = p => { const [x0, y0, x1, y1] = extentOf({pieces: [p]}); return x0 >= 99 && x1 <= 106.5 && y0 >= 189.5 && y1 <= 196.5; };
  const split = leftOut.filter(inSlip);
  assert.ok(out([106, 186, 118, 204]), JSON.stringify(leftOut.map(p => [extentOf({pieces: [p]}), p.reason])));
  assert.ok(split.length >= (first ? 2 : 1) && split.every(p => p.reason === 'joined only to pieces left out' && p.ringRead >= WATER_ROOFS.ringReadMin && p.ringWater >= WATER_ROOFS.ringWaterMin), JSON.stringify(split));
  assert.ok(!found.some(r => r.pieces.some(inSlip)), `${extent}`);
  // Pieces join into groups where their returns lie within joinM: the slip whose returns
  // stand 1.25 m from the boathouse's in the lake is not joined to it, and goes with its
  // shed, wherever the grid falls; the boathouse stays.
  const anchored = at([90, 220, 99.5, 232]), apart = out([100.5, 230, 107.5, 242]);
  assert.ok(anchored && anchored.pieces.length === 1 && anchored.pieces[0].lakeShare === 1, JSON.stringify(found.map(extentOf)));
  assert.ok(apart && apart.reason === 'joined only to pieces left out' && apart.ringRead >= WATER_ROOFS.ringReadMin && apart.ringWater >= WATER_ROOFS.ringWaterMin, JSON.stringify(apart));
  assert.ok(out([107.5, 240, 119.5, 258]));
  // A group is weighed whole, by area: a stub 60% in the outline no longer anchors the slip
  // it ends, and both go with the shed.
  const [slipBody, slipStub] = [out([101, 266, 112, 272]), out([98.5, 267.5, 101, 270.5])];
  for (const p of [slipBody, slipStub]) assert.ok(p && p.reason === 'joined only to pieces left out', JSON.stringify(leftOut.map(q => [extentOf({pieces: [q]}), q.reason])));
  assert.ok(slipStub.lakeShare >= WATER_ROOFS.pieceLakeMin && slipBody.ringRead >= WATER_ROOFS.ringReadMin && slipBody.ringWater >= WATER_ROOFS.ringWaterMin, `${slipStub.lakeShare} ${slipBody.ringRead} ${slipBody.ringWater}`);
  assert.ok(out([112, 268, 124, 286]));
  // A piece left out only because too little of its ring is read, what is read being
  // water, is no land: the slip it touches stays.
  const shaded = out([104, 302, 108, 310]), moored2 = at([98, 296, 111, 302]);
  assert.ok(shaded && shaded.reason === 'too little read around it' && shaded.ringWater >= WATER_ROOFS.ringWaterMin, JSON.stringify(shaded));
  assert.ok(moored2 && moored2.pieces.length === 1 && moored2.pieces[0].lakeShare < WATER_ROOFS.pieceLakeMin, JSON.stringify(found.map(extentOf)));
  // Nor is a piece round which nothing is read: it has no share of water at all.
  const hidden = out([105, 290, 107, 296]);
  assert.ok(hidden && hidden.reason === 'too little read around it' && hidden.ringRead === 0 && hidden.ringWater === null, JSON.stringify(hidden));
  // Pieces left out unread are no land: the roof counts them apart.
  if (first) assert.deepEqual([moored2.onLand.pieces, moored2.unread.pieces], [0, 2]);
  // A shed whose ring is under half read is still land where what is read is not water: the
  // slip it hangs goes with it.
  const thinlyRead = out([109, 324, 117, 336]), hungG = out([99, 328, 109, 332]);
  assert.ok(thinlyRead && thinlyRead.reason === 'not over water' && thinlyRead.ringRead < WATER_ROOFS.ringReadMin, JSON.stringify(thinlyRead));
  assert.ok(hungG && hungG.reason === 'joined only to pieces left out', JSON.stringify(hungG));
  // Another roof in a piece's ring hides it; only the piece's own roof is no part of it.
  const hemmed = out([104, 362, 108, 370]);
  assert.ok(hemmed && hemmed.reason === 'too little read around it' && hemmed.ringRead < WATER_ROOFS.ringReadMin && hemmed.ringWater === 1, JSON.stringify(hemmed));
  assert.ok(at([98, 356, 111, 362]), JSON.stringify(found.map(extentOf)));
  if (first) assert.equal(leftOut.length, 20);
}

// Two roofs over the lake 0.85 m apart at their nearest returns: a boathouse the game draws
// (x 20-40, y 10-29.9; its last row at 29.875) and a covered slip south of it (x 20-40, its
// first row at 30.725, to y 40). In 0.5 m cells their edges fall one or two cells apart,
// as the grid falls.
function pair() {
  const x = [], y = [], z = [], cls = [], at = (px, py, roof) => { x.push(px); y.push(py); z.push(LEVEL + (roof ? 3 : 0)); cls.push(roof ? 6 : 9); };
  for (let gy = 0; gy < 60; gy += .25) for (let gx = 0; gx < 60; gx += .25) {
    const px = gx + .125, py = gy + .125, inX = px >= 20 && px < 40;
    if (inX && py >= 10 && py < 29.9) at(px, py, true); else if (!(inX && py >= 29.9 && py < 40)) at(px, py, false);
  }
  for (let py = 30.725; py < 40; py += .25) for (let px = 20.125; px < 40; px += .25) at(px, py, true);
  return {total: x.length, x: Float64Array.from(x), y: Float64Array.from(y), z: Float64Array.from(z), cls: Uint8Array.from(cls)};
}

test('water roofs: two roofs 0.85 m apart stay two wherever the grid falls', () => {
  const points = pair(), drawn = [square(20, 10, 40, 30)];
  for (const oy of [0, .1, .2, .3, .4]) for (const ox of [0, .25]) {
    const extent = [-10 + ox, -10 + oy, 70 + ox, 70 + oy];
    const {roofs} = findWaterRoofs(points, {lake, drawn, reg: {dx: 0, dy: 0}, level: LEVEL, extent});
    // The slip is no part of the drawn boathouse: kept whole, nothing of it drawn.
    assert.equal(roofs.length, 1, `grid at ${ox}, ${oy}`);
    assert.equal(roofs[0].drawnShare, 0);
    const [x0, , x1, y1] = extentOf(roofs[0]);
    assert.ok(near([x0, x1, y1], [20.125, 39.875, 39.975], .01), `${extentOf(roofs[0])}`);
    // Joined from 0.85 m, at every phase alike, the slip is a third of a roof two-thirds
    // drawn, and goes as the boathouse's own.
    assert.equal(findWaterRoofs(points, {lake, drawn, reg: {dx: 0, dy: 0}, level: LEVEL, extent}, {...WATER_ROOFS, joinM: .86}).roofs.length, 0, `grid at ${ox}, ${oy}`);
  }
  assert.ok(WATER_ROOFS.joinM < .85);
});

// One covered slip over the lake (x 20-40, y 50-70) whose returns leave a 0.72 m gap across
// it at y 60: the north half's last row stands at 59.875, the south half's first at 60.595.
function gapped() {
  const x = [], y = [], z = [], cls = [], at = (px, py, roof) => { x.push(px); y.push(py); z.push(LEVEL + (roof ? 3 : 0)); cls.push(roof ? 6 : 9); };
  for (let gy = 0; gy < 100; gy += .25) for (let gx = 0; gx < 60; gx += .25) {
    const px = gx + .125, py = gy + .125, inX = px >= 20 && px < 40;
    if (!(inX && py >= 50 && py < 70)) at(px, py, false);
    else if (py < 60) at(px, py, true);
  }
  for (let py = 60.595; py < 70; py += .25) for (let px = 20.125; px < 40; px += .25) at(px, py, true);
  return {total: x.length, x: Float64Array.from(x), y: Float64Array.from(y), z: Float64Array.from(z), cls: Uint8Array.from(cls)};
}

test('water roofs: a gap under joinM inside a roof never splits it, wherever the grid falls', () => {
  const points = gapped();
  for (const oy of [0, .1, .2, .3, .4]) for (const ox of [0, .25]) {
    const extent = [-10 + ox, -10 + oy, 70 + ox, 110 + oy];
    const {roofs} = findWaterRoofs(points, {lake, drawn: [], reg: {dx: 0, dy: 0}, level: LEVEL, extent});
    assert.equal(roofs.length, 1, `grid at ${ox}, ${oy}`);
    assert.ok(near(extentOf(roofs[0]), [20.125, 50.125, 39.875, 69.845], .01), `${extentOf(roofs[0])}`);
    // Joined only under 0.72 m (0.71, a cell's diagonal or more), the two halves are two roofs.
    assert.equal(findWaterRoofs(points, {lake, drawn: [], reg: {dx: 0, dy: 0}, level: LEVEL, extent}, {...WATER_ROOFS, joinM: .71}).roofs.length, 2);
  }
  assert.ok(WATER_ROOFS.joinM > .72);
});

test('water roofs: the join clusters the returns only from a cell diagonal up', () => {
  // Two returns in one cell always join, and may lie 0.707 m apart.
  assert.throws(() => findWaterRoofs(pair(), {lake, drawn: [], reg: {dx: 0, dy: 0}, level: LEVEL, extent: [-10, -10, 70, 70]}, {...WATER_ROOFS, joinM: .7}), /diagonal/);
  assert.ok(WATER_ROOFS.joinM >= WATER_ROOFS.cellM * Math.SQRT2);
});

test('crowns.json is current with its inputs and keeps its own rules', () => {
  const doc = json('reference/lidar/crowns.json');
  assert.equal(doc.kind, 'mount-dora-lidar-crowns');
  assert.equal(doc.inputs.lidar.sha256, hash(fs.readFileSync(path.join(town, 'reference/lidar/source.json'))));
  // The registration that moves the crowns into the town frame comes from features.json's outlines.
  assert.deepEqual(doc.inputs.features, featuresPin(fs.readFileSync(path.join(town, 'features.json'))));
  assert.deepEqual(doc.method.rules, CROWNS);
  assert.deepEqual(doc.columns, ['topX', 'topY', 'centreX', 'centreY', 'areaM2', 'heightM', 'widthM', 'multiShare', 'topShare']);
  assert.equal(doc.crowns.length, doc.metrics.crowns);
  assert.equal(doc.notFoliage.length, doc.metrics.notFoliage); assert.ok(doc.notFoliage.length > 0);
  assert.equal(doc.roofTops.length, doc.metrics.roofTops);
  const {widthM, depthM} = json('project.json').extent;
  const shape = ([tx, ty, cx, cy, area, height, width, , top]) => {
    for (const [x, y] of [[tx, ty], [cx, cy]]) assert.ok(x > -2 && y > -2 && x < widthM + 2 && y < depthM + 2);
    assert.ok(area >= CROWNS.minAreaM2 && width >= CROWNS.minWidthM && height >= CROWNS.tallM);
    assert.ok(top === null || top >= 0 && top <= 1);
  };
  for (const row of doc.crowns) { shape(row); assert.ok(row[7] >= CROWNS.minMultiShare && row[7] <= 1); }
  // The crowns the rules take out are listed: the ones that stop the scanner, and the roofs.
  // Shares are written to 3 decimals, so a share just under a line may read as the line.
  const under = (share, line) => share < line + .0005;
  for (const row of doc.notFoliage) { shape(row); assert.ok(under(row[7], CROWNS.minMultiShare), `${row}`); }
  for (const row of doc.roofTops) { shape(row); assert.ok(row[7] >= CROWNS.minMultiShare && under(row[7], CROWNS.roofShare) && row[8] !== null && under(row[8], CROWNS.minMultiShare), `${row}`); }
  // Dora Villa Condominiums' flat roof, which the vendor left unclassified, is one of them.
  const villa = json('features.json').features.find(f => f.tags.name === 'Dora Villa Condominiums');
  assert.ok(doc.roofTops.some(([, , cx, cy, area, height]) => area > 100 && height > 20 && contains(villa.geographicGeometry.coordinates, [cx, cy])));
  assert.ok(Math.abs(doc.crowns.reduce((s, c) => s + c[4], 0) / 1e4 - doc.metrics.canopyAreaHa) < .01);
  // The generator's pin of it.
  const record = json('project.json').generation.vegetation.lidarCrowns;
  assert.equal(record.sha256, hash(fs.readFileSync(path.join(town, 'reference/lidar/crowns.json'))));
  assert.equal(record.crowns, doc.crowns.length);
});

// nearBar is what nearBar() makes of the written shares, and for a piece left out with its
// group, the group's share where that decides it. The shares are written to 3 decimals, so
// a measure may differ only where it sits on the band's edge.
function nearBarHolds(p) {
  const bars = {lakeShare: WATER_ROOFS.pieceLakeMin, ringRead: WATER_ROOFS.ringReadMin, ringWater: WATER_ROOFS.ringWaterMin, groupLakeShare: WATER_ROOFS.pieceLakeMin};
  const want = [...nearBar(p), ...(p.groupLakeShare !== undefined && Math.abs(p.groupLakeShare - WATER_ROOFS.pieceLakeMin) <= WATER_ROOFS.barBand ? ['groupLakeShare'] : [])];
  for (const k of new Set([...want, ...p.nearBar])) {
    if (want.includes(k) === p.nearBar.includes(k)) continue;
    assert.ok(Math.abs(Math.abs(p[k] - bars[k]) - WATER_ROOFS.barBand) <= .0005, `nearBar ${JSON.stringify(p.nearBar)} against ${JSON.stringify(want)} at ${k} ${p[k]}`);
  }
}

// A shed on land (x 103.25-115, y 14-32) hanging a slip over the water (x 97.5-103.25,
// y 20-26) that has 5 of its 11 cell columns in the lake's outline (x < 100); calm water
// runs 5 m past the outline to the land.
function nearShare() {
  const x = [], y = [], z = [], cls = [];
  for (let gy = -10; gy < 70; gy += .25) for (let gx = 80; gx < 130; gx += .25) {
    const px = gx + .125, py = gy + .125, roof = px >= 97.5 && px < 103.25 && py >= 20 && py < 26 || px >= 103.25 && px < 115 && py >= 14 && py < 32;
    if (roof) { x.push(px); y.push(py); z.push(LEVEL + 3); cls.push(6); } else if (px < 100) { x.push(px); y.push(py); z.push(LEVEL); cls.push(9); } else if (px >= 105) { x.push(px); y.push(py); z.push(LEVEL + .7); cls.push(2); }
  }
  return {total: x.length, x: Float64Array.from(x), y: Float64Array.from(y), z: Float64Array.from(z), cls: Uint8Array.from(cls)};
}

test('water roofs: the share of a group near its bar is named in nearBar', () => {
  const {leftOut} = findWaterRoofs(nearShare(), {lake: [[[[60, -10], [100, -10], [100, 70], [60, 70], [60, -10]]]], drawn: [], reg: {dx: 0, dy: 0}, level: LEVEL, extent: [80, -10, 130, 70]});
  const slip = leftOut.find(p => near(extentOf({pieces: [p]}), [97.5, 20, 103, 26], .3));
  assert.ok(slip && slip.reason === 'joined only to pieces left out' && Math.abs(slip.groupLakeShare - 5 / 11) < 1e-9 && slip.landTouched === 1, JSON.stringify(leftOut));
  assert.deepEqual(slip.nearBar, ['groupLakeShare']);
  // With the outline half a metre further east, 6 of the 11 columns are in it and the slip
  // stays. Its group still touches the shed on land, so it records the share that keeps it.
  const {roofs} = findWaterRoofs(nearShare(), {lake: [[[[60, -10], [100.5, -10], [100.5, 70], [60, 70], [60, -10]]]], drawn: [], reg: {dx: 0, dy: 0}, level: LEVEL, extent: [80, -10, 130, 70]});
  const stays = roofs.flatMap(r => r.pieces).find(p => near(extentOf({pieces: [p]}), [97.5, 20, 103, 26], .3));
  assert.ok(stays && Math.abs(stays.groupLakeShare - 6 / 11) < 1e-9 && stays.nearBar.includes('groupLakeShare'), JSON.stringify(roofs.map(r => r.pieces)));
});

test('water roofs: nearBar names the measures near their bar that decide a piece', () => {
  // Kept by the outline alone: its outline share decides, its ring does not.
  assert.deepEqual(nearBar({lakeShare: .53, ringRead: .647, ringWater: .48}), ['lakeShare']);
  assert.deepEqual(nearBar({lakeShare: .709, ringRead: .973, ringWater: .739}), [], 'a ring near its bar decides nothing here');
  // Kept by the ring: its water share decides; an outline share far under the bar cannot.
  assert.deepEqual(nearBar({lakeShare: .35, ringRead: .873, ringWater: .788}), ['ringWater']);
  // Passing both ring bars by a little: either would leave it out, for a different reason.
  assert.deepEqual(nearBar({lakeShare: 0, ringRead: .526, ringWater: .78}), ['ringRead', 'ringWater']);
  // Left out over land: a read share near its bar changes nothing, a water share would.
  assert.deepEqual(nearBar({lakeShare: 0, ringRead: .508, ringWater: .181}), []);
  assert.deepEqual(nearBar({lakeShare: 0, ringRead: .9, ringWater: .72}), ['ringWater']);
  // Nothing read: no share of water to move, and the piece is unread, not land.
  assert.deepEqual(nearBar({lakeShare: .48, ringRead: 0, ringWater: null}), ['lakeShare']);
  assert.deepEqual(['kept', 'land', 'unread'], [waterOutcome({lakeShare: .5, ringRead: 0, ringWater: null}), waterOutcome({lakeShare: 0, ringRead: .9, ringWater: .74}), waterOutcome({lakeShare: 0, ringRead: .4, ringWater: 1})]);
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
  // Every piece left out is listed, failing the water test or too thin in returns.
  assert.equal(doc.metrics.leftOut, doc.leftOut.length);
  assert.ok(Math.abs(doc.metrics.leftOutM2 - doc.leftOut.reduce((s, p) => s + p.areaM2, 0)) < .1);
  for (const p of doc.leftOut) {
    assert.ok(['not over water', 'too little read around it', 'too few returns to fit', 'joined only to pieces left out'].includes(p.reason));
    // Shares are written to 3 decimals: a share just under a bar may read as the bar.
    const under = (v, bar) => v < bar + .0005, atLeast = (v, bar) => v > bar - .0005;
    if (p.reason === 'not over water') assert.ok(under(p.lakeShare, WATER_ROOFS.pieceLakeMin) && p.ringWater !== null && under(p.ringWater, WATER_ROOFS.ringWaterMin), JSON.stringify(p));
    if (p.reason === 'too little read around it') assert.ok(under(p.lakeShare, WATER_ROOFS.pieceLakeMin) && under(p.ringRead, WATER_ROOFS.ringReadMin) && (p.ringWater === null || atLeast(p.ringWater, WATER_ROOFS.ringWaterMin)), JSON.stringify(p));
    // A piece goes with its group, whose share decides, not the piece's own; the record says
    // what decided it.
    if (p.reason === 'joined only to pieces left out') assert.ok(under(p.groupLakeShare, WATER_ROOFS.pieceLakeMin) && p.landTouched >= 1, JSON.stringify(p));
    if (p.reason !== 'too few returns to fit') nearBarHolds(p);
  }
  // The town's pieces whose fate a bar decides: the marina's walkway by its outline share,
  // roofs 2 and 7 by their rings' water.
  const pieceAt = (id, x, y) => doc.roofs.find(r => r.id === id).pieces.find(p => p.outline.some(q => Math.abs(q[0] - x) < .5 && Math.abs(q[1] - y) < .5));
  assert.deepEqual(pieceAt('lidar-water-roof-9', 558.5, 961).nearBar, ['lakeShare']);
  for (const id of ['lidar-water-roof-2', 'lidar-water-roof-7']) assert.deepEqual(doc.roofs.find(r => r.id === id).pieces[0].nearBar, ['ringWater'], id);
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
      nearBarHolds(p);
    }
  }
});
