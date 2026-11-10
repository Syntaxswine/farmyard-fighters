import {RAIL_TRACK_ASSETS, RAIL_TRACK_PROFILE} from './catalogue.js';
import {ballastPaint, tiePaint} from './paint.js';
import {planRailwayRoute, railwayStationAt} from './route.js';

const {ballastRiseM, ballastWidthM, railCentresM, tieIntervalM} = RAIL_TRACK_PROFILE;
const halfBed = ballastWidthM / 2;
const shoulderStart = .56;
const tieHeight = .106;
const tieTop = .324;

function station(piece, t) {
  if (piece.radiusM === null) return {x: 0, z: piece.lengthM * t, c: 1, s: 0, angle: 0, t};
  const angle = Math.PI / 2 * t;
  const c = t === 1 ? 0 : Math.cos(angle), s = t === 1 ? 1 : Math.sin(angle);
  const radius = piece.radiusM;
  return {x: radius * (1 - c), z: radius * s, c, s, angle, t};
}

function ballastSection() {
  const offsets = [-halfBed, -.95, -.88, -.80, -.72, -.64, -shoulderStart,
    shoulderStart, .64, .72, .80, .88, .95, halfBed];
  return offsets.map(u => {
    const v = Math.max(0, Math.abs(u) - shoulderStart) / (halfBed - shoulderStart);
    const h = ballastRiseM * (1 - v * v * (3 - 2 * v));
    const slope = -6 * ballastRiseM * v * (1 - v) / (halfBed - shoulderStart) * Math.sign(u);
    const length = Math.hypot(slope, 1);
    return {u, h, normal: [-slope / length, 1 / length]};
  });
}

const RAIL_PROFILE = [
  [-.066, .322], [-.066, .334], [-.021, .347], [-.018, .394],
  [-.044, .403], [-.044, .42], [-.034, .43], [.034, .43],
  [.044, .42], [.044, .403], [.018, .394], [.021, .347],
  [.066, .334], [.066, .322]
];

// Sweep closed clockwise sections. The end rings use exact stations, with the
// same section and analytic normals on a straight and either end of a curve.
function sweep(T, stations, profile, repeats, colourAt) {
  const positions = [], normals = [], uvs = [], indices = [], colours = [];
  const size = profile.length;
  function vertex(site, point, normal, end, colour) {
    const index = positions.length / 3;
    positions.push(site.x + site.c * point.u, point.h, site.z - site.s * point.u);
    normals.push(...normal);
    uvs.push((point.u + halfBed) * 2, end ? point.h * 2 : site.t * repeats);
    if (colour) colours.push(colour.r, colour.g, colour.b);
    return index;
  }

  for (let edge = 0; edge < size; edge++) {
    const a = profile[edge], b = profile[(edge + 1) % size];
    const du = b.u - a.u, dh = b.h - a.h, length = Math.hypot(du, dh);
    const flat = [-dh / length, du / length];
    const colour = colourAt?.(Math.min(a.h, b.h), false);
    const first = positions.length / 3;
    const surface = edge < size - 1;
    for (const site of stations) {
      for (const p of [a, b]) {
        const [nx, ny] = surface && p.normal ? p.normal : flat;
        vertex(site, p, [site.c * nx, ny, -site.s * nx], false, colour);
      }
    }
    for (let step = 1; step < stations.length; step++) {
      const i = first + 2 * (step - 1);
      indices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    }
  }

  const outline = profile.map(({u, h}) => new T.Vector2(u, h));
  const capFaces = T.ShapeUtils.triangulateShape(outline, []);
  const capColour = colourAt?.(0, true);
  for (const [site, direction] of [[stations[0], -1], [stations.at(-1), 1]]) {
    const normal = [site.s * direction, 0, site.c * direction];
    const ids = profile.map(point => vertex(site, point, normal, true, capColour));
    for (const [i, j, k] of capFaces) {
      const a = profile[i], b = profile[j], c = profile[k];
      const cross = (b.u - a.u) * (c.h - a.h) - (b.h - a.h) * (c.u - a.u);
      indices.push(ids[i], ...(cross * direction > 0 ? [ids[j], ids[k]] : [ids[k], ids[j]]));
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  if (colourAt) geo.setAttribute('color', new T.Float32BufferAttribute(colours, 3));
  geo.setIndex(indices);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function trackMesh(T, {id, lengthM, stations, sample, gravelRepeats}, materials, fixtures, own) {
  const root = new T.Group();
  root.name = id;
  root.userData = {assetId: id, profile: RAIL_TRACK_PROFILE.id, metresPerUnit: 1};
  const bed = new T.Mesh(own(sweep(T, stations, ballastSection(), gravelRepeats)), materials.gravel);
  bed.name = 'Rounded gravel ballast';
  root.add(bed);

  const iron = new T.Color(0x69483a), polished = new T.Color(0xaebdc4), head = new T.Color(0x7f888c);
  const railColour = (height, cap) => !cap && height >= .42 ? polished : height >= .40 ? head : iron;
  for (const side of [-1, 1]) {
    const profile = RAIL_PROFILE.map(([u, h]) => ({u: u + side * railCentresM / 2, h}));
    const rail = new T.Mesh(own(sweep(T, stations, profile, 1, railColour)), materials.rail);
    rail.name = side < 0 ? 'Left steel rail' : 'Right steel rail';
    root.add(rail);
  }

  const count = Math.round(lengthM / tieIntervalM);
  const ties = own(new T.InstancedMesh(fixtures.tie, materials.timber, count));
  const plates = own(new T.InstancedMesh(fixtures.plate, materials.plate, 2 * count));
  const tint = new T.Color();
  const transform = new T.Object3D();
  for (let i = 0; i < count; i++) {
    const site = sample((i + .5) / count);
    transform.rotation.y = site.angle;
    transform.position.set(site.x, tieTop - tieHeight / 2, site.z);
    transform.updateMatrix();
    ties.setMatrixAt(i, transform.matrix);
    tint.setScalar(.72 + .28 * ((i * 13 + 5) % 17) / 16);
    ties.setColorAt(i, tint);
    for (const [j, side] of [-1, 1].entries()) {
      const u = side * railCentresM / 2;
      transform.position.set(site.x + site.c * u, tieTop + .003, site.z - site.s * u);
      transform.updateMatrix();
      plates.setMatrixAt(2 * i + j, transform.matrix);
    }
  }
  ties.name = 'Timber ties';
  plates.name = 'Rail tie plates';
  root.add(ties, plates);
  for (const mesh of root.children) mesh.castShadow = mesh.receiveShadow = true;
  return root;
}

function trackTemplate(T, piece, materials, fixtures, own) {
  const divisions = piece.radiusM === null ? 1 : 32;
  const sample = t => station(piece, t);
  const stations = Array.from({length: divisions + 1}, (_, i) => sample(i / divisions));
  return trackMesh(T, {id: piece.id, lengthM: piece.lengthM, stations, sample,
    gravelRepeats: Math.round(2 * piece.lengthM)}, materials, fixtures, own);
}

function retire(actions) {
  const errors = [];
  for (const action of actions) {
    try { action(); }
    catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'Railway resources retired with cleanup errors.');
}

export function createRailwayKit(T) {
  if (!T?.InstancedMesh || !T?.DataTexture || !T?.ShapeUtils || !T?.MeshStandardMaterial) {
    throw new TypeError('Supply the host Three namespace to create a railway kit.');
  }
  const resources = [], templates = new Map(), active = new Set();
  let disposed = false, materials, fixtures;
  const own = resource => { resources.push(resource); return resource; };
  try {
    materials = {
      gravel: own(new T.MeshStandardMaterial({map: own(ballastPaint(T)), roughness: 1})),
      timber: own(new T.MeshStandardMaterial({map: own(tiePaint(T)), roughness: .92})),
      rail: own(new T.MeshStandardMaterial({vertexColors: true, roughness: .49, metalness: .26})),
      plate: own(new T.MeshStandardMaterial({color: 0x3a312a, roughness: .78, metalness: .2}))
    };
    fixtures = {
      tie: own(new T.BoxGeometry(1.44, tieHeight, .20)),
      plate: own(new T.BoxGeometry(.175, .022, .155))
    };
    for (const piece of RAIL_TRACK_ASSETS) templates.set(piece.id, trackTemplate(T, piece, materials, fixtures, own));
  } catch (error) {
    retire([...resources.reverse().map(resource => () => resource.dispose()), () => { throw error; }]);
  }

  function retain(root, owned) {
    const model = {
      root,
      dispose() {
        if (!active.delete(model)) return;
        retire([() => root.removeFromParent(), ...owned.map(resource => () => resource.dispose())]);
      }
    };
    active.add(model);
    return model;
  }

  return {
    create(id) {
      if (disposed) throw new Error('Railway kit is disposed.');
      if (!templates.has(id)) throw new RangeError('Unknown railway piece: ' + id);
      const root = templates.get(id).clone(true);
      return retain(root, root.children.filter(child => child.isInstancedMesh));
    },
    createRoute(waypoints) {
      if (disposed) throw new Error('Railway kit is disposed.');
      const plan = planRailwayRoute(waypoints), {lengthM} = plan, owned = [];
      try {
        const root = trackMesh(T, {id: 'railway:route', lengthM,
          stations: plan.stations.map(site => ({...site, t: site.distanceM / lengthM})),
          sample: t => railwayStationAt(plan, t * lengthM), gravelRepeats: 2 * lengthM
        }, materials, fixtures, resource => { owned.push(resource); return resource; });
        return retain(root, owned);
      } catch (error) {
        retire([...owned.reverse().map(resource => () => resource.dispose()), () => { throw error; }]);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      templates.clear();
      retire([...active].map(model => () => model.dispose()).concat(
        resources.splice(0).reverse().map(resource => () => resource.dispose())));
    }
  };
}
