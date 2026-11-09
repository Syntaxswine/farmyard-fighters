// Snapshot the Lake County public records that describe Mount Dora's buildings.
//
// Inputs, all free and published by the county:
//  - Property Appraiser monthly tax-roll files (FTP): Bldg (storeys, exterior
//    wall, roof cover, year built), Area (sub-areas: upper storey, porches,
//    garage) and Xfob (pools, sheds, detached garages).
//  - County GIS layers for the town's bounding box: Building Footprints (the
//    appraiser's residential sketches, keyed AltKey + building number) and
//    Tax Parcels (situs address, land use, building count).
//
// Only building facts are kept. Owner names and addresses, sale prices,
// appraised values, bedrooms and bathrooms are never written. Full county
// downloads stay in the gitignored artifacts/house-reference/ cache; the
// filtered files and their provenance go to maps/mount-dora/reference/county/.
//
//   node tools/maps/house-reference/fetch-county.mjs [--release MMDDYY]
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createProjection} from './projection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const town = path.join(root, 'maps/mount-dora');
const out = path.join(town, 'reference/county');
const cache = path.join(root, 'artifacts/house-reference');
const FTP = 'https://c.lakecountyfl.gov/ftp/PA_office/data/';
const GIS = 'https://gis.lakecountyfl.gov/lakegis/rest/services/InteractiveMap/MapServer/';
const AGENT = 'farmyard-commando-house-reference/1 (+https://github.com/Syntaxswine/farmyard-commando)';
const MARGIN_M = 40;
const hash = data => createHash('sha256').update(data).digest('hex');

// Kept columns per tax-roll file; everything else is dropped on read.
const TABLES = {
  Bldg: {key: 'ALT_KEY', keep: ['ALT_KEY', 'PARCEL_NUM', 'BLDG_NUM', 'CNS_STYLE', 'CNS_STYLE_DESC', 'CNS_MDL_DESC',
    'CNS_EXT_WALL_1', 'CNS_EXT_WALL_1_DESC', 'FOUNDATION_DESC', 'ROOF_COVER', 'ROOF_COVER_DESC',
    'ACTUAL_YEAR_BUILT', 'EFFECTIVE_YEAR_BUILT', 'EFFECTIVE_AREA', 'LIVING_AREA', 'STORIES'], file: 'buildings.csv'},
  Area: {key: 'REM_PID', keep: ['REM_PID', 'BLD_BLDG_NUM', 'SUB_CODE', 'SUB_DESC', 'Eff Area', 'Gross Area', 'Heated Area'], file: 'subareas.csv'},
  Xfob: {key: 'REM_PID', keep: ['REM_PID', 'OXF_LINE_NUM', 'OXF_CODE', 'OXF_DESC', 'OXF_MEASURE_1', 'OXF_MEASURE_2', 'OXF_QUANTITY', 'OXF_YR'], file: 'extra-features.csv'},
};
const LAYERS = {
  footprints: {id: 66, fields: ['OBJECTID', 'AltKey', 'BuildingNumber'], file: 'footprints.geojson'},
  parcels: {id: 20, fields: ['OBJECTID', 'AltKey', 'ParcelNumber', 'PropertyAddress', 'PropertyName', 'YearBuilt',
    'LandUseCode', 'LandUseDescription', 'NumberOfBuildings', 'TotalLivingArea', 'Vacant', 'ComResStatus'], file: 'parcels.geojson'},
};

const args = process.argv.slice(2);
assert(args.length === 0 || args.length === 2 && args[0] === '--release' && /^\d{6}$/.test(args[1]),
  'Usage: node tools/maps/house-reference/fetch-county.mjs [--release MMDDYY]');

async function get(url, as = 'text') {
  const response = await fetch(url, {headers: {'User-Agent': AGENT}});
  assert(response.ok, `${response.status} ${response.statusText}: ${url}`);
  return as === 'json' ? response.json() : response.text();
}

// The FTP folder holds one release per month, e.g. Bldg_100626.txt (2026-10-06).
async function release() {
  if (args[1]) return args[1];
  const listing = await get(FTP), codes = new Set();
  for (const [, code] of listing.matchAll(/Bldg_(\d{6})\.txt/g)) codes.add(code);
  const sortable = code => code.slice(4) + code.slice(0, 4);
  const latest = [...codes].sort((a, b) => sortable(a).localeCompare(sortable(b))).at(-1);
  assert(latest, 'No Bldg_MMDDYY.txt release in the FTP listing.');
  for (const table of Object.keys(TABLES)) assert(new RegExp(`${table}_${latest}\\.txt`, 'i').test(listing), `${table}_${latest}.txt is missing.`);
  return latest;
}

function envelope() {
  const project = JSON.parse(fs.readFileSync(path.join(town, 'project.json'), 'utf8'));
  const {toLatLon} = createProjection(project.projection);
  const w = project.extent.widthM, d = project.extent.depthM;
  const corners = [[-MARGIN_M, -MARGIN_M], [w + MARGIN_M, -MARGIN_M], [-MARGIN_M, d + MARGIN_M], [w + MARGIN_M, d + MARGIN_M]].map(([x, y]) => toLatLon(x, y));
  const lats = corners.map(c => c[0]), lons = corners.map(c => c[1]);
  const r7 = v => Math.round(v * 1e7) / 1e7;
  return {xmin: r7(Math.min(...lons)), ymin: r7(Math.min(...lats)), xmax: r7(Math.max(...lons)), ymax: r7(Math.max(...lats)), spatialReference: {wkid: 4326}};
}

async function layer(name, box) {
  const {id, fields} = LAYERS[name], base = `${GIS}${id}/query`, pageSize = 1000;
  const common = {where: '1=1', geometry: JSON.stringify(box), geometryType: 'esriGeometryEnvelope', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects'};
  const {count} = await get(`${base}?${new URLSearchParams({...common, returnCountOnly: 'true', f: 'json'})}`, 'json');
  const features = [], pages = [];
  for (let offset = 0; offset < count; offset += pageSize) {
    const url = `${base}?${new URLSearchParams({...common, outFields: fields.join(','), returnGeometry: 'true', outSR: '4326',
      orderByFields: 'OBJECTID', resultOffset: String(offset), resultRecordCount: String(pageSize), f: 'geojson'})}`;
    const text = await get(url), page = JSON.parse(text);
    assert(Array.isArray(page.features) && page.features.length, `Empty page at offset ${offset} of layer ${id}.`);
    pages.push({url, bytes: Buffer.byteLength(text), sha256: hash(text), features: page.features.length});
    features.push(...page.features);
  }
  const ids = new Set(features.map(f => f.properties.OBJECTID));
  assert.equal(ids.size, count, `Layer ${id}: ${ids.size} distinct features, server count ${count}.`);
  // Stable order and only the requested fields, so a re-fetch diffs cleanly.
  features.sort((a, b) => a.properties.OBJECTID - b.properties.OBJECTID);
  const clean = features.map(f => ({type: 'Feature', properties: Object.fromEntries(fields.map(k => [k, f.properties[k] ?? null])), geometry: f.geometry}));
  return {count, pages, collection: {type: 'FeatureCollection', features: clean}};
}

// Minimal RFC 4180 line splitter; the county files are one record per line.
function split(line) {
  const cells = [];
  let cell = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { cells.push(cell); cell = ''; }
    else cell += c;
  }
  cells.push(cell);
  return cells;
}
const quote = v => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

async function download(name, url) {
  fs.mkdirSync(cache, {recursive: true});
  const file = path.join(cache, name);
  const response = await fetch(url, {headers: {'User-Agent': AGENT}});
  assert(response.ok, `${response.status} ${response.statusText}: ${url}`);
  const digest = createHash('sha256'), sink = fs.createWriteStream(file);
  let bytes = 0;
  for await (const chunk of response.body) { digest.update(chunk); bytes += chunk.length; if (!sink.write(chunk)) await new Promise(r => sink.once('drain', r)); }
  await new Promise((resolve, reject) => sink.end(error => error ? reject(error) : resolve()));
  return {file, bytes, sha256: digest.digest('hex')};
}

async function filterTable(table, code, keys) {
  const spec = TABLES[table], name = `${table}_${code}.txt`, url = FTP + name;
  const raw = await download(name, url);
  const lines = readline.createInterface({input: fs.createReadStream(raw.file, 'latin1'), crlfDelay: Infinity});
  let header, index, keyAt, total = 0;
  const rows = [];
  for await (const line of lines) {
    if (!header) {
      header = split(line).map(h => h.trim());
      const at = name => header.findIndex(h => h.toUpperCase() === name.toUpperCase());
      index = spec.keep.map(at);
      assert(index.every(i => i >= 0), `${name} lacks ${spec.keep.filter((_, i) => index[i] < 0).join(', ')}; header: ${header.join(',')}`);
      keyAt = at(spec.key);
      continue;
    }
    if (!line.trim()) continue;
    total++;
    const cells = split(line);
    if (keys.has(cells[keyAt].trim())) rows.push(index.map(i => (cells[i] ?? '').trim()));
  }
  rows.sort((a, b) => a.join('\u0000').localeCompare(b.join('\u0000')));
  const text = [spec.keep, ...rows].map(r => r.map(quote).join(',')).join('\n') + '\n';
  fs.writeFileSync(path.join(out, spec.file), text);
  return {table, url, retrievedAt: new Date().toISOString(), bytes: raw.bytes, sha256: raw.sha256, rowsInFile: total,
    kept: {file: spec.file, rows: rows.length, columns: spec.keep, bytes: Buffer.byteLength(text), sha256: hash(text)}};
}

const code = await release(), box = envelope();
fs.mkdirSync(out, {recursive: true});
const layers = {};
for (const name of Object.keys(LAYERS)) {
  const retrievedAt = new Date().toISOString(), {count, pages, collection} = await layer(name, box);
  const text = JSON.stringify(collection) + '\n';
  fs.writeFileSync(path.join(out, LAYERS[name].file), text);
  layers[name] = {layer: `${GIS}${LAYERS[name].id}`, retrievedAt, count, pages, fields: LAYERS[name].fields,
    kept: {file: LAYERS[name].file, bytes: Buffer.byteLength(text), sha256: hash(text)}};
  console.log(`${name}: ${count} features`);
}
// Every record keyed to a parcel or a sketched building in the box.
const keys = new Set();
for (const name of Object.keys(LAYERS)) for (const f of JSON.parse(fs.readFileSync(path.join(out, LAYERS[name].file), 'utf8')).features) if (f.properties.AltKey) keys.add(String(f.properties.AltKey).trim());
const tables = [];
for (const table of Object.keys(TABLES)) {
  tables.push(await filterTable(table, code, keys));
  console.log(`${table}: kept ${tables.at(-1).kept.rows} of ${tables.at(-1).rowsInFile} rows`);
}
const source = {
  kind: 'mount-dora-county-records-source', version: 1, release: code, envelopeWGS84: box, envelopeMarginM: MARGIN_M,
  altKeys: keys.size, layers, tables,
  publisher: 'Lake County Property Appraiser (tax roll, building sketches) and Lake County GIS (parcels)',
  terms: [
    'Florida public records (Chapter 119, Florida Statutes). The appraiser publishes the tax-roll files free on its FTP site and the GIS layers through the county map service.',
    'Building Footprints layer, as published: as-is, no accuracy guarantee, only the portion of the county completed so far, residential building sketches only.',
  ],
  excluded: 'Owner names and mailing addresses, sale prices and dates, appraised and taxable values, exemptions, bedrooms and bathrooms are never requested or written.',
};
fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify(source, null, 2) + '\n');
console.log(`Release ${code}; ${keys.size} AltKeys; wrote ${path.relative(root, out)}`);
