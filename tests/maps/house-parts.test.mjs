// House parts: one self-contained file per Mount Dora building. These checks
// need neither Nautilus nor the lidar cache.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {root, PARTS_DIR, BLOCK, BLOCK_MAX_M, loadTown, buildParts, formatPart, roundTrip, stampSectors, splitWalls, floorCells, validatePart, placementFromPart, artMismatches, shiftTreatment,
  pyFloat, pyDumps, PyFloat, placePoint, placePart, localAxisDeg, iou, centroid, localEntrances, localEvidence, firstDifference, toBlock, blockFits, credits, usesCounty,
  MATERIALS, sha256} from '../../tools/maps/house-parts/house-parts.mjs';
import {generate, refusals, compareFolder, runCli, inputDigests, median, REGENERATE} from '../../tools/maps/house-parts/build-house-parts.mjs';
import {allBlocks, blockDigest, blockDigests} from '../../tools/maps/house-parts/export-block.mjs';
import {RECEIPT, BROWSER_SAMPLES, SLOT, NEIGHBOURS, sameHouse, matchesPart, flushWest, reviewHeadless, edgeControl, keptBrowser, mergeResults, reviewPassed}
  from '../../tools/maps/house-parts/review-house-part-blocks.mjs';
import {NAUTILUS_COMMIT} from '../../maps/mount-dora/workshop/model.js';

// Generation reports its refusals here instead of throwing, so each check below fails by name.
const dir = path.join(root, PARTS_DIR), town = await loadTown(), generated = generate(town, {strict: false}), {parts, index, files} = generated;
const byId = new Map(parts.map(p => [p.id, p])), geographic = new Map(town.features.features.map(f => [f.id, f.geographicGeometry?.coordinates]));
const offAxis = deg => { const m = ((deg % 90) + 90) % 90; return Math.min(m, 90 - m); };
const solo = parts.find(p => p.walls.length > 4 && p.walls.every(w => !w.sharedWith.length) && p.storeys.count === 1);
const blocks = allBlocks(), sample = blocks.find(b => b.id === BROWSER_SAMPLES[0]);
// Stamping every sector takes seconds, so a check about one house stamps only that house's sectors.
const around = (...ids) => ({...town, sectors: town.sectors.filter(s => ids.some(id => byId.get(id).provenance.sectors.includes(s.id)))});

// A valid 3 x 2 m part, for checks that need a part to break one way at a time.
const box = () => ({kind: 'house-part', version: 1, id: 'box', size: [3, 2], outline: [[[[0, 0], [3, 0], [3, 2], [0, 2], [0, 0]]]], floorCells: [[0, 0, 3], [1, 0, 3]],
  walls: [[[0, 0], [3, 0]], [[3, 0], [3, 2]], [[3, 2], [0, 2]], [[0, 2], [0, 0]]].map(([a, b], i) => ({a, b, sharedWith: [], sourceWallId: 'w' + i})),
  storeys: {count: 1}, material: {wall: 'wood'}, placements: {pivot: [1.5, 1], grid: {origin: [10, 20]}}, entrances: {status: 'not-surveyed', records: []}});

test('generation is not refused', () => {
  assert.deepEqual(generated.refused, [], generated.refused.join('\n'));
});

test('every building has one current part file, listed in the index', () => {
  const buildings = town.features.features.filter(f => f.category === 'building').map(f => f.id);
  assert.equal(parts.length, 1076);
  assert.deepEqual(parts.map(p => p.id), buildings);
  const folder = compareFolder(dir, files);
  assert(folder.current, `stale: ${folder.stale.slice(0, 5)}; extra: ${folder.extra.slice(0, 5)}. Regenerate with: ${REGENERATE}`);
  for (const entry of index.parts) assert.equal(entry.sha256, sha256(files.get(entry.file)));
});

test('the folder check names stale, missing and extra files', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'house-parts-')), names = [...files.keys()].slice(0, 3), some = new Map(names.map(n => [n, files.get(n)]));
  try {
    for (const [name, text] of some) fs.writeFileSync(path.join(temp, name), text);
    assert.deepEqual(compareFolder(temp, some), {stale: [], extra: [], current: true});
    fs.writeFileSync(path.join(temp, names[0]), some.get(names[0]) + ' ');
    fs.rmSync(path.join(temp, names[1]));
    fs.writeFileSync(path.join(temp, 'osm-way-0.json'), '{}');
    fs.writeFileSync(path.join(temp, 'README.md'), 'kept');
    assert.deepEqual(compareFolder(temp, some), {stale: names.slice(0, 2), extra: ['osm-way-0.json'], current: false});
    fs.rmSync(path.join(temp, 'osm-way-0.json'));
    assert.equal(compareFolder(temp, some).current, false, 'a stale file alone must fail the check');
    // The command line: --check fails while anything is stale; writing removes extras and keeps README.md.
    const said = [], cli = check => runCli({check, dir: temp, files: some, index, log: m => said.push(m), error: m => said.push(m)});
    assert.equal(cli(true), 1);
    assert.match(said.join('\n'), /House parts are stale: 2 differ or are missing[\s\S]*Regenerate with: node tools\/maps\/house-parts\/build-house-parts\.mjs/);
    fs.writeFileSync(path.join(temp, 'osm-way-0.json'), '{}');
    assert.equal(cli(false), 0);
    assert.deepEqual(fs.readdirSync(temp).sort(), [...names, 'README.md'].sort());
    assert.equal(cli(true), 0);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('the parts stamp back into all 42 sectors byte for byte', () => {
  assert.equal(generated.trip.sectors, 42);
  assert.equal(generated.trip.identical, 42, JSON.stringify(generated.trip.mismatches[0]));
});

test('the round trip fails when a part is wrong', () => {
  const broken = mutate => { const ps = structuredClone(parts); mutate(ps, ps.find(p => p.id === solo.id)); return ps; };
  const cases = {
    'a wall moved 1 m': (ps, p) => { p.walls[0].a[0] += 1; p.walls[0].b[0] += 1; },
    'a dropped part': ps => ps.splice(ps.findIndex(p => p.id === solo.id), 1),
    'one more storey': (ps, p) => { p.storeys.count += 1; },
    'origin shifted 1 m': (ps, p) => { p.placements.grid.origin[0] += 1; },
    'another wall material': (ps, p) => { p.material.wall = MATERIALS.find(m => m !== p.material.wall); },
    'the outline squared to its bounds': (ps, p) => { const [w, h] = p.size; p.outline = [[[[0, 0], [w, 0], [w, h], [0, h], [0, 0]]]]; },
  };
  const near = around(solo.id);
  assert.equal(roundTrip(parts, near).identical, near.sectors.length);
  for (const [name, mutate] of Object.entries(cases)) {
    const trip = roundTrip(broken(mutate), near);
    assert(trip.identical < trip.sectors, name + ' still reproduced every sector');
  }
  const shared = parts.find(p => p.walls.some(w => w.sharedWith.length)), ps = structuredClone(parts);
  const one = ps.find(p => p.id === shared.id).walls.find(w => w.sharedWith.length);
  one.a = [one.a[0] + 1, one.a[1]];
  assert.throws(() => roundTrip(ps, town), /Shared wall copies disagree/);
  assert.throws(() => roundTrip(parts.filter(p => p.id !== one.sharedWith[0]), town), /names a part that is not here/);
});

test('generation refuses invalid parts, a failed round trip and art that does not rebuild', () => {
  const victim = solo.id, sector = town.sectors.find(s => !solo.provenance.sectors.includes(s.id)), near = around(victim);
  const bad = {...near,
    features: {...town.features, features: town.features.features.map(f => f.id === victim ? {...f, nativeProxy: {...f.nativeProxy, stories: 6}} : f)},
    // A part rebuilds the kit's anchor from its outline, so a moved anchor cannot round-trip.
    art: {...town.art, PLACEMENTS: town.art.PLACEMENTS.map(p => p.id === victim ? {...p, anchor: [p.anchor[0] + 1, p.anchor[1]]} : p)},
    sectors: [...near.sectors, {...sector, bytes: Buffer.concat([sector.bytes, Buffer.from(' ')])}]};
  assert.throws(() => generate(bad), error => {
    assert.match(error.message, /part checks fail[\s\S]*storeys out of range/);
    assert.match(error.message, new RegExp(`do not reproduce ${bad.sectors.length} of ${bad.sectors.length} sectors[\\s\\S]*mirror deduplicated_walls, split_walls, polygon_spans`));
    assert.match(error.message, /1 art placements do not rebuild/);
    return true;
  });
});

test('generation refuses a stamp that throws, a fit method it does not know and a house with no roof record', () => {
  const near = around(solo.id), cut = {...near, sectors: near.sectors.map((s, i) => i ? s : {...s, bytes: s.bytes.subarray(0, 100)})};
  const broken = generate(cut, {strict: false});
  assert.match(broken.refused.join('\n'), /do not reproduce \d+ of \d+ sectors\. Stamping the parts threw: /);
  assert.equal(broken.index.checks.sectors.byteIdentical, 0, 'a stamp that threw is never recorded as identical');
  // The first building in id order fails first, so these stay quick.
  const first = town.features.features.find(f => f.category === 'building');
  const renamed = {...town, authored: {...town.authored, records: town.authored.records.map(r => r.id === first.id ? {...r, derivation: {...r.derivation, method: 'some-new-fit'}} : r)}};
  assert.throws(() => buildParts(renamed), new RegExp(`${first.id}: unknown grid-fit method some-new-fit`));
  const roofless = {...town, lidar: {...town.lidar, buildings: town.lidar.buildings.filter(b => b.id !== first.id)}, county: {...town.county, buildings: town.county.buildings.filter(b => b.id !== first.id)}};
  assert.throws(() => buildParts(roofless), new RegExp(`${first.id} has no lidar roof record`));
});

test('a mismatch names the field that differs', () => {
  assert.deepEqual(firstDifference({a: [1, {b: 2}]}, {a: [1, {b: 3}]}), {path: '.a[1].b', committed: '2', stamped: '3'});
  assert.deepEqual(firstDifference({a: 1}, {a: 1, thicknessM: .16}), {path: '.thicknessM', committed: '(absent)', stamped: '0.16'});
  assert.deepEqual(firstDifference({a: 1}, {a: '1'}), {path: '.a', committed: '1', stamped: '"1"'});
  assert.equal(firstDifference({a: [1, 2]}, {a: [1, 2]}), null);
  const near = around(solo.id), ps = structuredClone(parts); ps.find(p => p.id === solo.id).material.wall = MATERIALS.find(m => m !== solo.material.wall);
  assert.match(roundTrip(ps, near).mismatches[0].field.path, /^\.wallRuns\.segments\[\d+\]\.material$/);
  const spaced = {...near, sectors: near.sectors.map(s => ({...s, bytes: Buffer.concat([s.bytes, Buffer.from(' ')])}))}, trip = roundTrip(parts, spaced);
  assert.equal(trip.mismatches[0].field, 'the values agree but the bytes differ (key order, number formatting or spacing)');
  assert.match(refusals(parts, spaced, trip).join('\n'), /where the values agree[\s\S]*The values agree, so pyDumps in house-parts\.mjs writes them differently/, 'a byte-only difference blames the serialiser, not the mirrors');
});

test('a floor no part claims comes back unclaimed, not as floor', () => {
  const lone = parts.find(p => p.provenance.sectors.length === 1 && p.walls.every(w => !w.sharedWith.length));
  const sid = lone.provenance.sectors[0], sector = town.sectors.find(s => s.id === sid);
  const map = JSON.parse(stampSectors(parts.filter(p => p.id !== lone.id), around(lone.id)).sectors.get(sid));
  const [y, x0] = lone.floorCells[0], [ox, oy] = lone.placements.grid.origin;
  assert.equal(map.terrain[y + oy - sector.origin.y][x0 + ox - sector.origin.x], 'no-part-for-this-floor');
});

test('the wall and floor mirrors follow the generator on synthetic shapes', () => {
  // Real Mount Dora has no wall piece over 60 m and no two-polygon outline, so these rules are pinned here.
  const extent = {sectorSizeM: 240, widthM: 480, depthM: 480, columns: 2, rows: 2};
  const pieces = (id, a, b) => splitWalls([{id, a, b, owners: ['x'], stories: 1, material: 'wood'}], extent).pieces;
  const rows = list => list.map(p => [p.id, p.a, p.b]);
  assert.deepEqual(rows(pieces('w1', [10, 10], [74, 10]).get('A01')), [['md-w1-1', [9.5, 9.5], [73.5, 9.5]]], '64 m stays one piece');
  assert.deepEqual(rows(pieces('w2', [10, 10], [74.5, 10]).get('A01')), [['md-w2-1', [9.5, 9.5], [41.75, 9.5]], ['md-w2-2', [41.75, 9.5], [74, 9.5]]], '64.5 m halves');
  const cut = pieces('w3', [230, 20], [250, 20]);
  assert.deepEqual(rows(cut.get('A01')), [['md-w3-1', [229.5, 19.5], [239.5, 19.5]]]);
  assert.deepEqual(rows(cut.get('B01')), [['md-w3-2', [-0.5, 19.5], [9.5, 19.5]]]);
  assert.deepEqual(rows(pieces('w4', [-5, 30], [5, 30]).get('A01')), [['md-w4-1', [-0.5, 29.5], [4.5, 29.5]]], 'the town edge clips');
  assert.equal(pieces('w5', [-5, -1], [5, -1]).size, 0, 'a wall beside the town, outside it, is dropped');
  const sliver = splitWalls([{id: 'w6', a: [239.93, 20], b: [250, 20], owners: ['x'], stories: 1, material: 'wood'}], extent);
  assert.deepEqual([...sliver.pieces.keys()], ['B01'], 'a 7 cm piece is no wall run');
  assert.deepEqual(sliver.slivers.map(s => [s.sourceWallId, s.sectorId, Number(s.lengthM.toFixed(4))]), [['w6', 'A01', .07]]);
  const outline = [[[[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]], [[[5, 0], [6, 0], [6, 2], [5, 2], [5, 0]]]];
  assert.deepEqual(floorCells(outline), [[0, 0, 3], [0, 5, 6], [1, 0, 1], [1, 2, 3], [1, 5, 6], [2, 0, 3]], 'both polygons count; the courtyard does not');
  // A three-storey house whose east wall lies on a sector line: the next sector
  // holds only that wall, yet takes its storeys and its owner.
  const tiny = {extent: {sectorSizeM: 4, widthM: 8, depthM: 4, columns: 2, rows: 1}, sectors: ['A01', 'B01'].map((id, i) => ({id, origin: {x: 4 * i, y: 0},
    bytes: Buffer.from(JSON.stringify({terrain: Array.from({length: 4}, () => Array(4).fill('yard')), levels: 3, upper: [{}, {}], mountDora: {buildingIds: []}}))}))};
  const house = {...box(), id: 'h', size: [4, 2], outline: [[[[0, 0], [4, 0], [4, 2], [0, 2], [0, 0]]]], storeys: {count: 3}, placements: {grid: {origin: [0, 1]}},
    walls: [[[0, 0], [4, 0]], [[4, 0], [4, 2]], [[4, 2], [0, 2]], [[0, 2], [0, 0]]].map(([a, b], i) => ({a, b, sharedWith: [], sourceWallId: 'w' + i}))};
  const east = JSON.parse(stampSectors([house], tiny).sectors.get('B01'));
  assert.equal(east.levels, 4, 'a wall run raises its sector\'s levels');
  assert.deepEqual(east.mountDora.buildingIds, ['h'], 'a wall run names its owner in the sector');
  assert.deepEqual(east.terrain.flat().filter(t => t === 'floor'), []);
  // A house reaching past the town's west or east edge keeps only its cells
  // inside the town; unclamped, they would wrap onto the next row.
  const stampAt = origin => stampSectors([{...house, placements: {grid: {origin}}, walls: []}], tiny).sectors;
  const rowsOf = origin => ['A01', 'B01'].map(id => JSON.parse(stampAt(origin).get(id)).terrain.map(r => r.map(t => t === 'floor' ? 'F' : '.').join('')));
  assert.deepEqual(rowsOf([-2, 1]), [['....', 'FF..', 'FF..', '....'], ['....', '....', '....', '....']], 'west edge');
  assert.deepEqual(rowsOf([6, 1]), [['....', '....', '....', '....'], ['....', '..FF', '..FF', '....']], 'east edge');
  assert.deepEqual(['A01', 'B01'].map(id => JSON.parse(stampAt([-2, 1]).get(id)).levels), [4, 3], 'upper floors alone raise their sector\'s levels');
});

test('each part closes on its own, on the 1 m grid', () => {
  for (const part of parts) assert.deepEqual(validatePart(part), []);
  assert.deepEqual(validatePart(box()), []);
  const cases = [
    ['not a house-part v1', p => { p.version = 2; }],
    ['outline is not on the 1 m grid', p => { p.outline = p.outline.map(poly => poly.map(r => r.map(([x, y]) => [x + .5, y]))); }],
    ['outline does not start at the origin', p => { p.outline = p.outline.map(poly => poly.map(r => r.map(([x, y]) => [x + 1, y]))); }],
    ['outline does not start at the origin', p => { p.outline = p.outline.map(poly => poly.map(r => r.map(([x, y]) => [x, y + 1]))); }],
    ['size is not the outline extent', p => { p.size = [4, 2]; }],
    ['size is not the outline extent', p => { p.size = [3, 3]; }],
    ['a ring is not closed', p => { p.outline[0][0].pop(); }],
    ['a ring is not closed', p => { p.outline = [[[[0, 0], [3, 0], [3, 2], [0, 0]]]]; }],
    ['an outline edge is not axis-aligned', p => { p.outline = [[[[0, 0], [3, 1], [3, 2], [0, 2], [0, 0]]]]; }],
    ['floorCells are not the outline cells', p => { p.floorCells.pop(); }],
    ['a wall is not on the 1 m grid', p => { p.walls[0].b = [3, .5]; }],
    ['walls do not trace the outline exactly once', p => { p.walls.pop(); }],
    ['walls do not trace the outline exactly once', p => { p.walls.push({...p.walls[0], sourceWallId: 'extra'}); }],
    ['a wall id repeats', p => { p.walls[1].sourceWallId = 'w0'; }],
    ['storeys out of range 1-5', p => { p.storeys.count = 6; }],
    ['storeys out of range 1-5', p => { p.storeys.count = 0; }],
    ['storeys out of range 1-5', p => { p.storeys.count = 1.5; }],
    ['unsupported wall material glass', p => { p.material.wall = 'glass'; }],
    ['placement pivot or origin invalid', p => { p.placements.pivot = [NaN, 1]; }],
    ['placement pivot or origin invalid', p => { p.placements.pivot = [1, Infinity]; }],
    ['placement pivot or origin invalid', p => { p.placements.grid.origin = [10.5, 20]; }],
    ['unknown entrance status', p => { p.entrances.status = 'guessed'; }],
  ];
  for (const [message, mutate] of cases) {
    const part = box(); mutate(part);
    assert(validatePart(part).some(p => p === 'box: ' + message), `${message}: got ${JSON.stringify(validatePart(part))}`);
  }
  for (const status of ['not-recorded', 'surveyed']) { const part = box(); part.entrances.status = status; assert.deepEqual(validatePart(part), [], status); }
  // The art kit's points must have moved into the part frame with the outline.
  for (const p of parts) {
    const t = p.appearance.treatment, points = [...(t.frontGables || []), ...(t.turret ? [t.turret.centre] : [])];
    assert(points.every(([x, y]) => x >= 0 && y >= 0 && x <= p.size[0] && y <= p.size[1]), p.id + ': an art point outside the part');
    assert(p.roof.ridgeAxisDeg === null || p.roof.ridgeAxisDeg >= 0 && p.roof.ridgeAxisDeg < 180, p.id);
  }
});

test('a shared party wall is the same wall on both sides', () => {
  let shared = 0;
  for (const part of parts) for (const wall of part.walls) for (const other of wall.sharedWith) {
    const twin = byId.get(other).walls.find(w => w.sourceWallId === wall.sourceWallId);
    assert(twin, `${other} lacks ${wall.sourceWallId}`);
    const town_ = (p, v) => [v[0] + p.placements.grid.origin[0], v[1] + p.placements.grid.origin[1]];
    assert.deepEqual([town_(part, wall.a), town_(part, wall.b)], [town_(byId.get(other), twin.a), town_(byId.get(other), twin.b)]);
    shared++;
  }
  assert(shared > 0);
});

test('the art kit placement rebuilds exactly from each part', () => {
  const kit = new Map(town.art.PLACEMENTS.filter(p => p.kind === 'building').map(p => [p.id, p]));
  for (const part of parts) assert.deepEqual(placementFromPart(part), kit.get(part.id));
  assert.deepEqual(artMismatches(parts, town), []);
  const changed = structuredClone(parts); changed.find(p => p.id === solo.id).appearance.seed += 1;
  assert.deepEqual(artMismatches(changed, town), [solo.id]);
  const donnelly = byId.get('osm-way-547799531');
  assert.deepEqual(donnelly.appearance.treatment.turret.centre, [19, 14]);
  assert.throws(() => shiftTreatment({type: 'vernacular', porchCorner: [1, 2]}, [0, 0]), /Unknown art treatment field porchCorner/);
  const depot = town.art.PLACEMENTS.find(p => p.id === 'osm-way-557494933').treatment;
  assert.equal(depot.wallFinish, 'painted-white');
  assert.deepEqual(shiftTreatment(depot, [50, -20]), depot, 'Moving a depot preserves its relative sash, chimney and eave measurements');
  assert.throws(() => shiftTreatment({...depot, depot: {...depot.depot, absoluteCorner: [5, 8]}}, [50, -20]), /Unknown depot field absoluteCorner/);
});

test('a part on its own draws every facade; the town\'s neighbours are kept apart', () => {
  const inTown = parts.filter(p => p.placements.grid.suppressedWallEdges.length);
  assert(inTown.length > 0);
  for (const part of parts) {
    assert(!('suppressedWallEdges' in part.appearance), part.id);
    assert.deepEqual(placementFromPart(part, {inTown: false}).suppressedWallEdges, []);
  }
});

test('Python float and JSON mirrors print as the generator does', () => {
  const cases = [[436, '436.0'], [1327.5, '1327.5'], [0.5, '0.5'], [-0.4, '-0.4'], [0.1, '0.1'], [0.0001, '0.0001'], [0.00001, '1e-05'],
    [1e16, '1e+16'], [123456789012345.6, '123456789012345.6'], [1.2345678901234568e+17, '1.2345678901234568e+17'], [-0, '-0.0'], [19.5, '19.5'], [127, '127.0']];
  for (const [value, text] of cases) assert.equal(pyFloat(value), text, String(value));
  assert.equal(pyDumps({a: [new PyFloat(127), 1, 'é'], b: null}), '{"a":[127.0,1,"é"],"b":null}\n');
});

test('a part placed at its true angle covers its measured footprint', () => {
  const turned = parts.filter(p => offAxis(p.placements.true.rotationDeg) > 5);
  assert(turned.length >= 40, 'too few turned houses to judge');
  const wrong = p => iou(p.outline.map(poly => poly.map(r => r.map(v => placePoint(v, {pivot: p.placements.pivot, at: p.placements.true.at, rotationDeg: -p.placements.true.rotationDeg})))), geographic.get(p.id));
  for (const p of turned) {
    assert(p.placements.true.fitIoU > p.placements.grid.fitIoU, p.id + ': the true pose is no better than the grid');
    assert(p.placements.true.fitIoU > wrong(p), p.id + ': the opposite turn fits as well');
  }
  assert(median(turned.map(p => p.placements.true.fitIoU)) >= .85);
  assert(median(turned.map(p => p.placements.grid.fitIoU)) < .75);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([3, 1, 2]), 2);
  // The plans the review moved by hand are placed by their centroids instead.
  const reviewed = parts.filter(p => p.placements.true.method === 'reviewed-grid-override');
  assert.equal(reviewed.length, 3);
  for (const p of reviewed) assert(p.placements.true.fitIoU >= .85 && p.placements.true.fitIoU > p.placements.grid.fitIoU, `${p.id}: ${p.placements.true.fitIoU}`);
});

test('the measured footprint is kept in the frame of the true pose', () => {
  for (const p of parts) {
    const placed = p.provenance.geographicOutline.map(poly => poly.map(r => r.map(v => placePoint(v, {pivot: p.placements.pivot, ...p.placements.true}))));
    const error = Math.max(...placed.flat(2).map((v, i) => Math.hypot(v[0] - geographic.get(p.id).flat(2)[i][0], v[1] - geographic.get(p.id).flat(2)[i][1])));
    assert(error < .001, `${p.id}: ${error} m from the measured footprint`);
    assert(Math.abs(iou(p.outline, p.provenance.geographicOutline) - p.placements.true.fitIoU) < .01, p.id);
  }
});

test('a part moves as one rigid unit at any angle', () => {
  const p = byId.get('osm-way-547799531'), {pivot, grid} = p.placements;
  assert.deepEqual(pivot, [p.size[0] / 2, p.size[1] / 2]);
  for (const v of p.outline.flat(2)) assert.deepEqual(placePoint(v, {pivot, at: grid.at, rotationDeg: 0}).map(n => Number(n.toFixed(9))), [v[0] + grid.origin[0], v[1] + grid.origin[1]]);
  const length = w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  for (const deg of [17, 90, -133.4]) {
    const placed = placePart(p, {at: [100, 200], rotationDeg: deg});
    placed.walls.forEach((w, i) => assert(Math.abs(length(w) - length(p.walls[i])) < 1e-9));
    const [a, b] = [placed.walls[0], placed.walls[1]], angle = Math.atan2(a.b[1] - a.a[1], a.b[0] - a.a[0]) - Math.atan2(b.b[1] - b.a[1], b.b[0] - b.a[0]);
    const local = Math.atan2(p.walls[0].b[1] - p.walls[0].a[1], p.walls[0].b[0] - p.walls[0].a[0]) - Math.atan2(p.walls[1].b[1] - p.walls[1].a[1], p.walls[1].b[0] - p.walls[1].a[0]);
    assert(Math.abs(Math.sin(angle - local)) < 1e-9, 'walls kept their angles to each other');
  }
  const quarter = placePart(p, {at: pivot, rotationDeg: 90});
  assert.deepEqual(quarter.walls[0].a.map(n => Number(n.toFixed(9))), [pivot[0] - (p.walls[0].a[1] - pivot[1]), pivot[1] + (p.walls[0].a[0] - pivot[0])].map(n => Number(n.toFixed(9))));
  // A 4 x 2 m outline with a 1 m hole: (8 * [2, 1] - [1.5, 1.5]) / 7, whichever way the hole winds.
  for (const hole of [[[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]]) {
    const c = centroid([[[[0, 0], [4, 0], [4, 2], [0, 2], [0, 0]], hole]]);
    assert(Math.abs(c[0] - 14.5 / 7) < 1e-12 && Math.abs(c[1] - 6.5 / 7) < 1e-12, String(c));
  }
});

test('lidar ridges turn into the part frame along its walls', () => {
  const ridged = parts.filter(p => ['gable', 'hip'].includes(p.roof.form) && p.roof.confidence >= .7 && p.roof.ridgeAxisDeg !== null);
  assert(ridged.filter(p => offAxis(p.roof.ridgeAxisDeg) <= 5).length / ridged.length >= .95);
  const turned = ridged.filter(p => offAxis(p.placements.true.rotationDeg) > 5);
  const right = turned.filter(p => offAxis(p.roof.ridgeAxisDeg) <= 5).length;
  const wrong = turned.filter(p => offAxis(localAxisDeg(p.roof.ridgeBearingMeasuredDeg, -p.placements.true.rotationDeg)) <= 5).length;
  assert(right >= turned.length / 2 && right > 3 * wrong, `turned ridges: ${right} right-sign vs ${wrong} wrong-sign of ${turned.length}`);
  assert.equal(localAxisDeg(57, -34.258), 1.3);
});

test('each true pose carries latitude and longitude of the house within a millimetre', () => {
  for (const p of parts) {
    const [x, y] = town.projection.toTown(p.placements.true.latitude, p.placements.true.longitude);
    assert(Math.hypot(x - p.placements.true.at[0], y - p.placements.true.at[1]) < .001, p.id);
    const xs = geographic.get(p.id).flat(2).map(v => v[0]), ys = geographic.get(p.id).flat(2).map(v => v[1]);
    assert(p.placements.true.at[0] > Math.min(...xs) && p.placements.true.at[0] < Math.max(...xs) && p.placements.true.at[1] > Math.min(...ys) && p.placements.true.at[1] < Math.max(...ys),
      p.id + ': the true pose is not on the house');
  }
});

test('entrances stay unknown unless a survey saw them', () => {
  assert(parts.every(p => p.entrances.status === 'not-surveyed' && !p.entrances.records.length));
  assert.deepEqual(localEntrances(undefined, [10, 20]), {status: 'not-surveyed', records: []});
  assert.equal(localEntrances({stories: '2'}, [10, 20]).status, 'not-recorded');
  const survey = {entrances: [{segment: [[14, 20], [15, 20]]}], imageryDate: '2024-03', confidence: 'likely', at: '2026-11-01T10:00:00Z'};
  const seen = localEntrances(survey, [10, 20]);
  assert.deepEqual(seen, {status: 'surveyed', observed: '2024-03', confidence: 'likely', recorded: '2026-11-01T10:00:00Z',
    source: 'house survey: a person viewing Google Maps imagery; no imagery is stored', records: [{edge: [[4, 0], [5, 0]]}]});
  const evidence = localEvidence({county: {stories: 2}, survey}, [10, 20]);
  assert.deepEqual(evidence.survey.entrances, [{edge: [[4, 0], [5, 0]]}], 'survey entrances move into the part frame');
  assert.deepEqual(evidence.county, {stories: 2});
  assert.deepEqual(localEvidence({county: {stories: 2}}, [10, 20]), {county: {stories: 2}});
});

test('a change the parts do not read leaves them unchanged', () => {
  const cameras = {...town, county: {...town.county, buildings: town.county.buildings.map(b => ({...b, camera: {heading: 90}}))}};
  const art = {...town, art: {...town.art, ART_REVISION: 'another revision', PLACEMENTS: town.art.PLACEMENTS.map(p => p.kind === 'building' ? p : {...p, seed: (p.seed ?? 0) + 1})}};
  // Neither touches a sector, so the parts and the index's input digests are the whole of what could change.
  for (const changed of [cameras, art]) {
    for (const part of buildParts(changed)) assert.equal(formatPart(part), files.get(part.id + '.json'), part.id);
    assert.deepEqual(inputDigests(changed), index.inputs);
  }
  assert.notDeepEqual(inputDigests({...town, county: {...town.county, buildings: town.county.buildings.slice(1)}}), index.inputs, 'a change the parts read shows');
});

test('each part carries its licence and credits', () => {
  for (const p of parts) {
    assert.equal(p.rights.license, 'ODbL-1.0');
    assert.equal(p.rights.attribution[0], '© OpenStreetMap contributors, https://www.openstreetmap.org/copyright');
    assert.match(p.rights.attribution.at(-1), /^USGS 3D Elevation Program lidar, public domain \(FL_Peninsular_Lake_2018\)$/);
    const county = p.source.county || p.evidence?.county || [p.storeys.source, p.material.source, p.address?.source].some(s => s?.startsWith('county'));
    assert.equal(p.rights.attribution.includes('Lake County Property Appraiser (Florida) public records'), Boolean(county), p.id);
  }
  // Every Mount Dora part uses some county record, so the rules are pinned here.
  assert.deepEqual(credits(false, 'X'), ['© OpenStreetMap contributors, https://www.openstreetmap.org/copyright', 'USGS 3D Elevation Program lidar, public domain (X)']);
  assert.equal(credits(true, 'X').length, 3);
  const plain = {nativeProxy: {storiesSource: 'tag:building:levels', materialSource: 'unsurveyed-native-kit-proxy'}};
  assert.equal(usesCounty(plain, {source: 'osm'}), false);
  assert.equal(usesCounty(plain, null), false);
  assert.equal(usesCounty({...plain, county: {sketches: []}}, null), true);
  assert.equal(usesCounty({nativeProxy: {...plain.nativeProxy, evidence: {county: {stories: 1}}}}, null), true);
  assert.equal(usesCounty({nativeProxy: {...plain.nativeProxy, storiesSource: 'county:STORIES 1.00'}}, null), true);
  assert.equal(usesCounty({nativeProxy: {...plain.nativeProxy, materialSource: 'county:CNS_EXT_WALL_1 BRICK'}}, null), true);
  assert.equal(usesCounty(plain, {source: 'county parcel 123; join contains'}), true);
});

test('the index records where the art kit disagrees with the native storeys', () => {
  const {storeys} = index.checks;
  assert.deepEqual(storeys.artKitDisagrees.map(d => d.id), parts.filter(p => p.appearance.treatment.stories !== p.storeys.count).map(p => p.id));
  assert(storeys.artKitDisagrees.some(d => d.name === 'Lakeside Inn'));
  assert.equal(storeys.artKitAgrees + storeys.artKitDisagrees.length, parts.length);
});

test('blocks keep 1 m of yard on every side and the wall-run contract', () => {
  assert.equal(blocks.length, parts.filter(blockFits).length);
  assert.equal(blocks.length, 807);
  assert(parts.filter(blockFits).every(p => p.size.every(n => n <= 22)));
  for (const {part, block} of blocks) {
    assert.equal(block.terrain.length, 24); assert(block.terrain.every(r => r.length === 24));
    assert.equal(block.upper.length, block.levels - 1); assert(block.levels >= 3 && block.levels <= 6);
    assert(typeof block.name === 'string' && block.name.length >= 1 && block.name.length <= 60, 'the engine takes names of 1 to 60 characters');
    const ids = new Set(block.wallRuns.segments.map(s => s.id));
    assert.equal(ids.size, block.wallRuns.segments.length);
    // The engine takes unique ids of /^[\w:.-]{1,96}$/; placement prefixes the slot (s9-9:), so this length never truncates.
    assert([...ids].every(id => /^[\w:.-]+$/.test(id) && id.length <= 96 - 's9-9:'.length), part.id + ': a run id the engine would refuse or cut');
    for (const s of block.wallRuns.segments) {
      assert([...s.a, ...s.b].every(v => v >= .5 && v <= 22.5), `${part.id}: a run touches the block edge`);
      const length = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      assert(length >= .1 && length <= 64 && s.stories >= 1 && s.stories <= 5 && MATERIALS.includes(s.material));
    }
    for (let i = 0; i < 24; i++) assert(![block.terrain[0][i], block.terrain[23][i], block.terrain[i][0], block.terrain[i][23]].includes('floor'), part.id + ': floor on the block edge');
    assert(matchesPart(block, part, block.housePart.offset), part.id);
    for (let z = 1; z < block.levels; z++) assert.equal(Object.keys(block.upper[z - 1]).length, z <= part.storeys.count ? part.floorCells.reduce((n, [, a, b]) => n + b - a, 0) : 0);
  }
  for (const id of ['osm-way-547799531', parts.find(p => p.size.includes(23)).id, parts.find(p => p.size.includes(24)).id])
    assert.throws(() => toBlock(byId.get(id), 'x'), /does not fit a block: .* at most 22 x 22 m and 5 storeys/);
  assert.equal(BLOCK_MAX_M, BLOCK.size - 2);
  assert(flushWest(sample.block).wallRuns.segments.some(s => s.a[0] === -.5 || s.b[0] === -.5), 'the control sits on the edge');
  const stray = structuredClone(sample.part); stray.walls[0] = {...stray.walls[0], a: [-sample.block.housePart.offset[0], stray.walls[0].a[1]]};
  assert.throws(() => toBlock(stray, 'x'), /a wall would touch the block edge/);
  // No Mount Dora part reaches these limits, so they are pinned here.
  assert.equal(blockFits({...sample.part, storeys: {count: 5}}), true);
  assert.equal(blockFits({...sample.part, storeys: {count: 6}}), false, 'six storeys need seven levels; a block has six');
  assert.equal(toBlock({...sample.part, name: 'x'.repeat(70)}, 'x').name.length, 60, 'the engine takes names of 1 to 60 characters');
});

test('two blocks are the same house only with the same floors, levels and walls', () => {
  const {block} = sample, same = structuredClone(block);
  same.wallRuns.segments.forEach((s, i) => { s.id = 'placed-' + i; });
  assert(sameHouse(block, same), 'placement renames run ids');
  const variants = {
    'a ground cell': b => { b.terrain[b.housePart.offset[1]][b.housePart.offset[0]] = 'yard'; },
    'an upper floor': b => { b.upper[0] = {}; },
    'an extra level': b => { b.upper.push({'5,5': 'floor'}); },
    'a run start': b => { b.wallRuns.segments[0].a[0] += 1; },
    'a run end': b => { b.wallRuns.segments[0].b[1] += 1; },
    'a run storey': b => { b.wallRuns.segments[0].stories += 1; },
    'a run material': b => { b.wallRuns.segments[0].material = MATERIALS.find(m => m !== b.wallRuns.segments[0].material); },
    'a run dropped': b => { b.wallRuns.segments.pop(); },
    'a run raised a level': b => { b.wallRuns.segments[0].z += 1; },
    'a run moved a quarter metre': b => { b.wallRuns.segments[0].a[0] += .25; },
  };
  for (const [name, change] of Object.entries(variants)) { const b = structuredClone(block); change(b); assert(!sameHouse(block, b), name); }
  assert(matchesPart(block, sample.part, block.housePart.offset));
  for (const [name, change] of Object.entries({'a ground cell': variants['a ground cell'], 'an upper floor': variants['an upper floor'], 'a run end': variants['a run end'],
    'a run moved a quarter metre': variants['a run moved a quarter metre'], 'one storey short': b => { b.upper[sample.part.storeys.count - 1] = {}; }})) {
    const b = structuredClone(block); change(b); assert(!matchesPart(b, sample.part, block.housePart.offset), name);
  }
  // The control moves the whole house, upper floors too: it is the same house at another offset.
  assert(matchesPart(flushWest(block), sample.part, [0, block.housePart.offset[1]]));
});

test('the block review fails a house at the step it breaks', () => {
  // A stand-in engine: slots hold copies, and a quarter turn moves cell and point (x, y) to (23 - y, x) as the engine's does.
  const quarter = b => ({...structuredClone(b), terrain: b.terrain.map((row, y) => row.map((_, x) => b.terrain[23 - x][y])),
    upper: b.upper.map(level => Object.fromEntries(Object.entries(level).map(([key, v]) => { const [x, y] = key.split(',').map(Number); return [`${23 - y},${x}`, v]; }))),
    wallRuns: {...b.wallRuns, segments: b.wallRuns.segments.map(s => ({...s, a: [23 - s.a[1], s.a[0]], b: [23 - s.b[1], s.b[0]]}))}});
  assert(!sameHouse(sample.block, quarter(quarter(sample.block))), 'two quarter turns are not four');
  const engine = (change = {}) => ({validateBlock: b => b, openDocument: text => ({export: () => text}), blankMap: () => ({slots: {}}), validateMap: () => [],
    placeBlock: (map, block, x, y) => ({slots: {...map.slots, [x + ',' + y]: structuredClone(block)}}), extractBlock: (map, x, y) => structuredClone(map.slots[x + ',' + y]),
    rotateSceneryBlock: quarter, ...change});
  const one = [{id: sample.id, block: sample.block}], clean = reviewHeadless(engine(), one);
  assert.deepEqual(clean.failures, []);
  assert(Object.values(clean.counts).every(n => n === 1));
  const moved = b => { const c = structuredClone(b); c.wallRuns.segments[0].a[0] += 1; return c; };
  const cases = {
    'import changed source values': {openDocument: text => ({export: () => JSON.stringify({...JSON.parse(text), levels: 9})})},
    'placed map invalid': {validateMap: map => Object.keys(map.slots).length === 1 ? ['bad'] : []},
    'placed and extracted house differs': {extractBlock: (map, x, y) => moved(map.slots[x + ',' + y])},
    'A wall run crosses this block boundary': {placeBlock: (map, block, x, y) => { if (x === 3) throw Error('A wall run crosses this block boundary.'); return {slots: {...map.slots, [x + ',' + y]: block}}; }},
    'map with neighbours invalid': {validateMap: map => Object.keys(map.slots).length > 1 ? ['bad'] : []},
    'slot 5,4 did not capture the house back': {extractBlock: (map, x, y) => x === 5 ? moved(map.slots[x + ',' + y]) : structuredClone(map.slots[x + ',' + y])},
    'four quarter turns do not restore the house': {rotateSceneryBlock: moved},
  };
  for (const [message, change] of Object.entries(cases)) {
    const {failures} = reviewHeadless(engine(change), one);
    assert.equal(failures.length, 1, message);
    assert(failures[0].error.startsWith(message), `${message}: got ${failures[0].error}`);
  }
  // The edge control counts as refused only when the neighbour check refuses it.
  assert.equal(edgeControl(engine(), blocks).refusedByNeighbours, false);
  const strict = engine({placeBlock: (map, block, x, y) => {
    if (Object.keys(map.slots).length && map.slots[SLOT.join()].wallRuns.segments.some(s => s.a[0] === -.5 || s.b[0] === -.5)) throw Error('A wall run crosses this block boundary. Split the run.');
    return {slots: {...map.slots, [x + ',' + y]: structuredClone(block)}};
  }});
  const control = edgeControl(strict, blocks);
  assert(control.passedBeforeNeighbours && control.refusedByNeighbours, JSON.stringify(control));
  assert.deepEqual(reviewHeadless(strict, one).failures, [], 'the real block keeps off the edge');
  // Refused for another reason, or before the neighbours, the control proves nothing.
  assert.equal(edgeControl(engine({validateMap: map => Object.keys(map.slots).length > 1 ? ['bad'] : []}), blocks).refusedByNeighbours, false);
  const early = edgeControl(engine({placeBlock: (map, block, x, y) => {
    if (block.wallRuns.segments.some(s => s.a[0] === -.5 || s.b[0] === -.5)) throw Error('A wall run crosses this block boundary.');
    return {slots: {...map.slots, [x + ',' + y]: structuredClone(block)}};
  }}), blocks);
  assert.equal(early.passedBeforeNeighbours, false, JSON.stringify(early));
  const ok = {passedBeforeNeighbours: true, refusedByNeighbours: true};
  assert.equal(reviewPassed({failures: []}, ok), true);
  for (const [headless, edge] of [[{failures: [{id: 'x'}]}, ok], [{failures: []}, {...ok, refusedByNeighbours: false}], [{failures: []}, {...ok, passedBeforeNeighbours: false}]])
    assert.equal(reviewPassed(headless, edge), false);
  assert.deepEqual(mergeResults([{counts: {fit: 2, validated: 2}, nativeAddedPaths: ['b', 'a'], failures: [{id: 'z', error: 'e'}]},
    {counts: {fit: 3, validated: 1}, nativeAddedPaths: ['a'], failures: [{id: 'b', error: 'f'}]}]),
  {counts: {fit: 5, validated: 3}, nativeAddedPaths: ['a', 'b'], failures: [{id: 'b', error: 'f'}, {id: 'z', error: 'e'}]});
});

test('a block digest covers what the workshop reads, not the name or part provenance', () => {
  const {block} = sample, digest = blockDigest(block), copy = () => structuredClone(block);
  assert.equal(blockDigest({...copy(), name: 'Another name'}), digest);
  assert.equal(blockDigest({...copy(), housePart: {...block.housePart, sha256: 'other'}}), digest);
  // A house moved in the town keeps its shape but takes new run ids, perhaps in another order.
  const moved = copy(); moved.wallRuns.segments = moved.wallRuns.segments.map((s, i) => ({...s, id: 'wall-moved-' + i})).reverse();
  assert.equal(blockDigest(moved), digest);
  for (const change of [b => { b.wallRuns.segments[0].a[0] += 1; }, b => { b.terrain[1][1] = 'floor'; }, b => { b.levels += 1; b.upper.push({}); }]) {
    const b = copy(); change(b); assert.notEqual(blockDigest(b), digest);
  }
});

test('the workshop receipt covers the current blocks', () => {
  const receipt = JSON.parse(fs.readFileSync(RECEIPT, 'utf8')), digests = blockDigests(blocks);
  const changed = Object.keys(digests).filter(id => receipt.blocks?.[id] !== digests[id]), gone = Object.keys(receipt.blocks || {}).filter(id => !(id in digests));
  assert.deepEqual([changed, gone], [[], []], `blocks changed since the workshop check (${changed.slice(0, 5)}; gone ${gone.slice(0, 5)}): rerun review-house-part-blocks.mjs`);
  assert.equal(receipt.nautilusCommit, NAUTILUS_COMMIT, 'the receipt is from another workshop pin: rerun review-house-part-blocks.mjs');
  for (const count of Object.values(receipt.counts)) assert.equal(count, blocks.length);
  assert.deepEqual(Object.keys(receipt.counts), ['fit', 'validated', 'importedUnchanged', 'placedMapValid', 'placedAndExtractedUnchanged', 'neighboursPlaceAndCapture', 'quarterTurnsRestore']);
  assert.deepEqual(receipt.failures, []);
  assert.deepEqual([receipt.slot, receipt.neighbours], [SLOT, NEIGHBOURS]);
  assert(receipt.control.passedBeforeNeighbours && receipt.control.refusedByNeighbours, 'the edge-flush control must reach the neighbour check and fail it');
  assert.match(receipt.control.error, /crosses this block boundary/);
  assert.equal(receipt.browser?.passed, true, 'rerun with --browser');
  assert.equal(receipt.browser.nautilusCommit, NAUTILUS_COMMIT, 'the browser evidence is from another workshop pin');
  assert.deepEqual(receipt.browser.scenarios.map(s => [s.id, s.blockDigest]), BROWSER_SAMPLES.map(id => [id, digests[id]]), 'the browser checked other blocks');
  assert(receipt.browser.scenarios.every(s => s.importedUnchanged && s.savedToDesignLibrary && s.exportedMapValid && s.everySlotHoldsTheHouse && s.exportedHouseMatchesPart
    && JSON.stringify(s.placedInSlots) === JSON.stringify([SLOT, ...NEIGHBOURS])));
  // The only dialog the workshop may raise is its confirm before New map replaces the last house.
  assert(receipt.browser.scenarios.every(s => s.dialogsAccepted.every(d => d === 'A workspace has unsaved changes. Continue replacing a design?')), 'an unexpected dialog');
  assert.equal(keptBrowser(receipt.browser, blocks), receipt.browser);
  const other = blocks.map(b => b.id === BROWSER_SAMPLES[2] ? {...b, block: flushWest(b.block)} : b);
  assert.equal(keptBrowser(receipt.browser, other), null, 'changed blocks drop the browser evidence');
  const {scenarios} = receipt.browser;
  for (const [name, changed] of Object.entries({'another pin': {...receipt.browser, nautilusCommit: 'f'.repeat(40)}, 'the last sample missing': {...receipt.browser, scenarios: scenarios.slice(0, -1)},
    'samples reordered': {...receipt.browser, scenarios: [scenarios[1], scenarios[0], ...scenarios.slice(2)]}}))
    assert.equal(keptBrowser(changed, blocks), null, name);
  // The samples stay varied: a party wall, three or more storeys, a sector crossing and an L-shape.
  const samples = BROWSER_SAMPLES.map(id => byId.get(id));
  assert(samples.every(blockFits));
  assert(samples.some(p => p.walls.some(w => w.sharedWith.length)) && samples.some(p => p.storeys.count >= 3) && samples.some(p => p.storeys.count === 4));
  assert(samples.some(p => p.provenance.sectors.length > 1) && samples.some(p => p.walls.length >= 6 && p.storeys.count === 1));
});
