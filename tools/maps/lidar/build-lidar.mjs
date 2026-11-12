// Per-building roof form and height, and a 1 m bare-earth grid, for the Mount
// Dora game map from USGS 3DEP lidar (FL_Peninsular_Lake_2018, flown in
// December 2018).
//
// Reads the node cache written by fetch-lidar.mjs (checked against
// reference/lidar/source.json), the footprints in maps/mount-dora/features.json
// (geographicGeometry) and reference/house-reference.json (county storeys, used
// only to validate). Writes:
//   reference/lidar-roofs.json               one record per game building
//   reference/lidar/bare-earth.png           1 m terrain, centimetres above NAVD88
//   reference/lidar/bare-earth-source.png    per cell: 0 measured, 1 filled, 2 water
//   reference/lidar/bare-earth.json          grid definition, encoding, statistics
//   reference/lidar/crowns.json              tree crowns: top, centre, area,
//                                            height and width of each
//   reference/lidar/water-roofs.json         roofs over the lake no outline
//                                            covers: boathouses, covered slips
//   reference/county-buildings.json          county-sketched buildings the game
//                                            lacks, placed on their roofs
//                                            (county-buildings.mjs), each with
//                                            a planned Street View camera
// Nothing here edits the generator, the sectors or the art kit.
//
//   node tools/maps/lidar/build-lidar.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {area, bounds, centroid, contains} from '../house-reference/geometry.mjs';
import {featuresPin, isOsm} from '../house-reference/features-digest.mjs';
import {createProjection} from '../house-reference/projection.mjs';
import {ADDRESS_NEAR_M, ADDRESS_SLACK_M, aerialUrl, planStreetView, VIEW_RADIUS_M, viewRoads} from '../house-reference/viewpoint.mjs';
import {cacheDir, MARGIN_M} from './fetch-lidar.mjs';
import {loadPoints, pointsIn} from './points.mjs';
import {classifyRoof, median, percentile, ROOF} from './roofs.mjs';
import {canopyHeights, findCrowns, roofCrowns, CROWNS} from './crowns.mjs';
import {findWaterRoofs, WATER_ROOFS} from './water-roofs.mjs';
import {decodePng, encodePng, fillGaps, maskOf} from './raster.mjs';
import {brief, occupancy, PLACE, placeCountyBuildings, underfoot} from './county-buildings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const town = path.join(root, 'maps/mount-dora'), ref = path.join(town, 'reference'), out = path.join(ref, 'lidar');
const targets = {roofs: path.join(ref, 'lidar-roofs.json'), county: path.join(ref, 'county-buildings.json'), terrain: path.join(out, 'bare-earth.json'),
  elevation: path.join(out, 'bare-earth.png'), source: path.join(out, 'bare-earth-source.png'), crowns: path.join(out, 'crowns.json'),
  waterRoofs: path.join(out, 'water-roofs.json')};
const hash = data => createHash('sha256').update(data).digest('hex');
const r2 = v => v === null || Number.isNaN(v) ? null : Math.round(v * 100) / 100, r1 = v => v === null || Number.isNaN(v) ? null : Math.round(v * 10) / 10;
const r3 = v => Math.round(v * 1000) / 1000;

export const GROUND = {ringM: 4, minRingPoints: 10};
export const SHIFTS = {searchM: 4};
// Fixed before the first run: one storey below a 4.6 m wall top, then one more
// every 3.2 m. The wall top is the plane-based eave (see WALLS).
export const STOREY_RULE = {firstTopM: 4.6, perStoreyM: 3.2};
export const storeysFromWall = wall => wall < STOREY_RULE.firstTopM ? 1 : 2 + Math.floor((wall - STOREY_RULE.firstTopM) / STOREY_RULE.perStoreyM);
// The run passes only if all three hold; each shifted-footprint control must fail.
export const GATE = {minCoveredShare: .8, coveredAt: .5, minFootprintM2: 20, minAuc: .8, minKappa: .4};
export const CONTROLS = [{id: 'shift-30m-east', dx: 30, dy: 0}, {id: 'shift-30m-north', dx: 0, dy: -30}];
const LANDMARKS = {
  lakesideInn: ['osm-way-560095890', 'osm-way-560095891', 'osm-way-560095892', 'osm-way-560095893', 'osm-way-560095894',
    'osm-way-560095895', 'osm-way-560095897', 'osm-way-560095898', 'osm-way-560095899'],
  donnellyHouse: 'osm-way-547799531',
  lighthouse: {at: [500.2877, 1169.7989], realFt: 35, proxyM: 10.6, source: 'docs/art/mount-dora/production-sources.json (city-history); production.md (10.6 m proxy)'},
};

const shift = (mp, dx, dy) => mp.map(poly => poly.map(ring => ring.map(([x, y]) => [x + dx, y + dy])));
function edgeDistance(mp, [x, y]) {
  let best = Infinity;
  for (const poly of mp) for (const ring of poly) for (let i = 0; i + 1 < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

// The outline's wall direction (0–90°): the length-weighted mode of its outer
// edges' bearings, folded by 90° and pooled within 5°.
export function outlineAxisDeg(mp) {
  const edges = [];
  for (const poly of mp) { const ring = poly[0]; for (let i = 0; i + 1 < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[i + 1], len = Math.hypot(bx - ax, by - ay);
    if (len) edges.push([((Math.atan2(bx - ax, ay - by) * 180 / Math.PI) % 90 + 90) % 90, len]);
  } }
  let best = 0, axis = 0;
  for (let a = 0; a < 90; a += .5) {
    let s = 0;
    for (const [b, len] of edges) { const d = Math.abs(a - b); if (Math.min(d, 90 - d) <= 5) s += len; }
    if (s > best) { best = s; axis = a; }
  }
  return axis;
}
const fold90 = (a, b) => { const d = Math.abs(a - b) % 90; return Math.min(d, 90 - d); };

// GPS time in these files is adjusted standard GPS time (seconds since the GPS
// epoch minus 1e9); 18 leap seconds separate GPS from UTC since 2017.
const gpsDate = t => new Date(Date.UTC(1980, 0, 6) + (t + 1e9 - 18) * 1000).toISOString().slice(0, 10);

function verifyCache(source) {
  const files = [];
  for (const [key, , bytes, sha] of source.nodes.list) {
    const file = path.join(cacheDir, 'ept-data', `${key}.laz`);
    assert(fs.existsSync(file), `Lidar cache is missing ${key}.laz; run node tools/maps/lidar/fetch-lidar.mjs first.`);
    const data = fs.readFileSync(file);
    assert(data.length === bytes && hash(data) === sha, `Lidar cache file ${key}.laz differs from source.json; re-run fetch-lidar.mjs.`);
    files.push(file);
  }
  return files;
}

// Class-6 (building) returns against the outlines: the shift of the outlines
// that puts most of their area over building returns.
function registration(index, houses) {
  const cell = .5, {box} = index, w = Math.ceil((box[2] - box[0]) / cell), h = Math.ceil((box[3] - box[1]) / cell), occ = new Uint8Array(w * h);
  for (let k = 0; k < index.total; k++) if (index.cls[k] === 6) occ[Math.floor((index.y[k] - box[1]) / cell) * w + Math.floor((index.x[k] - box[0]) / cell)] = 1;
  const samples = houses.map(house => {
    const pts = [], [x0, y0, x1, y1] = house.box;
    for (let y = Math.floor(y0 / cell) * cell + cell / 2; y < y1; y += cell) for (let x = Math.floor(x0 / cell) * cell + cell / 2; x < x1; x += cell)
      if (contains(house.geometry, [x, y])) pts.push(x, y);
    return pts;
  });
  const score = (list, dx, dy) => {
    let hit = 0, n = 0;
    for (const i of list) {
      const pts = samples[i];
      for (let k = 0; k < pts.length; k += 2) {
        const ci = Math.floor((pts[k] + dx - box[0]) / cell), cj = Math.floor((pts[k + 1] + dy - box[1]) / cell);
        if (ci >= 0 && cj >= 0 && ci < w && cj < h) hit += occ[cj * w + ci];
        n++;
      }
    }
    return n ? hit / n : 0;
  };
  // Whole-cell shifts are exact on this lattice; a parabola through the
  // neighbours of the best one places the peak between cells.
  const best = list => {
    const steps = Math.round(SHIFTS.searchM / cell), s = new Map();
    let top = null;
    for (let j = -steps; j <= steps; j++) for (let i = -steps; i <= steps; i++) {
      const v = score(list, i * cell, j * cell); s.set(`${i},${j}`, v);
      if (!top || v > top.v + 1e-12) top = {i, j, v};
    }
    const at = (i, j) => s.get(`${i},${j}`) ?? top.v;
    const vertex = (m, c, p) => { const d = m - 2 * c + p; return d < 0 ? Math.max(-.5, Math.min(.5, (m - p) / (2 * d))) : 0; };
    return {dx: r2((top.i + vertex(at(top.i - 1, top.j), top.v, at(top.i + 1, top.j))) * cell),
      dy: r2((top.j + vertex(at(top.i, top.j - 1), top.v, at(top.i, top.j + 1))) * cell), score: top.v, lattice: [top.i * cell, top.j * cell]};
  };
  const all = houses.map((_, i) => i), global = best(all);
  const sectors = new Map();
  houses.forEach((house, i) => { const key = `${Math.floor(house.centre[0] / 240)},${Math.floor(house.centre[1] / 240)}`; if (!sectors.has(key)) sectors.set(key, []); sectors.get(key).push(i); });
  const perSector = [...sectors.values()].filter(list => list.length >= 10).map(list => ({...best(list), buildings: list.length}));
  const spread = perSector.map(s => Math.hypot(s.dx - global.dx, s.dy - global.dy)).sort((p, q) => p - q);
  const [lx, ly] = global.lattice;
  return {dx: global.dx, dy: global.dy, overlapAtShift: r3(global.score), overlapUnshifted: r3(score(all, 0, 0)),
    overlapAtControls: Object.fromEntries(CONTROLS.map(c => [c.id, r3(score(all, lx + c.dx, ly + c.dy))])),
    sectors: perSector.length, sectorOffsetFromGlobalM: {median: r2(percentile(spread, .5)), max: r2(spread.at(-1))},
    method: `Share of 0.5 m footprint cells over class-6 returns at every whole-cell shift within ±${SHIFTS.searchM} m, peak placed by a parabola through its neighbours; per 240 m sector with 10+ buildings for the spread.`};
}

function terrain(index, lake) {
  const {box, cols, rows, start} = index, n = cols * rows, sum = new Float64Array(n), count = new Uint32Array(n);
  const inLake = maskOf(lake, box[0], box[1], cols, rows), water = [];
  for (let c = 0; c < n; c++) for (let k = start[c]; k < start[c + 1]; k++) {
    if (index.cls[k] === 2) { sum[c] += index.z[k]; count[c]++; }
    else if (index.cls[k] === 9 && inLake[c]) water.push(index.z[k]);
  }
  const level = median(water), values = new Float64Array(n), kind = new Uint8Array(n);
  for (let c = 0; c < n; c++) {
    if (count[c]) values[c] = sum[c] / count[c];
    else if (inLake[c]) { values[c] = level; kind[c] = 2; }
    else { values[c] = NaN; kind[c] = 1; }
  }
  const filled = fillGaps(values, cols, rows);
  return {filled, kind, level, waterReturns: water.length};
}

export function analyse(index, house, geometry, gridZ) {
  const box = bounds(geometry), ring = GROUND.ringM, wide = [box[0] - ring, box[1] - ring, box[2] + ring, box[3] + ring];
  const ground = [], roof = {x: [], y: [], z: []}, loose = {x: [], y: [], z: []};
  for (const k of pointsIn(index, wide)) {
    const p = [index.x[k], index.y[k]], c = index.cls[k], inside = contains(geometry, p);
    if (c === 2) { if (!inside && edgeDistance(geometry, p) <= ring) ground.push(index.z[k]); continue; }
    if (!inside) continue;
    if (c === 6) { roof.x.push(p[0]); roof.y.push(p[1]); roof.z.push(index.z[k]); }
    else if (c === 1 && (index.ret[k] & 7) === ((index.ret[k] >> 3) & 7)) { loose.x.push(p[0]); loose.y.push(p[1]); loose.z.push(index.z[k]); }
  }
  let groundM, groundSource = 'ring', groundRange = null;
  if (ground.length >= GROUND.minRingPoints) {
    const s = Float64Array.from(ground).sort();
    groundM = percentile(s, .5); groundRange = [percentile(s, .1), percentile(s, .9)];
  } else { groundM = gridZ(house.centre); groundSource = 'grid'; }
  // Class 6 is the vendor's building class; unclassified last returns stand in
  // only where class 6 covers under 30% of the outline (sheds, carports).
  let roofSource = 'class6';
  const cells = new Set(roof.x.map((x, i) => `${Math.floor(x / ROOF.cellM)},${Math.floor(roof.y[i] / ROOF.cellM)}`));
  if (cells.size * ROOF.cellM ** 2 < .3 * house.area) {
    for (let i = 0; i < loose.x.length; i++) if (loose.z[i] - groundM >= 1.5) { roof.x.push(loose.x[i]); roof.y.push(loose.y[i]); roof.z.push(loose.z[i]); }
    roofSource = 'class6+unclassified';
  }
  const heights = Float64Array.from(roof.z, z => z - groundM).sort();
  const result = classifyRoof(geometry, box, roof, house.area);
  const pct = Object.fromEntries([['p05', .05], ['p10', .1], ['p25', .25], ['p50', .5], ['p75', .75], ['p90', .9], ['p95', .95], ['p98', .98]].map(([k, p]) => [k, percentile(heights, p)]));
  // Eave from the planes; the quartile height where no plane was found.
  const eave = Number.isFinite(result.eaveZ) ? result.eaveZ - groundM : pct.p25;
  const upper = result.upper && result.upper.eaveZ - groundM >= eave + 1.5 ? {eave: result.upper.eaveZ - groundM, share: result.upper.share} : null;
  return {groundM, groundSource, groundRange, groundPoints: ground.length, roofPoints: roof.z.length, roofSource, pct, eave, upper, result,
    storeys: result.form === 'unknown' || Number.isNaN(eave) ? null : storeysFromWall(eave)};
}

// Mann-Whitney AUC of `score` separating positives from negatives (ties 1/2).
export function auc(pos, neg) {
  if (!pos.length || !neg.length) return null;
  const all = [...pos.map(v => [v, 1]), ...neg.map(v => [v, 0])].sort((a, b) => a[0] - b[0]);
  let sumPos = 0;
  for (let i = 0; i < all.length;) {
    let j = i;
    while (j < all.length && all[j][0] === all[i][0]) j++;
    const mid = (i + j + 1) / 2; // mean rank of the tied run
    for (let k = i; k < j; k++) if (all[k][1]) sumPos += mid;
    i = j;
  }
  return (sumPos - pos.length * (pos.length + 1) / 2) / (pos.length * neg.length);
}

export function kappa(pairs, classes) {
  const n = pairs.length, idx = new Map(classes.map((c, i) => [c, i])), m = classes.map(() => classes.map(() => 0));
  for (const [a, b] of pairs) m[idx.get(a)][idx.get(b)]++;
  const po = classes.reduce((s, _, i) => s + m[i][i], 0) / n;
  const pe = classes.reduce((s, _, i) => s + m[i].reduce((t, v) => t + v, 0) * m.reduce((t, row) => t + row[i], 0), 0) / (n * n);
  return {kappa: pe < 1 ? (po - pe) / (1 - pe) : null, agreement: po, matrix: m};
}

// The wall-top measures: the plane-based eave (used), and the one fixed before
// the first run, which read the 5th-percentile height (the deck median if flat).
export const WALLS = {eave: r => r.eaveM, preRegistered: r => r.roof.form === 'flat' ? r.heightM.p50 : r.heightM.p05};

// County STORIES against the lidar, the same way for the real outlines and the controls.
export function validate(records, county, wallOf = WALLS.eave) {
  const rows = records.map(r => ({r, c: county.get(r.id), wall: wallOf(r)})).filter(({r, c, wall}) => c && c.stories && r.roof.form !== 'unknown' && wall !== null && !Number.isNaN(wall));
  const sized = records.filter(r => r.areaM2 >= GATE.minFootprintM2);
  const coveredShare = sized.filter(r => r.coverage >= GATE.coveredAt).length / sized.length;
  const multi = rows.filter(x => x.c.stories >= 2), single = rows.filter(x => x.c.stories === 1);
  const a = auc(multi.map(x => x.wall), single.map(x => x.wall));
  const bucket = v => Math.min(3, v);
  const k = kappa(rows.map(x => [bucket(x.c.stories), bucket(storeysFromWall(x.wall))]), [1, 2, 3]);
  const half = rows.filter(x => x.c.stories === 1 && x.c.halfStory), plain = rows.filter(x => x.c.stories === 1 && !x.c.halfStory);
  const rise = x => x.r.ridgeM - x.wall;
  const byCounty = {};
  for (const s of [1, 2, 3]) {
    const list = rows.filter(x => bucket(x.c.stories) === s).map(x => x.wall).sort((p, q) => p - q);
    byCounty[s === 3 ? '3+' : String(s)] = {buildings: list.length, wallM: list.length ? {p25: r2(percentile(list, .25)), p50: r2(percentile(list, .5)), p75: r2(percentile(list, .75))} : null};
  }
  const gate = {coveredShare: r3(coveredShare), auc: a === null ? null : r3(a), kappa: k.kappa === null ? null : r3(k.kappa)};
  gate.pass = coveredShare >= GATE.minCoveredShare && a >= GATE.minAuc && k.kappa >= GATE.minKappa;
  return {buildings: records.length, comparedWithCounty: rows.length, gate,
    storeys: {agreement: r3(k.agreement), confusion: {rows: 'county 1 / 2 / 3+', columns: 'lidar 1 / 2 / 3+', matrix: k.matrix}, wallByCountyStoreys: byCounty},
    halfStoreyRoofRise: {aucHalfVsPlain: (v => v === null ? null : r3(v))(auc(half.map(rise), plain.map(rise))), half: half.length, plain: plain.length,
      medianRiseM: {half: r2(median(half.map(rise))), plain: r2(median(plain.map(rise)))}}};
}

const record = (house, a) => {
  const res = a.result, p = a.pct;
  return {id: house.feature.id, areaM2: r1(house.area), groundM: r2(a.groundM), groundSource: a.groundSource,
    groundRangeM: a.groundRange && a.groundRange.map(r2), groundPoints: a.groundPoints, roofPoints: a.roofPoints, roofSource: a.roofSource,
    coverage: r2(res.coverage), heightM: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, r2(v)])),
    eaveM: r2(a.eave), ridgeM: r2(p.p98), storeysFromLidar: a.storeys,
    upperEaveM: a.upper && r2(a.upper.eave), upperShare: a.upper && r2(a.upper.share),
    roof: {form: res.form, confidence: r2(res.confidence), basis: res.basis, ridgeBearingDeg: res.ridge ? Math.round(res.ridge.bearingDeg) % 180 : null,
      pitchDeg: r1(res.pitchDeg), pitch12: res.pitchDeg === null ? null : Math.round(Math.tan(res.pitchDeg * Math.PI / 180) * 24) / 2,
      planes: res.planes.length, explained: r2(res.explained), flatShare: r2(res.flatShare),
      edges: res.edges && {eaveM: r1(res.edges.eaveM), rakeM: r1(res.edges.rakeM), upM: r1(res.edges.upM), rakeShare: r2(res.edges.rakeShare)}},
    planes: res.planes.slice(0, 6).map(r => [r1(r.areaM2), r1(r.slopeDeg), Math.round(r.aspectDeg) % 360, r3(r.rms), r2(r.lowZ - a.groundM), r2(r.highZ - a.groundM)])};
};

function lighthouse(index, at) {
  const near = [], ground = [];
  for (const k of pointsIn(index, [at[0] - 15, at[1] - 15, at[0] + 15, at[1] + 15])) {
    const d = Math.hypot(index.x[k] - at[0], index.y[k] - at[1]);
    if (index.cls[k] === 2 && d >= 3 && d <= 15) ground.push(index.z[k]);
    else if (index.cls[k] !== 2 && index.cls[k] !== 9 && d <= 3) near.push(index.z[k]);
  }
  const g = median(ground), s = Float64Array.from(near).sort();
  const top = s.length ? s[s.length - 1] - g : null;
  return {points: near.length, groundM: r2(g), topM: r2(top), topFt: top === null ? null : r1(top / .3048), p95M: r2(percentile(s, .95) - g)};
}

export async function build() {
  const read = f => fs.readFileSync(path.join(town, f));
  const featuresBytes = read('features.json'), sourceBytes = read('reference/lidar/source.json'), countyBytes = read('reference/house-reference.json');
  const project = JSON.parse(read('project.json')), features = JSON.parse(featuresBytes).features, source = JSON.parse(sourceBytes);
  const county = new Map(JSON.parse(countyBytes).buildings.map(b => [b.id, {stories: b.suggested.stories, halfStory: b.suggested.halfStory, roofPitch: b.suggested.roofPitch, roofCover: b.suggested.roofCover, yearBuilt: b.suggested.yearBuilt}]));
  const files = verifyCache(source);
  const W = project.extent.widthM, D = project.extent.depthM, extent = [0, 0, W, D], box = [-MARGIN_M, -MARGIN_M, W + MARGIN_M, D + MARGIN_M];
  const index = await loadPoints(files, project.projection, box, extent);

  const lake = features.find(f => f.category === 'water' && f.tags.name === 'Lake Dora').geometry.coordinates;
  const houses = features.filter(f => f.category === 'building' && isOsm(f)).map(f => {
    const geometry = f.geographicGeometry.coordinates;
    return {feature: f, geometry, box: bounds(geometry), area: area(geometry), centre: centroid(geometry)};
  }).sort((a, b) => a.feature.id.localeCompare(b.feature.id));

  // Terrain over the box, then cropped to the game extent.
  const t = terrain(index, lake), {cols} = index, m = MARGIN_M;
  const gridZ = ([x, y]) => t.filled[Math.min(index.rows - 1, Math.max(0, Math.floor(y + m))) * cols + Math.min(cols - 1, Math.max(0, Math.floor(x + m)))];
  const elevation = new Uint16Array(W * D), kind = new Uint8Array(W * D);
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const c = (j + m) * cols + (i + m);
    elevation[j * W + i] = Math.round(t.filled[c] * 100); kind[j * W + i] = t.kind[c];
  }

  const reg = registration(index, houses);
  // Tree crowns over the game extent, found in the lidar's frame and moved into the
  // town (OSM) frame by taking the outline registration out.
  // The crowns the penetration rule drops are found by finding the crowns once more
  // without it; roofCrowns takes out the roofs once the drawn outlines are known.
  const canopy = canopyHeights(index, (x, y) => gridZ([x, y]), extent);
  const toTown = c => ({...c, top: [c.top[0] - reg.dx, c.top[1] - reg.dy], centre: [c.centre[0] - reg.dx, c.centre[1] - reg.dy]});
  const foundCrowns = findCrowns(canopy).map(toTown), kept = new Set(foundCrowns.map(c => c.top.join(',')));
  const notFoliage = findCrowns(canopy, {...CROWNS, minMultiShare: 0}).map(toTown).filter(c => !kept.has(c.top.join(',')));
  const analyseAll = (dx, dy) => houses.map(house => {
    const g = shift(house.geometry, reg.dx + dx, reg.dy + dy), a = analyse(index, {...house, centre: [house.centre[0] + reg.dx + dx, house.centre[1] + reg.dy + dy]}, g, gridZ);
    return record(house, a);
  });
  const buildings = analyseAll(0, 0);
  const controlRecords = CONTROLS.map(c => analyseAll(c.dx, c.dy));
  const validation = validate(buildings, county);
  validation.controls = CONTROLS.map((c, i) => { const v = validate(controlRecords[i], county); return {id: c.id, shiftM: [c.dx, c.dy], gate: v.gate, comparedWithCounty: v.comparedWithCounty}; });
  validation.controlsFail = validation.controls.every(c => !c.gate.pass);
  const pre = validate(buildings, county, WALLS.preRegistered);
  validation.preRegistered = {wall: '5th-percentile roof height (median if flat)', gate: pre.gate, storeys: pre.storeys,
    controls: CONTROLS.map((c, i) => ({id: c.id, gate: validate(controlRecords[i], county, WALLS.preRegistered).gate})),
    note: 'The measure fixed before the first run. It failed the gate: porch, carport and wing roofs inside an outline put its low percentile at their eaves, so two-storey houses read as one. The plane-based eave replaced it; thresholds and gate are unchanged.'};

  // County roof cover against lidar form: tar & gravel should read flat, shingle/metal/tile pitched.
  const coverCheck = {};
  for (const b of buildings) {
    const c = county.get(b.id);
    if (!c?.roofPitch || b.roof.form === 'unknown') continue;
    const key = c.roofPitch, e = coverCheck[key] ||= {buildings: 0, flat: 0, gable: 0, hip: 0, other: 0};
    e.buildings++; e[b.roof.form]++;
  }
  validation.countyRoofCover = coverCheck;

  // Buildings the county dates after the December 2018 flight should often be missing from it.
  const built = b => county.get(b.id)?.yearBuilt ?? 0, after = buildings.filter(b => built(b) >= 2019), thin = buildings.filter(b => b.coverage < GATE.coveredAt);
  validation.builtAfterFlight = {countyYearBuilt2019On: after.length, ofThemUnderHalfCovered: after.filter(b => b.coverage < GATE.coveredAt).length,
    underHalfCovered: thin.length, ofThemBuilt2019On: thin.filter(b => built(b) >= 2019).length};

  // Ridges run along or across the walls; seeded random bearings set the chance level.
  const geometryOf = new Map(houses.map(h => [h.feature.id, h.geometry]));
  let seed = 20181206;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  validation.ridgeVsOutline = Object.fromEntries(['gable', 'hip'].map(form => {
    const list = buildings.filter(b => b.roof.form === form), dev = list.map(b => fold90(b.roof.ridgeBearingDeg, outlineAxisDeg(geometryOf.get(b.id)))).sort((p, q) => p - q);
    const chance = list.map(b => fold90(random() * 180, outlineAxisDeg(geometryOf.get(b.id))));
    const share = (xs, t) => r3(xs.filter(v => v <= t).length / xs.length);
    return [form, {buildings: list.length, medianDeg: r1(percentile(dev, .5)), within5Deg: share(dev, 5), within10Deg: share(dev, 10), randomWithin10Deg: share(chance, 10)}];
  }));

  const byId = new Map(buildings.map(b => [b.id, b])), pick = id => {
    const b = byId.get(id), c = county.get(id), f = houses.find(h => h.feature.id === id).feature;
    return {id, name: f.tags.name || null, countyStoreys: c?.stories ?? null, lidarStoreys: b.storeysFromLidar, eaveM: b.eaveM, ridgeM: b.ridgeM,
      upperEaveM: b.upperEaveM, upperShare: b.upperShare, p05M: b.heightM.p05, form: b.roof.form, confidence: b.roof.confidence, coverage: b.coverage, groundM: b.groundM};
  };
  const lh = LANDMARKS.lighthouse, lhAt = [lh.at[0] + reg.dx, lh.at[1] + reg.dy];
  validation.landmarks = {lakesideInn: LANDMARKS.lakesideInn.map(pick), donnellyHouse: pick(LANDMARKS.donnellyHouse),
    lighthouse: {townPoint: lh.at, ...lighthouse(index, lhAt), realFt: lh.realFt, realM: r2(lh.realFt * .3048), gameProxyM: lh.proxyM, sources: lh.source}};

  // County-sketched buildings the game lacks, on their roofs, then measured like
  // the game's own (heights above the ground ring, roof planes).
  const houseRef = JSON.parse(countyBytes);
  const holders = new Map(houseRef.buildings.flatMap(b => b.county.records.map(r => [`${r.altKey}/${r.bldgNum}`, b.id])));
  // Structures the game already draws besides its buildings: the generator's
  // hand-placed shelters and stages, and OSM multi-storey car parks (drawn as
  // lots; a closed block would wall off an open parking deck).
  const asGame = (id, mp) => ({id, geometry: mp, box: bounds(mp)});
  const placedCounty = placeCountyBuildings({sketches: houseRef.countyOnly, holders, base: reg, grid: occupancy(index),
    games: [...houses.map(h => asGame(h.feature.id, h.geometry)),
      ...(JSON.parse(featuresBytes).authoredStructures ?? []).map(s => asGame(s.id, (s.geographicGeometry ?? s.geometry).coordinates)),
      ...features.filter(f => isOsm(f) && f.tags.parking === 'multi-storey' && f.geometry.type === 'MultiPolygon').map(f => asGame(f.id, (f.geographicGeometry ?? f.geometry).coordinates))]});
  const saw = (b, seen) => b.roofShare >= PLACE.roofAt ? 'class-6 roof'
    : seen.raisedShare >= .5 ? 'raised returns without the building class: a deck classed as ground, or a roof under trees'
    : seen.groundShare >= .5 ? 'open ground in December 2018; placed on the county record alone' : 'too few returns to tell';
  // The survey's camera, planned as for the game buildings in house-reference.json.
  const view = viewRoads(features), {toLatLon} = createProjection(project.projection);
  const countyBuildings = placedCounty.buildings.map(b => {
    const geometry = shift(b.geometry, reg.dx, reg.dy), house = {feature: {id: b.id}, area: area(b.geometry), centre: centroid(geometry)};
    const a = analyse(index, house, geometry, gridZ), seen = b.roofShare >= PLACE.roofAt ? null : underfoot(index, pointsIn, geometry, a.groundM);
    const lidar = record(house, a), centre = centroid(b.geometry);
    const streetView = planStreetView(view, {geometry: b.geometry, box: bounds(b.geometry), centre},
      {stories: b.county.suggested.stories ?? lidar.storeysFromLidar, address: b.lot.address}, toLatLon);
    return {id: b.id, areaM2: r1(house.area), centroid: centre.map(r2), address: b.lot.address, placeName: b.lot.placeName, parcel: b.lot.parcel,
      angleDeg: b.angleDeg, clippedByGameM2: b.clippedByGameM2, ...(b.piece ? {piece: b.piece} : {}),
      roofShare: b.roofShare, lidarSaw: saw(b, seen), ...(seen ? {underfoot: seen} : {}),
      members: b.members.map(brief), geometry: {type: 'MultiPolygon', coordinates: b.geometry}, county: b.county, lidar,
      streetView, aerialUrl: aerialUrl(centre, toLatLon)};
  });
  const tally = (list, fn) => Object.fromEntries([...list.reduce((m, x) => m.set(fn(x), (m.get(fn(x)) || 0) + 1), new Map())].sort());
  // Roofs over the lake that no drawn outline covers: OSM and county buildings, and the
  // generator's own structures (the mapped shelters among them). All in the OSM frame: the
  // generator writes a structure's geographicGeometry only when the town moved it, so one
  // without it never moved and its geometry is the OSM frame's.
  const drawn = [...houses.map(h => h.geometry), ...placedCounty.buildings.map(b => b.geometry),
    ...(JSON.parse(featuresBytes).authoredStructures ?? []).map(st => (st.geographicGeometry ?? st.geometry).coordinates)];
  const {roofs: waterRoofs, leftOut: waterLeftOut} = findWaterRoofs(index, {lake, drawn, reg, level: t.level, extent});
  const countyCompared = countyBuildings.filter(b => b.county.suggested.stories && b.lidar.storeysFromLidar);
  const countyDoc = {kind: 'mount-dora-county-buildings', version: 1,
    inputs: {features: featuresPin(featuresBytes), houseReference: {file: 'maps/mount-dora/reference/house-reference.json', sha256: hash(countyBytes), usedFor: 'countyOnly sketches and the records game buildings hold'},
      lidar: {file: 'maps/mount-dora/reference/lidar/source.json', sha256: hash(sourceBytes)}},
    policy: 'Lake County Property Appraiser building sketches that no game building claims, placed on public-domain USGS 3DEP lidar roofs. build-mount-dora.py adds `buildings` to the town; `represented` lists sketches of buildings the game already has. Street View is opened in Google Maps by URL for a person to look at; no imagery is requested, stored or traced. No owner, value or sale data.',
    method: {place: PLACE, frame: 'Town metres in the OSM frame, as the game outlines: the sketch shift is applied after the outline registration of lidar-roofs.json is taken out.',
      register: `Each sketch moves by the whole 0.5 m cell shift within ±${PLACE.searchM} m that puts most of it over class-6 returns; one with under ${PLACE.roofAt} of its area on a roof stays where the county drew it.`,
      structures: `Sketches that overlap or come within ${PLACE.touchM} m are one structure: stacked condo units, attached units, a house drawn twice. Its outline is their union, closed across gaps under ${PLACE.touchM} m and simplified to ${PLACE.simplifyM} m in its own wall axes.`,
      represented: `Already in the game: a structure ${PLACE.onGameAt * 100}%+ on game buildings, the generator's hand-placed shelters and stages, or OSM multi-storey car parks; a roofless one over a game building by more than ${PLACE.staleOnGameAt * 100}%; a sketch whose record a game building holds and overlaps by more than ${PLACE.holderAt * 100}%; one with under ${PLACE.minAddM2} m² or ${PLACE.minAddShare * 100}% of its area outside game buildings.`,
      added: 'Every other structure, minus the parts game buildings cover. Heights and roof planes as in lidar-roofs.json. County facts: the largest sketch\'s record, lot and address, with the tallest record\'s storeys.',
      streetView: `For the survey, planned as for the game buildings (house-reference.json, tools/maps/house-reference/viewpoint.mjs). The camera stands within ${VIEW_RADIUS_M} m: on the lot's addressed street where its nearest point is within ${ADDRESS_NEAR_M} m, or no more than ${ADDRESS_SLACK_M} m farther than the nearest public road; else on that public road, then a service road, then any mapped way. It faces the outline's centre. The pitch rises with the county storeys, or the lidar's where the county has none; the game buildings' cameras are planned before the lidar, from county storeys alone.`},
    metrics: {sketches: houseRef.countyOnly.length, represented: placedCounty.represented.length, representedBy: tally(placedCounty.represented, r => r.reason.replace(/\d+%/, 'N%').replace(/only [\d.]+ m2/, 'only N m2')),
      buildings: countyBuildings.length, sketchesInBuildings: countyBuildings.reduce((n, b) => n + b.members.length, 0), areaM2: r1(countyBuildings.reduce((n, b) => n + b.areaM2, 0)),
      lidarSaw: tally(countyBuildings, b => b.lidarSaw), storeysFromLidar: tally(countyBuildings, b => String(b.lidar.storeysFromLidar)),
      countyStoreysAgreeWithLidar: {compared: countyCompared.length, agree: countyCompared.filter(b => b.county.suggested.stories === b.lidar.storeysFromLidar).length},
      withStreetView: countyBuildings.filter(b => b.streetView).length, onAddressedStreet: countyBuildings.filter(b => b.streetView?.onAddressedStreet).length},
    buildings: countyBuildings, represented: placedCounty.represented};

  const s = index.stats, areaM2 = W * D, flights = [...s.flights.values()];
  const dates = [...new Set(flights.flatMap(f => [gpsDate(f.lo), gpsDate(f.hi)]))].sort();
  const forms = Object.fromEntries(['flat', 'gable', 'hip', 'other', 'unknown'].map(f => [f, buildings.filter(b => b.roof.form === f).length]));
  const confident = Object.fromEntries(['flat', 'gable', 'hip', 'other'].map(f => [f, buildings.filter(b => b.roof.form === f && b.roof.confidence >= .7).length]));
  const collection = {dataset: source.dataset, acquired: {first: dates[0], last: dates.at(-1), flightLines: flights.length, days: dates},
    pointsInExtent: s.inExtent, densityPerM2: {allReturns: r1(s.inExtent / areaM2), usable: r1((s.inExtent - s.withheld - s.classes[7] - s.classes[18]) / areaM2),
      firstReturns: r1(s.first / areaM2), ground: r1(s.classes[2] / areaM2), building: r1(s.classes[6] / areaM2)},
    classes: Object.fromEntries(s.classes.map((v, c) => [c, v]).filter(([, v]) => v)), withheld: s.withheld,
    classNames: {1: 'unclassified', 2: 'ground', 6: 'building', 7: 'low noise', 9: 'water', 17: 'bridge deck', 18: 'high noise', 20: 'ignored ground'}};

  const metrics = {buildings: buildings.length, forms, confidentAtLeast07: confident,
    withRidgeBearing: buildings.filter(b => b.roof.ridgeBearingDeg !== null).length,
    groundFromRing: buildings.filter(b => b.groundSource === 'ring').length,
    roofFromUnclassified: buildings.filter(b => b.roofSource !== 'class6').length,
    medianCoverage: r2(median(buildings.map(b => b.coverage))),
    storeysFromLidar: Object.fromEntries([1, 2, 3, 4, 5].map(n => [n, buildings.filter(b => b.storeysFromLidar === n).length]).filter(([, v]) => v)),
    groundRangeM: [r2(Math.min(...buildings.map(b => b.groundM))), r2(Math.max(...buildings.map(b => b.groundM)))]};

  const roofs = {kind: 'mount-dora-lidar-roofs', version: 1,
    inputs: {features: featuresPin(featuresBytes),
      lidar: {file: 'maps/mount-dora/reference/lidar/source.json', sha256: hash(sourceBytes)},
      county: {file: 'maps/mount-dora/reference/house-reference.json', sha256: hash(countyBytes), usedFor: 'validation only'}},
    policy: 'Public-domain USGS 3DEP lidar. Heights are metres above the ground ring around each outline; elevations are NAVD88 metres. Nothing here edits the generator, sectors or art kit.',
    collection, registration: reg,
    method: {roofPoints: 'class 6 (building) returns inside the registered outline; unclassified last returns 1.5 m+ above ground added where class 6 covers under 30% of it',
      ground: `median of class-2 (ground) returns within ${GROUND.ringM} m outside the outline; the bare-earth grid where fewer than ${GROUND.minRingPoints}`,
      eave: 'area-weighted median of the roof planes\' low edges (5th-percentile cells): where the roof over most of the outline meets the walls; a flat roof\'s deck; the quartile height where no plane was found',
      upperEave: 'where a taller roof stands at least 1.5 m above that eave: the low edge of the substantial planes (10%+ of plane area) topping out within 1 m of the highest, and their share of the plane area (null otherwise)',
      planes: 'up to six largest planes: [area m², slope °, downslope bearing °, fit rms m, low edge m, top m]; heights above the ground',
      ridge: '98th percentile of roof heights', percentiles: 'heightM holds percentiles of every roof return above the ground',
      roof: ROOF, storeyRule: STOREY_RULE, gate: GATE, controls: CONTROLS},
    metrics, validation, buildings};
  const elevationPng = encodePng(W, D, 16, elevation), sourcePng = encodePng(W, D, 8, kind);
  const measured = kind.filter(v => v === 0).length, wet = kind.filter(v => v === 2).length;
  let lo = Infinity, hi = -Infinity;
  for (const v of elevation) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const terrainDoc = {kind: 'mount-dora-bare-earth', version: 1, inputs: roofs.inputs.lidar,
    grid: {originM: [0, 0], cellM: 1, columns: W, rows: D, axes: project.projection.horizontalAxes, cell: 'column i, row j covers town x in [i, i+1) and y in [j, j+1); row 0 is the northern edge'},
    elevation: {file: 'bare-earth.png', encoding: '16-bit grayscale PNG; sample = elevation in centimetres above NAVD88 (GEOID12B)', samplesSha256: hash(Buffer.from(elevation.buffer))},
    source: {file: 'bare-earth-source.png', encoding: '8-bit grayscale PNG; 0 = mean of the ground returns in the cell, 1 = filled (push-pull interpolation under buildings, trees and gaps), 2 = water (Lake Dora at the lidar water level)', samplesSha256: hash(Buffer.from(kind.buffer))},
    stats: {minM: lo / 100, maxM: hi / 100, measuredShare: r3(measured / kind.length), filledShare: r3((kind.length - measured - wet) / kind.length), waterShare: r3(wet / kind.length),
      lakeLevelM: r2(t.level), lakeLevelFt: r2(t.level / .3048), lakeWaterReturns: t.waterReturns},
    collection: {dataset: source.dataset, acquired: [collection.acquired.first, collection.acquired.last]}};
  const pieces = waterRoofs.flatMap(w => w.pieces);
  const waterRoofsDoc = {kind: 'mount-dora-lidar-water-roofs', version: 4, inputs: {features: featuresPin(featuresBytes), lidar: roofs.inputs.lidar},
    policy: 'Public-domain USGS 3DEP lidar, flown in December 2018. Roofs the lidar sees on Lake Dora where no OpenStreetMap or county outline exists: boathouses and covered slips. The art kit draws each piece as a roof on posts; walls, if any, are unknown.',
    collection: {dataset: source.dataset, acquired: [collection.acquired.first, collection.acquired.last]},
    method: {rules: WATER_ROOFS,
      roofs: `Building (class 6) returns, moved into the town frame by the outline registration (${reg.dx}, ${reg.dy}) m and binned in ${WATER_ROOFS.cellM} m cells; two cells join into one roof, over land and water alike, where some return of one lies within ${WATER_ROOFS.joinM} m of some return of the other (cells up to two apart are compared, so a roof is its returns' own cluster at that distance, wherever the grid falls). A roof is kept when at least ${WATER_ROOFS.lakeReachM2} m² of it lies in Lake Dora's OSM outline, and at most ${WATER_ROOFS.drawnShareMax * 100}% of it inside an outline the game draws (OSM and county buildings, the generator's structures). A roof joined to a drawn one beyond that share is that building's own (a wing, a porch, an attached boathouse its county sketch leaves out) and is not kept.`,
      outline: `Cells within ${WATER_ROOFS.drawnMarginM} m of a drawn outline are left to it. The rest of a roof splits into parts that join eight ways; a part of ${WATER_ROOFS.minAreaM2} m² or more is outlined by rectangles in its own frame (pieces): the smallest rectangle around it, unless that roofs over an open rectangle of ${WATER_ROOFS.pieceMinM2} m², ${WATER_ROOFS.pieceMinWidthM} m wide, its cells (closed by a 3 x 3 square) do not fill; otherwise the largest rectangles its cells fill, one after another, in the frame where the largest is biggest, while one of that size remains. A piece stands over water where ${WATER_ROOFS.pieceLakeMin * 100}% of it lies in the lake's outline, or where the lidar sees water around it: ${WATER_ROOFS.ringReadMin * 100}% of the cells within ${WATER_ROOFS.ringM} m read as water or ground (no roof over them) and ${WATER_ROOFS.ringWaterMin * 100}% of those read as water (water returns, or no return at all: calm water returns none). A dock or reeds in the water read as water too: a cell within ${WATER_ROOFS.dockReachM} m of such water, with no ground return (classes 2 and 20) and most of its returns between half a metre under the lake's level and ${WATER_ROOFS.lowM} m over it. The rest are left out: 'not over water' where what is read of the ring is not water, 'too little read around it' where it is water but under ${WATER_ROOFS.ringReadMin * 100}% of the ring is read. The pieces kept form groups, joined where their returns lie within ${WATER_ROOFS.joinM} m of one another; a group under half in the lake's outline by area that touches a piece left out as not over water is part of what stands on land, and is left out with it, recording the group's share (groupLakeShare) and how many such pieces it touched (landTouched). All are listed in leftOut with their measures. Parts under ${WATER_ROOFS.minAreaM2} m², and roofs left with none, go without a record. nearBar lists, for each piece and record, the measures within ${WATER_ROOFS.barBand} of their bar that decide it (moved across the bar alone, they would keep it, leave it out, or change why): shares counted in grid cells, which may fall either way as the grid or the registration moves.`,
      heights: 'Per piece, from its own returns, in metres above the lake\'s lidar level: the eave from the roof planes as in lidar-roofs.json (the 25th percentile where none is found), the ridge at the 98th percentile; form and pitch by the same rules (roofs.mjs).'},
    lakeLevelM: r2(t.level),
    metrics: {roofs: waterRoofs.length, pieces: pieces.length, piecesAreaM2: r1(pieces.reduce((n, p) => n + p.areaM2, 0)), roofsAreaM2: r1(waterRoofs.reduce((n, w) => n + w.areaM2, 0)),
      leftToOutlinesM2: r1(waterRoofs.reduce((n, w) => n + w.leftToOutlinesM2, 0)), leftOut: waterLeftOut.length, leftOutM2: r1(waterLeftOut.reduce((n, p) => n + p.areaM2, 0)), forms: tally(pieces, p => p.form)},
    roofs: waterRoofs.map((w, i) => ({id: `lidar-water-roof-${i}`, areaM2: r2(w.areaM2), lakeShare: r3(w.lakeShare), drawnShare: r3(w.drawnShare), leftToOutlinesM2: r2(w.leftToOutlinesM2),
      outlinedM2: r2(w.outlinedM2), coverage: r3(w.coverage), onLand: {pieces: w.onLand.pieces, areaM2: r2(w.onLand.areaM2)}, returns: w.returns,
      pieces: w.pieces.map(p => ({outline: p.outline.map(q => q.map(r2)), areaM2: r2(p.areaM2), fill: r3(p.fill), angleDeg: r1(p.angleDeg), eaveM: r2(p.eaveM), ridgeM: r2(p.ridgeM),
        form: p.form, confidence: r3(p.confidence), pitchDeg: p.pitchDeg === null ? null : r1(p.pitchDeg), ridgeBearingDeg: p.ridgeBearingDeg === null ? null : r1(p.ridgeBearingDeg), returns: p.returns, lakeShare: r3(p.lakeShare), ringRead: r3(p.ringRead), ringWater: p.ringWater === null ? null : r3(p.ringWater), nearBar: p.nearBar}))})),
    leftOut: waterLeftOut.map(p => ({outline: p.outline.map(q => q.map(r2)), areaM2: r2(p.areaM2), reason: p.reason, returns: p.returns,
      ...(p.lakeShare === undefined ? {} : {lakeShare: r3(p.lakeShare), ringRead: r3(p.ringRead), ringWater: p.ringWater === null ? null : r3(p.ringWater), nearBar: p.nearBar}),
      ...(p.groupLakeShare === undefined ? {} : {groupLakeShare: r3(p.groupLakeShare), landTouched: p.landTouched})}))};
  const sortedOf = list => Float64Array.from(list).sort();
  const row = c => [r2(c.top[0]), r2(c.top[1]), r2(c.centre[0]), r2(c.centre[1]), r2(c.areaM2), r2(c.heightM), r2(c.widthM), r3(c.multiShare), c.topShare === null ? null : r3(c.topShare)];
  const roofTops = roofCrowns(foundCrowns, drawn), crowns = foundCrowns.filter(c => !roofTops.includes(c));
  const crownHeights = sortedOf(crowns.map(c => c.heightM)), crownWidths = sortedOf(crowns.map(c => c.widthM)), crownShares = sortedOf(crowns.map(c => c.multiShare));
  const crownsDoc = {kind: 'mount-dora-lidar-crowns', version: 3, inputs: {lidar: roofs.inputs.lidar, features: featuresPin(featuresBytes)},
    policy: 'Public-domain USGS 3DEP lidar, flown in December 2018. Each crown is canopy the lidar saw that reads as a tree; a few are roofs or thickets these rules cannot tell from one (docs/maps/mount-dora/grid-shapes-followups.md lists the known ones). build-mount-dora.py plants one tree in each crown its seeded greenery leaves empty; nothing here edits the sectors or the art kit.',
    collection: {dataset: source.dataset, acquired: [collection.acquired.first, collection.acquired.last]},
    method: {rules: CROWNS,
      canopy: `The highest unclassified (class 1) return over the bare earth in each ${CROWNS.cellM} m cell, where it stands ${CROWNS.tallM} m or more above it and the cell holds no building (class 6) return. This vendor classes no vegetation, so wires, poles, signs and roofs it left unclassified are among it.`,
      crowns: `Each canopy cell climbs a 3 x 3 mean of the canopy to the top it reaches. Neighbouring tops are one crown unless the lower stands ${CROWNS.prominenceM} m above the saddle between them, merged highest saddle first and never into a crown over ${CROWNS.maxAreaM2} m². A crown under ${CROWNS.minAreaM2} m² or under ${CROWNS.minWidthM} m across (four standard deviations along its minor axis) is dropped.`,
      foliage: `A crown is kept only where at least ${CROWNS.minMultiShare * 100}% of its canopy returns (unclassified, ${CROWNS.tallM} m or more up) came from pulses that returned more than once: foliage lets a pulse through, a wire, pole, sign or roof left unclassified stops it. multiShare records each crown's share and topShare that of the canopy returns within ${CROWNS.topM} m of its top (null where none stands there); notFoliage lists the crowns the rule drops.`,
      roofs: `A crown centred inside an outline the game draws (OSM and county buildings, the generator's structures) whose top stops the scanner (topShare under ${CROWNS.minMultiShare * 100}%) and which as a whole reads under ${CROWNS.roofShare * 100}% is that building's roof, left unclassified; a tree overhanging a roof lets the scanner through across its crown. roofTops lists them.`,
      frame: `Town metres in the OSM frame: the lidar position minus the outline registration of lidar-roofs.json (${reg.dx}, ${reg.dy}) m, which features.json's OSM outlines set.`},
    metrics: {crowns: crowns.length, notFoliage: notFoliage.length, roofTops: roofTops.length, canopyAreaHa: r2(crowns.reduce((s, c) => s + c.areaM2, 0) / 1e4),
      multiShare: {p10: r3(percentile(crownShares, .1)), p50: r3(percentile(crownShares, .5))},
      heightM: {p10: r2(percentile(crownHeights, .1)), p50: r2(percentile(crownHeights, .5)), p90: r2(percentile(crownHeights, .9))},
      widthM: {p10: r2(percentile(crownWidths, .1)), p50: r2(percentile(crownWidths, .5)), p90: r2(percentile(crownWidths, .9))}},
    columns: ['topX', 'topY', 'centreX', 'centreY', 'areaM2', 'heightM', 'widthM', 'multiShare', 'topShare'],
    crowns: crowns.map(row), notFoliage: notFoliage.map(row), roofTops: roofTops.map(row)};
  return {roofsText: JSON.stringify(roofs, null, 1) + '\n', countyText: JSON.stringify(countyDoc, null, 1) + '\n',
    terrainText: JSON.stringify(terrainDoc, null, 1) + '\n', crownsText: JSON.stringify(crownsDoc) + '\n', waterRoofsText: JSON.stringify(waterRoofsDoc, null, 1) + '\n',
    elevationPng, sourcePng, elevation, kind};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert(args.length === 0 || args.length === 1 && args[0] === '--check', 'Usage: node tools/maps/lidar/build-lidar.mjs [--check]');
  const started = Date.now(), built = await build();
  if (args[0] === '--check') {
    for (const f of Object.values(targets)) assert(fs.existsSync(f), `${path.relative(root, f)} is missing; run without --check.`);
    assert.equal(hash(fs.readFileSync(targets.roofs)), hash(built.roofsText), 'lidar-roofs.json is stale; rerun without --check.');
    assert.equal(hash(fs.readFileSync(targets.county)), hash(built.countyText), 'county-buildings.json is stale; rerun without --check.');
    assert.equal(hash(fs.readFileSync(targets.terrain)), hash(built.terrainText), 'bare-earth.json is stale; rerun without --check.');
    assert.equal(hash(fs.readFileSync(targets.crowns)), hash(built.crownsText), 'crowns.json is stale; rerun without --check.');
    assert.equal(hash(fs.readFileSync(targets.waterRoofs)), hash(built.waterRoofsText), 'water-roofs.json is stale; rerun without --check.');
    // PNG bytes depend on the zlib build; the samples must match exactly.
    assert.equal(hash(Buffer.from(decodePng(fs.readFileSync(targets.elevation)).samples.buffer)), hash(Buffer.from(built.elevation.buffer)), 'bare-earth.png is stale.');
    assert.equal(hash(Buffer.from(decodePng(fs.readFileSync(targets.source)).samples.buffer)), hash(Buffer.from(built.kind.buffer)), 'bare-earth-source.png is stale.');
    console.log(`Lidar roofs, terrain, crowns and water roofs are current (${((Date.now() - started) / 1000).toFixed(0)} s).`);
  } else {
    fs.mkdirSync(out, {recursive: true});
    fs.writeFileSync(targets.roofs, built.roofsText); fs.writeFileSync(targets.county, built.countyText); fs.writeFileSync(targets.terrain, built.terrainText);
    fs.writeFileSync(targets.crowns, built.crownsText); fs.writeFileSync(targets.waterRoofs, built.waterRoofsText);
    fs.writeFileSync(targets.elevation, built.elevationPng); fs.writeFileSync(targets.source, built.sourcePng);
    const r = JSON.parse(built.roofsText);
    console.log(JSON.stringify({collection: r.collection.acquired, density: r.collection.densityPerM2, registration: {dx: r.registration.dx, dy: r.registration.dy},
      metrics: r.metrics, gate: r.validation.gate, controls: r.validation.controls.map(c => [c.id, c.gate]), seconds: (Date.now() - started) / 1000}, null, 1));
  }
}
