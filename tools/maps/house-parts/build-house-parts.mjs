// Writes maps/mount-dora/parts/: one house-part file per building plus
// index.json. With --check, confirms the committed files are exactly what the
// current town generates. Either way it refuses unless every part validates,
// the parts stamp back into all 42 sectors byte for byte, and every art
// placement rebuilds from its part.
//
//   node tools/maps/house-parts/build-house-parts.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {root, PARTS_DIR, INDEX_KIND, VERSION, BLOCK, BLOCK_MAX_M, loadTown, buildParts, validatePart, roundTrip, artMismatches, placePoint, iou, localAxisDeg,
  formatPart, formatIndex, blockFits, sha256} from './house-parts.mjs';

// Files in the parts folder that this tool does not write.
export const KEEP = new Set(['README.md', 'workshop.json']);
export const REGENERATE = 'node tools/maps/house-parts/build-house-parts.mjs';

// The generator rules house-parts.mjs mirrors to stamp parts back into sectors.
const MIRRORS = 'deduplicatedWalls, splitWalls, polygonSpans and stampSectors in tools/maps/house-parts/house-parts.mjs, '
  + 'which mirror deduplicated_walls, split_walls, polygon_spans and the sector writer in tools/maps/build-mount-dora.py';

export const median = values => {
  const s = [...values].sort((a, b) => a - b), mid = s.length / 2;
  return !s.length ? null : s.length % 2 ? s[Math.floor(mid)] : Number(((s[mid - 1] + s[mid]) / 2).toFixed(4));
};
const offAxis = deg => { const m = ((deg % 90) + 90) % 90; return Math.min(m, 90 - m); };
const digest = value => sha256(JSON.stringify(value));

// The exact input values a part reads, so an unrelated change to an input file
// (a new survey camera, say) does not make the parts look stale.
export function inputDigests(town) {
  const buildings = town.features.features.filter(f => f.category === 'building');
  return {
    'maps/mount-dora/source/authoring-config.json': digest(town.extent),
    'maps/mount-dora/authored-buildings.json': digest(town.authored.records),
    'maps/mount-dora/features.json': digest({projection: town.features.projection, buildings: buildings.map(f => ({id: f.id, osm: f.osm, county: f.county, tags: f.tags,
      geometry: f.geometry, geographicGeometry: f.geographicGeometry, nativeProxy: f.nativeProxy, nativeSectors: f.nativeSectors, authoredLayoutSHA256: f.authoredLayoutSHA256}))}),
    'maps/mount-dora/reference/lidar-roofs.json': digest({collection: town.lidar.collection, buildings: town.lidar.buildings}),
    'maps/mount-dora/reference/county-buildings.json': digest(town.county.buildings.map(b => ({id: b.id, lidar: b.lidar}))),
    'maps/mount-dora/reference/house-reference.json': digest(town.reference.buildings.map(b => ({id: b.id, address: b.address, altKey: b.parcel?.altKey, match: b.match?.method}))),
    'sites/tactical-animal/dist/mission-art/mount-dora/manifest.js': digest(town.art.PLACEMENTS.filter(p => p.kind === 'building')),
  };
}

// The checks recorded in the index. The pose and ridge figures say how well a
// part placed at its true angle matches the measured house.
function checks(parts, town, trip) {
  const geographic = new Map(town.features.features.map(f => [f.id, f.geographicGeometry?.coordinates]));
  const turned = parts.filter(p => offAxis(p.placements.true.rotationDeg) > 5);
  const wrongSign = p => { const pose = {pivot: p.placements.pivot, at: p.placements.true.at, rotationDeg: -p.placements.true.rotationDeg};
    return Number(iou(p.outline.map(poly => poly.map(r => r.map(v => placePoint(v, pose)))), geographic.get(p.id)).toFixed(3)); };
  const ridged = parts.filter(p => ['gable', 'hip'].includes(p.roof.form) && p.roof.confidence >= .7 && p.roof.ridgeAxisDeg !== null);
  const within = (list, axisOf) => list.filter(p => offAxis(axisOf(p)) <= 5).length;
  const turnedRidges = ridged.filter(p => offAxis(p.placements.true.rotationDeg) > 5);
  const kitAxis = deg => { const m = ((deg % 180) + 180) % 180; return m < 45 || m >= 135 ? 'x' : 'y'; };
  const withKitAxis = ridged.filter(p => p.appearance.treatment.roofAxis);
  const reviewed = parts.filter(p => p.placements.true.method === 'reviewed-grid-override');
  return {
    sectors: {stamped: trip.sectors, byteIdentical: trip.identical},
    artPlacements: {rebuilt: parts.length, identical: parts.length - artMismatches(parts, town).length},
    poses: {
      note: 'fitIoU: intersection over union of the placed outline with the measured footprint (features.json geographicGeometry); medians of an even count average the middle two',
      medianGridFitIoU: median(parts.map(p => p.placements.grid.fitIoU)), medianTrueFitIoU: median(parts.map(p => p.placements.true.fitIoU)),
      turnedMoreThan5Deg: turned.length, turnedMedianGridFitIoU: median(turned.map(p => p.placements.grid.fitIoU)),
      turnedMedianTrueFitIoU: median(turned.map(p => p.placements.true.fitIoU)), turnedMedianWrongSignFitIoU: median(turned.map(wrongSign)),
      turnedTrueBeatsGrid: turned.filter(p => p.placements.true.fitIoU > p.placements.grid.fitIoU).length,
      turnedTrueBeatsWrongSign: turned.filter(p => p.placements.true.fitIoU > wrongSign(p)).length,
      reviewedOverrides: reviewed.map(p => ({id: p.id, gridFitIoU: p.placements.grid.fitIoU, trueFitIoU: p.placements.true.fitIoU})),
    },
    ridges: {
      note: 'lidar ridges of confident (>= 0.7) gable and hip roofs, turned into the part frame; a ridge parallel to a wall is within 5 degrees of a part axis',
      confident: ridged.length, withinFiveDegOfPartAxis: within(ridged, p => p.roof.ridgeAxisDeg),
      turnedHouses: turnedRidges.length, turnedWithinFiveDeg: within(turnedRidges, p => p.roof.ridgeAxisDeg),
      turnedWithinFiveDegWrongSign: within(turnedRidges, p => localAxisDeg(p.roof.ridgeBearingMeasuredDeg, -p.placements.true.rotationDeg)),
      turnedWithinFiveDegUnrotated: within(turnedRidges, p => localAxisDeg(p.roof.ridgeBearingMeasuredDeg, 0)),
      artKitRoofAxisAgrees: withKitAxis.filter(p => kitAxis(p.roof.ridgeAxisDeg) === p.appearance.treatment.roofAxis).length,
      artKitRoofAxisCompared: withKitAxis.length,
      artKitRoofAxisDisagrees: withKitAxis.filter(p => kitAxis(p.roof.ridgeAxisDeg) !== p.appearance.treatment.roofAxis).map(p => p.id),
    },
    storeys: {
      note: 'the art kit draws treatment.stories; the native walls and floors use storeys.count',
      artKitAgrees: parts.filter(p => p.appearance.treatment.stories === p.storeys.count).length,
      artKitDisagrees: parts.filter(p => p.appearance.treatment.stories !== p.storeys.count)
        .map(p => ({id: p.id, name: p.name, artKit: p.appearance.treatment.stories, native: p.storeys.count, nativeSource: p.storeys.source})),
    },
    latLonRoundTripMaxM: Number(Math.max(...parts.map(p => { const [x, y] = town.projection.toTown(p.placements.true.latitude, p.placements.true.longitude);
      return Math.hypot(x - p.placements.true.at[0], y - p.placements.true.at[1]); })).toFixed(4)),
  };
}

// Why the parts may not be written, if anything stops them.
export function refusals(parts, town, trip) {
  const out = [], problems = parts.flatMap(validatePart), art = artMismatches(parts, town);
  if (problems.length) out.push(`${problems.length} part checks fail:\n  ${problems.slice(0, 20).join('\n  ')}`);
  if (trip.identical !== trip.sectors) {
    const first = trip.mismatches[0], head = `The parts do not reproduce ${trip.sectors - trip.identical} of ${trip.sectors} sectors.`;
    if (first.threw) out.push(`${head} Stamping the parts threw: ${first.threw}`);
    else if (typeof first.field === 'string') out.push(`${head} First: ${first.id}, where ${first.field}.\n`
      + '  The values agree, so pyDumps in house-parts.mjs writes them differently from json.dumps in the generator; its comment lists the forms it matches.');
    else out.push(`${head} First: ${first.id}, where ${first.field.path} is ${first.field.committed} in the file but ${first.field.stamped} from the parts.\n`
      + '  The parts are built from the current town, so regenerating them will not fix this. Either the sectors are stale '
      + `(python -B tools/maps/build-mount-dora.py --check), or the generator now writes building layers differently from ${MIRRORS}. Update the mirrors to match, then regenerate.`);
  }
  if (art.length) out.push(`${art.length} art placements do not rebuild from their parts (${art.slice(0, 5).join(', ')}).`);
  return out;
}

// Every file the parts folder should hold, from the current town. With
// strict false it reports refusals instead of throwing, so a test can name them.
export function generate(town, {strict = true} = {}) {
  const parts = buildParts(town);
  let trip;
  try { trip = roundTrip(parts, town); } catch (error) { trip = {sectors: town.sectors.length, identical: 0, mismatches: [{id: 'every sector', threw: error.message}]}; }
  const refused = refusals(parts, town, trip);
  if (strict && refused.length) throw Error('House parts refused:\n' + refused.join('\n'));
  const files = new Map();
  for (const part of parts) files.set(part.id + '.json', formatPart(part));
  const index = {
    kind: INDEX_KIND, version: VERSION, project: town.project.id,
    about: 'One self-contained house-part file per Mount Dora building; README.md in this folder documents the format',
    generatedBy: REGENERATE,
    counts: {parts: parts.length, osm: parts.filter(p => p.source.osm).length, county: parts.filter(p => p.source.county).length,
      fitABlock: parts.filter(blockFits).length, withSharedWalls: parts.filter(p => p.walls.some(w => w.sharedWith.length)).length,
      crossSectorEdges: parts.filter(p => p.provenance.sectors.length > 1).length,
      croppedByTownEdge: parts.filter(p => { const [x0, y0] = p.placements.grid.origin; return x0 < 0 || y0 < 0 || x0 + p.size[0] > town.extent.widthM || y0 + p.size[1] > town.extent.depthM; }).length},
    block: {sizeM: BLOCK.size, marginM: BLOCK.marginM, largestHouseM: BLOCK_MAX_M, maxStoreys: BLOCK.maxLevels - 1},
    inputs: inputDigests(town),
    checks: checks(parts, town, trip),
    parts: parts.map(p => ({id: p.id, file: p.id + '.json', name: p.name, address: p.address?.text ?? null, size: p.size, storeys: p.storeys.count,
      roof: p.roof.form, block: blockFits(p), sha256: sha256(files.get(p.id + '.json'))})),
  };
  files.set('index.json', formatIndex(index));
  return {parts, index, files, trip, refused};
}

// Which committed files differ from, are missing from or are extra to `files`.
export function compareFolder(dir, files) {
  const present = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => !KEEP.has(f)) : [];
  const stale = [...files].filter(([name, text]) => !fs.existsSync(path.join(dir, name)) || fs.readFileSync(path.join(dir, name), 'utf8') !== text).map(([name]) => name);
  const extra = present.filter(f => !files.has(f));
  return {stale, extra, current: !stale.length && !extra.length};
}

// The command line, given the generated files: with check it compares them
// with `dir`, otherwise it writes them there and removes extras. Returns the
// exit code.
export function runCli({check, dir, files, index, log = console.log, error = console.error}) {
  if (check) {
    const {stale, extra, current} = compareFolder(dir, files);
    if (!current) {
      error(`House parts are stale: ${stale.length} differ or are missing (${stale.slice(0, 5).join(', ')}), ${extra.length} extra (${extra.slice(0, 5).join(', ')}).`);
      error('Regenerate with: ' + REGENERATE);
      return 1;
    }
    log(`House parts are current: ${index.counts.parts} parts; ${index.checks.sectors.byteIdentical}/${index.checks.sectors.stamped} sectors reproduced byte for byte.`);
    return 0;
  }
  fs.mkdirSync(dir, {recursive: true});
  for (const f of compareFolder(dir, files).extra) fs.rmSync(path.join(dir, f));
  for (const [name, text] of files) fs.writeFileSync(path.join(dir, name), text);
  log(`Wrote ${files.size - 1} house parts and index.json to ${dir}; ${index.counts.fitABlock} fit a block.`);
  log(JSON.stringify(index.checks, null, 1));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {files, index} = generate(await loadTown());
  process.exitCode = runCli({check: process.argv.includes('--check'), dir: path.join(root, PARTS_DIR), files, index});
}
