// Mount Dora house survey. Walks the game's buildings street by street (the
// OSM ones in house-reference.json and the county-sketched ones OSM lacks in
// county-buildings.json), opens each one in Google Maps Street View (a link,
// never an embed or a download), and records what a person sees there.
// Answers autosave in this browser and export to house-survey.json, keyed by
// the building's game id. Each answer carries its evidence (AGENTS.md): image
// date, confidence, and only the entrances a person actually saw.
import {CONFIDENCE, IMAGERY_DATE, cleanAnswer, edgeKey, exportDocument, mergeAnswers, nearestEdge, newestPerId, outlineText, pinMismatches,
  queueEntries, stampAfter, staleEntrances, toggleEntrance, unitEdges, unknownAnswers, warningsFor} from './model.js';
const REFERENCE = '../house-reference.json', COUNTY = '../county-buildings.json', FEATURES = '../../features.json';
const STORE = 'mount-dora-house-survey-v1', CURRENT = STORE + ':current';
const FIELDS = [
  {key: 'stories', label: 'Storeys', options: [['1', '1'], ['1.5', '1½'], ['2', '2'], ['2.5', '2½'], ['3', '3'], ['4', '4+']]},
  {key: 'roofShape', label: 'Roof shape', options: [['gable', 'Gable'], ['hip', 'Hip'], ['flat', 'Flat'], ['gambrel', 'Gambrel'], ['mansard', 'Mansard'], ['shed', 'Shed'], ['complex', 'Mixed']]},
  {key: 'roofColour', label: 'Roof colour', swatch: true, options: [['charcoal', '#3b3d40'], ['grey', '#8b8f91'], ['silver', '#c9cdcc'], ['white', '#ecebe4'],
    ['brown', '#6e5240'], ['terracotta', '#b3593d'], ['red', '#8f312c'], ['green', '#56704f'], ['blue', '#4c6481']]},
  {key: 'wall', label: 'Walls', options: [['wood-siding', 'Wood siding'], ['other-siding', 'Vinyl / other siding'], ['stucco', 'Stucco'], ['brick', 'Brick'],
    ['block', 'Painted block'], ['stone', 'Stone'], ['storefront', 'Glass storefront']]},
  {key: 'wallColour', label: 'Wall colour', swatch: true, options: [['white', '#f2f0e8'], ['cream', '#efe3c2'], ['yellow', '#e8cf6f'], ['peach', '#e9b99a'],
    ['pink', '#e3a3a8'], ['light-blue', '#a9c4d6'], ['blue', '#5a7ea0'], ['sage', '#a7b897'], ['green', '#5f7f5a'], ['grey', '#9a9d9b'], ['tan', '#c9ad86'],
    ['brown', '#7a5a43'], ['red-brick', '#9b4a37']]},
  {key: 'trimColour', label: 'Trim colour', swatch: true, options: [['white', '#f2f0e8'], ['cream', '#efe3c2'], ['dark', '#3b3d40'], ['green', '#5f7f5a'],
    ['red', '#8f312c'], ['blue', '#4c6481'], ['brown', '#6e5240']]},
  {key: 'porch', label: 'Porch', options: [['none', 'None'], ['front', 'Front'], ['wrap', 'Wrap-around'], ['side', 'Side'], ['screened', 'Screened'], ['upper', 'Upper balcony']]},
  {key: 'flags', label: 'Flags', multi: true, options: [['hidden', 'Hidden by trees or fence'], ['no-imagery', 'No Street View here'],
    ['changed', 'Changed since the record'], ['wrong-building', 'Camera shows another building'], ['not-a-house', 'Shed, garage or outbuilding']]},
  {key: 'confidence', label: 'Confidence', options: CONFIDENCE.map(c => [c, c[0].toUpperCase() + c.slice(1)])},
];
const KEYS = [...FIELDS.map(f => f.key), 'imageryDate', 'entrances', 'note'];
const $ = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
// `drawn` holds the note and date text the page last drew or saved: a field
// whose text differs from it holds unsaved typing.
const state = {ready: false, pins: {}, drawn: {note: '', imagery: ''}, byId: new Map(), order: [], shapes: new Map(), roads: [], answers: {}, current: null, edges: [], countyBuildings: 0};

const status = text => { $('status').textContent = text; };
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } };
// Another tab may have saved since this one loaded. Every change first takes
// the newer copy per building from storage (sync), so it builds on what is
// there rather than on this tab's older copy, and persist merges again as it writes.
const readStored = () => { try { return JSON.parse(read(STORE) || '{}'); } catch { return {}; } };
const sync = () => { if (state.ready) state.answers = newestPerId(readStored(), state.answers); };
const persist = () => {
  if (!state.ready) return;
  sync();
  if (!write(STORE, JSON.stringify(state.answers))) status('This browser refused to save; export your answers often.');
};
const answered = id => cleanAnswer(state.answers[id], KEYS) !== null;
const label = b => b.address || b.osmTags.name || b.placeName || b.id;
const hex = buffer => [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
const bbox = rings => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of rings.flat()) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };

// Street order: by street name (unnamed roads last), then along the street's long axis.
function sortBuildings(buildings) {
  const extent = new Map(), road = b => b.streetView?.road || '';
  for (const b of buildings) {
    const p = b.streetView?.town || b.centroid, e = extent.get(road(b)) || [Infinity, Infinity, -Infinity, -Infinity];
    extent.set(road(b), [Math.min(e[0], p[0]), Math.min(e[1], p[1]), Math.max(e[2], p[0]), Math.max(e[3], p[1])]);
  }
  const along = b => { const e = extent.get(road(b)), p = b.streetView?.town || b.centroid; return e[2] - e[0] >= e[3] - e[1] ? p[0] : p[1]; };
  return [...buildings].sort((a, b) => !road(a) - !road(b) || road(a).localeCompare(road(b)) || along(a) - along(b) || a.id.localeCompare(b.id));
}

function passes(b) {
  const sector = $('sector').value, show = $('show').value, q = $('search').value.trim().toUpperCase();
  if (sector && !b.sectors.includes(sector)) return false;
  if (show === 'todo' && answered(b.id) || show === 'done' && !answered(b.id)) return false;
  return !q || [b.id, b.address, b.osmTags.name, b.placeName, b.streetView?.road].some(v => v && v.toUpperCase().includes(q));
}

const markName = (name, id) => { name.textContent = (answered(id) ? '✓ ' : '') + label(state.byId.get(id)); name.className = answered(id) ? 'done' : ''; };

function renderSummary() {
  const done = state.order.filter(answered).length, total = state.order.length;
  const withRecord = state.order.filter(id => state.byId.get(id).county.records.length).length, n = v => v.toLocaleString('en-US');
  $('summary').textContent = `${n(done)} of ${n(total)} buildings surveyed · in the queue, ${n(total - state.countyBuildings)} from OpenStreetMap and ` +
    `${n(state.countyBuildings)} from county sketches it lacks · county records for ${n(withRecord)}`;
  $('progress').style.width = `${(100 * done / total).toFixed(1)}%`;
}

function renderQueue() {
  const list = $('queue');
  list.replaceChildren();
  for (const id of state.order) {
    const b = state.byId.get(id);
    if (!passes(b)) continue;
    const li = document.createElement('li'), button = document.createElement('button'), name = document.createElement('span'), meta = document.createElement('span');
    markName(name, id);
    meta.className = 'street'; meta.textContent = b.sectors.join('/') + (b.countySketch ? ' · county' : '');
    button.append(name, meta); button.dataset.id = id;
    if (id === state.current) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => select(id));
    li.append(button); list.append(li);
  }
  renderSummary();
  list.querySelector('[aria-current=true]')?.scrollIntoView({block: 'nearest'});
  renderUnknown();
}

// Saved answers whose building id is not in this queue: the town no longer has
// the building, its id changed, or a teammate made the answer with other files.
// They stay in the export, where the generator lists them as lost.
function renderUnknown() {
  const box = $('unknown'), list = unknownAnswers(state.answers, KEYS, state.byId), one = list.length === 1;
  box.hidden = !list.length;
  if (!list.length) return box.replaceChildren();
  const intro = document.createElement('p');
  intro.textContent = `${one ? '1 saved answer is for a building id' : `${list.length} saved answers are for building ids`} not in this queue. ` +
    `Export keeps ${one ? 'it' : 'them'}, and the generator lists ${one ? 'it' : 'them'} as lost in project.json until re-keyed or dropped. ` +
    `If a teammate made ${one ? 'it' : 'them'} with newer files, pull and regenerate first: those files may have the building. ` +
    'To re-key one: export, rename its id in the file to the building\'s current id, and import that file. Drop the old id here only once the import ' +
    'reports the answer taken; if it says the copy here is newer, copy across by hand what only the old one holds.';
  const rows = list.map(({id, holds}) => {
    const row = document.createElement('div'), name = document.createElement('code'), what = document.createElement('span'), drop = document.createElement('button');
    name.textContent = id; what.textContent = holds.join(', '); drop.type = 'button'; drop.textContent = 'Drop';
    drop.addEventListener('click', () => {
      if (!confirm(`Drop the saved answer for ${id} (${holds.join(', ')})? This cannot be undone.`)) return;
      sync(); state.answers[id] = {cleared: true, at: stampAfter(state.answers[id])}; persist(); renderQueue(); status(`Dropped the answer for ${id}.`);
    });
    row.append(name, what, drop); return row;
  });
  box.replaceChildren(intro, ...rows);
}

function el(name, attrs = {}) { const node = document.createElementNS(svgNS, name); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); return node; }
const ringsPath = polygons => polygons.flatMap(poly => poly.map(ring => 'M' + ring.map(p => p.join(',')).join('L') + 'Z')).join('');

function minimap(b) {
  const svg = $('minimap'), sv = b.streetView, c = b.centroid;
  const span = Math.max(70, Math.min(180, Math.sqrt(b.areaM2) * 3 + (sv ? sv.distanceM * 2.4 : 0)));
  const box = [c[0] - span / 2, c[1] - span / 2, c[0] + span / 2, c[1] + span / 2];
  const near = s => s.box[2] >= box[0] && s.box[0] <= box[2] && s.box[3] >= box[1] && s.box[1] <= box[3];
  svg.setAttribute('viewBox', `${box[0]} ${box[1]} ${span} ${span}`);
  svg.replaceChildren();
  for (const r of state.roads.filter(near)) svg.append(el('polyline', {points: r.line.map(p => p.join(',')).join(' '), fill: 'none',
    stroke: r.minor ? '#4b5a52' : '#6f7672', 'stroke-width': r.minor ? 1.6 : 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}));
  for (const s of state.shapes.values()) if (s.id !== b.id && near(s)) svg.append(el('path', {d: s.d, fill: '#3d5247', 'fill-rule': 'evenodd'}));
  const self = state.shapes.get(b.id);
  if (self) {
    svg.append(el('path', {d: self.d, fill: '#f1cd66', 'fill-rule': 'evenodd', stroke: '#162421', 'stroke-width': .4}));
    // The game's grid outline, where marked entrances sit.
    svg.append(el('path', {d: self.authoredD, fill: 'none', stroke: '#eef2ec', 'stroke-width': .35, 'stroke-dasharray': '1 .6'}));
    for (const {segment: [p, q]} of state.answers[b.id]?.entrances || [])
      svg.append(el('line', {x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: '#e8553f', 'stroke-width': 1.4, 'stroke-linecap': 'butt'}));
  }
  if (sv) {
    const v = sv.town, reach = Math.hypot(c[0] - v[0], c[1] - v[1]) + 12, ray = deg => [v[0] + reach * Math.sin(deg * Math.PI / 180), v[1] - reach * Math.cos(deg * Math.PI / 180)];
    const a = ray(sv.heading - sv.fov / 2), z = ray(sv.heading + sv.fov / 2);
    svg.append(el('path', {d: `M${v.join(',')}L${a.join(',')}L${z.join(',')}Z`, fill: '#f1cd6626', stroke: '#f1cd66', 'stroke-width': .5}));
    svg.append(el('circle', {cx: v[0], cy: v[1], r: Math.max(1.2, span / 70), fill: '#f1cd66', stroke: '#162421', 'stroke-width': .5}));
  }
  const north = el('text', {x: box[0] + span * .04, y: box[1] + span * .09, fill: '#c0d5bd', 'font-size': span * .06});
  north.textContent = 'N ↑'; svg.append(north);
}

function facts(b) {
  const dl = $('facts'), rec = b.county.records[0], s = b.suggested, rows = [];
  const add = (k, v) => { if (v !== null && v !== undefined && v !== '') rows.push([k, String(v)]); };
  const m2 = v => `${Math.round(v)} m²`;
  if (rec) {
    add('Storeys', `${rec.stories ?? '—'}${s.stories ? ` → game ${s.stories}${s.halfStory ? ' + rooms in the roof' : ''}` : ''}`);
    add('Walls', rec.wall); add('Roof cover', rec.roofCover); add('Built', rec.yearBuilt && `${rec.yearBuilt}${rec.effectiveYearBuilt && rec.effectiveYearBuilt !== rec.yearBuilt ? ` (effective ${rec.effectiveYearBuilt})` : ''}`);
    add('Use', [rec.style, rec.model].filter(Boolean).join(' · '));
    const porch = [['open', s.porchM2.open], ['screened', s.porchM2.screen], ['enclosed', s.porchM2.enclosed]].filter(([, v]) => v > 0).map(([k, v]) => `${k} ${m2(v)}`).join(', ');
    add('Porches', porch || 'none recorded'); add('Canopy', s.canopyM2 > 0 ? m2(s.canopyM2) : null);
    add('Garage', s.garage); add('Basement', s.basement ? 'yes (the lot likely slopes)' : null);
  } else add('Record', 'none matched: look by eye');
  add('On the lot', b.county.lotExtras.join(', '));
  const sketched = b.countySketch;
  if (sketched) add('Source', `${sketched.sketches} county sketch${sketched.sketches === 1 ? '' : 'es'}, not in OpenStreetMap · 2018 lidar: ${sketched.lidarSaw}`);
  else add('Match', `${b.match.method}${b.match.iou !== undefined ? `, IoU ${b.match.iou}` : ''}${b.county.records.length > 1 ? `, ${b.county.records.length} county buildings` : ''}`);
  dl.replaceChildren(...rows.flatMap(([k, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; return [dt, dd]; }));
}

function hintsFor(b) {
  const s = b.suggested, hints = {};
  if (s.stories) hints.stories = [String(Math.min(4, s.stories + (s.halfStory ? .5 : 0)))];
  if (s.wallConstruction === 'frame') hints.wall = ['wood-siding'];
  if (s.wallConstruction === 'masonry') hints.wall = ['stucco', 'brick', 'block'];
  if (s.roofPitch === 'flat') hints.roofShape = ['flat'];
  if (s.porchM2.screen > 0) hints.porch = ['screened'];
  return hints;
}

function renderFields(b) {
  const box = $('fields'), answer = state.answers[b.id] || {}, hints = hintsFor(b);
  box.replaceChildren();
  for (const field of FIELDS) {
    const set = document.createElement('fieldset'), legend = document.createElement('legend'), options = document.createElement('div');
    legend.textContent = field.label; options.className = 'options';
    for (const [value, text] of field.options) {
      const button = document.createElement('button'), on = field.multi ? (answer[field.key] || []).includes(value) : answer[field.key] === value;
      button.type = 'button'; button.setAttribute('aria-pressed', String(on));
      if (field.swatch) { button.className = 'swatch'; button.style.background = text; button.title = value; button.setAttribute('aria-label', `${field.label}: ${value}`); }
      else button.textContent = text;
      if (hints[field.key]?.includes(value)) { const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = 'county'; button.append(hint); }
      button.addEventListener('click', () => choose(field, value));
      options.append(button);
    }
    set.append(legend, options); box.append(set);
  }
  $('note').value = state.drawn.note = answer.note || '';
  $('imagery').value = state.drawn.imagery = answer.imageryDate || '';
  const doors = answer.entrances?.length || 0;
  $('entrances').textContent = doors ? `${doors} entrance${doors === 1 ? '' : 's'} marked. Click a marked edge again to remove it.`
    : 'No entrance marked. Click the dashed game outline where you can see a door.';
}

// A click near the dashed outline toggles an entrance on that 1 m wall edge. A
// marked edge the outline has since lost can be clicked too, to remove it.
function markEntrance(event) {
  const b = state.byId.get(state.current), svg = $('minimap');
  if (!b || !state.edges.length) return;
  const point = svg.createSVGPoint();
  point.x = event.clientX; point.y = event.clientY;
  const town = point.matrixTransform(svg.getScreenCTM().inverse()), span = svg.viewBox.baseVal.width;
  sync();
  const stale = staleEntrances(state.answers[b.id], state.edges).map(e => e.segment);
  const hit = nearestEdge([...state.edges, ...stale], [town.x, town.y], Math.max(1.5, span / 40));
  if (!hit) return status('Click closer to the dashed outline to mark an entrance.');
  const answer = {...(state.answers[b.id] || {})};
  answer.entrances = toggleEntrance(answer.entrances, hit.segment);
  save(b.id, answer); minimap(b); renderWarnings(b);
  status(`Entrance edge ${edgeKey(hit.segment)} ${answer.entrances.some(e => edgeKey(e.segment) === edgeKey(hit.segment)) ? 'marked' : 'removed'}.`);
}

function renderWarnings(b) {
  const warnings = warningsFor(b), stale = staleEntrances(state.answers[b.id], state.edges).length;
  if (stale) warnings.push(`${stale} marked entrance${stale === 1 ? ' is' : 's are'} not on this building's outline as these files draw it. If the doors were marked ` +
    `with newer files, pull and regenerate first. Otherwise the outline changed: click ${stale === 1 ? 'it' : 'each'} on the mini-map to remove ${stale === 1 ? 'it' : 'them'}, ` +
    'then mark the doors again.');
  $('warnings').replaceChildren(...warnings.map(w => { const li = document.createElement('li'); li.textContent = w; return li; }));
}

function choose(field, value) {
  sync();
  const id = state.current, answer = {...(state.answers[id] || {})};
  if (field.multi) {
    const list = new Set(answer[field.key] || []);
    list.has(value) ? list.delete(value) : list.add(value);
    answer[field.key] = [...list].sort();
  } else answer[field.key] = answer[field.key] === value ? undefined : value;
  save(id, answer);
}

// Every write goes through commit, or Drop. A cleared answer leaves a dated
// mark, so importing an older copy of it, or a stale tab, cannot bring it back.
function commit(id, answer) {
  if (!state.ready || !state.byId.has(id)) { status('The house reference has not loaded, so nothing was saved; your saved answers are untouched.'); return false; }
  const clean = cleanAnswer(answer, KEYS), at = stampAfter(state.answers[id]);
  if (clean) state.answers[id] = {...clean, at}; else if (answered(id)) state.answers[id] = {cleared: true, at};
  persist(); return true;
}
function save(id, answer) { if (commit(id, answer)) { renderFields(state.byId.get(id)); renderQueue(); } }

// A note or date saves on change, which fires as the field loses focus, often
// on the mousedown of the next click. Redrawing the buttons or the queue then
// would move that click's target before its mouseup, so only the marks update.
function saveText(id, answer) {
  if (!commit(id, answer)) return false;
  const name = $('queue').querySelector(`button[data-id="${CSS.escape(id)}"] span`);
  if (name) markName(name, id);
  renderSummary(); return true;
}
const typedValue = id => id === 'note' ? $('note').value.trim() : $('imagery').value.trim();
const textAnswer = (id, value) => ({...(state.answers[state.current] || {}), [id === 'note' ? 'note' : 'imageryDate']: value});

function select(id) {
  const b = state.byId.get(id);
  if (!b) return;
  state.current = id; write(CURRENT, id);
  const index = state.order.indexOf(id), sv = b.streetView;
  $('house-title').textContent = label(b);
  $('position').textContent = `${index + 1} of ${state.order.length}`;
  $('where').textContent = [b.osmTags.name || b.placeName, b.sectors.join(', '), b.id, `${Math.round(b.areaM2)} m² footprint`].filter(Boolean).join(' · ');
  $('streetview').href = sv ? sv.url : '#'; $('aerial').href = b.aerialUrl;
  $('camera').textContent = sv ? `Camera on ${sv.road || 'an unnamed road'} (${sv.roadClass}), ${sv.distanceM} m from the footprint centre, facing ${sv.heading}°. Google shows the nearest panorama, so pan if the house is off-centre.` : 'No street within reach.';
  state.edges = unitEdges(state.shapes.get(id)?.authored || []);
  renderWarnings(b); minimap(b); facts(b); renderFields(b); renderQueue();
}

function step(delta) {
  const start = state.order.indexOf(state.current);
  for (let i = start + delta; i >= 0 && i < state.order.length; i += delta) if (passes(state.byId.get(state.order[i]))) return select(state.order[i]);
  status(delta > 0 ? 'End of this queue.' : 'Start of this queue.');
}

// Until the reference files load, the saved answers have not been read, so an
// export would write none and an import would overwrite them.
const notLoaded = () => !state.ready && (status('The house reference has not loaded, so export and import are off; your saved answers are untouched.'), true);

function exportAnswers() {
  if (notLoaded()) return;
  sync();
  const data = exportDocument({answers: state.answers, pins: state.pins, keys: KEYS, exportedAt: new Date().toISOString()});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1) + '\n'], {type: 'application/json'}));
  link.download = 'house-survey.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  const n = Object.keys(data.answers).length, undated = Object.values(data.answers).filter(a => !a.imageryDate).length, lost = Object.keys(data.answers).filter(id => !state.byId.has(id)).length;
  const cleared = Object.keys(data.cleared || {}).length;
  status(`Exported ${n} answer${n === 1 ? '' : 's'}${undated ? `; ${undated} without a Street View image date` : ''}${lost ? `; ${lost} for building ids not in this queue (listed below)` : ''}` +
    `${cleared ? `; ${cleared} cleared` : ''}.`);
}

async function importAnswers(file) {
  if (notLoaded()) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.kind !== 'mount-dora-house-survey' || typeof data.answers !== 'object') throw Error('not a house-survey export');
    sync();
    const merged = mergeAnswers(state.answers, data, KEYS, state.byId), differs = pinMismatches(data, state.pins);
    state.answers = merged.answers; persist(); select(state.current);
    const ids = list => list.slice(0, 20).join(', ') + (list.length > 20 ? `, and ${list.length - 20} more` : '');
    status(`Imported ${merged.added} answer${merged.added === 1 ? '' : 's'}${merged.unknown ? `; ${merged.unknown} of them for building ids not in this queue, kept and listed below` : ''}` +
      `${merged.replaced.length ? `; it replaced the copy here for ${ids(merged.replaced)}${merged.cleared ? ` (${merged.cleared} cleared there)` : ''}` : ''}` +
      `${merged.older.length ? `; not taken, because the copy here is newer: ${ids(merged.older)}` : ''}` +
      `${merged.ahead ? `; ${merged.ahead} dated ahead of this clock, so one of the two clocks is off` : ''}` +
      `${merged.keptAhead.length ? `, and the copy here was kept for ${ids(merged.keptAhead)}: set the clock that is off, then import again` : ''}` +
      `${merged.broken ? `; ${merged.broken} dated more than a day ahead, read as undated` : ''}` +
      `${differs.length ? `; changed since it was exported: ${differs.join(', ')}. If the other files are newer, pull and regenerate before dropping answers or removing entrances` : ''}.`);
  } catch (error) { status(`Import failed: ${error.message}.`); }
}

document.addEventListener('keydown', event => {
  if (event.target.closest('input,textarea,select') || event.ctrlKey || event.metaKey || event.altKey || !state.current) return;
  const key = event.key.toLowerCase();
  if (key === 'enter' && event.target.closest('button,a')) return; // Enter on a control activates it
  if (key === 'enter') step(1);
  else if (key === 'v') $('streetview').click();
  else if (key === 'a') $('aerial').click();
  else if (key === 's' || key === 'arrowright') step(1);
  else if (key === 'arrowleft') step(-1);
  else if (/^[1-6]$/.test(key)) choose(FIELDS[0], FIELDS[0].options[Number(key) - 1][0]);
  else return;
  event.preventDefault();
});
$('survey').addEventListener('submit', event => { event.preventDefault(); step(1); });
$('skip').addEventListener('click', () => step(1));
$('prev').addEventListener('click', () => step(-1));
$('clear').addEventListener('click', () => { sync(); save(state.current, {}); });
const saveTyped = id => {
  const value = typedValue(id);
  if (id === 'imagery' && value && !IMAGERY_DATE.test(value)) return status('Use the image month as YYYY-MM, for example 2024-03.');
  sync();
  if (saveText(state.current, textAnswer(id, value))) state.drawn[id] = $(id).value;
};
for (const id of ['note', 'imagery']) $(id).addEventListener('change', () => saveTyped(id));
// A field holds unsaved typing only where its text differs from what the page last drew or saved;
// focus resting in a field is not typing.
const unsaved = el => el && el === document.activeElement && el.value !== state.drawn[el.id];
// Leaving the page while still typing: save what was typed, as leaving the field would.
window.addEventListener('pagehide', () => {
  const id = ['note', 'imagery'].find(id => unsaved($(id)));
  if (id && state.ready) saveTyped(id);
});
// Another tab saved: show its answers here too, keeping only what is being typed and not yet saved.
window.addEventListener('storage', event => {
  if (event.key !== STORE || !state.ready) return;
  sync(); renderQueue();
  const b = state.byId.get(state.current);
  if (!b) return;
  minimap(b); renderWarnings(b);
  const typing = [$('note'), $('imagery')].find(unsaved), kept = typing && [typing.value, typing.selectionStart, typing.selectionEnd];
  renderFields(b);
  if (typing) { typing.value = kept[0]; typing.setSelectionRange(kept[1], kept[2]); }
});
$('minimap').addEventListener('click', markEntrance);
for (const id of ['sector', 'show', 'search']) $(id).addEventListener('input', renderQueue);
$('export').addEventListener('click', exportAnswers);
$('import').addEventListener('change', event => { if (event.target.files[0]) importAnswers(event.target.files[0]); event.target.value = ''; });

try {
  // The reference files are pinned as served; the outlines by their ids and authored geometry.
  const sha = async data => hex(await crypto.subtle.digest('SHA-256', data));
  const load = async (key, url) => {
    const r = await fetch(url); if (!r.ok) throw Error(`${url}: ${r.status}`);
    const buffer = await r.arrayBuffer();
    if (key) state.pins[key] = await sha(buffer);
    return JSON.parse(new TextDecoder().decode(buffer));
  };
  const [reference, county, features] = await Promise.all([load('reference', REFERENCE), load('countyBuildings', COUNTY), load(null, FEATURES)]);
  state.pins.outlines = await sha(new TextEncoder().encode(outlineText(features.features)));
  for (const b of queueEntries(reference, county, features.features)) state.byId.set(b.id, b);
  state.order = sortBuildings([...state.byId.values()]).map(b => b.id);
  state.countyBuildings = county.buildings.length;
  for (const f of features.features) {
    if (f.category === 'building' && f.geographicGeometry) state.shapes.set(f.id, {id: f.id, d: ringsPath(f.geographicGeometry.coordinates),
      authored: f.geometry.coordinates, authoredD: ringsPath(f.geometry.coordinates), box: bbox(f.geographicGeometry.coordinates.flat())});
    if (f.category === 'road' && f.geometry.type === 'LineString') state.roads.push({line: f.geometry.coordinates, box: bbox([f.geometry.coordinates]),
      minor: ['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track'].includes(f.tags.highway)});
  }
  const stored = read(STORE);
  try { state.answers = stored ? JSON.parse(stored) : {}; } catch { state.answers = {}; }
  const sectors = [...new Set([...state.byId.values()].flatMap(b => b.sectors))].sort();
  $('sector').append(...sectors.map(s => new Option(s, s)));
  const resume = read(CURRENT);
  select(state.byId.has(resume) ? resume : state.order.find(id => !answered(id)) || state.order[0]);
  state.ready = true;
} catch (error) {
  $('summary').textContent = `Could not load the house reference (${error.message}). Serve the repository with node tools/maps/house-reference/serve.mjs.`;
}
