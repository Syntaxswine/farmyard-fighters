// Portable, metre-based wall runs. No DOM, storage, renderer or game clock.
export const WALL_RUN_FEATURE = 'nautilus-wall-runs-v1';
export const WALL_KIT = Object.freeze({panel: 1, height: 2, thickness: .16, floorSpacing: 2.12, maxStories: 5});
export function wallRunsOf(map) {
  const data = map?.wallRuns;
  if (data === undefined) return [];
  if (!data || data.version !== 1 || !Array.isArray(data.segments)) throw Error('Expected wallRuns version 1 with a segments array.');
  return data.segments;
}
const EPS = 1e-6, round = n => Math.round(n * 1e6) / 1e6;
const pointOK = p => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
export function wallRunErrors(map, size = map?.size || map?.width || 240) {
  if (!map || typeof map !== 'object') return ['Expected a map or block for wall-run validation.'];
  if (map.wallRuns === undefined) return [];
  const data = map.wallRuns, errors = [], ids = new Set(); let panels = 0;
  if (!data || data.version !== 1 || !Array.isArray(data.segments) || data.segments.length > 4096) return ['Expected wallRuns version 1 with at most 4096 segments.'];
  if (!Number.isFinite(size) || size <= 0 || !Number.isInteger(map.levels) || map.levels < 3 || map.levels > 6) return ['Wall runs need a finite footprint and 3–6 declared layers.'];
  for (const run of data.segments) {
    if (!run || typeof run.id !== 'string' || !/^[\w:.-]{1,96}$/.test(run.id) || ids.has(run.id)) {errors.push('Wall runs need unique, portable IDs.'); continue;}
    ids.add(run.id);
    if (!pointOK(run.a) || !pointOK(run.b) || [...run.a, ...run.b].some(n => n < -.5 - EPS || n > size - .5 + EPS)) {errors.push(`Wall ${run.id} must fit inside the ${size} metre footprint.`); continue;}
    const length = Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1]);
    if (length < .1 - EPS || length > 64 + EPS) errors.push('Wall runs must be between 0.1 and 64 metres long.');
    if (!Number.isInteger(run.z) || run.z < 0 || !Number.isInteger(run.stories) || run.stories < 1 || run.stories > 5 || run.z + run.stories > 6 || run.z + run.stories > map.levels) errors.push('Choose 1–5 stories within the six available layers.');
    if (!['wood', 'brick', 'concrete'].includes(run.material)) errors.push('Unknown wall-run material.');
    panels += Math.ceil(length) * run.stories;
  }
  if (panels > 50000) errors.push('Wall runs exceed the 50,000 native-panel budget.');
  return [...new Set(errors)];
}
export function measureWallRun(run) {
  const dx = run.b[0] - run.a[0], dy = run.b[1] - run.a[1], length = Math.hypot(dx, dy);
  return {length, angle: (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, fullPanels: Math.floor(length + EPS), trim: Math.max(0, round(length - Math.floor(length + EPS)))};
}
// Native one-metre panels are rotated, never stretched. Only the last panel is
// cut to length, with the same height, thickness and texture density.
export function wallPanels(run) {
  const {length} = measureWallRun(run), dx = (run.b[0] - run.a[0]) / length, dy = (run.b[1] - run.a[1]) / length, result = [];
  for (let story = 0; story < run.stories; story++) for (let offset = 0; offset < length - EPS; offset += WALL_KIT.panel) {
    const width = Math.min(WALL_KIT.panel, length - offset), along = offset + width / 2, z = run.z + story;
    result.push({id: `${run.id}:${story}:${offset}`, center: [run.a[0] + dx * along, z * WALL_KIT.floorSpacing + WALL_KIT.height / 2, run.a[1] + dy * along], size: [width, WALL_KIT.height, WALL_KIT.thickness], yaw: -Math.atan2(dy, dx), z, material: run.material});
  }
  return result;
}
export function snapWallPoint(point, {start, step = .5, angleStep = 45, anchors = [], endpointRadius = .3} = {}) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw Error('Choose a finite wall endpoint.');
  if (![0, .1, .25, .5, 1].includes(step) || ![0, 15, 45, 90].includes(angleStep)) throw Error('Unknown wall snap setting.');
  if (start && (!Number.isFinite(start.x) || !Number.isFinite(start.y))) throw Error('Choose a finite wall start endpoint.');
  if (!Number.isFinite(endpointRadius) || endpointRadius < 0 || !Array.isArray(anchors) || anchors.some(a => !pointOK(a))) throw Error('Wall endpoint snapping needs finite anchors and a nonnegative radius.');
  const anchor = anchors.filter(a => !start || Math.hypot(a[0] - start.x, a[1] - start.y) > EPS).map(a => ({a, d: Math.hypot(a[0] - point.x, a[1] - point.y)})).filter(p => p.d <= endpointRadius).sort((a, b) => a.d - b.d)[0];
  if (anchor) return {x: anchor.a[0], y: anchor.a[1], z: point.z || 0, snapped: 'endpoint'};
  let x = step ? Math.round((point.x + .5) / step) * step - .5 : point.x, y = step ? Math.round((point.y + .5) / step) * step - .5 : point.y;
  if (start && angleStep) {
    const radians = Math.round(Math.atan2(y - start.y, x - start.x) / (angleStep * Math.PI / 180)) * angleStep * Math.PI / 180, ux = Math.cos(radians), uy = Math.sin(radians);
    let length = Math.max(0, (x - start.x) * ux + (y - start.y) * uy);
    // At 45° the projected grid increments stay equal on both axes.
    if (step) {const dominant = Math.max(Math.abs(ux), Math.abs(uy)); length = Math.round(length * dominant / step) * step / dominant;}
    x = start.x + ux * length; y = start.y + uy * length;
  }
  return {x: round(x), y: round(y), z: point.z || 0, snapped: angleStep && start ? 'angle' : step ? 'grid' : 'free'};
}
export function distanceToWall(run, point) {
  const dx = run.b[0] - run.a[0], dy = run.b[1] - run.a[1], t = Math.max(0, Math.min(1, ((point.x - run.a[0]) * dx + (point.y - run.a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - run.a[0] - t * dx, point.y - run.a[1] - t * dy);
}
// Slab test in the run's local frame; endpoints use world metres (x,y,h),
// deliberately separate from integer tactical layer z.
function intersectsBox(from, to, min, max) {
  let low = 0, high = 1;
  for (let axis = 0; axis < min.length; axis++) {
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < EPS) {if (from[axis] < min[axis] - EPS || from[axis] > max[axis] + EPS) return false; continue;}
    const a = (min[axis] - from[axis]) / delta, b = (max[axis] - from[axis]) / delta;
    low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b)); if (low > high + EPS) return false;
  }
  return true;
}
// A nonzero radius pads local rectangular slabs, including their corners and
// height. It is conservative clearance, not an exact swept-disc actor solver.
export function wallRunsIntersect(map, from, to, {radius = 0} = {}) {
  if (![from?.x, from?.y, from?.h, to?.x, to?.y, to?.h, radius].every(Number.isFinite) || radius < 0) throw Error('Wall intersection needs finite world-metre endpoints and a nonnegative radius.');
  return wallRunsOf(map).some(run => {
    const {length} = measureWallRun(run), ux = (run.b[0] - run.a[0]) / length, uy = (run.b[1] - run.a[1]) / length;
    const local = p => [(p.x - run.a[0]) * ux + (p.y - run.a[1]) * uy, -(p.x - run.a[0]) * uy + (p.y - run.a[1]) * ux, p.h];
    for (let s = 0; s < run.stories; s++) {const h = (run.z + s) * WALL_KIT.floorSpacing;if (intersectsBox(local(from), local(to), [-radius, -WALL_KIT.thickness / 2 - radius, h - radius], [length + radius, WALL_KIT.thickness / 2 + radius, h + WALL_KIT.height + radius])) return true;}
    return false;
  });
}
export function wallRunsBlockStep(map, a, b) {
  const world = p => ({x: p.x, y: p.y, h: (p.z || 0) * WALL_KIT.floorSpacing + .8});
  return wallRunsIntersect(map, world(a), world(b));
}
export function requiredMapFeatures(map) {
  const errors = wallRunErrors(map);
  if (errors.length) throw Error(errors.join(' '));
  return wallRunsOf(map).length ? [WALL_RUN_FEATURE] : [];
}
export function assertMapCapabilities(map, features = []) {
  const missing = requiredMapFeatures(map).filter(f => !Array.isArray(features) || !features.includes(f));
  if (missing.length) throw Error('Game adapter does not support ' + missing.join(', ') + '. Keep this blueprint in Nautilus or export it for an updated adapter.');
}
export function shiftWallRun(run, x, y, id = run.id) {return {...structuredClone(run), id, a: [round(run.a[0] + x), round(run.a[1] + y)], b: [round(run.b[0] + x), round(run.b[1] + y)]};}
export function wallsInSector(map, sx, sy) {
  const min = [sx * 24 - .5, sy * 24 - .5], max = min.map(n => n + 24), inside = p => p.every((n, i) => n >= min[i] - EPS && n <= max[i] + EPS), out = [];
  for (const run of wallRunsOf(map)) {
    if (inside(run.a) && inside(run.b)) out.push(run);
    else if (intersectsBox(run.a, run.b, min.map(n => n + EPS * 2), max.map(n => n - EPS * 2))) throw Error('A wall run crosses this block boundary. Split the run at the boundary before capturing or replacing the block.');
  }
  return out;
}
