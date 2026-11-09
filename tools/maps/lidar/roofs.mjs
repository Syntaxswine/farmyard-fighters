// Roof form from the lidar returns inside one building outline.
//
// Returns are binned to a 0.5 m grid (a robust centroid per cell). Each cell
// gets a least-squares plane from its 5×5 neighbourhood; planar cells, best
// first, grow into roof planes. The planes then decide the form:
//   flat   at least 75% of the plane area slopes under 10°;
//   gable  pitched, and the roof runs parallel to part of the outline (a rake,
//          i.e. a gable end) along at least 12% of the sampled edges;
//   hip    pitched, and the roof slopes down to almost every edge (eaves all round);
//   other  mixed flat and pitched, a shed or complex roof, or too little of the
//          roof explained by planes;
//   unknown  fewer than 4 m² of returns, or under a quarter of the outline covered.
// The thresholds below were fixed before the town was run and are not tuned to it.
import {contains} from '../house-reference/geometry.mjs';

export const ROOF = {cellM: .5, windowCells: 2, minWindowCells: 6, planarRmsM: .06, joinM: .12, joinDeg: 15, flatDeg: 10,
  minPlaneM2: 2, minPlaneShare: .05, flatShare: .75, mixedShare: .25, minExplained: .5, minCoverage: .25, minRoofM2: 4,
  rakeShare: .12, upShare: .2, edgeInsetM: .75, edgeSkipM: 1, edgeStepM: .5, eaveCos: .7, rakeCos: .45};

const deg = r => r * 180 / Math.PI, clamp01 = v => Math.max(0, Math.min(1, v));
const bearing = (east, north) => (deg(Math.atan2(east, north)) + 360) % 360;

export function median(values) {
  if (!values.length) return NaN;
  const s = Float64Array.from(values).sort(), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const at = (sorted.length - 1) * p, i = Math.floor(at), f = at - i;
  return i + 1 < sorted.length ? sorted[i] * (1 - f) + sorted[i + 1] * f : sorted[i];
}

// Least-squares plane z = a·x + b·y + c through accumulated sums.
function solvePlane(s) {
  const {n, x, y, z, xx, xy, yy, xz, yz} = s;
  const m = [[xx, xy, x], [xy, yy, y], [x, y, n]], r = [xz, yz, z];
  const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  if (!(Math.abs(det) > 1e-12)) return null;
  const solve = col => { const q = m.map((row, i) => row.map((v, j) => j === col ? r[i] : v)); return (q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1]) - q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0]) + q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0])) / det; };
  return {a: solve(0), b: solve(1), c: solve(2)};
}
const sums = () => ({n: 0, x: 0, y: 0, z: 0, xx: 0, xy: 0, yy: 0, xz: 0, yz: 0});
const addTo = (s, x, y, z) => { s.n++; s.x += x; s.y += y; s.z += z; s.xx += x * x; s.xy += x * y; s.yy += y * y; s.xz += x * z; s.yz += y * z; };
const normal = p => { const l = Math.hypot(p.a, p.b, 1); return [-p.a / l, -p.b / l, 1 / l]; };
const angleDeg = (p, q) => { const u = normal(p), v = normal(q); return deg(Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))); };

// points: {x, y, z} arrays (town metres) already inside the outline. Each cell
// keeps a robust centroid of its returns (those within 0.3 m of the cell's
// median height): on a plane the centroid lies on the plane, however steep,
// where the cell centre with the median height would not.
export function roofGrid(polygon, box, points, cell = ROOF.cellM) {
  const x0 = box[0], y0 = box[1], cols = Math.max(1, Math.ceil((box[2] - x0) / cell)), rows = Math.max(1, Math.ceil((box[3] - y0) / cell));
  const n = cols * rows, inside = new Uint8Array(n), z = new Float64Array(n).fill(NaN), px = new Float64Array(n), py = new Float64Array(n), lists = new Map();
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) inside[j * cols + i] = contains(polygon, [x0 + (i + .5) * cell, y0 + (j + .5) * cell]) ? 1 : 0;
  for (let k = 0; k < points.x.length; k++) {
    const i = Math.min(cols - 1, Math.max(0, Math.floor((points.x[k] - x0) / cell))), j = Math.min(rows - 1, Math.max(0, Math.floor((points.y[k] - y0) / cell)));
    const c = j * cols + i;
    if (!lists.has(c)) lists.set(c, []);
    lists.get(c).push(k);
  }
  for (const [c, list] of lists) {
    const mid = median(list.map(k => points.z[k]));
    let sx = 0, sy = 0, sz = 0, m = 0;
    for (const k of list) if (Math.abs(points.z[k] - mid) <= .3) { sx += points.x[k]; sy += points.y[k]; sz += points.z[k]; m++; }
    if (!m) { // an even split far from its own median: the return nearest it
      const k = list.reduce((b, q) => Math.abs(points.z[q] - mid) < Math.abs(points.z[b] - mid) ? q : b);
      sx = points.x[k]; sy = points.y[k]; sz = points.z[k]; m = 1;
    }
    px[c] = sx / m - x0; py[c] = sy / m - y0; z[c] = sz / m;
  }
  return {x0, y0, cols, rows, cell, inside, z, px, py};
}

// A plane per cell from its window; rms is the fit's residual.
export function localPlanes(grid, opts = ROOF) {
  const {cols, rows, z, px, py} = grid, w = opts.windowCells, out = new Array(cols * rows).fill(null);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const c = j * cols + i;
    if (Number.isNaN(z[c])) continue;
    const s = sums(), pts = [];
    for (let dj = -w; dj <= w; dj++) for (let di = -w; di <= w; di++) {
      const ii = i + di, jj = j + dj, q = jj * cols + ii;
      if (ii < 0 || jj < 0 || ii >= cols || jj >= rows || Number.isNaN(z[q])) continue;
      const dx = px[q] - px[c], dy = py[q] - py[c], v = z[q] - z[c];
      addTo(s, dx, dy, v); pts.push([dx, dy, v]);
    }
    if (s.n < opts.minWindowCells) continue;
    const p = solvePlane(s);
    if (!p) continue;
    const rms = Math.sqrt(pts.reduce((t, [x, y, v]) => t + (v - p.a * x - p.b * y - p.c) ** 2, 0) / pts.length);
    out[c] = {a: p.a, b: p.b, rms};
  }
  return out;
}

export function growPlanes(grid, local, opts = ROOF) {
  const {cols, rows, cell, z, px, py} = grid, label = new Int32Array(cols * rows).fill(-1), regions = [];
  const roofCells = z.reduce((n, v) => n + (Number.isNaN(v) ? 0 : 1), 0);
  const minCells = Math.max(Math.round(opts.minPlaneM2 / cell ** 2), Math.round(opts.minPlaneShare * roofCells));
  const seeds = [];
  for (let c = 0; c < local.length; c++) if (local[c] && local[c].rms <= opts.planarRmsM) seeds.push(c);
  seeds.sort((p, q) => local[p].rms - local[q].rms || p - q);
  const cx = c => px[c], cy = c => py[c];
  for (const seed of seeds) {
    if (label[seed] !== -1) continue;
    const id = regions.length, s = sums(), members = [seed];
    let plane = {a: local[seed].a, b: local[seed].b, c: z[seed] - local[seed].a * cx(seed) - local[seed].b * cy(seed)}, refitAt = 8;
    label[seed] = id; addTo(s, cx(seed), cy(seed), z[seed]);
    for (let q = 0; q < members.length; q++) {
      const c = members[q], i = c % cols, j = (c - i) / cols;
      for (const [ii, jj] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
        if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
        const n = jj * cols + ii;
        if (label[n] !== -1 || Number.isNaN(z[n])) continue;
        if (Math.abs(z[n] - (plane.a * cx(n) + plane.b * cy(n) + plane.c)) > opts.joinM) continue;
        if (local[n] && local[n].rms <= opts.planarRmsM && angleDeg(local[n], plane) > opts.joinDeg) continue;
        label[n] = id; members.push(n); addTo(s, cx(n), cy(n), z[n]);
        if (s.n >= refitAt) { plane = solvePlane(s) || plane; refitAt = Math.ceil(s.n * 1.25); }
      }
    }
    plane = solvePlane(s) || plane;
    if (members.length < minCells) { for (const c of members) label[c] = -2; continue; }
    const rms = Math.sqrt(members.reduce((t, c) => t + (z[c] - plane.a * cx(c) - plane.b * cy(c) - plane.c) ** 2, 0) / members.length);
    regions.push({id, cells: members.length, plane, rms});
  }
  const heights = regions.map(() => []);
  for (let c = 0; c < label.length; c++) if (label[c] >= 0) heights[label[c]].push(z[c]); // kept regions' ids are their indices
  regions.forEach((r, i) => {
    r.areaM2 = r.cells * cell * cell;
    r.slopeDeg = deg(Math.atan(Math.hypot(r.plane.a, r.plane.b)));
    // Town axes are east and south; the downslope direction is -grad z.
    r.aspectDeg = bearing(-r.plane.a, r.plane.b);
    const s = heights[i].sort((p, q) => p - q);
    r.lowZ = percentile(s, .05); r.highZ = percentile(s, .95);
  });
  return {label, regions, roofCells, minCells};
}

// Area-weighted median of the planes' low edges (each plane's 5th-percentile
// cell): the height where the roof over most of the outline meets the walls,
// so a porch or carport roof covering less of it does not set the eave. For a
// flat roof that is the deck.
const weightedLow = list => {
  const sorted = list.slice().sort((p, q) => p.lowZ - q.lowZ || p.id - q.id), half = sorted.reduce((s, r) => s + r.areaM2, 0) / 2;
  let acc = 0;
  for (const r of sorted) { acc += r.areaM2; if (acc >= half) return r.lowZ; }
  return sorted.length ? sorted.at(-1).lowZ : NaN;
};
export const mainEaveZ = regions => weightedLow(regions);

// The taller roof, where there is one: the substantial planes (10%+ of the
// plane area) whose tops come within 1 m of the highest of them, with their
// share of the plane area. A two-storey house inside a wraparound porch shows
// its main walls here while the porch sets the eave.
export const UPPER_ROOF = {minShare: .1, topBandM: 1};
export function upperRoof(regions, opts = UPPER_ROOF) {
  const total = regions.reduce((s, r) => s + r.areaM2, 0), big = regions.filter(r => r.areaM2 >= opts.minShare * total);
  if (!big.length) return null;
  const top = Math.max(...big.map(r => r.highZ)), upper = big.filter(r => r.highZ >= top - opts.topBandM);
  return {eaveZ: weightedLow(upper), share: upper.reduce((s, r) => s + r.areaM2, 0) / total};
}

// Eave, rake and "up" lengths along the outline: does the roof just inside each
// edge slope down to it, along it, or up to it?
export function edgeRoles(polygon, grid, grown, opts = ROOF) {
  const {cols, rows, cell, x0, y0} = grid, out = {eaveM: 0, rakeM: 0, upM: 0, unclearM: 0, sampledM: 0};
  const byId = new Map(grown.regions.map(r => [r.id, r]));
  for (const poly of polygon) {
    const ring = poly[0], n = ring.length - (ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const p = ring[k], q = ring[(k + 1) % n], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 2 * opts.edgeSkipM + opts.edgeStepM) continue;
      const t = [(q[0] - p[0]) / len, (q[1] - p[1]) / len], mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      let nrm = [t[1], -t[0]];
      if (contains(polygon, [mid[0] + nrm[0] * .1, mid[1] + nrm[1] * .1])) nrm = [-nrm[0], -nrm[1]];
      for (let s = opts.edgeSkipM; s <= len - opts.edgeSkipM; s += opts.edgeStepM) {
        out.sampledM += opts.edgeStepM;
        const x = p[0] + t[0] * s - nrm[0] * opts.edgeInsetM, y = p[1] + t[1] * s - nrm[1] * opts.edgeInsetM;
        const i = Math.floor((x - x0) / cell), j = Math.floor((y - y0) / cell);
        if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
        const r = byId.get(grown.label[j * cols + i]);
        if (!r || r.slopeDeg < opts.flatDeg) continue;
        const g = Math.hypot(r.plane.a, r.plane.b), cos = (-r.plane.a / g) * nrm[0] + (-r.plane.b / g) * nrm[1];
        if (cos >= opts.eaveCos) out.eaveM += opts.edgeStepM;
        else if (cos <= -opts.eaveCos) out.upM += opts.edgeStepM;
        else if (Math.abs(cos) <= opts.rakeCos) out.rakeM += opts.edgeStepM;
        else out.unclearM += opts.edgeStepM;
      }
    }
  }
  return out;
}

// Ridge bearing (0–180°, clockwise from north) from the two largest opposite
// pitched planes, else perpendicular to the largest one.
export function ridgeBearing(regions, opts = ROOF) {
  const pitched = regions.filter(r => r.slopeDeg >= opts.flatDeg).sort((p, q) => q.areaM2 - p.areaM2 || p.id - q.id);
  if (!pitched.length) return null;
  const first = pitched[0], opposite = pitched.find(r => Math.abs(((r.aspectDeg - first.aspectDeg + 540) % 360) - 180) >= 150);
  if (!opposite) return {bearingDeg: (first.aspectDeg + 90) % 180, from: 'one-plane'};
  const n1 = normal(first.plane), n2 = normal(opposite.plane);
  const east = n1[1] * n2[2] - n1[2] * n2[1], south = n1[2] * n2[0] - n1[0] * n2[2];
  return {bearingDeg: bearing(east, -south) % 180, from: 'plane-pair'};
}

export function classifyRoof(polygon, box, points, footprintM2, opts = ROOF) {
  const grid = roofGrid(polygon, box, points, opts.cellM), local = localPlanes(grid, opts), grown = growPlanes(grid, local, opts);
  const cellM2 = opts.cellM ** 2, insideCells = grid.inside.reduce((s, v) => s + v, 0);
  const roofM2 = grown.roofCells * cellM2, coverage = insideCells ? Math.min(1, grown.roofCells / insideCells) : 0;
  const planeCells = grown.regions.reduce((s, r) => s + r.cells, 0), explained = grown.roofCells ? planeCells / grown.roofCells : 0;
  const flatCells = grown.regions.filter(r => r.slopeDeg < opts.flatDeg).reduce((s, r) => s + r.cells, 0);
  const flatShare = planeCells ? flatCells / planeCells : 0;
  const pitched = grown.regions.filter(r => r.slopeDeg >= opts.flatDeg);
  const pitchArea = pitched.reduce((s, r) => s + r.areaM2, 0);
  const slopeSorted = pitched.flatMap(r => Array(r.cells).fill(r.slopeDeg)).sort((p, q) => p - q);
  const pitchDeg = slopeSorted.length ? percentile(slopeSorted, .5) : null;
  const cov = clamp01((coverage - opts.minCoverage) / .35), exp = clamp01((explained - opts.minExplained) / .3);
  let form, basis, margin, edges = null, ridge = null;
  if (roofM2 < opts.minRoofM2 || coverage < opts.minCoverage) { form = 'unknown'; basis = 'too few roof returns'; margin = 0; }
  else if (explained < opts.minExplained) { form = 'other'; basis = 'roof not explained by planes'; margin = clamp01((opts.minExplained - explained) / .2); }
  else if (flatShare >= opts.flatShare) { form = 'flat'; basis = 'flat planes'; margin = clamp01((flatShare - opts.flatShare) / .15); }
  else if (flatShare > opts.mixedShare) { form = 'other'; basis = 'mixed flat and pitched'; margin = clamp01(Math.min(flatShare - opts.mixedShare, opts.flatShare - flatShare) / .15); }
  else {
    edges = edgeRoles(polygon, grid, grown, opts);
    const decided = edges.eaveM + edges.rakeM + edges.upM, rake = decided ? edges.rakeM / decided : 0, up = decided ? edges.upM / decided : 0;
    Object.assign(edges, {rakeShare: rake, upShare: up});
    if (decided < .3 * edges.sampledM) { form = 'other'; basis = 'outline edges unclear'; margin = clamp01((.3 * edges.sampledM - decided) / (.15 * edges.sampledM || 1)); }
    else if (up >= opts.upShare) { form = 'other'; basis = 'roof rises to an edge (shed or complex)'; margin = clamp01((up - opts.upShare) / .15); }
    else if (rake >= opts.rakeShare) { form = 'gable'; basis = 'gable ends on the outline'; margin = clamp01((rake - opts.rakeShare) / .12); }
    else { form = 'hip'; basis = 'eaves on every side'; margin = clamp01((opts.rakeShare - rake) / .08); }
    if (form === 'gable' || form === 'hip') ridge = ridgeBearing(grown.regions, opts);
  }
  const confidence = form === 'unknown' ? 0 : cov * (form === 'other' ? 1 : exp) * (.5 + .5 * margin);
  return {form, basis, confidence, coverage, explained, flatShare, roofM2, footprintM2, pitchDeg, pitchArea, edges, ridge,
    eaveZ: mainEaveZ(grown.regions), upper: upperRoof(grown.regions),
    planes: grown.regions.slice().sort((p, q) => q.areaM2 - p.areaM2 || p.id - q.id), minPlaneCells: grown.minCells};
}
