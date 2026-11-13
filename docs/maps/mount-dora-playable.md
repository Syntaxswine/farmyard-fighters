# Mount Dora walking tour

The playable integration starts from released Farmyard `75a6b61` and the
reviewed Nautilus `2502646482218524fd5129641da769bb82462e4d`. The runtime and
production artwork are implemented on separate branches and reviewed together.

## Enter the town

Open [the Mount Dora walking tour](https://syntaxswine.github.io/farmyard-commando/game.html?activity=mount-dora),
choose an animal and loadout, and select **Deploy Solo**. The operation selector
also contains **Mount Dora walking tour**. Walk with the joystick, WASD or arrow
keys; tap nearby ground to route there. **Options → Visit landmark** moves to a
cleared approach for a quicker look, while ordinary travel remains continuous.

The town has no guards or extraction requirements. Weapons, grenades, reloads,
health/fire and AP turns use the same production gameplay as other operations.
Use **Options → Aim firearm at a point** to fire without an opponent. Buildings retain
their closed exterior collision, and water is passable only on the mapped
supported routes. **Resume walking tour** restores the tour's own position,
animal, equipment and explored area without replacing an operation checkpoint.
The renderer keeps a moving 3 × 3 window of 24 m blocks; the underlying town
spans 6 × 7 sectors of 240 m each. This is an exterior approximation on flat
terrain, rather than surveyed interiors or elevation.

## Coordinate and physical contract

Buildings now follow **one-metre tile edges**. Shared building groups are fitted
together, retaining both courtyard holes and all 30 shared-owner relationships.
`authored-buildings.json` supplies the native walls, floor/upper masks, artwork
and collision. Each building retains its original `geographicGeometry` alongside
its authored geometry in `features.json`. Straight downtown streets and their
frontages now share whole-metre lines. Curved roads retain their authored bends.
The depot moved with its street and is 6.75 m from its geographic centre.
The relocated façade was reviewed against May 2025 Street View on November 10,
2026. The east eave projects 0.4 m and leaves 4.6 m to the painted Alexander
Street sidewalk. The south and west eaves finish at the wall face beside the
service lane. The reviewed trim, roof and windows are documented in the
[art sources](../art/mount-dora/production-sources.json).

The lakefront adds 19 source-mapped piers raised 0.4 m on AFT timber trellises,
including the reviewed Rusty Anchor T junction. The disused railway uses the
pinned Nautilus visual kit. These additions use the same streamed tour terrain
and collision checks as the rest of town.

The retention plan in `maps/mount-dora/source/retained-mature-trees.json` records
all 52 mature pines and 54 mature broadleaves from the prior release. Three
trunks moved to clear nearby sites by at most five metres. The other 103 use
their original coordinates, and each keeps its original model variant.

The November 12 integration adds 3,802 trees in canopy gaps identified in the
December 2018 LiDAR, with the existing mature specimens retained. Thirteen
roofs over the lake use the measured roof pieces and eave heights. Their
supports are inferred, with posts placed clear of mapped pier decks. The
revised pier corners and body-based walking height are checked through the
production tour, including the roof fade under the Rusty Anchor covered pier.

Five open stage/shelter decks also use integer-edge plans. The mapped Palm
Island pavilion has bridge support under its deck and a clear connection to the
original boardwalk. The round lighthouse and curved architectural ornament
remain curved. Native engine geometry and painted source assets are unchanged.

Map and artwork share an authored-layout digest; mixed versions request a reload.
If a changed shell encloses an old checkpoint, resume selects a clear outdoor
approach nearby (or the validated Donnelly Park spawn) and reports the relocation,
preserving heading, equipment, resources, exploration, distance and elapsed time.

Geographic/art records remain in town east/south metres. Farmyard preserves its
existing integer-centred gameplay tiles: **game = town − (0.5,0.5)**. Apply that
conversion once to art, art solids, visit positions and markers. Native wall-run
endpoints already contain it; add only their sector origin. The lighthouse is
town `(500.2877,1169.7989)`, game `(499.7877,1169.2989)`.

A native block-window rectangle becomes town bounds
`[window.x,window.y,window.x+window.w,window.y+window.h]`. Keep complete objects
whose bounds intersect that rectangle, even if their anchors lie outside it.
Physics and source identities remain independent of rendering residency.

The production art manifest separates three collision policies:

- `retain-source-walls`: closed mapped buildings retain exact native wall
  collision. Their duplicate art footprint polygons do not add another solid.
- `replace-source-walls`: mapped open shelters remove their closed native proxy
  walls and upper/roof visuals, retain ground/decks, and use actual support
  parts. A shared wall survives if an unreplaced owner still needs it.
- `additional-solids`: lighthouse, posts and boardwalk rails supplement the
  existing source. Their shapes and mesh placements share one source record.

Building facade replacement also removes the corresponding native wall/upper
visual proxies. Court markings and facade decoration do not reserve walkable
ground. Existing wall queries and panel geometry are reused from the immutable
Nautilus source, with the original 0.16 m thickness, 2 m wall body and 2.12 m
story pitch.

## Independent outdoor route evidence

`maps/mount-dora/playable/route-fixtures.json` records a source-backed Donnelly
Park spawn, ten approaches, all eleven internal north/south or east/west sector
boundary lines, and a four-sector loop at Donnelly Park. It also records an
unobstructed approach beside the source building crossing B03/C03 and a probe
that must be stopped by that building's wall.

The audit reuses the **exact original** `wallRunsIntersect` implementation with
the game's 0.23 m animal radius. It checks outdoor native terrain, excludes
water and closed building interiors, and conservatively reserves vegetation
anchor cells. All **39 land sectors** are in one reachable outdoor component.
The Palm Island approach lies on a mapped bridge/wood route over the source
lake polygon, rather than merely on a wooden path on land.

The fixture also retains both original boardwalk centre lines. Production side
rails can legitimately intersect a source-only grid route that hugged the deck
edge. Validate movement through the actual lane and its joins; the old grid
turn points are not an instruction to cross a rail. Early geometry checks found
the mapped centre lines clear at the 0.23 m animal radius.

This is reference geometry evidence, not proof of the finished runtime. Final
tests must apply production landmark supports, loading failures, scene/resource
retirement and save/resume. Route fixtures must be walked through the real
movement rules; teleporting to their destinations is not a seam-travel test.

To reproduce the source audit, supply the immutable wall helper (SHA-256 is
checked before import):

```powershell
node tools/maps/review-mount-dora-routes.mjs --wall-module PATH_TO_EXACT_WALL_RUNS_JS
```

The helper is `packages/map-core/wall-runs.js` at the revision above; the
artifact snapshot used during review is byte-identical to that Git object.

The production collision audit runs those outdoor approaches and their return
journeys through the game's actual `Core.travel`, including the native wall
slabs, terrain, vegetation and production landmark solids. It follows both
complete original boardwalk centre lines in both directions, rather than
following the old grid route through a side rail. It asserts source/cache caps,
equipment preservation and teardown. Run:

```powershell
node tools/maps/review-mount-dora-travel.mjs
```

The report is written to `artifacts/mount-dora-playable/integrated-travel.json`.
This is continuous physical travel evidence; actual controls, rendering, visits,
loading failures and save/resume have a separate native browser acceptance run.

## Building references

Street View extraction is not part of the asset pipeline. Google's published
[Geo Guidelines](https://about.google/brand-resource-center/products-and-services/geo-guidelines/)
restrict creating data from Street View imagery. Actual facade observations
instead use the city's [historic-preservation material](https://mountdora.gov/282/Historic-Preservation),
the [Mount Dora Archives](https://www.mountdoraarchives.com/), and official
property references such as [Lakeside Inn](https://lakeside-inn.com/about-us/).

The artist records observation separately from inferred dimensions, roof forms
and ordinary house typology. Original footprints remain geographic references;
the playable version uses the declared grid generalization and preserves holes.
Historical photographs are not a survey of current buildings or
interiors. Reference photographs are not embedded as game textures.

Every placed door must be an operational production interaction, including collision, normal costs and persistence. The current geographic dataset contains no authored verified entrances, so this change adds no guessed doors to Mount Dora. Editor-placed doors in supported imported maps now reach the same production door system. See the project authoring rules in `AGENTS.md`.
