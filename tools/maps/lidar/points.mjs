// Decode the cached Entwine nodes into town coordinates, in worker threads.
//
// Each point goes EPSG:3857 -> WGS84 latitude/longitude (spherical Mercator
// inverse) -> town east/south metres through tools/maps/house-reference/
// projection.mjs, the port of the Python generator's projection. Withheld points
// and the noise classes (7 low, 18 high) are dropped. The rest are binned into a
// 1 m index over the extent plus margin: points of cell c are [start[c], start[c+1]).
import fs from 'node:fs';
import os from 'node:os';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {createProjection} from '../house-reference/projection.mjs';
import {decodeLaz} from './laz.mjs';

export const NOISE = new Set([7, 18]);
const R = 6378137;

function decodeNode(file, town, box, extent) {
  const d = decodeLaz(fs.readFileSync(file)), h = d.header, n = d.x.length;
  const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n), cls = new Uint8Array(n), ret = new Uint8Array(n);
  const classes = new Array(32).fill(0), flights = new Map();
  let kept = 0, withheld = 0, first = 0, inExtent = 0;
  for (let i = 0; i < n; i++) {
    const mx = d.x[i] * h.scale[0] + h.offset[0], my = d.y[i] * h.scale[1] + h.offset[1];
    const [tx, ty] = town((2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * 180 / Math.PI, mx / R * 180 / Math.PI);
    if (tx < box[0] || ty < box[1] || tx >= box[2] || ty >= box[3]) continue;
    const c = d.cls[i] & 31, held = d.cls[i] >> 7;
    if (tx >= extent[0] && ty >= extent[1] && tx < extent[2] && ty < extent[3]) {
      inExtent++; classes[c]++;
      if (held) withheld++;
      else if ((d.flags[i] & 7) === 1) first++;
      const f = flights.get(d.source[i]) || {lo: Infinity, hi: -Infinity, n: 0};
      if (d.gps[i] < f.lo) f.lo = d.gps[i];
      if (d.gps[i] > f.hi) f.hi = d.gps[i];
      f.n++; flights.set(d.source[i], f);
    }
    if (held || NOISE.has(c)) continue;
    x[kept] = tx; y[kept] = ty; z[kept] = d.z[i] * h.scale[2] + h.offset[2]; cls[kept] = c; ret[kept] = d.flags[i] & 0x3f; kept++;
  }
  return {x: x.slice(0, kept), y: y.slice(0, kept), z: z.slice(0, kept), cls: cls.slice(0, kept), ret: ret.slice(0, kept),
    stats: {inExtent, withheld, first, classes, flights: [...flights].map(([id, f]) => [id, f.lo, f.hi, f.n])}};
}

if (!isMainThread && workerData?.lidarDecode) {
  const {town} = createProjection(workerData.projection);
  parentPort.on('message', ({index, file}) => {
    const r = decodeNode(file, town, workerData.box, workerData.extent);
    parentPort.postMessage({index, ...r}, [r.x.buffer, r.y.buffer, r.z.buffer, r.cls.buffer, r.ret.buffer]);
  });
}

// files: node paths in a fixed order; box/extent: [x0, y0, x1, y1] town metres.
export async function loadPoints(files, projection, box, extent, threads = Math.max(1, Math.min(12, os.availableParallelism() - 2))) {
  const results = new Array(files.length);
  let next = 0;
  await Promise.all(Array.from({length: Math.min(threads, files.length)}, () => new Promise((resolve, reject) => {
    const worker = new Worker(fileURLToPath(import.meta.url), {workerData: {lidarDecode: true, projection, box, extent}});
    const feed = () => { if (next < files.length) { const index = next++; worker.postMessage({index, file: files[index]}); } else worker.terminate().then(resolve); };
    worker.on('message', m => { results[m.index] = m; feed(); });
    worker.on('error', reject);
    feed();
  })));
  const cols = Math.ceil(box[2] - box[0]), rows = Math.ceil(box[3] - box[1]), start = new Int32Array(cols * rows + 1);
  const cellOf = (px, py) => Math.min(rows - 1, Math.floor(py - box[1])) * cols + Math.min(cols - 1, Math.floor(px - box[0]));
  let total = 0;
  for (const r of results) { for (let i = 0; i < r.x.length; i++) start[cellOf(r.x[i], r.y[i]) + 1]++; total += r.x.length; }
  for (let c = 0; c < cols * rows; c++) start[c + 1] += start[c];
  const fill = start.slice(0, -1), x = new Float32Array(total), y = new Float32Array(total), z = new Float32Array(total), cls = new Uint8Array(total), ret = new Uint8Array(total);
  for (const r of results) for (let i = 0; i < r.x.length; i++) {
    const k = fill[cellOf(r.x[i], r.y[i])]++;
    x[k] = r.x[i]; y[k] = r.y[i]; z[k] = r.z[i]; cls[k] = r.cls[i]; ret[k] = r.ret[i];
  }
  const stats = {inExtent: 0, withheld: 0, first: 0, classes: new Array(32).fill(0), flights: new Map()};
  for (const {stats: s} of results) {
    stats.inExtent += s.inExtent; stats.withheld += s.withheld; stats.first += s.first;
    s.classes.forEach((v, c) => { stats.classes[c] += v; });
    for (const [id, lo, hi, n] of s.flights) {
      const f = stats.flights.get(id) || {lo: Infinity, hi: -Infinity, n: 0};
      stats.flights.set(id, {lo: Math.min(f.lo, lo), hi: Math.max(f.hi, hi), n: f.n + n});
    }
  }
  return {x, y, z, cls, ret, start, cols, rows, box, total, stats};
}

// Indices of points whose 1 m cell meets [x0, y0, x1, y1].
export function* pointsIn(index, [x0, y0, x1, y1]) {
  const {box, cols, rows, start} = index;
  const i0 = Math.max(0, Math.floor(x0 - box[0])), i1 = Math.min(cols - 1, Math.floor(x1 - box[0]));
  const j0 = Math.max(0, Math.floor(y0 - box[1])), j1 = Math.min(rows - 1, Math.floor(y1 - box[1]));
  for (let j = j0; j <= j1; j++) for (let k = start[j * cols + i0]; k < start[j * cols + i1 + 1]; k++) yield k;
}
