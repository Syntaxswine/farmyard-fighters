// Roofs over open water: the boathouses and covered slips the 2018 lidar sees on Lake
// Dora that the game draws no outline for.
//
// Building (class 6) returns are moved into the town frame (the outline registration
// taken out) and binned in WATER_ROOFS.cellM cells. Neighbouring cells (eight ways) join
// into roofs, over land and water alike, where some return of one lies within joinM of
// some return of the other. Cells alone would join two roofs under a metre apart at some
// grid offsets and not at others; the gap between their returns does not move with the
// grid or the registration. A roof is a water roof when:
// - it reaches the lake: at least lakeReachM2 of it lies in Lake Dora's outline;
// - the game does not draw it: at most drawnShareMax of it lies inside an outline the
//   game draws (OSM and county buildings, the generator's structures). A roof joined to
//   a drawn one beyond that share is that building's own: a wing, a porch or an attached
//   boathouse that its county sketch leaves out.
//
// Cells within drawnMarginM of a drawn outline are left to that outline: its roof, its
// eaves and the registration's error. The rest of a water roof splits into parts that
// join eight ways. A part of minAreaM2 or more is outlined by rectangles in its own frame
// (pieces):
// - the smallest rectangle around it, unless that would roof over open water the size of
//   a piece: a rectangle of pieceMinM2, pieceMinWidthM wide, that the part does not fill;
// - otherwise the largest filled rectangles, one after another, while one of that size
//   remains: a covered slip's rows, the walkway joining them.
// A piece's outline is then the rectangle, in its frame, around its own returns: the
// cells it was found on stand up to half a cell past the roof's edge.
// A piece stands over water where at least pieceLakeMin of it lies in the lake's outline,
// or where the lidar sees water around it: at least ringReadMin of the cells within ringM
// of it read as water or ground (no roof over them), and at least ringWaterMin of those
// read as water. A cell reads as water where it holds water returns; where it holds no
// return at all (calm water gave the scanner none); or, within dockReachM of such a cell,
// where it holds no ground return (classes 2 and 20) and most of its returns stand between
// half a metre under the lake's level and lowM over it (a dock or reeds in the water).
// Lake Dora's OSM outline runs metres off the lidar's water along parts of the shore. A
// piece over neither, a shed on the shore joined to a covered slip, is left out. The
// pieces kept form groups, joined where their cells' centres come within touchM of one
// another. A group under pieceLakeMin in the lake's outline by area that touches pieces
// left out as not over water is part of what stands on land, and is left out with it: a
// slip split into a body and a stub is judged whole. Both are listed in `leftOut` with
// what was measured, so no building-class roof the lidar saw on the lake goes unrecorded.
// (A roof the vendor left unclassified, like the one on a dock at x 61-67, y 631-642, has
// no building returns; crowns.json lists it among the solids it drops, notFoliage.)
// Each piece's height and form come from its own returns, by the rules the houses' roofs
// use (roofs.mjs), measured above the lake's lidar level.
import {maskOf} from './raster.mjs';
import {classifyRoof, percentile} from './roofs.mjs';
import {bounds} from '../house-reference/geometry.mjs';

export const WATER_ROOFS = {cellM: .5, minAreaM2: 6, lakeReachM2: 1, drawnShareMax: .25, drawnMarginM: 1,
  pieceMinM2: 6, pieceMinWidthM: 1.5, pieceLakeMin: .5, ringM: 3, ringReadMin: .5, ringWaterMin: .75, lowM: 1.5, dockReachM: 3, touchM: 1, joinM: .7};

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
// Andrew's monotone chain: the convex hull, counter-clockwise, no repeated points.
export function convexHull(points) {
  const p = [...new Map(points.map(q => [q[0] + ',' + q[1], q])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// The smallest-area rectangle around points: one of its sides lies along a hull edge.
// Returns its four corners (counter-clockwise), its area, the angle of its first side,
// and its frame: unit sides u and v and the extents lo, hi along them.
export function minAreaRectangle(points) {
  const hull = convexHull(points);
  if (hull.length < 3) throw Error('A rectangle needs three points that are not in a line.');
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-9) continue;
    const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], v = [-u[1], u[0]];
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (const q of hull) { const s = q[0] * u[0] + q[1] * u[1], t = q[0] * v[0] + q[1] * v[1]; lo = [Math.min(lo[0], s), Math.min(lo[1], t)]; hi = [Math.max(hi[0], s), Math.max(hi[1], t)]; }
    const area = (hi[0] - lo[0]) * (hi[1] - lo[1]);
    if (!best || area < best.area - 1e-9) best = {area, u, v, lo, hi};
  }
  const {u, v, lo, hi} = best, at = (s, t) => [s * u[0] + t * v[0], s * u[1] + t * v[1]];
  return {corners: [at(lo[0], lo[1]), at(hi[0], lo[1]), at(hi[0], hi[1]), at(lo[0], hi[1])], area: best.area,
    angleDeg: Math.atan2(u[1], u[0]) * 180 / Math.PI, frame: {u, v, lo, hi}};
}

// The largest rectangle of set cells in a cols x rows mask whose sides are both at least
// minSide cells: {i0, j0, i1, j1, area} (ends exclusive, area in cells), or null. The
// histogram method; every rectangle of set cells lies inside one it weighs, so the
// largest one meeting the side rule is among them.
export function largestRectangle(mask, cols, rows, minSide = 1) {
  const height = new Int32Array(cols);
  let best = null;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) height[i] = mask[j * cols + i] ? height[i] + 1 : 0;
    const stack = [];
    for (let i = 0; i <= cols; i++) {
      const h = i < cols ? height[i] : 0;
      let start = i;
      while (stack.length && stack.at(-1)[1] >= h) {
        const [s, sh] = stack.pop(), area = sh * (i - s);
        if (sh >= minSide && i - s >= minSide && (!best || area > best.area)) best = {i0: s, j0: j - sh + 1, i1: i, j1: j + 1, area};
        start = s;
      }
      stack.push([start, h]);
    }
  }
  return best;
}

// A mask closed by a 3x3 square (dilated, then eroded): single missing cells and cracks a
// cell wide are filled, where a roof returned nothing.
export function closeMask(mask, cols, rows) {
  const pass = (src, keep) => {
    const out = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      let any = false, all = true;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const u = i + di, w = j + dj, on = u >= 0 && w >= 0 && u < cols && w < rows && src[w * cols + u] === 1;
        any ||= on; all &&= on;
      }
      out[j * cols + i] = (keep === 'any' ? any : all) ? 1 : 0;
    }
    return out;
  };
  return pass(pass(mask, 'any'), 'all');
}

// A part's cells resampled in a frame turned by `angleDeg`: cell (a, b) holds the part
// where the town cell under its centre does. A cell of padding runs all round.
function frameMask(set, corners, angleDeg, {x0, y0, cols, C}) {
  const r = angleDeg * Math.PI / 180, u = [Math.cos(r), Math.sin(r)], v = [-u[1], u[0]];
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const q of corners) { const s = q[0] * u[0] + q[1] * u[1], t = q[0] * v[0] + q[1] * v[1]; lo[0] = Math.min(lo[0], s); lo[1] = Math.min(lo[1], t); hi[0] = Math.max(hi[0], s); hi[1] = Math.max(hi[1], t); }
  const nu = Math.ceil((hi[0] - lo[0]) / C - 1e-9) + 2, nv = Math.ceil((hi[1] - lo[1]) / C - 1e-9) + 2;
  const at = (a, b) => { const s = lo[0] + (a - 1) * C, t = lo[1] + (b - 1) * C; return [s * u[0] + t * v[0], s * u[1] + t * v[1]]; };
  const own = new Uint8Array(nu * nv);
  for (let b = 1; b < nv - 1; b++) for (let a = 1; a < nu - 1; a++) {
    const [x, y] = at(a + .5, b + .5);
    if (set.has(Math.floor((y - y0) / C) * cols + Math.floor((x - x0) / C))) own[b * nu + a] = 1;
  }
  return {own, nu, nv, at};
}

// The pieces outlining one part: `cells` are its cell indices in a grid of `cols` columns
// of side C from (x0, y0). Each piece is a rectangle {corners, cells (its area in cells),
// filled (the part's cells inside it)}; `covered` of the part's `total` cells lie inside one.
// Missing returns (closed by a 3 x 3 square) and the staircase a turned roof leaves on the
// grid are not open water. Split pieces follow the frame, among the part's hull edges,
// whose largest filled rectangle is biggest: the frame of its main body, not one a stray
// corner turned.
export function outlinePart(cells, grid, rules = WATER_ROOFS) {
  const {x0, y0, cols, C} = grid, set = new Set(cells);
  const corners = cells.flatMap(c => { const i = c % cols, j = (c - i) / cols, x = x0 + i * C, y = y0 + j * C; return [[x, y], [x + C, y], [x + C, y + C], [x, y + C]]; });
  const rect = minAreaRectangle(corners), minSide = Math.ceil(rules.pieceMinWidthM / C - 1e-9), whole = frameMask(set, corners, rect.angleDeg, grid);
  const filledWhole = closeMask(whole.own, whole.nu, whole.nv), open = new Uint8Array(whole.nu * whole.nv);
  for (let b = 1; b < whole.nv - 1; b++) for (let a = 1; a < whole.nu - 1; a++) open[b * whole.nu + a] = filledWhole[b * whole.nu + a] ? 0 : 1;
  const hole = largestRectangle(open, whole.nu, whole.nv, minSide);
  if (!hole || hole.area * C * C < rules.pieceMinM2) return {pieces: [{corners: rect.corners, cells: rect.area / (C * C), filled: cells.length}], covered: cells.length, total: cells.length, rect};
  const hull = convexHull(corners), angles = new Set([+(((rect.angleDeg % 90) + 90) % 90).toFixed(3)]);
  for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; angles.add(+(((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI % 90) + 90) % 90).toFixed(3)); }
  let best = null;
  for (const angle of angles) {
    const f = frameMask(set, corners, angle, grid), free = closeMask(f.own, f.nu, f.nv), r = largestRectangle(free, f.nu, f.nv, minSide);
    if (r && (!best || r.area > best.first)) best = {...f, free, first: r.area};
  }
  const pieces = [];
  let covered = 0;
  if (best) for (;;) {
    const {own, free, nu, nv, at} = best, r = largestRectangle(free, nu, nv, minSide);
    if (!r || r.area * C * C < rules.pieceMinM2) break;
    let filled = 0;
    for (let b = r.j0; b < r.j1; b++) for (let a = r.i0; a < r.i1; a++) { filled += own[b * nu + a]; free[b * nu + a] = 0; }
    covered += filled;
    pieces.push({corners: [at(r.i0, r.j0), at(r.i1, r.j0), at(r.i1, r.j1), at(r.i0, r.j1)], cells: r.area, filled});
  }
  return {pieces, covered, total: best ? best.own.reduce((t, x) => t + x, 0) : cells.length, rect};
}

// The rectangle in a quadrilateral's frame (sides q0-q1 and q0-q3) around points.
export function rectangleAround(q, points) {
  const l = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), u = [(q[1][0] - q[0][0]) / l, (q[1][1] - q[0][1]) / l], v = [-u[1], u[0]];
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const p of points) { const s = p[0] * u[0] + p[1] * u[1], t = p[0] * v[0] + p[1] * v[1]; lo[0] = Math.min(lo[0], s); lo[1] = Math.min(lo[1], t); hi[0] = Math.max(hi[0], s); hi[1] = Math.max(hi[1], t); }
  const at = (s, t) => [s * u[0] + t * v[0], s * u[1] + t * v[1]];
  return [at(lo[0], lo[1]), at(hi[0], lo[1]), at(hi[0], hi[1]), at(lo[0], hi[1])];
}

// Whether a point lies inside a convex quadrilateral given counter-clockwise (y south),
// and its distance from one (0 inside).
const insideQuad = (q, p) => q.every((a, k) => cross(a, q[(k + 1) % 4], p) >= -1e-9);
const fromQuad = (q, p) => insideQuad(q, p) ? 0 : Math.min(...q.map((a, k) => {
  const b = q[(k + 1) % 4], d = [b[0] - a[0], b[1] - a[1]], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / (d[0] ** 2 + d[1] ** 2)));
  return Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t);
}));

// The water roofs: {roofs, leftOut}. `lake` is the lake's MultiPolygon and `drawn` the
// outlines the game draws, both in the town frame; `reg` is the lidar's registration
// ({dx, dy}: lidar = town + reg); `level` the lake's lidar elevation; `extent` the box
// searched. `leftOut` lists the pieces left out, with their reason and measures.
export function findWaterRoofs(index, {lake, drawn, reg, level, extent}, rules = WATER_ROOFS) {
  const C = rules.cellM, [x0, y0, x1, y1] = extent, cols = Math.round((x1 - x0) / C), rows = Math.round((y1 - y0) / C), n = cols * rows;
  const cellOf = (x, y) => x < x0 || y < y0 || x >= x1 || y >= y1 ? -1 : Math.floor((y - y0) / C) * cols + Math.floor((x - x0) / C);
  const inLake = maskOf(lake, x0, y0, cols, rows, C), inDrawn = new Uint8Array(n), roofCell = new Uint8Array(n);
  for (const mp of drawn) {
    const b = bounds(mp), i0 = Math.max(0, Math.floor((b[0] - x0) / C)), j0 = Math.max(0, Math.floor((b[1] - y0) / C));
    const i1 = Math.min(cols, Math.ceil((b[2] - x0) / C)), j1 = Math.min(rows, Math.ceil((b[3] - y0) / C));
    if (i1 <= i0 || j1 <= j0) continue;
    const m = maskOf(mp, x0 + i0 * C, y0 + j0 * C, i1 - i0, j1 - j0, C);
    for (let j = 0; j < j1 - j0; j++) for (let i = 0; i < i1 - i0; i++) if (m[j * (i1 - i0) + i]) inDrawn[(j0 + j) * cols + i0 + i] = 1;
  }
  // Roof cells, and what every cell returned: ground, water, other returns low over the
  // lake's level, anything at all.
  const ground = new Uint16Array(n), water = new Uint16Array(n), low = new Uint16Array(n), any = new Uint16Array(n);
  for (let k = 0; k < index.total; k++) {
    const c = cellOf(index.x[k] - reg.dx, index.y[k] - reg.dy), cls = index.cls[k];
    if (c < 0) continue;
    any[c] = Math.min(65535, any[c] + 1);
    if (cls === 6) roofCell[c] = 1; else if (cls === 2 || cls === 20) ground[c] = Math.min(65535, ground[c] + 1); else if (cls === 9) water[c] = Math.min(65535, water[c] + 1);
    else if (index.z[k] - level <= rules.lowM && index.z[k] - level >= -.5) low[c] = Math.min(65535, low[c] + 1);
  }
  // Each roof cell's building returns: two neighbouring cells join where they hold returns
  // within joinM of each other.
  const roofStart = new Uint32Array(n + 1);
  for (let k = 0; k < index.total; k++) if (index.cls[k] === 6) { const c = cellOf(index.x[k] - reg.dx, index.y[k] - reg.dy); if (c >= 0) roofStart[c + 1]++; }
  for (let c = 0; c < n; c++) roofStart[c + 1] += roofStart[c];
  const roofX = new Float32Array(roofStart[n]), roofY = new Float32Array(roofStart[n]), fillAt = roofStart.slice(0, n);
  for (let k = 0; k < index.total; k++) {
    if (index.cls[k] !== 6) continue;
    const x = index.x[k] - reg.dx, y = index.y[k] - reg.dy, c = cellOf(x, y);
    if (c >= 0) { roofX[fillAt[c]] = x; roofY[fillAt[c]] = y; fillAt[c]++; }
  }
  const join2 = rules.joinM ** 2, joined = (a, b) => {
    for (let i = roofStart[a]; i < roofStart[a + 1]; i++) for (let j = roofStart[b]; j < roofStart[b + 1]; j++) if ((roofX[i] - roofX[j]) ** 2 + (roofY[i] - roofY[j]) ** 2 <= join2) return true;
    return false;
  };
  // Roofs, eight ways, from every roof cell in the lake.
  const roofOf = new Int32Array(n).fill(-1), found = [];
  // The eight neighbours of a cell; whether any cell within r cells (a disc) passes `fn`.
  const neighbours = (c, fn) => { const i = c % cols, j = (c - i) / cols; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const u = i + di, w = j + dj; if ((di || dj) && u >= 0 && w >= 0 && u < cols && w < rows) fn(w * cols + u); } };
  const near = (c, r, fn) => { const i = c % cols, j = (c - i) / cols; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const u = i + di, w = j + dj; if (u >= 0 && w >= 0 && u < cols && w < rows && di * di + dj * dj <= r * r && fn(w * cols + u)) return true; } return false; };
  for (let start = 0; start < n; start++) {
    if (!roofCell[start] || !inLake[start] || roofOf[start] >= 0) continue;
    const id = found.length, cells = [], stack = [start]; roofOf[start] = id;
    while (stack.length) { const c = stack.pop(); cells.push(c); neighbours(c, m => { if (roofCell[m] && roofOf[m] < 0 && joined(c, m)) { roofOf[m] = id; stack.push(m); } }); }
    found.push(cells);
  }
  const margin = Math.round(rules.drawnMarginM / C), roofs = [];
  for (const [id, cells] of found.entries()) {
    const areaM2 = cells.length * C * C, lakeCells = cells.filter(c => inLake[c]).length, drawnShare = cells.filter(c => inDrawn[c]).length / cells.length;
    if (lakeCells * C * C < rules.lakeReachM2 || drawnShare > rules.drawnShareMax) continue;
    // Cells near a drawn outline stay with it; the rest splits into parts.
    const kept = new Set(cells.filter(c => !near(c, margin, m => inDrawn[m] === 1))), parts = [], seen = new Set();
    for (const s of cells) {
      if (!kept.has(s) || seen.has(s)) continue;
      const part = [], stack = [s]; seen.add(s);
      while (stack.length) { const c = stack.pop(); part.push(c); neighbours(c, m => { if (kept.has(m) && !seen.has(m)) { seen.add(m); stack.push(m); } }); }
      if (part.length * C * C >= rules.minAreaM2) parts.push(part.sort((a, b) => a - b));
    }
    if (!parts.length) continue;
    roofs.push({id, cells, areaM2, lakeShare: lakeCells / cells.length, drawnShare, leftToOutlinesM2: (cells.length - kept.size) * C * C, parts});
  }
  // Each kept roof's returns, by cell.
  const returnsOf = new Map();
  for (const r of roofs) for (const p of r.parts) for (const c of p) returnsOf.set(c, []);
  for (let k = 0; k < index.total; k++) {
    if (index.cls[k] !== 6) continue;
    const x = index.x[k] - reg.dx, y = index.y[k] - reg.dy, list = returnsOf.get(cellOf(x, y));
    if (list) list.push([x, y, index.z[k]]);
  }
  // Water by its returns (or their absence), and a dock or reeds standing near it.
  const wetByReturns = c => !roofCell[c] && (!any[c] || water[c] > ground[c]), dockNear = new Map(), reach = Math.round(rules.dockReachM / C);
  const isDock = c => {
    if (ground[c] || !low[c] || low[c] * 2 < any[c]) return false;
    if (!dockNear.has(c)) dockNear.set(c, near(c, reach, wetByReturns));
    return dockNear.get(c);
  };
  // A piece's share in the lake's outline, and the water share of the ring around it.
  const overWater = corners => {
    const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]), R = rules.ringM;
    let lake = 0, inside = 0, wet = 0, dry = 0, ring = 0;
    for (let j = Math.max(0, Math.floor((Math.min(...ys) - R - y0) / C)); j < Math.min(rows, Math.ceil((Math.max(...ys) + R - y0) / C)); j++) {
      for (let i = Math.max(0, Math.floor((Math.min(...xs) - R - x0) / C)); i < Math.min(cols, Math.ceil((Math.max(...xs) + R - x0) / C)); i++) {
        const c = j * cols + i, d = fromQuad(corners, [x0 + (i + .5) * C, y0 + (j + .5) * C]);
        if (d === 0) { inside++; lake += inLake[c]; continue; }
        if (d > R) continue;
        ring++;
        if (roofCell[c]) continue;
        if (!any[c] || water[c] > ground[c] || isDock(c)) wet++; else if (ground[c]) dry++;
      }
    }
    return {lakeShare: inside ? lake / inside : 0, ringRead: ring ? (wet + dry) / ring : 0, ringWater: wet + dry ? wet / (wet + dry) : 0};
  };
  const grid = {x0, y0, cols, C}, out = [], leftOut = [];
  const close = q => [...q, q[0]], centreOf = c => [x0 + (c % cols + .5) * C, y0 + (Math.floor(c / cols) + .5) * C];
  for (const r of roofs) {
    const pieces = [];
    let covered = 0, total = 0, outlined = 0, returns = 0, landPieces = 0, landM2 = 0;
    const kept = [], dropped = [];
    for (const part of r.parts) {
      const o = outlinePart(part, grid, rules), pts = part.flatMap(c => returnsOf.get(c));
      covered += o.covered; total += o.total; outlined += part.length; returns += pts.length;
      for (const piece of o.pieces) {
        // A rectangle closed over cells that returned nothing holds too few returns to fit.
        const mine = pts.filter(p => insideQuad(piece.corners, p));
        if (mine.length < 3) { covered -= piece.filled; leftOut.push({outline: close(piece.corners), areaM2: piece.cells * C * C, reason: 'too few returns to fit', returns: mine.length}); continue; }
        const corners = rectangleAround(piece.corners, mine), cells = part.filter(c => insideQuad(piece.corners, centreOf(c)));
        const [a, b, , d] = corners, area = Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(d[0] - a[0], d[1] - a[1]), wet = overWater(corners);
        if (wet.lakeShare < rules.pieceLakeMin && (wet.ringRead < rules.ringReadMin || wet.ringWater < rules.ringWaterMin)) {
          landPieces++; landM2 += area; covered -= piece.filled;
          dropped.push({cells, record: {outline: close(corners), areaM2: area, reason: 'not over water', returns: mine.length, lakeShare: wet.lakeShare, ringRead: wet.ringRead, ringWater: wet.ringWater}});
          continue;
        }
        const outline = [[[...corners, corners[0]]]], own = {x: mine.map(p => p[0]), y: mine.map(p => p[1]), z: mine.map(p => p[2])};
        const roof = classifyRoof(outline, bounds(outline), own, area), heights = Float64Array.from(own.z, z => z - level).sort();
        kept.push({cells, filled: piece.filled, area, lakeShare: wet.lakeShare, ringRead: wet.ringRead, ringWater: wet.ringWater, returns: mine.length, piece: {outline: outline[0][0], areaM2: area, fill: piece.filled / piece.cells, angleDeg: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI,
          eaveM: Number.isFinite(roof.eaveZ) ? roof.eaveZ - level : percentile(heights, .25), ridgeM: percentile(heights, .98),
          form: roof.form, confidence: roof.confidence, pitchDeg: Number.isFinite(roof.pitchDeg) ? roof.pitchDeg : null, ridgeBearingDeg: roof.ridge ? roof.ridge.bearingDeg : null, returns: mine.length,
          lakeShare: wet.lakeShare, ringRead: wet.ringRead, ringWater: wet.ringWater}});
      }
    }
    // The pieces kept, joined cell to cell, are judged as a group: one mostly outside the
    // lake's outline, by area, that touches pieces left out as not over water goes with them.
    const owner = new Map(), reach = rules.touchM / C, span = Math.floor(reach + 1e-9);
    for (const p of [...kept, ...dropped]) for (const c of p.cells) owner.set(c, p);
    const touching = p => {
      const found = new Set();
      for (const c of p.cells) {
        const i = c % cols, j = (c - i) / cols;
        for (let dj = -span; dj <= span; dj++) for (let di = -span; di <= span; di++) {
          const u = i + di, w = j + dj, q = u >= 0 && w >= 0 && u < cols && w < rows && di * di + dj * dj <= reach * reach + 1e-9 ? owner.get(w * cols + u) : null;
          if (q && q !== p) found.add(q);
        }
      }
      return found;
    };
    const touches = new Map(kept.map(k => [k, touching(k)])), head = new Map(kept.map(k => [k, k]));
    const lead = k => { while (head.get(k) !== k) k = head.get(k); return k; };
    for (const k of kept) for (const q of touches.get(k)) if (head.has(q) && lead(q) !== lead(k)) head.set(lead(q), lead(k));
    const groups = new Map();
    for (const k of [...kept]) groups.set(lead(k), [...(groups.get(lead(k)) || []), k]);
    const outSet = new Set(dropped);
    for (const members of groups.values()) {
      const area = members.reduce((s, k) => s + k.area, 0), inOutline = members.reduce((s, k) => s + k.lakeShare * k.area, 0);
      if (inOutline >= rules.pieceLakeMin * area || !members.some(k => [...touches.get(k)].some(q => outSet.has(q)))) continue;
      for (const k of members) {
        kept.splice(kept.indexOf(k), 1); landPieces++; landM2 += k.area; covered -= k.filled;
        dropped.push({cells: k.cells, record: {outline: k.piece.outline, areaM2: k.area, reason: 'joined only to pieces left out', returns: k.returns, lakeShare: k.lakeShare, ringRead: k.ringRead, ringWater: k.ringWater}});
      }
    }
    for (const k of kept) pieces.push(k.piece);
    for (const d of dropped) leftOut.push(d.record);
    if (!pieces.length) continue;
    const key = p => { const b = bounds([[p.outline]]); return [b[1], b[0]]; };
    pieces.sort((p, q) => key(p)[0] - key(q)[0] || key(p)[1] - key(q)[1]);
    out.push({areaM2: r.areaM2, lakeShare: r.lakeShare, drawnShare: r.drawnShare, leftToOutlinesM2: r.leftToOutlinesM2, outlinedM2: outlined * C * C,
      coverage: covered / total, onLand: {pieces: landPieces, areaM2: landM2}, returns, pieces});
  }
  const key = r => { const b = bounds(r.pieces.map(p => [p.outline])); return [b[1], b[0]]; }, at = p => { const b = bounds([[p.outline]]); return [b[1], b[0]]; };
  return {roofs: out.sort((a, b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1]), leftOut: leftOut.sort((a, b) => at(a)[0] - at(b)[0] || at(a)[1] - at(b)[1])};
}
