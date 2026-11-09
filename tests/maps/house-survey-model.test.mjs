// node --test tests/maps/house-survey-model.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {AHEAD_MS, BROKEN_MS, cleanAnswer, edgeKey, exportDocument, mergeAnswers, nearestEdge, newestPerId, outlineText, pinMismatches, queueEntries, stampAfter,
  staleEntrances, toggleEntrance, unitEdges, unknownAnswers,
  warningsFor} from '../../maps/mount-dora/reference/survey/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = file => JSON.parse(fs.readFileSync(path.join(root, 'maps/mount-dora', file), 'utf8'));
const features = json('features.json').features;
// A clock after every date these tests write, so none of them reads as dated ahead.
const LATER = Date.parse('2026-12-01T00:00:00.000Z');
const KEYS = ['stories', 'roofShape', 'confidence', 'imageryDate', 'entrances', 'note'];

const reference = json('reference/house-reference.json'), county = json('reference/county-buildings.json');
const queue = queueEntries(reference, county, features), entry = id => queue.find(b => b.id === id);

test('the queue holds every game building once: the OSM ones and the county ones, shaped alike', () => {
  assert.deepEqual(queue.map(b => b.id).sort(), features.filter(f => f.category === 'building').map(f => f.id).sort());
  // A county entry has a value for every field the page reads from a house-reference.json building.
  const fields = Object.keys(reference.buildings[0]);
  for (const b of queue.slice(reference.buildings.length)) {
    assert.deepEqual(fields.filter(k => b[k] === undefined), [], b.id);
    assert.ok(b.sectors.length && b.streetView && b.county.records && b.suggested && b.match.method === 'county-sketch' && b.countySketch.sketches >= 1, b.id);
  }
});

test('a county building warns that OSM lacks it, and to check it stands where the 2018 lidar saw no roof', () => {
  const lacks = /^OpenStreetMap lacks this building/, noRoof = /^The 2018 lidar saw no building roof here/;
  // A 1935 house on open ground in December 2018, with its camera on its own street.
  const open = warningsFor(entry('county-1475627-1'));
  assert.equal(open.length, 2, open.join(' | '));
  assert.match(open[0], lacks); assert.match(open[0], /from the county sketch\./); assert.match(open[1], noRoof);
  const roofed = queue.filter(b => b.countySketch?.lidarSaw === 'class-6 roof' && b.county.records.length && b.streetView.onAddressedStreet && b.streetView.distanceM <= 60);
  assert.ok(roofed.length > 90);
  for (const b of roofed) assert.deepEqual(warningsFor(b).map(w => lacks.test(w)), [true], b.id);
  const stacked = roofed.find(b => b.countySketch.sketches > 1);
  assert.match(warningsFor(stacked)[0], new RegExp(`from ${stacked.countySketch.sketches} county sketches\\.`));
  // Any building with no record says so, county or OSM, whatever its match method.
  const recordless = queue.filter(b => !b.county.records.length);
  assert.ok(recordless.some(b => b.countySketch) && recordless.some(b => b.match.method === 'footprint'), 'both kinds occur');
  for (const b of recordless) assert.match(warningsFor(b)[0], /^No county record/, b.id);
  for (const b of queue.filter(b => b.county.records.length)) assert.ok(!warningsFor(b).some(w => /^No county record/.test(w)), b.id);
  // The OSM buildings are unchanged: a clean footprint match on its own street warns of nothing.
  assert.deepEqual(warningsFor(queue.find(b => !b.countySketch && b.match.method === 'footprint' && b.streetView.onAddressedStreet && b.streetView.distanceM <= 60)), []);
});

test('an import names what it was exported against that has changed since', () => {
  const pins = {reference: 'r1', countyBuildings: 'c1', outlines: 'o1'};
  assert.deepEqual(pinMismatches({reference: {sha256: 'r1'}, countyBuildings: {sha256: 'c0'}, outlines: {sha256: 'o0'}}, pins),
    ['county-buildings.json', 'the building outlines in features.json']);
  assert.deepEqual(pinMismatches({reference: {sha256: 'r1'}}, pins), [], 'a version 2 export pins only house-reference.json');
  assert.deepEqual(pinMismatches({reference: {sha256: 'r0'}}, pins), ['house-reference.json']);
});

test('the outlines pin moves with a building outline, not with what the generator writes about it', () => {
  const pin = list => createHash('sha256').update(outlineText(list)).digest('hex'), base = pin(features);
  const copy = () => JSON.parse(JSON.stringify(features)), first = list => list.find(f => f.id === 'county-1475627-1');
  // The generator writes each survey answer into nativeProxy; that must not read as an outline change.
  const surveyed = copy(); first(surveyed).nativeProxy = {...first(surveyed).nativeProxy, stories: 2, evidence: {survey: {roofShape: 'hip'}}};
  assert.equal(pin(surveyed), base);
  const moved = copy(); first(moved).geometry.coordinates[0][0][0][0] += 1;
  assert.notEqual(pin(moved), base);
  const renamed = copy(); first(renamed).id = 'county-1475627-2';
  assert.notEqual(pin(renamed), base);
});

test('an answer for a building id the queue lacks is kept, exported and listed, never dropped', () => {
  const known = new Set(['osm-way-1', 'county-1-1']), at = t => `2026-11-0${t}T00:00:00.000Z`;
  // Export: every saved answer, the unknown id too; the generator lists it as lost.
  const doc = exportDocument({answers: {'osm-way-1': {stories: '1', at: at(1)}, 'county-9-9': {stories: '2', at: at(2)}}, pins: {}, keys: KEYS, exportedAt: at(3)});
  assert.deepEqual(Object.keys(doc.answers), ['county-9-9', 'osm-way-1']);
  // Import: a teammate's answer for an id this queue lacks is kept, and counted once; the newer answer wins.
  const merged = mergeAnswers({'osm-way-1': {stories: '2', at: at(5)}}, {answers: {'osm-way-1': {stories: '3', at: at(4)}, 'county-7-7': {stories: '1', at: at(4)}}}, KEYS, known, LATER);
  assert.deepEqual([merged.added, merged.unknown, merged.answers['osm-way-1'].stories, merged.answers['county-7-7'].stories], [1, 1, '2', '1']);
  // An answer with nothing in it never outranks one with content, however new it is.
  const empty = mergeAnswers({'county-1-1': {at: at(9)}}, {answers: {'county-1-1': {stories: '2', note: 'porch', at: at(1)}}}, KEYS, known, LATER);
  assert.deepEqual([empty.added, empty.answers['county-1-1'].stories], [1, '2']);
  // The page lists each unknown answer with what it holds.
  assert.deepEqual(unknownAnswers({...merged.answers, 'county-8-8': {note: 'gone', entrances: [{segment: [[0, 0], [1, 0]]}], at: at(4)}}, KEYS, known),
    [{id: 'county-7-7', holds: ['stories 1']}, {id: 'county-8-8', holds: ['1 entrance', 'a note']}]);
});

test('a cleared answer is a dated mark that outranks any older copy, from an import or another tab', () => {
  const known = new Set(['osm-way-1', 'osm-way-2']), at = t => `2026-11-0${t}T00:00:00.000Z`, gone = {cleared: true, at: at(5)};
  // Export: clearings go under `cleared`, never under `answers`.
  const doc = exportDocument({answers: {'osm-way-1': gone, 'osm-way-2': {stories: '1', at: at(2)}}, pins: {}, keys: KEYS, exportedAt: at(6)});
  assert.deepEqual([Object.keys(doc.answers), doc.cleared], [['osm-way-2'], {'osm-way-1': at(5)}]);
  assert.equal('cleared' in exportDocument({answers: {'osm-way-2': {stories: '1'}}, pins: {}, keys: KEYS, exportedAt: at(6)}), false);
  // Import of an older answer keeps the clearing; a newer answer replaces it; a newer clearing wins over an answer.
  assert.deepEqual(mergeAnswers({'osm-way-1': gone}, {answers: {'osm-way-1': {stories: '3', at: at(4)}}}, KEYS, known, LATER).answers['osm-way-1'], gone);
  assert.equal(mergeAnswers({'osm-way-1': gone}, {answers: {'osm-way-1': {stories: '3', at: at(7)}}}, KEYS, known, LATER).answers['osm-way-1'].stories, '3');
  const cleared = mergeAnswers({'osm-way-2': {stories: '1', at: at(2)}}, {answers: {}, cleared: {'osm-way-2': at(3), 'osm-way-1': 'never'}}, KEYS, known, LATER);
  assert.deepEqual([cleared.answers['osm-way-2'], cleared.cleared, 'osm-way-1' in cleared.answers], [{cleared: true, at: at(3)}, 1, false], 'a malformed clearing is ignored');
  // A clearing is not listed as an unknown answer.
  assert.deepEqual(unknownAnswers({'county-9-9': {cleared: true, at: at(1)}}, KEYS, known), []);
  // Between tabs, the newer copy per building wins, clearings included; a tie keeps this tab's.
  const merged = newestPerId({'osm-way-1': {stories: '2', at: at(3)}, 'osm-way-2': {stories: '4', at: at(9)}}, {'osm-way-1': gone, 'osm-way-2': {stories: '1', at: at(2)}});
  assert.deepEqual([merged['osm-way-1'], merged['osm-way-2'].stories], [gone, '4']);
  assert.equal(newestPerId({x: {stories: '1', at: at(1)}}, {x: {stories: '2', at: at(1)}}).x.stories, '2');
});

test('a local write is dated after the copy it replaces, whatever the clocks say', () => {
  const now = Date.parse('2026-11-04T12:00:00.000Z');
  assert.equal(stampAfter({at: '2026-11-04T11:00:00.000Z'}, now), '2026-11-04T12:00:00.000Z', 'an older copy: now');
  assert.equal(stampAfter({at: '2026-11-04T13:00:00.000Z'}, now), '2026-11-04T13:00:00.001Z', 'a copy from a fast clock: just after it');
  assert.equal(stampAfter({cleared: true, at: '2026-11-05T00:00:00.000Z'}, now), '2026-11-05T00:00:00.001Z', 'a clearing too');
  for (const previous of [undefined, {}, {at: 'never'}]) assert.equal(stampAfter(previous, now), '2026-11-04T12:00:00.000Z');
  // The written copy then outranks the one it replaced, on merge and between tabs.
  const ahead = {stories: '2', at: '2026-11-04T13:00:00.000Z'}, edit = {stories: '1', at: stampAfter(ahead, now)};
  assert.equal(newestPerId({x: ahead}, {x: edit}).x, edit);
  assert.equal(mergeAnswers({x: edit}, {answers: {x: ahead}}, KEYS, new Set(['x']), LATER).added, 0);
  // A clearing counts as clearing something only where there was an answer to clear.
  assert.equal(mergeAnswers({}, {answers: {}, cleared: {x: '2026-11-04T12:00:00.000Z'}}, KEYS, new Set(['x']), LATER).cleared, 0);
});

test('import reads every stamp as a date, never lets a copy dated ahead replace anything here, and says what it did', () => {
  const now = Date.parse('2026-11-04T12:00:00.000Z'), known = new Set(['a', 'b', 'c', 'd', 'e', 'f']);
  const mine = {a: {stories: '1', at: '2026-11-04T11:00:00.000Z'}, b: {stories: '1', at: '2026-11-04T11:00:00.000Z'}, c: {stories: '1', at: '2026-11-04T11:30:00.000Z'}};
  const ahead = now + AHEAD_MS + 1000;
  const result = mergeAnswers(mine, {answers: {
    a: {stories: '2', at: '2026-11-04T11:45:00+00:00'},           // newer, with an offset: replaces
    b: {stories: '2', at: new Date(ahead).toISOString()},           // dated ahead: never replaces what is here
    c: {stories: '2', at: '2026-11-04T11:00:00Z'},                  // older, with no milliseconds: not taken
    d: {stories: '2', at: ahead},                                   // dated ahead, an epoch number, nothing here: lands with its own stamp
    e: {stories: '2', at: 'never'},                                 // not a date: lands undated
    f: {stories: '2', at: '2026-11-04T11:59:30.000Z'}}}, KEYS, known, now);
  assert.deepEqual([result.replaced, result.older, result.keptAhead, result.ahead, result.broken], [['a'], ['c'], ['b'], 2, 0]);
  assert.deepEqual([result.answers.a.at, result.answers.b, result.answers.c, result.answers.d.at, 'at' in result.answers.e, result.answers.f.at],
    ['2026-11-04T11:45:00.000Z', mine.b, mine.c, new Date(ahead).toISOString(), false, '2026-11-04T11:59:30.000Z'], 'one stamp form throughout');
  // Compared as dates, a stamp without milliseconds is not mistaken for a newer one, and an undated copy outranks nothing.
  assert.equal(newestPerId({x: {stories: '1', at: '2026-11-04T11:00:00.500Z'}}, {x: {stories: '2', at: '2026-11-04T11:00:00Z'}}).x.stories, '1');
  assert.equal(newestPerId({x: {stories: '1', at: '2026-11-04T11:00:00.000Z'}}, {x: {stories: '2'}}).x.stories, '1');
  // An edit made on top of a copy dated ahead is dated after it, so it wins.
  const onTop = {stories: '9', at: stampAfter(result.answers.d, now)};
  assert.equal(newestPerId({x: result.answers.d}, {x: onTop}).x, onTop);
  // More than a day ahead, a clock is broken: the stamp is read as undated, so it cannot carry into later edits.
  const broken = mergeAnswers({}, {answers: {g: {stories: '2', at: now + BROKEN_MS + 1}}}, KEYS, new Set(['g']), now);
  assert.deepEqual([broken.broken, 'at' in broken.answers.g, stampAfter(broken.answers.g, now)], [1, false, new Date(now).toISOString()]);
  // An identical copy, as when importing the file just exported, changes nothing and is reported nowhere.
  const same = mergeAnswers(mine, {answers: {a: mine.a, b: mine.b}}, KEYS, known, now);
  assert.deepEqual([same.added, same.replaced, same.older, same.keptAhead], [0, [], [], []]);
});

test('two clocks, one ten minutes slow: an edit made on top of the other\'s answer keeps its order on both machines', () => {
  const known = new Set(['x']), real = t => Date.parse(`2026-11-04T12:${t}:00.000Z`), slow = ms => ms - 600000;
  // B (a right clock) answers at 12:00. A, whose clock runs ten minutes slow, imports at 12:01.
  const fromB = {answers: {x: {stories: '2', at: new Date(real('00')).toISOString()}}};
  const atA = mergeAnswers({}, fromB, KEYS, known, slow(real('01'))).answers;
  // A adds a note at 12:02 real (11:52 on A's clock), on top of B's answer.
  const edit = {stories: '2', note: 'gate', at: stampAfter(atA.x, slow(real('02')))};
  // B imports A's export: the note is newer, and it lands.
  const atB = mergeAnswers(fromB.answers, {answers: {x: edit}}, KEYS, known, real('03'));
  assert.deepEqual([atB.replaced, atB.answers.x.note], [['x'], 'gate']);
  // A imports B's file again: its own edit stays.
  assert.equal(mergeAnswers({x: edit}, fromB, KEYS, known, slow(real('04'))).answers.x.note, 'gate');
});

test('an entrance the outline has since lost is found, so it can be removed', () => {
  const edges = unitEdges([[[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]]]);
  const answer = {entrances: [{segment: [[1, 0], [2, 0]]}, {segment: [[9, 9], [9, 10]]}]};
  assert.deepEqual(staleEntrances(answer, edges).map(e => edgeKey(e.segment)), ['9,9:9,10']);
  assert.deepEqual(staleEntrances(undefined, edges), []);
  // A click near the stale edge finds it among the targets the page offers, and a toggle removes it.
  const hit = nearestEdge([...edges, ...staleEntrances(answer, edges).map(e => e.segment)], [9.2, 9.5], 1);
  assert.deepEqual(toggleEntrance(answer.entrances, hit.segment).map(e => edgeKey(e.segment)), ['1,0:2,0']);
});

test('authored outlines split into 1 m wall edges', () => {
  const lShape = [[[[0, 0], [3, 0], [3, 1], [1, 1], [1, 2], [0, 2], [0, 0]]]];
  const edges = unitEdges(lShape);
  assert.equal(edges.length, 10);
  for (const [a, b] of edges) assert.equal(Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]), 1);
  assert.equal(new Set(edges.map(edgeKey)).size, 10);
  assert.deepEqual(unitEdges([[[[0, 0], [2.5, 0], [2.5, 2], [0, 0]]]]), [], 'oblique or fractional runs carry no door edges');
});

test('every grid-aligned game building offers its whole perimeter for entrances', () => {
  let buildings = 0, partial = [];
  for (const f of features.filter(f => f.category === 'building')) {
    const perimeter = f.geometry.coordinates.flat().reduce((sum, ring) => sum + ring.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - ring[i][0], p[1] - ring[i][1]), 0), 0);
    const edges = unitEdges(f.geometry.coordinates).length;
    buildings++;
    if (Math.abs(edges - perimeter) > 1e-9) partial.push(f.id);
  }
  assert.equal(buildings, 950 + 126, '950 OSM outlines and 126 county buildings (reference/county-buildings.json)');
  assert.deepEqual(partial, [], `outlines that are not fully on the 1 m grid: ${partial.join(', ')}`);
});

test('a click snaps to the nearest edge, and only close to the outline', () => {
  const edges = unitEdges([[[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]]]);
  assert.equal(edgeKey(nearestEdge(edges, [2.4, -.3], 1).segment), '2,0:3,0');
  assert.equal(edgeKey(nearestEdge(edges, [4.2, 1.5], 1).segment), '4,1:4,2');
  assert.equal(nearestEdge(edges, [2, 2], 1), null, 'the middle of the floor is not a wall');
});

test('marking an edge twice removes it, and the list stays ordered', () => {
  const a = [[2, 0], [3, 0]], b = [[0, 1], [0, 2]];
  let list = toggleEntrance([], a);
  list = toggleEntrance(list, b);
  assert.deepEqual(list.map(e => edgeKey(e.segment)), ['0,1:0,2', '2,0:3,0']);
  assert.deepEqual(toggleEntrance(list, a).map(e => edgeKey(e.segment)), ['0,1:0,2']);
});

test('answers keep only valid evidence, and the export says what each field means', () => {
  assert.equal(cleanAnswer({stories: '', entrances: [], imageryDate: '03/2024', confidence: 'certain'}, KEYS), null);
  assert.deepEqual(cleanAnswer({stories: '2', imageryDate: '2024-03', confidence: 'likely', extra: 1}, KEYS), {stories: '2', confidence: 'likely', imageryDate: '2024-03'});
  const pins = {reference: 'abc', countyBuildings: 'def', outlines: 'ghi'};
  const doc = exportDocument({pins, keys: KEYS, exportedAt: '2026-11-03T00:00:00.000Z', answers: {
    'osm-way-2': {roofShape: 'hip', at: '2026-11-03T01:00:00.000Z'}, 'osm-way-1': {note: 'porch', at: 'x'}, 'osm-way-3': {stories: ''}, 'county-1-1': {stories: '2'}}});
  assert.equal(doc.version, 3);
  // The two files the queue came from, and the building outlines its entrance edges lie on.
  assert.deepEqual([doc.reference, doc.countyBuildings, doc.outlines], [{file: 'maps/mount-dora/reference/house-reference.json', sha256: 'abc'},
    {file: 'maps/mount-dora/reference/county-buildings.json', sha256: 'def'},
    {file: 'maps/mount-dora/features.json', fields: 'the id and authored geometry of every building', sha256: 'ghi'}]);
  assert.deepEqual(pinMismatches(doc, pins), [], 'an export matches what it was made from');
  assert.deepEqual(Object.keys(doc.answers), ['county-1-1', 'osm-way-1', 'osm-way-2']);
  assert.equal(doc.answers['osm-way-2'].at, '2026-11-03T01:00:00.000Z');
  for (const k of ['source', 'coordinates', 'observationDate', 'uncertainty', 'entrances', 'lost', 'cleared']) assert.ok(doc.evidence[k], k);
});
