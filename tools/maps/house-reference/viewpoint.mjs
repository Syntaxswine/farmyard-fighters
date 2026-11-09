// Where a person stands to look at a building in Google Maps Street View, and
// the satellite view above it. house-reference.json plans one for each game
// building OSM maps, and county-buildings.json one for each building the county
// sketched that OSM lacks. Town east/south metres; the URLs are keyless links,
// and nothing here requests imagery.
import {bounds, gridIndex, nearestOnPolyline} from './geometry.mjs';
import {headingDegrees} from './projection.mjs';
import {isOsm} from './features-digest.mjs';

const r2 = v => Math.round(v * 100) / 100, r1 = v => Math.round(v * 10) / 10;
export const VIEW_ROADS = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link',
  'residential', 'unclassified', 'living_street']);
export const VIEW_RADIUS_M = 90, ADDRESS_NEAR_M = 45, ADDRESS_SLACK_M = 25;

const ORDINALS = {FIRST: '1ST', SECOND: '2ND', THIRD: '3RD', FOURTH: '4TH', FIFTH: '5TH', SIXTH: '6TH', SEVENTH: '7TH',
  EIGHTH: '8TH', NINTH: '9TH', TENTH: '10TH', ELEVENTH: '11TH', TWELFTH: '12TH'};
const TYPES = {AVENUE: 'AVE', STREET: 'ST', ROAD: 'RD', DRIVE: 'DR', COURT: 'CT', PARKWAY: 'PKWY', BOULEVARD: 'BLVD',
  LANE: 'LN', PLACE: 'PL', CIRCLE: 'CIR', TERRACE: 'TER', HIGHWAY: 'HWY', TRAIL: 'TRL'};
const DIRECTIONS = {NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W'};
// After these a trailing number or letter is a unit; after RD or HWY a number is the route ("STATE RD 19", "US HWY 441").
const UNIT_AFTER = new Set(Object.values(TYPES).filter(t => t !== 'RD' && t !== 'HWY')), STREET_TYPES = new Set(Object.values(TYPES));
const UNIT_TOKEN = /^(\d+[A-Z]?|[A-Z])$/, COMPASS = new Set(['N', 'S', 'E', 'W']);
// "East 5th Avenue" and "412 E FIFTH AVE" both become {full: 'E 5TH AVE', base: '5TH AVE'}.
// Neither a unit ("# 14", "APT 102", "APT101", "UNIT A", a trailing "10" or "10-A")
// nor a house-number suffix ("112-D", "142A/B") is part of the street. A unit
// word starts a unit only before a unit number or letter, so "STE CLAIRE ST" and
// "UNIT RD" stay streets. A direction written last ("620 HIGHLAND ST N") or glued
// on ("325 E3RD AVE") moves to the front. An address without a street type
// ("460 N GRANDVIEW") still matches no road.
export function streetKey(name) {
  if (!name) return null;
  const words = name.toUpperCase().replace(/\s*(#|\b(UNIT|APT|STE|SUITE)\.?(\s*#?\s*(?=[A-Z]?\d)|\s+(?=[A-Z]\b))).*$/, '')
    .replace(/^\s*(\d+[A-Z]?)[-/][A-Z0-9]+(?=\s)/, '$1').replace(/\b([NSEW])(\d+(ST|ND|RD|TH))\b/g, '$1 $2')
    .replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  while (words.length && /^\d+[A-Z]?$/.test(words[0]) && !/^\d+(ST|ND|RD|TH)$/.test(words[0])) words.shift();
  const norm = words.map(w => ORDINALS[w] || TYPES[w] || DIRECTIONS[w] || w);
  if (norm.length > 2 && COMPASS.has(norm.at(-1)) && STREET_TYPES.has(norm.at(-2))) norm.unshift(norm.pop());
  // A lettered street ("AVENUE A", "W AVE A") has no name before its type, so its letter stays.
  const type = norm.findLastIndex(w => UNIT_AFTER.has(w)), named = norm.slice(0, Math.max(0, type)).some(w => !COMPASS.has(w));
  if (named && type < norm.length - 1 && norm.slice(type + 1).every(w => UNIT_TOKEN.test(w))) norm.length = type + 1;
  if (!norm.length) return null;
  const base = norm.filter((w, i) => !(i === 0 && ['N', 'S', 'E', 'W'].includes(w) && norm.length > 1));
  return {full: norm.join(' '), base: base.join(' ')};
}

// The mapped roads a camera can stand on, indexed for nearby search. The line
// is the one the features pin covers (features-digest.mjs).
export function viewRoads(features) {
  const line = f => f.geographicGeometry ?? f.geometry;
  const roads = features.filter(f => isOsm(f) && f.category === 'road' && line(f).type === 'LineString').map(f => ({
    id: f.id, name: f.tags.name || null, highway: f.tags.highway, line: line(f).coordinates, key: streetKey(f.tags.name)}));
  return {roads, index: gridIndex(roads.map(r => bounds([[r.line]])), 48)};
}

// The camera for one building: the nearest point on the addressed street, else
// the nearest public road, within VIEW_RADIUS_M of the outline's centre. `building` is
// {geometry (MultiPolygon rings), box, centre}; `stories` sets the pitch and
// `address` is the lot's situs address. Null when no road is in reach.
export function planStreetView({roads, index}, {geometry, box, centre}, {stories, address}, toLatLon) {
  const addressKey = streetKey(address);
  const near = index([box[0] - VIEW_RADIUS_M, box[1] - VIEW_RADIUS_M, box[2] + VIEW_RADIUS_M, box[3] + VIEW_RADIUS_M])
    .map(i => roads[i]).map(r => ({road: r, hit: nearestOnPolyline(r.line, centre)})).filter(x => x.hit.distance <= VIEW_RADIUS_M);
  const pick = list => list.sort((a, b) => a.hit.distance - b.hit.distance || a.road.id.localeCompare(b.road.id))[0];
  // "W 5TH AVE" must not snap to East 5th Avenue: the full name wins, then the base name.
  const onAddress = addressKey && (pick(near.filter(x => x.road.key?.full === addressKey.full))
    || pick(near.filter(x => x.road.key?.base === addressKey.base)));
  // The addressed street wins unless it is much farther than the nearest public
  // road (a way that stops short of the lot puts its nearest point far away).
  const nearestPublic = pick(near.filter(x => VIEW_ROADS.has(x.road.highway)));
  const addressOk = onAddress && (onAddress.hit.distance <= ADDRESS_NEAR_M || onAddress.hit.distance <= (nearestPublic?.hit.distance ?? Infinity) + ADDRESS_SLACK_M);
  const chosen = (addressOk && onAddress) || nearestPublic || pick(near.filter(x => x.road.highway === 'service')) || pick(near);
  if (!chosen) return null;
  const v = chosen.hit.point, [lat, lon] = toLatLon(v[0], v[1]), heading = Math.round(headingDegrees(v, centre)) % 360;
  // Fit the outline's angular width as seen from the viewpoint, with margin.
  const angles = geometry[0][0].map(p => Math.atan2(p[0] - v[0], -(p[1] - v[1])) * 180 / Math.PI - heading).map(a => ((a + 540) % 360) - 180);
  const fov = Math.round(Math.max(35, Math.min(100, (Math.max(...angles) - Math.min(...angles)) * 1.25 + 10)));
  const pitch = Math.min(20, 5 + 4 * Math.max(0, (stories || 1) - 1));
  const ll = `${lat.toFixed(6)},${lon.toFixed(6)}`, line = chosen.road.line, seg = chosen.hit.segment;
  // Metres along the road polyline, so a survey can walk one side of a street in order.
  let along = Math.hypot(v[0] - line[seg][0], v[1] - line[seg][1]);
  for (let i = 0; i < seg; i++) along += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
  return {viewpoint: [Number(lat.toFixed(6)), Number(lon.toFixed(6))], town: v.map(r2), heading, pitch, fov,
    road: chosen.road.name, roadId: chosen.road.id, roadClass: chosen.road.highway, alongM: r1(along), distanceM: r1(chosen.hit.distance),
    onAddressedStreet: Boolean(addressOk && chosen === onAddress),
    url: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}&heading=${heading}&pitch=${pitch}&fov=${fov}`};
}

// Roof shape reads best from above: the same building in Google Maps' satellite view.
export function aerialUrl(centre, toLatLon) {
  const [lat, lon] = toLatLon(centre[0], centre[1]);
  return `https://www.google.com/maps/@?api=1&map_action=map&center=${lat.toFixed(6)},${lon.toFixed(6)}&zoom=20&basemap=satellite`;
}
