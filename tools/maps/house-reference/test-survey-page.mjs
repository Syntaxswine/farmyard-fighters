// Headless checks of the house survey page (maps/mount-dora/reference/survey/),
// driven through its own controls in Chromium: status messages reach the status
// line, nothing writes before the reference loads (a failed load or a slow one),
// a cleared or dropped answer stays cleared through an import of an older file,
// a stale tab's save keeps another tab's answers, and an answer for an unknown
// building id is listed, exported and kept.
//
//   node tools/maps/house-reference/test-survey-page.mjs
// Needs the browser-test dependencies (npm ci --prefix sites/tactical-animal/browser-tests,
// then npx playwright install chromium there), as the workshop job installs them.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const {chromium} = await import(pathToFileURL(path.join(root, 'sites/tactical-animal/browser-tests/node_modules/playwright/index.mjs')).href);
const STORE = 'mount-dora-house-survey-v1', HOUSE = 'county-1475627-1', OTHER = 'county-1082536-1', THIRD = 'county-1468612-1', GONE = 'county-0000000-9';
const old = t => `2026-11-0${t}T00:00:00.000Z`;

// The repository's read-only survey server, on a free port; stopped by PID at the end.
const server = spawn(process.execPath, [path.join(root, 'tools/maps/house-reference/serve.mjs'), '0', '--minutes', '10'], {stdio: ['ignore', 'pipe', 'inherit']});
const base = await new Promise((resolve, reject) => {
  server.stdout.on('data', d => { const m = String(d).match(/http:\/\/127\.0\.0\.1:(\d+)\//); if (m) resolve(`http://127.0.0.1:${m[1]}/reference/survey/`); });
  server.on('exit', code => reject(Error(`the survey server exited (${code})`)));
});

const loaded = page => page.waitForFunction(() => document.querySelectorAll('#queue li').length > 0);
const statusLine = page => page.textContent('p#status');
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), STORE);
const seed = (page, answers) => page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE, JSON.stringify(answers)]);
// Every page a scenario opens reports its uncaught errors here; any one fails the scenario.
let pageErrors = [];
const watch = page => { page.on('pageerror', error => pageErrors.push(error.message)); page.on('dialog', dialog => dialog.accept()); return page; };
const open = async (context, answers) => {
  const page = watch(await context.newPage());
  await page.goto(base);
  if (answers) { await seed(page, answers); await page.reload(); }
  return page;
};
const answerStoreys = async (page, id) => {
  await page.click(`#queue button[data-id="${id}"]`);
  await page.locator('#fields fieldset').first().locator('button').first().click();
};
const exportFile = async page => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  return JSON.parse(await fs.readFile(await download.path(), 'utf8'));
};
// Waits for the import's own message: clear the status line first, so an earlier one cannot satisfy it.
const importFile = async (page, doc, expect = '^(Imported|Import failed)') => {
  await page.evaluate(() => { document.querySelector('p#status').textContent = ''; });
  await page.setInputFiles('#import', {name: 'house-survey.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc))});
  await page.waitForFunction(source => new RegExp(source).test(document.querySelector('p#status').textContent), expect);
};
// The button for an option of a field: fields in FIELDS order (0 storeys, 1 roof shape, 3 walls).
const option = (page, field, text) => page.locator('#fields fieldset').nth(field).locator('button', {hasText: new RegExp(`^${text}`)});  // "Sure", not "Unsure"
const pressed = (page, field, text) => page.waitForFunction(([n, t]) => [...document.querySelectorAll('#fields fieldset')[n].querySelectorAll('button')]
  .some(b => b.textContent.includes(t) && b.getAttribute('aria-pressed') === 'true'), [field, text]);
// A real click on the mini-map at a town point: the midpoint of a building's first outline edge lies on one of its 1 m edges.
const town = JSON.parse(await fs.readFile(path.join(root, 'maps/mount-dora/features.json'), 'utf8')).features;
const edgeMid = id => { const [a, b] = town.find(f => f.id === id).geometry.coordinates[0][0]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
const clickTown = async (page, [x, y]) => {
  await page.locator('#minimap').scrollIntoViewIfNeeded();   // a real click needs the map on screen
  const at = await page.evaluate(([x, y]) => { const svg = document.getElementById('minimap'), p = svg.createSVGPoint(); p.x = x; p.y = y;
    const c = p.matrixTransform(svg.getScreenCTM()); return [c.x, c.y]; }, [x, y]);
  await page.mouse.click(at[0], at[1]);
};

const browser = await chromium.launch({headless: true});
let passed = 0;
const scenario = async (name, run) => {
  const context = await browser.newContext({acceptDownloads: true});
  pageErrors = [];
  try {
    await run(context);
    assert.deepEqual(pageErrors, [], `uncaught page errors in "${name}"`);
    passed++; console.log(`ok - ${name}`);
  } finally { await context.close(); }
};
try {
  await scenario('status messages reach the status line, and the Show filter keeps its options', async context => {
    const page = await open(context); await loaded(page);
    await answerStoreys(page, HOUSE);
    await exportFile(page);
    assert.match(await statusLine(page), /^Exported 1 answer/);
    assert.deepEqual(await page.$eval('#show', s => [s.options.length, s.value]), [3, 'todo']);
  });

  await scenario('until the reference loads, no control writes: a failed load, then a slow one', async context => {
    const saved = {'osm-way-1': {stories: '2', at: old(1)}, 'osm-way-2': {wall: 'brick', at: old(1)}, 'osm-way-3': {note: 'porch', at: old(1)}};
    await context.route('**/county-buildings.json', route => route.fulfill({status: 404, body: ''}));
    const page = await open(context, saved);
    await page.waitForFunction(() => /^Could not load/.test(document.getElementById('summary').textContent));
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.click('#clear');
    await page.fill('#note', 'typed before load'); await page.dispatchEvent('#note', 'change');
    await page.fill('#imagery', '2024-03'); await page.dispatchEvent('#imagery', 'change');
    await page.locator('body').press('1');
    await importFile(page, {kind: 'mount-dora-house-survey', version: 3, answers: {'osm-way-9': {stories: '1', at: old(4)}}}, 'export and import are off');
    await page.click('#export');
    assert.deepEqual(await stored(page), saved, 'a failed load leaves the saved answers as they were');
    assert.equal(downloads, 0);
    assert.match(await statusLine(page), /has not loaded/);
    // A slow load: features.json arrives after the person has typed a date.
    await context.unroute('**/county-buildings.json');
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await context.route('**/features.json', async route => { await held; await route.continue(); });
    await page.reload();
    await page.click('#clear');
    await page.fill('#note', 'typed while loading'); await page.dispatchEvent('#note', 'change');
    await page.fill('#imagery', '2024-04'); await page.dispatchEvent('#imagery', 'change');
    await page.locator('body').press('2');
    await importFile(page, {kind: 'mount-dora-house-survey', version: 3, answers: {'osm-way-8': {stories: '1', at: old(4)}}}, 'export and import are off');
    await page.click('#export');
    assert.deepEqual(await stored(page), saved, 'nothing written while loading');
    assert.equal(downloads, 0);
    release(); await loaded(page);
    assert.deepEqual(await stored(page), saved, 'nor afterwards, from what was typed while loading');
  });

  await scenario('a cleared or dropped answer stays cleared through an import of an older export', async context => {
    const page = await open(context, {[GONE]: {stories: '2', note: 'moved?', at: old(1)}}); await loaded(page);
    await answerStoreys(page, HOUSE);
    const committed = await exportFile(page);
    assert.deepEqual(Object.keys(committed.answers).sort(), [GONE, HOUSE].sort());
    await page.click('#clear');
    await page.locator('#unknown div', {hasText: GONE}).locator('button').click();
    assert.equal(await page.isHidden('#unknown'), true, 'the dropped answer leaves the panel');
    await importFile(page, committed);
    const after = await stored(page);
    assert.deepEqual([after[HOUSE].cleared, after[GONE].cleared], [true, true], 'the older answers do not come back');
    assert.equal(await page.isHidden('#unknown'), true);
    const next = await exportFile(page);
    assert.equal(HOUSE in next.answers || GONE in next.answers, false);
    assert.deepEqual(Object.keys(next.cleared).sort(), [GONE, HOUSE].sort());
    // A newer answer does replace a clearing (a genuinely newer one: a copy dated ahead never replaces anything here).
    await importFile(page, {kind: 'mount-dora-house-survey', version: 3, answers: {[HOUSE]: {stories: '2', at: new Date().toISOString()}}});
    assert.equal((await stored(page))[HOUSE].stories, '2');
  });

  await scenario('a stale tab\'s save keeps the answers another tab saved since', async context => {
    const first = await open(context), second = watch(await context.newPage());
    await second.goto(base); await loaded(first); await loaded(second);
    await answerStoreys(first, HOUSE);
    await answerStoreys(second, OTHER);
    const after = await stored(second);
    assert.ok(after[HOUSE]?.stories && after[OTHER]?.stories, JSON.stringify(after));
  });

  await scenario('two tabs on one building: each change builds on the other\'s, a clearing stays cleared, and both show it', async context => {
    const first = await open(context), second = watch(await context.newPage());
    await second.goto(base); await loaded(first); await loaded(second);
    await first.click(`#queue button[data-id="${HOUSE}"]`); await second.click(`#queue button[data-id="${HOUSE}"]`);
    await option(first, 1, 'Gable').click();
    await pressed(second, 1, 'Gable');                     // the other tab redraws from storage
    await option(second, 3, 'Wood siding').click();
    assert.deepEqual([(await stored(first))[HOUSE].roofShape, (await stored(first))[HOUSE].wall], ['gable', 'wood-siding'], 'neither change lost the other');
    await pressed(first, 3, 'Wood siding');
    // While the second tab is typing a note, the first tab's change redraws its buttons but keeps the typing.
    await second.click('#note'); await second.keyboard.type('draft');
    await option(first, 1, 'Hip').click();
    await pressed(second, 1, 'Hip');
    assert.deepEqual([await second.inputValue('#note'), await second.evaluate(() => document.activeElement.id)], ['draft', 'note']);
    await second.fill('#note', ''); await second.dispatchEvent('#note', 'change');
    await first.click('#clear');
    await second.fill('#note', 'after the clear'); await second.dispatchEvent('#note', 'change');
    const after = (await stored(second))[HOUSE];
    assert.deepEqual([after.note, after.roofShape, after.wall, after.cleared], ['after the clear', undefined, undefined, undefined], 'the stale tab does not revive the cleared fields');
  });

  await scenario('a stamp dated ahead, or in another form, neither replaces work here nor freezes a building', async context => {
    const page = await open(context); await loaded(page);
    await page.click(`#queue button[data-id="${HOUSE}"]`);
    await option(page, 1, 'Gable').click();                // an answer made here first
    const hour = Date.now() + 3600e3, noMillis = new Date(hour).toISOString().replace(/\.\d{3}Z$/, 'Z');
    await importFile(page, {kind: 'mount-dora-house-survey', version: 3, answers: {[HOUSE]: {stories: '4', at: noMillis}, [OTHER]: {stories: '2', at: hour},
      [THIRD]: {stories: '3', at: 'never'}, [GONE]: {stories: '1', at: noMillis}}});
    assert.match(await statusLine(page), new RegExp(`3 dated ahead of this clock.*the copy here was kept for ${HOUSE}: set the clock that is off`));
    let now = await stored(page);
    assert.deepEqual([now[HOUSE].roofShape, now[HOUSE].stories], ['gable', undefined], 'a copy dated ahead never replaces an answer made here');
    assert.equal(now[OTHER].at, new Date(hour).toISOString(), 'where nothing was held it lands with its own stamp, in one form');
    assert.deepEqual([now[THIRD].stories, 'at' in now[THIRD]], ['3', false], 'a malformed stamp counts as undated');
    await page.selectOption('#show', 'all');               // the imported buildings are answered now, so To do hides them
    for (const id of [OTHER, THIRD]) { await page.click(`#queue button[data-id="${id}"]`); await option(page, 1, 'Hip').click(); }
    now = await stored(page);
    assert.deepEqual([now[OTHER].roofShape, now[THIRD].roofShape], ['hip', 'hip'], 'edits on top of them win');
    await page.locator('#unknown div', {hasText: GONE}).locator('button').click();
    assert.deepEqual([(await stored(page))[GONE].cleared, await page.isHidden('#unknown')], [true, true], 'Drop takes effect too');
  });

  await scenario('a click right after typing a date or a note lands where it was aimed', async context => {
    const page = await open(context); await loaded(page);
    await page.click(`#queue button[data-id="${HOUSE}"]`);
    await page.click('#imagery'); await page.keyboard.type('2024-03');
    await option(page, 8, 'Sure').click();                 // README step 4: the date, then a confidence
    await page.click('#note'); await page.keyboard.type('porch');
    await option(page, 1, 'Gable').click();
    const house = (await stored(page))[HOUSE];
    assert.deepEqual([house.imageryDate, house.confidence, house.note, house.roofShape], ['2024-03', 'sure', 'porch', 'gable']);
    await page.click('#note'); await page.keyboard.type(' and steps');
    const title = await page.textContent('#house-title');
    await page.click('button[type=submit]');               // Save & next
    assert.notEqual(await page.textContent('#house-title'), title, 'Save & next moved on');
    assert.equal((await stored(page))[HOUSE].note, 'porch and steps');
    await page.click('#note'); await page.keyboard.type('x');
    await page.click(`#queue button[data-id="${OTHER}"]`);
    assert.equal(await page.getAttribute(`#queue button[data-id="${OTHER}"]`, 'aria-current'), 'true', 'a queue click moved too');
    // Leaving the page while still typing keeps what was typed.
    await page.click('#note'); await page.keyboard.type('kept on reload');
    await page.reload(); await loaded(page);
    assert.equal((await stored(page))[OTHER].note, 'kept on reload');
  });

  await scenario('a tab that hears no storage events still builds every change and export on the other tab\'s', async context => {
    const first = await open(context, {[GONE]: {stories: '2', at: old(1)}}), second = watch(await context.newPage());
    await second.addInitScript(() => { const add = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (type, ...rest) { return type === 'storage' ? undefined : add.call(this, type, ...rest); }; });
    await second.goto(base); await loaded(first); await loaded(second);
    await first.click(`#queue button[data-id="${HOUSE}"]`); await second.click(`#queue button[data-id="${HOUSE}"]`);
    await option(first, 1, 'Gable').click();
    await option(second, 3, 'Wood siding').click();        // the second tab still shows no roof: the click syncs first
    await option(first, 6, 'Front').click();               // a change the second tab has not seen
    await second.fill('#note', 'stale tab'); await second.dispatchEvent('#note', 'change');   // so the note syncs on its own
    await second.mouse.click(5, 5);                        // focus off the note now: a later blur would save, and sync, again
    await option(first, 8, 'Likely').click();              // another change it has not seen, then a door marked there
    await clickTown(second, edgeMid(HOUSE));
    const house = (await stored(first))[HOUSE];
    assert.deepEqual([house.roofShape, house.wall, house.porch, house.note, house.confidence, house.entrances?.length],
      ['gable', 'wood-siding', 'front', 'stale tab', 'likely', 1]);
    await first.locator('#unknown div', {hasText: GONE}).locator('button').click();
    assert.ok(GONE in ((await exportFile(second)).cleared || {}), 'the stale tab\'s export carries the other tab\'s Drop');
    // A Clear in the stale tab clears what the other tab answered since.
    await first.click(`#queue button[data-id="${OTHER}"]`); await second.click(`#queue button[data-id="${OTHER}"]`);
    await option(first, 1, 'Hip').click();
    await second.click('#clear');
    assert.equal((await stored(first))[OTHER].cleared, true, 'the stale tab\'s Clear sees the answer it was not shown');
    // An import there compares with what the other tab saved since.
    await first.click(`#queue button[data-id="${THIRD}"]`); await option(first, 1, 'Flat').click();
    await importFile(second, {kind: 'mount-dora-house-survey', version: 3, answers: {[THIRD]: {stories: '1', at: old(2)}}});
    assert.match(await statusLine(second), new RegExp(`^Imported 0 answers; not taken, because the copy here is newer: ${THIRD}\\.$`));
  });

  await scenario('a tab with focus resting in a field never saves its old text over another tab\'s', async context => {
    const first = await open(context); await loaded(first);
    await first.click(`#queue button[data-id="${HOUSE}"]`);
    await first.click('#note'); await first.keyboard.type('gate on the left');
    await first.mouse.click(5, 5);                         // a real blur: saved
    await first.click('#note');                            // focus back in, nothing typed
    const second = watch(await context.newPage());
    await second.goto(base); await loaded(second);         // a new tab opens on the same building
    await second.fill('#note', 'gate on the right, corrected'); await second.dispatchEvent('#note', 'change');
    await first.waitForFunction(() => document.getElementById('note').value === 'gate on the right, corrected');
    await first.reload(); await loaded(first);
    assert.equal((await stored(first))[HOUSE].note, 'gate on the right, corrected', 'closing the first tab does not save its old text');
    await first.click('#note');
    await second.click('#clear');
    await first.waitForFunction(() => document.getElementById('note').value === '');
    await first.reload(); await loaded(first);
    assert.equal((await stored(first))[HOUSE].cleared, true, 'nor bring back what the other tab cleared');
  });

  await scenario('a door is marked on the mini-map with a real click, and removed with another', async context => {
    const page = await open(context); await loaded(page);
    await page.click(`#queue button[data-id="${HOUSE}"]`);
    await clickTown(page, edgeMid(HOUSE));
    const marked = (await stored(page))[HOUSE].entrances;
    assert.equal(marked.length, 1);
    assert.match(await page.textContent('#entrances'), /^1 entrance marked/);
    assert.equal(await page.locator('#minimap line[stroke="#e8553f"]').count(), 1);
    await clickTown(page, edgeMid(HOUSE));
    assert.equal((await stored(page))[HOUSE]?.entrances, undefined, 'the second click removes it');
  });

  await scenario('re-keying an answer: the import says whether it took the renamed copy, and names only that', async context => {
    const page = await open(context, {[GONE]: {stories: '2', note: 'moved', at: old(1)}}); await loaded(page);
    await page.click(`#queue button[data-id="${THIRD}"]`); await option(page, 1, 'Gable').click();
    const doc = await exportFile(page);
    assert.deepEqual(Object.keys(doc.answers).sort(), [GONE, THIRD].sort());
    // The whole export, one id renamed, as the README says: the unchanged answer is not reported.
    const renamed = to => { const answers = {...doc.answers, [to]: doc.answers[GONE]}; delete answers[GONE]; return {...doc, answers}; };
    await importFile(page, renamed(OTHER));
    assert.equal(await statusLine(page), 'Imported 1 answer.');
    assert.equal((await stored(page))[OTHER].note, 'moved');
    // Where the building already has a newer answer, the import names it, and only it.
    await page.click(`#queue button[data-id="${HOUSE}"]`); await option(page, 1, 'Gable').click();
    await importFile(page, renamed(HOUSE));
    assert.equal(await statusLine(page), `Imported 0 answers; not taken, because the copy here is newer: ${HOUSE}.`);
  });

  await scenario('an answer for an unknown building id is listed with what it holds, exported and kept on import', async context => {
    const page = await open(context, {[GONE]: {stories: '2', note: 'x', at: old(1)}}); await loaded(page);
    assert.equal(await page.isVisible('#unknown'), true);
    assert.match(await page.textContent('#unknown div'), new RegExp(`${GONE}stories 2, a noteDrop`));
    assert.ok(GONE in (await exportFile(page)).answers);
    await importFile(page, {kind: 'mount-dora-house-survey', version: 3, answers: {'county-5555555-1': {stories: '1', at: old(4)}}});
    assert.match(await statusLine(page), /1 of them for building ids not in this queue/);
    assert.ok((await stored(page))['county-5555555-1']);
  });
} finally {
  await browser.close();
  server.kill();
}
console.log(`house survey page: ${passed} scenarios passed`);
