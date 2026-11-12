# Mount Dora downtown and lakefront

An editable geographic blockout for the existing **Nautilus map workshop**, pinned
to `2502646482218524fd5129641da769bb82462e4d`. It covers **1,440 × 1,680 metres** in
**42 adjoining 240 × 240 m sectors**: six columns, A–F, and seven rows, 01–07.
North is up. Columns go east and rows go south.

Start with [the geographic overview](atlas.svg), then use the
[sector atlas and workshop instructions](workshop/README.md). The atlas selects
and downloads individual sectors; its isolated review host can open them in the
actual pinned workshop. The maps are authoring documents, not a new Farmyard
combat operation. Opening a sector does not stream neighboring sectors into it.

The published [sector atlas](https://syntaxswine.github.io/farmyard-commando/maps/mount-dora/workshop/)
offers the geographic overview and JSON downloads. Direct opening is available
only on the matching isolated Nautilus review host. The older AFT designer
embedded in the game is not evidence that Nautilus wall-run extensions render.

## What is authored

- Roads and paths, the complete Lake Dora shoreline polygon, park and wetland
  areas, and 950 source building footprints, including courtyard holes.
- Public streets use a 6 m carriageway with 2 m sidewalks on both sides.
  Near-cardinal runs snap to metre lines, with shared junctions kept connected.
  Each straight street, and a pedestrian street on the grid (West 4th Avenue's
  block between McDonald and Alexander Streets), takes one line, chosen by its points inside
  the town and at most 5 m from the mapped line. Same-named runs that a short
  angled piece breaks apart share it. Where a street really turns off the
  grid (some in the east and southeast), it changes line across one segment,
  as a diagonal.
  Everything else moves with the streets around it, through one continuous
  field: each snapped street pulls toward its own move, the Lake Dora shore
  pulls toward none, and the pulls blend across each block and fade within
  200 m, so nothing tears where one street ends and a building keeps its
  setback. Buildings move by whole metres, a cluster of touching or nearly
  touching buildings together, so each keeps the shape the one-metre fit gives
  it; a reviewed plan that would then sit on a road takes up to two metres more.
  Park, pitch and car-park outlines move vertex by vertex and keep their
  measured outline as `geographicGeometry`; a park at most 120 m across moves
  as one piece with everything in it (`nativeShiftM`), blending into the town
  over the 10 m inside its edge. Bridges and boardwalks keep their mapped
  place, and so do the vertices other roads share with them; woods, wetlands,
  beaches and the lake keep the mapped shoreline. The tour's approach points
  move with the town where they stand (`approachMovesM` in `project.json`).
  The game camera looks north-up. Source road centerlines are retained in
  `features.json`, and paths, service lanes and boardwalks keep their own widths.
- Grid-aligned exterior walls, floors and upper masks. Ninety-three buildings
  cross sector boundaries; their source identities and wall geometry continue
  across the cuts without invented closing walls.
  The playable fit reserves the entire street corridor and a tile for facade
  clearance. The one-tile steps the fit's rounding left in measured outlines
  and courtyards are straightened, except where a repair would take a building
  below its area limit or open a one-tile slot beside a neighbour; a step in a
  party wall moves for both buildings together. Along one side of a street, a
  front within 2 m of its neighbours' common line moves onto it unless that
  move is blocked, and deeper setbacks stay. Original outlines and each
  adjusted footprint are recorded.
- Source-backed bridge and wooden boardwalk routes. Water is retained beneath
  these routes; park and vegetation fills do not manufacture land in the lake.
- All 19 mapped piers as wooden decks at their source place: bridge over the
  lake, planks on open ground, 2 m wide (OpenStreetMap records no width, so this
  is the boardwalk proxy). In 3D each deck stands 0.4 m over the water on AFT's
  timber trellis, cut down to fit beneath it (the owner's choice of a low deck;
  the 2018 lidar puts the real decks a median 0.43 m up). Where two deck lines
  meet, both run on to a mitred corner. A walker crosses only the cells whose
  centres lie within 0.75 m of a deck line (not past its free ends, round at its
  joints). They stand on a deck wherever their body (0.23 m) overlaps it, so at
  most 0.23 m beyond its edge on land and never inside it at ground height. On a
  deck cell over water they always stand on the deck, at most 0.27 m past its
  edge (at a free end); on the footbridge cell under pier 508450229's end, up to
  0.44 m. Segments
  mapped back over one another, such as the
  cross-docks mapped out and back (A-B-C-A), are drawn once along their chord.
  A pier leaves the paths that meet it alone. One reviewed observation adds a
  deck line: the owner's "the jog in the dock is a T intersection" at the Rusty
  Anchor (`source/authoring-config.json`, `pierObservations`). No railing is
  drawn; none is mapped.
- The disused Sorrento Subdivision railway, whose rails remain, as a 2 m gravel
  bed that moves with the town like the curved roads. Its 3D track is the
  Nautilus railway kit (`art/source/nautilus/packages/railway-visuals`) and
  stops short of every road, so the level crossings, the rail bridge over
  Tremain Street and the South Highland Street bridge over the line show the
  road. The main line runs through the Donnelly Siding's two switches; the
  siding stops about 18 m before each, where the two beds would meet.
- A common metre coordinate system, all 42 native JSON documents, neighbor
  references, source feature identities, raw input snapshots and reproducible
  generation records.
- AFT trees, shrubs and reeds dress mapped parks, woods, wetlands and open ground
  in residential areas. The native woodland brush paints undergrowth in woods
  and wetlands. Individual placements are seeded scenery. Then each tree crown
  the 2018 lidar saw with no trunk yet gets one tree near its top: 3,803 of
  6,969 crowns ([reference/lidar](reference/lidar/README.md#tree-crowns)). It is
  mature from 12 m tall, and a pine where the crown is twice as tall as it is
  wide. They go in after the sentries and markers, so neither moves.
- Roofs the lidar sees over Lake Dora with no OSM or county outline are drawn by
  the art kit as open roofs on posts: boathouses, covered slips and the
  marina's slip rows ([reference/lidar](reference/lidar/README.md#roofs-over-the-water)).
  The game's ground under them is unchanged: water inside Lake Dora's OSM
  outline, land where the lidar's water runs past it (6 pieces of 4 roofs).
- Mapped sports pitches exclude procedural trees. Tennis and pickleball polygons
  use a declared existing asphalt ground proxy without invented court markings;
  overlapping source records are retained rather than asserted as a current count.

**Thirty-nine sectors pass the existing native import contract.** A05, A06 and
A07 contain only lake water. Their geographic files are complete, but the
workshop refuses them because it requires four walkable squad starts and a
travel marker. The authoring data does not add fake platforms to bypass that
rule. The other sectors have five clearly identified authoring-validator
markers on connected existing walkable cells for editor validation: land, or in
B07 the Palm Island boardwalk and in C03 the Donnelly Park stage's planks. They lie in the same walkable area as the
sector's first sentry, because the validator walks between them within the
sector: A04's and C06's first cells in scan order are on pier decks that reach
land only in the next sector, so their markers stand on land. Forty-two sentries
start across the 39 land sectors. They hold posts, walk a street back and forth,
or follow a local circuit using the game's movement, combat and save systems.

## Scale, coverage and precision

Buildings are deliberately generalized to cardinal, integer-metre tile edges.
`authored-buildings.json` records the shared plans and fitting decisions; original
projected footprints remain in each building's `geographicGeometry`. Courtyard
holes and shared-wall groups are retained. The depot's reviewed plan was
relocated 6.2 m to keep its proportions while clearing the original streets; it
has since moved with its street to 6.75 m from its geographic centre and needs
re-review (`needsReview` in its record). Five open decks are
aligned too; the round lighthouse remains a point-feature exception.

The user's ruler measured approximately 1,480.5 m from the northern downtown
streets toward Palm Island. Seven 240 m rows leave room around those landmarks.
The screenshot's endpoints are not surveyed control points, so the source
geography is not stretched to fit the ruler exactly. `project.json` records the
calibration and the southern crop, including which Johns Avenue segments lie
outside it.

Coordinates use a WGS84 local tangent plane with east/south axes. Donnelly
Park's geocoding reference is town `(480,480)`; the named lighthouse source
point is `(500.2877,1169.7989)`. Source vectors retain sub-cell coordinates.
Terrain and floor masks sample one global 1 m grid before slicing it into
sectors, so adjacent maps use the same raster and origin. Legacy integer tile
centres are at sector origin plus `(x+0.5,y+0.5)`; wall endpoints account for that
offset once.

This is a geographic blockout, with **flat terrain and evidence-based building
heights**. Each building's storeys and wall material come from the best recorded
evidence in [reference/](reference/README.md): a survey answer, then the mapped
`building:levels` tag, then the Lake County record, then lidar, then the kit
default. `nativeProxy.storiesSource` and `materialSource` name the source, and
`nativeProxy.evidence` keeps the county, lidar and survey values. Storeys are whole
native-kit storeys, not measured wall heights; the evidence files are pinned in
`project.json` (`generation.evidenceInputs`). Besides the 950 OpenStreetMap
footprints, the town has 126 buildings OSM lacks. They come from Lake County
sketches, each placed on its 2018 lidar roof, with a structure's stacked or
attached units merged into one outline
([county-buildings.json](reference/README.md#county-buildings-the-game-lacked)).
Their ids start `county-`, and `county` on each says where it came from. Closed exterior proxies do not imply known doors,
rooms, roofs or accessible interiors. The grid layout has no unsupported wall
slivers. Incomplete residential land-use relations are
recorded and left unfilled. Proposed roads are retained as source references
and excluded from the terrain.

## Files and regeneration

| File | Purpose |
| --- | --- |
| `project.json` | Sector positions, neighbors, import status, hashes and assumptions |
| `features.json` | Source identities and projected vectors in local metres |
| `authored-buildings.json` | Canonical grid plans, open decks and fitting provenance |
| `sectors/*.map.json` | Native AFT v2 maps with bounded `mountDora` metadata |
| `source/authoring-config.json` | Projection, source selection and generation settings |
| `source/*-source.json` | Request URLs, retrieval times, licence and exact input hashes |
| `art/` | Landmark treatment references and native-renderer studies |
| `workshop/` | Sector selection, downloads and the existing-editor bridge |

From the repository root, Python 3's standard library and Node 22+ are sufficient
for the base geography checks:

```powershell
python -B tools/maps/build-mount-dora.py --check
python -B -m unittest discover -s tests/maps -p 'test_*.py' -v
node tests/maps/validate-native-baseline.mjs
```

Omit `--check` to regenerate the 46 owned base outputs. Source snapshots are
retained byte for byte; `.gitattributes` prevents newline conversion from
invalidating their provenance. The workshop README documents the additional
exact-version API and browser checks, including editing, Undo/Redo and reopening
exported JSON. The basic format check alone is not evidence of native rendering.

Saved evidence includes the [complete terrain overview](../../docs/maps/mount-dora/overview.png)
and actual native workshop views of [downtown C03](../../docs/maps/mount-dora/native-C03.png),
[shoreline C05](../../docs/maps/mount-dora/native-C05.png) and [boundary A01](../../docs/maps/mount-dora/native-A01.png).
The browser receipt in `workshop/review/native-town.json` records the exact project
and sector hashes, supported editing, Undo/Redo, export/reopen and helper cleanup.

## Editor findings

The [workshop feedback](../../docs/maps/mount-dora-editor-feedback.json) separates
observed behavior from proposals. The [art handoff](../../docs/art/mount-dora/shortcomings.md)
also records the real catalogue and source renderer limits.

| Missing capability | Effect on this project |
| --- | --- |
| Terrain-only authoring validation | Three all-water maps cannot open without invented mission markers. |
| Native town/georeference and shared cross-sector ownership | The atlas supplies context; a whole building cannot yet be edited across map boundaries as one object. |
| Continuous elevation authoring | Real road grades, sloped ground and boardwalk elevations remain unmodeled. |
| Freely placed facade/outdoor components and cross-map roof ownership | Landmark palettes and studies are useful references, but are not registered placements on the final sectors. |

The existing arbitrary-angle wall runs, Import/Export, terrain tools and
Undo/Redo are reused. The sector atlas adds selection and safe explicit opening;
it does not replace those editor systems.

## Source credit

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
available under ODbL 1.0. Read [source/NOTICE.txt](source/NOTICE.txt) for attribution
and reuse details. Official Mount Dora facility pages and the user's screenshots
inform the references; no Google imagery is included as terrain or a texture.
