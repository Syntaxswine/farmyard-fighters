// Small planar helpers for footprints in town metres. A MultiPolygon is
// [polygon...], a polygon is [outer, hole...], a ring is [[x, y]...] and may
// repeat its first point. Insideness is even-odd over every ring.

const shoelace = ring => {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
};

export function area(mp) {
  let total = 0;
  for (const polygon of mp) polygon.forEach((ring, i) => { total += (i === 0 ? 1 : -1) * Math.abs(shoelace(ring)); });
  return total;
}

export function centroid(mp) {
  let sx = 0, sy = 0, sa = 0;
  for (const polygon of mp) polygon.forEach((ring, i) => {
    const signed = shoelace(ring), sign = (i === 0 ? 1 : -1) * Math.sign(signed);
    if (!signed) return;
    let cx = 0, cy = 0;
    for (let j = 0, n = ring.length; j < n; j++) {
      const a = ring[j], b = ring[(j + 1) % n], cross = a[0] * b[1] - b[0] * a[1];
      cx += (a[0] + b[0]) * cross; cy += (a[1] + b[1]) * cross;
    }
    const w = sign * signed; // |area| with the ring's role applied
    sx += sign * cx / 6; sy += sign * cy / 6; sa += w;
  });
  return [sx / sa, sy / sa];
}

export function bounds(mp) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const polygon of mp) for (const ring of polygon) for (const [x, y] of ring) {
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

export function contains(mp, [x, y]) {
  let inside = false;
  for (const polygon of mp) for (const ring of polygon) for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// Inside intervals of one horizontal line, even-odd over all rings.
function spans(mp, y) {
  const xs = [];
  for (const polygon of mp) for (const ring of polygon) for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
  }
  xs.sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push(xs[i], xs[i + 1]);
  return out;
}

// Area of A ∩ B by midpoint scanlines: exact along x, sampled every `step` in y.
export function overlapArea(a, b, step = .1, boxA = bounds(a), boxB = bounds(b)) {
  const y0 = Math.max(boxA[1], boxB[1]), y1 = Math.min(boxA[3], boxB[3]);
  if (y1 <= y0 || Math.max(boxA[0], boxB[0]) >= Math.min(boxA[2], boxB[2])) return 0;
  let total = 0;
  for (let y = y0 + step / 2; y < y1; y += step) {
    const p = spans(a, y), q = spans(b, y);
    for (let i = 0, j = 0; i < p.length && j < q.length;) {
      const lo = Math.max(p[i], q[j]), hi = Math.min(p[i + 1], q[j + 1]);
      if (hi > lo) total += hi - lo;
      if (p[i + 1] < q[j + 1]) i += 2; else j += 2;
    }
  }
  return total * step;
}

export function nearestOnPolyline(line, p) {
  let best = null;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (!best || d < best.distance) best = {point: q, distance: d, segment: i};
  }
  return best;
}

// Uniform-grid bucket index over boxes; `query(box)` returns candidate indices.
export function gridIndex(boxes, cell = 32) {
  const buckets = new Map();
  boxes.forEach((box, i) => {
    for (let gx = Math.floor(box[0] / cell); gx <= Math.floor(box[2] / cell); gx++)
      for (let gy = Math.floor(box[1] / cell); gy <= Math.floor(box[3] / cell); gy++) {
        const key = gx + ',' + gy;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(i);
      }
  });
  return box => {
    const found = new Set();
    for (let gx = Math.floor(box[0] / cell); gx <= Math.floor(box[2] / cell); gx++)
      for (let gy = Math.floor(box[1] / cell); gy <= Math.floor(box[3] / cell); gy++)
        for (const i of buckets.get(gx + ',' + gy) || []) found.add(i);
    return [...found].sort((p, q) => p - q);
  };
}
