// node --test tests/maps/county-buildings.test.mjs
// County-sketched buildings the game lacks, placed on their lidar roofs
// (tools/maps/lidar/county-buildings.mjs, written by build-lidar.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {area, bounds, centroid, contains, nearestOnPolyline} from '../../tools/maps/house-reference/geometry.mjs';
import {featuresPin, isOsm} from '../../tools/maps/house-reference/features-digest.mjs';
import {createProjection, headingDegrees} from '../../tools/maps/house-reference/projection.mjs';
import {planStreetView, VIEW_RADIUS_M, viewRoads} from '../../tools/maps/house-reference/viewpoint.mjs';
import {close, PLACE, placeCountyBuildings, register, samples, traceRaster, unionOutline} from '../../tools/maps/lidar/county-buildings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const town = path.join(root, 'maps/mount-dora');
const json = file => JSON.parse(fs.readFileSync(path.join(town, file), 'utf8'));
const hash = file => createHash('sha256').update(fs.readFileSync(path.join(town, file))).digest('hex');
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const turn = (ring, deg, [cx, cy]) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return ring.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]); };

test('the union outline merges overlapping units, keeps courtyards, closes hairline gaps and never joins corner-touching cells', () => {
  const a = turn(rect(95, 95, 105, 101), 30, [100, 100]), b = turn(rect(95, 99, 105, 105), 30, [100, 100]);
  const stacked = unionOutline([[a], [b]]);
  assert.equal(stacked.geometry.length, 1);
  assert.equal(stacked.geometry[0][0].length - 1, 4, 'two overlapping 30-degree units are one rectangle');
  assert.ok(Math.abs(area(stacked.geometry) - 100) < .5);
  assert.equal(stacked.angleDeg, 30);
  const yard = unionOutline([[rect(0, 0, 20, 20), rect(5, 5, 15, 15).reverse()]]);
  assert.deepEqual([yard.geometry.length, yard.geometry[0].length], [1, 2]);
  assert.ok(Math.abs(area(yard.geometry) - 300) < .5);
  const gap = unionOutline([[rect(0, 0, 10, 10)], [rect(10.3, 0, 20, 10)]]);
  assert.equal(gap.geometry.length, 1, `a gap under ${PLACE.touchM} m closes`);
  assert.equal(unionOutline([[rect(0, 0, 10, 10)], [rect(10.8, 0, 20, 10)]]).geometry.length, 2, 'a wider gap stays open');
  assert.equal(traceRaster(new Uint8Array([1, 0, 0, 1]), 2, 2).length, 2, 'diagonal cells trace as two rings');
  // Closing bridges a one-cell gap on a padded mask (unionOutline pads by more than the radius).
  const gapMask = new Uint8Array(7 * 5); gapMask[2 * 7 + 2] = gapMask[2 * 7 + 4] = 1;
  assert.deepEqual([...close(gapMask, 7, 5, 1)].flatMap((v, i) => v ? [i] : []), [2 * 7 + 2, 2 * 7 + 3, 2 * 7 + 4]);
  const cut = unionOutline([[rect(0, 0, 20, 10)]], {exclude: ([x]) => x > 10});
  assert.ok(Math.abs(area(cut.geometry) - 100) < .5);
});

// A 100 m x 100 m test town on the 0.5 m roof lattice.
const lattice = roofs => {
  const cell = PLACE.cellM, w = 200, h = 200, occ = new Uint8Array(w * h);
  for (const [x0, y0, x1, y1] of roofs) for (let j = y0 / cell; j < y1 / cell; j++) for (let i = x0 / cell; i < x1 / cell; i++) occ[j * w + i] = 1;
  return {occ, w, h, box: [0, 0, 100, 100], cell};
};

test('registration finds the shift onto the roof, and stays put over open ground', () => {
  const grid = lattice([[40, 10, 50, 20]]);
  assert.deepEqual(register(samples([[rect(41.5, 11, 51.5, 21)]]), grid, {dx: 0, dy: 0}), {dx: -1.5, dy: -1, share: 1});
  // The base (OSM frame to lidar frame) is added to the search, not returned.
  assert.deepEqual(register(samples([[rect(41.5, 11, 51.5, 21)]]), grid, {dx: .5, dy: 0}), {dx: -2, dy: -1, share: 1});
  assert.deepEqual(register(samples([[rect(70, 70, 80, 80)]]), grid, {dx: 0, dy: 0}), {dx: 0, dy: 0, share: 0}, 'negative control');
});

const sketch = (altKey, polygons, stories = 1) => ({altKey, bldgNum: '1', areaM2: area(polygons), geometry: polygons, record: {style: 'SINGLE FAMILY RESIDENTIAL'},
  address: `${altKey.charCodeAt(0)} TEST ST`, placeName: null, parcel: {altKey, landUse: 'SINGLE FAMILY', buildings: 1},
  county: {records: [{altKey, bldgNum: '1', stories: String(stories)}], lotExtras: []}, suggested: {stories, halfStory: false, storiesSource: `county:STORIES ${stories}`}});

test('each county sketch is added once, merged with its structure, or found already in the game', () => {
  const games = [{id: 'osm-way-1', geometry: [[rect(10, 10, 20, 20)]], box: [10, 10, 20, 20]},
    {id: 'osm-way-2', geometry: [[rect(60, 60, 80, 70)]], box: [60, 60, 80, 70]}];
  const grid = lattice([[10, 10, 20, 20], [40, 10, 50, 20], [86, 86, 95, 95]]);
  const sketches = [
    sketch('A', [[rect(41.5, 11, 51.5, 21)]], 2),         // a missing house, drawn 1.8 m off its roof
    {...sketch('B', [[rect(41.5, 11, 51.5, 21)]]), areaM2: 101}, // a second unit stacked on it, recorded larger
    sketch('D', [[rect(70, 68, 78, 78)]]),                // no roof; 20% over osm-way-2: a drawing of part of it
    sketch('E', [[rect(11, 11, 19, 19)]]),                // its record is held by osm-way-1, which it overlaps
    sketch('F', [[rect(30, 60, 38, 66)]]),                // open ground: kept on the county record alone
    sketch('H', [[rect(86, 86, 90, 90)], [rect(90, 90, 95, 95)]]), // two parts meeting at a corner
  ];
  const {buildings, represented} = placeCountyBuildings({sketches, holders: new Map([['E/1', 'osm-way-1']]), games, grid, base: {dx: 0, dy: 0}});
  assert.deepEqual(buildings.map(b => b.id), ['county-A-1', 'county-F-1', 'county-H-1', 'county-H-1-part2']);
  const house = buildings[0];
  assert.deepEqual(house.members.map(m => m.key), ['A/1', 'B/1']);
  assert.ok(Math.abs(area(house.geometry) - 100) < .5, 'the stacked units are one 10 m x 10 m outline');
  assert.ok(contains(house.geometry, [45, 15]) && !contains(house.geometry, [50.5, 20.5]), 'placed on the roof, not where drawn');
  assert.equal(house.county.suggested.stories, 2, 'the tallest record (A) gives the storeys');
  assert.equal(house.lot.address, '66 TEST ST', 'the largest sketch with a record (B) gives the lot and address');
  assert.equal(buildings[1].roofShare, 0);
  assert.deepEqual(buildings.slice(2).map(b => b.piece.of), [2, 2]);
  assert.deepEqual(buildings.slice(2).map(b => b.lot.address), ['72 TEST ST', '72 TEST ST'], 'both pieces keep their sketch\'s lot');
  assert.deepEqual(represented.map(r => [r.key, r.by]), [['D/1', ['osm-way-2']], ['E/1', ['osm-way-1']]]);
  assert.match(represented[0].reason, /no lidar roof/);
  assert.match(represented[1].reason, /record held/);
});

const county = json('reference/county-buildings.json'), houseRef = json('reference/house-reference.json');
const features = json('features.json').features;

test('county-buildings.json is current with its inputs and accounts for every county-only sketch once', () => {
  assert.deepEqual(county.inputs.features, featuresPin(fs.readFileSync(path.join(town, 'features.json'))));
  assert.equal(county.inputs.houseReference.sha256, hash('reference/house-reference.json'));
  assert.equal(county.inputs.lidar.sha256, hash('reference/lidar/source.json'));
  assert.deepEqual(county.method.place, PLACE);
  const seen = [...county.buildings.filter(b => !b.piece || b.piece.index === 1).flatMap(b => b.members.map(m => m.key)), ...county.represented.map(r => r.key)].sort();
  assert.deepEqual(seen, houseRef.countyOnly.map(c => `${c.altKey}/${c.bldgNum}`).sort());
  assert.equal(new Set(county.buildings.map(b => b.id)).size, county.buildings.length);
  assert.equal(county.metrics.buildings, county.buildings.length);
});

test('every county building is in the town once, off the game buildings, with its county and lidar evidence', () => {
  const osm = features.filter(f => f.category === 'building' && isOsm(f));
  const byId = new Map(features.map(f => [f.id, f]));
  for (const b of county.buildings) {
    const f = byId.get(b.id);
    assert.ok(f && f.category === 'building' && f.county, b.id);
    assert.deepEqual(f.geographicGeometry, b.geometry, b.id);
    assert.deepEqual(f.county.sketches, b.members.map(m => m.key), b.id);
    assert.equal(f.nativeProxy.evidence.lidar.eaveM, b.lidar.eaveM, b.id);
    assert.ok(f.nativeProxy.stories >= 1 && f.nativeProxy.stories <= 5, b.id);
    assert.ok(b.roofShare >= 0 && b.roofShare <= 1, b.id);
    // Clipped against the game outlines: under 2% of the outline lies inside one.
    const pts = samples(b.geometry.coordinates);
    let inside = 0;
    for (let k = 0; k < pts.length; k += 2) if (osm.some(g => contains(g.geographicGeometry.coordinates, [pts[k], pts[k + 1]]))) inside++;
    assert.ok(inside / (pts.length / 2) < .02, `${b.id} lies ${inside} cells inside game buildings`);
  }
  assert.equal(features.filter(f => f.county).length, county.buildings.length);
  // Most stand on a building-class roof; the rest say what the lidar saw instead.
  assert.ok(county.buildings.filter(b => b.lidarSaw === 'class-6 roof').length >= .9 * county.buildings.length);
});

// The survey camera needs no lidar, so this checks it where the lidar cache is absent (the
// workshop job in CI). The rule itself is tested on a synthetic street in house-reference.test.mjs.
test('every county building has the survey camera the shared planner gives it, facing it from its road', () => {
  const {toLatLon} = createProjection(json('project.json').projection), view = viewRoads(features);
  const roads = new Map(features.filter(f => f.category === 'road').map(f => [f.id, f.geometry.coordinates]));
  const sketches = new Map(houseRef.countyOnly.map(c => [`${c.altKey}/${c.bldgNum}`, c])), keyOf = c => `${c.altKey}/${c.bldgNum}`;
  for (const b of county.buildings) {
    // The lot and address are the lead sketch's: the largest with a record, then the first by key.
    const members = b.members.map(m => sketches.get(m.key));
    const lead = members.filter(c => c.county.records.length).sort((p, q) => q.areaM2 - p.areaM2 || keyOf(p).localeCompare(keyOf(q)))[0] ?? members[0];
    assert.deepEqual([b.address, b.placeName, b.parcel], [lead.address, lead.placeName, lead.parcel], b.id);
    const mp = b.geometry.coordinates, centre = centroid(mp), sv = b.streetView;
    assert.deepEqual(sv, planStreetView(view, {geometry: mp, box: bounds(mp), centre},
      {stories: b.county.suggested.stories ?? b.lidar.storeysFromLidar, address: b.address}, toLatLon), `${b.id} camera is stale`);
    assert.ok(sv && sv.distanceM <= VIEW_RADIUS_M, b.id);
    assert.ok(nearestOnPolyline(roads.get(sv.roadId), sv.town).distance < .02, `${b.id} camera is off ${sv.roadId}`);
    assert.ok(Math.abs(Math.hypot(sv.town[0] - centre[0], sv.town[1] - centre[1]) - sv.distanceM) < .1, b.id);
    const turn = Math.abs(((sv.heading - headingDegrees(sv.town, centre)) % 360 + 540) % 360 - 180);
    assert.ok(turn <= 1, `${b.id} camera faces ${turn}° away from the building`);
    assert.match(b.aerialUrl, /^https:\/\/www\.google\.com\/maps\/@\?api=1&map_action=map&center=-?\d+\.\d{6},-?\d+\.\d{6}&zoom=20&basemap=satellite$/);
  }
  assert.ok(county.metrics.onAddressedStreet >= .8 * county.buildings.length, `${county.metrics.onAddressedStreet} on the addressed street`);
});
