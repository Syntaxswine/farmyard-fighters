// Join Lake County building records to the game's 950 Mount Dora buildings and
// plan one Street View viewpoint per building (viewpoint.mjs).
//
// Reads maps/mount-dora/features.json and the county snapshot written by
// fetch-county.mjs; writes maps/mount-dora/reference/house-reference.json.
// Nothing here edits the generator, the sectors or the art kit: the file is a
// reference that build-mount-dora.py's building_style() can consume later.
//
//   node tools/maps/house-reference/build-house-reference.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createProjection} from './projection.mjs';
import {area, bounds, centroid, contains, gridIndex, overlapArea} from './geometry.mjs';
import {featuresPin, isOsm} from './features-digest.mjs';
import {ADDRESS_NEAR_M, ADDRESS_SLACK_M, VIEW_RADIUS_M, aerialUrl, planStreetView, viewRoads} from './viewpoint.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const town = path.join(root, 'maps/mount-dora');
const county = path.join(town, 'reference/county');
const target = path.join(town, 'reference/house-reference.json');
const hash = data => createHash('sha256').update(data).digest('hex');
const r2 = v => Math.round(v * 100) / 100, r1 = v => Math.round(v * 10) / 10;
const SQFT = .09290304;

// Match thresholds. A county sketch belongs to the game building holding most
// of it; IoU grades how well the two outlines agree.
export const MATCH = {assignCover: .5, assignIoU: .3, goodIoU: .5};

// County code descriptions -> game vocabulary. Unknown codes fall through to null.
export const WALLS = {
  'WOOD/METAL FRAME W/OUTER FINISH': {construction: 'frame', material: 'wood'},
  'CONCRETE BLOCK PLAIN': {construction: 'masonry', material: 'concrete'},
  'BRICK/BLOCK STUCCO OR SIDING': {construction: 'masonry', material: 'concrete', finishUnknown: 'brick, stucco or siding over block'},
  'STONE/SOLID CONCRETE WALLS': {construction: 'masonry', material: 'concrete'},
};
export const ROOFS = {
  'ASPHALT SHINGLE': {cover: 'asphalt-shingle', pitch: 'pitched'},
  'METAL': {cover: 'metal', pitch: 'pitched'},
  'CONCRETE/CLAY TILE': {cover: 'tile', pitch: 'pitched'},
  'TAR & GRAVEL': {cover: 'tar-and-gravel', pitch: 'flat'},
  'ASPHALT ROLLED': {cover: 'rolled-asphalt', pitch: 'low-slope'},
};
// Sub-area codes (Area file). Ground-floor codes estimate a building's footprint.
export const SUBAREAS = {
  ground: ['FLA', 'GAR', 'GBF', 'GCF', 'EPF', 'EPA', 'STF', 'SAF'],
  open: ['OPF', 'OPU'], screen: ['SPF', 'SPU'], enclosed: ['EPF', 'EPA'],
  garage: ['GAR', 'GBF', 'GCF'], carport: ['CPF', 'CPU'], upper: ['FUS', 'FHS', 'FTQ'],
  basement: ['BSF', 'BSM', 'FBS'], canopy: ['COP'],
};

export function storeys(raw, codes) {
  const value = Number.parseFloat(raw);
  if (Number.isFinite(value) && value >= 1) {
    const whole = Math.min(5, Math.floor(value)), half = value - Math.floor(value) >= .25 && whole < 5;
    return {stories: whole, halfStory: half, source: `county:STORIES ${raw}`};
  }
  if (codes.some(c => SUBAREAS.upper.includes(c))) return {stories: 2, halfStory: false, source: 'county:upper-storey sub-area'};
  return {stories: null, halfStory: false, source: 'county:no-storey-record'};
}

function readCsv(file) {
  const [header, ...rows] = fs.readFileSync(path.join(county, file), 'utf8').trimEnd().split('\n').map(line => {
    const cells = []; let cell = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) { if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
      else if (c === '"') quoted = true; else if (c === ',') { cells.push(cell); cell = ''; } else cell += c;
    }
    cells.push(cell); return cells;
  });
  return rows.map(r => Object.fromEntries(header.map((k, i) => [k, r[i] === 'NULL' ? '' : r[i]])));
}

export function build() {
  const featuresBytes = fs.readFileSync(path.join(town, 'features.json'));
  const sourceBytes = fs.readFileSync(path.join(county, 'source.json'));
  const project = JSON.parse(fs.readFileSync(path.join(town, 'project.json'), 'utf8'));
  const source = JSON.parse(sourceBytes), features = JSON.parse(featuresBytes).features;
  for (const kept of [...Object.values(source.layers), ...source.tables].map(x => x.kept))
    assert.equal(hash(fs.readFileSync(path.join(county, kept.file))), kept.sha256, `County snapshot changed: ${kept.file}`);
  const {toTown, toLatLon} = createProjection(project.projection);
  const project4326 = geometry => (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates)
    .map(polygon => polygon.map(ring => ring.map(([lon, lat]) => toTown(lat, lon))));

  const sketches = JSON.parse(fs.readFileSync(path.join(county, 'footprints.geojson'), 'utf8')).features.map(f => {
    const geometry = project4326(f.geometry);
    return {altKey: f.properties.AltKey.trim(), bldgNum: f.properties.BuildingNumber.trim(), geometry, box: bounds(geometry), area: area(geometry)};
  });
  const parcels = JSON.parse(fs.readFileSync(path.join(county, 'parcels.geojson'), 'utf8')).features.map(f => {
    const geometry = project4326(f.geometry), p = f.properties;
    return {altKey: p.AltKey.trim(), address: (p.PropertyAddress || '').trim(), name: (p.PropertyName || '').trim(),
      landUse: (p.LandUseDescription || '').trim(), buildings: Number.parseInt(p.NumberOfBuildings, 10) || 0,
      yearBuilt: Number.parseInt(p.YearBuilt, 10) || null, geometry, box: bounds(geometry), area: area(geometry)};
  });
  const records = new Map(), subareas = new Map(), extras = new Map();
  const key = (altKey, bldg) => `${altKey}#${Number.parseInt(bldg, 10)}`;
  for (const row of readCsv('buildings.csv')) records.set(key(row.ALT_KEY, row.BLDG_NUM), row);
  for (const row of readCsv('subareas.csv')) {
    const k = key(row.REM_PID, row.BLD_BLDG_NUM);
    if (!subareas.has(k)) subareas.set(k, {});
    const list = subareas.get(k), gross = Number.parseFloat(row['Gross Area']) || 0;
    if (row.SUB_CODE) list[row.SUB_CODE] = (list[row.SUB_CODE] || 0) + gross;
  }
  for (const row of readCsv('extra-features.csv')) {
    if (!extras.has(row.REM_PID)) extras.set(row.REM_PID, new Set());
    if (row.OXF_DESC) extras.get(row.REM_PID).add(row.OXF_DESC.trim());
  }

  const houses = features.filter(f => f.category === 'building' && isOsm(f)).map(f => {
    const geometry = f.geographicGeometry.coordinates;
    return {feature: f, geometry, box: bounds(geometry), area: area(geometry), centre: centroid(geometry)};
  }).sort((a, b) => a.feature.id.localeCompare(b.feature.id));
  const sketchIndex = gridIndex(sketches.map(s => s.box)), parcelIndex = gridIndex(parcels.map(p => p.box));

  // Pairwise overlaps, then each sketch goes to the game building holding most of it.
  const pairs = new Map();
  for (const [h, house] of houses.entries()) for (const s of sketchIndex(house.box)) {
    const o = overlapArea(house.geometry, sketches[s].geometry, .1, house.box, sketches[s].box);
    if (o > 0) pairs.set(`${h}:${s}`, o);
  }
  const owner = new Map();
  for (const [pair, o] of pairs) {
    const [h, s] = pair.split(':').map(Number), sk = sketches[s];
    const iou = o / (houses[h].area + sk.area - o), cover = o / sk.area;
    if (cover < MATCH.assignCover && iou < MATCH.assignIoU) continue;
    const held = owner.get(s);
    if (!held || o > held.overlap || o === held.overlap && h < held.house) owner.set(s, {house: h, overlap: o, iou, cover});
  }
  const assigned = houses.map(() => []);
  for (const [s, m] of owner) assigned[m.house].push({sketch: s, ...m});
  for (const list of assigned) list.sort((a, b) => b.overlap - a.overlap || a.sketch - b.sketch);

  const view = viewRoads(features);

  const describe = (altKey, bldgNum) => {
    const row = records.get(key(altKey, bldgNum));
    if (!row) return null;
    const sub = subareas.get(key(altKey, bldgNum)) || {};
    const codes = Object.keys(sub).sort();
    return {altKey, bldgNum: String(Number.parseInt(bldgNum, 10)), style: row.CNS_STYLE_DESC || null, model: row.CNS_MDL_DESC || null,
      wall: row.CNS_EXT_WALL_1_DESC || null, roofCover: row.ROOF_COVER_DESC || null, foundation: row.FOUNDATION_DESC || null,
      yearBuilt: Number.parseInt(row.ACTUAL_YEAR_BUILT, 10) || null, effectiveYearBuilt: Number.parseInt(row.EFFECTIVE_YEAR_BUILT, 10) || null,
      stories: row.STORIES || null, livingSqft: Number.parseInt(row.LIVING_AREA, 10) || null,
      subAreasSqft: Object.fromEntries(codes.map(c => [c, sub[c]]))};
  };
  const groundM2 = rec => r1(SUBAREAS.ground.reduce((s, c) => s + (rec.subAreasSqft[c] || 0), 0) * SQFT);
  const parcelRecords = altKey => [...records.values()].filter(r => r.ALT_KEY === altKey).map(r => describe(altKey, r.BLDG_NUM));
  // The parcels under a point, smallest first; stacked condo units share one
  // outline, so the smallest non-condo hit is the lot itself.
  const lotsAt = (box, centre) => {
    const hits = parcelIndex(box).map(i => parcels[i]).filter(p => contains(p.geometry, centre));
    hits.sort((a, b) => a.area - b.area || a.altKey.localeCompare(b.altKey));
    return {hits, lot: hits.find(p => !/CONDO/.test(p.landUse)) || hits[0] || null};
  };
  // Storeys, wall, roof, porches and garage from a building's records.
  const suggest = (recs, lot, method) => {
    const primary = recs[0] || null;
    const codes = primary ? Object.keys(primary.subAreasSqft) : [];
    const sum = list => r1(list.reduce((s, c) => s + (primary?.subAreasSqft[c] || 0), 0) * SQFT);
    const condoMax = method === 'condo-units' ? Math.max(...recs.map(r => Number.parseFloat(r.stories) || 0)) : null;
    const st = primary ? storeys(condoMax ? String(condoMax) : primary.stories, codes) : {stories: null, halfStory: false, source: 'no-county-record'};
    if (method === 'condo-units') st.source += ' (largest of the unit records; units may not span the building)';
    const wall = primary && WALLS[primary.wall], roof = primary && ROOFS[primary.roofCover];
    const lotExtras = lot ? [...(extras.get(lot.altKey) || [])].sort() : [];
    const suggested = {
      stories: st.stories, halfStory: st.halfStory, storiesSource: st.source,
      material: wall?.material ?? null, wallConstruction: wall?.construction ?? null,
      ...(wall?.finishUnknown ? {finishUnknown: wall.finishUnknown} : {}),
      materialSource: primary?.wall ? `county:CNS_EXT_WALL_1 ${primary.wall}` : 'no-county-wall-record',
      roofCover: roof?.cover ?? null, roofPitch: roof?.pitch ?? null,
      roofSource: primary?.roofCover ? `county:ROOF_COVER ${primary.roofCover}` : 'no-county-roof-record',
      porchM2: {open: sum(SUBAREAS.open), screen: sum(SUBAREAS.screen), enclosed: sum(SUBAREAS.enclosed)},
      canopyM2: sum(SUBAREAS.canopy),
      garage: codes.some(c => SUBAREAS.garage.includes(c)) ? 'attached' : codes.some(c => SUBAREAS.carport.includes(c)) ? 'carport'
        : lotExtras.includes('DETACHED GARAGE') ? 'detached-on-lot' : null,
      basement: codes.some(c => SUBAREAS.basement.includes(c)),
      yearBuilt: primary?.yearBuilt ?? lot?.yearBuilt ?? null,
    };
    return {st, lotExtras, suggested};
  };
  const addressOf = lot => lot && lot.address !== 'UNASSIGNED' ? lot.address : null;

  const out = [];
  for (const [h, house] of houses.entries()) {
    const f = house.feature, matches = assigned[h];
    const {hits, lot} = lotsAt(house.box, house.centre);
    let method = 'none', recs = [], match = null;
    if (matches.length) {
      recs = matches.map(m => describe(sketches[m.sketch].altKey, sketches[m.sketch].bldgNum)).filter(Boolean);
      const best = matches[0];
      method = best.iou >= MATCH.goodIoU ? 'footprint' : 'footprint-partial';
      match = {iou: r2(best.iou), coverGame: r2(matches.reduce((s, m) => s + m.overlap, 0) / house.area), coverCounty: r2(best.cover),
        countyBuildings: matches.map(m => ({altKey: sketches[m.sketch].altKey, bldgNum: String(Number.parseInt(sketches[m.sketch].bldgNum, 10)), overlapM2: r1(m.overlap), iou: r2(m.iou)}))};
    }
    if (!recs.length && hits.length) {
      const condos = hits.filter(p => /CONDO/.test(p.landUse));
      if (condos.length >= 2) {
        method = 'condo-units';
        recs = condos.flatMap(p => parcelRecords(p.altKey)).filter(Boolean);
        match = {units: condos.length};
      } else if (lot) {
        const candidates = parcelRecords(lot.altKey).filter(Boolean);
        if (candidates.length === 1) { method = 'parcel-single'; recs = candidates; match = {altKey: lot.altKey}; }
        else if (candidates.length > 1) {
          const scored = candidates.map(c => ({c, ratio: groundM2(c) / house.area})).sort((a, b) => Math.abs(Math.log(a.ratio || 1e-9)) - Math.abs(Math.log(b.ratio || 1e-9)));
          method = 'parcel-area'; recs = [scored[0].c]; match = {altKey: lot.altKey, groundAreaRatio: r2(scored[0].ratio), candidates: candidates.length};
        }
      }
    }
    const {st, lotExtras, suggested} = suggest(recs, lot, method);
    const address = addressOf(lot), streetView = planStreetView(view, house, {stories: st.stories, address}, toLatLon);
    const tags = f.tags, keepTags = Object.fromEntries(Object.entries(tags).filter(([k]) => /^(building|name|building:levels|roof:|addr:|amenity|shop|tourism)/.test(k)));
    out.push({id: f.id, sectors: f.nativeSectors || [], centroid: house.centre.map(r2), areaM2: r1(house.area), osmTags: keepTags,
      address, placeName: lot?.name || null,
      parcel: lot ? {altKey: lot.altKey, landUse: lot.landUse, buildings: lot.buildings} : null,
      match: {method, ...match}, county: {records: recs, lotExtras}, suggested, streetView, aerialUrl: aerialUrl(house.centre, toLatLon)});
  }

  // County sketches inside the town that no game building claims. `coveredByGame`
  // is the largest share of the sketch under any one game building.
  const extent = [0, 0, project.extent.widthM, project.extent.depthM], covered = new Map();
  for (const [pair, o] of pairs) { const s = Number(pair.split(':')[1]); covered.set(s, Math.max(covered.get(s) || 0, o / sketches[s].area)); }
  const countyOnly = sketches.map((s, i) => ({s, i})).filter(({i}) => !owner.has(i))
    .filter(({s}) => { const c = centroid(s.geometry); return c[0] >= extent[0] && c[1] >= extent[1] && c[0] <= extent[2] && c[1] <= extent[3]; })
    .map(({s, i}) => {
      const rec = describe(s.altKey, s.bldgNum), c = centroid(s.geometry), {lot} = lotsAt(s.box, c);
      const {lotExtras, suggested} = suggest(rec ? [rec] : [], lot, 'county-only');
      return {altKey: s.altKey, bldgNum: String(Number.parseInt(s.bldgNum, 10)), centroid: c.map(r2), areaM2: r1(s.area), coveredByGame: r2(covered.get(i) || 0),
        geometry: s.geometry.map(poly => poly.map(ring => ring.map(p => p.map(r2)))),
        record: rec && {style: rec.style, stories: rec.stories, wall: rec.wall, roofCover: rec.roofCover, yearBuilt: rec.yearBuilt},
        // The facts a game building gets, for where this sketch becomes one
        // (reference/county-buildings.json, written by tools/maps/lidar/build-lidar.mjs).
        address: addressOf(lot), placeName: lot?.name || null,
        parcel: lot ? {altKey: lot.altKey, landUse: lot.landUse, buildings: lot.buildings} : null,
        county: {records: rec ? [rec] : [], lotExtras}, suggested};
    }).sort((a, b) => a.altKey.localeCompare(b.altKey) || a.bldgNum.localeCompare(b.bldgNum));

  const count = fn => out.filter(fn).length;
  const metrics = {
    gameBuildings: out.length, countySketches: sketches.length, countyRecords: records.size,
    byMethod: Object.fromEntries(['footprint', 'footprint-partial', 'parcel-single', 'parcel-area', 'condo-units', 'none'].map(m => [m, count(b => b.match.method === m)])),
    withStories: count(b => b.suggested.stories !== null), multiStorey: count(b => b.suggested.stories >= 2), halfStorey: count(b => b.suggested.halfStory),
    withMaterial: count(b => b.suggested.material !== null), wood: count(b => b.suggested.material === 'wood'),
    flatRoof: count(b => b.suggested.roofPitch === 'flat'), metalRoof: count(b => b.suggested.roofCover === 'metal'),
    withPorch: count(b => b.suggested.porchM2.open + b.suggested.porchM2.screen + b.suggested.porchM2.enclosed > 0),
    withStreetView: count(b => b.streetView), onAddressedStreet: count(b => b.streetView?.onAddressedStreet),
    countyOnlySketches: countyOnly.length, countyOnlyHouseSized: countyOnly.filter(c => c.areaM2 >= 40).length,
  };
  const reference = {
    kind: 'mount-dora-house-reference', version: 1,
    inputs: {features: featuresPin(featuresBytes),
      county: {file: 'maps/mount-dora/reference/county/source.json', sha256: hash(sourceBytes), release: source.release}},
    policy: 'County facts and planned viewpoints only. Street View is opened in Google Maps by URL for a person to look at; no imagery is requested, stored or traced by this tool.',
    thresholds: {...MATCH, viewRadiusM: VIEW_RADIUS_M, addressNearM: ADDRESS_NEAR_M, addressSlackM: ADDRESS_SLACK_M}, vocabulary: {walls: WALLS, roofs: ROOFS, subAreas: SUBAREAS},
    metrics, buildings: out, countyOnly,
  };
  return JSON.stringify(reference, null, 1) + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert(args.length === 0 || args.length === 1 && args[0] === '--check', 'Usage: node tools/maps/house-reference/build-house-reference.mjs [--check]');
  const text = build();
  if (args[0] === '--check') {
    assert(fs.existsSync(target), 'house-reference.json is missing; run without --check.');
    assert.equal(hash(fs.readFileSync(target)), hash(text), 'house-reference.json is stale; rerun without --check.');
    console.log('house-reference.json is current.');
  } else {
    fs.writeFileSync(target, text);
    console.log(JSON.stringify(JSON.parse(text).metrics, null, 1));
  }
}
