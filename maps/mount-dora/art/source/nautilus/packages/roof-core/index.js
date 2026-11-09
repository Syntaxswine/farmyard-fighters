// Portable roof geometry. Coordinates are metres: (map x, height, map y).
// No renderer, DOM, random global state, map mutations, or consumer physics.
export const ROOF_FEATURE = 'nautilus-sloped-roofs-v1';
export const ROOF_LIMITS = Object.freeze({minDimension: .5, maxDimension: 240,
  minPitch: 5, maxPitch: 75, maxOverhang: 2, minEaves: 1, maxEaves: 5,
  maxRoofs: 4096, floorSpacing: 2.12, thickness: .12});

const fields = ['id', 'x', 'y', 'width', 'depth', 'z', 'style', 'axis', 'pitch', 'overhang', 'material', 'seed'];
const acceptedFields = [...fields, 'direction', 'metadata'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = Number.isFinite;
const between = (n, a, b) => finite(n) && n >= a && n <= b;
const unknown = (value, keys) => Object.keys(value).filter(key => !keys.includes(key));
const plainObject = value => record(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function metadataOK(value) {
  // Walk ancestor paths, rather than a global visited set: repeated references
  // are valid JSON values, while a reference back to an ancestor is a cycle.
  const active = new Set(), pending = [{value}];
  try {
    if (!plainObject(value)) return false;
    while (pending.length) {
      const {value, leave} = pending.pop();
      if (leave) {active.delete(value); continue;}
      if (value === null || typeof value === 'string' || typeof value === 'boolean') continue;
      if (typeof value === 'number') {if (!finite(value)) return false; continue;}
      if (typeof value !== 'object') return false;
      const array = Array.isArray(value);
      if (!(array ? Object.getPrototypeOf(value) === Array.prototype : plainObject(value)) || active.has(value)) return false;
      const keys = Reflect.ownKeys(value);
      if (array && (keys.length !== value.length + 1 || keys.some((key, i) => key !== (i === value.length ? 'length' : String(i))))) return false;
      active.add(value); pending.push({value, leave: true});
      for (const key of keys) {
        if (array && key === 'length') continue;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        // Reject accessors, symbols and hidden properties instead of invoking
        // getters/toJSON or silently losing authoring data during serialization.
        if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return false;
        pending.push({value: descriptor.value});
      }
    }
    return true;
  } catch {return false;}
}

function metadataPropertyOK(owner) {
  const descriptor = Object.getOwnPropertyDescriptor(owner, 'metadata');
  return descriptor.enumerable && Object.hasOwn(descriptor, 'value') && metadataOK(descriptor.value);
}

function copyMetadata(source) {
  const result = {}, copies = new Map([[source, result]]), pending = [source];
  while (pending.length) {
    const value = pending.pop(), target = copies.get(value);
    for (const key of Object.keys(value)) {
      let child = Object.getOwnPropertyDescriptor(value, key).value;
      if (child !== null && typeof child === 'object') {
        if (!copies.has(child)) {copies.set(child, Array.isArray(child) ? [] : {}); pending.push(child);}
        child = copies.get(child);
      }
      Object.defineProperty(target, key, {value: child, enumerable: true, configurable: true, writable: true});
    }
  }
  return result;
}

const copySpec = spec => {
  const result = Object.fromEntries([...fields, 'direction'].map(key => {
    const value = key === 'direction' ? spec.direction ?? 1 : spec[key];
    return [key, value === 0 ? 0 : value];
  }));
  if (Object.hasOwn(spec, 'metadata')) result.metadata = copyMetadata(Object.getOwnPropertyDescriptor(spec, 'metadata').value);
  return result;
};

function specErrors(spec, size) {
  if (!record(spec)) return ['Each sloped roof must be an object.'];
  const errors = [], name = typeof spec.id === 'string' ? `Roof ${spec.id}` : 'Roof';
  if (typeof spec.id !== 'string' || !/^[\w:.-]{1,96}$/.test(spec.id)) errors.push('Sloped roofs need portable IDs of 1–96 characters.');
  if (fields.some(key => !Object.hasOwn(spec, key)) || unknown(spec, acceptedFields).length) errors.push(`${name} must use the version 1 roof fields.`);
  if (!finite(spec.x) || !finite(spec.y)) errors.push(`${name} needs finite ground coordinates.`);
  if (![spec.width, spec.depth].every(n => between(n, .5, 240))) errors.push(`${name} dimensions must be 0.5–240 metres.`);
  if (!Number.isInteger(spec.z) || !between(spec.z, 1, 5)) errors.push(`${name} eaves layer must be an integer from 1 to 5.`);
  if (!['gable', 'hip', 'shed'].includes(spec.style)) errors.push(`${name} has an unsupported style.`);
  if (!['x', 'y'].includes(spec.axis)) errors.push(`${name} axis must be x or y.`);
  if (Object.hasOwn(spec, 'direction') && spec.direction !== 1 && spec.direction !== -1) errors.push(`${name} direction must be +1 or -1 when supplied.`);
  if (Object.hasOwn(spec, 'metadata') && !metadataPropertyOK(spec)) errors.push(`${name} metadata must be a finite, acyclic plain JSON object.`);
  if (!between(spec.pitch, 5, 75)) errors.push(`${name} pitch must be 5–75 degrees.`);
  if (!between(spec.overhang, 0, 2)) errors.push(`${name} overhang must be 0–2 metres.`);
  if (!['slate', 'clay', 'metal'].includes(spec.material)) errors.push(`${name} has an unsupported material.`);
  if (!Number.isInteger(spec.seed) || !between(spec.seed, 0, 0xffffffff)) errors.push(`${name} seed must be an unsigned 32-bit integer.`);
  if ([spec.x, spec.y, spec.width, spec.depth, spec.overhang].every(finite) &&
    (spec.x - spec.overhang < 0 || spec.y - spec.overhang < 0 ||
     spec.x + spec.width + spec.overhang > size || spec.y + spec.depth + spec.overhang > size)) {
    errors.push(`${name}, including its overhang, must fit inside [0, ${size}] on both ground axes.`);
  }
  return errors;
}

export function roofErrors(map, size = 240) {
  if (!record(map)) return ['Expected a map or block for sloped-roof validation.'];
  if (!between(size, .5, 240)) return ['Sloped-roof world size must be 0.5–240 metres.'];
  if (map.slopedRoofs === undefined && !Object.hasOwn(map, 'slopedRoofs')) return [];
  const data = map.slopedRoofs;
  // Validate the envelope even when it contains no roofs. Future features must
  // never become an apparently valid empty map through silent normalization.
  if (!record(data) || data.version !== 1 || !Array.isArray(data.roofs) ||
    data.roofs.length > ROOF_LIMITS.maxRoofs || unknown(data, ['version', 'roofs', 'metadata']).length) {
    return ['Expected slopedRoofs version 1 with version/roofs, optional metadata, and at most 4096 roofs.'];
  }
  const errors = [], ids = new Set();
  if (Object.hasOwn(data, 'metadata') && !metadataPropertyOK(data)) errors.push('slopedRoofs.metadata must be a finite, acyclic plain JSON object.');
  for (const spec of data.roofs) {
    errors.push(...specErrors(spec, size));
    if (record(spec) && typeof spec.id === 'string') {
      if (ids.has(spec.id)) errors.push(`Duplicate sloped-roof ID: ${spec.id}.`);
      ids.add(spec.id);
    }
  }
  return [...new Set(errors)];
}

export function roofsOf(map) {
  const errors = roofErrors(map);
  if (errors.length) throw new TypeError(errors.join(' '));
  return (map.slopedRoofs?.roofs || []).map(copySpec);
}

const sub = (a, b) => a.map((n, i) => n - b[i]);
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => {const length = Math.hypot(...a); return a.map(n => n === 0 ? 0 : n / length);};
function stream(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ state >>> 15, state | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
const key = p => p.join(',');

export function createSlopedRoof(spec) {
  const errors = roofErrors({slopedRoofs: {version: 1, roofs: [spec]}});
  if (errors.length) throw new TypeError(errors.join(' '));
  const {x, y, width, depth, z, style, axis, pitch, overhang, material, seed} = spec;
  const direction = spec.direction ?? 1;
  const x0 = x - overhang, y0 = y - overhang, w = width + 2 * overhang, d = depth + 2 * overhang;
  const run = axis === 'x' ? w : d, span = axis === 'x' ? d : w;
  const eavesHeight = z * ROOF_LIMITS.floorSpacing;
  const rise = (style === 'shed' ? span : span / 2) * Math.tan(pitch * Math.PI / 180);
  // Calculate normals/UVs in roof-local coordinates so translating a roof does
  // not change its deterministic paint or accumulate world-position error.
  const point = (along, across, h = 0) => axis === 'x' ? [along, h, across] : [across, h, along];
  const world = p => [p[0] === 0 ? x0 : p[0] === w ? x + width + overhang : x0 + p[0],
    eavesHeight + p[1], p[2] === 0 ? y0 : p[2] === d ? y + depth + overhang : y0 + p[2]];
  const a = point(0, 0), b = point(run, 0), c = point(run, span), d0 = point(0, span);
  let faces, ridge;
  if (style === 'shed') {
    const highAcross = direction === 1 ? span : 0, lowAcross = direction === 1 ? 0 : span;
    const highA = point(0, highAcross, rise), highB = point(run, highAcross, rise);
    faces = [[point(0, lowAcross), point(run, lowAcross), highB, highA]]; ridge = [highA, highB];
  } else if (style === 'gable') {
    const r0 = point(0, span / 2, rise), r1 = point(run, span / 2, rise);
    faces = [[a, b, r1, r0], [r0, r1, c, d0]]; ridge = [r0, r1];
  } else {
    const pointRidge = run - span <= 1e-7;
    const inset = pointRidge ? run / 2 : span / 2;
    const r0 = point(inset, span / 2, rise), r1 = point(run - inset, span / 2, rise);
    // A point ridge is a deliberate pyramid, not a zero-area quad. End hips
    // become steeper when the requested ridge axis is shorter than the span.
    faces = pointRidge
      ? [[a, b, r0], [b, c, r0], [c, d0, r0], [d0, a, r0]]
      : [[a, b, r1, r0], [b, c, r1], [c, d0, r0, r1], [d0, a, r0]];
    ridge = [r0, r1];
  }
  faces = faces.map(points => cross(sub(points[1], points[0]), sub(points[2], points[0]))[1] < 0 ? [...points].reverse() : points);
  const random = stream(seed), uvPhase = [random(), random()], tint = .96 + random() * .06;
  const positions = [], normals = [], uvs = [], colors = [], indices = [], groups = [];
  const origin = [overhang, 0, overhang];
  let surfaceArea = 0;
  function face(points, variation) {
    const normal = unit(cross(sub(points[1], points[0]), sub(points[2], points[0])));
    let u = Math.hypot(normal[0], normal[2]) < 1e-10 ? [1, 0, 0] : unit([normal[2], 0, -normal[0]]);
    const dominant = Math.abs(u[0]) >= Math.abs(u[2]) ? 0 : 2;
    if (u[dominant] < 0) u = u.map(n => -n);
    let v = cross(normal, u);
    if (v[1] < 0) v = v.map(n => -n);
    const start = positions.length / 3;
    for (const p of points) {
      positions.push(...world(p)); normals.push(...normal);
      const local = sub(p, origin);
      uvs.push(dot(local, u) + uvPhase[0], dot(local, v) + uvPhase[1]);
      colors.push(variation, variation, variation);
    }
    for (let i = 1; i < points.length - 1; i++) {
      indices.push(start, start + i, start + i + 1);
      surfaceArea += Math.hypot(...cross(sub(points[i], points[0]), sub(points[i + 1], points[0]))) / 2;
    }
  }
  const group = (materialIndex, draw) => {
    const start = indices.length; draw();
    groups.push({start, count: indices.length - start, materialIndex});
  };
  const edges = new Map();
  group(0, () => {
    for (const points of faces) {
      face(points, tint * (.99 + random() * .02));
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length], id = [key(a), key(b)].sort().join('|');
        if (edges.has(id)) edges.delete(id); else edges.set(id, [a, b]);
      }
    }
  });
  const lower = p => [p[0], p[1] - ROOF_LIMITS.thickness, p[2]];
  group(1, () => {for (const [a, b] of edges.values()) face([a, lower(a), lower(b), b], tint);});
  group(2, () => {for (const points of faces) face([...points].reverse().map(lower), tint);});
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {const axis = i % 3; min[axis] = Math.min(min[axis], positions[i]); max[axis] = Math.max(max[axis], positions[i]);}
  return {feature: ROOF_FEATURE, spec: copySpec(spec), positions, normals, uvs, colors, indices, groups,
    materialSlots: [{id: material, role: 'roof'}, {id: 'fascia', role: 'fascia'}, {id: 'soffit', role: 'soffit'}],
    bounds: {min, max}, ridge: ridge.map(world), eavesHeight, rise, thickness: ROOF_LIMITS.thickness,
    appearance: {uvPhase, tint},
    metrics: {triangles: indices.length / 3, vertices: positions.length / 3, drawCalls: groups.length,
      surfaceArea, enclosedVolume: w * d * ROOF_LIMITS.thickness}};
}
