// Original periodic material paint. Both maps are generated once per kit.
const fract = value => value - Math.floor(value);
function noise(x, y) {
  let seed = Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca6b);
  seed = Math.imul(seed ^ (seed >>> 16), 0xc2b2ae35);
  return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296;
}

const GRAVEL = [
  [119, 115, 105], [103, 106, 102], [144, 134, 117],
  [104, 99, 92], [135, 131, 123], [96, 93, 89]
];

function stonePaint(u, v) {
  const cells = 14;
  const x = u * cells, y = v * cells;
  let nearest = Infinity, second = Infinity, chip = 0, facet = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = Math.floor(x) + i, cy = Math.floor(y) + j;
    const a = (cx + cells) % cells, b = (cy + cells) % cells;
    const dx = x - cx - .18 - .64 * noise(a, b);
    const dy = y - cy - .18 - .64 * noise(a + cells, b);
    const distance = dx * dx + dy * dy;
    if (distance < nearest) {
      second = nearest;
      nearest = distance;
      chip = noise(a, b + cells);
      facet = dx + .8 * dy;
    } else if (distance < second) second = distance;
  }
  const edge = Math.min(1, (second - nearest) * 6);
  const shade = (.48 + .52 * edge) * (1.07 + .32 * facet) *
    (.92 + .16 * noise(Math.floor(u * 128), Math.floor(v * 128)));
  return GRAVEL[Math.floor(chip * GRAVEL.length)].map(channel => channel * shade);
}

function timberPaint(u, v) {
  const row = Math.floor(v * 64);
  const warp = .045 * Math.sin(u * Math.PI * 2 + row * .19);
  const ring = .80 + .19 * noise(71, Math.floor(fract(v + warp) * 64));
  const wear = .85 + .17 * noise(Math.floor(u * 64), row);
  const seam = Math.sin(v * Math.PI) < .16 ? .75 : 1;
  return [130, 94, 66].map(channel => channel * ring * wear * seam);
}

export function railwayPaint(T, size, colourAt) {
  const bytes = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * 4;
    bytes.set(colourAt((x + .5) / size, (y + .5) / size), offset);
    bytes[offset + 3] = 255;
  }
  const map = new T.DataTexture(new Uint8Array(bytes.buffer), size, size, T.RGBAFormat);
  map.colorSpace = T.SRGBColorSpace;
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.generateMipmaps = true;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.magFilter = T.LinearFilter;
  map.needsUpdate = true;
  return map;
}

export const ballastPaint = T => railwayPaint(T, 128, stonePaint);
export const tiePaint = T => railwayPaint(T, 64, timberPaint);
