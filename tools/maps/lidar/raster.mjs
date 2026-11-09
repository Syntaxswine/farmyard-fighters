// Grid helpers for the lidar terrain: gap filling and grayscale PNG files.
// PNG is plain RFC 2083 (8- or 16-bit grayscale, big-endian samples), so the
// Python generator can read it with zlib alone.
import zlib from 'node:zlib';

// Fill NaN cells of a w×h grid from their known neighbours by push-pull: a
// weighted pyramid is averaged up, then pulled back down with bilinear
// interpolation, and the filled cells are relaxed towards the Laplace solution.
// Known cells never change.
export function fillGaps(values, w, h, relax = 40) {
  const levels = [{w, h, v: Float64Array.from(values, v => Number.isNaN(v) ? 0 : v), k: Float64Array.from(values, v => Number.isNaN(v) ? 0 : 1)}];
  while (levels.at(-1).w > 1 || levels.at(-1).h > 1) {
    const f = levels.at(-1), cw = Math.ceil(f.w / 2), ch = Math.ceil(f.h / 2), v = new Float64Array(cw * ch), k = new Float64Array(cw * ch);
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const i = y * f.w + x, j = (y >> 1) * cw + (x >> 1);
      v[j] += f.v[i] * f.k[i]; k[j] += f.k[i];
    }
    for (let j = 0; j < v.length; j++) { if (k[j] > 0) v[j] /= k[j]; k[j] = Math.min(1, k[j]); }
    levels.push({w: cw, h: ch, v, k});
  }
  for (let l = levels.length - 2; l >= 0; l--) {
    const f = levels[l], c = levels[l + 1];
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const i = y * f.w + x;
      if (f.k[i] >= 1) continue;
      // fine centre (x + .5) sits at coarse coordinate (x + .5) / 2 - .5
      const cx = Math.min(c.w - 1, Math.max(0, (x + .5) / 2 - .5)), cy = Math.min(c.h - 1, Math.max(0, (y + .5) / 2 - .5));
      const x0 = Math.floor(cx), y0 = Math.floor(cy), x1 = Math.min(c.w - 1, x0 + 1), y1 = Math.min(c.h - 1, y0 + 1), fx = cx - x0, fy = cy - y0;
      const up = (c.v[y0 * c.w + x0] * (1 - fx) + c.v[y0 * c.w + x1] * fx) * (1 - fy) + (c.v[y1 * c.w + x0] * (1 - fx) + c.v[y1 * c.w + x1] * fx) * fy;
      f.v[i] = f.v[i] * f.k[i] + up * (1 - f.k[i]);
    }
  }
  const out = levels[0].v, unknown = [];
  for (let i = 0; i < values.length; i++) if (Number.isNaN(values[i])) unknown.push(i);
  for (let pass = 0; pass < relax; pass++) for (const i of unknown) {
    const x = i % w, y = (i - x) / w;
    let s = 0, n = 0;
    if (x > 0) { s += out[i - 1]; n++; } if (x < w - 1) { s += out[i + 1]; n++; }
    if (y > 0) { s += out[i - w]; n++; } if (y < h - 1) { s += out[i + w]; n++; }
    out[i] = s / n;
  }
  return out;
}

// 1 where a cell centre of the cols×rows grid at origin (x0, y0) lies inside
// the multipolygon (even-odd over every ring), by one scanline per row.
export function maskOf(mp, x0, y0, cols, rows, cell = 1) {
  const mask = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const y = y0 + (j + .5) * cell, xs = [];
    for (const poly of mp) for (const ring of poly) for (let k = 0, n = ring.length; k < n; k++) {
      const a = ring[k], b = ring[(k + 1) % n];
      if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - x0) / cell - .5)), i1 = Math.min(cols - 1, Math.ceil((xs[k + 1] - x0) / cell - .5) - 1);
      for (let i = i0; i <= i1; i++) mask[j * cols + i] = 1;
    }
  }
  return mask;
}

const chunk = (type, data) => {
  const head = Buffer.alloc(8), body = Buffer.concat([Buffer.from(type, 'latin1'), data]), crc = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0); crc.writeUInt32BE(zlib.crc32(body) >>> 0, 0);
  return Buffer.concat([head.subarray(0, 4), body, crc]);
};

const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
const predict = (f, a, b, c) => f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);

// Each row takes the filter with the smallest sum of absolute bytes.
export function encodePng(width, height, depth, samples, text = {}) {
  const bpp = depth / 8, stride = width * bpp, raw = Buffer.alloc(stride * height), rows = [];
  for (let i = 0; i < width * height; i++) depth === 16 ? raw.writeUInt16BE(samples[i], i * 2) : raw[i] = samples[i];
  const line = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const cur = raw.subarray(y * stride, (y + 1) * stride), prev = y ? raw.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    let best = null, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        line[i] = (cur[i] - predict(f, a, b, c)) & 255;
      }
      let score = 0;
      for (let i = 0; i < stride; i++) score += line[i] < 128 ? line[i] : 256 - line[i];
      if (score < bestScore) { bestScore = score; best = Buffer.concat([Buffer.from([f]), line]); }
    }
    rows.push(best);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = depth; ihdr[9] = 0;
  const texts = Object.entries(text).map(([k, v]) => chunk('tEXt', Buffer.from(`${k}\0${v}`, 'latin1')));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), ...texts,
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let at = 8, width, height, depth;
  const idat = [], text = {};
  while (at < buf.length) {
    const len = buf.readUInt32BE(at), type = buf.toString('latin1', at + 4, at + 8), data = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8];
      if (data[9] !== 0 || data[12] !== 0 || (depth !== 8 && depth !== 16)) throw new Error('only non-interlaced 8/16-bit grayscale PNG');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'tEXt') { const z = data.indexOf(0); text[data.toString('latin1', 0, z)] = data.toString('latin1', z + 1); }
    at += 12 + len;
  }
  const bpp = depth / 8, stride = width * bpp, raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = y ? out[(y - 1) * stride + i] : 0, c = y && i >= bpp ? out[(y - 1) * stride + i - bpp] : 0;
      cur[i] = (src[i] + predict(f, a, b, c)) & 255;
    }
  }
  const samples = depth === 16 ? new Uint16Array(width * height) : new Uint8Array(width * height);
  for (let i = 0; i < samples.length; i++) samples[i] = depth === 16 ? out.readUInt16BE(i * 2) : out[i];
  return {width, height, depth, samples, text};
}
