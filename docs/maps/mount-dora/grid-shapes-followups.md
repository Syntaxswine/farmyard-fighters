# Mount Dora grid shapes: room for improvement

Notes left with PR #1 ("Mount Dora: straight grid streets, clean building
walls, storefronts in line"). Its reviews stopped at round 3 (8/10, nothing
must-fix), by the owner's decision on 2026-11-09. Nothing here is done; each
item says where it lives and how it was measured.

## Decisions waiting on the owner

- **Houses as separate assets.** The owner's direction is to build each house
  on its own square grid and reference it into its finished place, turned to
  fit its road. The house parts (`maps/mount-dora/parts/`) already carry their
  own grid and a true pose, but today they are cut out of the town after the
  fit (`placements.true.basis`: "the inverse of the grid fit"). The proposed
  order:
  1. Build each house on its own square: its outline turned by its true
     angle, with the steps straightened there.
  2. Tie the house to the street it faces: station, setback and angle.
  3. Straighten the street.
  4. Place the house back from it.
  Step 2 replaces today's blended town-wide move for buildings. The rework
  touches Codex's house-parts tools, which would read the parts rather than
  write them.
- **The reference for judging it.** The owner supplied map and satellite
  screenshots of downtown, north and south (Google Maps, 2026-11-09). They
  are a way of seeing the town: judge the output against them block by block
  (house count, orientation, setback, which way a house faces its street) and
  let them guide where the fabrication needs care. Nothing is traced from
  them; geometry still comes from the OpenStreetMap and county sources.
- **Streets that turn off the grid.** South Tremain, the Claytons, the
  Highlands, Grandview and Simpson change line across one segment as a
  diagonal: 14 places, 633 m. The 5 m snap makes these line changes larger
  than main's. South Tremain moves 12 m over 26 m, a 25° kink where its source
  moves 5 m; South Highland moves 11 m over 99 m. With houses placed from
  their streets, each street could take one line and its houses turn with it.
- **Re-review.** The `needsReview` fields in `authored-buildings.json` record
  plans that moved after their first review. The former depot, now 6.753 m
  from its geographic centre (6.195 m at the first review), received a façade
  and sidewalk review on November 10, 2026. See the [walking tour notes](../mount-dora-playable.md).
  `osm-way-1240419485`, `osm-way-1240419511` and the diamond-shaped house
  `osm-way-560095904` below still need a look in the production game.

## The lakefront against the lidar

On 2026-11-09 the owner compared the game with a satellite view of Lake Dora
Road between W 5th and W 4th Avenue: "theres still quite a bit of disparity".
Checked against the 2018 USGS lidar already cached for the house work
(`artifacts/lidar/`, read with `loadPoints` from
`tools/maps/lidar/points.mjs`; box x 20–340, y 430–770), the gaps have
seven causes:

- **Turned houses.** The county outline of 330 Lake Dora Rd sits on its lidar
  roof (92% of it) at −35.6°, the road's angle. The grid fit draws it as a
  16-corner staircase. Map-wide, 42 buildings stand 10° or more off the grid:
  12 are drawn as staircases and 30 are squared to the grid. Fix: houses as
  separate assets, above, placed at their true angle with angled wall runs.
- **County sketches can leave parts out.** 320 Lake Dora Rd, a duplex, is
  sketched as two blocks joined by a 1.2 m neck. The lidar roof joins them
  and continues east of the sketch.
- **Piers are never drawn.** `category()` in `tools/maps/build-mount-dora.py`
  has no case for `man_made=pier`, so all 19 mapped piers fall into
  "context", which is never painted. That includes the T-dock, the Mount Dora
  Dock and its slips, and the Rusty Anchor's dock. The brown stubs at the
  shore are footpaths cut off at the waterline. *Drawn on the stacked branch
  `claude/mount-dora-piers-rail`.*
- **Roofs over the water.** Where our map has open water, the lidar sees
  about 800 m² of roof: boathouses and covered slips. It also sees a roofed
  structure at the T-dock's shore end. No OpenStreetMap or county outline
  exists for any of them. *Drawn on the stacked branch
  `claude/mount-dora-lidar-trees`: 13 roofs map-wide, with the marina's four
  slip rows and the T-dock's hip roof among them. About 300 m² of that 800
  turned out to be shore houses' own roofs (below).*
- **The tree belt.** Between Lake Dora Road and McDonald Street, unclassified
  returns 2.5 m or more above the ground cover 2,936 of 5,423 m² (54%). This
  vendor has no vegetation class, and a little of that area is overhead wire.
  Our map has 1 tree and 1 bush there, because greenery is seeded by
  declared density rather than placed from evidence. *Planted on the stacked
  branch `claude/mount-dora-lidar-trees`: a tree in each lidar crown the seeded
  greenery leaves empty, 186 of them in the box and 3,802 map-wide.*
- **The railway.** The Sorrento Subdivision runs between the road and the
  trees. OpenStreetMap tags it `railway=disused`, but the rails still show.
  As "context" it is never drawn. *Drawn on the stacked branch
  `claude/mount-dora-piers-rail`, with the Nautilus railway kit.*
- **Diagonal ground.** Lake Dora Road's centreline is OpenStreetMap's own,
  but terrain is one material per 1 m tile, so its edges step every metre.
  Walls can turn; ground cannot. A smooth road surface would have to be drawn
  over the tiles.

Drawing the roofs over the water and planting the crowns turned up seven more
gaps:

- **Lake Dora's OSM outline is off the lidar's water by 5–10 m** along parts
  of the shore.
  - Three boathouses stand in lidar water, mostly outside the outline, so the
    game draws land under them: 5 pieces in all (`lakeShare` under 0.5 in
    water-roofs.json). One is at x 120–129, y 572–577; the other two are at
    x 197–217, y 748–788.
  - Three more pieces are part on land, 0.53–0.72 of each in the outline: at
    x 109–121, y 539–551; the marina's walkway (x 558–581, y 961–970); and the
    marina's north-west piece (x 496–508, y 961–970).
  - North of them, at x 0–130, y 360–520, the outline reaches inland over the
    shore houses.
  - Fix: take the shoreline from the lidar's water (class 9, and calm water
    with no returns).
- **Shore houses' roofs run past their county sketches toward the water.**
  These are wings, porches, and perhaps attached boathouses. The largest is
  about 300 m² at x 30–65, y 405–440, behind four county sketches. They join
  the drawn houses' roofs, so they stay with them, under "County sketches can
  leave parts out" above.
- **A long low roof on the marina's east shore** at x 578–590, y 975–1020
  (12 × 45 m, eave about 3.1 m) joins the slips' walkway. It stands on the
  shore, not over water: what the lidar reads round its main piece is 0.664
  water, short of the 0.75 a piece over water needs. No outline draws it.
- **A taller roof at the marina's north-west corner** at x 503–508,
  y 955–962 (eave about 5.1 m) stands on land. No outline draws it.
- **Roofs over the water the vendor left unclassified** are missing from the
  water roofs: they have no building returns.
  - At x 61–67, y 631–642 (about 69 m², 3.6 m up), the aerial view shows a
    white roof where two docks meet. It stops the scanner like a solid, so
    crowns.json lists it among `notFoliage` (multiShare 0.047).
  - Centred at x 61, y 464 (35 m², 4.25 m up), the aerial view shows a white
    roof at the end of a dock. Its crown reads 0.118 as a whole, just over the
    0.1 line, so crowns.json keeps it as a crown. Over the water it gets no
    tree.
  - A shelter on the Palm Island boardwalk, white-roofed in the aerial view,
    has its crown's top at x 323, y 1450 (145 m²; 0.19 as a whole, its top
    0). No OSM, county or authored outline draws it.
  - Of the 124 crowns centred inside the lake's outline, 5 have a top that
    stops the scanner. At least three of the five are roofs:
    - the roof at x 61, y 464;
    - the Palm Island shelter;
    - the edge of the drawn Palm Island Parkway Pavilion, whose crown's top is
      at x 569, y 1390 (0.153) and its centre is over the lake.
  - A marsh thicket at x 576, y 1639 reads 0.103, lower than all three roofs
    (0.118–0.19). No whole-crown bar separates them, so the roof rule
    (`roofTops`) is not extended to the lake. None of these crowns carries a
    tree.

  Drawing them would take a rule for unclassified roofs over water.
- **Water-roof pieces sitting on a bar.** A few pieces are kept or left out by
  a share within 0.05 of its bar, counted in grid cells (water-roofs.json
  `nearBar`):
  - the marina's walkway, kept by its outline share of 0.53. It is left out
    when the registration moves 0.2 m or more north: due north at every
    distance tried up to 1.0 m, and at 0.2 m north with x −0.1 or −0.2.
    It stays at a few offsets that also move it east: 0.2 m north with
    x +0.1 or +0.2, and 0.3 m north with x +0.2. The sectors' disagreement is
    0.22 m at the median and 0.71 m at worst.
  - roofs 2 and 7, kept by their rings' water (0.788 and 0.787 against 0.75).

  A shoreline taken from the lidar's water instead of OSM, as the first item in
  this list proposes, would give the walkway a share the registration does not
  move. It may still sit on the line: about half of what the lidar reads round
  it is dry.
- **Two lidar trees may stand on roofs the vendor left unclassified.** The
  roof rule in crowns.json (`roofTops`) takes out only crowns centred inside an
  outline the game draws: Dora Villa's. Two crowns that carry lidar trees read
  the same way, but neither is centred on a drawn outline:
  - x 1230, y 1421 (65 m², 8.2 m, in F06). The aerial view shows a house there.
    Its top is 9.3 m from the nearest drawn outline (osm-way-1240416234).
  - x 1145, y 704 (10.5 m², 5.6 m, in E03), at the west edge of a building in
    woods, 4.4 m from osm-way-1240419519.

  Each has a top that stops the scanner (topShare under 0.1), reads under 0.15
  as a whole, and has under 5% ground among the returns beneath it. A building
  missing from OSM and the county records, or an outline off its roof, would
  explain both. Check them against the parcel records.

## Known shape and placement limits

- **Long clusters drift from their own field.**
  - Buildings within 1.5 m chain into one cluster, and the cluster takes the
    field at its overall centre.
  - Of the buildings, 68 move more than 0.5 m from the field at their own
    centre (per axis), 17 more than 0.75 m, and 7 more than 1 m.
  - The worst is `osm-way-557349885`: it moves (+1, 0) where its own field is
    (−0.61, −0.35), in a cluster about 100 m long.
  - Setbacks shift by the same amounts.
  - Fix: cap a chain's span where no party wall joins it, or split a chain
    whose field varies.
- **The diamond house turned 90°.** `osm-way-560095904`, a 45° house:
  - main fits it north–south, 13 × 21 m; this PR fits it east–west, 21 × 12 m,
    with area −6.8% and a further move of (−5, 0);
  - after the street move, the turned fit scored better than the original
    orientation pushed clear;
  - the comment in `sites/tactical-animal/tests/mount-dora-grid.test.mjs`
    ("the rectangle moved with its streets") hides the turn.
- **Shapes against main.** 927 buildings are exact translations of main's
  fit. Of the 149 that differ:
  - 132 changed by straightening alone;
  - 17 were refitted beside a moved street, 4 of those also straightened.
  - Main's 299 one-tile wall steps are down to 3, each pinned with its reason;
    8 street fronts stay off their line, each blocked.
  - The 19 one-tile slots between buildings are all inherited from main.
- **The field near South Tremain.** 9 places on a 2 m lattice jump more than
  0.75 m, up to 1.2 m, all at its line change and where it meets Liberty
  Avenue.
- **Street widths.** Streets are Codex's standard 6 m with 2 m sidewalks, so
  downtown storefronts stand 3–4 m back from the game sidewalk.

## Code and test gaps

- **A hole in the neighbour rule.** `_keeps_neighbours`
  (`tools/maps/mount_dora_grid.py`) exempts slots to a neighbour the building
  already touches (`- touch_before`). A building touching an L-shaped
  neighbour can move and open a one-tile slot to its other arm. No output
  depends on the exemption; dropping it matches the docstring.
- **Mechanisms no test pins.** A mutant of each changes no output:
  - the nudge base (`group['families'][:1]`, so nudges cannot stack);
  - the shelter water guard: the over-water deck stays put by the shore pull
    anyway;
  - the touch exemption above;
  - `streetFollowExactMetres` recording: if it recorded the whole move, the
    near-pair tests would become tautologies.
- **Stale wording.** These still say the approach points "move with the town
  where they stand"; since fd0bae6 they are anchored to landmarks
  (`APPROACH_ANCHORS`):
  - `maps/mount-dora/README.md`;
  - the comments on `APPROACH_POINTS` and `vegetation_clearings` in
    `tools/maps/build-mount-dora.py`;
  - `tools/maps/mount_dora_patrols.py`.

  Also, `mount_dora_grid.py` still mentions the fractional retry ("unless the
  fit needed the exact move"), which is gone.
- **Nits.**
  - A plan nudged with no street move would read "moved with its street by
    whole metres (0,0)".
  - The depot limitation text ignores `needsReview`.
  - `near < gap` would silently shrink clusters.
  - The cleared strip south of the Art Centre is keyed to the launch's move.
  - `_component_centre` and `UnresolvedLayout.ids` are unused.
  - `componentCentre` round-trips floats (52.849999999999994).
  - The shopfronts test uses the generator's own `street_line`.
  - House parts keep the re-review note but drop `needsReview`:
    `tools/maps/house-parts/house-parts.mjs` copies a fixed list of
    derivation fields.

## CI

- **The workshop job times out, on main too.** "Validate all final geographic
  sectors when present" (`tools/test-mount-dora-workshop.mjs`) waits up to
  30 s for each sampled sector to load in the 3D editor.
  - In CI it timed out at C05 on 8af2b29, and at A01 on ac434ea and fd0bae6,
    after the earlier sectors passed.
  - On one Windows machine, main 57887f1 and fd0bae6 behave the same: both
    pass C03 and time out at C05. So it predates this PR.
  - Next: find why a sector takes so long to load under software WebGL, then
    raise the wait or lighten the load.
- **The walkthrough job fails on main too.** Its browser tests read
  pre-Fighters save keys and look for a `Fire ·` button the real-time HUD
  lacks. A separate task covers the repair.
- **The deploy gate was not run.** `pages.yml` runs `tools/test-realtime.mjs`
  before deploying; it drives guards 2, 14 and 32 and a tree trunk in B06.
  - B06 is identical to main, and guards 14 and 32 are unchanged.
  - Guard 2 moved 2 m east along its sidewalk row.
  - So the gate most likely passes, but it is unverified.
