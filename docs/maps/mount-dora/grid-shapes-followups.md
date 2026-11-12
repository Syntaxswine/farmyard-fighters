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
- **Re-review.** These plans moved since review and need a look in the
  production game:
  - the three reviewed plans (`needsReview` in `authored-buildings.json`):
    - the former depot `osm-way-557494933`, now 6.753 m from its geographic
      centre (6.195 m when reviewed);
    - `osm-way-1240419485`;
    - `osm-way-1240419511`;
  - the diamond-shaped house `osm-way-560095904`, below.

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
  shore are footpaths cut off at the waterline.
- **Roofs over the water.** Where our map has open water, the lidar sees
  about 800 m² of roof: boathouses and covered slips. It also sees a roofed
  structure at the T-dock's shore end. No OpenStreetMap or county outline
  exists for any of them.
- **The tree belt.** Between Lake Dora Road and McDonald Street, unclassified
  returns 2.5 m or more above the ground cover 2,936 of 5,423 m² (54%). This
  vendor has no vegetation class, and a little of that area is overhead wire.
  Our map has 1 tree and 1 bush there, because greenery is seeded by
  declared density rather than placed from evidence.
- **The railway.** The Sorrento Subdivision runs between the road and the
  trees. OpenStreetMap tags it `railway=disused`, but the rails still show.
  As "context" it is never drawn.
- **Diagonal ground.** Lake Dora Road's centreline is OpenStreetMap's own,
  but terrain is one material per 1 m tile, so its edges step every metre.
  Walls can turn; ground cannot. A smooth road surface would have to be drawn
  over the tiles.

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
