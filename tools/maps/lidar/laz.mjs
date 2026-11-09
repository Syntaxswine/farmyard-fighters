// A small LAZ reader for the USGS 3DEP Entwine tiles (ept-data/*.laz): LAS 1.2–1.4
// headers and LASzip's pointwise-chunked v2 items POINT10, GPSTIME11 and BYTE,
// which is what Entwine writes. Pure JavaScript, no dependencies. The arithmetic
// coder, models and integer corrector follow LASzip's published format exactly;
// `checkAgainstHeader` compares a decoded file with its own header (point count,
// XYZ bounds, return histogram), so a decoding slip cannot pass silently.
const AC_MIN = 0x01000000, DM_SHIFT = 15, DM_MAX = 1 << 15, BM_SHIFT = 13, BM_MAX = 1 << 13;
const TWO32 = 4294967296;

class Model {
  constructor(symbols) {
    this.symbols = symbols; this.last = symbols - 1;
    if (symbols > 16) {
      let bits = 3;
      while (symbols > 1 << (bits + 2)) bits++;
      this.tableSize = 1 << bits; this.tableShift = DM_SHIFT - bits; this.table = new Uint32Array(this.tableSize + 2);
    } else { this.table = null; this.tableSize = this.tableShift = 0; }
    this.dist = new Uint32Array(symbols); this.count = new Uint32Array(symbols).fill(1);
    this.total = 0; this.cycle = symbols; this.update(); this.until = this.cycle = (symbols + 6) >>> 1;
  }
  update() {
    if ((this.total += this.cycle) > DM_MAX) {
      let total = 0;
      for (let n = 0; n < this.symbols; n++) total += (this.count[n] = (this.count[n] + 1) >>> 1);
      this.total = total;
    }
    const scale = Math.floor(0x80000000 / this.total), {dist, count, table} = this;
    let sum = 0, s = 0;
    for (let k = 0; k < this.symbols; k++) {
      dist[k] = (scale * sum) >>> (31 - DM_SHIFT); sum += count[k];
      if (table) { const w = dist[k] >>> this.tableShift; while (s < w) table[++s] = k - 1; }
    }
    if (table) { table[0] = 0; while (s <= this.tableSize) table[++s] = this.symbols - 1; }
    this.cycle = (5 * this.cycle) >>> 2;
    const max = (this.symbols + 6) << 3;
    if (this.cycle > max) this.cycle = max;
    this.until = this.cycle;
  }
}

class BitModel {
  constructor() { this.bit0 = 1; this.bits = 2; this.prob = 1 << (BM_SHIFT - 1); this.cycle = this.until = 4; }
  update() {
    if ((this.bits += this.cycle) > BM_MAX) {
      this.bits = (this.bits + 1) >>> 1; this.bit0 = (this.bit0 + 1) >>> 1;
      if (this.bit0 === this.bits) this.bits++;
    }
    this.prob = (this.bit0 * Math.floor(0x80000000 / this.bits)) >>> (31 - BM_SHIFT);
    this.cycle = Math.min(64, (5 * this.cycle) >>> 2); this.until = this.cycle;
  }
}

// value and length stay unsigned 32-bit integers held in doubles; every product
// below is < 2^32, so the arithmetic is exact.
class Decoder {
  constructor(buf, pos) {
    this.buf = buf; this.pos = pos + 4; this.length = 0xFFFFFFFF;
    this.value = ((buf[pos] << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3]) >>> 0;
  }
  // A corrupt stream can drive length to zero or read on past the file; stop
  // rather than loop.
  renorm() {
    if (!(this.length > 0) || this.pos > this.buf.length + 8) throw new Error('corrupt LAZ stream');
    do { this.value = ((this.value << 8) | this.buf[this.pos++]) >>> 0; this.length = (this.length << 8) >>> 0; }
    while (this.length < AC_MIN);
  }
  bit(m) {
    const x = m.prob * (this.length >>> BM_SHIFT), sym = this.value >= x ? 1 : 0;
    if (sym) { this.value -= x; this.length -= x; } else { this.length = x; m.bit0++; }
    if (this.length < AC_MIN) this.renorm();
    if (--m.until === 0) m.update();
    return sym;
  }
  symbol(m) {
    let n, sym, x, y = this.length;
    if (m.table) {
      this.length = this.length >>> DM_SHIFT;
      const dv = Math.floor(this.value / this.length), t = dv >>> m.tableShift;
      sym = m.table[t]; n = m.table[t + 1] + 1;
      while (n > sym + 1) { const k = (sym + n) >>> 1; if (m.dist[k] > dv) n = k; else sym = k; }
      x = m.dist[sym] * this.length;
      if (sym !== m.last) y = m.dist[sym + 1] * this.length;
    } else {
      x = sym = 0; this.length = this.length >>> DM_SHIFT;
      let k = (n = m.symbols) >>> 1;
      do {
        const z = this.length * m.dist[k];
        if (z > this.value) { n = k; y = z; } else { sym = k; x = z; }
      } while ((k = (sym + n) >>> 1) !== sym);
    }
    this.value -= x; this.length = y - x;
    if (this.length < AC_MIN) this.renorm();
    m.count[sym]++;
    if (--m.until === 0) m.update();
    return sym;
  }
  short() {
    this.length = this.length >>> 16;
    const sym = Math.floor(this.value / this.length);
    this.value -= this.length * sym; this.renorm();
    return sym;
  }
  bits(n) {
    if (n > 19) { const lo = this.short(); return this.bits(n - 16) * 65536 + lo; }
    this.length = this.length >>> n;
    const sym = Math.floor(this.value / this.length);
    this.value -= this.length * sym;
    if (this.length < AC_MIN) this.renorm();
    return sym;
  }
  int() { const lo = this.short(); return this.short() * 65536 + lo; }
}

// LASzip's IntegerCompressor, decompress side: a magnitude class k, then the
// corrector inside it. With 32 bits the sum wraps like a C int32.
class IntDecoder {
  constructor(dec, bits = 16, contexts = 1, bitsHigh = 8) {
    this.dec = dec; this.bitsHigh = bitsHigh; this.k = 0;
    if (bits < 32) { this.corrBits = bits; this.corrRange = 2 ** bits; this.corrMin = -(2 ** (bits - 1)); }
    else { this.corrBits = 32; this.corrRange = 0; this.corrMin = -0x80000000; }
    this.mBits = Array.from({length: contexts}, () => new Model(this.corrBits + 1));
    this.mCorr = [new BitModel()];
    for (let i = 1; i <= this.corrBits; i++) this.mCorr.push(new Model(i <= bitsHigh ? 1 << i : 1 << bitsHigh));
  }
  decompress(pred, context = 0) {
    const dec = this.dec, k = this.k = dec.symbol(this.mBits[context]);
    let c;
    if (k === 0) c = dec.bit(this.mCorr[0]);
    else if (k < 32) {
      if (k <= this.bitsHigh) c = dec.symbol(this.mCorr[k]);
      else { const k1 = k - this.bitsHigh; c = dec.symbol(this.mCorr[k]) * 2 ** k1 + dec.bits(k1); }
      c = c >= 2 ** (k - 1) ? c + 1 : c - (2 ** k - 1);
    } else c = this.corrMin;
    if (!this.corrRange) return (pred + c) | 0;
    const real = pred + c;
    return real < 0 ? real + this.corrRange : real >= this.corrRange ? real - this.corrRange : real;
  }
}

class Median5 {
  constructor() { this.v = [0, 0, 0, 0, 0]; this.high = true; }
  get() { return this.v[2]; }
  add(x) {
    const v = this.v;
    if (this.high) {
      if (x < v[2]) {
        v[4] = v[3]; v[3] = v[2];
        if (x < v[0]) { v[2] = v[1]; v[1] = v[0]; v[0] = x; }
        else if (x < v[1]) { v[2] = v[1]; v[1] = x; }
        else v[2] = x;
      } else {
        if (x < v[3]) { v[4] = v[3]; v[3] = x; } else v[4] = x;
        this.high = false;
      }
    } else if (v[2] < x) {
      v[0] = v[1]; v[1] = v[2];
      if (v[4] < x) { v[2] = v[3]; v[3] = v[4]; v[4] = x; }
      else if (v[3] < x) { v[2] = v[3]; v[3] = x; }
      else v[2] = x;
    } else {
      if (v[1] < x) { v[0] = v[1]; v[1] = x; } else v[0] = x;
      this.high = true;
    }
  }
}

// Context tables of LASzip's POINT10 v2 coder, indexed [number of returns][return number].
const RETURN_MAP = [[15, 14, 13, 12, 11, 10, 9, 8], [14, 0, 1, 3, 6, 10, 10, 9], [13, 1, 2, 4, 7, 11, 11, 10],
  [12, 3, 4, 5, 8, 12, 12, 11], [11, 6, 7, 8, 9, 13, 13, 12], [10, 10, 11, 12, 13, 14, 14, 13],
  [9, 10, 11, 12, 13, 14, 15, 14], [8, 9, 10, 11, 12, 13, 14, 15]];
const RETURN_LEVEL = Array.from({length: 8}, (_, n) => Array.from({length: 8}, (_, r) => Math.abs(n - r)));

class Point10 {
  constructor(dec, dv, at) {
    this.dec = dec;
    this.mChanged = new Model(64); this.icIntensity = new IntDecoder(dec, 16, 4);
    this.mScanAngle = [new Model(256), new Model(256)]; this.icSource = new IntDecoder(dec, 16);
    this.mBitByte = new Array(256).fill(null); this.mClass = new Array(256).fill(null); this.mUser = new Array(256).fill(null);
    this.icDx = new IntDecoder(dec, 32, 2); this.icDy = new IntDecoder(dec, 32, 22); this.icZ = new IntDecoder(dec, 32, 20);
    this.xMedian = Array.from({length: 16}, () => new Median5()); this.yMedian = Array.from({length: 16}, () => new Median5());
    this.lastIntensity = new Int32Array(16); this.lastHeight = new Int32Array(8);
    this.x = dv.getInt32(at, true); this.y = dv.getInt32(at + 4, true); this.z = dv.getInt32(at + 8, true);
    this.intensity = 0; // LASzip starts each chunk's model with intensity zeroed
    this.flags = dv.getUint8(at + 14); this.cls = dv.getUint8(at + 15); this.angle = dv.getUint8(at + 16);
    this.user = dv.getUint8(at + 17); this.source = dv.getUint16(at + 18, true);
  }
  read() {
    const dec = this.dec, changed = dec.symbol(this.mChanged);
    if (changed & 32) this.flags = dec.symbol(this.mBitByte[this.flags] ||= new Model(256));
    const r = this.flags & 7, n = (this.flags >> 3) & 7, m = RETURN_MAP[n][r], l = RETURN_LEVEL[n][r];
    if (changed & 16) this.intensity = this.lastIntensity[m] = this.icIntensity.decompress(this.lastIntensity[m], m < 3 ? m : 3);
    else if (changed) this.intensity = this.lastIntensity[m];
    if (changed & 8) this.cls = dec.symbol(this.mClass[this.cls] ||= new Model(256));
    if (changed & 4) this.angle = (dec.symbol(this.mScanAngle[(this.flags >> 6) & 1]) + this.angle) & 255;
    if (changed & 2) this.user = dec.symbol(this.mUser[this.user] ||= new Model(256));
    if (changed & 1) this.source = this.icSource.decompress(this.source);
    const single = n === 1 ? 1 : 0;
    let diff = this.icDx.decompress(this.xMedian[m].get(), single);
    this.x = (this.x + diff) | 0; this.xMedian[m].add(diff);
    let k = this.icDx.k;
    diff = this.icDy.decompress(this.yMedian[m].get(), single + (k < 20 ? k & ~1 : 20));
    this.y = (this.y + diff) | 0; this.yMedian[m].add(diff);
    k = (this.icDx.k + this.icDy.k) >>> 1;
    this.z = this.lastHeight[l] = this.icZ.decompress(this.lastHeight[l], single + (k < 18 ? k & ~1 : 18));
  }
}

const GPS_MULTI = 500, GPS_MINUS = -10, GPS_UNCHANGED = GPS_MULTI - GPS_MINUS + 1, GPS_FULL = GPS_MULTI - GPS_MINUS + 2;
const GPS_TOTAL = GPS_MULTI - GPS_MINUS + 6;

// GPS time is coded on the integer bit pattern of the double, as four
// interleaved sequences; hi/lo hold each sequence's 64 bits.
class GpsTime11 {
  constructor(dec, dv, at) {
    this.dec = dec; this.mMulti = new Model(GPS_TOTAL); this.mZero = new Model(6); this.ic = new IntDecoder(dec, 32, 9);
    this.last = 0; this.next = 0; this.diff = new Int32Array(4); this.extreme = new Int32Array(4);
    this.lo = new Float64Array(4); this.hi = new Float64Array(4);
    this.lo[0] = dv.getUint32(at, true); this.hi[0] = dv.getUint32(at + 4, true);
  }
  add(i, d) {
    let lo = this.lo[i] + d;
    if (lo >= TWO32) { lo -= TWO32; this.hi[i] = (this.hi[i] + 1) % TWO32; }
    else if (lo < 0) { lo += TWO32; this.hi[i] = (this.hi[i] + TWO32 - 1) % TWO32; }
    this.lo[i] = lo;
  }
  full() {
    const dec = this.dec;
    this.next = (this.next + 1) & 3;
    this.hi[this.next] = this.ic.decompress(this.hi[this.last] | 0, 8) >>> 0;
    this.lo[this.next] = dec.int();
    this.last = this.next; this.diff[this.last] = 0; this.extreme[this.last] = 0;
  }
  read() {
    const dec = this.dec, last = this.last;
    if (this.diff[last] === 0) {
      const multi = dec.symbol(this.mZero);
      if (multi === 1) { const d = this.diff[last] = this.ic.decompress(0, 0); this.add(last, d); this.extreme[last] = 0; }
      else if (multi === 2) this.full();
      else if (multi > 2) { this.last = (last + multi - 2) & 3; this.read(); }
      return;
    }
    const multi = dec.symbol(this.mMulti);
    if (multi === 1) { this.add(last, this.ic.decompress(this.diff[last], 1)); this.extreme[last] = 0; }
    else if (multi < GPS_UNCHANGED) {
      let d;
      const extreme = () => { if (++this.extreme[last] > 3) { this.diff[last] = d; this.extreme[last] = 0; } };
      if (multi === 0) { d = this.ic.decompress(0, 7); extreme(); }
      else if (multi < GPS_MULTI) d = this.ic.decompress(Math.imul(multi, this.diff[last]), multi < 10 ? 2 : 3);
      else if (multi === GPS_MULTI) { d = this.ic.decompress(Math.imul(GPS_MULTI, this.diff[last]), 4); extreme(); }
      else {
        const minus = GPS_MULTI - multi;
        if (minus > GPS_MINUS) d = this.ic.decompress(Math.imul(minus, this.diff[last]), 5);
        else { d = this.ic.decompress(Math.imul(GPS_MINUS, this.diff[last]), 6); extreme(); }
      }
      this.add(last, d);
    } else if (multi === GPS_FULL) this.full();
    else if (multi > GPS_FULL) { this.last = (last + multi - GPS_FULL) & 3; this.read(); }
  }
}

class Bytes {
  constructor(dec, dv, at, count) {
    this.dec = dec; this.models = Array.from({length: count}, () => new Model(256));
    this.last = Uint8Array.from({length: count}, (_, i) => dv.getUint8(at + i));
  }
  read() { for (let i = 0; i < this.last.length; i++) this.last[i] = (this.last[i] + this.dec.symbol(this.models[i])) & 255; }
}

const text = (buf, a, b) => new TextDecoder('latin1').decode(buf.subarray(a, b)).replace(/\0[\s\S]*$/, '');

export function readHeader(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (text(buf, 0, 4) !== 'LASF') throw new Error('not a LAS file');
  const minor = buf[25], headerSize = dv.getUint16(94, true), pointOffset = dv.getUint32(96, true);
  const vlrCount = dv.getUint32(100, true), format = buf[104], pointLength = dv.getUint16(105, true);
  let count = dv.getUint32(107, true), byReturn = Array.from({length: 5}, (_, i) => dv.getUint32(111 + 4 * i, true));
  if (minor >= 4 && headerSize >= 375) {
    count = Number(dv.getBigUint64(247, true));
    byReturn = Array.from({length: 15}, (_, i) => Number(dv.getBigUint64(255 + 8 * i, true)));
  }
  const f64 = o => dv.getFloat64(o, true);
  const header = {version: `${buf[24]}.${minor}`, systemId: text(buf, 26, 58), software: text(buf, 58, 90),
    created: {dayOfYear: dv.getUint16(90, true), year: dv.getUint16(92, true)}, globalEncoding: dv.getUint16(6, true),
    pointOffset, format: format & 0x3f, compressed: (format & 0x80) !== 0, pointLength, count, byReturn,
    scale: [f64(131), f64(139), f64(147)], offset: [f64(155), f64(163), f64(171)],
    min: [f64(187), f64(203), f64(219)], max: [f64(179), f64(195), f64(211)], vlrs: [], laszip: null};
  for (let i = 0, at = headerSize; i < vlrCount; i++) {
    const user = text(buf, at + 2, at + 18), record = dv.getUint16(at + 18, true), length = dv.getUint16(at + 20, true);
    header.vlrs.push({user, record, length, description: text(buf, at + 22, at + 54)});
    if (user === 'laszip encoded' && record === 22204) {
      const p = at + 54, items = [];
      for (let j = 0, q = p + 34; j < dv.getUint16(p + 32, true); j++, q += 6)
        items.push({type: dv.getUint16(q, true), size: dv.getUint16(q + 2, true), version: dv.getUint16(q + 4, true)});
      header.laszip = {compressor: dv.getUint16(p, true), coder: dv.getUint16(p + 2, true), version: `${buf[p + 4]}.${buf[p + 5]}r${dv.getUint16(p + 6, true)}`,
        chunkSize: dv.getUint32(p + 12, true), items};
    }
    at += 54 + length;
  }
  return header;
}

// Chunk starts and point counts from LASzip's chunk table.
function chunks(buf, dv, header) {
  const table = Number(dv.getBigInt64(header.pointOffset, true));
  if (table <= header.pointOffset || dv.getUint32(table, true) !== 0) throw new Error('missing or unknown LAZ chunk table');
  const number = dv.getUint32(table + 4, true), variable = header.laszip.chunkSize === 0xFFFFFFFF;
  const ic = new IntDecoder(new Decoder(buf, table + 8), 32, 2), list = [];
  let start = header.pointOffset + 8, size = 0, count = 0, left = header.count;
  for (let i = 0; i < number; i++) {
    if (variable) count = ic.decompress(count, 0);
    size = ic.decompress(size, 1);
    const points = variable ? count : Math.min(header.laszip.chunkSize, left);
    list.push({start, points}); start += size; left -= points;
  }
  return list;
}

// Decode every point. Coordinates are the raw scaled integers; `flags` is
// LAS byte 14 (return number, number of returns, scan direction, edge) and
// `cls` byte 15 (class in bits 0–4, synthetic/key-point/withheld above).
export function decodeLaz(buf) {
  const header = readHeader(buf), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), lz = header.laszip;
  if (!header.compressed || !lz) throw new Error('not LASzip-compressed');
  if (lz.compressor !== 2 || lz.coder !== 0) throw new Error(`unsupported LASzip compressor ${lz.compressor}`);
  const types = lz.items.map(i => `${i.type}v${i.version}`).join(',');
  if (!/^6v2,7v2(,0v2)?$/.test(types)) throw new Error(`unsupported LASzip items ${types}`);
  const extra = lz.items[2]?.size || 0, n = header.count;
  const x = new Int32Array(n), y = new Int32Array(n), z = new Int32Array(n), flags = new Uint8Array(n), cls = new Uint8Array(n);
  const source = new Uint16Array(n), gps = new Float64Array(n), extraBytes = new Uint8Array(n * extra);
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  let i = 0;
  for (const chunk of chunks(buf, dv, header)) {
    const dec = new Decoder(buf, chunk.start + 28 + extra);
    const p = new Point10(dec, dv, chunk.start), t = new GpsTime11(dec, dv, chunk.start + 20), b = extra ? new Bytes(dec, dv, chunk.start + 28, extra) : null;
    for (let j = 0; j < chunk.points; j++, i++) {
      if (j) { p.read(); t.read(); b?.read(); }
      x[i] = p.x; y[i] = p.y; z[i] = p.z; flags[i] = p.flags; cls[i] = p.cls; source[i] = p.source;
      u32[0] = t.lo[t.last]; u32[1] = t.hi[t.last]; gps[i] = f64[0];
      if (b) extraBytes.set(b.last, i * extra);
    }
  }
  if (i !== n) throw new Error(`decoded ${i} of ${n} points`);
  return {header, x, y, z, flags, cls, source, gps, extra, extraBytes};
}

// The decoded points must reproduce the header's own bounds and return counts,
// and lie inside `cube` ([x0, y0, z0, x1, y1, z1], an EPT node) when given.
// Entwine writes LAS 1.4's 4-bit return numbers into 3-bit fields (8 becomes 0,
// 9 becomes 1, ...) while its header counts the original numbers, so a count
// may exceed the header's (late noise returns) but never fall short of it.
export function checkAgainstHeader({header, x, y, z, flags}, cube = null) {
  const raw = [x, y, z], problems = [];
  for (let a = 0; a < 3; a++) {
    let lo = Infinity, hi = -Infinity;
    for (const v of raw[a]) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const s = header.scale[a], o = header.offset[a], tol = s * .51;
    if (Math.abs(lo * s + o - header.min[a]) > tol || Math.abs(hi * s + o - header.max[a]) > tol)
      problems.push(`axis ${'xyz'[a]}: decoded ${lo * s + o}..${hi * s + o}, header ${header.min[a]}..${header.max[a]}`);
    if (cube && (lo * s + o < cube[a] - tol || hi * s + o > cube[a + 3] + tol))
      problems.push(`axis ${'xyz'[a]}: decoded ${lo * s + o}..${hi * s + o} outside node ${cube[a]}..${cube[a + 3]}`);
  }
  const counts = new Array(header.byReturn.length).fill(0);
  for (const f of flags) { const r = f & 7; if (r >= 1 && r <= counts.length) counts[r - 1]++; }
  const excess = counts.reduce((s, c, i) => s + c - header.byReturn[i], 0);
  if (header.byReturn.some(v => v) && (counts.some((c, i) => c < header.byReturn[i]) || excess > .01 * header.count))
    problems.push(`returns: decoded ${counts.join('/')}, header ${header.byReturn.join('/')}`);
  return problems;
}
