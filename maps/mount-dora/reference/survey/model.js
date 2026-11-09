// Pure helpers for the house survey, shared by the page and its Node test.
// Coordinates are town east/south metres (maps/mount-dora/project.json).

export const CONFIDENCE = ['sure', 'likely', 'unsure'];
export const IMAGERY_DATE = /^(19|20)\d\d(-(0[1-9]|1[0-2]))?$/;

// The game's authored outlines are axis-aligned with integer corners. Split
// them into the 1 m wall edges a door can occupy, each ordered low to high.
export function unitEdges(multiPolygon) {
  const edges = [];
  for (const polygon of multiPolygon) for (const ring of polygon) for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length];
    if (![x0, y0, x1, y1].every(Number.isInteger) || x0 !== x1 && y0 !== y1) continue;
    const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
    for (let k = 0, n = Math.abs(x1 - x0) + Math.abs(y1 - y0); k < n; k++) {
      const a = [x0 + dx * k, y0 + dy * k], b = [a[0] + dx, a[1] + dy];
      edges.push(a[0] + a[1] < b[0] + b[1] ? [a, b] : [b, a]);
    }
  }
  return edges;
}

export const edgeKey = ([a, b]) => `${a[0]},${a[1]}:${b[0]},${b[1]}`;

export function nearestEdge(edges, [x, y], maxDistance) {
  let best = null;
  for (const segment of edges) {
    const [a, b] = segment, t = Math.max(0, Math.min(1, (x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])));
    const d = Math.hypot(x - (a[0] + t * (b[0] - a[0])), y - (a[1] + t * (b[1] - a[1])));
    if (d <= maxDistance && (!best || d < best.distance || d === best.distance && edgeKey(segment) < edgeKey(best.segment))) best = {segment, distance: d};
  }
  return best;
}

// Adds the entrance, or removes it when that edge is already marked.
export function toggleEntrance(list = [], segment) {
  const key = edgeKey(segment), kept = list.filter(e => edgeKey(e.segment) !== key);
  if (kept.length < list.length) return kept;
  return [...list, {segment: segment.map(p => [...p])}].sort((p, q) => edgeKey(p.segment).localeCompare(edgeKey(q.segment)));
}

// A county building (reference/county-buildings.json) as a queue entry with the
// fields of a house-reference.json building. Its sectors come from
// features.json, which the generator writes after both reference files.
export function countyEntry(c, sectors = []) {
  return {id: c.id, sectors, centroid: c.centroid, areaM2: c.areaM2, osmTags: {}, address: c.address, placeName: c.placeName, parcel: c.parcel,
    match: c.county.match, county: c.county.county, suggested: c.county.suggested, streetView: c.streetView, aerialUrl: c.aerialUrl,
    countySketch: {sketches: c.members.length, lidarSaw: c.lidarSaw, roofShare: c.roofShare}};
}

// The queue: every game building, the OSM ones from house-reference.json and
// the county-sketched ones OSM lacks from county-buildings.json.
export function queueEntries(reference, county, features) {
  const sectorsOf = new Map(features.filter(f => f.category === 'building').map(f => [f.id, f.nativeSectors || []]));
  return [...reference.buildings, ...county.buildings.map(c => countyEntry(c, sectorsOf.get(c.id)))];
}

// What a surveyor should know about a building before looking.
export function warningsFor(b) {
  const sv = b.streetView, sketched = b.countySketch, out = [];
  if (!b.county.records.length) out.push('No county record: everything here comes from what you see.');
  if (b.match.method === 'footprint-partial') out.push('The game outline and the county sketch disagree; check this is one building.');
  if (b.match.method === 'parcel-area') out.push('Several buildings share this lot; the record was picked by size.');
  if (sketched) out.push(`OpenStreetMap lacks this building; the game drew it from ${sketched.sketches === 1 ? 'the county sketch' : `${sketched.sketches} county sketches`}. ` +
    'If Street View shows none here, flag "Changed since the record".');
  if (sketched && sketched.lidarSaw !== 'class-6 roof') out.push(`The 2018 lidar saw no building roof here (${sketched.lidarSaw}). Check that it stands.`);
  if (sv && sv.distanceM > 60) out.push('Far from the street; it may be hidden or reached by a drive.');
  if (sv && !sv.onAddressedStreet && b.address) out.push(`The camera is not on the addressed street (${b.address}).`);
  return out;
}

// What an export depends on: the two files the queue came from, and the
// building outlines its entrance edges lie on. The outlines are pinned by their
// ids and authored geometry, not by features.json's bytes, which the generator
// rewrites with every survey answer it applies.
export const PINNED = {
  reference: {file: 'maps/mount-dora/reference/house-reference.json'},
  countyBuildings: {file: 'maps/mount-dora/reference/county-buildings.json'},
  outlines: {file: 'maps/mount-dora/features.json', fields: 'the id and authored geometry of every building'},
};
// The text the outlines pin hashes.
export const outlineText = features => JSON.stringify(features.filter(f => f.category === 'building').map(f => [f.id, f.geometry]));

// What an export was made against that differs from what is loaded now.
export const pinMismatches = (doc, pins) => Object.keys(PINNED).filter(key => doc[key]?.sha256 && doc[key].sha256 !== pins[key])
  .map(key => key === 'outlines' ? 'the building outlines in features.json' : PINNED[key].file.split('/').pop());

// A cleared answer is a dated mark, {cleared: true, at}, not a deletion: it
// outranks any older copy of the answer, from an import or another tab.
export const isCleared = a => a?.cleared === true;

// A copy's `at` in milliseconds, or null when it is not a date. Stamps can
// arrive in other forms (no milliseconds, an offset, an epoch number), so every
// comparison goes through this, never through the text.
export function when(at) {
  const t = typeof at === 'number' ? at : typeof at === 'string' ? Date.parse(at) : NaN;
  return Number.isFinite(t) ? t : null;
}
const rank = copy => when(copy?.at) ?? -Infinity;

// Per building, the newer of two copies, cleared ones included; a tie keeps `b`'s.
export function newestPerId(a, b) {
  const out = {...a};
  for (const [id, x] of Object.entries(b)) if (!out[id] || rank(x) >= rank(out[id])) out[id] = x;
  return out;
}

// The stamp for a local write: now, or just after the copy it replaces when
// that copy is dated later, so the write always outranks what it replaced.
// Import reads a stamp more than BROKEN_MS ahead as undated, so a broken clock
// elsewhere cannot carry this far into the future.
export function stampAfter(previous, now = Date.now()) {
  const before = when(previous?.at);
  return new Date(before === null ? now : Math.max(now, before + 1)).toISOString();
}

// Stamps past the importing browser's clock. Within AHEAD_MS they are ordinary.
// Up to BROKEN_MS they come from a clock running fast, or this one runs slow.
// Further than that, the clock is broken.
export const AHEAD_MS = 60000, BROKEN_MS = 86400000;
const canonical = a => JSON.stringify(Object.keys(a).sort().map(k => [k, a[k]]));

// Import. Each copy's `at` is read as a date and kept in one form; anything not
// a date, or more than BROKEN_MS ahead, counts as undated. Per building the
// newer copy wins, an answer or a clearing. An undated or empty copy never
// outranks one held here, and an identical copy changes nothing and is not
// reported.
// A copy dated ahead never replaces anything held here. Where nothing is held
// it lands with its own stamp, so an edit made on top of it, dated after it,
// keeps its order on every machine. Answers for ids this queue lacks are kept
// too.
// Reports, by id, what it replaced, what it left because the copy here is
// newer, and what it kept here against a copy dated ahead.
export function mergeAnswers(mine, doc, keys, known, now = Date.now()) {
  const answers = {...mine}, live = a => a && (isCleared(a) || cleanAnswer(a, keys)) ? a : null;
  const out = {added: 0, cleared: 0, unknown: 0, ahead: 0, broken: 0, replaced: [], older: [], keptAhead: []};
  const dated = (base, at) => {
    let t = when(at);
    if (t !== null && t > now + BROKEN_MS) { out.broken++; t = null; }
    return {next: t === null ? base : {...base, at: new Date(t).toISOString()}, ahead: t !== null && t > now + AHEAD_MS};
  };
  const incoming = [...Object.entries(doc.answers || {}).map(([id, a]) => { const c = cleanAnswer(a, keys); return [id, c && dated(c, a.at)]; }),
    ...Object.entries(doc.cleared || {}).map(([id, at]) => [id, when(at) === null ? null : dated({cleared: true}, at)])];
  for (const [id, item] of incoming) {
    if (!item) continue;
    const {next, ahead} = item, held = live(answers[id]);
    if (held && canonical(held) === canonical(next)) continue;
    if (ahead) out.ahead++;
    if (held && ahead) { out.keptAhead.push(id); continue; }
    if (held && !(rank(next) > rank(held))) { out.older.push(id); continue; }
    answers[id] = next;
    if (held && !isCleared(held)) { out.replaced.push(id); if (isCleared(next)) out.cleared++; }
    if (!isCleared(next)) { out.added++; if (!known.has(id)) out.unknown++; }
  }
  return {answers, ...out};
}

// Saved answers whose building id the queue lacks (the town no longer has the
// building, or its id changed), each with a short list of what it holds.
export function unknownAnswers(answers, keys, known) {
  const say = ([k, v]) => k === 'entrances' ? `${v.length} entrance${v.length === 1 ? '' : 's'}` : k === 'note' ? 'a note' : `${k} ${[v].flat().join('/')}`;
  return Object.keys(answers).filter(id => !known.has(id) && !isCleared(answers[id])).sort()
    .map(id => ({id, holds: Object.entries(cleanAnswer(answers[id], keys) || {}).map(say)}));
}

// Marked entrances no longer on the building's outline: it changed after they were marked.
export function staleEntrances(answer, edges) {
  const on = new Set(edges.map(edgeKey));
  return (answer?.entrances || []).filter(e => !on.has(edgeKey(e.segment)));
}

// Drops empty values; an answer with nothing left is null.
export function cleanAnswer(answer, keys) {
  const out = {};
  for (const key of keys) {
    const v = answer?.[key];
    if (v === undefined || v === null || v === '' || Array.isArray(v) && !v.length) continue;
    if (key === 'imageryDate' && !IMAGERY_DATE.test(v)) continue;
    if (key === 'confidence' && !CONFIDENCE.includes(v)) continue;
    out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}

// Every saved answer, including one whose building id the queue lacks: the
// generator applies what matches and lists the rest as lost in project.json.
// Clearings go under `cleared` ({id: at}), which the generator does not read,
// so that an import elsewhere keeps them cleared.
export function exportDocument({answers, pins, keys, exportedAt}) {
  const out = {}, cleared = {};
  for (const id of Object.keys(answers).sort()) {
    if (isCleared(answers[id])) { cleared[id] = answers[id].at; continue; }
    const a = cleanAnswer(answers[id], keys);
    if (a) out[id] = {...a, ...(answers[id].at ? {at: answers[id].at} : {})};
  }
  return {
    kind: 'mount-dora-house-survey', version: 3,
    ...Object.fromEntries(Object.entries(PINNED).map(([key, pin]) => [key, {...pin, sha256: pins[key]}])), exportedAt,
    evidence: {
      source: 'A person viewing Google Maps Street View and satellite imagery in Google Maps; no imagery is stored.',
      coordinates: 'Keyed by game building id: an OSM id, or a county- id for a building OSM lacks (county-buildings.json). Entrances are 1 m edges of the authored outline in town east/south metres.',
      observationDate: 'imageryDate is the "Image capture" month Google shows; at is when the answer was recorded.',
      uncertainty: 'confidence is the surveyor\'s own: sure, likely or unsure. Unanswered fields are unknown, not absent.',
      entrances: 'Only doors a person saw are marked. None are inferred from an address, outline or facade.',
      lost: 'An answer whose building id the town no longer has applies to nothing; the generator lists such ids as lost in project.json.',
      cleared: 'Buildings whose answer a surveyor cleared or dropped, and when. An import of an older answer for one keeps it cleared.',
    },
    answers: out, ...(Object.keys(cleared).length ? {cleared} : {}),
  };
}
