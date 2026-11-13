// Mount Dora's buildings as reusable house parts: one self-contained file per
// building, in metres local to that building.
//
// A part is generated from the committed town: authored-buildings.json,
// features.json, the lidar and county roof records, the county addresses and
// the production art kit. It holds what a game needs to rebuild the house
// anywhere: outline, floor cells, walls, storeys, roof, look, evidence and
// provenance. `stampSectors` puts every part back into the 42 sector maps with
// the generator's own rules, mirrored below from tools/maps/build-mount-dora.py,
// and the result must equal the committed sector files byte for byte.
//
// A part is built on its own grid, so it moves as one rigid unit: a host may
// place it at any position and any angle (`placePoint`), not only on a grid.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createProjection} from '../house-reference/projection.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const KIND = 'house-part', INDEX_KIND = 'house-part-index', VERSION = 1;
export const PARTS_DIR = 'maps/mount-dora/parts';
export const MATERIALS = ['wood', 'brick', 'concrete'];
export const sha256 = data => createHash('sha256').update(data).digest('hex');
const round = (v, n) => Number(v.toFixed(n));

export const FRAME = {
  units: 'metres',
  axes: '+x is east and +y is south when rotationDeg is 0; z is up',
  origin: 'the minimum corner of the outline',
  cells: 'cell [x, y] is the 1 m square from x to x+1 and y to y+1; floorCells rows are [y, x0, x1] covering x0 to x1-1',
  levels: 'every level from 0 to storeys has floor on floorCells: level 0 is the ground floor and level storeys is the roof deck',
  walls: 'walls are centrelines on the outline; the kit wall, kit.wallThicknessM thick, is centred on its line',
  rotation: 'world = at + R(rotationDeg) * (p - pivot), where R turns +x toward +y, which is clockwise on a north-up map',
  angles: 'roof.ridgeAxisDeg is the ridge direction in this frame, degrees from +x toward +y, at least 0 and under 180; roof.ridgeBearingMeasuredDeg is its compass bearing on the real house',
  geographic: 'latitude and longitude are WGS 84 degrees of placements.true.at, the centre of the outline bounds on the real house',
  fit: 'placements.grid.fitIoU and placements.true.fitIoU are the intersection over union of the outline, placed with that pose, and the measured footprint',
  edges: 'placements.grid.suppressedWallEdges are [polygon, ring, edge] indices into outline, where edge i runs from ring[i] to ring[i+1]',
};

// Every part comes out of the town's derived feature database, which carries
// the ODbL (maps/mount-dora/source/NOTICE.txt); a file used on its own keeps it.
const LICENSE = {license: 'ODbL-1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  notice: 'Derived from OpenStreetMap through the Mount Dora feature database, under the ODbL 1.0; keep this licence and the attribution with any copy or derived database',
  noticeFile: 'maps/mount-dora/source/NOTICE.txt'};
const OSM_CREDIT = '© OpenStreetMap contributors, https://www.openstreetmap.org/copyright';
const COUNTY_CREDIT = 'Lake County Property Appraiser (Florida) public records';
const LIDAR_CREDIT = 'USGS 3D Elevation Program lidar, public domain';
export const credits = (usesCounty, lidarDataset) => [OSM_CREDIT, ...(usesCounty ? [COUNTY_CREDIT] : []), `${LIDAR_CREDIT} (${lidarDataset})`];
// Whether a building's part carries a county record: its footprint, its evidence or a value's source.
export const usesCounty = (feature, address) => Boolean(feature.county || feature.nativeProxy.evidence?.county
  || [feature.nativeProxy.storiesSource, feature.nativeProxy.materialSource, address?.source].some(s => s?.startsWith('county')));

// How each grid-fit method's true pose is found. The shared-component fit
// moved the plan by componentCentre and translationMetres alone, so it
// inverts. A reviewed override moved the plan by hand, so its true pose
// matches centroids instead. Any other method refuses until it is added here.
const TRUE_POSE = {'shared-component-dominant-axis': 'inverse', 'reviewed-grid-override': 'centroid'};

// Native kit dimensions the town was built with (Nautilus wall runs at the
// workshop pin, docs/wall-runs.md); wall height and storey pitch also come per
// building from features.json nativeProxy.
const KIT = {wallThicknessM: .16, source: 'Nautilus native wall-run kit at 2502646 (docs/wall-runs.md)'};

// ---- The generator's rules, mirrored from tools/maps/build-mount-dora.py ----
// The round trip compares bytes, so any drift in these mirrors fails loudly.

// Python's float repr, which json.dumps writes and the generator's wall ids hash.
export function pyFloat(x) {
  if (!Number.isFinite(x)) throw Error('Non-finite float ' + x);
  if (Object.is(x, -0)) return '-0.0';
  const [mantissa, e] = x.toExponential().split('e'), exponent = Number(e);
  const sign = x < 0 ? '-' : '', digits = mantissa.replace('-', '').replace('.', '');
  if (exponent < -4 || exponent >= 16)
    return sign + digits[0] + (digits.length > 1 ? '.' + digits.slice(1) : '') + 'e' + (exponent < 0 ? '-' : '+') + String(Math.abs(exponent)).padStart(2, '0');
  if (exponent < 0) return sign + '0.' + '0'.repeat(-exponent - 1) + digits;
  if (digits.length <= exponent + 1) return sign + digits + '0'.repeat(exponent + 1 - digits.length) + '.0';
  return sign + digits.slice(0, exponent + 1) + '.' + digits.slice(exponent + 1);
}

// A number the generator wrote as a Python float (all wall coordinates are).
// It serialises as a marked string that pyDumps turns back into the float.
const FLOAT_MARK = '\u0000';
export class PyFloat { constructor(value) { this.value = value; } toJSON() { return FLOAT_MARK + pyFloat(this.value) + FLOAT_MARK; } }

// json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', the
// generator's `encoded`. Compact JSON.stringify writes the same bytes for
// what the sectors hold: strings (control characters, U+2028 and astral
// characters included), integers up to 2^53 and floats whose shortest form has
// a decimal point. It differs for an integral float (90.0), -0.0, exponents,
// larger integers and integer-like keys, so those must arrive as PyFloat or
// not at all; a difference fails the round trip, never passes it.
export function pyDumps(value) {
  return JSON.stringify(value).replace(/"\\u0000([-+.e\d]+)\\u0000"/g, '$1') + '\n';
}

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
export const sectorId = (column, row) => String.fromCharCode(65 + column) + String(row + 1).padStart(2, '0');

function clipSegment(a, b, width, depth) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let lo = 0, hi = 1;
  for (const [p, q] of [[-dx, a[0]], [dx, width - a[0]], [-dy, a[1]], [dy, depth - a[1]]]) {
    if (Math.abs(p) < 1e-15) { if (q < 0) return null; }
    else if (p < 0) lo = Math.max(lo, q / p);
    else hi = Math.min(hi, q / p);
    if (lo > hi) return null;
  }
  return [[a[0] + lo * dx, a[1] + lo * dy], [a[0] + hi * dx, a[1] + hi * dy]];
}

// deduplicated_walls: an exact collinear interval union of every outline edge;
// a shared party wall keeps every owner. `buildings` must be sorted by id.
export function deduplicatedWalls(buildings) {
  const groups = new Map();
  for (const building of buildings) for (const polygon of building.outline) for (const ring of polygon)
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = ring[i], b = ring[i + 1], [ax, ay, bx, by] = [a[0], a[1], b[0], b[1]].map(n => Math.round(n * 10000));
      const dx = bx - ax, dy = by - ay;
      if (!dx && !dy) continue;
      const divisor = gcd(dx, dy);
      let ux = dx / divisor, uy = dy / divisor;
      if (ux < 0 || ux === 0 && uy < 0) { ux = -ux; uy = -uy; }
      const constant = ux * ay - uy * ax, norm = Math.hypot(ux, uy), vx = ux / norm, vy = uy / norm;
      const ta = a[0] * vx + a[1] * vy, tb = b[0] * vx + b[1] * vy, key = `${ux},${uy},${constant}`;
      if (!groups.has(key)) groups.set(key, {key: [ux, uy, constant], segments: []});
      groups.get(key).segments.push([Math.min(ta, tb), Math.max(ta, tb), building.id, a, vx, vy]);
    }
  const styles = new Map(buildings.map(b => [b.id, b])), result = [];
  const ordered = [...groups.values()].sort((p, q) => p.key[0] - q.key[0] || p.key[1] - q.key[1] || p.key[2] - q.key[2]);
  for (const {key, segments} of ordered) {
    const stops = [...new Set(segments.flatMap(s => [round(s[0], 9), round(s[1], 9)]))].sort((p, q) => p - q), active = [];
    for (let i = 0; i + 1 < stops.length; i++) {
      const left = stops[i], right = stops[i + 1];
      if (right - left < 1e-8) continue;
      const owners = [...new Set(segments.filter(s => s[0] < (left + right) / 2 && (left + right) / 2 < s[1]).map(s => s[2]))].sort();
      if (!owners.length) continue;
      const last = active.at(-1);
      if (last && last[2].join('\0') === owners.join('\0') && Math.abs(last[1] - left) < 1e-8) active[active.length - 1] = [last[0], right, owners];
      else active.push([left, right, owners]);
    }
    const [, , , a, vx, vy] = segments[0], base = a[0] * vx + a[1] * vy;
    for (const [left, right, owners] of active) {
      const id = 'wall-' + sha256(`[[${key.join(',')}],${pyFloat(left)},${pyFloat(right)}]\n`).slice(0, 18);
      result.push({id, a: [a[0] + (left - base) * vx, a[1] + (left - base) * vy], b: [a[0] + (right - base) * vx, a[1] + (right - base) * vy],
        owners, stories: Math.max(...owners.map(o => styles.get(o).storeys)), material: styles.get(owners[0]).material});
    }
  }
  return result;
}

// split_walls: clip to the town, cut at every sector line and into pieces of
// at most 64 m, and write native coordinates (sector origin, then minus 0.5).
export function splitWalls(walls, extent) {
  const {sectorSizeM: size, widthM: width, depthM: depth, columns, rows} = extent, pieces = new Map(), slivers = [];
  for (const wall of walls) {
    const clipped = clipSegment(wall.a, wall.b, width, depth);
    if (!clipped) continue;
    const [a, b] = clipped, dx = b[0] - a[0], dy = b[1] - a[1], cuts = new Set([0, 1]);
    if (Math.abs(dx) > 1e-12) for (let x = size; x < width; x += size) { const t = (x - a[0]) / dx; if (0 < t && t < 1) cuts.add(t); }
    if (Math.abs(dy) > 1e-12) for (let y = size; y < depth; y += size) { const t = (y - a[1]) / dy; if (0 < t && t < 1) cuts.add(t); }
    const ordered = [...cuts].sort((p, q) => p - q);
    let part = 0;
    for (let k = 0; k + 1 < ordered.length; k++) {
      const left = ordered[k], right = ordered[k + 1], divisions = Math.max(1, Math.ceil(Math.hypot(dx, dy) * (right - left) / 64));
      for (let i = 0; i < divisions; i++) {
        const lo = left + (right - left) * i / divisions, hi = left + (right - left) * (i + 1) / divisions;
        const start = [round(a[0] + dx * lo, 6), round(a[1] + dy * lo, 6)], end = [round(a[0] + dx * hi, 6), round(a[1] + dy * hi, 6)];
        const col = Math.min(columns - 1, Math.max(0, Math.floor((start[0] + end[0]) / 2 / size)));
        const row = Math.min(rows - 1, Math.max(0, Math.floor((start[1] + end[1]) / 2 / size)));
        const sid = sectorId(col, row), actual = Math.hypot(end[0] - start[0], end[1] - start[1]);
        part++;
        if (actual < 1e-6) continue;
        if (actual < .1 - 1e-6) { slivers.push({sourceWallId: wall.id, sectorId: sid, lengthM: actual}); continue; }
        if (!pieces.has(sid)) pieces.set(sid, []);
        pieces.get(sid).push({id: `md-${wall.id}-${part}`,
          a: [round(start[0] - col * size - .5, 6), round(start[1] - row * size - .5, 6)],
          b: [round(end[0] - col * size - .5, 6), round(end[1] - row * size - .5, 6)],
          z: 0, stories: wall.stories, material: wall.material, sourceBuildingIds: wall.owners, sourceWallId: wall.id});
      }
    }
  }
  return {pieces, slivers};
}

// polygon_spans: even/odd scan conversion at cell centres, holes included.
// Yields [y, start, end) per polygon in the generator's order; clamped to the
// town when width and depth are given.
export function* polygonSpans(polygons, width = Infinity, depth = Infinity) {
  for (const polygon of polygons) {
    const rows = new Map();
    for (const ring of polygon) for (let i = 0; i + 1 < ring.length; i++) {
      const a = ring[i], b = ring[i + 1];
      if (a[1] === b[1]) continue;
      const first = Math.max(0, Math.ceil(Math.min(a[1], b[1]) - .5)), last = Math.min(depth, Math.ceil(Math.max(a[1], b[1]) - .5));
      const slope = (b[0] - a[0]) / (b[1] - a[1]);
      for (let y = first; y < last; y++) { if (!rows.has(y)) rows.set(y, []); rows.get(y).push(a[0] + (y + .5 - a[1]) * slope); }
    }
    for (const y of [...rows.keys()].sort((p, q) => p - q)) {
      const values = rows.get(y).sort((p, q) => p - q);
      if (values.length % 2) throw Error('A ring did not produce even scanline crossings.');
      for (let i = 0; i < values.length; i += 2) {
        const start = Math.max(0, Math.ceil(values[i] - .5)), end = Math.min(width, Math.ceil(values[i + 1] - .5));
        if (start < end) yield [y, start, end];
      }
    }
  }
}

// ---- Loading the town ----

export async function loadTown(base = root) {
  const md = p => path.join(base, 'maps/mount-dora', p), json = p => JSON.parse(fs.readFileSync(md(p), 'utf8'));
  const config = json('source/authoring-config.json'), project = json('project.json'), features = json('features.json');
  const art = await import(pathToFileURL(path.join(base, 'sites/tactical-animal/dist/mission-art/mount-dora/manifest.js')).href);
  return {
    base, extent: config.extent, project, features, projection: createProjection(features.projection),
    authored: json('authored-buildings.json'), lidar: json('reference/lidar-roofs.json'),
    county: json('reference/county-buildings.json'), reference: json('reference/house-reference.json'), art,
    sectors: project.sectors.map(s => ({id: s.id, origin: s.origin, file: s.file, bytes: fs.readFileSync(md(s.file))})),
  };
}

// ---- Building the parts ----

// Ridge bearing measured on the real house (compass degrees, 0-180) to the
// ridge's angle in the part's own frame, from +x toward +y (0-180). The grid
// plan is the house turned by -rotationDeg, so the ridge turns with it.
export const localAxisDeg = (bearingDeg, rotationDeg) => { const v = round((((bearingDeg - 90 - rotationDeg) % 180) + 180) % 180, 1); return v === 180 ? 0 : v; };

const SHIFT_COORDINATES = new Set(['frontGables']);
const TREATMENT_KEYS = new Set(['type', 'wall', 'trim', 'roof', 'roofStyle', 'tint', 'stories', 'pitch', 'windowSpacing', 'veranda', 'roofFinish', 'roofAxis',
  'roofRiseLimit', 'crossGable', 'ornate', 'frontGables', 'turret', 'baseWall', 'archedLowerWindows', 'cornice', 'annex', 'wallFinish', 'depot']);
const TURRET_KEYS = new Set(['centre', 'radius', 'stories', 'capRiseFactor', 'placement']);
// The depot records distances and normalized wall fractions, independent of town position.
const DEPOT_KEYS = new Set(['eaveOverhang', 'chimney', 'eastSashes', 'southSashes', 'eastTrim']);

// The art kit's treatment, moved by `shift` metres. Its town coordinates are
// listed field by field; an unknown field refuses, so a new coordinate can
// never ride along unmoved.
export function shiftTreatment(treatment, [sx, sy]) {
  const out = {};
  for (const [key, value] of Object.entries(treatment)) {
    if (!TREATMENT_KEYS.has(key)) throw Error('Unknown art treatment field ' + key + '; add it to house-parts.mjs');
    if (SHIFT_COORDINATES.has(key)) out[key] = value.map(([x, y]) => [round(x + sx, 6), round(y + sy, 6)]);
    else if (key === 'turret') {
      for (const k of Object.keys(value)) if (!TURRET_KEYS.has(k)) throw Error('Unknown turret field ' + k);
      out[key] = {...value, centre: [round(value.centre[0] + sx, 6), round(value.centre[1] + sy, 6)]};
    } else if (key === 'depot') {
      for (const k of Object.keys(value)) if (!DEPOT_KEYS.has(k)) throw Error('Unknown depot field ' + k);
      out[key] = structuredClone(value);
    } else out[key] = value;
  }
  return out;
}

// The art kit's building placement, rebuilt from a part. The kit derives the
// anchor, bounds, polygons and solids from the outline; this is the inverse of
// what buildParts takes from it, and must reproduce PLACEMENTS exactly. In the
// town the kit skips facades a neighbour draws (placements.grid
// .suppressedWallEdges); a part used on its own draws every facade.
export function placementFromPart(part, {inTown = true} = {}) {
  const [x0, y0] = part.placements.grid.origin, [w, h] = part.size, a = part.appearance;
  const polygons = shiftOutline(part.outline, [x0, y0]);
  return {id: part.id, kind: 'building', sourceIds: [part.id], anchor: [x0 + w / 2, y0 + h / 2], bounds: [x0 - .5, y0 - .5, x0 + w + .5, y0 + h + .5], polygons,
    treatment: shiftTreatment(a.treatment, [x0, y0]), seed: a.seed, collisionPolicy: a.collisionPolicy, solids: [{kind: 'polygon', polygons}],
    replacesSourceIds: [part.id], provenance: a.provenance, suppressedWallEdges: inTown ? part.placements.grid.suppressedWallEdges : []};
}

const shiftOutline = (outline, [sx, sy], digits = null) =>
  outline.map(polygon => polygon.map(ring => ring.map(([x, y]) => digits === null ? [x + sx, y + sy] : [round(x + sx, digits), round(y + sy, digits)])));

// Floor cells inside an integer outline, as merged row spans [y, x0, x1].
export function floorCells(outline) {
  const rows = new Map();
  for (const [y, start, end] of polygonSpans(outline)) { if (!rows.has(y)) rows.set(y, []); rows.get(y).push([start, end]); }
  const out = [];
  for (const y of [...rows.keys()].sort((p, q) => p - q)) {
    const runs = rows.get(y).sort((p, q) => p[0] - q[0]);
    let [s, e] = runs[0];
    for (const [a, b] of runs.slice(1)) { if (a <= e) e = Math.max(e, b); else { out.push([y, s, e]); [s, e] = [a, b]; } }
    out.push([y, s, e]);
  }
  return out;
}

// Survey entrances (1 m edges of the authored outline in town metres) moved
// into the part's frame. None are recorded yet; the shape is the survey export's.
export function localEntrances(survey, [x0, y0]) {
  if (!survey) return {status: 'not-surveyed', records: []};
  if (!survey.entrances?.length) return {status: 'not-recorded', observed: survey.imageryDate ?? null, records: []};
  return {status: 'surveyed', observed: survey.imageryDate ?? null, confidence: survey.confidence ?? null, recorded: survey.at ?? null,
    source: 'house survey: a person viewing Google Maps imagery; no imagery is stored',
    records: survey.entrances.map(e => ({edge: e.segment.map(([x, y]) => [x - x0, y - y0])}))};
}

export function localEvidence(evidence, origin) {
  if (!evidence?.survey?.entrances) return evidence ?? null;
  return {...evidence, survey: {...evidence.survey, entrances: localEntrances(evidence.survey, origin).records}};
}

// Even/odd intervals of a polygon set on the horizontal line y.
function rowIntervals(polygons, y) {
  const xs = [];
  for (const polygon of polygons) for (const ring of polygon) for (let i = 0; i + 1 < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[i + 1];
    if ((ay > y) !== (by > y)) xs.push(ax + (y - ay) * (bx - ax) / (by - ay));
  }
  xs.sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

const totalLength = intervals => intervals.reduce((s, [a, b]) => s + b - a, 0);
function overlapLength(p, q) {
  let s = 0, i = 0, j = 0;
  while (i < p.length && j < q.length) {
    s += Math.max(0, Math.min(p[i][1], q[j][1]) - Math.max(p[i][0], q[j][0]));
    if (p[i][1] < q[j][1]) i++; else j++;
  }
  return s;
}

// Intersection over union of two polygon sets, by horizontal strips.
export function iou(p, q, step = .05) {
  const ys = [p, q].flat(3).map(v => v[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let inter = 0, union = 0;
  for (let y = y0 + step / 2; y < y1; y += step) {
    const a = rowIntervals(p, y), b = rowIntervals(q, y), both = overlapLength(a, b);
    inter += both; union += totalLength(a) + totalLength(b) - both;
  }
  return union ? inter / union : 0;
}

// Area centroid of a polygon set, whatever each ring's winding; holes subtract.
export function centroid(polygons) {
  let weight = 0, sx = 0, sy = 0;
  for (const polygon of polygons) polygon.forEach((ring, k) => {
    let area = 0, mx = 0, my = 0;
    for (let i = 0; i + 1 < ring.length; i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[i + 1], cross = ax * by - bx * ay;
      area += cross / 2; mx += (ax + bx) * cross / 6; my += (ay + by) * cross / 6;
    }
    if (!area) return;
    const w = (k ? -1 : 1) * Math.abs(area);
    weight += w; sx += w * mx / area; sy += w * my / area;
  });
  return [sx / weight, sy / weight];
}

// A point of the part placed with a pose {pivot, at, rotationDeg}.
export function placePoint([x, y], {pivot, at, rotationDeg}) {
  const t = rotationDeg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), dx = x - pivot[0], dy = y - pivot[1];
  return [at[0] + c * dx - s * dy, at[1] + s * dx + c * dy];
}

// The whole part placed as one unit, for a host that is not on a grid.
export function placePart(part, pose) {
  const p = {pivot: part.placements.pivot, ...pose};
  return {outline: part.outline.map(polygon => polygon.map(ring => ring.map(v => placePoint(v, p)))),
    walls: part.walls.map(w => ({...w, a: placePoint(w.a, p), b: placePoint(w.b, p)}))};
}

function addressOf(feature, reference) {
  const t = feature.tags || {};
  if (t['addr:housenumber'] && t['addr:street']) return {text: `${t['addr:housenumber']} ${t['addr:street']}`, source: 'osm'};
  if (reference?.address) return {text: reference.address, source: `county parcel ${reference.parcel?.altKey ?? ''}; join ${reference.match?.method ?? 'unknown'}`.replace(' ;', ';')};
  return null;
}

export function buildParts(town) {
  const buildings = town.features.features.filter(f => f.category === 'building');
  const records = new Map(town.authored.records.map(r => [r.id, r]));
  if (buildings.length !== records.size || buildings.some(f => !records.has(f.id))) throw Error('authored-buildings.json and features.json disagree on buildings');
  for (let i = 1; i < buildings.length; i++) if (!(buildings[i - 1].id < buildings[i].id)) throw Error('features.json buildings are not sorted by id');
  for (const f of buildings) if (JSON.stringify(f.geometry) !== JSON.stringify(records.get(f.id).geometry)) throw Error('Feature geometry differs from its grid plan: ' + f.id);
  const walls = deduplicatedWalls(buildings.map(f => ({id: f.id, outline: f.geometry.coordinates, storeys: f.nativeProxy.stories, material: f.nativeProxy.material})));
  const wallsOf = new Map();
  for (const w of walls) for (const o of w.owners) { if (!wallsOf.has(o)) wallsOf.set(o, []); wallsOf.get(o).push(w); }
  const roofs = new Map([...town.lidar.buildings.map(b => [b.id, {record: b, file: 'maps/mount-dora/reference/lidar-roofs.json'}]),
    ...town.county.buildings.map(b => [b.id, {record: b.lidar, file: 'maps/mount-dora/reference/county-buildings.json'}])]);
  const art = new Map(town.art.PLACEMENTS.filter(p => p.kind === 'building').map(p => [p.id, p]));
  const references = new Map(town.reference.buildings.map(b => [b.id, b]));
  const {dataset, acquired} = town.lidar.collection;
  return buildings.map(f => {
    const record = records.get(f.id), [x0, y0, x1, y1] = record.bounds, origin = [x0, y0], np = f.nativeProxy, d = record.derivation;
    const local = ([x, y]) => [x - x0, y - y0], outline = shiftOutline(record.geometry.coordinates, [-x0, -y0]);
    const theta = d.dominantAxisDegrees, source = f.geographicGeometry.coordinates;
    // Any pivot gives the same rigid placement. The centre of the bounds (also
    // the art kit's anchor) keeps each pose's `at`, and its latitude, on the house.
    const pivot = [(x1 - x0) / 2, (y1 - y0) / 2], grid = {pivot, at: [x0 + pivot[0], y0 + pivot[1]], rotationDeg: 0};
    // The true pose undoes the grid fit, which turned the measured house by
    // -theta about componentCentre and moved it by translationMetres. A
    // reviewed override moved the plan by hand instead, so its true pose sets
    // the plan's centroid on the measured centroid at the measured angle.
    const how = TRUE_POSE[d.method];
    if (!how) throw Error(`${f.id}: unknown grid-fit method ${d.method}; add how to find its true pose to TRUE_POSE in house-parts.mjs`);
    const inverts = how === 'inverse';
    const fitted = inverts ? {pivot: [d.componentCentre[0] + d.translationMetres[0] - x0, d.componentCentre[1] + d.translationMetres[1] - y0], at: d.componentCentre}
      : {pivot: centroid(outline), at: centroid(source)};
    const truth = {pivot, at: placePoint(pivot, {...fitted, rotationDeg: theta}), rotationDeg: theta};
    const posed = pose => outline.map(polygon => polygon.map(ring => ring.map(v => placePoint(v, pose))));
    const [lat, lon] = town.projection.toLatLon(truth.at[0], truth.at[1]);
    const roof = roofs.get(f.id);
    if (!roof?.record) throw Error(`${f.id} has no lidar roof record in lidar-roofs.json or county-buildings.json`);
    const r = roof.record, rf = r.roof || {};
    const placement = art.get(f.id);
    if (!placement) throw Error('No art placement for ' + f.id);
    const address = addressOf(f, references.get(f.id));
    const part = {
      kind: KIND, version: VERSION, id: f.id, name: f.tags?.name ?? null, address,
      rights: {...LICENSE, attribution: credits(usesCounty(f, address), dataset)}, frame: FRAME,
      size: [x1 - x0, y1 - y0], outline, floorCells: floorCells(outline),
      walls: (wallsOf.get(f.id) || []).map(w => ({a: local(w.a), b: local(w.b), sharedWith: w.owners.filter(o => o !== f.id), sourceWallId: w.id})),
      storeys: {count: np.stories, source: np.storiesSource, ...(np.halfStory ? {halfStorey: true} : {})},
      material: {wall: np.material, source: np.materialSource},
      kit: {storeyPitchM: np.floorPitchM, wallHeightM: np.wallHeightM, slabM: np.slabM, ...KIT, interiors: np.interiors},
      roof: {form: rf.form ?? null, confidence: rf.confidence ?? null, basis: rf.basis ?? null, pitchDeg: rf.pitchDeg ?? null, pitch12: rf.pitch12 ?? null,
        ridgeAxisDeg: rf.ridgeBearingDeg == null ? null : localAxisDeg(rf.ridgeBearingDeg, theta), ridgeBearingMeasuredDeg: rf.ridgeBearingDeg ?? null,
        groundM: r.groundM, eaveM: r.eaveM, upperEaveM: r.upperEaveM ?? null, upperShare: r.upperShare ?? null, ridgeM: r.ridgeM, coverage: r.coverage,
        heights: 'eaveM, upperEaveM and ridgeM are metres above groundM; groundM is NAVD88 metres; ridgeAxisDeg is in the part frame; coverage is the share, 0 to 1, of the outline that lidar roof returns cover',
        source: {dataset, observed: acquired.first, file: roof.file}},
      appearance: {kit: 'Mount Dora production art kit (sites/tactical-animal/dist/mission-art/mount-dora)',
        treatment: shiftTreatment(placement.treatment, [-x0, -y0]), seed: placement.seed, collisionPolicy: placement.collisionPolicy, provenance: placement.provenance},
      entrances: localEntrances(np.evidence?.survey, origin),
      placements: {pivot,
        grid: {frame: 'Mount Dora town metres, east and south', origin, at: grid.at, rotationDeg: 0, fitIoU: round(iou(posed(grid), source), 3),
          suppressedWallEdges: placement.suppressedWallEdges},
        true: {frame: 'Mount Dora town metres, east and south', at: truth.at.map(v => round(v, 6)), rotationDeg: round(theta, 6),
          latitude: round(lat, 8), longitude: round(lon, 8), fitIoU: round(iou(posed(truth), source), 3), method: d.method,
          basis: inverts ? 'the inverse of the grid fit' : 'the plan centroid on the measured centroid at the measured angle; the plan was moved by review, so the fit does not invert'}},
      evidence: localEvidence(np.evidence, origin),
      source: f.osm ? {osm: f.osm, tags: f.tags} : {county: f.county, tags: f.tags},
      provenance: {project: town.project.id, authoredLayoutSHA256: f.authoredLayoutSHA256, componentIds: record.componentIds, sectors: f.nativeSectors,
        derivation: {method: d.method, dominantAxisDegrees: d.dominantAxisDegrees, phase: d.phase, translationMetres: d.translationMetres, note: d.note},
        metrics: record.metrics,
        // The measured footprint in the part frame: the true pose lays it on the real house.
        geographicOutline: source.map(polygon => polygon.map(ring => ring.map(v => placePoint(v, {pivot: truth.at, at: pivot, rotationDeg: -theta}).map(n => round(n, 4)))))},
    };
    return part;
  });
}

// Parts whose art placement does not rebuild exactly from the part.
export function artMismatches(parts, town) {
  const kit = new Map(town.art.PLACEMENTS.filter(p => p.kind === 'building').map(p => [p.id, p]));
  return parts.filter(part => JSON.stringify(sortKeys(placementFromPart(part))) !== JSON.stringify(sortKeys(kit.get(part.id)))).map(part => part.id);
}

const sortKeys = v => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;

// ---- Stamping parts back into the town ----

// Rebuilds the building layers of every sector from the parts alone: floor
// terrain, upper masks, wall runs, levels and building ids. Everything else is
// copied from the committed sector. Returns each sector's bytes.
export function stampSectors(parts, town) {
  const {sectorSizeM: size, widthM: width, depthM: depth} = town.extent, byId = new Map(parts.map(p => [p.id, p]));
  const walls = new Map(), floor = new Set(), upper = new Map(), members = new Map(), add = (sid, id) => { if (!members.has(sid)) members.set(sid, new Set()); members.get(sid).add(id); };
  for (const part of [...parts].sort((p, q) => p.id < q.id ? -1 : 1)) {
    const origin = part.placements.grid.origin, town_ = ([x, y]) => [x + origin[0], y + origin[1]];
    for (const w of part.walls) {
      const owners = [part.id, ...w.sharedWith].sort(), copy = {id: w.sourceWallId, a: town_(w.a), b: town_(w.b), owners};
      const seen = walls.get(w.sourceWallId);
      if (seen && JSON.stringify(seen) !== JSON.stringify(copy)) throw Error('Shared wall copies disagree: ' + w.sourceWallId);
      walls.set(w.sourceWallId, copy);
    }
    for (const [y, left, right] of polygonSpans(shiftOutline(part.outline, origin), width, depth))
      for (let x = left; x < right; x++) {
        const sid = sectorId(Math.floor(x / size), Math.floor(y / size)), key = `${x % size},${y % size}`;
        floor.add(y * width + x); add(sid, part.id);
        for (let layer = 1; layer <= part.storeys.count; layer++) {
          if (!upper.has(sid + ':' + layer)) upper.set(sid + ':' + layer, {});
          upper.get(sid + ':' + layer)[key] = 'floor';
        }
      }
  }
  for (const w of walls.values()) {
    const missing = w.owners.find(o => !byId.has(o));
    if (missing) throw Error('Wall ' + w.id + ' names a part that is not here: ' + missing);
    w.stories = Math.max(...w.owners.map(o => byId.get(o).storeys.count));
    w.material = byId.get(w.owners[0]).material.wall;
  }
  const {pieces, slivers} = splitWalls(walls.values(), town.extent);
  for (const [sid, runs] of pieces) for (const run of runs) for (const o of run.sourceBuildingIds) add(sid, o);
  const out = new Map();
  for (const sector of town.sectors) {
    const map = JSON.parse(sector.bytes.toString('utf8')), sid = sector.id, ox = sector.origin.x, oy = sector.origin.y;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const isFloor = floor.has((oy + y) * width + ox + x);
      if (isFloor) map.terrain[y][x] = 'floor';
      else if (map.terrain[y][x] === 'floor') map.terrain[y][x] = 'no-part-for-this-floor';
    }
    const runs = (pieces.get(sid) || []).sort((p, q) => p.id < q.id ? -1 : 1);
    let levels = 3;
    for (const run of runs) levels = Math.max(levels, run.stories + 1);
    for (const key of upper.keys()) if (key.startsWith(sid + ':')) levels = Math.max(levels, Number(key.split(':')[1]) + 1);
    map.levels = levels;
    map.upper = Array.from({length: levels - 1}, (_, i) => upper.get(sid + ':' + (i + 1)) || {});
    map.mountDora.buildingIds = [...(members.get(sid) || [])].sort();
    if (runs.length) map.wallRuns = {version: 1, segments: runs.map(r => ({...r, a: r.a.map(v => new PyFloat(v)), b: r.b.map(v => new PyFloat(v))}))};
    else delete map.wallRuns;
    out.set(sid, Buffer.from(pyDumps(map), 'utf8'));
  }
  return {sectors: out, slivers};
}

const clip = v => { const s = JSON.stringify(v); return s === undefined ? '(absent)' : s.length > 160 ? s.slice(0, 160) + '…' : s; };

// The first JSON path where two parsed documents differ, so a mismatch names
// the field a generator change touched. Null when only bytes differ.
export function firstDifference(committed, stamped, at = '') {
  if (Object.is(committed, stamped)) return null;
  const objects = [committed, stamped].every(v => v && typeof v === 'object') && Array.isArray(committed) === Array.isArray(stamped);
  if (!objects) return {path: at || '(document)', committed: clip(committed), stamped: clip(stamped)};
  const keys = Array.isArray(committed) ? Array.from({length: Math.max(committed.length, stamped.length)}, (_, i) => i) : [...new Set([...Object.keys(committed), ...Object.keys(stamped)])];
  for (const key of keys) {
    const found = firstDifference(committed[key], stamped[key], at + (Array.isArray(committed) ? `[${key}]` : `.${key}`));
    if (found) return found;
  }
  return null;
}

// Compares stamped sectors with the committed files: the round trip.
export function roundTrip(parts, town) {
  const {sectors} = stampSectors(parts, town), rows = [];
  for (const sector of town.sectors) {
    const mine = sectors.get(sector.id), same = mine.equals(sector.bytes);
    let at = -1;
    if (!same) { at = 0; while (at < mine.length && mine[at] === sector.bytes[at]) at++; }
    rows.push({id: sector.id, identical: same, ...(same ? {} : {
      field: firstDifference(JSON.parse(sector.bytes.toString('utf8')), JSON.parse(mine.toString('utf8'))) ?? 'the values agree but the bytes differ (key order, number formatting or spacing)',
      byte: at, committed: sector.bytes.subarray(Math.max(0, at - 60), at + 60).toString('utf8'), stamped: mine.subarray(Math.max(0, at - 60), at + 60).toString('utf8')})});
  }
  return {sectors: rows.length, identical: rows.filter(r => r.identical).length, mismatches: rows.filter(r => !r.identical)};
}

// ---- Checks a part makes about itself ----

// Unit edges of axis-aligned integer segments, as "x0,y0:x1,y1" keys low to high.
function unitEdges(segments) {
  const out = [];
  for (const [a, b] of segments) {
    const dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]), n = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    for (let k = 0; k < n; k++) {
      const p = [a[0] + dx * k, a[1] + dy * k], q = [p[0] + dx, p[1] + dy];
      out.push(p[0] + p[1] < q[0] + q[1] ? `${p}:${q}` : `${q}:${p}`);
    }
  }
  return out;
}

export function validatePart(part) {
  const problems = [], fail = message => problems.push(part?.id + ': ' + message);
  if (part?.kind !== KIND || part.version !== VERSION) return [part?.id + ': not a house-part v1'];
  const points = part.outline.flat(2), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  if (!points.every(p => Number.isInteger(p[0]) && Number.isInteger(p[1]))) fail('outline is not on the 1 m grid');
  if (Math.min(...xs) !== 0 || Math.min(...ys) !== 0) fail('outline does not start at the origin');
  if (Math.max(...xs) !== part.size[0] || Math.max(...ys) !== part.size[1]) fail('size is not the outline extent');
  const rings = part.outline.flat(1), edges = rings.flatMap(r => r.slice(1).map((b, i) => [r[i], b]));
  const open = rings.some(r => r.length < 5 || r[0].join() !== r.at(-1).join()), slanted = edges.some(([a, b]) => a[0] !== b[0] && a[1] !== b[1]);
  if (open) fail('a ring is not closed');
  if (slanted) fail('an outline edge is not axis-aligned');
  // The cell and wall checks need a closed, axis-aligned outline.
  if (open || slanted) return problems;
  if (JSON.stringify(floorCells(part.outline)) !== JSON.stringify(part.floorCells)) fail('floorCells are not the outline cells');
  const wallSegments = part.walls.map(w => [w.a, w.b]);
  if (!wallSegments.flat(2).every(Number.isInteger)) fail('a wall is not on the 1 m grid');
  const outlineEdges = unitEdges(edges).sort(), wallEdges = unitEdges(wallSegments).sort();
  if (JSON.stringify(outlineEdges) !== JSON.stringify(wallEdges)) fail('walls do not trace the outline exactly once');
  if (new Set(part.walls.map(w => w.sourceWallId)).size !== part.walls.length) fail('a wall id repeats');
  if (!(Number.isInteger(part.storeys.count) && part.storeys.count >= 1 && part.storeys.count <= 5)) fail('storeys out of range 1-5');
  if (!MATERIALS.includes(part.material.wall)) fail('unsupported wall material ' + part.material.wall);
  const {pivot, grid} = part.placements;
  if (!pivot.every(Number.isFinite) || !grid.origin.every(Number.isInteger)) fail('placement pivot or origin invalid');
  if (!['not-surveyed', 'not-recorded', 'surveyed'].includes(part.entrances.status)) fail('unknown entrance status');
  return problems;
}

// ---- Files ----

// One top-level field per line, so a diff names the field that changed.
export const formatPart = part => '{\n' + Object.entries(part).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n}\n';

export function formatIndex({parts, ...head}) {
  return '{\n' + Object.entries(head).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')
    + ',\n "parts": [\n' + parts.map(p => '  ' + JSON.stringify(p)).join(',\n') + '\n ]\n}\n';
}

// ---- 24 x 24 blocks for the Nautilus workshop ----

// The engine treats a wall run that touches a block's edge as crossing into
// the next block: wallsInSector (packages/map-core/wall-runs.js at 2502646)
// then refuses to place or capture that neighbour. So every block keeps at
// least 1 m of yard on each side, and a house fits only up to 22 x 22 m.
export const BLOCK = {size: 24, ground: 'yard', maxLevels: 6, marginM: 1};
export const BLOCK_MAX_M = BLOCK.size - 2 * BLOCK.marginM;
export const blockFits = part => part.size[0] <= BLOCK_MAX_M && part.size[1] <= BLOCK_MAX_M && part.storeys.count + 1 <= BLOCK.maxLevels;

// A Nautilus `red-shift-block` v1 holding the house alone, centred, with its
// walls as native wall runs. The workshop imports it, saves it in its Blocks
// library and places it in any map; blocks land on the 24 m grid.
export function toBlock(part, partSha256) {
  if (!blockFits(part)) throw Error(`${part.id} does not fit a block: it is ${part.size.join(' x ')} m with ${part.storeys.count} storeys, and a block holds at most ${BLOCK_MAX_M} x ${BLOCK_MAX_M} m and ${BLOCK.maxLevels - 1} storeys`);
  const [w, h] = part.size, ox = Math.floor((BLOCK.size - w) / 2), oy = Math.floor((BLOCK.size - h) / 2), storeys = part.storeys.count;
  const levels = Math.max(3, storeys + 1), terrain = Array.from({length: BLOCK.size}, () => Array(BLOCK.size).fill(BLOCK.ground));
  const upper = Array.from({length: levels - 1}, () => ({}));
  for (const [y, x0, x1] of part.floorCells) for (let x = x0; x < x1; x++) {
    terrain[y + oy][x + ox] = 'floor';
    for (let z = 1; z <= storeys; z++) upper[z - 1][`${x + ox},${y + oy}`] = 'floor';
  }
  const segments = part.walls.map(wall => ({id: wall.sourceWallId, a: [wall.a[0] + ox - .5, wall.a[1] + oy - .5], b: [wall.b[0] + ox - .5, wall.b[1] + oy - .5],
    z: 0, stories: storeys, material: part.material.wall}));
  const low = BLOCK.marginM - .5, high = BLOCK.size - BLOCK.marginM - .5;
  if (!segments.every(s => [...s.a, ...s.b].every(v => v >= low && v <= high))) throw Error(part.id + ': a wall would touch the block edge');
  // The engine takes a name of 1 to 60 characters (validateMap in vendored maps.js at 2502646).
  return {kind: 'red-shift-block', version: 1, size: BLOCK.size, levels, name: (part.name || part.address?.text || part.id).slice(0, 60),
    terrain, upper, edges: {}, props: [], stairs: [], climbs: [], guards: [], wallRuns: {version: 1, segments},
    housePart: {id: part.id, sha256: partSha256, offset: [ox, oy], file: `${PARTS_DIR}/${part.id}.json`}};
}
