// County-sketched buildings the game lacks, placed on their lidar roofs.
//
// house-reference.json lists every Lake County building sketch no game building
// claims (`countyOnly`). Many are still buildings the game already has: a
// sketch drawn a few metres off its house, or one condo unit per floor drawn
// over the building that holds them. Others are real buildings missing from
// OpenStreetMap. The class-6 (building) lidar returns tell the two apart.
//
// Each sketch is shifted, within SEARCH_M, onto the building returns; sketches
// of one structure (stacked units, attached units) then overlap or touch and
// are merged into one outline. A structure that lies mostly on game buildings
// is already in the game; so is a roofless sketch over one, and a sketch whose
// record a game building holds and overlaps. Every other structure is added,
// minus any part a game building already covers. Sketches with no roof under
// them stay where the county drew them, and the record says what the lidar
// saw there. build-lidar.mjs calls `countyBuildings`; the pure helpers here are
// exported for tests.
import {area, bounds, centroid, contains} from '../house-reference/geometry.mjs';

// Fixed before the run that wrote reference/county-buildings.json.
export const PLACE = {cellM: .5, searchM: 4, roofAt: .5, touchM: .5, onGameAt: .5, staleOnGameAt: .1, holderAt: .05,
  minAddM2: 10, minAddShare: .25, outlineCellM: .1, simplifyM: .25, groundM: .5, raisedM: 1.5};

const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const keyOf = c => `${c.altKey}/${c.bldgNum}`;
export const idOf = c => `county-${c.altKey}-${c.bldgNum}`;

// 0.5 m cell centres inside a footprint, as a flat [x, y, ...] list.
export function samples(mp, cell = PLACE.cellM) {
  const pts = [], [x0, y0, x1, y1] = bounds(mp);
  for (let y = Math.floor(y0 / cell) * cell + cell / 2; y < y1; y += cell)
    for (let x = Math.floor(x0 / cell) * cell + cell / 2; x < x1; x += cell) if (contains(mp, [x, y])) pts.push(x, y);
  return pts;
}

// Building-return occupancy on a 0.5 m lattice over the index box.
export function occupancy(index, cell = PLACE.cellM, classes = [6]) {
  const {box} = index, w = Math.ceil((box[2] - box[0]) / cell), h = Math.ceil((box[3] - box[1]) / cell), occ = new Uint8Array(w * h), want = new Set(classes);
  for (let k = 0; k < index.total; k++) if (want.has(index.cls[k])) occ[Math.floor((index.y[k] - box[1]) / cell) * w + Math.floor((index.x[k] - box[0]) / cell)] = 1;
  return {occ, w, h, box, cell};
}

export function shareOver(pts, grid, dx, dy) {
  const {occ, w, h, box, cell} = grid;
  let hit = 0;
  for (let k = 0; k < pts.length; k += 2) {
    const i = Math.floor((pts[k] + dx - box[0]) / cell), j = Math.floor((pts[k + 1] + dy - box[1]) / cell);
    if (i >= 0 && j >= 0 && i < w && j < h) hit += occ[j * w + i];
  }
  return pts.length ? hit / (pts.length / 2) : 0;
}

// The whole-cell shift within ±searchM that puts most of the footprint over
// building returns; ties go to the smaller shift. `base` maps the OSM frame
// into the lidar frame (the outline registration), so the shift returned is in
// the OSM frame.
export function register(pts, grid, base, searchM = PLACE.searchM) {
  const steps = Math.round(searchM / grid.cell);
  let best = {i: 0, j: 0, share: -1};
  for (let j = -steps; j <= steps; j++) for (let i = -steps; i <= steps; i++) {
    const share = shareOver(pts, grid, base.dx + i * grid.cell, base.dy + j * grid.cell);
    if (share > best.share + 1e-9 || Math.abs(share - best.share) <= 1e-9 && i * i + j * j < best.i * best.i + best.j * best.j) best = {i, j, share};
  }
  return {dx: best.i * grid.cell, dy: best.j * grid.cell, share: best.share};
}

export const shift = (mp, dx, dy) => mp.map(poly => poly.map(ring => ring.map(([x, y]) => [x + dx, y + dy])));

export function edgeDistance(mp, [x, y]) {
  let best = Infinity;
  for (const poly of mp) for (const ring of poly) for (let i = 0; i + 1 < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

// The wall direction of a set of polygons (radians, in (-pi/4, pi/4]): the
// length-weighted circular mean of 4 x edge bearing, as mount_dora_grid.py does.
export function dominantAngle(polygons) {
  let co = 0, si = 0;
  for (const poly of polygons) for (const ring of poly) for (let i = 0; i + 1 < ring.length; i++) {
    const dx = ring[i + 1][0] - ring[i][0], dy = ring[i + 1][1] - ring[i][1], w = dx * dx + dy * dy, t = Math.atan2(dy, dx);
    co += w * Math.cos(4 * t); si += w * Math.sin(4 * t);
  }
  return Math.atan2(si, co) / 4;
}

// Boundary of a 0/1 raster as closed rings of cell corners in (column, row)
// axes, rows growing downward: outer rings have positive shoelace area, holes
// negative. At a corner shared by two diagonal cells the walk takes the turn
// that keeps the two cells' rings apart, so no ring touches itself.
export function traceRaster(mask, w, h) {
  const at = (i, j) => i >= 0 && j >= 0 && i < w && j < h && mask[j * w + i] === 1;
  const out = new Map(), push = (a, b) => { const k = a[0] + ',' + a[1]; if (!out.has(k)) out.set(k, []); out.get(k).push(b); };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (at(i, j)) {
    if (!at(i, j - 1)) push([i, j], [i + 1, j]);
    if (!at(i + 1, j)) push([i + 1, j], [i + 1, j + 1]);
    if (!at(i, j + 1)) push([i + 1, j + 1], [i, j + 1]);
    if (!at(i - 1, j)) push([i, j + 1], [i, j]);
  }
  const rings = [];
  for (const [startKey, list] of out) while (list.length) {
    const start = startKey.split(',').map(Number), ring = [start];
    let prev = start, cur = list.pop();
    while (true) {
      ring.push(cur);
      if (cur[0] === start[0] && cur[1] === start[1]) break;
      const next = out.get(cur[0] + ',' + cur[1]);
      if (next.length > 1) {
        // Arriving down a cell's right side, the separating exit runs back
        // along that cell's bottom: the larger cross product of in and out.
        const dx = cur[0] - prev[0], dy = cur[1] - prev[1];
        const score = b => { const ex = b[0] - cur[0], ey = b[1] - cur[1]; return dx * ey - dy * ex; };
        next.sort((a, b) => score(b) - score(a));
      }
      prev = cur; cur = next.shift();
    }
    rings.push(collinearFree(ring));
  }
  return rings;
}

export function signedArea(ring) {
  let s = 0;
  for (let i = 0; i + 1 < ring.length; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return s / 2;
}

// Drop repeated and collinear vertices of a closed ring (first = last).
export function collinearFree(ring) {
  let pts = ring.slice(0, -1);
  for (let changed = true; changed && pts.length > 3;) {
    changed = false;
    const keep = pts.filter((p, i) => {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
      return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-9;
    });
    if (keep.length !== pts.length) { pts = keep; changed = true; }
  }
  return [...pts, pts[0]];
}

// Douglas-Peucker on a closed ring, anchored at its two farthest-apart vertices.
export function simplifyRing(ring, tol) {
  const pts = ring.slice(0, -1);
  if (pts.length < 5) return ring;
  let a = 0, b = 0, far = -1;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
    if (d > far) { far = d; a = i; b = j; }
  }
  const keep = new Set([a, b]);
  const dp = (i, j) => { // indices along the ring from i to j (wrapping)
    const n = pts.length, span = (j - i + n) % n;
    if (span < 2) return;
    const [x0, y0] = pts[i], [x1, y1] = pts[j], len = Math.hypot(x1 - x0, y1 - y0) || 1e-12;
    let worst = -1, at = -1;
    for (let s = 1; s < span; s++) {
      const k = (i + s) % n, d = Math.abs((pts[k][0] - x0) * (y1 - y0) - (pts[k][1] - y0) * (x1 - x0)) / len;
      if (d > worst) { worst = d; at = k; }
    }
    if (worst > tol) { keep.add(at); dp(i, at); dp(at, j); }
  };
  dp(a, b); dp(b, a);
  const out = pts.filter((_, i) => keep.has(i));
  return out.length >= 3 ? [...out, out[0]] : ring;
}

// Morphological closing with a (2k+1)-cell square: fills gaps narrower than
// 2k cells and keeps square corners, in the raster's own axes.
export function close(mask, w, h, k) {
  if (k < 1) return mask;
  const pass = (src, fn, horizontal) => {
    const dst = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let v = fn === 'max' ? 0 : 1;
      for (let d = -k; d <= k; d++) {
        const ii = horizontal ? i + d : i, jj = horizontal ? j : j + d;
        const s = ii >= 0 && jj >= 0 && ii < w && jj < h ? src[jj * w + ii] : 0;
        v = fn === 'max' ? Math.max(v, s) : Math.min(v, s);
      }
      dst[j * w + i] = v;
    }
    return dst;
  };
  return pass(pass(pass(pass(mask, 'max', true), 'max', false), 'min', true), 'min', false);
}

// The union of overlapping or touching sketches as one outline: a fine raster
// in the group's own wall axes (so its stair-steps follow the walls), closed
// across the sketch gaps that grouping bridged, traced and simplified, then
// turned back. `exclude(point)` empties cells another building already covers.
export function unionOutline(polygons, {cell = PLACE.outlineCellM, tol = PLACE.simplifyM, closeM = PLACE.touchM, exclude = () => false} = {}) {
  const angle = dominantAngle(polygons), co = Math.cos(angle), si = Math.sin(angle);
  const [cx, cy] = centroid(polygons);
  const toR = ([x, y]) => [(x - cx) * co + (y - cy) * si, -(x - cx) * si + (y - cy) * co];
  const fromR = ([u, v]) => [cx + u * co - v * si, cy + u * si + v * co];
  const rotated = polygons.map(poly => poly.map(ring => ring.map(toR)));
  const rad = Math.ceil(closeM / 2 / cell - 1e-9), [u0, v0, u1, v1] = bounds(rotated), pad = 2 + rad;
  const ou = Math.floor(u0 / cell) - pad, ov = Math.floor(v0 / cell) - pad;
  const w = Math.ceil(u1 / cell) + pad - ou, h = Math.ceil(v1 / cell) + pad - ov;
  let mask = new Uint8Array(w * h);
  // Even-odd scanlines per polygon (outer ring and its holes), then the union.
  for (const poly of rotated) for (let j = 0; j < h; j++) {
    const v = (ov + j + .5) * cell, cuts = [];
    for (const ring of poly) for (let k = 0; k + 1 < ring.length; k++) {
      const [a, b] = [ring[k], ring[k + 1]];
      if ((a[1] > v) !== (b[1] > v)) cuts.push(a[0] + (v - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    cuts.sort((p, q) => p - q);
    for (let k = 0; k + 1 < cuts.length; k += 2)
      for (let i = Math.max(0, Math.ceil(cuts[k] / cell - ou - .5)); i < Math.min(w, Math.ceil(cuts[k + 1] / cell - ou - .5)); i++) mask[j * w + i] = 1;
  }
  mask = close(mask, w, h, rad);
  let removed = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (mask[j * w + i] && exclude(fromR([(ou + i + .5) * cell, (ov + j + .5) * cell]))) { mask[j * w + i] = 0; removed++; }
  const rings = traceRaster(mask, w, h).map(ring => simplifyRing(ring, tol / cell))
    .map(ring => collinearFree(ring)).filter(ring => ring.length >= 4);
  const outers = rings.filter(r => signedArea(r) > 0).sort((a, b) => signedArea(b) - signedArea(a));
  const holes = rings.filter(r => signedArea(r) < 0);
  const toTown = ring => ring.map(([i, j]) => fromR([(ou + i) * cell, (ov + j) * cell]).map(r2));
  const result = outers.map(o => [o]);
  // A hole's corners lie strictly inside the outer ring that encloses it.
  for (const hole of holes) result.find(p => contains([[p[0]]], hole[0]))?.push(hole);
  const mp = result.map(poly => poly.map(toTown));
  return {geometry: mp, angleDeg: r3(angle * 180 / Math.PI), removedM2: r2(removed * cell * cell)};
}

// The class mix under a footprint: share of 0.5 m cells whose lowest return is
// near the ground (lidar saw the ground there) and share holding a return
// raised above it. Separates a roof hidden under trees or a deck classed as
// ground from open ground.
export function underfoot(index, pointsIn, geometry, groundZ) {
  const cell = PLACE.cellM, b = bounds(geometry), low = new Map(), high = new Map();
  for (const k of pointsIn(index, b)) {
    const c = index.cls[k];
    if (c === 7 || c === 18) continue;
    const p = [index.x[k], index.y[k]];
    if (!contains(geometry, p)) continue;
    const key = Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell), z = index.z[k] - groundZ;
    low.set(key, Math.min(low.get(key) ?? Infinity, z)); high.set(key, Math.max(high.get(key) ?? -Infinity, z));
  }
  const cells = samples(geometry).length / 2 || 1;
  let ground = 0, raised = 0;
  for (const [key, z] of low) { if (z <= PLACE.groundM) ground++; else if (z >= PLACE.raisedM) raised++; }
  return {cellsWithReturns: low.size, groundShare: r2(ground / cells), raisedShare: r2(raised / cells),
    lowestReturnM: low.size ? r2(Math.min(...low.values())) : null};
}

const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const hits = (a, b, pad = 0) => a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;

// Merge the facts of a structure's records: the largest sketch with a record
// speaks for the building, lot and address included, except its storeys, which
// are the tallest record's.
function mergedCounty(members) {
  const withRecord = members.filter(m => m.sketch.county.records.length).sort((a, b) => b.sketch.areaM2 - a.sketch.areaM2 || a.key.localeCompare(b.key));
  const primary = withRecord[0]?.sketch ?? members[0].sketch;
  const suggested = {...primary.suggested};
  const tallest = withRecord.filter(m => m.sketch.suggested.stories).sort((a, b) => b.sketch.suggested.stories - a.sketch.suggested.stories || a.key.localeCompare(b.key))[0];
  if (tallest && tallest.sketch !== primary)
    Object.assign(suggested, {stories: tallest.sketch.suggested.stories, halfStory: tallest.sketch.suggested.halfStory, storiesSource: tallest.sketch.suggested.storiesSource});
  if (withRecord.length > 1) suggested.storiesSource += ` (tallest of ${withRecord.length} records)`;
  return {lot: {address: primary.address ?? null, placeName: primary.placeName ?? null, parcel: primary.parcel ?? null},
    county: {match: {method: 'county-sketch', iou: null, sketches: members.length},
      county: {records: withRecord.flatMap(m => m.sketch.county.records), lotExtras: primary.county.lotExtras}, suggested}};
}

// sketches: house-reference countyOnly; holders: Map record key -> game id;
// games: [{id, geometry, box}] what the game already maps as a structure (OSM
// buildings and multi-storey car parks); grid: class-6 occupancy;
// base: the outline registration (OSM frame + base = lidar frame).
export function placeCountyBuildings({sketches, holders, games, grid, base}) {
  const inGame = ([x, y]) => games.some(g => x >= g.box[0] && x <= g.box[2] && y >= g.box[1] && y <= g.box[3] && contains(g.geometry, [x, y]));
  const gameShare = pts => { let n = 0; for (let k = 0; k < pts.length; k += 2) if (inGame([pts[k], pts[k + 1]])) n++; return pts.length ? n / (pts.length / 2) : 0; };
  const represented = [], placed = [];
  for (const sketch of sketches) {
    const key = keyOf(sketch), pts = samples(sketch.geometry);
    const asDrawn = shareOver(pts, grid, base.dx, base.dy), reg = register(pts, grid, base);
    const roof = reg.share >= PLACE.roofAt, [dx, dy] = roof ? [reg.dx, reg.dy] : [0, 0];
    const geometry = shift(sketch.geometry, dx, dy), box = bounds(geometry), at = samples(geometry);
    const item = {key, sketch, geometry, box, pts: at, roof, asDrawn: r3(asDrawn), roofShare: r3(roof ? reg.share : asDrawn), shiftM: [r2(dx), r2(dy)]};
    // A record a game building holds is that building wherever the two overlap.
    const holder = holders.get(key), held = holder && games.find(g => g.id === holder);
    if (held) {
      let n = 0; for (let k = 0; k < at.length; k += 2) if (contains(held.geometry, [at[k], at[k + 1]])) n++;
      if (n / (at.length / 2 || 1) > PLACE.holderAt) { represented.push({...brief(item), by: [holder], reason: 'record held by this game building, and the sketch overlaps it'}); continue; }
    }
    placed.push(item);
  }
  // Structures: sketches that overlap or come within touchM of each other.
  const parent = placed.map((_, i) => i), root = i => parent[i] === i ? i : (parent[i] = root(parent[i]));
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    if (!hits(placed[i].box, placed[j].box, PLACE.touchM)) continue;
    const [a, b] = [placed[i], placed[j]];
    let near = false;
    for (let k = 0; k < a.pts.length && !near; k += 2) { const p = [a.pts[k], a.pts[k + 1]]; near = contains(b.geometry, p) || edgeDistance(b.geometry, p) <= PLACE.touchM; }
    if (near) parent[root(j)] = root(i);
  }
  const groups = new Map();
  placed.forEach((p, i) => { const r = root(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); });
  const buildings = [];
  for (const members of [...groups.values()].map(g => g.sort((a, b) => a.key.localeCompare(b.key)))) {
    const polygons = members.flatMap(m => m.geometry);
    const whole = unionOutline(polygons), wholePts = samples(whole.geometry);
    const onGame = gameShare(wholePts), roofShare = shareOver(wholePts, grid, base.dx, base.dy), anyRoof = members.some(m => m.roof);
    const by = [...new Set(games.filter(g => members.some(m => hits(g.box, m.box)) && wholePts.some((v, k) => k % 2 === 0 && contains(g.geometry, [v, wholePts[k + 1]]))).map(g => g.id))].sort();
    if (onGame >= PLACE.onGameAt) { for (const m of members) represented.push({...brief(m), by, reason: `the structure lies ${Math.round(onGame * 100)}% on mapped game structures`}); continue; }
    if (!anyRoof && onGame > PLACE.staleOnGameAt) { for (const m of members) represented.push({...brief(m), by, reason: 'no lidar roof under the sketch, which overlaps a game building: a drawing of part of it'}); continue; }
    const kept = unionOutline(polygons, {exclude: inGame}), keptArea = area(kept.geometry);
    if (keptArea < PLACE.minAddM2 || keptArea < PLACE.minAddShare * area(whole.geometry)) { for (const m of members) represented.push({...brief(m), by, reason: `only ${r2(keptArea)} m2 lies outside game buildings`}); continue; }
    // A native outline is one connected footprint. A structure that falls into
    // pieces (a sketch of two parts meeting at a corner, or one a game building
    // splits) becomes a building per piece; slivers under minAddM2 are dropped.
    const pieces = kept.geometry.map(poly => [poly]).sort((a, b) => area(b) - area(a));
    const whole2 = pieces.filter(p => area(p) >= PLACE.minAddM2), {county, lot} = mergedCounty(members);
    whole2.forEach((piece, n) => buildings.push({id: idOf(members[0].sketch) + (n ? `-part${n + 1}` : ''), members, geometry: piece, angleDeg: kept.angleDeg,
      clippedByGameM2: kept.removedM2, ...(pieces.length > 1 ? {piece: {index: n + 1, of: whole2.length, droppedM2: r2(keptArea - whole2.reduce((s, p) => s + area(p), 0))}} : {}),
      roofShare: r3(shareOver(samples(piece), grid, base.dx, base.dy)), county, lot}));
  }
  return {buildings: buildings.sort((a, b) => a.id.localeCompare(b.id)), represented: represented.sort((a, b) => a.key.localeCompare(b.key))};
}

export const brief = m => ({key: m.key, style: m.sketch.record?.style ?? null, areaM2: m.sketch.areaM2, roofShareAsDrawn: m.asDrawn, roofShare: m.roofShare, shiftM: m.shiftM});
