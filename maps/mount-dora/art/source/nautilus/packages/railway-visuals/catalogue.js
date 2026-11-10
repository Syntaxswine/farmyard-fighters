// Original visual pieces. Ports use engine coordinates [x, y, height] in metres.
export const RAIL_TRACK_PROFILE = Object.freeze({
  id: 'nautilus.railway.branch-line',
  version: 1,
  ballastWidthM: 2,
  ballastRiseM: .265,
  railCentresM: .9,
  railTopM: .43,
  tieIntervalM: .5
});

const port = (position, outward) => Object.freeze({
  position: Object.freeze(position),
  outward: Object.freeze(outward)
});

function piece(id, name, width, depth, radiusM, end, endHeading) {
  return Object.freeze({
    id, name, category: 'Railway', radiusM,
    lengthM: radiusM === null ? depth : radiusM * Math.PI / 2,
    dimensions: Object.freeze({width, depth, height: RAIL_TRACK_PROFILE.railTopM, metresPerUnit: 1}),
    ports: Object.freeze({
      start: port([0, 0, 0], [0, -1]),
      end: port(end, endHeading)
    }),
    source: Object.freeze({project: 'nautilus', profile: RAIL_TRACK_PROFILE.id, version: 1}),
    availability: 'shared-railway-renderer',
    entry: './assets/three',
    factory: 'createRailwayKit',
    guide: 'docs/railway-track-kit.md',
    note: 'Rounded gravel bed, timber ties and steel rails. The host owns train routes, collision and map placement.'
  });
}

export const RAIL_TRACK_ASSETS = Object.freeze([
  piece('railway:track-straight', 'Rail track · Straight', 2, 2, null, [0, 2, 0], [0, 1]),
  piece('railway:track-quarter-curve', 'Rail track · Quarter curve', 5, 5, 4, [4, 4, 0], [1, 0])
]);
