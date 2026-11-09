// The Mount Dora town projection, ported from tools/maps/build-mount-dora.py
// (class Projection) so county records land on the same east/south metres as
// the OSM source. `toTown` matches the Python output to its 0.1 mm rounding;
// `toLatLon` inverts it by Newton iteration on the ellipsoid surface, so a
// round trip is exact to well under a millimetre.
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const round4 = v => Math.round(v * 1e4) / 1e4;

export function createProjection(definition) {
  const {lat, lon} = definition.reference;
  const a = definition.ellipsoid.semiMajorM, e2 = definition.ellipsoid.eccentricitySquared;
  const offset = definition.townOffsetM, p = rad(lat), l = rad(lon);
  const ecef = (latDeg, lonDeg) => {
    const pp = rad(latDeg), ll = rad(lonDeg), n = a / Math.sqrt(1 - e2 * Math.sin(pp) ** 2);
    return [n * Math.cos(pp) * Math.cos(ll), n * Math.cos(pp) * Math.sin(ll), n * (1 - e2) * Math.sin(pp)];
  };
  const origin = ecef(lat, lon);
  const enu = (latDeg, lonDeg) => {
    const [x, y, z] = ecef(latDeg, lonDeg), dx = x - origin[0], dy = y - origin[1], dz = z - origin[2];
    const east = -Math.sin(l) * dx + Math.cos(l) * dy;
    const north = -Math.sin(p) * Math.cos(l) * dx - Math.sin(p) * Math.sin(l) * dy + Math.cos(p) * dz;
    return [east, north];
  };
  // Unrounded town metres; the inverse iterates against this exact function.
  const town = (latDeg, lonDeg) => { const [e, n] = enu(latDeg, lonDeg); return [e + offset.x, -n + offset.y]; };
  const toTown = (latDeg, lonDeg) => { const [e, n] = enu(latDeg, lonDeg); return [round4(round4(e) + offset.x), round4(round4(-n) + offset.y)]; };
  const toLatLon = (x, y) => {
    const mPerDegLat = 111132.954, mPerDegLon = 111319.488 * Math.cos(p);
    let la = lat - (y - offset.y) / mPerDegLat, lo = lon + (x - offset.x) / mPerDegLon;
    for (let i = 0; i < 6; i++) {
      const [tx, ty] = town(la, lo);
      la -= (y - ty) / mPerDegLat; lo += (x - tx) / mPerDegLon;
      if (Math.abs(x - tx) < 1e-7 && Math.abs(y - ty) < 1e-7) break;
    }
    return [la, lo];
  };
  return {toTown, toLatLon, town};
}

// Compass heading (clockwise from north) from town point a to town point b.
export const headingDegrees = (a, b) => (deg(Math.atan2(b[0] - a[0], -(b[1] - a[1]))) + 360) % 360;
