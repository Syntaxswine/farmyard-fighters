// Tree crowns from the lidar canopy.
//
// This vendor classes no vegetation: trees are among the unclassified returns. The
// canopy is the highest unclassified return over the bare earth in each 0.5 m cell,
// wherever it stands CROWNS.tallM or more above it and the cell holds no building
// return. A lightly smoothed canopy (3 x 3 mean) is climbed from every canopy cell to
// the top it reaches; neighbouring tops are one crown unless the lower stands
// CROWNS.prominenceM above the saddle between them (merged highest saddle first, so
// one bumpy crown is one tree), and never into a crown larger than CROWNS.maxAreaM2
// (a 23 m crown, as wide as the town's big live oaks; a closed woodland canopy is
// many trees). A crown smaller than CROWNS.minAreaM2, or narrower than
// CROWNS.minWidthM across (an overhead wire), is dropped. So is one where fewer than
// CROWNS.minMultiShare of its canopy returns came from pulses that returned more than once:
// foliage lets a pulse through to return again lower down, while a wire, a pole, a sign or
// a roof the vendor left unclassified stops it. Across the town 5,686 of the 7,157 crowns
// the other rules keep are over 0.3, the palms of Palm Island Park have a 10th percentile of
// 0.38 and the pine-shaped crowns one of 0.18; the 198 under 0.1 are short solid objects,
// poles and the wire along East 9th Avenue.
// The thresholds were fixed by the method, not tuned to the town.
export const CROWNS = {cellM: .5, tallM: 2.5, prominenceM: 2, maxAreaM2: 400, minAreaM2: 4, minWidthM: 1.5, minMultiShare: .1};

// The canopy height model: the highest unclassified (class 1) return over the ground
// per cell, and a mask of cells holding building (class 6) returns, over the box
// [x0, y0, x1, y1]. `ground(x, y)` gives the bare earth under a point. Per cell it also
// counts the canopy returns (unclassified, tallM or more up) and how many of them came
// from pulses that returned more than once (the LAS return count, `ret` bits 3-5).
export function canopyHeights(index, ground, [x0, y0, x1, y1], cellM = CROWNS.cellM, tallM = CROWNS.tallM) {
  const cols = Math.round((x1 - x0) / cellM), rows = Math.round((y1 - y0) / cellM), heights = new Float32Array(cols * rows), building = new Uint8Array(cols * rows);
  const returns = new Uint16Array(cols * rows), multi = new Uint16Array(cols * rows);
  for (let k = 0; k < index.total; k++) {
    const x = index.x[k], y = index.y[k], c = index.cls[k];
    if (x < x0 || y < y0 || x >= x1 || y >= y1 || (c !== 1 && c !== 6)) continue;
    const i = Math.floor((y - y0) / cellM) * cols + Math.floor((x - x0) / cellM);
    if (c === 6) { building[i] = 1; continue; }
    const h = index.z[k] - ground(x, y);
    if (h > heights[i]) heights[i] = h;
    if (h >= tallM && returns[i] < 65535) { returns[i]++; if (((index.ret[k] >> 3) & 7) > 1) multi[i]++; }
  }
  return {heights, building, returns, multi, cols, rows, cellM, origin: [x0, y0]};
}

// The crowns in a canopy: [{top, centre, areaM2, heightM, widthM, multiShare}], top and
// centre in the canopy's frame (metres), ordered by position. Deterministic for a given
// canopy. Without `returns` and `multi` counts the penetration rule is not applied (and
// multiShare is null).
export function findCrowns({heights, building, returns = null, multi = null, cols, rows, cellM, origin}, rules = CROWNS) {
  const n = cols * rows, smooth = new Float32Array(n);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    let s = 0, m = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const x = i + di, y = j + dj; if (x >= 0 && y >= 0 && x < cols && y < rows) { s += heights[y * cols + x]; m++; } }
    smooth[j * cols + i] = s / m;
  }
  const canopy = i => heights[i] >= rules.tallM && !building[i];
  // Each canopy cell climbs to its highest neighbour (ties to the lower index) until it tops out.
  const owner = new Int32Array(n).fill(-1);
  const climb = start => {
    let i = start;
    for (;;) {
      const x = i % cols, y = (i - x) / cols; let best = i;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const u = x + di, v = y + dj; if (u < 0 || v < 0 || u >= cols || v >= rows) continue;
        const c = v * cols + u; if (smooth[c] > smooth[best] || smooth[c] === smooth[best] && c < best) best = c;
      }
      if (best === i) return i; i = best;
    }
  };
  for (let i = 0; i < n; i++) if (canopy(i)) owner[i] = climb(i);
  // Saddles between neighbouring basins: the highest pass between them (4-neighbours).
  const saddles = new Map();
  for (let i = 0; i < n; i++) {
    if (owner[i] < 0) continue;
    const x = i % cols;
    for (const c of [x + 1 < cols ? i + 1 : -1, i + cols < n ? i + cols : -1]) {
      if (c < 0 || owner[c] < 0 || owner[c] === owner[i]) continue;
      const a = Math.min(owner[i], owner[c]), b = Math.max(owner[i], owner[c]), key = a * n + b, s = Math.min(smooth[i], smooth[c]);
      if (!(saddles.get(key) >= s)) saddles.set(key, s);
    }
  }
  const pairs = [...saddles].map(([key, s]) => [Math.floor(key / n), key % n, s]).sort((p, q) => q[2] - p[2] || p[0] - q[0] || p[1] - q[1]);
  const parent = new Map(), root = a => { while (parent.get(a) !== a) a = parent.get(a); return a; };
  // Every top a climb reaches is a crown, even one on a cell that is not canopy itself
  // (the smoothing can lift a cell beside the canopy above the canopy's own cells).
  for (let i = 0; i < n; i++) if (owner[i] >= 0 && !parent.has(owner[i])) parent.set(owner[i], owner[i]);
  const cells = new Map(); for (let i = 0; i < n; i++) if (owner[i] >= 0) cells.set(owner[i], (cells.get(owner[i]) || 0) + 1);
  const maxCells = rules.maxAreaM2 / (cellM * cellM);
  for (const [a, b, s] of pairs) {
    const ra = root(a), rb = root(b); if (ra === rb) continue;
    const [hi, lo] = smooth[ra] > smooth[rb] || smooth[ra] === smooth[rb] && ra < rb ? [ra, rb] : [rb, ra];
    if (smooth[lo] - s < rules.prominenceM && cells.get(hi) + cells.get(lo) <= maxCells) { parent.set(lo, hi); cells.set(hi, cells.get(hi) + cells.get(lo)); }
  }
  // Gather each crown's cells: area, highest return, centroid and second moments.
  const crowns = new Map();
  for (let i = 0; i < n; i++) {
    if (owner[i] < 0) continue;
    const r = root(owner[i]), x = origin[0] + (i % cols + .5) * cellM, y = origin[1] + (Math.floor(i / cols) + .5) * cellM;
    let c = crowns.get(r); if (!c) crowns.set(r, c = {cells: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, heightM: 0, returns: 0, multi: 0});
    c.cells++; c.sx += x; c.sy += y; c.sxx += x * x; c.syy += y * y; c.sxy += x * y; c.heightM = Math.max(c.heightM, heights[i]);
    if (returns) { c.returns += returns[i]; c.multi += multi[i]; }
  }
  const out = [];
  for (const [top, c] of crowns) {
    const areaM2 = c.cells * cellM * cellM, mx = c.sx / c.cells, my = c.sy / c.cells;
    const vx = c.sxx / c.cells - mx * mx, vy = c.syy / c.cells - my * my, cxy = c.sxy / c.cells - mx * my;
    // Width across: four standard deviations along the minor axis, a disc's diameter (a strip reads 1.15 times its width).
    const minor = Math.max(0, (vx + vy) / 2 - Math.sqrt(((vx - vy) / 2) ** 2 + cxy * cxy)), widthM = Math.max(cellM, 4 * Math.sqrt(minor + cellM * cellM / 12));
    const multiShare = returns ? (c.returns ? c.multi / c.returns : 0) : null;
    if (areaM2 < rules.minAreaM2 || widthM < rules.minWidthM || (returns && multiShare < rules.minMultiShare)) continue;
    out.push({top: [origin[0] + (top % cols + .5) * cellM, origin[1] + (Math.floor(top / cols) + .5) * cellM], centre: [mx, my], areaM2, heightM: c.heightM, widthM, multiShare});
  }
  return out.sort((p, q) => p.top[1] - q.top[1] || p.top[0] - q.top[0]);
}
