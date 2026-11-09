// Checks every house-part block in the real Nautilus workshop at its pin and
// writes the receipt maps/mount-dora/parts/workshop.json.
//
// Headless, each block that fits goes through the pinned engine's own
// validateBlock, import (openDocument), placeBlock into a blank map,
// validateMap and extractBlock back. Copies then go into the four slots
// around it, every slot is captured back, and four quarter turns must restore
// it. A control built flush with the block edge must fail that neighbour check.
// With --browser it also drives the real workshop page in a headless browser
// for five houses: Import the block file, Save it to the design library,
// switch to the map workspace, Place it in a slot and its four neighbours,
// Export, and compares the exported map with the part.
//
//   node tools/maps/house-parts/review-house-part-blocks.mjs --source artifacts/mount-dora-workshop/nautilus-2502646 \
//     --git-source <read-only Nautilus repository> [--browser]
// Build the source first with tools/prepare-mount-dora-workshop.mjs (see maps/mount-dora/workshop/README.md).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {verifySource, sourceChanges, addedPaths} from '../../review-mount-dora-workshop.mjs';
import {reviewServer} from '../../serve-mount-dora-workshop.mjs';
import {NAUTILUS_COMMIT} from '../../../maps/mount-dora/workshop/model.js';
import {root, PARTS_DIR, BLOCK} from './house-parts.mjs';
import {allBlocks, blockText, blockDigest, blockDigests} from './export-block.mjs';

export const RECEIPT = path.join(root, PARTS_DIR, 'workshop.json');
// Five houses for the browser: an L-shaped one-storey gable house (221 S John
// St), a two-storey county-sketched building with 16 walls, the three-storey
// Shamrock Building with its party walls, the four-storey county building
// that is the tallest block, and a county house that crosses sectors in town.
export const BROWSER_SAMPLES = ['osm-way-1240415865', 'county-1464765-1', 'osm-way-558337885', 'county-1667917-1', 'county-2860049-1'];
export const SLOT = [4, 4], NEIGHBOURS = [[3, 4], [5, 4], [4, 3], [4, 5]];

// Wall runs as comparable geometry; placement renames ids to its destination.
const runGeometry = (runs, [dx, dy] = [0, 0]) => (runs || []).map(r => JSON.stringify([r.a[0] - dx, r.a[1] - dy, r.b[0] - dx, r.b[1] - dy, r.z, r.stories, r.material].map(v => typeof v === 'number' ? Number(v.toFixed(6)) : v))).sort();
const floors = (block, levels) => JSON.stringify({terrain: block.terrain, upper: Array.from({length: levels - 1}, (_, i) => Object.entries(block.upper[i] || {}).sort())});

// The same house in both blocks: ground, every upper level of the house and every wall run.
export function sameHouse(expected, actual) {
  return floors(expected, expected.levels) === floors(actual, expected.levels) && actual.upper.slice(expected.levels - 1).every(l => !Object.keys(l).length)
    && JSON.stringify(runGeometry(expected.wallRuns.segments)) === JSON.stringify(runGeometry(actual.wallRuns?.segments));
}

// The house moved flush against the block's west edge, as 67 blocks were
// before the 1 m margin: the negative control for the neighbour check.
export function flushWest(block) {
  const [ox] = block.housePart.offset, out = structuredClone(block);
  out.terrain = block.terrain.map(row => [...row.slice(ox), ...Array(ox).fill(BLOCK.ground)]);
  out.upper = block.upper.map(level => Object.fromEntries(Object.entries(level).map(([key, v]) => { const [x, y] = key.split(',').map(Number); return [`${x - ox},${y}`, v]; })));
  out.wallRuns.segments = block.wallRuns.segments.map(s => ({...s, a: [s.a[0] - ox, s.a[1]], b: [s.b[0] - ox, s.b[1]]}));
  out.housePart = {...block.housePart, offset: [0, block.housePart.offset[1]]};
  return out;
}

export function reviewHeadless(N, blocks) {
  const counts = {fit: blocks.length, validated: 0, importedUnchanged: 0, placedMapValid: 0, placedAndExtractedUnchanged: 0, neighboursPlaceAndCapture: 0, quarterTurnsRestore: 0};
  const failures = [], added = new Set();
  for (const {id, block} of blocks) {
    try {
      N.validateBlock(structuredClone(block)); counts.validated++;
      const normalized = JSON.parse(N.openDocument(blockText(block)).export());
      assert.deepEqual(sourceChanges(block, normalized), [], 'import changed source values');
      for (const p of addedPaths(block, normalized)) added.add(p);
      counts.importedUnchanged++;
      const placed = N.placeBlock(N.blankMap('House part check'), normalized, ...SLOT);
      assert.deepEqual(N.validateMap(placed, {connectivity: false}), [], 'placed map invalid');
      counts.placedMapValid++;
      assert(sameHouse(normalized, N.extractBlock(placed, ...SLOT)), 'placed and extracted house differs');
      counts.placedAndExtractedUnchanged++;
      // The house must not lock its neighbours: copies go into the four slots
      // around it, then every slot is captured back unchanged.
      let row = placed;
      for (const slot of NEIGHBOURS) row = N.placeBlock(row, normalized, ...slot);
      assert.deepEqual(N.validateMap(row, {connectivity: false}), [], 'map with neighbours invalid');
      for (const slot of [SLOT, ...NEIGHBOURS]) assert(sameHouse(normalized, N.extractBlock(row, ...slot)), 'slot ' + slot + ' did not capture the house back');
      counts.neighboursPlaceAndCapture++;
      let turned = normalized;
      for (let i = 0; i < 4; i++) turned = N.rotateSceneryBlock(turned);
      assert(sameHouse(normalized, turned), 'four quarter turns do not restore the house');
      counts.quarterTurnsRestore++;
    } catch (error) { failures.push({id, error: error.message}); }
  }
  return {counts, nativeAddedPaths: [...added].sort(), failures};
}

// The engine's rotation re-validates each block, about 5 s per house, so the
// blocks are shared round-robin between worker threads; results merge by id.
export async function reviewHeadlessParallel(source, blocks, threads = Math.max(1, Math.min(12, os.availableParallelism() - 2))) {
  const shares = Array.from({length: Math.min(threads, blocks.length)}, (_, i) => blocks.filter((_, j) => j % threads === i).map(b => b.id));
  const results = await Promise.all(shares.map(ids => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {workerData: {houseParts: true, source, ids}});
    worker.once('message', resolve); worker.once('error', reject);
    worker.once('exit', code => { if (code) reject(Error('Block review worker exited with ' + code)); });
  })));
  return mergeResults(results);
}

// The workers' results as one: counts summed, added paths and failures joined.
export function mergeResults(results) {
  const counts = Object.fromEntries(Object.keys(results[0].counts).map(k => [k, results.reduce((s, r) => s + r.counts[k], 0)]));
  return {counts, nativeAddedPaths: [...new Set(results.flatMap(r => r.nativeAddedPaths))].sort(),
    failures: results.flatMap(r => r.failures).sort((a, b) => a.id < b.id ? -1 : 1)};
}

// A review passes when no block failed and the edge control was refused at the neighbours.
export const reviewPassed = (headless, control) => !headless.failures.length && control.passedBeforeNeighbours && control.refusedByNeighbours;

if (!isMainThread && workerData?.houseParts) {
  const N = await import(pathToFileURL(path.join(workerData.source, 'packages/map-core/index.js')).href), wanted = new Set(workerData.ids);
  parentPort.postMessage(reviewHeadless(N, allBlocks().filter(b => wanted.has(b.id))));
}

// The control: the first browser sample flush with the west edge must pass
// every step before the neighbours and then be refused.
export function edgeControl(N, blocks) {
  const {id, block} = blocks.find(b => b.id === BROWSER_SAMPLES[0]), result = reviewHeadless(N, [{id, block: flushWest(block)}]);
  const {counts: c} = result, error = result.failures[0]?.error ?? null;
  return {id, change: 'the house moved flush against the west edge of its block', passedBeforeNeighbours: c.placedAndExtractedUnchanged === 1,
    refusedByNeighbours: c.neighboursPlaceAndCapture === 0 && /crosses this block boundary/.test(error ?? ''), error};
}

// The previous browser evidence still holds only for the same engine, the
// same samples and unchanged blocks; otherwise it is dropped and --browser
// must run again.
export function keptBrowser(previous, blocks) {
  const digests = blockDigests(blocks);
  const same = previous?.nautilusCommit === NAUTILUS_COMMIT && previous.scenarios?.length === BROWSER_SAMPLES.length
    && previous.scenarios.every((s, i) => s.id === BROWSER_SAMPLES[i] && s.blockDigest === digests[s.id]);
  return same ? previous : null;
}

export async function reviewBrowser(source, blocks, out) {
  const {chromium} = await import(pathToFileURL(path.join(root, 'sites/tactical-animal/browser-tests/node_modules/playwright/index.mjs')).href);
  const N = await import(pathToFileURL(path.join(source, 'packages/map-core/index.js')).href);
  const review = {report: {sourceMode: 'house-parts', nautilusCommit: NAUTILUS_COMMIT}, project: path.join(root, 'maps/mount-dora/project.json'), source, out};
  const evidence = {browser: null, scenarios: [], errors: []}, byId = new Map(blocks.map(b => [b.id, b]));
  let browser, context, server, deadline;
  try {
    server = await reviewServer(review);
    browser = await chromium.launch({headless: true, ...(process.env.WORKSHOP_BROWSER_CHANNEL ? {channel: process.env.WORKSHOP_BROWSER_CHANNEL} : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
    evidence.browser = {version: browser.version(), channel: process.env.WORKSHOP_BROWSER_CHANNEL || 'locked-playwright-chromium', headless: true, softwareWebGL: true};
    deadline = setTimeout(() => { browser.close().catch(() => {}); process.exitCode = 1; }, 30 * 60 * 1000); deadline.unref();
    context = await browser.newContext({viewport: {width: 1440, height: 1100}, acceptDownloads: true});
    const page = await context.newPage();
    page.on('pageerror', e => evidence.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') evidence.errors.push(m.text()); });
    await page.goto(server.url + '/nautilus/');
    await page.waitForFunction(() => window.nautilus?.document && !window.editor3d?.loading, null, {timeout: 90000});
    for (const id of BROWSER_SAMPLES) {
      const {block, part} = byId.get(id), file = path.join(out, id + '.block.json');
      fs.writeFileSync(file, blockText(block));
      evidence.scenarios.push(await browserScenario(page, N, {id, part, block, file, out}));
    }
    assert.deepEqual(evidence.errors, [], 'Browser errors');
    evidence.passed = true;
  } catch (error) { evidence.passed = false; evidence.failure = error.stack; throw error; }
  finally {
    clearTimeout(deadline);
    if (context) await context.close();
    if (browser) await browser.close();
    if (server) { await server.close(); evidence.portReleased = await new Promise(resolve => { const s = net.connect(server.port, '127.0.0.1'); s.once('connect', () => { s.destroy(); resolve(false); }); s.once('error', () => resolve(true)); }); }
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(evidence, null, 2) + '\n');
  }
  return evidence;
}

// The part's own cells and walls on every level, read back from a captured block.
export function matchesPart(extracted, part, [ox, oy]) {
  const cells = level => Object.keys(level).filter(k => level[k] === 'floor').map(k => { const [x, y] = k.split(',').map(Number); return `${x - ox},${y - oy}`; }).sort();
  const ground = [];
  for (let y = 0; y < BLOCK.size; y++) for (let x = 0; x < BLOCK.size; x++) if (extracted.terrain[y][x] === 'floor') ground.push(`${x - ox},${y - oy}`);
  const partCells = part.floorCells.flatMap(([y, x0, x1]) => Array.from({length: x1 - x0}, (_, i) => `${x0 + i},${y}`)).sort();
  const levelsMatch = extracted.upper.every((level, i) => JSON.stringify(cells(level)) === JSON.stringify(i < part.storeys.count ? partCells : []));
  const walls = JSON.stringify(runGeometry(extracted.wallRuns?.segments, [ox - .5, oy - .5]))
    === JSON.stringify(runGeometry(part.walls.map(w => ({...w, z: 0, stories: part.storeys.count, material: part.material.wall}))));
  return JSON.stringify(ground.sort()) === JSON.stringify(partCells) && extracted.upper.length >= part.storeys.count && levelsMatch && walls;
}

// One house through the real controls, all in the workshop's Settings dialog:
// New map, Import, Save, back to the map workspace, Place selected block in a
// slot and its four neighbours, Export.
async function browserScenario(page, N, {id, part, block, file, out}) {
  const dialogs = [], accept = dialog => { dialogs.push(dialog.message()); dialog.accept(); };
  const settings = async () => { if (!await page.locator('#editor-settings').evaluate(d => d.open)) await page.locator('#settings-button').click(); };
  const settled = (test, arg) => page.waitForFunction(test, arg, {timeout: 60000});
  const status = () => page.locator('#status').textContent();
  page.on('dialog', accept);
  try {
    await settings();
    await page.locator('#workspace').selectOption('map');
    await settled(() => !window.nautilus.document.block && !window.editor3d.loading);
    await page.evaluate(() => { window.__housePartBefore = window.nautilus.document; });
    await page.locator('#new-map').click();
    await settled(() => window.nautilus.document !== window.__housePartBefore && window.nautilus.document.map.name === 'New design' && !window.editor3d.loading);
    // The block arrives through the workshop's own file input, as a person imports it.
    await page.evaluate(() => { window.__housePartBefore = window.nautilus.document; });
    await page.locator('#import').setInputFiles(file);
    await settled(name => window.nautilus.document !== window.__housePartBefore && window.nautilus.document.block && window.nautilus.document.map.name === name && !window.editor3d.loading, block.name);
    const imported = JSON.parse(await page.evaluate(() => window.nautilus.export()));
    assert.deepEqual(sourceChanges(block, imported), [], 'Workshop import changed the block');
    await page.locator('#save-map').click();
    await settled(() => document.getElementById('saved-designs').value && /^Saved in this browser/.test(document.getElementById('status').textContent));
    const saved = await page.locator('#saved-designs').inputValue();
    await page.locator('#workspace').selectOption('map');
    await settled(() => !window.nautilus.document.block && window.nautilus.document.map.name === 'New design' && !window.editor3d.loading);
    await page.locator('#saved-designs').selectOption(saved);
    // The status text is the same for every placement, so it is cleared first.
    for (const slot of [SLOT, ...NEIGHBOURS]) {
      await page.locator('#sector-x').fill(String(slot[0] + 1));
      await page.locator('#sector-y').fill(String(slot[1] + 1));
      await page.evaluate(() => { document.getElementById('status').textContent = ''; });
      await page.locator('#place-block').click();
      await settled(() => document.getElementById('status').textContent && !window.editor3d.loading);
      assert.match(await status(), /^Block placed/, `Place selected block in slot ${slot} did not place: ` + await status());
    }
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
    const exportedFile = path.join(out, id + '-placed.map.json');
    await download.saveAs(exportedFile);
    const map = JSON.parse(fs.readFileSync(exportedFile, 'utf8'));
    assert.deepEqual(N.validateMap(map, {connectivity: false}), [], 'The exported map does not validate');
    for (const slot of [SLOT, ...NEIGHBOURS]) assert(sameHouse(imported, N.extractBlock(map, ...slot)), `The house in slot ${slot} of the exported map differs from the block`);
    // Back from block coordinates to the part's own frame: the same cells on every level, and the same walls.
    assert(matchesPart(N.extractBlock(map, ...SLOT), part, block.housePart.offset), 'The exported house is not the part');
    await page.locator('#close-settings').click();
    const centre = [SLOT[0] * 24 + 12, SLOT[1] * 24 + 12];
    await page.evaluate(async c => { const e = window.editor3d; Object.assign(e.view, {x: c[0], y: c[1], span: 74, preset: '0'}); e.scene.changed(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, centre);
    const screenshot = path.join(out, id + '-placed.png');
    await page.locator('#scene').screenshot({path: screenshot});
    return {id, blockDigest: blockDigest(block), size: part.size, storeys: part.storeys.count, walls: part.walls.length, sharedWallsInTown: part.walls.some(w => w.sharedWith.length),
      crossesSectorsInTown: part.provenance.sectors.length > 1, importedUnchanged: true, savedToDesignLibrary: true, placedInSlots: [SLOT, ...NEIGHBOURS],
      exportedMapValid: true, everySlotHoldsTheHouse: true, exportedHouseMatchesPart: true, dialogsAccepted: dialogs};
  } finally { page.off('dialog', accept); }
}

if (isMainThread && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = flag => { const i = args.indexOf(flag); return i >= 0 ? path.resolve(args[i + 1]) : null; };
  const source = value('--source'), gitSource = value('--git-source') || source, out = path.join(root, 'artifacts/house-parts/workshop');
  if (!source) throw Error('Supply --source, an immutable Nautilus snapshot at ' + NAUTILUS_COMMIT);
  const provenance = verifySource(source, gitSource);
  const blocks = allBlocks(), headless = await reviewHeadlessParallel(source, blocks);
  const control = edgeControl(await import(pathToFileURL(path.join(source, 'packages/map-core/index.js')).href), blocks);
  fs.mkdirSync(out, {recursive: true});
  const previous = fs.existsSync(RECEIPT) ? JSON.parse(fs.readFileSync(RECEIPT, 'utf8')) : null;
  const ran = args.includes('--browser') ? await reviewBrowser(source, blocks, out) : null;
  const browser = ran ? {passed: ran.passed, nautilusCommit: NAUTILUS_COMMIT, browser: ran.browser, portReleased: ran.portReleased, scenarios: ran.scenarios} : keptBrowser(previous?.browser, blocks);
  if (!ran && !browser) console.warn('The browser evidence no longer matches this engine or these blocks and was dropped; rerun with --browser.');
  const receipt = {kind: 'house-part-workshop-receipt', version: 1, nautilusCommit: NAUTILUS_COMMIT, source: provenance, slot: SLOT, neighbours: NEIGHBOURS,
    ...headless, control, browser, blocks: blockDigests(blocks)};
  fs.writeFileSync(RECEIPT, JSON.stringify(receipt, null, 1) + '\n');
  console.log(JSON.stringify({counts: headless.counts, failures: headless.failures.slice(0, 5), control, browser: browser?.passed ?? 'not run'}, null, 1));
  if (!reviewPassed(headless, control)) process.exitCode = 1;
}
