import {RAIL_TRACK_ASSETS, RAIL_TRACK_PROFILE} from './catalogue.js';

export const RAILWAY_ROUTE_FEATURE = 'nautilus-railway-routes-v1';
export const RAILWAY_ROUTE_LIMITS = Object.freeze({routes: 64, waypoints: 48, lengthM: 480, totalLengthM: 1200});
export const RAILWAY_RADIUS_M = RAIL_TRACK_ASSETS.find(piece => piece.radiusM !== null).radiusM;
const HALF_BED = RAIL_TRACK_PROFILE.ballastWidthM / 2;
const ANGLE_STEP = Math.PI / 64;
const EPS = 1e-8;
const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const moved = (a, u, length) => [a[0] + u[0] * length, a[1] + u[1] * length];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const offset = (a, b) => [b[0] - a[0], b[1] - a[1]];
const directions = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const integerPoint = p => Array.isArray(p) && p.length === 2 && [...p].every(Number.isSafeInteger);

export function snapRailwayWaypoint(anchor, target) {
  const grid = target.map(Math.round);
  if (!anchor) return grid;
  const [dx, dy] = offset(anchor, grid);
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const [ux, uy] = directions[(octant + 8) % 8];
  const run = Math.round((dx * ux + dy * uy) / (ux * ux + uy * uy));
  return moved(anchor, [ux, uy], run);
}

function station(point, heading, distanceM) {
  const [x, z] = point, [s, c] = heading;
  return {x, z, s, c, angle: Math.atan2(s, c), distanceM};
}

function stationOn(span, distanceM) {
  const along = distanceM - span.startM;
  if (along <= EPS) return station(span.a, span.incoming, span.startM);
  if (along >= span.lengthM - EPS) return station(span.b, span.outgoing, span.startM + span.lengthM);
  if (span.kind === 'straight') return station(moved(span.a, span.incoming, along), span.incoming, distanceM);
  const theta = span.turn * along / span.lengthM;
  const c = Math.cos(theta), s = Math.sin(theta);
  const [vx, vy] = offset(span.center, span.a), [ux, uy] = span.incoming;
  return station([span.center[0] + vx * c - vy * s, span.center[1] + vx * s + vy * c],
    [ux * c - uy * s, ux * s + uy * c], distanceM);
}

export function railwayStationAt(plan, distanceM) {
  const at = Math.max(0, Math.min(plan.lengthM, distanceM));
  const span = plan.spans.find(span => at <= span.startM + span.lengthM + EPS) ?? plan.spans.at(-1);
  return stationOn(span, at);
}

function fit(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2 || waypoints.length > RAILWAY_ROUTE_LIMITS.waypoints ||
      ![...waypoints].every(integerPoint)) {
    throw new Error('Choose 2–48 whole-metre railway waypoints.');
  }
  const used = new Set();
  for (const point of waypoints) {
    const key = point.join(',');
    if (used.has(key)) throw new Error('Railway waypoints must be distinct. Use Undo point to backtrack.');
    used.add(key);
  }
  const legs = waypoints.slice(1).map((b, i) => {
    const a = waypoints[i], [dx, dy] = offset(a, b);
    if (dx && dy && Math.abs(dx) !== Math.abs(dy)) {
      throw new Error(`Railway approach ${i + 1} must follow a cardinal or 45° diagonal heading.`);
    }
    const length = distance(a, b);
    return {a, b, unit: [dx / length, dy / length], length};
  });
  // Preserve authored waypoints while allowing additional points along an approach.
  const runs = [];
  for (const leg of legs) {
    const previous = runs.at(-1);
    if (previous && Math.abs(previous.unit[0] - leg.unit[0]) < EPS &&
        Math.abs(previous.unit[1] - leg.unit[1]) < EPS) {
      previous.b = leg.b;
      previous.length = distance(previous.a, leg.b);
    } else runs.push(leg);
  }

  const corners = runs.slice(1).map(({a, unit}, i) => {
    const incoming = runs[i].unit, outgoing = unit;
    const turn = Math.atan2(cross(incoming, outgoing), incoming[0] * outgoing[0] + incoming[1] * outgoing[1]);
    if (Math.abs(turn) > Math.PI / 2 + EPS) {
      throw new Error(`Railway turn at ${a.join(', ')} is too sharp. Use 45° or 90° changes of heading.`);
    }
    const trim = RAILWAY_RADIUS_M * Math.tan(Math.abs(turn) / 2);
    const start = moved(a, incoming, -trim), end = moved(a, outgoing, trim);
    const center = moved(start, [-incoming[1], incoming[0]], Math.sign(turn) * RAILWAY_RADIUS_M);
    return {kind: 'curve', a: start, b: end, incoming, outgoing, turn, trim, center,
      lengthM: RAILWAY_RADIUS_M * Math.abs(turn)};
  });

  const spans = [];
  let lengthM = 0;
  function append(span) {
    spans.push({...span, startM: lengthM});
    lengthM += span.lengthM;
  }
  for (const [i, run] of runs.entries()) {
    const before = corners[i - 1], after = corners[i];
    const trimmed = (before?.trim ?? 0) + (after?.trim ?? 0);
    const straight = run.length - trimmed;
    if (straight < -EPS) {
      throw new Error(`Railway approach ${run.a.join(', ')} to ${run.b.join(', ')} needs ${trimmed.toFixed(2)} m for its 4 m radius turns. Move the waypoint or lengthen the approach.`);
    }
    if (straight > EPS) append({kind: 'straight', a: before?.b ?? run.a, b: after?.a ?? run.b,
      incoming: run.unit, outgoing: run.unit, lengthM: straight});
    if (after) append(after);
  }
  if (lengthM > RAILWAY_ROUTE_LIMITS.lengthM) {
    throw new Error(`Keep each railway route at or below ${RAILWAY_ROUTE_LIMITS.lengthM} m.`);
  }

  const stations = [stationOn(spans[0], 0)];
  const segments = [];
  for (const span of spans) {
    const count = span.kind === 'curve' ? Math.ceil(Math.abs(span.turn) / ANGLE_STEP) : Math.ceil(span.lengthM);
    const pad = span.kind === 'curve' ? RAILWAY_RADIUS_M * (1 - Math.cos(Math.abs(span.turn) / count / 2)) : 0;
    for (let i = 1; i <= count; i++) {
      const end = stationOn(span, span.startM + span.lengthM * i / count);
      const start = stations.at(-1);
      stations.push(end);
      // Add the maximum arc-to-chord distance to the ballast half width.
      segments.push({a: [start.x, start.z], b: [end.x, end.z],
        startM: start.distanceM, endM: end.distanceM, radius: HALF_BED + pad});
    }
  }
  return {lengthM, spans, stations, segments};
}

export function pointToRailwaySegment(point, a, b) {
  const [dx, dy] = offset(a, b);
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  return distance(point, [a[0] + t * dx, a[1] + t * dy]);
}

export function railwaySegmentDistance(a, b, c, d) {
  const ab = offset(a, b), cd = offset(c, d);
  const determinant = cross(ab, cd);
  if (Math.abs(determinant) > EPS) {
    const ac = offset(a, c), s = cross(ac, cd) / determinant, t = cross(ac, ab) / determinant;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) return 0;
  }
  return Math.min(pointToRailwaySegment(a, c, d), pointToRailwaySegment(b, c, d),
    pointToRailwaySegment(c, a, b), pointToRailwaySegment(d, a, b));
}

export function railwaySegmentBounds(segment) {
  const {a, b, radius} = segment;
  return [Math.min(a[0], b[0]) - radius, Math.min(a[1], b[1]) - radius,
    Math.max(a[0], b[0]) + radius, Math.max(a[1], b[1]) + radius];
}

export function assertRailwaySeparation(routes) {
  const bins = new Map();
  for (const {id, plan} of routes) {
    for (const segment of plan.segments) {
      const [west, north, east, south] = railwaySegmentBounds(segment).map(value => Math.floor(value / 4));
      const checked = new Set();
      for (let y = north; y <= south; y++) for (let x = west; x <= east; x++) {
        const key = `${x},${y}`, bin = bins.get(key) ?? [];
        for (const other of bin) {
          if (checked.has(other)) continue;
          checked.add(other);
          // Adjacent parts of one continuous track naturally share ballast.
          // With the fixed radius, 3 m along that track exceeds the 2 m bed width.
          if (other.id === id && segment.startM - other.segment.endM < 3) continue;
          const b = other.segment;
          if (railwaySegmentDistance(segment.a, segment.b, b.a, b.b) <= segment.radius + b.radius + EPS) {
            const where = segment.a.map(n => Math.round(n)).join(', ');
            if (other.id === id) throw new Error(`Railway route ${id} crosses or doubles back near ${where}. Separate the two approaches.`);
            throw new Error(`Railway route ${id} crosses or is too close to ${other.id} near ${where}. Leave room for both 2 m ballast beds.`);
          }
        }
      }
      const entry = {id, segment};
      for (let y = north; y <= south; y++) for (let x = west; x <= east; x++) {
        const key = `${x},${y}`;
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push(entry);
      }
    }
  }
}

export function planRailwayRoute(waypoints) {
  const plan = fit(waypoints);
  assertRailwaySeparation([{id: 'preview', plan}]);
  return plan;
}
