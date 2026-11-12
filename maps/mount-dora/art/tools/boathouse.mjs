// The rules that draw a lidar roof over the water as a boathouse
// (maps/mount-dora/reference/lidar/water-roofs.json): each piece's roof, and the posts
// under them. build-playable.mjs applies them; tests/maps/mount-dora-boathouse.test.mjs
// checks them on made-up pieces.

// A piece takes the lidar's form where that is confident, by the buildings' own rule in
// build-playable.mjs (0.7), and is flat otherwise; an `other` roof (a shed, or a form the
// planes do not explain) is drawn flat. A pitched piece's pitch is held to the buildings'
// 12-40 degrees, and its ridge follows the lidar's bearing.
export const BOATHOUSE_ROOF = Object.freeze({forms: Object.freeze(['gable', 'hip', 'flat']), confidence: .7, pitchDeg: Object.freeze([12, 40]), fallbackPitchDeg: 20});

// Posts are inferred: at a piece's corners, insetM in, and at most gapM apart along each
// side. Posts within mergeM of each other are one post, standing to the highest eave it
// serves. A post that would stand on a pier deck slides along its side to the nearest
// place off the deck (stepM steps, nearer first, forward on a tie), up to slideM; past
// that it is left off.
export const BOATHOUSE_POSTS = Object.freeze({gapM: 6, radiusM: .15, insetM: .2, mergeM: 1, slideM: 3, stepM: .1});

// The roof the kit draws for one piece: roof-core's `style`, its `pitch`, and `axis`
// ('x' runs the ridge along the outline's first side, as the kit fits the outline).
export function pieceRoof(piece, rules = BOATHOUSE_ROOF) {
  const style = rules.forms.includes(piece.form) && piece.confidence >= rules.confidence ? piece.form : 'flat';
  if (style === 'flat') return {style, pitch: 0};
  const [lo, hi] = rules.pitchDeg, roof = {style, pitch: Math.max(lo, Math.min(hi, Math.round(piece.pitchDeg ?? rules.fallbackPitchDeg)))};
  if (Number.isFinite(piece.ridgeBearingDeg)) {
    // Bearings run clockwise from north and town y runs south: a bearing b points (sin b, -cos b).
    const [a, b] = piece.outline, e = [b[0] - a[0], b[1] - a[1]], t = piece.ridgeBearingDeg * Math.PI / 180;
    roof.axis = Math.abs((e[0] * Math.sin(t) - e[1] * Math.cos(t)) / Math.hypot(...e)) >= Math.SQRT1_2 ? 'x' : 'y';
  }
  return roof;
}

// Whether a point lies within `margin` of a pier piece's drawn deck: its full width, from
// the mitred run-on before its start to the run-on past its end (deck.extend). It is the
// rule the game answers with (manifest.js deckCovers); the art tests hold the two together.
export function onPierDeck(q, pier, margin = 0) {
  const [a, b] = pier.ends, dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy), [before, after] = pier.deck?.extend ?? [0, 0];
  if (!length) return false;
  const along = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / length, across = Math.abs((q[0] - a[0]) * dy - (q[1] - a[1]) * dx) / length;
  return Math.hypot(Math.max(-before - along, 0, along - length - after), Math.max(across - pier.width / 2, 0)) <= margin + 1e-9;
}

// The posts under a roof's pieces ({outline, eaveM}): [[east, south, top]], with how many
// slid off a deck (`moved`) and how many found no place off it (`leftOff`). `onDeck(point)`
// says whether a post there would stand on a pier deck; `round` rounds a coordinate.
export function boathousePosts(pieces, onDeck, rules = BOATHOUSE_POSTS, round = v => v) {
  const posts = [];
  let moved = 0, leftOff = 0;
  for (const piece of pieces) {
    const ring = piece.outline.slice(0, 4), c = [ring.reduce((n, q) => n + q[0], 0) / 4, ring.reduce((n, q) => n + q[1], 0) / 4];
    const inset = ring.map(q => { const d = Math.hypot(c[0] - q[0], c[1] - q[1]); return [q[0] + (c[0] - q[0]) * rules.insetM / d, q[1] + (c[1] - q[1]) * rules.insetM / d]; });
    for (let k = 0; k < 4; k++) {
      const a = inset[k], b = inset[(k + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / rules.gapM));
      const at = t => [round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t)];
      for (let i = 0; i < n; i++) {
        let q = at(i / n);
        if (onDeck(q)) {
          let free = null;
          for (let step = 1; step * rules.stepM <= rules.slideM + 1e-9 && !free; step++) for (const sign of [1, -1]) {
            const t = i / n + sign * step * rules.stepM / len;
            if (t >= 0 && t <= 1 && !onDeck(at(t))) { free = at(t); break; }
          }
          if (!free) { leftOff++; continue; }
          q = free; moved++;
        }
        const same = posts.find(o => Math.hypot(o[0] - q[0], o[1] - q[1]) < rules.mergeM);
        if (same) same[2] = Math.max(same[2], piece.eaveM); else posts.push([...q, piece.eaveM]);
      }
    }
  }
  return {posts, moved, leftOff};
}
