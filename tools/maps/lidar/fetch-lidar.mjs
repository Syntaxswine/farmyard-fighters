// Snapshot the USGS 3DEP lidar that covers Mount Dora.
//
// Coverage: The National Map lists two lidar collections over the town box,
// FL_LAKECO_2007 and FL_Peninsular_2018_D18 (its Lake County block,
// FL_Peninsular_Lake_2018: Riegl VQ-1560 and Leica ALS80, about 27 points per
// square metre). This tool takes the 2018 collection from its public Entwine
// copy on AWS Open Data (s3://usgs-lidar-public/FL_Peninsular_Lake_2018): only
// the octree nodes that intersect the game extent plus a margin, at full
// density. The same points are on rockyweb.usgs.gov as four 1,524 m tiles
// (1.38 GB), but that server answers HTTP 429 to downloads.
//
// 3DEP lidar is public domain (USGS). Node files stay in the gitignored
// artifacts/lidar/ cache; their list, sizes and SHA-256 go to
// maps/mount-dora/reference/lidar/source.json. Every node is decoded and must
// reproduce its own header (count, bounds, return histogram).
//
//   node tools/maps/lidar/fetch-lidar.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createProjection} from '../house-reference/projection.mjs';
import {checkAgainstHeader, decodeLaz} from './laz.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const town = path.join(root, 'maps/mount-dora');
const out = path.join(town, 'reference/lidar');
export const DATASET = 'FL_Peninsular_Lake_2018';
export const EPT = `https://s3-us-west-2.amazonaws.com/usgs-lidar-public/${DATASET}`;
export const cacheDir = path.join(root, 'artifacts/lidar', DATASET);
const TNM = 'https://tnmaccess.nationalmap.gov/api/v1/products';
const AGENT = 'farmyard-commando-lidar/1 (+https://github.com/Syntaxswine/farmyard-commando)';
export const MARGIN_M = 60; // covers the 30 m shifted-footprint control and a ground ring
const hash = data => createHash('sha256').update(data).digest('hex');
const R = 6378137;
export const toMercator = (lat, lon) => [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
export const fromMercator = (x, y) => [(2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI, x / R * 180 / Math.PI];

export function extentBoxes(project, margin = MARGIN_M) {
  const {toLatLon} = createProjection(project.projection);
  const w = project.extent.widthM, d = project.extent.depthM;
  const corners = [[-margin, -margin], [w + margin, -margin], [-margin, d + margin], [w + margin, d + margin]].map(([x, y]) => toLatLon(x, y));
  const lats = corners.map(c => c[0]), lons = corners.map(c => c[1]), merc = corners.map(([la, lo]) => toMercator(la, lo));
  return {wgs84: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
    mercator: [Math.min(...merc.map(m => m[0])), Math.min(...merc.map(m => m[1])), Math.max(...merc.map(m => m[0])), Math.max(...merc.map(m => m[1]))]};
}

async function get(url, attempts = 4) {
  for (let i = 1; ; i++) {
    try {
      const response = await fetch(url, {headers: {'User-Agent': AGENT}});
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      if (response.status < 500 && response.status !== 429) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      if (i >= attempts) throw new Error(`${response.status} after ${attempts} attempts: ${url}`);
    } catch (error) {
      if (i >= attempts || /^\d{3} /.test(error.message)) throw error;
    }
    await new Promise(r => setTimeout(r, 1000 * 2 ** i));
  }
}

async function cached(relative, url) {
  const file = path.join(cacheDir, relative);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const bytes = await get(url);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, bytes);
  return bytes;
}

// Node keys D-X-Y-Z whose cube meets the box (EPT cubes share the root's span).
export function nodeBounds(ept, key) {
  const [d, x, y, z] = key.split('-').map(Number), [x0, y0, z0, x1] = ept.bounds, s = (x1 - x0) / 2 ** d;
  return [x0 + x * s, y0 + y * s, z0 + z * s, x0 + (x + 1) * s, y0 + (y + 1) * s, z0 + (z + 1) * s];
}
const meets = (b, box) => b[0] < box[2] && b[3] > box[0] && b[1] < box[3] && b[4] > box[1];

async function selectNodes(ept, box) {
  const files = [], nodes = [], queue = ['0-0-0-0'];
  while (queue.length) {
    const key = queue.shift(), bytes = await cached(`ept-hierarchy/${key}.json`, `${EPT}/ept-hierarchy/${key}.json`);
    files.push({key, bytes: bytes.length, sha256: hash(bytes)});
    for (const [k, v] of Object.entries(JSON.parse(bytes))) {
      if (!meets(nodeBounds(ept, k), box)) continue;
      if (v === -1) { if (k !== key) queue.push(k); } else if (v > 0) nodes.push({key: k, points: v});
    }
  }
  const order = k => k.split('-').map(Number);
  nodes.sort((a, b) => { const p = order(a.key), q = order(b.key); return p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]; });
  return {files: files.sort((a, b) => a.key.localeCompare(b.key)), nodes};
}

async function pool(items, size, work) {
  let next = 0, done = 0;
  const worker = async () => { while (next < items.length) { const i = next++; await work(items[i], i); if (++done % 100 === 0) console.log(`  ${done}/${items.length}`); } };
  await Promise.all(Array.from({length: size}, worker));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'Usage: node tools/maps/lidar/fetch-lidar.mjs');
  const project = JSON.parse(fs.readFileSync(path.join(town, 'project.json'), 'utf8'));
  const box = extentBoxes(project);

  // Which 3DEP collections cover the box, as The National Map reports them.
  const query = `${TNM}?${new URLSearchParams({bbox: box.wgs84.join(','), datasets: 'Lidar Point Cloud (LPC)', max: '200', outputFormat: 'JSON'})}`;
  const tnmBytes = await get(query), tnm = JSON.parse(tnmBytes), collections = {};
  for (const item of tnm.items) {
    const name = item.title.replace(/^USGS Lidar Point Cloud /, '').split(' ')[0];
    const c = collections[name] ||= {collection: name, tiles: [], bytes: 0, publicationDate: item.publicationDate};
    c.tiles.push(item.title.split(' ').at(-1)); c.bytes += item.sizeInBytes;
  }
  const coverage = {query, retrievedAt: new Date().toISOString(), sha256: hash(tnmBytes), items: tnm.total,
    collections: Object.values(collections).map(c => ({...c, tiles: c.tiles.sort()})).sort((a, b) => a.collection.localeCompare(b.collection))};
  console.log('coverage:', coverage.collections.map(c => `${c.collection} (${c.tiles.length} tiles)`).join(', '));

  const eptBytes = await cached('ept.json', `${EPT}/ept.json`), ept = JSON.parse(eptBytes);
  const buildBytes = await cached('ept-build.json', `${EPT}/ept-build.json`);
  assert.equal(ept.dataType, 'laszip'); assert.equal(ept.srs.horizontal, '3857');
  const {files, nodes} = await selectNodes(ept, box.mercator);
  console.log(`${nodes.length} nodes, ${nodes.reduce((s, n) => s + n.points, 0)} points`);

  // The original 3DEP tiles under the box, with the header facts Entwine kept.
  const tileNames = coverage.collections.find(c => c.collection === 'FL_Peninsular_2018_D18').tiles;
  const tiles = [];
  for (const id of tileNames) {
    const name = `USGS_LPC_FL_Peninsular_2018_D18_${id}`, bytes = await cached(`ept-sources/${name}.json`, `${EPT}/ept-sources/${name}.json`);
    const s = JSON.parse(bytes), las = s.metadata['readers.las'];
    tiles.push({name, path: s.path, sha256: hash(bytes), points: s.points, las: `${las.major_version}.${las.minor_version}`, pointFormat: las.dataformat_id,
      created: `${las.creation_year}-${String(las.creation_doy).padStart(3, '0')} (year-day)`, systemId: las.system_id, software: las.software_id,
      crs: las.srs.prettycompoundwkt.split('\n')[0].replace(/^COMPD_CS\["|",$/g, ''), proj4: las.srs.proj4});
  }

  let points = 0, bytes = 0, z0 = Infinity, z1 = -Infinity;
  await pool(nodes, 8, async node => {
    const data = await cached(`ept-data/${node.key}.laz`, `${EPT}/ept-data/${node.key}.laz`), d = decodeLaz(data);
    const problems = checkAgainstHeader(d, nodeBounds(ept, node.key));
    assert.equal(d.header.count, node.points, `${node.key}: header count ${d.header.count}, hierarchy ${node.points}`);
    assert.deepEqual(problems, [], `${node.key}: ${problems.join('; ')}`);
    Object.assign(node, {bytes: data.length, sha256: hash(data)});
    points += node.points; bytes += data.length; z0 = Math.min(z0, d.header.min[2]); z1 = Math.max(z1, d.header.max[2]);
  });
  const source = {
    kind: 'mount-dora-lidar-source', version: 1, dataset: DATASET, ept: EPT,
    extent: {marginM: MARGIN_M, wgs84: box.wgs84.map(v => Math.round(v * 1e7) / 1e7), mercator: box.mercator.map(v => Math.round(v * 100) / 100)},
    coverage, tiles,
    entwine: {eptSha256: hash(eptBytes), buildSha256: hash(buildBytes), srs: `EPSG:${ept.srs.horizontal}`, points: ept.points, hierarchy: files},
    units: 'Entwine reprojected X/Y to EPSG:3857 (WGS 84 / Pseudo-Mercator) and Z from NAVD88 US survey feet to NAVD88 metres; no geoid shift.',
    nodes: {count: nodes.length, points, bytes, zRangeM: [z0, z1], list: nodes.map(n => [n.key, n.points, n.bytes, n.sha256])},
    publisher: 'U.S. Geological Survey 3D Elevation Program; Entwine copy on the AWS Registry of Open Data (usgs-lidar-public)',
    terms: ['USGS-authored or produced data and information are in the public domain (U.S. Geological Survey copyright policy).'],
  };
  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify(source, null, 1) + '\n');
  console.log(`${nodes.length} nodes, ${points} points, ${(bytes / 1e6).toFixed(1)} MB; wrote ${path.relative(root, path.join(out, 'source.json'))}`);
}
